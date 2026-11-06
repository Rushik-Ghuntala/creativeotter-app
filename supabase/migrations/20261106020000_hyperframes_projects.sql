-- Private, immutable source revisions. No workspace is enabled or priced here.
create function private.valid_motion_settings(s jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(s)='object' and (select count(*) from jsonb_object_keys(s))=4
 and s ?& array['width','height','duration_seconds','fps']
 and jsonb_typeof(s->'width')='number' and jsonb_typeof(s->'height')='number'
 and jsonb_typeof(s->'duration_seconds')='number' and jsonb_typeof(s->'fps')='number'
 and (s->>'width')::numeric=trunc((s->>'width')::numeric) and (s->>'height')::numeric=trunc((s->>'height')::numeric)
 and (s->>'width')::numeric between 128 and 1920 and (s->>'height')::numeric between 128 and 1920
 and (s->>'width')::numeric%2=0 and (s->>'height')::numeric%2=0
 and (s->>'duration_seconds')::numeric=trunc((s->>'duration_seconds')::numeric) and (s->>'duration_seconds')::numeric between 1 and 30
 and (s->>'fps')::numeric in (12,24,25,30),false)
$$;
revoke all on function private.valid_motion_settings(jsonb) from public,anon,authenticated,service_role;
create table public.motion_revisions (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null,
 parent_id uuid references public.motion_revisions(id),
 version integer not null check(version>0),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 client_id text,
 request_key uuid not null,
 title text not null check(char_length(title) between 1 and 120),
 change_summary text not null check(char_length(change_summary)<=300),
 settings jsonb not null check(private.valid_motion_settings(settings)),
 source_path text not null unique,
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 source_bytes integer not null check(source_bytes between 22 and 26214400),
 created_at timestamptz not null default now(),
 unique(user_id,request_key),unique(project_id,version)
);
create index motion_revision_workspace on public.motion_revisions(workspace_id,created_at desc);
alter table public.motion_revisions enable row level security;
revoke all on public.motion_revisions from public,anon,authenticated,service_role;
grant select on public.motion_revisions to authenticated,service_role;
create policy motion_read on public.motion_revisions for select to authenticated using(public.has_media_access(workspace_id,'media:read'));
create function public.save_motion_revision(target_workspace uuid, title text, settings jsonb, source_sha256 text, source_bytes integer, request_key uuid, parent_revision uuid default null, change_summary text default '') returns public.motion_revisions language plpgsql security definer set search_path='' as $$
declare r public.motion_revisions; p public.motion_revisions; new_id uuid:=gen_random_uuid();
begin
 if not public.has_media_access(target_workspace,'media:prepare') then raise exception 'Motion project access denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('motion:'||auth.uid()||request_key,0));
 select * into r from public.motion_revisions m where m.user_id=auth.uid() and m.request_key=save_motion_revision.request_key;
 if r.id is not null then
  if row(r.workspace_id,r.client_id,r.title,r.settings,r.source_sha256,r.source_bytes,r.parent_id,r.change_summary) is distinct from row(target_workspace,auth.jwt()->>'client_id',title,settings,source_sha256,source_bytes,parent_revision,change_summary) then raise exception 'This motion save has different content'; end if;
  return r;
 end if;
 if parent_revision is not null then
  select * into p from public.motion_revisions where id=parent_revision and workspace_id=target_workspace;
  if p.id is null then raise exception 'This motion project is unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('motion-project:'||p.project_id,0));
  if exists(select 1 from public.motion_revisions where project_id=p.project_id and version>p.version) then raise exception 'This project has a newer version. Open it before saving your changes.'; end if;
 end if;
 if (select count(*) from public.motion_revisions where user_id=auth.uid() and created_at>now()-interval '1 hour')>=40 then raise exception 'Please wait before saving more project versions'; end if;
 insert into public.motion_revisions(id,project_id,parent_id,version,workspace_id,user_id,client_id,request_key,title,change_summary,settings,source_path,source_sha256,source_bytes)
 values(new_id,coalesce(p.project_id,new_id),p.id,coalesce(p.version,0)+1,target_workspace,auth.uid(),auth.jwt()->>'client_id',request_key,title,change_summary,settings,target_workspace||'/'||new_id||'.zip',source_sha256,source_bytes) returning * into r;
 return r;
