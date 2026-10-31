-- Native-first lowers operating cost. All new CreativeOtter native work is credit-priced.
-- Existing completed native records remain historical; no retroactive debit.
alter table public.native_generations drop constraint native_generations_state_check;
alter table public.native_generations add constraint native_generations_state_check check(state in (
  'awaiting_approval','awaiting_generation','generating','awaiting_upload','succeeded','rejected','needs_reconciliation','failed','cancelled'));
alter table public.native_generations add column credit_units bigint check(credit_units>0),
  add column credit_pricing_version text,
  add column credit_status text not null default 'legacy_no_charge' check(credit_status in ('legacy_no_charge','quoted','reserved','charged','released','not_charged')),
  add column expires_at timestamptz,
  add column approved_at timestamptz,
  add column execution_token uuid,
  add column claimed_at timestamptz,
  add column public_error text;

alter table public.credit_ledger add column native_generation_id uuid references public.native_generations(id) on delete cascade;
alter table public.credit_ledger drop constraint credit_ledger_check;
alter table public.credit_ledger add constraint credit_ledger_movement_check check(
  (kind='grant' and job_id is null and native_generation_id is null and delta_available=amount_units and delta_reserved=0)
  or ((job_id is null)<>(native_generation_id is null) and (
    (kind='reserve' and delta_available=-amount_units and delta_reserved=amount_units)
    or(kind='charge' and delta_available=0 and delta_reserved=-amount_units)
    or(kind='release' and delta_available=amount_units and delta_reserved=-amount_units))));
create unique index credit_ledger_native_kind on public.credit_ledger(native_generation_id,kind) where native_generation_id is not null;
create unique index credit_ledger_native_finalization on public.credit_ledger(native_generation_id) where kind in ('charge','release');

create function private.price_native_generation() returns trigger language plpgsql security definer set search_path='' as $$
declare p private.workspace_credit_prices;
begin
 select * into p from private.workspace_credit_prices where workspace_id=new.workspace_id and model_key='native:image' and enabled and valid_until>now();
 if p.workspace_id is null then raise exception 'Native image credit pricing is not configured'; end if;
 new.credit_units:=p.credit_units; new.credit_pricing_version:=p.version; new.credit_status:='quoted';
 new.expires_at:=least(now()+interval '15 minutes',p.valid_until); new.state:='awaiting_approval';
 new.approved_at:=null; new.execution_token:=null; new.claimed_at:=null;
 return new;
end;
$$;
create trigger price_native_generation before insert on public.native_generations for each row execute function private.price_native_generation();

