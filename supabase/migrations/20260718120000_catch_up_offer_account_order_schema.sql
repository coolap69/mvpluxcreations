-- MVPLUXCREATIONS cumulative offer/account/order database catch-up.
--
-- This migration is intentionally additive and rerunnable. It contains the
-- older prerequisites introduced before a72509b, followed by the payment and
-- archive additions introduced by a72509b. Run it as one transaction so any
-- incompatibility rolls the entire migration back.

begin;

-- --------------------------------------------------------------------------
-- 1. Core tables and columns
-- --------------------------------------------------------------------------

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_profiles
  add column if not exists test_mode_enabled boolean not null default false,
  add column if not exists test_customer_type text not null default 'guest';

create table if not exists public.site_edits (
  page_key text primary key,
  edits jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.site_edits add column if not exists revision bigint not null default 0;
alter table public.site_edits enable row level security;

drop policy if exists "Anyone can view site edits" on public.site_edits;
drop policy if exists "Admins can view site edits" on public.site_edits;
create policy "Admins can view site edits" on public.site_edits for select
using (exists (select 1 from public.admin_profiles where admin_profiles.user_id=auth.uid()));

drop policy if exists "Admins can create site edits" on public.site_edits;
create policy "Admins can create site edits" on public.site_edits for insert
with check (exists (select 1 from public.admin_profiles where admin_profiles.user_id=auth.uid()));

drop policy if exists "Admins can update site edits" on public.site_edits;
create policy "Admins can update site edits" on public.site_edits for update
using (exists (select 1 from public.admin_profiles where admin_profiles.user_id=auth.uid()))
with check (exists (select 1 from public.admin_profiles where admin_profiles.user_id=auth.uid()));

drop policy if exists "Admins can delete site edits" on public.site_edits;
create policy "Admins can delete site edits" on public.site_edits for delete
using (exists (select 1 from public.admin_profiles where admin_profiles.user_id=auth.uid()));

create table if not exists public.order_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text,
  customer_email text,
  customer_phone text,
  shipping_address jsonb,
  items jsonb not null default '[]'::jsonb,
  payment_method text,
  subtotal numeric(10,2),
  customer_fee numeric(10,2),
  total numeric(10,2),
  status text not null default 'new',
  notes text,
  created_at timestamptz not null default now()
);

alter table public.order_requests
  add column if not exists original_amount numeric(10,2),
  add column if not exists applied_discount_code text,
  add column if not exists discount_amount numeric(10,2) not null default 0,
  add column if not exists is_test boolean not null default false,
  add column if not exists archived_at timestamptz;

alter table public.order_requests add column if not exists updated_at timestamptz;
update public.order_requests set updated_at=created_at where updated_at is null;
alter table public.order_requests alter column updated_at set default now();
alter table public.order_requests alter column updated_at set not null;

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text,
  customer_email text,
  amount numeric(10,2) not null,
  message text,
  status text not null default 'pending',
  seller_counter_amount numeric(10,2),
  seller_counter_message text,
  buyer_final_amount numeric(10,2),
  buyer_final_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.offers
  add column if not exists is_test boolean not null default false,
  add column if not exists payment_method text,
  add column if not exists payment_shipping_address jsonb,
  add column if not exists payment_customer_phone text,
  add column if not exists payment_items jsonb,
  add column if not exists payment_notes text,
  add column if not exists payment_submitted_at timestamptz,
  add column if not exists archived_at timestamptz;

alter table public.offers add column if not exists updated_at timestamptz;
update public.offers set updated_at=created_at where updated_at is null;
alter table public.offers alter column updated_at set default now();
alter table public.offers alter column updated_at set not null;

alter table public.order_requests
  add column if not exists source_offer_id uuid references public.offers(id) on delete restrict;

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
    join pg_attribute referenced on referenced.attrelid=c.confrelid and referenced.attnum=c.confkey[1]
    where c.conrelid='public.order_requests'::regclass
      and c.confrelid='public.offers'::regclass
      and c.contype='f' and cardinality(c.conkey)=1 and cardinality(c.confkey)=1
      and a.attname='source_offer_id' and referenced.attname='id' and c.confdeltype='r'
  ) then
    if exists (select 1 from pg_constraint where conname='order_requests_source_offer_id_fkey' and conrelid='public.order_requests'::regclass) then
      raise exception 'Constraint order_requests_source_offer_id_fkey exists but is not the required offers foreign key.';
    end if;
    execute 'alter table public.order_requests add constraint order_requests_source_offer_id_fkey foreign key (source_offer_id) references public.offers(id) on delete restrict';
  end if;
end
$$;

create table if not exists public.offer_messages (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete set null,
  sender_type text not null check (sender_type in ('guest', 'member', 'admin', 'system')),
  message_type text not null,
  event_type text not null,
  amount numeric(10,2),
  message text,
  created_at timestamptz not null default now(),
  is_test boolean not null default false
);

alter table public.offer_messages
  add column if not exists is_test boolean not null default false;

