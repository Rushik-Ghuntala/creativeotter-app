-- User-approved persistent, revocable capabilities for explicitly scoped SAVED
-- images. No access-token extension, paid work, uploads or write permissions.
create table private.saved_preview_grants (
  id uuid primary key default gen_random_uuid(),
  secret_hash text not null unique check (secret_hash ~ '^[a-f0-9]{64}$'),
  client_grant_id uuid not null references public.client_grants(id) on delete cascade,
  grant_updated_at timestamptz not null,
  generations jsonb not null check (jsonb_typeof(generations)='array' and jsonb_array_length(generations) between 1 and 20),
  asset_ids uuid[] not null check (cardinality(asset_ids) between 1 and 300),
  created_at timestamptz not null default now()
);
alter table private.saved_preview_grants enable row level security;
revoke all on private.saved_preview_grants from public, anon, authenticated;

-- Changing or revoking a connection invalidates previously issued capabilities,
-- even if a caller forgets to update its version timestamp.
create function private.version_saved_preview_connection()
returns trigger language plpgsql set search_path='' as $$
begin
  if new is distinct from old then new.updated_at:=clock_timestamp(); end if;
  return new;
end;
$$;
revoke all on function private.version_saved_preview_connection() from public, anon, authenticated;
create trigger client_grants_saved_preview_version before update on public.client_grants
  for each row execute function private.version_saved_preview_connection();

create function private.saved_preview_context(preview_secret text)
returns private.saved_preview_grants language plpgsql stable security definer set search_path='' as $$
declare result private.saved_preview_grants;
begin
  if preview_secret is null or preview_secret !~ '^sp1\.[A-Za-z0-9_-]{43}$' then
    raise exception 'Saved preview access denied' using errcode='42501';
  end if;
  select p.* into result from private.saved_preview_grants p
  join public.client_grants g on g.id=p.client_grant_id and g.updated_at=p.grant_updated_at
  join public.workspace_members m on m.workspace_id=g.workspace_id and m.user_id=g.user_id
  join auth.users u on u.id=g.user_id
  join private.workspace_generation_limits l on l.workspace_id=g.workspace_id and l.enabled
  where p.secret_hash=encode(extensions.digest(preview_secret,'sha256'),'hex')
    and g.revoked_at is null and 'account:read'=any(g.permissions) and 'media:read'=any(g.permissions)
    and (u.banned_until is null or u.banned_until < now()) and u.deleted_at is null;
  if result.id is null then raise exception 'Saved preview access denied' using errcode='42501'; end if;
  return result;
end;
$$;
revoke all on function private.saved_preview_context(text) from public, anon, authenticated;

