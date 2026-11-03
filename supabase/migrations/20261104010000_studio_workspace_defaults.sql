-- Private reference storage and Studio preferences are available to new workspaces.
-- Provider budgets remain zero; no credits or pricing are granted.
create or replace function private.initialize_studio_workspace()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.workspace_generation_limits(workspace_id,enabled,daily_budget_micro_usd) values(new.id,true,0) on conflict(workspace_id) do nothing;
 insert into public.workspace_preferences(workspace_id) values(new.id) on conflict(workspace_id) do nothing;
 return new;
end;
$$;
revoke all on function private.initialize_studio_workspace() from public,anon,authenticated,service_role;
create trigger initialize_studio_workspace after insert on public.workspaces for each row execute function private.initialize_studio_workspace();
insert into private.workspace_generation_limits(workspace_id,enabled,daily_budget_micro_usd)
 select id,true,0 from public.workspaces on conflict(workspace_id) do nothing;
insert into public.workspace_preferences(workspace_id) select id from public.workspaces on conflict(workspace_id) do nothing;
notify pgrst,'reload schema';