create table if not exists public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  active boolean not null default true,
  starts_at timestamptz,
  expires_at timestamptz,
  total_usage_limit integer check (total_usage_limit is null or total_usage_limit > 0),
  per_customer_usage_limit integer check (per_customer_usage_limit is null or per_customer_usage_limit > 0),
  audience text not null default 'public' check (audience in ('public', 'member')),
  minimum_order_amount numeric(10,2) not null default 0 check (minimum_order_amount >= 0),
  product_restriction text,
  category_restriction text,
  allow_offer_stacking boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discount_percentage_max check (discount_type <> 'percentage' or discount_value <= 100),
  constraint discount_dates_valid check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create table if not exists public.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  discount_code_id uuid not null references public.discount_codes(id) on delete restrict,
  customer_id uuid references auth.users(id) on delete set null,
  guest_email text,
  order_request_id uuid references public.order_requests(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete cascade,
  original_amount numeric(10,2) not null,
  discount_amount numeric(10,2) not null,
  final_amount numeric(10,2) not null,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_request_id uuid not null references public.order_requests(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

-- Verify required columns and critical types before installing functions. This
-- raises an error instead of guessing how to rewrite an unexpected live schema.
do $$
declare required record; actual_type text;
begin
  for required in select * from (values
    ('admin_profiles','user_id','uuid'),('admin_profiles','created_at','timestamp with time zone'),('admin_profiles','test_mode_enabled','boolean'),('admin_profiles','test_customer_type','text'),
    ('site_edits','page_key','text'),('site_edits','edits','jsonb'),('site_edits','revision','bigint'),('site_edits','updated_by','uuid'),('site_edits','updated_at','timestamp with time zone'),
    ('offers','id','uuid'),('offers','product_name','text'),('offers','customer_id','uuid'),('offers','customer_name','text'),('offers','customer_email','text'),
    ('offers','amount','numeric'),('offers','message','text'),('offers','status','text'),('offers','seller_counter_amount','numeric'),('offers','seller_counter_message','text'),
    ('offers','buyer_final_amount','numeric'),('offers','buyer_final_message','text'),('offers','created_at','timestamp with time zone'),('offers','updated_at','timestamp with time zone'),
    ('offers','is_test','boolean'),('offers','payment_method','text'),('offers','payment_shipping_address','jsonb'),('offers','payment_customer_phone','text'),
    ('offers','payment_items','jsonb'),('offers','payment_notes','text'),('offers','payment_submitted_at','timestamp with time zone'),('offers','archived_at','timestamp with time zone'),
    ('order_requests','id','uuid'),('order_requests','customer_id','uuid'),('order_requests','customer_name','text'),('order_requests','customer_email','text'),
    ('order_requests','customer_phone','text'),('order_requests','shipping_address','jsonb'),('order_requests','items','jsonb'),('order_requests','payment_method','text'),
    ('order_requests','subtotal','numeric'),('order_requests','original_amount','numeric'),('order_requests','customer_fee','numeric'),('order_requests','applied_discount_code','text'),
    ('order_requests','discount_amount','numeric'),('order_requests','total','numeric'),('order_requests','status','text'),('order_requests','notes','text'),
    ('order_requests','created_at','timestamp with time zone'),('order_requests','updated_at','timestamp with time zone'),('order_requests','is_test','boolean'),
    ('order_requests','source_offer_id','uuid'),('order_requests','archived_at','timestamp with time zone'),
    ('offer_messages','id','uuid'),('offer_messages','offer_id','uuid'),('offer_messages','sender_user_id','uuid'),('offer_messages','sender_type','text'),
    ('offer_messages','message_type','text'),('offer_messages','event_type','text'),('offer_messages','amount','numeric'),('offer_messages','message','text'),
    ('offer_messages','created_at','timestamp with time zone'),('offer_messages','is_test','boolean'),
    ('order_events','id','uuid'),('order_events','order_request_id','uuid'),('order_events','event_type','text'),('order_events','actor_user_id','uuid'),
    ('order_events','is_test','boolean'),('order_events','created_at','timestamp with time zone'),
    ('discount_codes','id','uuid'),('discount_codes','code','text'),('discount_codes','description','text'),('discount_codes','discount_type','text'),
    ('discount_codes','discount_value','numeric'),('discount_codes','active','boolean'),('discount_codes','starts_at','timestamp with time zone'),
    ('discount_codes','expires_at','timestamp with time zone'),('discount_codes','total_usage_limit','integer'),('discount_codes','per_customer_usage_limit','integer'),
    ('discount_codes','audience','text'),('discount_codes','minimum_order_amount','numeric'),('discount_codes','product_restriction','text'),
    ('discount_codes','category_restriction','text'),('discount_codes','allow_offer_stacking','boolean'),('discount_codes','created_by','uuid'),
    ('discount_codes','created_at','timestamp with time zone'),('discount_codes','updated_at','timestamp with time zone'),
    ('discount_redemptions','id','uuid'),('discount_redemptions','discount_code_id','uuid'),('discount_redemptions','customer_id','uuid'),
    ('discount_redemptions','guest_email','text'),('discount_redemptions','order_request_id','uuid'),('discount_redemptions','offer_id','uuid'),
    ('discount_redemptions','original_amount','numeric'),('discount_redemptions','discount_amount','numeric'),('discount_redemptions','final_amount','numeric'),
    ('discount_redemptions','is_test','boolean'),('discount_redemptions','created_at','timestamp with time zone')
  ) as expected(table_name,column_name,data_type)
  loop
    select c.data_type into actual_type from information_schema.columns c
    where c.table_schema='public' and c.table_name=required.table_name and c.column_name=required.column_name;
    if actual_type is null then
      raise exception 'Required column %.% is missing; migration stopped without commit.',required.table_name,required.column_name;
    end if;
    if actual_type<>required.data_type then
      raise exception 'Required column %.% has type %, expected %; migration stopped without commit.',required.table_name,required.column_name,actual_type,required.data_type;
    end if;
  end loop;
end
$$;

-- Stop atomically if a pre-existing status CHECK would reject required values.
do $$
declare
  constraint_row record;
  required_status text;
begin
  for constraint_row in
    select c.conname, pg_get_constraintdef(c.oid) as definition
    from pg_constraint c
    where c.conrelid = 'public.offers'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
      and pg_get_constraintdef(c.oid) ilike '%any%array%'
  loop
    foreach required_status in array array[
      'pending','countered','buyer_countered','accepted','accepted_awaiting_payment',
      'payment_pending','payment_submitted','paid','completed','declined','archived'
    ] loop
      if position(quote_literal(required_status) in constraint_row.definition) = 0 then
        raise exception 'Existing offers status constraint % may reject required status %. Definition: %',
          constraint_row.conname, required_status, constraint_row.definition;
      end if;
    end loop;
  end loop;

  for constraint_row in
    select c.conname, pg_get_constraintdef(c.oid) as definition
    from pg_constraint c
    where c.conrelid = 'public.order_requests'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
      and pg_get_constraintdef(c.oid) ilike '%any%array%'
  loop
    foreach required_status in array array['new','payment_submitted','paid','in_production','shipped','completed','archived'] loop
      if position(quote_literal(required_status) in constraint_row.definition) = 0 then
        raise exception 'Existing order status constraint % may reject required status %. Definition: %',
          constraint_row.conname, required_status, constraint_row.definition;
      end if;
    end loop;
  end loop;
end
$$;

do $$
begin
  if exists (
    select 1 from pg_class i join pg_namespace n on n.oid=i.relnamespace
    where n.nspname='public' and i.relname='order_requests_source_offer_unique' and i.relkind='i'
  ) and not exists (
    select 1 from pg_index i
    join pg_class idx on idx.oid=i.indexrelid
    join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey)
    where idx.relnamespace='public'::regnamespace and idx.relname='order_requests_source_offer_unique'
      and i.indrelid='public.order_requests'::regclass and i.indisunique and i.indnkeyatts=1
      and a.attname='source_offer_id' and i.indexprs is null and i.indpred is not null
      and regexp_replace(lower(pg_get_expr(i.indpred,i.indrelid)),'[[:space:]()]','','g')='source_offer_idisnotnull'
  ) then
    raise exception 'Index order_requests_source_offer_unique exists but does not match the required partial unique source_offer_id index.';
  end if;
end
$$;

create unique index if not exists order_requests_source_offer_unique
  on public.order_requests (source_offer_id) where source_offer_id is not null;
create index if not exists offer_messages_offer_created_idx
  on public.offer_messages (offer_id, created_at);
create unique index if not exists discount_codes_upper_code_unique
  on public.discount_codes (upper(code));
create index if not exists discount_redemptions_code_idx
  on public.discount_redemptions (discount_code_id);
create index if not exists discount_redemptions_customer_idx
  on public.discount_redemptions (customer_id, discount_code_id);
create index if not exists discount_redemptions_guest_idx
  on public.discount_redemptions (lower(guest_email), discount_code_id);

-- --------------------------------------------------------------------------
-- 2. RLS helper and policies
-- --------------------------------------------------------------------------

alter table public.admin_profiles enable row level security;
alter table public.order_requests enable row level security;
alter table public.offers enable row level security;
alter table public.offer_messages enable row level security;
alter table public.discount_codes enable row level security;
alter table public.discount_redemptions enable row level security;
alter table public.order_events enable row level security;

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.admin_profiles where user_id = auth.uid());
$$;

