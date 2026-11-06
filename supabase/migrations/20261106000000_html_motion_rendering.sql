-- HTML/CSS rendering is opt-in. No prices, worker or customer credits are enabled
-- by this migration. All render files are private. 1000 units = one credit.
create table private.workspace_render_settings (
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 enabled boolean not null default false,
 png_credit_units bigint check(png_credit_units between 1 and 1000000000),
 mp4_credit_units bigint check(mp4_credit_units between 1 and 1000000000),
 pricing_version text not null check(char_length(pricing_version) between 1 and 100),
 valid_until timestamptz not null
);
create table private.render_worker_status (
 id boolean primary key default true check(id), heartbeat_at timestamptz not null
);
alter table private.workspace_render_settings enable row level security;
alter table private.render_worker_status enable row level security;
revoke all on private.workspace_render_settings,private.render_worker_status from public,anon,authenticated,service_role;
create table public.render_jobs (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 client_id text,
 request_key uuid not null,
 input jsonb not null,
 state text not null default 'quoted' check(state in ('quoted','queued','running','saving','succeeded','failed')),
 credit_units bigint not null check(credit_units>0), pricing_version text not null,
 expires_at timestamptz not null,
 lease_id uuid, lease_until timestamptz, attempts integer not null default 0,
 storage_path text unique, size_bytes bigint, sha256 text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,request_key),
 check(state <> 'succeeded' or (storage_path is not null and size_bytes>0 and sha256 ~ '^[a-f0-9]{64}$'))
);
create index render_jobs_workspace on public.render_jobs(workspace_id,created_at desc);
create index render_jobs_pending on public.render_jobs(created_at) where state in ('queued','running','saving');
alter table public.render_jobs enable row level security;
revoke all on public.render_jobs from public,anon,authenticated,service_role;
grant select on public.render_jobs to authenticated,service_role;
create policy render_read on public.render_jobs for select to authenticated using(public.has_media_access(workspace_id,'media:read'));

alter table public.credit_ledger add column render_job_id uuid references public.render_jobs(id) on delete cascade;
alter table public.credit_ledger drop constraint credit_ledger_movement_check;
alter table public.credit_ledger add constraint credit_ledger_movement_check check(
 (kind='grant' and num_nonnulls(job_id,native_generation_id,render_job_id)=0 and delta_available=amount_units and delta_reserved=0)
 or (num_nonnulls(job_id,native_generation_id,render_job_id)=1 and (
 (kind='reserve' and delta_available=-amount_units and delta_reserved=amount_units)
 or (kind='charge' and delta_available=0 and delta_reserved=-amount_units)
 or (kind='release' and delta_available=amount_units and delta_reserved=-amount_units))));
create unique index credit_ledger_render_kind on public.credit_ledger(render_job_id,kind) where render_job_id is not null;
create unique index credit_ledger_render_final on public.credit_ledger(render_job_id) where kind in ('charge','release');

