-- Additional checks discovered during local integration. Prior migrations remain unchanged.
create function private.validate_render_row() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' then
  if row(new.workspace_id,new.user_id,new.client_id,new.request_key,new.input,new.credit_units,new.pricing_version,new.expires_at)
   is distinct from row(old.workspace_id,old.user_id,old.client_id,old.request_key,old.input,old.credit_units,old.pricing_version,old.expires_at) then raise exception 'Design inputs and price are immutable'; end if;
  return new;
 end if;
 if not coalesce(jsonb_typeof(new.input)='object'
 and (select count(*) from jsonb_object_keys(new.input))=9
 and jsonb_typeof(new.input->'title')='string' and char_length(new.input->>'title') between 1 and 120
 and jsonb_typeof(new.input->'html')='string' and char_length(new.input->>'html') between 1 and 24000
 and jsonb_typeof(new.input->'css')='string' and char_length(new.input->>'css')<=12000
 and new.input->>'format' in ('png','mp4')
 and jsonb_typeof(new.input->'width')='number' and jsonb_typeof(new.input->'height')='number'
 and jsonb_typeof(new.input->'fps')='number' and jsonb_typeof(new.input->'duration_seconds')='number'
 and (new.input->>'width')::numeric=trunc((new.input->>'width')::numeric)
 and (new.input->>'height')::numeric=trunc((new.input->>'height')::numeric)
 and (new.input->>'duration_seconds')::numeric=trunc((new.input->>'duration_seconds')::numeric)
 and jsonb_typeof(new.input->'asset_ids')='array',false) then raise exception 'Invalid design settings'; end if;
 return new;
end;
$$;
revoke all on function private.validate_render_row() from public,anon,authenticated,service_role;
create trigger validate_render_row before insert or update on public.render_jobs for each row execute function private.validate_render_row();

create function private.render_can_execute(j public.render_jobs) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workspace_members m join auth.users u on u.id=m.user_id
 join private.workspace_render_settings s on s.workspace_id=m.workspace_id
 where m.workspace_id=j.workspace_id and m.user_id=j.user_id and m.role in ('owner','admin','creator')
 and s.enabled and u.deleted_at is null and (u.banned_until is null or u.banned_until<now())
 and (j.client_id is null or exists(select 1 from public.client_grants g where g.workspace_id=j.workspace_id and g.user_id=j.user_id and g.client_id=j.client_id
 and g.revoked_at is null and 'account:read'=any(g.permissions) and 'media:read'=any(g.permissions) and 'media:prepare'=any(g.permissions))));
$$;
revoke all on function private.render_can_execute(public.render_jobs) from public,anon,authenticated,service_role;
create or replace function public.claim_render() returns public.render_jobs language plpgsql security definer set search_path='' as $$
declare j public.render_jobs;
begin
 select * into j from public.render_jobs r where r.state='queued' or (r.state in ('running','saving') and r.lease_until<now()) order by r.created_at for update skip locked limit 1;
 if j.id is null then return null; end if;
 update public.render_jobs set state='running',lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1,updated_at=now() where id=j.id returning * into j;
 if j.attempts>2 or not private.render_can_execute(j) then return private.finish_render(j,false); end if;
 return j;
end;
$$;
notify pgrst,'reload schema';
