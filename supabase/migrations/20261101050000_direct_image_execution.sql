-- Explicit image requests authorize one paid attempt. Quote-only operations remain non-spending.
-- Reuse all existing wallet, price, settlement and one-execution guards. Applied migrations are unchanged.
create or replace function public.claim_native_generation(target_generation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.native_generations; token uuid:=gen_random_uuid();
begin
 select * into n from public.native_generations where id=target_generation for update;
 if n.id is null or n.user_id<>auth.uid() or n.client_id<>coalesce(auth.jwt()->>'client_id','web') or not public.has_media_access(n.workspace_id,'media:prepare') then raise exception 'Native execution access denied' using errcode='42501'; end if;
 -- An explicit generation request starts paid work without a second browser approval.
 -- Reservation and one-use claim share this transaction and row lock.
 if not exists(select 1 from private.workspace_generation_limits where workspace_id=n.workspace_id and enabled) then raise exception 'Native generation is disabled'; end if;
 if n.state='awaiting_approval' and n.credit_status='quoted' then
   if n.expires_at<=now() then raise exception 'Native quote expired; prepare a new quote'; end if;
   update public.native_generations set state='awaiting_generation',approved_at=now() where id=n.id returning * into n;
 end if;
 if n.state<>'awaiting_generation' or n.credit_status<>'reserved' then raise exception 'Native execution is not available or was already claimed. Reconcile the existing attempt; do not generate again.'; end if;
 update public.native_generations set state='generating',execution_token=token,claimed_at=now() where id=n.id returning * into n;
 return jsonb_build_object('generation_id',n.id,'execution_token',token,'input',n.input,'host',n.host_name,'reported_model',n.reported_model,'credit_units',n.credit_units::text,'credit_status',n.credit_status,'claimed',true);
end;
$$;
revoke all on function public.claim_native_generation(uuid) from public,anon;
grant execute on function public.claim_native_generation(uuid) to authenticated;


create or replace function public.start_image_generation(target_quote uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare q public.generation_quotes; j public.generation_jobs; limits private.workspace_generation_limits; committed bigint;
begin
  if auth.uid() is null then raise exception 'Authentication is required' using errcode='42501'; end if;
  select * into q from public.generation_quotes where id=target_quote for update;
  if q.id is null or q.user_id <> auth.uid() or not public.has_media_access(q.workspace_id,'media:prepare') then
    raise exception 'Quote access denied' using errcode='42501';
  end if;
  if auth.jwt()->>'client_id' is not null and q.client_id<>auth.jwt()->>'client_id' then
    raise exception 'Generation belongs to another application' using errcode='42501';
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
revoke all on function public.start_image_generation(uuid) from public, anon;
grant execute on function public.start_image_generation(uuid) to authenticated;
notify pgrst,'reload schema';
