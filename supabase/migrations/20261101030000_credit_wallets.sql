-- Retail credits are independent of provider micro-USD. 1000 units = 1 credit.
-- No paid credits or trial grants are issued by this migration.
create table public.credit_accounts (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  available_units bigint not null default 0 check(available_units>=0),
  reserved_units bigint not null default 0 check(reserved_units>=0),
  updated_at timestamptz not null default now()
);
create table private.workspace_credit_prices (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  model_key text not null,
  version text not null check(char_length(version) between 1 and 120),
  credit_units bigint not null check(credit_units between 1 and 1000000000000),
  valid_until timestamptz not null,
  enabled boolean not null default false,
  primary key(workspace_id,model_key)
);
revoke all on private.workspace_credit_prices from public,anon,authenticated;

alter table public.generation_quotes add column credit_units bigint check(credit_units>0),
  add column credit_pricing_version text;
alter table public.generation_jobs add column credit_units bigint check(credit_units>0),
  add column credit_status text not null default 'unpriced' check(credit_status in ('unpriced','reserved','charged','released'));

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id uuid references public.generation_jobs(id) on delete cascade,
  kind text not null check(kind in ('grant','reserve','charge','release')),
  amount_units bigint not null check(amount_units>0),
  delta_available bigint not null,
  delta_reserved bigint not null,
  entry_key text not null unique,
  note text not null check(char_length(note) between 1 and 500),
  created_at timestamptz not null default now(),
  unique(job_id,kind),
  check((kind='grant' and job_id is null and delta_available=amount_units and delta_reserved=0)
     or (kind='reserve' and job_id is not null and delta_available=-amount_units and delta_reserved=amount_units)
     or (kind='charge' and job_id is not null and delta_available=0 and delta_reserved=-amount_units)
     or (kind='release' and job_id is not null and delta_available=amount_units and delta_reserved=-amount_units))
);
create unique index credit_ledger_one_finalization on public.credit_ledger(job_id) where kind in ('charge','release');
create index credit_ledger_workspace_created on public.credit_ledger(workspace_id,created_at desc);
alter table public.credit_accounts enable row level security;
alter table public.credit_ledger enable row level security;
revoke all on public.credit_accounts,public.credit_ledger from public,anon,authenticated,service_role;
grant select on public.credit_accounts,public.credit_ledger to authenticated,service_role;
create policy credit_account_read on public.credit_accounts for select to authenticated using(public.has_workspace_access(workspace_id));
create policy credit_ledger_read on public.credit_ledger for select to authenticated using(public.has_workspace_access(workspace_id));

create function private.initialize_credit_account() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.credit_accounts(workspace_id) values(new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger initialize_credit_account after insert on public.workspaces for each row execute function private.initialize_credit_account();
insert into public.credit_accounts(workspace_id) select id from public.workspaces on conflict do nothing;

create function private.immutable_credit_ledger() returns trigger language plpgsql set search_path='' as $$
begin
  -- Only a cascading workspace/test-fixture deletion may remove ledger rows.
  if TG_OP='DELETE' and pg_trigger_depth()>1 then return old; end if;
  raise exception 'Credit ledger entries are immutable' using errcode='42501';
end;
$$;
create trigger immutable_credit_ledger before update or delete on public.credit_ledger for each row execute function private.immutable_credit_ledger();

create function public.get_credit_summary(target_workspace uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.credit_accounts; history jsonb; spent bigint;
begin
  if not public.has_workspace_access(target_workspace) then raise exception 'Workspace access denied' using errcode='42501'; end if;
  select * into a from public.credit_accounts where workspace_id=target_workspace;
  if a.workspace_id is null then raise exception 'Credit account unavailable'; end if;
  select coalesce(sum(amount_units),0) into spent from public.credit_ledger where workspace_id=target_workspace and kind='charge';
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'amount_units',r.amount_units::text,'job_id',r.job_id,'note',r.note,'created_at',r.created_at) order by r.created_at desc),'[]'::jsonb) into history
    from (select * from public.credit_ledger where workspace_id=target_workspace order by created_at desc,id desc limit 30) r;
  return jsonb_build_object('workspace_id',target_workspace,'available_units',a.available_units::text,'reserved_units',a.reserved_units::text,'spent_units',spent::text,'units_per_credit',1000,'purchases_enabled',false,'history',history);
end;
$$;
revoke all on function public.get_credit_summary(uuid) from public,anon;
grant execute on function public.get_credit_summary(uuid) to authenticated;

-- Trusted issuance only: future payment webhooks must verify their provider event first.
-- Neither web sessions nor MCP clients can issue credits.
create function public.record_credit_grant(target_workspace uuid, units bigint, external_event_id text, reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.credit_accounts; prior public.credit_ledger;
begin
  if units is null or units not between 1 and 1000000000000 or external_event_id is null
    or char_length(external_event_id) not between 1 and 200 or reason is null or char_length(reason) not between 1 and 500 then
    raise exception 'Invalid credit grant' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('credit-grant:'||external_event_id,0));
  select * into prior from public.credit_ledger where entry_key='grant:'||external_event_id;
  if prior.id is not null then
    if prior.workspace_id<>target_workspace or prior.amount_units<>units or prior.note<>reason then
      raise exception 'Credit event already belongs to different metadata' using errcode='22023'; end if;
    return jsonb_build_object('entry_id',prior.id,'duplicate',true);
  end if;
  select * into a from public.credit_accounts where workspace_id=target_workspace for update;
  if a.workspace_id is null then raise exception 'Unknown credit account'; end if;
  update public.credit_accounts set available_units=available_units+units,updated_at=now() where workspace_id=target_workspace;
  insert into public.credit_ledger(workspace_id,kind,amount_units,delta_available,delta_reserved,entry_key,note)
    values(target_workspace,'grant',units,units,0,'grant:'||external_event_id,reason) returning * into prior;
  return jsonb_build_object('entry_id',prior.id,'duplicate',false);