create function private.native_credit_transition() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.credit_accounts;
begin
 if row(old.workspace_id,old.user_id,old.client_id,old.request_key,old.input,old.host_name,old.reported_model,old.asset_id,old.credit_units,old.credit_pricing_version,old.expires_at)
   is distinct from row(new.workspace_id,new.user_id,new.client_id,new.request_key,new.input,new.host_name,new.reported_model,new.asset_id,new.credit_units,new.credit_pricing_version,new.expires_at) then
   raise exception 'Native quote inputs and price are immutable'; end if;
 if old.credit_status<>new.credit_status then raise exception 'Native credit state is managed transactionally'; end if;
 if old.credit_status='legacy_no_charge' then
   if new.state<>old.state then raise exception 'Legacy unpriced native work cannot be started or completed'; end if;
   return new;
 end if;
 if old.state in ('succeeded','failed','cancelled','rejected') and new.state<>old.state then raise exception 'Finalized native work cannot be reopened'; end if;
 if old.execution_token is not null and row(new.execution_token,new.claimed_at) is distinct from row(old.execution_token,old.claimed_at) then raise exception 'Native execution claim is immutable'; end if;
 if new.execution_token is distinct from old.execution_token and not(old.state='awaiting_generation' and new.state='generating' and new.execution_token is not null and new.claimed_at is not null) then raise exception 'Invalid native execution claim'; end if;
 if old.approved_at is not null and new.approved_at is distinct from old.approved_at then raise exception 'Native approval is immutable'; end if;
 if old.state=new.state then return new; end if;
 if new.state='awaiting_generation' then
   if old.state<>'awaiting_approval' or old.credit_status<>'quoted' or old.credit_units is null or old.expires_at<=now() or new.approved_at is null then raise exception 'A current priced native quote is required'; end if;
   select * into a from public.credit_accounts where workspace_id=new.workspace_id for update;
   if a.workspace_id is null or a.available_units<new.credit_units then raise exception 'Insufficient CreativeOtter credits' using errcode='22023'; end if;
   update public.credit_accounts set available_units=available_units-new.credit_units,reserved_units=reserved_units+new.credit_units,updated_at=now() where workspace_id=new.workspace_id;
   insert into public.credit_ledger(workspace_id,native_generation_id,kind,amount_units,delta_available,delta_reserved,entry_key,note)
     values(new.workspace_id,new.id,'reserve',new.credit_units,-new.credit_units,new.credit_units,'native:'||new.id||':reserve','Reserved for approved native image generation');
   new.credit_status:='reserved'; return new;
 end if;
 if new.state='generating' then
   if old.state<>'awaiting_generation' or old.credit_status<>'reserved' or new.execution_token is null then raise exception 'Native generation requires reserved credits and a single claim'; end if;
   return new;
 end if;
 if new.state='awaiting_upload' then
   if old.state not in ('generating','needs_reconciliation') or old.credit_status<>'reserved' or new.execution_token is null then raise exception 'Native upload requires a paid execution claim'; end if;
   return new;
 end if;
 if new.state='needs_reconciliation' then
   if old.state not in ('generating','awaiting_upload') or old.credit_status<>'reserved' then raise exception 'Invalid native reconciliation state'; end if;
   return new;
 end if;
 if new.state='succeeded' then
   if old.state not in ('awaiting_upload','needs_reconciliation') or old.credit_status<>'reserved' or not exists(
     select 1 from public.media_assets m join storage.objects o on o.bucket_id='creativeotter-media' and o.name=m.storage_path
       where m.id=new.asset_id and m.workspace_id=new.workspace_id and m.status='ready'
   ) then raise exception 'A validated saved native output and reservation are required'; end if;
   perform 1 from public.credit_accounts where workspace_id=new.workspace_id for update;
   update public.credit_accounts set reserved_units=reserved_units-new.credit_units,updated_at=now() where workspace_id=new.workspace_id;
   insert into public.credit_ledger(workspace_id,native_generation_id,kind,amount_units,delta_available,delta_reserved,entry_key,note)
     values(new.workspace_id,new.id,'charge',new.credit_units,0,-new.credit_units,'native:'||new.id||':charge','Charged for delivered native image generation');
   new.credit_status:='charged'; return new;
 end if;
 if new.state in ('failed','cancelled') then
   if new.state='cancelled' and old.state not in ('awaiting_approval','awaiting_generation') then raise exception 'Claimed native work needs operator reconciliation'; end if;
   if new.state='failed' and coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Confirmed native failure requires trusted reconciliation'; end if;
   if old.credit_status='reserved' then
     perform 1 from public.credit_accounts where workspace_id=new.workspace_id for update;
     update public.credit_accounts set available_units=available_units+new.credit_units,reserved_units=reserved_units-new.credit_units,updated_at=now() where workspace_id=new.workspace_id;
     insert into public.credit_ledger(workspace_id,native_generation_id,kind,amount_units,delta_available,delta_reserved,entry_key,note)
       values(new.workspace_id,new.id,'release',new.credit_units,new.credit_units,-new.credit_units,'native:'||new.id||':release',case when new.state='cancelled' then 'Released before native execution was claimed' else 'Released after trusted confirmation of native failure' end);
     new.credit_status:='released';
   else new.credit_status:='not_charged'; end if;
   return new;
 end if;
 raise exception 'Unsupported native state transition';
end;
$$;
create trigger native_credit_transition before update on public.native_generations for each row execute function private.native_credit_transition();