create function public.get_render_access(target_workspace uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s private.workspace_render_settings; ready boolean;
begin
 if not public.has_media_access(target_workspace,'media:read') then raise exception 'Design access denied' using errcode='42501'; end if;
 select * into s from private.workspace_render_settings where workspace_id=target_workspace;
 ready:=coalesce(s.enabled and s.valid_until>now() and exists(select 1 from private.render_worker_status where heartbeat_at>now()-interval '90 seconds'),false);
 return jsonb_build_object('available',ready and public.has_media_access(target_workspace,'media:prepare'),
 'png_credit_units',case when ready then s.png_credit_units::text end,'mp4_credit_units',case when ready then s.mp4_credit_units::text end);
end;
$$;
revoke all on function public.get_render_access(uuid) from public,anon;
grant execute on function public.get_render_access(uuid) to authenticated;

create function public.prepare_render(target_workspace uuid, render_input jsonb, request_key uuid) returns public.render_jobs language plpgsql security definer set search_path='' as $$
declare j public.render_jobs; s private.workspace_render_settings; price bigint; a jsonb; asset uuid;
begin
 if not public.has_media_access(target_workspace,'media:prepare') then raise exception 'Design access denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('render:'||auth.uid()||request_key,0));
 select * into j from public.render_jobs r where r.user_id=auth.uid() and r.request_key=prepare_render.request_key;
 if j.id is not null then
  if j.workspace_id<>target_workspace or j.client_id is distinct from auth.jwt()->>'client_id' or j.input<>render_input then raise exception 'This design request has different content'; end if;
  return j;
 end if;
 select * into s from private.workspace_render_settings where workspace_id=target_workspace and enabled and valid_until>now();
 if s.workspace_id is null or not exists(select 1 from private.render_worker_status where heartbeat_at>now()-interval '90 seconds') then raise exception 'Design rendering is not available yet'; end if;
 if jsonb_typeof(render_input)<>'object' or render_input->>'format' not in ('png','mp4')
 or char_length(render_input->>'html') not between 1 and 24000 or char_length(render_input->>'css')>12000
 or char_length(render_input->>'title') not between 1 and 120
 or (render_input->>'width')::integer not between 128 and 1920 or (render_input->>'height')::integer not between 128 and 1920
 or (render_input->>'width')::integer%2<>0 or (render_input->>'height')::integer%2<>0
 or (render_input->>'duration_seconds')::integer not between 1 and 10 or (render_input->>'fps')::integer not in (12,24)
 or jsonb_typeof(render_input->'asset_ids')<>'array' or jsonb_array_length(render_input->'asset_ids')>4
 or not render_input ?& array['format','title','html','css','width','height','duration_seconds','fps','asset_ids'] then raise exception 'Invalid design settings'; end if;
 for a in select value from jsonb_array_elements(render_input->'asset_ids') loop
  asset:=trim(both '"' from a::text)::uuid;
  if not exists(select 1 from public.media_assets where id=asset and workspace_id=target_workspace and status='ready') then raise exception 'A design image is unavailable'; end if;
 end loop;
 price:=case when render_input->>'format'='png' then s.png_credit_units else s.mp4_credit_units end;
 if price is null then raise exception 'Design pricing has not been set'; end if;
 if (select count(*) from public.render_jobs where workspace_id=target_workspace and state in ('quoted','queued','running','saving') and expires_at>now())>=5 then raise exception 'Please finish your current designs before starting more'; end if;
 insert into public.render_jobs(workspace_id,user_id,client_id,request_key,input,credit_units,pricing_version,expires_at)
 values(target_workspace,auth.uid(),auth.jwt()->>'client_id',request_key,render_input,price,s.pricing_version,least(s.valid_until,now()+interval '15 minutes')) returning * into j;
 return j;
end;
$$;
revoke all on function public.prepare_render(uuid,jsonb,uuid) from public,anon;
grant execute on function public.prepare_render(uuid,jsonb,uuid) to authenticated;

create function public.start_render(target_render uuid) returns public.render_jobs language plpgsql security definer set search_path='' as $$
declare j public.render_jobs; a public.credit_accounts;
begin
 select * into j from public.render_jobs where id=target_render for update;
 if j.id is null or j.user_id<>auth.uid() or j.client_id is distinct from auth.jwt()->>'client_id' or not public.has_media_access(j.workspace_id,'media:prepare') then raise exception 'Design access denied' using errcode='42501'; end if;
 if j.state<>'quoted' then return j; end if;
 if j.expires_at<=now() or not exists(select 1 from private.workspace_render_settings s where s.workspace_id=j.workspace_id and s.enabled and s.valid_until>now() and s.pricing_version=j.pricing_version
 and j.credit_units=case when j.input->>'format'='png' then s.png_credit_units else s.mp4_credit_units end)
 or not exists(select 1 from private.render_worker_status where heartbeat_at>now()-interval '90 seconds') then raise exception 'Please prepare this design again'; end if;
 select * into a from public.credit_accounts where workspace_id=j.workspace_id for update;
 if a.workspace_id is null or a.available_units<j.credit_units then raise exception 'You don’t have enough CreativeOtter credits for this design'; end if;
 update public.credit_accounts set available_units=available_units-j.credit_units,reserved_units=reserved_units+j.credit_units,updated_at=now() where workspace_id=j.workspace_id;
 insert into public.credit_ledger(workspace_id,render_job_id,kind,amount_units,delta_available,delta_reserved,entry_key,note)
 values(j.workspace_id,j.id,'reserve',j.credit_units,-j.credit_units,j.credit_units,'render:'||j.id||':reserve','Reserved for a requested design render');
 update public.render_jobs set state='queued',updated_at=now() where id=j.id returning * into j;
 return j;
end;
$$;
revoke all on function public.start_render(uuid) from public,anon;
grant execute on function public.start_render(uuid) to authenticated;

create function public.render_worker_heartbeat() returns void language sql security definer set search_path='' as $$
 insert into private.render_worker_status(id,heartbeat_at) values(true,now()) on conflict(id) do update set heartbeat_at=excluded.heartbeat_at;
$$;
revoke all on function public.render_worker_heartbeat() from public,anon,authenticated;
grant execute on function public.render_worker_heartbeat() to service_role;

create function private.finish_render(j public.render_jobs, succeeded boolean, bytes bigint default null, digest text default null) returns public.render_jobs language plpgsql security definer set search_path='' as $$
declare terminal text:=case when succeeded then 'succeeded' else 'failed' end;
begin
 if j.state in ('succeeded','failed') then return j; end if;
 if j.state not in ('running','saving') then raise exception 'Design was not claimed'; end if;
 perform 1 from public.credit_accounts where workspace_id=j.workspace_id for update;
 update public.credit_accounts set available_units=available_units+case when succeeded then 0 else j.credit_units end,reserved_units=reserved_units-j.credit_units,updated_at=now() where workspace_id=j.workspace_id;
 insert into public.credit_ledger(workspace_id,render_job_id,kind,amount_units,delta_available,delta_reserved,entry_key,note)
 values(j.workspace_id,j.id,case when succeeded then 'charge' else 'release' end,j.credit_units,case when succeeded then 0 else j.credit_units end,-j.credit_units,'render:'||j.id||':'||terminal,
 case when succeeded then 'Charged after your design was saved privately' else 'Returned credits after an unsuccessful design render' end);
 update public.render_jobs set state=terminal,size_bytes=bytes,sha256=digest,storage_path=case when succeeded then workspace_id||'/'||id||'.'||(input->>'format') else null end,updated_at=now() where id=j.id returning * into j;
 return j;
end;
$$;
revoke all on function private.finish_render(public.render_jobs,boolean,bigint,text) from public,anon,authenticated,service_role;

create function public.claim_render() returns public.render_jobs language plpgsql security definer set search_path='' as $$
declare j public.render_jobs;
begin
 -- A crashed worker can recover an existing private output under a new lease.
 select * into j from public.render_jobs r where r.state='queued' or (r.state in ('running','saving') and r.lease_until<now()) order by r.created_at for update skip locked limit 1;
 if j.id is null then return null; end if;
 if j.attempts>=2 then perform private.finish_render(j,false); return null; end if;
 update public.render_jobs set state='running',lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1,updated_at=now() where id=j.id returning * into j;
 return j;
end;
$$;
revoke all on function public.claim_render() from public,anon,authenticated;
grant execute on function public.claim_render() to service_role;

create function public.complete_render(target_render uuid, lease uuid, bytes bigint, digest text) returns public.render_jobs language plpgsql security definer set search_path='' as $$
declare j public.render_jobs; expected text;
begin
 select * into j from public.render_jobs where id=target_render for update;
 if j.id is null or j.lease_id is distinct from lease then raise exception 'Design claim changed'; end if;
 if j.state='succeeded' then return j; end if;
 if j.lease_until<=now() or bytes not between 1 and 31457280 or digest !~ '^[a-f0-9]{64}$' then raise exception 'Invalid saved design'; end if;
 expected:=j.workspace_id||'/'||j.id||'.'||(j.input->>'format');
 if not exists(select 1 from storage.objects where bucket_id='creativeotter-renders' and name=expected) then raise exception 'A private saved output is required before charging'; end if;
 return private.finish_render(j,true,bytes,digest);
end;
$$;
revoke all on function public.complete_render(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.complete_render(uuid,uuid,bigint,text) to service_role;
create function public.fail_render(target_render uuid, lease uuid) returns public.render_jobs language plpgsql security definer set search_path='' as $$
declare j public.render_jobs;
begin
 select * into j from public.render_jobs where id=target_render for update;
 if j.id is null or j.lease_id is distinct from lease or j.lease_until<=now() then raise exception 'Design claim changed'; end if;
 return private.finish_render(j,false);
end;
$$;
revoke all on function public.fail_render(uuid,uuid) from public,anon,authenticated;
grant execute on function public.fail_render(uuid,uuid) to service_role;

-- Preview credentials follow the existing saved-image pattern: opaque, read-only,
-- scoped to one render, invalidated by any connection change, checked on every use.
create table private.render_preview_grants (
 secret_hash text primary key check(secret_hash ~ '^[a-f0-9]{64}$'),
 render_id uuid not null references public.render_jobs(id) on delete cascade,
 client_grant_id uuid not null references public.client_grants(id) on delete cascade,
 grant_updated_at timestamptz not null, created_at timestamptz not null default now()
);
alter table private.render_preview_grants enable row level security;
revoke all on private.render_preview_grants from public,anon,authenticated,service_role;
create function private.render_preview_job(secret text) returns uuid language plpgsql stable security definer set search_path='' as $$
declare result uuid;
begin
 if secret is null or secret !~ '^rp1\.[A-Za-z0-9_-]{43}$' then return null; end if;
 select p.render_id into result from private.render_preview_grants p
 join public.client_grants g on g.id=p.client_grant_id and g.updated_at=p.grant_updated_at
 join public.render_jobs r on r.id=p.render_id and r.workspace_id=g.workspace_id
 join public.workspace_members m on m.workspace_id=g.workspace_id and m.user_id=g.user_id
 join auth.users u on u.id=g.user_id
 where p.secret_hash=encode(extensions.digest(secret,'sha256'),'hex') and g.revoked_at is null
 and 'media:read'=any(g.permissions) and 'account:read'=any(g.permissions)
 and u.deleted_at is null and (u.banned_until is null or u.banned_until<now());
 return result;
end;
$$;
revoke all on function private.render_preview_job(text) from public,anon,authenticated,service_role;
create function public.create_render_preview(target_render uuid, secret_hash text) returns void language plpgsql security definer set search_path='' as $$
declare j public.render_jobs; g public.client_grants;
begin
 select * into j from public.render_jobs where id=target_render;
 if j.id is null or not public.has_media_access(j.workspace_id,'media:read') or auth.jwt()->>'client_id' is null or secret_hash !~ '^[a-f0-9]{64}$' then raise exception 'Design preview access denied' using errcode='42501'; end if;
 select * into g from public.client_grants where user_id=auth.uid() and client_id=auth.jwt()->>'client_id' and workspace_id=j.workspace_id and revoked_at is null;
 if g.id is null then raise exception 'Design preview access denied' using errcode='42501'; end if;
 insert into private.render_preview_grants(secret_hash,render_id,client_grant_id,grant_updated_at) values(secret_hash,j.id,g.id,g.updated_at);
end;
$$;
revoke all on function public.create_render_preview(uuid,text) from public,anon;
grant execute on function public.create_render_preview(uuid,text) to authenticated;
create function public.read_render_preview(preview_secret text, target_render uuid) returns public.render_jobs language plpgsql stable security definer set search_path='' as $$
declare j public.render_jobs;
begin
 if private.render_preview_job(preview_secret) is distinct from target_render or target_render is null then raise exception 'Design preview access denied' using errcode='42501'; end if;
 select * into j from public.render_jobs where id=target_render;
 -- Source markup is unnecessary for a preview and is never returned by this path.
 j.input:=j.input-array['html','css','asset_ids']; j.lease_id:=null; j.lease_until:=null;
 return j;
end;
$$;
revoke all on function public.read_render_preview(text,uuid) from public,authenticated;
grant execute on function public.read_render_preview(text,uuid) to anon;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('creativeotter-renders','creativeotter-renders',false,31457280,array['image/png','video/mp4']);
create policy render_output_read on storage.objects for select to authenticated using(
 bucket_id='creativeotter-renders' and exists(select 1 from public.render_jobs r where r.storage_path=name and r.state='succeeded' and public.has_media_access(r.workspace_id,'media:read')));
create function private.can_read_render_path(object_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.render_jobs r where r.id=private.render_preview_job(current_setting('request.headers',true)::jsonb->>'x-creativeotter-render') and r.storage_path=object_path and r.state='succeeded');
$$;
revoke all on function private.can_read_render_path(text) from public,authenticated;
grant execute on function private.can_read_render_path(text) to anon;
create policy render_preview_read on storage.objects for select to anon using(bucket_id='creativeotter-renders' and private.can_read_render_path(name));
notify pgrst,'reload schema';