-- Remove only known broad legacy policies. No table rows are affected.
drop policy if exists "Anyone can create offers" on public.offers;
drop policy if exists "Guests can create guest offers" on public.offers;
drop policy if exists "Members can create their own offers" on public.offers;
drop policy if exists "Customers can view their own offers" on public.offers;
drop policy if exists "Admins can view all offers" on public.offers;
drop policy if exists "Admins can update offers" on public.offers;
drop policy if exists "Admins can delete offers" on public.offers;
drop policy if exists "Admins can delete test offers" on public.offers;
drop policy if exists "Only test offers may be permanently deleted" on public.offers;
drop policy if exists "Customers can view their own order requests" on public.order_requests;
drop policy if exists "Admins can view all order requests" on public.order_requests;
drop policy if exists "Admins can update order requests" on public.order_requests;
drop policy if exists "Admins can delete order requests" on public.order_requests;
drop policy if exists "Admins can delete test order requests" on public.order_requests;
drop policy if exists "Only test orders may be permanently deleted" on public.order_requests;
drop policy if exists "Anyone can create order requests" on public.order_requests;
drop policy if exists "Admins can view their admin profile" on public.admin_profiles;
drop policy if exists "Members can view their own offer history" on public.offer_messages;
drop policy if exists "Admins can view all offer history" on public.offer_messages;
drop policy if exists "Admins manage discount codes" on public.discount_codes;
drop policy if exists "Members view their discount redemptions" on public.discount_redemptions;
drop policy if exists "Admins view all discount redemptions" on public.discount_redemptions;
drop policy if exists "Members view their order events" on public.order_events;
drop policy if exists "Admins view all order events" on public.order_events;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='admin_profiles' and policyname='Admins can view their admin profile') then
    create policy "Admins can view their admin profile" on public.admin_profiles for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='offers' and policyname='Guests can create guest offers') then
    create policy "Guests can create guest offers" on public.offers for insert to anon with check (
      customer_id is null and not is_test and status='pending' and amount>0 and nullif(trim(product_name),'') is not null
      and seller_counter_amount is null and seller_counter_message is null
      and buyer_final_amount is null and buyer_final_message is null
      and payment_method is null and payment_shipping_address is null and payment_customer_phone is null
      and payment_items is null and payment_notes is null and payment_submitted_at is null and archived_at is null
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='offers' and policyname='Members can create their own offers') then
    create policy "Members can create their own offers" on public.offers for insert to authenticated with check (
      customer_id=auth.uid() and not is_test and status='pending' and amount>0 and nullif(trim(product_name),'') is not null
      and seller_counter_amount is null and seller_counter_message is null
      and buyer_final_amount is null and buyer_final_message is null
      and payment_method is null and payment_shipping_address is null and payment_customer_phone is null
      and payment_items is null and payment_notes is null and payment_submitted_at is null and archived_at is null
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='offers' and policyname='Customers can view their own offers') then
    create policy "Customers can view their own offers" on public.offers for select using (auth.uid() = customer_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='offers' and policyname='Admins can view all offers') then
    create policy "Admins can view all offers" on public.offers for select using (public.is_current_user_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='order_requests' and policyname='Customers can view their own order requests') then
    create policy "Customers can view their own order requests" on public.order_requests for select using (auth.uid() = customer_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='order_requests' and policyname='Admins can view all order requests') then
    create policy "Admins can view all order requests" on public.order_requests for select using (public.is_current_user_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='order_requests' and policyname='Admins can update order requests') then
    create policy "Admins can update order requests" on public.order_requests for update using (public.is_current_user_admin()) with check (public.is_current_user_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='order_requests' and policyname='Admins can delete test order requests') then
    create policy "Admins can delete test order requests" on public.order_requests for delete
      using (is_test and exists (select 1 from public.admin_profiles where user_id=auth.uid() and test_mode_enabled));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='order_requests' and policyname='Only test orders may be permanently deleted') then
    create policy "Only test orders may be permanently deleted" on public.order_requests as restrictive for delete
      using (is_test and exists (select 1 from public.admin_profiles where user_id=auth.uid() and test_mode_enabled));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='offer_messages' and policyname='Members can view their own offer history') then
    create policy "Members can view their own offer history" on public.offer_messages for select
      using (exists (select 1 from public.offers where offers.id=offer_messages.offer_id and offers.customer_id=auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='offer_messages' and policyname='Admins can view all offer history') then
    create policy "Admins can view all offer history" on public.offer_messages for select using (public.is_current_user_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='discount_codes' and policyname='Admins manage discount codes') then
    create policy "Admins manage discount codes" on public.discount_codes for all using (public.is_current_user_admin()) with check (public.is_current_user_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='discount_redemptions' and policyname='Members view their discount redemptions') then
    create policy "Members view their discount redemptions" on public.discount_redemptions for select using (customer_id=auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='discount_redemptions' and policyname='Admins view all discount redemptions') then
    create policy "Admins view all discount redemptions" on public.discount_redemptions for select using (public.is_current_user_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='order_events' and policyname='Members view their order events') then
    create policy "Members view their order events" on public.order_events for select
      using (exists (select 1 from public.order_requests where order_requests.id=order_events.order_request_id and order_requests.customer_id=auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='order_events' and policyname='Admins view all order events') then
    create policy "Admins view all order events" on public.order_events for select using (public.is_current_user_admin());
  end if;
end
$$;

-- --------------------------------------------------------------------------
-- 3. Offer lifecycle triggers and history backfill
-- --------------------------------------------------------------------------

create or replace function public.set_offer_updated_at()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin new.updated_at=now(); return new; end;
$$;

create or replace function public.prevent_duplicate_active_member_offer()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare selected_size text; selected_design text; selected_background text;
begin
  if new.customer_id is null then return new; end if;
  selected_size := nullif(trim(split_part(split_part(coalesce(new.message,''), E'Selected size: ',2), E'\n',1)), '');
  selected_design := nullif(trim(split_part(split_part(coalesce(new.message,''), E'Design: ',2), E'\n',1)), '');
  selected_background := nullif(trim(split_part(split_part(coalesce(new.message,''), E'Background: ',2), E'\n',1)), '');
  perform pg_advisory_xact_lock(hashtextextended(new.customer_id::text||'|'||lower(new.product_name)||'|'||coalesce(selected_size,'')||'|'||coalesce(selected_design,'')||'|'||coalesce(selected_background,''),0));
  if exists (
    select 1 from public.offers existing
    where existing.customer_id=new.customer_id and lower(existing.product_name)=lower(new.product_name)
      and nullif(trim(split_part(split_part(coalesce(existing.message,''), E'Selected size: ',2), E'\n',1)),'') is not distinct from selected_size
      and (nullif(trim(split_part(split_part(coalesce(existing.message,''), E'Design: ',2), E'\n',1)),'') is null
        or nullif(trim(split_part(split_part(coalesce(existing.message,''), E'Design: ',2), E'\n',1)),'') is not distinct from selected_design)
      and (nullif(trim(split_part(split_part(coalesce(existing.message,''), E'Background: ',2), E'\n',1)),'') is null
        or nullif(trim(split_part(split_part(coalesce(existing.message,''), E'Background: ',2), E'\n',1)),'') is not distinct from selected_background)
      and existing.status in ('pending','countered','buyer_countered','accepted','accepted_awaiting_payment','payment_pending','payment_submitted')
  ) then raise exception 'An active offer already exists for this product and size.'; end if;
  return new;
end;
$$;

create or replace function public.record_new_offer_history()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare customer_comment text;
begin
  insert into public.offer_messages(offer_id,sender_user_id,sender_type,message_type,event_type,amount,message,is_test)
  values(new.id,new.customer_id,case when new.customer_id is null then 'guest' else 'member' end,'customer_offer','customer_offer',new.amount,null,new.is_test);
  customer_comment := nullif(trim(split_part(coalesce(new.message,''), E'Message: ',2)), '');
  if customer_comment is not null then
    insert into public.offer_messages(offer_id,sender_user_id,sender_type,message_type,event_type,message,is_test)
    values(new.id,new.customer_id,case when new.customer_id is null then 'guest' else 'member' end,'customer_comment','customer_comment',customer_comment,new.is_test);
  end if;
  return new;
end;
$$;

create or replace function public.record_offer_update_history()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare actor_type text; history_type text; history_amount numeric(10,2); history_message text;
begin
  actor_type := case when public.is_current_user_admin() then 'admin' when auth.uid()=new.customer_id then 'member' else 'system' end;
  if new.status='countered' and (old.status is distinct from new.status or old.seller_counter_amount is distinct from new.seller_counter_amount or old.seller_counter_message is distinct from new.seller_counter_message) then
    history_type:='admin_counteroffer'; history_amount:=new.seller_counter_amount; history_message:=new.seller_counter_message;
  elsif new.status='buyer_countered' and old.status is distinct from new.status then
    history_type:='member_counteroffer'; history_amount:=new.buyer_final_amount; history_message:=new.buyer_final_message;
  elsif new.status in ('accepted','accepted_awaiting_payment','declined','payment_pending','payment_submitted','paid','archived') and old.status is distinct from new.status then
    history_type:=new.status;
    history_amount:=case when new.status in ('accepted','accepted_awaiting_payment','payment_submitted','paid') then coalesce(new.buyer_final_amount,new.seller_counter_amount,new.amount) end;
  end if;
  if history_type is not null then
    insert into public.offer_messages(offer_id,sender_user_id,sender_type,message_type,event_type,amount,message,is_test)
    values(new.id,auth.uid(),actor_type,history_type,history_type,history_amount,history_message,new.is_test);
  end if;
  return new;
end;
$$;

drop trigger if exists set_offer_updated_at on public.offers;
create trigger set_offer_updated_at before update on public.offers for each row execute function public.set_offer_updated_at();
drop trigger if exists prevent_duplicate_active_member_offer on public.offers;
create trigger prevent_duplicate_active_member_offer before insert on public.offers for each row execute function public.prevent_duplicate_active_member_offer();
drop trigger if exists record_new_offer_history on public.offers;
create trigger record_new_offer_history after insert on public.offers for each row execute function public.record_new_offer_history();
drop trigger if exists record_offer_update_history on public.offers;
create trigger record_offer_update_history after update on public.offers for each row execute function public.record_offer_update_history();

insert into public.offer_messages(offer_id,sender_user_id,sender_type,message_type,event_type,amount,created_at,is_test)
select o.id,o.customer_id,case when o.customer_id is null then 'guest' else 'member' end,'customer_offer','customer_offer',o.amount,o.created_at,o.is_test
from public.offers o
where not exists (select 1 from public.offer_messages m where m.offer_id=o.id and m.event_type='customer_offer');

insert into public.offer_messages(offer_id,sender_user_id,sender_type,message_type,event_type,message,created_at,is_test)
select o.id,o.customer_id,case when o.customer_id is null then 'guest' else 'member' end,'customer_comment','customer_comment',
  nullif(trim(split_part(coalesce(o.message,''), E'Message: ',2)),''),o.created_at,o.is_test
from public.offers o
where nullif(trim(split_part(coalesce(o.message,''), E'Message: ',2)),'') is not null
  and not exists (select 1 from public.offer_messages m where m.offer_id=o.id and m.event_type='customer_comment');

-- --------------------------------------------------------------------------
-- 4. Older member, order, discount, and Test Mode RPC prerequisites
-- --------------------------------------------------------------------------

create or replace function public.save_site_edits(p_page_key text,p_edits jsonb,p_expected_revision bigint,p_replace boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_row public.site_edits;
begin
  if not public.is_current_user_admin() then raise exception 'Admin access is required.'; end if;
  if nullif(trim(coalesce(p_page_key,'')),'') is null or p_edits is null or jsonb_typeof(p_edits)<>'object' then raise exception 'A page key and JSON object are required.'; end if;
  select * into current_row from public.site_edits where page_key=p_page_key for update;
  if current_row.page_key is null then
    if coalesce(p_expected_revision,0)<>0 then raise exception using errcode='40001',message='Admin state changed. Reload before saving again.'; end if;
    insert into public.site_edits(page_key,edits,revision,updated_by,updated_at) values(p_page_key,p_edits,1,auth.uid(),now()) returning * into current_row;
  else
    if current_row.revision<>coalesce(p_expected_revision,-1) then raise exception using errcode='40001',message='Admin state changed. Reload before saving again.'; end if;
    update public.site_edits set edits=case when p_replace then p_edits else current_row.edits||p_edits end,revision=current_row.revision+1,updated_by=auth.uid(),updated_at=now() where page_key=p_page_key returning * into current_row;
  end if;
  return jsonb_build_object('page_key',current_row.page_key,'edits',current_row.edits,'revision',current_row.revision,'updated_at',current_row.updated_at);
end;
$$;

create or replace function public.respond_to_member_offer(p_offer_id uuid,p_action text,p_amount numeric default null,p_message text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_offer public.offers; admin_access boolean;
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  admin_access:=public.is_current_user_admin();
  select * into current_offer from public.offers where id=p_offer_id for update;
  if current_offer.id is null then raise exception 'Offer not found.'; end if;
  if admin_access then
    if p_action in ('accept','decline') and current_offer.status not in ('pending','buyer_countered') then raise exception 'This offer is not awaiting an Admin decision.'; end if;
    if p_action='accept' then update public.offers set status='accepted_awaiting_payment' where id=p_offer_id returning * into current_offer;
    elsif p_action='decline' then update public.offers set status='declined' where id=p_offer_id returning * into current_offer;
    elsif p_action='counter' then
      if current_offer.status<>'pending' then raise exception 'Only a pending offer can receive an Admin counteroffer.'; end if;
      if current_offer.customer_id is null then raise exception 'Only a signed-in member offer can receive a counteroffer.'; end if;
      if p_amount is null or p_amount<=0 then raise exception 'Enter a valid counteroffer amount.'; end if;
      update public.offers set status='countered',seller_counter_amount=round(p_amount,2),seller_counter_message=nullif(trim(coalesce(p_message,'')),'') where id=p_offer_id returning * into current_offer;
    elsif p_action='archive' then
      if current_offer.status not in ('paid','completed','declined') then raise exception 'Only a completed or declined offer can be archived.'; end if;
      update public.offers set status='archived',archived_at=now() where id=p_offer_id returning * into current_offer;
    else raise exception 'Unsupported Admin offer response.'; end if;
    return to_jsonb(current_offer);
  end if;
  if current_offer.customer_id is distinct from auth.uid() then raise exception 'Offer not found.'; end if;
  if current_offer.status<>'countered' then raise exception 'This offer is not awaiting a member response.'; end if;
  if p_action='accept' then
    update public.offers set status='accepted_awaiting_payment',buyer_final_amount=current_offer.seller_counter_amount,buyer_final_message='Accepted admin counteroffer' where id=p_offer_id returning * into current_offer;
  elsif p_action='decline' then
    update public.offers set status='declined' where id=p_offer_id returning * into current_offer;
  elsif p_action='counter' then
    if p_amount is null or p_amount<=0 then raise exception 'Enter a valid counteroffer amount.'; end if;
    update public.offers set status='buyer_countered',buyer_final_amount=round(p_amount,2),buyer_final_message=nullif(trim(coalesce(p_message,'')),'') where id=p_offer_id returning * into current_offer;
  else raise exception 'Unsupported offer response.'; end if;
  return to_jsonb(current_offer);
end;
$$;

create or replace function public.delete_test_offer(p_offer_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare selected public.offers; deleted_offers integer:=0; deleted_orders integer:=0;
begin
  if not public.is_current_user_admin() then raise exception 'Admin access is required.'; end if;
  select * into selected from public.offers where id=p_offer_id for update;
  if selected.id is null then raise exception 'Test offer not found.'; end if;
  if not selected.is_test then raise exception 'Real offers cannot be permanently deleted.'; end if;
  if exists(select 1 from public.order_requests where source_offer_id=p_offer_id and not is_test) then raise exception 'A real order is linked to this offer and was preserved.'; end if;
  delete from public.order_requests where source_offer_id=p_offer_id and is_test;
  get diagnostics deleted_orders=row_count;
  delete from public.offers where id=p_offer_id and is_test;
  get diagnostics deleted_offers=row_count;
  return jsonb_build_object('deleted_offers',deleted_offers,'deleted_orders',deleted_orders);
end;
$$;

create or replace function public.delete_all_test_offers()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare deleted_offers integer:=0; deleted_orders integer:=0;
begin
  if not public.is_current_user_admin() then raise exception 'Admin access is required.'; end if;
  perform 1 from public.offers where is_test for update;
  if exists(select 1 from public.order_requests orders join public.offers offers on offers.id=orders.source_offer_id where offers.is_test and not orders.is_test) then raise exception 'A real order is linked to a test offer. No test offers were deleted.'; end if;
  delete from public.order_requests where is_test and source_offer_id in(select id from public.offers where is_test);
  get diagnostics deleted_orders=row_count;
  delete from public.offers where is_test;
  get diagnostics deleted_offers=row_count;
  return jsonb_build_object('deleted_offers',deleted_offers,'deleted_orders',deleted_orders);
end;
$$;

create or replace function public.get_admin_test_mode()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare profile public.admin_profiles;
begin
  select * into profile from public.admin_profiles where user_id=auth.uid();
  if profile.user_id is null then return jsonb_build_object('enabled',false,'customer_type','guest'); end if;
  return jsonb_build_object('enabled',profile.test_mode_enabled,'customer_type',profile.test_customer_type);
end;
$$;

create or replace function public.set_admin_test_mode(p_enabled boolean,p_customer_type text default 'guest')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare profile public.admin_profiles;
begin
  if p_customer_type not in ('guest','member') then raise exception 'Unsupported test customer type.'; end if;
  update public.admin_profiles set test_mode_enabled=coalesce(p_enabled,false),test_customer_type=p_customer_type where user_id=auth.uid() returning * into profile;
  if profile.user_id is null then raise exception 'Admin access is required.'; end if;
  return jsonb_build_object('enabled',profile.test_mode_enabled,'customer_type',profile.test_customer_type);
end;
$$;

create or replace function public.submit_test_offer(p_product_name text,p_customer_name text,p_customer_email text,p_amount numeric,p_message text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare profile public.admin_profiles; new_offer public.offers;
begin
  select * into profile from public.admin_profiles where user_id=auth.uid() and test_mode_enabled for update;
  if profile.user_id is null then raise exception 'Admin Test Mode is not enabled.'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'Enter a valid offer amount.'; end if;
  insert into public.offers(product_name,customer_id,customer_name,customer_email,amount,message,status,is_test)
  values(p_product_name,case when profile.test_customer_type='member' then auth.uid() end,nullif(trim(p_customer_name),''),nullif(trim(p_customer_email),''),round(p_amount,2),p_message,'pending',true)
  returning * into new_offer;
  return to_jsonb(new_offer);
end;
$$;

create or replace function public.update_test_order_status(p_order_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare updated public.order_requests;
begin
  if not public.is_current_user_admin() then raise exception 'Admin access is required.'; end if;
  if p_status not in ('payment_submitted','paid') then raise exception 'Unsupported test order status.'; end if;
  update public.order_requests set status=p_status,updated_at=now() where id=p_order_id and is_test returning * into updated;
  if updated.id is null then raise exception 'Test order not found.'; end if;
  insert into public.order_events(order_request_id,event_type,actor_user_id,is_test) values(updated.id,p_status,auth.uid(),true);
  return to_jsonb(updated);
end;
$$;

create or replace function public.record_test_order_event(p_order_id uuid,p_event_type text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare selected public.order_requests;
begin
  if not public.is_current_user_admin() then raise exception 'Admin access is required.'; end if;
  if p_event_type not in ('continue_to_payment','payment_instructions_opened') then raise exception 'Unsupported test event.'; end if;
  select * into selected from public.order_requests where id=p_order_id and is_test;
  if selected.id is null then raise exception 'Test order not found.'; end if;
  insert into public.order_events(order_request_id,event_type,actor_user_id,is_test) values(selected.id,p_event_type,auth.uid(),true);
  return jsonb_build_object('recorded',true,'event_type',p_event_type);
end;
$$;

-- Discount validation remains a prerequisite of the secure order RPC. Coupons
-- are not created or changed by this migration.
create or replace function public.validate_discount_code(p_code text,p_original_amount numeric,p_customer_email text default null,p_product_names text[] default array[]::text[],p_categories text[] default array[]::text[],p_is_negotiated_offer boolean default false)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare selected public.discount_codes; total_uses integer; customer_uses integer; discount numeric(10,2); effective_member boolean; admin_test_guest boolean;
begin
  if nullif(trim(coalesce(p_code,'')),'') is null then return jsonb_build_object('valid',false,'message','Enter a discount code.'); end if;
  select * into selected from public.discount_codes where upper(code)=upper(trim(p_code));
  if selected.id is null then return jsonb_build_object('valid',false,'message','Discount code not found.'); end if;
  if not selected.active then return jsonb_build_object('valid',false,'message','This discount code is inactive.'); end if;
  if selected.starts_at is not null and now()<selected.starts_at then return jsonb_build_object('valid',false,'message','This discount code has not started yet.'); end if;
  if selected.expires_at is not null and now()>=selected.expires_at then return jsonb_build_object('valid',false,'message','This discount code has expired.'); end if;
  if coalesce(p_original_amount,0)<selected.minimum_order_amount then return jsonb_build_object('valid',false,'message',format('Minimum order amount is $%s.',selected.minimum_order_amount)); end if;
  select exists(select 1 from public.admin_profiles where user_id=auth.uid() and test_mode_enabled and test_customer_type='guest') into admin_test_guest;
  effective_member:=auth.uid() is not null and not admin_test_guest;
  if selected.audience='member' and not effective_member then return jsonb_build_object('valid',false,'message','This discount is for signed-in members only.'); end if;
  if p_is_negotiated_offer and not selected.allow_offer_stacking then return jsonb_build_object('valid',false,'message','Discount codes cannot be combined with this negotiated offer.'); end if;
  if selected.product_restriction is not null and not exists(
    select 1 from unnest(coalesce(p_product_names,array[]::text[])) value
    where lower(value) in (lower(selected.product_restriction),lower(selected.product_restriction||' - Accepted Offer'))
  ) then return jsonb_build_object('valid',false,'message','This code does not apply to the selected product.'); end if;
  if selected.category_restriction is not null and not exists(
    select 1 from unnest(coalesce(p_categories,array[]::text[])) value
    where lower(value)=lower(selected.category_restriction)
  ) then return jsonb_build_object('valid',false,'message','This code does not apply to the selected category.'); end if;
  select count(*) into total_uses from public.discount_redemptions where discount_code_id=selected.id and not is_test;
  if selected.total_usage_limit is not null and total_uses>=selected.total_usage_limit then return jsonb_build_object('valid',false,'message','This discount code has reached its usage limit.'); end if;
  if effective_member then select count(*) into customer_uses from public.discount_redemptions where discount_code_id=selected.id and customer_id=auth.uid() and not is_test;
  else select count(*) into customer_uses from public.discount_redemptions where discount_code_id=selected.id and lower(guest_email)=lower(trim(coalesce(p_customer_email,''))) and not is_test; end if;
  if selected.per_customer_usage_limit is not null and customer_uses>=selected.per_customer_usage_limit then return jsonb_build_object('valid',false,'message','You have already used this discount the maximum number of times.'); end if;
  discount:=case selected.discount_type when 'percentage' then round(coalesce(p_original_amount,0)*selected.discount_value/100,2) else selected.discount_value end;
  discount:=least(greatest(discount,0),greatest(coalesce(p_original_amount,0),0));
  return jsonb_build_object('valid',true,'code',selected.code,'discount_type',selected.discount_type,'discount_value',selected.discount_value,'discount_amount',discount,'original_amount',greatest(coalesce(p_original_amount,0),0),'final_amount',greatest(coalesce(p_original_amount,0)-discount,0),'message','Discount code applied.');
end;
$$;

create or replace function public.submit_order_request(p_customer_name text,p_customer_email text,p_customer_phone text,p_shipping_address jsonb,p_items jsonb,p_payment_method text,p_original_amount numeric,p_notes text,p_discount_code text default null,p_is_negotiated_offer boolean default false,p_is_test boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare selected public.discount_codes; validation jsonb; new_order public.order_requests; effective_customer_id uuid; test_profile public.admin_profiles; product_names text[]; categories text[]; discount numeric(10,2):=0; final_amount numeric(10,2); items_amount numeric(10,2):=0; item_value jsonb; selected_height numeric; submitted_price numeric; expected_price numeric; price_settings jsonb; two_foot_price numeric; three_foot_price numeric; full_height numeric; full_price numeric; extra_inch_price numeric;
begin
  if coalesce(p_original_amount,0)<0 then raise exception 'Original amount cannot be negative.'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'At least one order item is required.'; end if;
  if p_is_test then
    select * into test_profile from public.admin_profiles where user_id=auth.uid() and test_mode_enabled for update;
    if test_profile.user_id is null then raise exception 'Admin Test Mode is not enabled.'; end if;
    effective_customer_id:=case when test_profile.test_customer_type='member' then auth.uid() end;
  else effective_customer_id:=auth.uid(); end if;
  select edits#>'{lastPublishedSnapshot,priceSettings}' into price_settings from public.site_edits where page_key='admin-global';
  two_foot_price:=coalesce(nullif((price_settings->>'twoFootPrice')::numeric,0),35.00);
  three_foot_price:=coalesce(nullif((price_settings->>'threeFootPrice')::numeric,0),50.00);
  full_height:=coalesce(nullif((price_settings->>'fullHeight')::numeric,0),78);
  full_price:=coalesce(nullif((price_settings->>'fullPrice')::numeric,0),129.99);
  extra_inch_price:=coalesce(nullif((price_settings->>'extraInchPrice')::numeric,0),2.00);
  for item_value in select value from jsonb_array_elements(p_items) entries(value) loop
    if jsonb_typeof(item_value)<>'object' then raise exception 'Every order item must be an object.'; end if;
    selected_height:=(item_value->>'selected_height')::numeric;
    submitted_price:=(item_value->>'price')::numeric;
    if selected_height<24 or selected_height>120 then raise exception 'Order item height must be between 24 and 120 inches.'; end if;
    if coalesce((item_value->>'finish_extra')::numeric,0)<>0 then raise exception 'Unsupported finish price.'; end if;
    expected_price:=case when selected_height<=36 then two_foot_price+((selected_height-24)*((three_foot_price-two_foot_price)/12)) when selected_height<=full_height then three_foot_price+((selected_height-36)*((full_price-three_foot_price)/greatest(1,full_height-36))) else full_price+((selected_height-full_height)*extra_inch_price) end;
    expected_price:=round(expected_price,2);
    if round(submitted_price,2)<>expected_price then raise exception 'Order item price does not match the published server price.'; end if;
    items_amount:=items_amount+expected_price;
  end loop;
  select coalesce(array_agg(value->>'name'),array[]::text[]),coalesce(array_agg(value->>'category') filter(where nullif(value->>'category','') is not null),array[]::text[])
  into product_names,categories from jsonb_array_elements(p_items) item(value);
  if round(items_amount,2)<>round(p_original_amount,2) then raise exception 'Order subtotal does not match the submitted items.'; end if;
  if nullif(trim(coalesce(p_discount_code,'')),'') is not null then
    select * into selected from public.discount_codes where upper(code)=upper(trim(p_discount_code)) for update;
    if selected.id is null then raise exception 'Discount code not found.'; end if;
    validation:=public.validate_discount_code(selected.code,p_original_amount,p_customer_email,product_names,categories,p_is_negotiated_offer);
    if not coalesce((validation->>'valid')::boolean,false) then raise exception '%',validation->>'message'; end if;
    discount:=(validation->>'discount_amount')::numeric;
  end if;
  final_amount:=greatest(round(coalesce(p_original_amount,0)-discount,2),0);
  insert into public.order_requests(customer_id,customer_name,customer_email,customer_phone,shipping_address,items,payment_method,subtotal,original_amount,customer_fee,applied_discount_code,discount_amount,total,status,notes,is_test)
  values(effective_customer_id,nullif(trim(p_customer_name),''),nullif(trim(p_customer_email),''),nullif(trim(coalesce(p_customer_phone,'')),''),coalesce(p_shipping_address,'{}'::jsonb),p_items,case when p_is_test then 'TEST - no real payment' else p_payment_method end,p_original_amount,p_original_amount,0,selected.code,discount,final_amount,'new',p_notes,p_is_test)
  returning * into new_order;
  insert into public.order_events(order_request_id,event_type,actor_user_id,is_test) values(new_order.id,'order_submitted',auth.uid(),p_is_test);
  if selected.id is not null then
    insert into public.discount_redemptions(discount_code_id,customer_id,guest_email,order_request_id,original_amount,discount_amount,final_amount,is_test)
    values(selected.id,effective_customer_id,case when effective_customer_id is null then lower(trim(p_customer_email)) end,new_order.id,p_original_amount,discount,final_amount,p_is_test);
  end if;
  return jsonb_build_object('order_id',new_order.id,'discount_code',new_order.applied_discount_code,'discount_amount',new_order.discount_amount,'original_amount',new_order.original_amount,'final_amount',new_order.total,'is_test',new_order.is_test);
end;
$$;

create or replace function public.list_eligible_discounts()
returns table(code text,description text,discount_type text,discount_value numeric,minimum_order_amount numeric,expires_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select dc.code,dc.description,dc.discount_type,dc.discount_value,dc.minimum_order_amount,dc.expires_at
  from public.discount_codes dc
  where auth.uid() is not null and dc.active and dc.audience in ('public','member')
    and (dc.starts_at is null or dc.starts_at<=now()) and (dc.expires_at is null or dc.expires_at>now())
    and (dc.total_usage_limit is null or dc.total_usage_limit>(select count(*) from public.discount_redemptions dr where dr.discount_code_id=dc.id and not dr.is_test))
    and (dc.per_customer_usage_limit is null or dc.per_customer_usage_limit>(select count(*) from public.discount_redemptions dr where dr.discount_code_id=dc.id and dr.customer_id=auth.uid() and not dr.is_test))
  order by dc.created_at desc;
$$;

-- --------------------------------------------------------------------------
-- 5. a72509b accepted-offer payment and order/archive RPCs
-- --------------------------------------------------------------------------

create or replace function public.prepare_offer_payment(p_offer_id uuid,p_customer_name text,p_customer_email text,p_customer_phone text,p_shipping_address jsonb,p_items jsonb,p_payment_method text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_offer public.offers; accepted_amount numeric(10,2); item_amount numeric(10,2); admin_access boolean;
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  select * into current_offer from public.offers where id=p_offer_id for update;
  admin_access:=public.is_current_user_admin();
  if current_offer.id is null or not(current_offer.customer_id=auth.uid() or(current_offer.is_test and admin_access)) then raise exception 'Accepted offer not found.'; end if;
  if current_offer.status not in ('accepted','accepted_awaiting_payment') then raise exception 'This offer is not awaiting payment.'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'Payment details require an order item.'; end if;
  select coalesce(sum((item->>'price')::numeric),0) into item_amount from jsonb_array_elements(p_items) selected(item);
  accepted_amount:=round(coalesce(current_offer.buyer_final_amount,current_offer.seller_counter_amount,current_offer.amount),2);
  if round(item_amount,2)<>accepted_amount then raise exception 'Payment amount does not match the accepted offer.'; end if;
  update public.offers set status='accepted_awaiting_payment',customer_name=coalesce(nullif(trim(p_customer_name),''),customer_name),customer_email=coalesce(nullif(trim(p_customer_email),''),customer_email),payment_customer_phone=nullif(trim(coalesce(p_customer_phone,'')),''),payment_shipping_address=coalesce(p_shipping_address,'{}'::jsonb),payment_items=p_items,payment_method=case when current_offer.is_test then 'TEST - no real payment' else nullif(trim(p_payment_method),'') end,payment_notes=nullif(trim(coalesce(p_notes,'')),'') where id=p_offer_id returning * into current_offer;
  return jsonb_build_object('offer_id',current_offer.id,'original_amount',accepted_amount,'final_amount',accepted_amount,'is_test',current_offer.is_test);
end;
$$;

create or replace function public.submit_offer_payment(p_offer_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_offer public.offers;
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  select * into current_offer from public.offers where id=p_offer_id for update;
  if current_offer.id is null or not(current_offer.customer_id=auth.uid() or(current_offer.is_test and public.is_current_user_admin())) then raise exception 'Accepted offer not found.'; end if;
  if current_offer.status not in ('accepted','accepted_awaiting_payment') then raise exception 'This offer is not ready for payment submission.'; end if;
  if current_offer.payment_method is null or current_offer.payment_items is null then raise exception 'Complete the payment details first.'; end if;
  update public.offers set status='payment_submitted',payment_submitted_at=now() where id=p_offer_id returning * into current_offer;
  return to_jsonb(current_offer);
end;
$$;

create or replace function public.confirm_offer_payment(p_offer_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_offer public.offers; related_order public.order_requests; accepted_amount numeric(10,2); created_order boolean:=false;
begin
  if not public.is_current_user_admin() then raise exception 'Admin access is required.'; end if;
  select * into current_offer from public.offers where id=p_offer_id for update;
  if current_offer.id is null then raise exception 'Offer not found.'; end if;
  select * into related_order from public.order_requests where source_offer_id=p_offer_id;
  if current_offer.status='paid' and related_order.id is not null then return jsonb_build_object('offer_id',current_offer.id,'order_id',related_order.id,'created',false,'already_confirmed',true); end if;
  if current_offer.status<>'payment_submitted' then raise exception 'Payment has not been submitted for this offer.'; end if;
  if current_offer.payment_items is null or current_offer.payment_method is null then raise exception 'Payment details are incomplete.'; end if;
  accepted_amount:=round(coalesce(current_offer.buyer_final_amount,current_offer.seller_counter_amount,current_offer.amount),2);
  insert into public.order_requests(source_offer_id,customer_id,customer_name,customer_email,customer_phone,shipping_address,items,payment_method,subtotal,original_amount,customer_fee,discount_amount,total,status,notes,is_test)
  values(current_offer.id,current_offer.customer_id,current_offer.customer_name,current_offer.customer_email,current_offer.payment_customer_phone,coalesce(current_offer.payment_shipping_address,'{}'::jsonb),current_offer.payment_items,current_offer.payment_method,accepted_amount,accepted_amount,0,0,accepted_amount,'new',current_offer.payment_notes,current_offer.is_test)
  on conflict (source_offer_id) where source_offer_id is not null do nothing returning * into related_order;
  if related_order.id is null then select * into related_order from public.order_requests where source_offer_id=p_offer_id; else created_order:=true; insert into public.order_events(order_request_id,event_type,actor_user_id,is_test) values(related_order.id,'payment_confirmed_order_created',auth.uid(),current_offer.is_test); end if;
  if related_order.id is null then raise exception 'Could not create the related order.'; end if;
  update public.offers set status='paid' where id=p_offer_id returning * into current_offer;
  return jsonb_build_object('offer_id',current_offer.id,'order_id',related_order.id,'created',created_order,'already_confirmed',false);
end;
$$;

create or replace function public.admin_update_order_status(p_order_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare updated public.order_requests;
begin
  if not public.is_current_user_admin() then raise exception 'Admin access is required.'; end if;
  if p_status not in ('new','in_production','shipped','completed','archived') then raise exception 'Unsupported order status.'; end if;
  update public.order_requests set status=p_status,updated_at=now(),archived_at=case when p_status='archived' then now() else archived_at end where id=p_order_id returning * into updated;
  if updated.id is null then raise exception 'Order not found.'; end if;
  insert into public.order_events(order_request_id,event_type,actor_user_id,is_test) values(updated.id,p_status,auth.uid(),updated.is_test);
  return to_jsonb(updated);
end;
$$;

-- --------------------------------------------------------------------------
-- 6. Function and table privileges
-- --------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
revoke select on public.site_edits from anon;
grant select,insert,update,delete on public.site_edits to authenticated;
revoke insert,delete on public.order_requests from anon,authenticated;
revoke update,delete on public.offers from anon,authenticated;
grant insert on public.offers to anon, authenticated;
grant select on public.offers,public.order_requests,public.admin_profiles,public.offer_messages to authenticated;
grant update,delete on public.order_requests to authenticated;
grant select,insert,update on public.discount_codes to authenticated;
grant select on public.discount_redemptions,public.order_events to authenticated;

revoke all on function public.is_current_user_admin() from public;
revoke all on function public.set_offer_updated_at() from public;
revoke all on function public.prevent_duplicate_active_member_offer() from public;
revoke all on function public.record_new_offer_history() from public;
revoke all on function public.record_offer_update_history() from public;
revoke all on function public.get_admin_test_mode() from public;
revoke all on function public.save_site_edits(text,jsonb,bigint,boolean) from public;
revoke all on function public.set_admin_test_mode(boolean,text) from public;
revoke all on function public.respond_to_member_offer(uuid,text,numeric,text) from public;
revoke all on function public.delete_test_offer(uuid) from public;
revoke all on function public.delete_all_test_offers() from public;
revoke all on function public.submit_test_offer(text,text,text,numeric,text) from public;
revoke all on function public.update_test_order_status(uuid,text) from public;
revoke all on function public.record_test_order_event(uuid,text) from public;
revoke all on function public.validate_discount_code(text,numeric,text,text[],text[],boolean) from public;
revoke all on function public.submit_order_request(text,text,text,jsonb,jsonb,text,numeric,text,text,boolean,boolean) from public;
revoke all on function public.list_eligible_discounts() from public;
revoke all on function public.prepare_offer_payment(uuid,text,text,text,jsonb,jsonb,text,text) from public;
revoke all on function public.submit_offer_payment(uuid) from public;
revoke all on function public.confirm_offer_payment(uuid) from public;
revoke all on function public.admin_update_order_status(uuid,text) from public;

grant execute on function public.get_admin_test_mode() to authenticated;
grant execute on function public.save_site_edits(text,jsonb,bigint,boolean) to authenticated;
grant execute on function public.is_current_user_admin() to authenticated;
grant execute on function public.set_admin_test_mode(boolean,text) to authenticated;
grant execute on function public.respond_to_member_offer(uuid,text,numeric,text) to authenticated;
grant execute on function public.delete_test_offer(uuid) to authenticated;
grant execute on function public.delete_all_test_offers() to authenticated;
grant execute on function public.submit_test_offer(text,text,text,numeric,text) to authenticated;
grant execute on function public.update_test_order_status(uuid,text) to authenticated;
grant execute on function public.record_test_order_event(uuid,text) to authenticated;
grant execute on function public.validate_discount_code(text,numeric,text,text[],text[],boolean) to anon,authenticated;
grant execute on function public.submit_order_request(text,text,text,jsonb,jsonb,text,numeric,text,text,boolean,boolean) to anon,authenticated;
grant execute on function public.list_eligible_discounts() to authenticated;
grant execute on function public.prepare_offer_payment(uuid,text,text,text,jsonb,jsonb,text,text) to authenticated;
grant execute on function public.submit_offer_payment(uuid) to authenticated;
grant execute on function public.confirm_offer_payment(uuid) to authenticated;
grant execute on function public.admin_update_order_status(uuid,text) to authenticated;

commit;
