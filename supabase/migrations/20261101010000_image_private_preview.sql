-- CreativeOtter image private preview: scoped proposals, explicit web approval,
-- durable provider jobs, private references and results. No retail credits/billing.

alter table public.client_grants drop constraint client_grants_permissions_check;
alter table public.client_grants add constraint client_grants_permissions_check
  check (permissions <@ array['account:read','media:read','media:prepare']::text[]);

create table private.workspace_generation_limits (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  enabled boolean not null default false,
  daily_budget_micro_usd bigint not null default 0 check (daily_budget_micro_usd between 0 and 100000000),
  updated_at timestamptz not null default now()
);
create table private.image_pricing (
  model_key text primary key,
  version text not null,
  max_cost_micro_usd bigint not null check (max_cost_micro_usd > 0),
  verified_at timestamptz not null,
  valid_until timestamptz not null,
  source_url text not null
);
insert into private.image_pricing values (
  'image/nano-banana-2','fal-nano-banana-2-1k-2026-11-01',80000,now(),now()+interval '7 days',
  'https://fal.ai/models/fal-ai/nano-banana-2'
);
revoke all on private.workspace_generation_limits, private.image_pricing from public, anon, authenticated;

create or replace function public.has_media_access(target_workspace uuid, required_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select required_permission in ('media:read','media:prepare')
    and public.has_workspace_access(target_workspace)
    and exists (select 1 from public.workspace_members m
      where m.workspace_id = target_workspace and m.user_id = auth.uid()
        and (required_permission = 'media:read' or m.role in ('owner','admin','creator')))
    and (auth.jwt()->>'client_id' is null or exists (
      select 1 from public.client_grants g
      where g.workspace_id = target_workspace and g.user_id = auth.uid()
        and g.client_id = auth.jwt()->>'client_id' and g.revoked_at is null
        and required_permission = any(g.permissions)));
$$;
revoke all on function public.has_media_access(uuid,text) from public, anon;
grant execute on function public.has_media_access(uuid,text) to authenticated;

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('reference','output')),
  status text not null default 'pending' check (status in ('pending','ready','rejected')),
  storage_path text not null unique,
  label text not null check (char_length(label) between 1 and 160),
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp')),
  size_bytes bigint,
  sha256 text,
  width integer,
  height integer,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  check (size_bytes is null or size_bytes between 1 and 31457280)
);
create index media_assets_workspace_created on public.media_assets(workspace_id,created_at desc);

create table public.generation_quotes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  idempotency_key uuid not null,
  model_key text not null,
  pricing_version text not null,
  input jsonb not null,
  max_cost_micro_usd bigint not null check (max_cost_micro_usd > 0),
  expires_at timestamptz not null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id,client_id,idempotency_key)
);
create index generation_quotes_workspace_created on public.generation_quotes(workspace_id,created_at desc);

create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references public.generation_quotes(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null default 'queued' check (state in (
    'queued','submitting','submitted','saving','succeeded','failed','needs_reconciliation','save_failed')),
  provider_request_id text,
  provider_status_url text,
  provider_result_url text,
  output_asset_id uuid references public.media_assets(id),
  max_cost_micro_usd bigint not null,
  public_error text,
  lease_id uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index generation_jobs_workspace_created on public.generation_jobs(workspace_id,created_at desc);
create table private.generation_cost_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  kind text not null check (kind in ('reserved','completed_estimate','released','reconciliation')),
  micro_usd bigint not null check (micro_usd >= 0),
  created_at timestamptz not null default now(),
  unique(job_id,kind)
);
revoke all on private.generation_cost_events from public, anon, authenticated;

alter table public.media_assets enable row level security;
alter table public.generation_quotes enable row level security;
alter table public.generation_jobs enable row level security;
revoke all on public.media_assets, public.generation_quotes, public.generation_jobs from anon, authenticated;
grant select on public.media_assets, public.generation_quotes, public.generation_jobs to authenticated;
grant all on public.media_assets, public.generation_quotes, public.generation_jobs to service_role;
create policy assets_media_read on public.media_assets for select to authenticated
  using (public.has_media_access(workspace_id,'media:read'));
