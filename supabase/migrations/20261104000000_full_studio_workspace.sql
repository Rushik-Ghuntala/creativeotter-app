-- CreativeOtter Studio: persisted creative records, private collaboration and preferences.
-- Existing image quotes, reservations, prices and immutable ledger are unchanged.
create or replace function public.can_read_studio(target_workspace uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_workspace_access(target_workspace)
    and ((select auth.jwt()->>'client_id') is null or public.has_media_access(target_workspace,'media:read'));
$$;
create or replace function public.can_edit_studio(target_workspace uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_read_studio(target_workspace) and exists (
    select 1 from public.workspace_members where workspace_id=target_workspace and user_id=(select auth.uid())
      and role in ('owner','admin','creator'))
    and ((select auth.jwt()->>'client_id') is null or public.has_media_access(target_workspace,'media:prepare'));
$$;
create or replace function public.can_admin_workspace(target_workspace uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.jwt()->>'client_id') is null and public.has_workspace_access(target_workspace)
    and exists (select 1 from public.workspace_members where workspace_id=target_workspace and user_id=(select auth.uid()) and role in ('owner','admin'));
$$;
revoke all on function public.can_read_studio(uuid), public.can_edit_studio(uuid), public.can_admin_workspace(uuid) from public,anon;
grant execute on function public.can_read_studio(uuid), public.can_edit_studio(uuid), public.can_admin_workspace(uuid) to authenticated;

create table public.workspace_preferences (
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 video_mode text not null default 'review' check(video_mode in ('review','auto')),
 updated_at timestamptz not null default now()
);
alter table public.media_assets add constraint media_assets_workspace_id_id_key unique(workspace_id,id);
create table public.brand_kits (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check(length(name) between 1 and 80), description text not null default '' check(length(description)<=4000),
 colors text[] not null default '{}', font_family text not null default '', tone text not null default '',
 logo_asset_id uuid, archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(workspace_id,logo_asset_id) references public.media_assets(workspace_id,id), unique(workspace_id,id),
 check(cardinality(colors)<=12), check(length(font_family)<=100 and length(tone)<=500)
);
create table public.studio_characters (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check(length(name) between 1 and 80), description text not null default '' check(length(description)<=4000),
 appearance text not null default '' check(length(appearance)<=4000),
 identity_type text not null default 'fictional' check(identity_type in ('fictional','self','authorized')),
 reference_asset_id uuid, archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(workspace_id,reference_asset_id) references public.media_assets(workspace_id,id), unique(workspace_id,id)
);
create table public.studio_projects (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check(length(name) between 1 and 80), description text not null default '' check(length(description)<=8000),
 kind text not null default 'campaign' check(kind in ('campaign','film','music')),
 status text not null default 'draft' check(status in ('draft','active','complete')),
 budget_target_units bigint check(budget_target_units between 0 and 1000000000000),
 aspect_ratio text not null default '9:16' check(aspect_ratio in ('1:1','4:5','16:9','9:16')),
 genre text not null default '' check(length(genre)<=80), lyrics text not null default '' check(length(lyrics)<=8000),
 archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(workspace_id,id)
);
create table public.studio_voice_presets (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check(length(name) between 1 and 80), description text not null default '' check(length(description)<=4000),
 language text not null default 'en-US' check(length(language)<=40), script text not null default '' check(length(script)<=8000),
 style text not null default '' check(length(style)<=500),
 archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(workspace_id,id)
);
create table public.studio_shots (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
 project_id uuid not null, position integer not null check(position between 1 and 1000),
 prompt text not null check(length(prompt) between 1 and 4000), narration text not null default '' check(length(narration)<=4000),
 duration_seconds integer not null default 5 check(duration_seconds between 1 and 120),
 reference_asset_id uuid, created_at timestamptz not null default now(),
 foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id) on delete cascade,
 foreign key(workspace_id,reference_asset_id) references public.media_assets(workspace_id,id),
 unique(project_id,position)
);
create table public.studio_project_assets (
 workspace_id uuid not null, project_id uuid not null, asset_id uuid not null, created_at timestamptz not null default now(),
 primary key(project_id,asset_id), unique(workspace_id,asset_id),
 foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id) on delete cascade,
 foreign key(workspace_id,asset_id) references public.media_assets(workspace_id,id) on delete cascade
);
create table public.workspace_invites (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 email text not null check(length(email)<=254), role text not null check(role in ('creator','viewer')),
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 created_by uuid not null references auth.users(id), expires_at timestamptz not null default now()+interval '7 days',
 accepted_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now()
);
create table public.support_requests (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id), category text not null check(category in ('support','deletion')),
 message text not null check(length(message) between 1 and 4000), status text not null default 'open' check(status in ('open','in_progress','resolved')),
 created_at timestamptz not null default now()
);