create function public.create_saved_preview(target_workspace uuid, secret_hash text, generations jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare grant_row public.client_grants; item jsonb; result uuid; output_id uuid; input jsonb;
  ids uuid[]:='{}'; image_assets uuid[];
begin
  if auth.jwt()->>'client_id' is null or not public.has_media_access(target_workspace,'media:read')
    or not exists(select 1 from private.workspace_generation_limits where workspace_id=target_workspace and enabled)
    or secret_hash is null or secret_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(generations) is distinct from 'array'
    or jsonb_array_length(generations) not between 1 and 20 then
    raise exception 'Saved preview access denied' using errcode='42501';
  end if;
  select * into grant_row from public.client_grants g where g.user_id=auth.uid()
    and g.client_id=auth.jwt()->>'client_id' and g.workspace_id=target_workspace and g.revoked_at is null;
  if grant_row.id is null then raise exception 'Saved preview access denied' using errcode='42501'; end if;
  for item in select value from jsonb_array_elements(generations) loop
    if jsonb_typeof(item) is distinct from 'object' or (select count(*) from jsonb_object_keys(item))<>2 then
      raise exception 'Invalid saved image reference' using errcode='22023';
    end if;
    output_id:=null; input:=null;
    if item->>'execution_source'='native' then
      select n.asset_id,n.input into output_id,input from public.native_generations n where n.id=(item->>'generation_id')::uuid
        and n.workspace_id=target_workspace and n.state='succeeded';
    elsif item->>'execution_source'='provider' then
      select j.output_asset_id,q.input into output_id,input from public.generation_jobs j join public.generation_quotes q on q.id=j.quote_id
        where q.id=(item->>'generation_id')::uuid and j.workspace_id=target_workspace and q.workspace_id=target_workspace and j.state='succeeded';
    end if;
    if output_id is null or not exists(select 1 from public.media_assets a where a.id=output_id
      and a.workspace_id=target_workspace and a.status='ready' and a.kind='output') then
      raise exception 'Only existing saved images can have a persistent preview' using errcode='42501';
    end if;
    select array_agg(a.id) into image_assets from public.media_assets a where a.workspace_id=target_workspace
      and a.status='ready' and (a.id=output_id or input->'reference_asset_ids' ? a.id::text);
    ids:=ids||image_assets;
  end loop;
  select array_agg(distinct value) into ids from unnest(ids) value;
  insert into private.saved_preview_grants(secret_hash,client_grant_id,grant_updated_at,generations,asset_ids)
    values(secret_hash,grant_row.id,grant_row.updated_at,generations,ids) returning id into result;
  return result;
end;
$$;
revoke all on function public.create_saved_preview(uuid,text,jsonb) from public, anon;
grant execute on function public.create_saved_preview(uuid,text,jsonb) to authenticated;

create function public.read_saved_preview(preview_secret text, execution_source text, generation_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p private.saved_preview_grants; w uuid; n public.native_generations; q public.generation_quotes;
  j public.generation_jobs; input jsonb; output_id uuid; assets jsonb;
begin
  p:=private.saved_preview_context(preview_secret);
  if not p.generations @> jsonb_build_array(jsonb_build_object('execution_source',execution_source,'generation_id',generation_id)) then
    raise exception 'Image is outside this saved preview' using errcode='42501';
  end if;
  select workspace_id into w from public.client_grants where id=p.client_grant_id;
  if execution_source='native' then
    select * into n from public.native_generations where id=generation_id and workspace_id=w and state='succeeded';
    output_id:=n.asset_id; input:=n.input;
  elsif execution_source='provider' then
    select * into q from public.generation_quotes where id=generation_id and workspace_id=w;
    select * into j from public.generation_jobs where quote_id=q.id and workspace_id=w and state='succeeded';
    output_id:=j.output_asset_id; input:=q.input;
  end if;
  if output_id is null or not output_id=any(p.asset_ids) or not exists(select 1 from public.media_assets
    where id=output_id and workspace_id=w and status='ready' and kind='output') then
    raise exception 'Saved image is unavailable' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(a)),'[]') into assets from public.media_assets a
    where a.workspace_id=w and a.status='ready' and a.id=any(p.asset_ids)
      and (a.id=output_id or input->'reference_asset_ids' ? a.id::text);
  return jsonb_build_object('native',case when n.id is null then null else to_jsonb(n)-'execution_token' end,
    'quote',case when q.id is null then null else to_jsonb(q) end,
    'job',case when j.id is null then null else to_jsonb(j)-array['provider_request_id','provider_status_url','provider_result_url','lease_id','lease_until'] end,
    'assets',assets);
end;
$$;
revoke all on function public.read_saved_preview(text,text,uuid) from public;
grant execute on function public.read_saved_preview(text,text,uuid) to anon, authenticated;

create function public.can_read_saved_preview_object(object_path text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare p private.saved_preview_grants; w uuid;
begin
  p:=private.saved_preview_context(nullif(current_setting('request.headers',true),'')::jsonb->>'x-creativeotter-preview');
  select workspace_id into w from public.client_grants where id=p.client_grant_id;
  return exists(select 1 from public.media_assets a where a.id=any(p.asset_ids)
    and a.workspace_id=w and a.status='ready' and a.storage_path=object_path);
exception when insufficient_privilege then return false;
end;
$$;
revoke all on function public.can_read_saved_preview_object(text) from public;
grant execute on function public.can_read_saved_preview_object(text) to anon;
create policy saved_preview_object_read on storage.objects for select to anon
  using (bucket_id='creativeotter-media' and public.can_read_saved_preview_object(name));
notify pgrst, 'reload schema';
