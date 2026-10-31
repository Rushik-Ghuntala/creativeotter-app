-- CreativeOtter M0: direct Supabase sessions, personal workspaces and read-only MCP grants.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  personal_owner_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','creator','viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);
create index workspace_members_user_idx on public.workspace_members(user_id,workspace_id);

create table public.client_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null check (char_length(client_id) between 1 and 2048),
  client_name text not null check (char_length(client_name) <= 200),
  redirect_uri text not null check (char_length(redirect_uri) <= 4096),
  workspace_id uuid not null,
  permissions text[] not null default array['account:read']::text[],
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,client_id),
  foreign key (workspace_id,user_id) references public.workspace_members(workspace_id,user_id) on delete cascade,
  check (permissions <@ array['account:read']::text[])
);

-- Private deployment configuration; only maintenance credentials can change it.
create table private.mcp_configuration (
  singleton boolean primary key default true check (singleton),
  resource_uri text check (resource_uri ~ '^https://[^?#]+/api/mcp$' or resource_uri = 'http://localhost:3000/api/mcp')
);
insert into private.mcp_configuration(singleton) values (true);
alter table private.mcp_configuration enable row level security;
revoke all on private.mcp_configuration from public, anon, authenticated;

create or replace function public.has_workspace_access(target_workspace uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = target_workspace and m.user_id = (select auth.uid())
      and (
        (select auth.jwt()->>'client_id') is null
        or exists (
          select 1 from public.client_grants g cross join private.mcp_configuration c
          where g.user_id = m.user_id and g.workspace_id = m.workspace_id
            and g.client_id = (select auth.jwt()->>'client_id')
            and g.revoked_at is null and 'account:read' = any(g.permissions)
            and c.resource_uri is not null
            and (select auth.jwt()->'aud') ? c.resource_uri
        )
      )
  );
$$;
revoke all on function public.has_workspace_access(uuid) from public, anon;
grant execute on function public.has_workspace_access(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.client_grants enable row level security;

revoke all on public.profiles, public.workspaces, public.workspace_members, public.client_grants from anon, authenticated;
grant select on public.profiles, public.workspaces, public.workspace_members, public.client_grants to authenticated;
grant insert, update on public.client_grants to authenticated;

create policy profiles_direct_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) and (select auth.jwt()->>'client_id') is null);
create policy workspaces_member_read on public.workspaces for select to authenticated
  using (public.has_workspace_access(id));
create policy membership_self_read on public.workspace_members for select to authenticated
  using (user_id = (select auth.uid()) and public.has_workspace_access(workspace_id));
create policy grants_direct_read on public.client_grants for select to authenticated
  using (user_id = (select auth.uid()) and (select auth.jwt()->>'client_id') is null);
create policy grants_direct_insert on public.client_grants for insert to authenticated
  with check (user_id = (select auth.uid()) and (select auth.jwt()->>'client_id') is null and public.has_workspace_access(workspace_id));
create policy grants_direct_update on public.client_grants for update to authenticated
  using (user_id = (select auth.uid()) and (select auth.jwt()->>'client_id') is null)
  with check (user_id = (select auth.uid()) and (select auth.jwt()->>'client_id') is null and public.has_workspace_access(workspace_id));

create or replace function public.ensure_personal_workspace()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  workspace public.workspaces;
begin
  if actor is null or auth.jwt()->>'client_id' is not null then
    raise exception 'A direct user session is required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  insert into public.profiles(id,display_name)
    values (actor,left(coalesce(auth.jwt()->'user_metadata'->>'display_name',''),80))
    on conflict (id) do nothing;
  select * into workspace from public.workspaces where personal_owner_id = actor;
  if workspace.id is null then
    insert into public.workspaces(name,personal_owner_id) values ('My workspace',actor) returning * into workspace;
    insert into public.workspace_members(workspace_id,user_id,role) values (workspace.id,actor,'owner');
  end if;
  return to_jsonb(workspace);
end;
$$;
revoke all on function public.ensure_personal_workspace() from public, anon;
grant execute on function public.ensure_personal_workspace() to authenticated;

create or replace function public.get_mcp_context()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare context jsonb;
begin
  if auth.uid() is null or auth.jwt()->>'client_id' is null then
    raise exception 'An approved OAuth client is required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'user_id',g.user_id,'client_id',g.client_id,
    'workspace',jsonb_build_object('id',w.id,'name',w.name),
    'role',m.role,'permissions',g.permissions
  ) into context
  from public.client_grants g
  join public.workspaces w on w.id = g.workspace_id
  join public.workspace_members m on m.workspace_id = g.workspace_id and m.user_id = g.user_id
  where g.user_id = auth.uid() and g.client_id = auth.jwt()->>'client_id'
    and g.revoked_at is null and 'account:read' = any(g.permissions)
    and public.has_workspace_access(w.id);
  if context is null then
    raise exception 'Workspace access has not been granted or was revoked' using errcode = '42501';
  end if;
  return context;
end;
$$;
revoke all on function public.get_mcp_context() from public, anon;
grant execute on function public.get_mcp_context() to authenticated;

-- Enable this hook in Supabase Auth after setting the resource URI. It binds OAuth
-- tokens to this MCP resource while retaining the audience used by PostgREST.
create or replace function public.creativeotter_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  claims jsonb := event->'claims';
  oauth_client text := coalesce(event->>'client_id',event->'claims'->>'client_id');
  resource text;
begin
  if oauth_client is not null then
    select c.resource_uri into resource from private.mcp_configuration c
    where c.singleton and exists (
      select 1 from public.client_grants g join public.workspace_members m
        on m.workspace_id = g.workspace_id and m.user_id = g.user_id
      where g.user_id = (event->>'user_id')::uuid and g.client_id = oauth_client
        and g.revoked_at is null and 'account:read' = any(g.permissions)
    );
    claims := jsonb_set(claims,'{aud}',
      case when resource is null then '"authenticated"'::jsonb
      else jsonb_build_array('authenticated',resource) end);
  end if;
  return jsonb_set(event,'{claims}',claims);
end;
$$;
revoke all on function public.creativeotter_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.creativeotter_access_token_hook(jsonb) to supabase_auth_admin;

notify pgrst, 'reload schema';