-- Policies apply to both direct app requests and explicitly granted MCP sessions.
do $$ declare t text; begin
 foreach t in array array['brand_kits','studio_characters','studio_projects','studio_voice_presets','studio_shots','studio_project_assets'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('create policy studio_read on public.%I for select to authenticated using(public.can_read_studio(workspace_id))',t);
  execute format('create policy studio_insert on public.%I for insert to authenticated with check(public.can_edit_studio(workspace_id))',t);
  execute format('create policy studio_update on public.%I for update to authenticated using(public.can_edit_studio(workspace_id)) with check(public.can_edit_studio(workspace_id))',t);
  execute format('create policy studio_delete on public.%I for delete to authenticated using(public.can_edit_studio(workspace_id))',t);
 end loop;
end $$;
create index studio_projects_workspace_idx on public.studio_projects(workspace_id,created_at desc);
create index studio_characters_workspace_idx on public.studio_characters(workspace_id,created_at desc);
create index brand_kits_workspace_idx on public.brand_kits(workspace_id,created_at desc);
create index studio_voices_workspace_idx on public.studio_voice_presets(workspace_id,created_at desc);
create index studio_shots_project_idx on public.studio_shots(workspace_id,project_id);
create index project_assets_workspace_idx on public.studio_project_assets(workspace_id,project_id);

alter table public.workspace_preferences enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.support_requests enable row level security;
revoke all on public.workspace_preferences,public.workspace_invites,public.support_requests from anon,authenticated;
grant select,insert,update on public.workspace_preferences to authenticated;
create policy preferences_read on public.workspace_preferences for select to authenticated using(public.has_workspace_access(workspace_id));
create policy preferences_insert on public.workspace_preferences for insert to authenticated with check(public.can_admin_workspace(workspace_id));
create policy preferences_update on public.workspace_preferences for update to authenticated using(public.can_admin_workspace(workspace_id)) with check(public.can_admin_workspace(workspace_id));
grant select on public.workspace_invites to authenticated;
create policy invites_read on public.workspace_invites for select to authenticated using(public.can_admin_workspace(workspace_id));
grant select,insert on public.support_requests to authenticated;
create policy support_read on public.support_requests for select to authenticated using(user_id=(select auth.uid()) and (select auth.jwt()->>'client_id') is null and public.has_workspace_access(workspace_id));
create policy support_insert on public.support_requests for insert to authenticated with check(user_id=(select auth.uid()) and (select auth.jwt()->>'client_id') is null and public.has_workspace_access(workspace_id));

grant update(display_name) on public.profiles to authenticated;
create policy profiles_direct_update on public.profiles for update to authenticated using(id=(select auth.uid()) and (select auth.jwt()->>'client_id') is null) with check(id=(select auth.uid()) and (select auth.jwt()->>'client_id') is null);
grant update(name) on public.workspaces to authenticated;
create policy workspace_direct_update on public.workspaces for update to authenticated using(public.can_admin_workspace(id)) with check(public.can_admin_workspace(id));

create or replace function public.list_workspace_members(target_workspace uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.has_workspace_access(target_workspace) or (select auth.jwt()->>'client_id') is not null then raise exception 'Direct workspace access required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'display_name',coalesce(p.display_name,''),'email',u.email,'created_at',m.created_at) order by m.created_at),'[]'::jsonb) from public.workspace_members m join auth.users u on u.id=m.user_id left join public.profiles p on p.id=m.user_id where m.workspace_id=target_workspace);
end $$;
create or replace function public.create_workspace_invite(target_workspace uuid, invite_email text, invite_role text, secret_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
 if not public.can_admin_workspace(target_workspace) then raise exception 'Workspace administrator required' using errcode='42501'; end if;
 if invite_role not in ('creator','viewer') or invite_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(invite_email)>254 then raise exception 'Invalid invitation'; end if;
 insert into public.workspace_invites(workspace_id,email,role,token_hash,created_by) values(target_workspace,lower(trim(invite_email)),invite_role,secret_hash,auth.uid()) returning id into result;
 return result;
end $$;
create or replace function public.revoke_workspace_invite(target_invite uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.workspace_invites where id=target_invite and public.can_admin_workspace(workspace_id)) then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 update public.workspace_invites set revoked_at=now() where id=target_invite and accepted_at is null;
end $$;
create or replace function public.accept_workspace_invite(secret_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation public.workspace_invites; actor_email text;
begin
 if auth.uid() is null or (select auth.jwt()->>'client_id') is not null then raise exception 'Direct sign-in required' using errcode='42501'; end if;
 select email into actor_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select * into invitation from public.workspace_invites where token_hash=secret_hash and email=lower(actor_email) and revoked_at is null and accepted_at is null and expires_at>now() for update;
 if not found then raise exception 'Invitation is expired, already used or intended for another verified email' using errcode='42501'; end if;
 insert into public.workspace_members(workspace_id,user_id,role) values(invitation.workspace_id,auth.uid(),invitation.role) on conflict(workspace_id,user_id) do nothing;
 update public.workspace_invites set accepted_at=now() where id=invitation.id;
 return invitation.workspace_id;
end $$;
revoke all on function public.list_workspace_members(uuid),public.create_workspace_invite(uuid,text,text,text),public.revoke_workspace_invite(uuid),public.accept_workspace_invite(text) from public,anon;
grant execute on function public.list_workspace_members(uuid),public.create_workspace_invite(uuid,text,text,text),public.revoke_workspace_invite(uuid),public.accept_workspace_invite(text) to authenticated;
