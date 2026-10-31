-- Native assistant generation imports are separate from provider quotes/jobs.
-- Completing a native result never submits inference or consumes provider budget.
create table public.native_generations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  request_key uuid not null,
  input jsonb not null,
  host_name text not null check (host_name in ('codex','chatgpt','claude','other')),
  reported_model text check (char_length(reported_model) <= 120),
  asset_id uuid not null unique references public.media_assets(id) on delete cascade,
  state text not null default 'awaiting_upload' check(state in ('awaiting_upload','succeeded','rejected')),
  created_at timestamptz not null default now(),
  unique(user_id,client_id,request_key)
);
create index native_generations_workspace_created on public.native_generations(workspace_id,created_at desc);
alter table public.native_generations enable row level security;
revoke all on public.native_generations from anon,authenticated;
grant select on public.native_generations to authenticated;
grant all on public.native_generations to service_role;
create policy native_generations_media_read on public.native_generations for select to authenticated
  using(public.has_media_access(workspace_id,'media:read'));

create or replace function public.get_generation_access(target_workspace uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare limits private.workspace_generation_limits;
begin
  if not public.has_workspace_access(target_workspace) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  select * into limits from private.workspace_generation_limits where workspace_id = target_workspace;
  return jsonb_build_object('enabled',coalesce(limits.enabled,false),
    'provider_budget_enabled',coalesce(limits.enabled and limits.daily_budget_micro_usd>0,false),
    'can_read',public.has_media_access(target_workspace,'media:read'),
    'can_prepare',public.has_media_access(target_workspace,'media:prepare'));
end;
$$;

create or replace function public.prepare_native_output(
  target_workspace uuid, request_key uuid, native_input jsonb,
  host_name text, reported_model text, output_mime text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  n public.native_generations;
  a public.media_assets;
  new_id uuid := gen_random_uuid();
  refs uuid[];
  calling_client text := coalesce(auth.jwt()->>'client_id','web');
begin
  if not public.has_media_access(target_workspace,'media:prepare') or not exists(
    select 1 from private.workspace_generation_limits l where l.workspace_id=target_workspace and l.enabled
  ) then raise exception 'Media preparation access is required' using errcode='42501'; end if;
  if native_input is null or jsonb_typeof(native_input)<>'object'
    or native_input-array['prompt','aspect_ratio','resolution','reference_asset_ids']::text[]<>'{}'::jsonb
    or not(native_input ?& array['prompt','aspect_ratio','resolution','reference_asset_ids'])
    or jsonb_typeof(native_input->'prompt')<>'string'
    or char_length(btrim(native_input->>'prompt')) not between 1 and 8000
    or jsonb_typeof(native_input->'reference_asset_ids')<>'array'
    or jsonb_array_length(native_input->'reference_asset_ids')>14
    or coalesce(char_length(native_input->>'aspect_ratio'),0)>32
    or coalesce(char_length(native_input->>'resolution'),0)>32 then
    raise exception 'Unsupported native image metadata' using errcode='22023';
  end if;
  select coalesce(array_agg(value::uuid),'{}'::uuid[]) into refs
    from jsonb_array_elements_text(native_input->'reference_asset_ids');
  if cardinality(refs)<>(select count(distinct x) from unnest(refs) x)
    or cardinality(refs)<>(select count(*) from public.media_assets
      where id=any(refs) and workspace_id=target_workspace and status='ready') then
    raise exception 'Reference access denied' using errcode='42501';
  end if;
  -- Serialize by caller/key so concurrent import retries cannot allocate two assets.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||calling_client||request_key::text,0));
  select * into n from public.native_generations g
    where g.user_id=auth.uid() and g.client_id=calling_client and g.request_key=prepare_native_output.request_key;
  if n.id is not null then
    select * into a from public.media_assets where id=n.asset_id;
    if n.workspace_id<>target_workspace or n.input<>native_input or n.host_name<>host_name
      or n.reported_model is distinct from reported_model or a.mime_type<>output_mime then
      raise exception 'Import key already belongs to different metadata' using errcode='22023';
    end if;
    return to_jsonb(n)||jsonb_build_object('storage_path',a.storage_path,'mime_type',a.mime_type);
  end if;
  if (select count(*) from public.native_generations g where g.workspace_id=target_workspace
    and g.created_at>now()-interval '1 day')>=100 then
    raise exception 'Native import limit reached' using errcode='22023';
  end if;
  insert into public.media_assets(id,workspace_id,user_id,kind,storage_path,label,mime_type)
    values(new_id,target_workspace,auth.uid(),'output',target_workspace::text||'/native/'||new_id::text,'Native assistant image',output_mime)
    returning * into a;
  insert into public.native_generations(id,workspace_id,user_id,client_id,request_key,input,host_name,reported_model,asset_id)
    values(new_id,target_workspace,auth.uid(),calling_client,request_key,native_input,host_name,reported_model,new_id)
    returning * into n;
  return to_jsonb(n)||jsonb_build_object('storage_path',a.storage_path,'mime_type',a.mime_type);
end;
$$;
revoke all on function public.prepare_native_output(uuid,uuid,jsonb,text,text,text) from public,anon;
grant execute on function public.prepare_native_output(uuid,uuid,jsonb,text,text,text) to authenticated;

create or replace function public.complete_native_output(target_generation uuid, asset_metadata jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n public.native_generations; a public.media_assets;
begin
  select * into n from public.native_generations where id=target_generation for update;
  if n.id is null then raise exception 'Unknown native generation'; end if;
  if n.state='succeeded' then return to_jsonb(n); end if;
  select * into a from public.media_assets where id=n.asset_id for update;
  if a.kind<>'output' or a.workspace_id<>n.workspace_id or a.status<>'pending' then
    raise exception 'Native asset is unavailable'; end if;
  if not exists(select 1 from storage.objects where bucket_id='creativeotter-media' and name=a.storage_path) then
    raise exception 'Output has not been saved'; end if;
  update public.media_assets set status='ready',size_bytes=(asset_metadata->>'size_bytes')::bigint,
    sha256=asset_metadata->>'sha256',width=(asset_metadata->>'width')::integer,height=(asset_metadata->>'height')::integer
    where id=a.id;
  update public.native_generations set state='succeeded' where id=n.id returning * into n;
  return to_jsonb(n);
end;
$$;
revoke all on function public.complete_native_output(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.complete_native_output(uuid,jsonb) to service_role;

create policy creativeotter_native_upload on storage.objects for insert to authenticated with check(
  bucket_id='creativeotter-media' and exists(
    select 1 from public.media_assets a join public.native_generations n on n.asset_id=a.id
    where a.storage_path=name and a.kind='output' and a.status='pending' and n.state='awaiting_upload'
      and a.user_id=auth.uid() and public.has_media_access(a.workspace_id,'media:prepare')
  )
);

create or replace function public.complete_image_job(target_job uuid, asset_metadata jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.generation_jobs; a public.media_assets;
begin
  select * into j from public.generation_jobs where id=target_job for update;
  if j.id is null then raise exception 'Unknown job'; end if;
  if j.state='succeeded' then return to_jsonb(j); end if;
  if j.provider_request_id is null or j.state not in ('submitted','saving','save_failed','needs_reconciliation') then
    raise exception 'Job has no accepted provider request'; end if;
  if not exists(select 1 from storage.objects where bucket_id='creativeotter-media' and name=j.workspace_id::text||'/outputs/'||j.id::text||'.png') then
    raise exception 'Output has not been saved'; end if;
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

notify pgrst,'reload schema';