create policy quotes_media_read on public.generation_quotes for select to authenticated
  using (public.has_media_access(workspace_id,'media:read'));
create policy jobs_media_read on public.generation_jobs for select to authenticated
  using (public.has_media_access(workspace_id,'media:read'));

create or replace function public.get_generation_access(target_workspace uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare limits private.workspace_generation_limits;
begin
  if not public.has_workspace_access(target_workspace) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  select * into limits from private.workspace_generation_limits where workspace_id = target_workspace;
  return jsonb_build_object('enabled',coalesce(limits.enabled,false),
    'can_read',public.has_media_access(target_workspace,'media:read'),
    'can_prepare',public.has_media_access(target_workspace,'media:prepare'));
end;
$$;
revoke all on function public.get_generation_access(uuid) from public, anon;
grant execute on function public.get_generation_access(uuid) to authenticated;

create or replace function public.prepare_media_upload(target_workspace uuid, asset_label text, asset_mime text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result public.media_assets; asset_id uuid := gen_random_uuid();
begin
  if not public.has_media_access(target_workspace,'media:prepare') or not exists (
    select 1 from private.workspace_generation_limits where workspace_id = target_workspace and enabled
  ) then raise exception 'Media preparation access is required' using errcode = '42501'; end if;
  if (select count(*) from public.media_assets where workspace_id = target_workspace
      and created_at > now()-interval '1 day' and kind = 'reference') >= 100 then
    raise exception 'Reference upload limit reached' using errcode = '22023';
  end if;
  insert into public.media_assets(id,workspace_id,user_id,kind,storage_path,label,mime_type)
  values (asset_id,target_workspace,auth.uid(),'reference',target_workspace::text||'/references/'||asset_id::text,
    asset_label,asset_mime) returning * into result;
  return to_jsonb(result);
end;
$$;
revoke all on function public.prepare_media_upload(uuid,text,text) from public, anon;
grant execute on function public.prepare_media_upload(uuid,text,text) to authenticated;

create or replace function public.prepare_image_quote(target_workspace uuid, quote_input jsonb, request_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  result public.generation_quotes;
  pricing private.image_pricing;
  client text := coalesce(auth.jwt()->>'client_id','web');
  refs uuid[];
begin
  if not public.has_media_access(target_workspace,'media:prepare') or not exists (
    select 1 from private.workspace_generation_limits where workspace_id = target_workspace and enabled
  ) then raise exception 'Media preparation access is required' using errcode = '42501'; end if;
  if jsonb_typeof(quote_input) <> 'object'
    or quote_input - array['prompt','aspect_ratio','resolution','reference_asset_ids']::text[] <> '{}'::jsonb
    or jsonb_typeof(quote_input->'prompt') <> 'string'
    or char_length(btrim(quote_input->>'prompt')) not between 1 and 8000
    or quote_input->>'aspect_ratio' not in ('1:1','4:5','16:9','9:16')
    or quote_input->>'resolution' <> '1K'
    or jsonb_typeof(quote_input->'reference_asset_ids') <> 'array'
    or jsonb_array_length(quote_input->'reference_asset_ids') > 14
    or not (quote_input ?& array['prompt','aspect_ratio','resolution','reference_asset_ids']) then
    raise exception 'Unsupported image input' using errcode = '22023';
  end if;
  select coalesce(array_agg(value::uuid),'{}'::uuid[]) into refs from jsonb_array_elements_text(quote_input->'reference_asset_ids');
  if cardinality(refs) <> (select count(distinct x) from unnest(refs) x)
    or cardinality(refs) <> (select count(*) from public.media_assets
      where id = any(refs) and workspace_id = target_workspace and status = 'ready') then
    raise exception 'References must be ready assets in this workspace' using errcode = '42501';
  end if;
  select * into result from public.generation_quotes where user_id=auth.uid() and client_id=client and idempotency_key=request_key;
  if result.id is not null then
    if result.workspace_id <> target_workspace or result.input <> quote_input then
      raise exception 'Idempotency key already belongs to different inputs' using errcode = '22023';
    end if;
    return to_jsonb(result);
  end if;
  if (select count(*) from public.generation_quotes where workspace_id = target_workspace
      and created_at > now()-interval '1 hour') >= 100 then
    raise exception 'Quote limit reached' using errcode = '22023';
  end if;
  select * into pricing from private.image_pricing where model_key='image/nano-banana-2' and valid_until>now();
  if pricing.model_key is null then raise exception 'Image pricing needs operator verification'; end if;
  insert into public.generation_quotes(workspace_id,user_id,client_id,idempotency_key,model_key,pricing_version,input,max_cost_micro_usd,expires_at)
  values(target_workspace,auth.uid(),client,request_key,pricing.model_key,pricing.version,quote_input,pricing.max_cost_micro_usd,
    least(now()+interval '15 minutes',pricing.valid_until))
  on conflict (user_id,client_id,idempotency_key) do nothing returning * into result;
  if result.id is null then
    select * into result from public.generation_quotes where user_id=auth.uid() and client_id=client and idempotency_key=request_key;
    if result.workspace_id <> target_workspace or result.input <> quote_input then
      raise exception 'Idempotency key conflict' using errcode='22023';
    end if;
  end if;
  return to_jsonb(result);
end;
$$;
revoke all on function public.prepare_image_quote(uuid,jsonb,uuid) from public, anon;
grant execute on function public.prepare_image_quote(uuid,jsonb,uuid) to authenticated;

create or replace function public.approve_image_quote(target_quote uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare q public.generation_quotes; j public.generation_jobs; limits private.workspace_generation_limits; committed bigint;
begin
  if auth.uid() is null or auth.jwt()->>'client_id' is not null then
    raise exception 'Approval requires a direct browser session' using errcode='42501';
  end if;
  select * into q from public.generation_quotes where id=target_quote for update;
  if q.id is null or q.user_id <> auth.uid() or not public.has_media_access(q.workspace_id,'media:prepare') then
    raise exception 'Quote access denied' using errcode='42501';
  end if;
  select * into j from public.generation_jobs where quote_id=q.id;
  if j.id is not null then return to_jsonb(j); end if;
  if q.expires_at<=now() then raise exception 'Quote expired; create a new quote' using errcode='22023'; end if;
  if q.client_id <> 'web' and not exists(select 1 from public.client_grants
    where workspace_id=q.workspace_id and user_id=q.user_id and client_id=q.client_id and revoked_at is null
      and 'media:prepare'=any(permissions)) then
    raise exception 'Requesting application is no longer approved' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(q.workspace_id::text||':image-budget',0));
  select * into limits from private.workspace_generation_limits where workspace_id=q.workspace_id and enabled;
  if limits.workspace_id is null then raise exception 'Private preview is not enabled for this workspace' using errcode='42501'; end if;
  select coalesce(sum(max_cost_micro_usd),0) into committed from public.generation_jobs
    where workspace_id=q.workspace_id and state<>'failed'
      and (created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' or state<>'succeeded');
  if committed+q.max_cost_micro_usd>limits.daily_budget_micro_usd then
    raise exception 'Workspace provider budget reached' using errcode='22023';
  end if;
  insert into public.generation_jobs(quote_id,workspace_id,user_id,max_cost_micro_usd)
    values(q.id,q.workspace_id,q.user_id,q.max_cost_micro_usd) returning * into j;
  update public.generation_quotes set approved_at=now() where id=q.id;
  insert into private.generation_cost_events(job_id,kind,micro_usd) values(j.id,'reserved',q.max_cost_micro_usd);
  return to_jsonb(j);
end;
$$;
revoke all on function public.approve_image_quote(uuid) from public, anon;
grant execute on function public.approve_image_quote(uuid) to authenticated;

create or replace function public.set_media_favorite(target_asset uuid, is_favorite boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.media_assets;
begin
  select * into a from public.media_assets where id=target_asset;
  if a.id is null or not public.has_media_access(a.workspace_id,'media:prepare') then
    raise exception 'Asset access denied' using errcode='42501'; end if;
  update public.media_assets set favorite=is_favorite where id=a.id returning * into a;
  return to_jsonb(a);
end;
$$;
revoke all on function public.set_media_favorite(uuid,boolean) from public, anon;
grant execute on function public.set_media_favorite(uuid,boolean) to authenticated;

-- Trusted job worker only. A claim is never automatically reused for submission.
create or replace function public.claim_image_job(target_job uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.generation_jobs;
begin
  update public.generation_jobs set state='submitting',lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now()
    where id=target_job and state='queued' returning * into j;
  if j.id is null then return null; end if;
  return to_jsonb(j)||(select jsonb_build_object('input',q.input,'model_key',q.model_key) from public.generation_quotes q where q.id=j.quote_id);
end;
$$;
revoke all on function public.claim_image_job(uuid) from public,anon,authenticated;
grant execute on function public.claim_image_job(uuid) to service_role;

create or replace function public.complete_image_job(target_job uuid, asset_metadata jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.generation_jobs; a public.media_assets;
begin
  select * into j from public.generation_jobs where id=target_job for update;
  if j.id is null then raise exception 'Unknown job'; end if;
  if j.state='succeeded' then return to_jsonb(j); end if;
  if j.provider_request_id is null or j.state not in ('submitted','saving','save_failed','needs_reconciliation') then
    raise exception 'Job has no accepted provider request'; end if;
  insert into public.media_assets(id,workspace_id,user_id,kind,status,storage_path,label,mime_type,size_bytes,sha256,width,height)
  values(j.id,j.workspace_id,j.user_id,'output','ready',j.workspace_id::text||'/outputs/'||j.id::text||'.png',
    'CreativeOtter image','image/png',(asset_metadata->>'size_bytes')::bigint,asset_metadata->>'sha256',
    (asset_metadata->>'width')::integer,(asset_metadata->>'height')::integer)
  on conflict (id) do nothing;
  select * into a from public.media_assets where id=j.id;
  if a.workspace_id<>j.workspace_id or a.kind<>'output' then raise exception 'Output asset mismatch'; end if;
  update public.generation_jobs set state='succeeded',output_asset_id=a.id,public_error=null,updated_at=now() where id=j.id returning * into j;
  insert into private.generation_cost_events(job_id,kind,micro_usd) values(j.id,'completed_estimate',j.max_cost_micro_usd) on conflict do nothing;
  return to_jsonb(j);
end;
$$;
revoke all on function public.complete_image_job(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.complete_image_job(uuid,jsonb) to service_role;

create or replace function public.mark_image_job_failure(target_job uuid, next_state text, safe_message text)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.generation_jobs;
begin
  if next_state not in ('failed','needs_reconciliation','save_failed') then raise exception 'Invalid failure state'; end if;
  select * into j from public.generation_jobs where id=target_job for update;
  if j.id is null or j.state='succeeded' then return; end if;
  update public.generation_jobs set state=next_state,public_error=left(safe_message,500),updated_at=now() where id=j.id;
  if next_state in ('failed','needs_reconciliation') then
    insert into private.generation_cost_events(job_id,kind,micro_usd)
      values(j.id,case when next_state='failed' then 'released' else 'reconciliation' end,j.max_cost_micro_usd)
      on conflict do nothing;
  end if;
end;
$$;
revoke all on function public.mark_image_job_failure(uuid,text,text) from public,anon,authenticated;
grant execute on function public.mark_image_job_failure(uuid,text,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('creativeotter-media','creativeotter-media',false,31457280,array['image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;
create policy creativeotter_media_read on storage.objects for select to authenticated using (
  bucket_id='creativeotter-media' and exists(select 1 from public.media_assets a
    where a.storage_path=name and a.status='ready' and public.has_media_access(a.workspace_id,'media:read'))
);
create policy creativeotter_reference_upload on storage.objects for insert to authenticated with check (
  bucket_id='creativeotter-media' and exists(select 1 from public.media_assets a
    where a.storage_path=name and a.kind='reference' and a.status='pending' and a.user_id=auth.uid()
      and public.has_media_access(a.workspace_id,'media:prepare'))
);

notify pgrst,'reload schema';