end;
$$;
revoke all on function public.save_motion_revision(uuid,text,jsonb,text,integer,uuid,uuid,text) from public,anon;
grant execute on function public.save_motion_revision(uuid,text,jsonb,text,integer,uuid,uuid,text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('creativeotter-motion-sources','creativeotter-motion-sources',false,26214400,array['application/zip']);
create policy motion_source_upload on storage.objects for insert to authenticated with check(bucket_id='creativeotter-motion-sources' and exists(
 select 1 from public.motion_revisions r where r.source_path=name and r.user_id=auth.uid() and r.client_id is not distinct from auth.jwt()->>'client_id' and r.created_at>now()-interval '15 minutes' and public.has_media_access(r.workspace_id,'media:prepare')));
create policy motion_source_read on storage.objects for select to authenticated using(bucket_id='creativeotter-motion-sources' and exists(
 select 1 from public.motion_revisions r where r.source_path=name and public.has_media_access(r.workspace_id,'media:read')));

create function private.valid_render_input(i jsonb,w uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare settings jsonb; r public.motion_revisions;
begin
 settings:=jsonb_build_object('width',i->'width','height',i->'height','duration_seconds',i->'duration_seconds','fps',i->'fps');
 if not coalesce(private.valid_motion_settings(settings) and jsonb_typeof(i->'title')='string' and char_length(i->>'title') between 1 and 120
 and jsonb_typeof(i->'html')='string' and jsonb_typeof(i->'css')='string' and jsonb_typeof(i->'asset_ids')='array',false) then return false; end if;
 if i->>'engine'='hyperframes' then
  if (select count(*) from jsonb_object_keys(i))<>11 or i->>'format'<>'mp4' or i->>'html'<>'' or i->>'css'<>'' or i->'asset_ids'<>'[]'::jsonb then return false; end if;
  select * into r from public.motion_revisions where id=(i->>'revision_id')::uuid and workspace_id=w;
  return coalesce(r.id is not null and r.settings=settings and exists(select 1 from storage.objects where bucket_id='creativeotter-motion-sources' and name=r.source_path),false);
 end if;
 return coalesce((select count(*) from jsonb_object_keys(i))=case when i ? 'engine' then 10 else 9 end and coalesce(i->>'engine','css')='css'
 and i->>'format' in ('png','mp4') and char_length(i->>'html') between 1 and 24000 and char_length(i->>'css')<=12000
 and (i->>'duration_seconds')::integer<=10 and (i->>'fps')::integer in (12,24) and jsonb_array_length(i->'asset_ids')<=4,false);
end;
$$;
revoke all on function private.valid_render_input(jsonb,uuid) from public,anon,authenticated,service_role;
create or replace function private.validate_render_row() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' then
  if row(new.workspace_id,new.user_id,new.client_id,new.request_key,new.input,new.credit_units,new.pricing_version,new.expires_at)
   is distinct from row(old.workspace_id,old.user_id,old.client_id,old.request_key,old.input,old.credit_units,old.pricing_version,old.expires_at) then raise exception 'Design inputs and price are immutable'; end if;
 elsif not private.valid_render_input(new.input,new.workspace_id) then raise exception 'Invalid design settings'; end if;
 return new;
end;
$$;

create or replace function public.prepare_render(target_workspace uuid, render_input jsonb, request_key uuid) returns public.render_jobs language plpgsql security definer set search_path='' as $$
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
 if not private.valid_render_input(render_input,target_workspace) then raise exception 'Invalid design settings'; end if;
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

notify pgrst,'reload schema';