-- Keep the old signature only as an explicit closed compatibility boundary.
create or replace function public.prepare_native_output(target_workspace uuid,request_key uuid,native_input jsonb,host_name text,reported_model text,output_mime text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception 'Native work now requires prepare_native_generation, browser credit approval and claim_native_generation before using a native tool'; end;
$$;
revoke all on function public.prepare_native_output(uuid,uuid,jsonb,text,text,text) from public,anon,authenticated,service_role;
create or replace function public.complete_native_output(target_generation uuid,asset_metadata jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception 'A paid native execution token is required'; end;
$$;
revoke all on function public.complete_native_output(uuid,jsonb) from public,anon,authenticated,service_role;

create function public.prepare_native_generation(target_workspace uuid,request_key uuid,native_input jsonb,host_name text,reported_model text,output_mime text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.native_generations; a public.media_assets; new_id uuid:=gen_random_uuid(); refs uuid[]; calling_client text:=coalesce(auth.jwt()->>'client_id','web');
begin
 if not public.has_media_access(target_workspace,'media:prepare') or not exists(select 1 from private.workspace_generation_limits where workspace_id=target_workspace and enabled) then raise exception 'Media preparation access is required' using errcode='42501'; end if;
 if native_input is null or jsonb_typeof(native_input)<>'object' or native_input-array['prompt','aspect_ratio','resolution','reference_asset_ids']::text[]<>'{}'::jsonb
   or not(native_input ?& array['prompt','aspect_ratio','resolution','reference_asset_ids']) or jsonb_typeof(native_input->'prompt')<>'string'
   or char_length(btrim(native_input->>'prompt')) not between 1 and 8000 or jsonb_typeof(native_input->'reference_asset_ids')<>'array'
   or jsonb_array_length(native_input->'reference_asset_ids')>14
   or jsonb_typeof(native_input->'aspect_ratio') not in ('string','null') or jsonb_typeof(native_input->'resolution') not in ('string','null')
   or coalesce(char_length(native_input->>'aspect_ratio'),0)>32 or coalesce(char_length(native_input->>'resolution'),0)>32 then raise exception 'Unsupported native image metadata' using errcode='22023'; end if;
 select coalesce(array_agg(value::uuid),'{}'::uuid[]) into refs from jsonb_array_elements_text(native_input->'reference_asset_ids');
 if cardinality(refs)<>(select count(distinct x) from unnest(refs) x) or cardinality(refs)<>(select count(*) from public.media_assets where id=any(refs) and workspace_id=target_workspace and status='ready') then raise exception 'Reference access denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||calling_client||request_key::text,0));
 select * into n from public.native_generations g where g.user_id=auth.uid() and g.client_id=calling_client and g.request_key=prepare_native_generation.request_key;
 if n.id is not null then
   select * into a from public.media_assets where id=n.asset_id;
   if n.workspace_id<>target_workspace or n.input<>native_input or n.host_name<>host_name or n.reported_model is distinct from reported_model or a.mime_type<>output_mime then raise exception 'Request key belongs to different metadata' using errcode='22023'; end if;
   return to_jsonb(n)-'execution_token';
 end if;
 if(select count(*) from public.native_generations where workspace_id=target_workspace and created_at>now()-interval '1 day')>=100 then raise exception 'Native request limit reached'; end if;
 insert into public.media_assets(id,workspace_id,user_id,kind,storage_path,label,mime_type) values(new_id,target_workspace,auth.uid(),'output',target_workspace::text||'/native/'||new_id::text,'Native assistant image',output_mime) returning * into a;
 insert into public.native_generations(id,workspace_id,user_id,client_id,request_key,input,host_name,reported_model,asset_id) values(new_id,target_workspace,auth.uid(),calling_client,request_key,native_input,host_name,reported_model,new_id) returning * into n;
 return to_jsonb(n)-'execution_token';
end;
$$;
revoke all on function public.prepare_native_generation(uuid,uuid,jsonb,text,text,text) from public,anon;
grant execute on function public.prepare_native_generation(uuid,uuid,jsonb,text,text,text) to authenticated;

create function public.approve_native_generation(target_generation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.native_generations;
begin
 if auth.uid() is null or auth.jwt()->>'client_id' is not null then raise exception 'Approval requires a direct browser session' using errcode='42501'; end if;
 select * into n from public.native_generations where id=target_generation for update;
 if n.id is null or n.user_id<>auth.uid() or not public.has_media_access(n.workspace_id,'media:prepare') then raise exception 'Native request access denied' using errcode='42501'; end if;
 if n.credit_status in ('reserved','charged') then return to_jsonb(n)-'execution_token'; end if;
 if n.state<>'awaiting_approval' or n.credit_status<>'quoted' or n.expires_at<=now() then raise exception 'Native quote is not available for approval'; end if;
 if not exists(select 1 from private.workspace_generation_limits where workspace_id=n.workspace_id and enabled) then raise exception 'Native preview is disabled'; end if;
 if n.client_id<>'web' and not exists(select 1 from public.client_grants where workspace_id=n.workspace_id and user_id=n.user_id and client_id=n.client_id and revoked_at is null and 'media:prepare'=any(permissions)) then raise exception 'Requesting application is no longer approved' using errcode='42501'; end if;
 update public.native_generations set state='awaiting_generation',approved_at=now() where id=n.id returning * into n;
 return to_jsonb(n)-'execution_token';
end;
$$;
revoke all on function public.approve_native_generation(uuid) from public,anon;
grant execute on function public.approve_native_generation(uuid) to authenticated;

create function public.claim_native_generation(target_generation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.native_generations; token uuid:=gen_random_uuid();
begin
 select * into n from public.native_generations where id=target_generation for update;
 if n.id is null or n.user_id<>auth.uid() or n.client_id<>coalesce(auth.jwt()->>'client_id','web') or not public.has_media_access(n.workspace_id,'media:prepare') then raise exception 'Native execution access denied' using errcode='42501'; end if;
 if n.state<>'awaiting_generation' or n.credit_status<>'reserved' then raise exception 'Native execution is not available or was already claimed. Reconcile the existing attempt; do not generate again.'; end if;
 update public.native_generations set state='generating',execution_token=token,claimed_at=now() where id=n.id returning * into n;
 return jsonb_build_object('generation_id',n.id,'execution_token',token,'input',n.input,'host',n.host_name,'reported_model',n.reported_model,'credit_units',n.credit_units::text,'credit_status',n.credit_status,'claimed',true);
end;
$$;
revoke all on function public.claim_native_generation(uuid) from public,anon;
grant execute on function public.claim_native_generation(uuid) to authenticated;

create function public.authorize_native_upload(target_generation uuid,expected_execution_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.native_generations; a public.media_assets;
begin
 select * into n from public.native_generations where id=target_generation for update;
 if n.id is null or n.user_id<>auth.uid() or n.client_id<>coalesce(auth.jwt()->>'client_id','web') or not public.has_media_access(n.workspace_id,'media:prepare') or expected_execution_token is null or n.execution_token is distinct from expected_execution_token then raise exception 'Native upload access denied' using errcode='42501'; end if;
 if n.credit_status='charged' and n.state='succeeded' then return jsonb_build_object('generation_id',n.id,'asset_id',n.asset_id,'state',n.state); end if;
 if n.credit_status<>'reserved' or n.state not in ('generating','awaiting_upload','needs_reconciliation') then raise exception 'A paid native execution claim is required'; end if;
 if n.state<>'awaiting_upload' then update public.native_generations set state='awaiting_upload' where id=n.id; end if;
 select * into a from public.media_assets where id=n.asset_id;
 return jsonb_build_object('generation_id',n.id,'asset_id',n.asset_id,'state','awaiting_upload','storage_path',a.storage_path,'mime_type',a.mime_type);
end;
$$;
revoke all on function public.authorize_native_upload(uuid,uuid) from public,anon;
grant execute on function public.authorize_native_upload(uuid,uuid) to authenticated;

create function public.complete_paid_native_output(target_generation uuid,expected_execution_token uuid,asset_metadata jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.native_generations; a public.media_assets;
begin
 select * into n from public.native_generations where id=target_generation for update;
 if n.id is null or expected_execution_token is null or n.execution_token is distinct from expected_execution_token then raise exception 'Native execution token is invalid'; end if;
 if n.state='succeeded' and n.credit_status='charged' then return to_jsonb(n)-'execution_token'; end if;
 if n.state not in ('awaiting_upload','needs_reconciliation') or n.credit_status<>'reserved' then raise exception 'Native output has no active paid reservation'; end if;
 select * into a from public.media_assets where id=n.asset_id for update;
 if a.status<>'pending' or not exists(select 1 from storage.objects where bucket_id='creativeotter-media' and name=a.storage_path) then raise exception 'Native image has not been saved'; end if;
 update public.media_assets set status='ready',size_bytes=(asset_metadata->>'size_bytes')::bigint,sha256=asset_metadata->>'sha256',width=(asset_metadata->>'width')::integer,height=(asset_metadata->>'height')::integer where id=a.id;
 update public.native_generations set state='succeeded',public_error=null where id=n.id returning * into n;
 return to_jsonb(n)-'execution_token';
end;
$$;
revoke all on function public.complete_paid_native_output(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.complete_paid_native_output(uuid,uuid,jsonb) to service_role;

create function public.report_native_outcome(target_generation uuid,expected_execution_token uuid,detail text) returns void language plpgsql security definer set search_path='' as $$
declare n public.native_generations;
begin
 select * into n from public.native_generations where id=target_generation for update;
 if n.id is null or n.user_id<>auth.uid() or n.client_id<>coalesce(auth.jwt()->>'client_id','web') or not public.has_media_access(n.workspace_id,'media:prepare') or expected_execution_token is null or n.execution_token is distinct from expected_execution_token then raise exception 'Native result access denied' using errcode='42501'; end if;
 if n.state in ('succeeded','failed','cancelled','needs_reconciliation') then return; end if;
 update public.native_generations set state='needs_reconciliation',public_error='Native execution outcome needs operator review. '||left(coalesce(detail,''),350) where id=n.id;
end;
$$;
revoke all on function public.report_native_outcome(uuid,uuid,text) from public,anon;
grant execute on function public.report_native_outcome(uuid,uuid,text) to authenticated;

create function public.cancel_native_generation(target_generation uuid) returns void language plpgsql security definer set search_path='' as $$
declare n public.native_generations;
begin
 if auth.uid() is null or auth.jwt()->>'client_id' is not null then raise exception 'Cancellation requires a direct browser session' using errcode='42501'; end if;
 select * into n from public.native_generations where id=target_generation for update;
 if n.id is null or n.user_id<>auth.uid() or not public.has_media_access(n.workspace_id,'media:prepare') then raise exception 'Native request access denied' using errcode='42501'; end if;
 if n.state='cancelled' then return; end if;
 if n.state not in ('awaiting_approval','awaiting_generation') then raise exception 'Execution was claimed; operator reconciliation is required'; end if;
 update public.native_generations set state='cancelled' where id=n.id;
end;
$$;
revoke all on function public.cancel_native_generation(uuid) from public,anon;
grant execute on function public.cancel_native_generation(uuid) to authenticated;

create function public.confirm_native_failure(target_generation uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare n public.native_generations;
begin
 if reason is null or char_length(btrim(reason)) not between 1 and 400 then raise exception 'A reconciliation reason is required'; end if;
 select * into n from public.native_generations where id=target_generation for update;
 if n.id is null then raise exception 'Unknown native generation'; end if;
 if n.state='failed' then return; end if;
 if n.state not in ('awaiting_generation','generating','awaiting_upload','needs_reconciliation') or n.credit_status<>'reserved' then raise exception 'Native result is not available for failure reconciliation'; end if;
 update public.native_generations set state='failed',public_error=reason where id=n.id;
end;
$$;
revoke all on function public.confirm_native_failure(uuid,text) from public,anon,authenticated;
grant execute on function public.confirm_native_failure(uuid,text) to service_role;

-- Storage issuance is also gated, so an old client cannot obtain an unapproved upload.
drop policy creativeotter_native_upload on storage.objects;
create policy creativeotter_native_upload on storage.objects for insert to authenticated with check(
 bucket_id='creativeotter-media' and exists(select 1 from public.media_assets a join public.native_generations n on n.asset_id=a.id where a.storage_path=name and a.kind='output' and a.status='pending' and n.state='awaiting_upload' and n.credit_status='reserved' and n.execution_token is not null and a.user_id=auth.uid() and n.client_id=coalesce(auth.jwt()->>'client_id','web') and public.has_media_access(a.workspace_id,'media:prepare')));

create or replace function public.get_generation_access(target_workspace uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare limits private.workspace_generation_limits;
begin
 if not public.has_workspace_access(target_workspace) then raise exception 'Workspace access denied' using errcode='42501'; end if;
 select * into limits from private.workspace_generation_limits where workspace_id=target_workspace;
 return jsonb_build_object('enabled',coalesce(limits.enabled,false),'provider_budget_enabled',coalesce(limits.enabled and limits.daily_budget_micro_usd>0,false),
  'credit_pricing_enabled',exists(select 1 from private.workspace_credit_prices where workspace_id=target_workspace and model_key='image/nano-banana-2' and enabled and valid_until>now()),
  'native_credit_pricing_enabled',exists(select 1 from private.workspace_credit_prices where workspace_id=target_workspace and model_key='native:image' and enabled and valid_until>now()),
  'can_read',public.has_media_access(target_workspace,'media:read'),'can_prepare',public.has_media_access(target_workspace,'media:prepare'));
end;
$$;
create or replace function public.get_credit_summary(target_workspace uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.credit_accounts; history jsonb; spent bigint;
begin
 if not public.has_workspace_access(target_workspace) then raise exception 'Workspace access denied' using errcode='42501'; end if;
 select * into a from public.credit_accounts where workspace_id=target_workspace;
 if a.workspace_id is null then raise exception 'Credit account unavailable'; end if;
 select coalesce(sum(amount_units),0) into spent from public.credit_ledger where workspace_id=target_workspace and kind='charge';
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'amount_units',r.amount_units::text,'job_id',r.job_id,'native_generation_id',r.native_generation_id,'note',r.note,'created_at',r.created_at) order by r.created_at desc),'[]'::jsonb) into history from(select * from public.credit_ledger where workspace_id=target_workspace order by created_at desc,id desc limit 30)r;
 return jsonb_build_object('workspace_id',target_workspace,'available_units',a.available_units::text,'reserved_units',a.reserved_units::text,'spent_units',spent::text,'units_per_credit',1000,'purchases_enabled',false,'history',history);
end;
$$;
revoke all on function private.price_native_generation(),private.native_credit_transition() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