end;
$$;
revoke all on function public.record_credit_grant(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.record_credit_grant(uuid,bigint,text,text) to service_role;

create function private.bind_quote_credits() returns trigger language plpgsql security definer set search_path='' as $$
declare p private.workspace_credit_prices;
begin
  select * into p from private.workspace_credit_prices where workspace_id=new.workspace_id and model_key=new.model_key and enabled and valid_until>now();
  if p.workspace_id is null then raise exception 'Credit pricing is not configured for this workspace'; end if;
  new.credit_units:=p.credit_units;
  new.credit_pricing_version:=p.version;
  new.expires_at:=least(new.expires_at,p.valid_until);
  return new;
end;
$$;
create trigger bind_quote_credits before insert on public.generation_quotes for each row execute function private.bind_quote_credits();

create function private.bind_job_credits() returns trigger language plpgsql security definer set search_path='' as $$
declare q public.generation_quotes;
begin
  select * into q from public.generation_quotes where id=new.quote_id;
  if q.id is null or q.workspace_id<>new.workspace_id or q.user_id<>new.user_id
     or q.credit_units is null or q.credit_pricing_version is null or q.expires_at<=now() then
    raise exception 'A current credit-priced quote is required' using errcode='22023'; end if;
  new.credit_units:=q.credit_units; new.credit_status:='reserved';
  return new;
end;
$$;
create trigger bind_job_credits before insert on public.generation_jobs for each row execute function private.bind_job_credits();

create function private.reserve_job_credits() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.credit_accounts;
begin
  select * into a from public.credit_accounts where workspace_id=new.workspace_id for update;
  if a.workspace_id is null or a.available_units<new.credit_units then raise exception 'Insufficient CreativeOtter credits' using errcode='22023'; end if;
  update public.credit_accounts set available_units=available_units-new.credit_units,reserved_units=reserved_units+new.credit_units,updated_at=now() where workspace_id=new.workspace_id;
  insert into public.credit_ledger(workspace_id,job_id,kind,amount_units,delta_available,delta_reserved,entry_key,note)
    values(new.workspace_id,new.id,'reserve',new.credit_units,-new.credit_units,new.credit_units,'job:'||new.id||':reserve','Reserved for an approved provider image');
  return new;
end;
$$;
create trigger reserve_job_credits after insert on public.generation_jobs for each row execute function private.reserve_job_credits();

create function private.finalize_job_credits() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.state in ('succeeded','failed') and new.state<>old.state then
    raise exception 'A finalized image job cannot be reopened'; end if;
  if old.credit_units is distinct from new.credit_units or old.workspace_id<>new.workspace_id or old.quote_id<>new.quote_id or old.user_id<>new.user_id then
    raise exception 'Approved job credit metadata is immutable'; end if;
  if old.credit_status<>new.credit_status then raise exception 'Credit state is managed by job finalization'; end if;
  if old.credit_status='unpriced' then
    if new.state='succeeded' and old.state<>new.state then raise exception 'Legacy unpriced job needs operator reconciliation'; end if;
    return new;
  end if;
  if old.credit_status<>'reserved' then return new; end if;
  if new.state not in ('succeeded','failed') then return new; end if;
  perform 1 from public.credit_accounts where workspace_id=new.workspace_id for update;
  if new.state='succeeded' then
    update public.credit_accounts set reserved_units=reserved_units-new.credit_units,updated_at=now() where workspace_id=new.workspace_id;
    insert into public.credit_ledger(workspace_id,job_id,kind,amount_units,delta_available,delta_reserved,entry_key,note)
      values(new.workspace_id,new.id,'charge',new.credit_units,0,-new.credit_units,'job:'||new.id||':charge','Charged after the provider image was saved');
    new.credit_status:='charged';
  else
    update public.credit_accounts set available_units=available_units+new.credit_units,reserved_units=reserved_units-new.credit_units,updated_at=now() where workspace_id=new.workspace_id;
    insert into public.credit_ledger(workspace_id,job_id,kind,amount_units,delta_available,delta_reserved,entry_key,note)
      values(new.workspace_id,new.id,'release',new.credit_units,new.credit_units,-new.credit_units,'job:'||new.id||':release','Released after a confirmed provider generation failure');
    new.credit_status:='released';
  end if;
  return new;
end;
$$;
create trigger finalize_job_credits before update on public.generation_jobs for each row execute function private.finalize_job_credits();

-- Retail availability does not depend on native tools; native imports stay zero-credit.
create or replace function public.get_generation_access(target_workspace uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare limits private.workspace_generation_limits;
begin
  if not public.has_workspace_access(target_workspace) then raise exception 'Workspace access denied' using errcode='42501'; end if;
  select * into limits from private.workspace_generation_limits where workspace_id=target_workspace;
  return jsonb_build_object('enabled',coalesce(limits.enabled,false),
    'provider_budget_enabled',coalesce(limits.enabled and limits.daily_budget_micro_usd>0,false),
    'credit_pricing_enabled',exists(select 1 from private.workspace_credit_prices where workspace_id=target_workspace and model_key='image/nano-banana-2' and enabled and valid_until>now()),
    'can_read',public.has_media_access(target_workspace,'media:read'),'can_prepare',public.has_media_access(target_workspace,'media:prepare'));
end;
$$;

-- Trigger functions are not callable APIs.
revoke all on function private.initialize_credit_account(),private.immutable_credit_ledger(),private.bind_quote_credits(),private.bind_job_credits(),private.reserve_job_credits(),private.finalize_job_credits() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
