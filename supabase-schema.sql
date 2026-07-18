-- MVPLUXCREATIONS starter backend schema
-- Paste this into Supabase SQL Editor after reviewing it.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  screen_name text,
  email text,
  role text not null default 'customer',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles can read their own profile"
on public.profiles for select
using (auth.uid() = id);

create policy "Profiles can update their own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, screen_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'screen_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do update
    set screen_name = excluded.screen_name,
        email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

create policy "Anyone can view categories"
on public.categories for select
using (true);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  original_height_inches int,
  base_price numeric(10,2) not null default 129.99,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "Anyone can view active products"
on public.products for select
using (is_active = true);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  label text not null default 'No Background',
  image_url text not null,
  is_default boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.product_images enable row level security;

create policy "Anyone can view product images"
on public.product_images for select
using (true);

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

alter table public.order_requests add column if not exists original_amount numeric(10,2);
alter table public.order_requests add column if not exists applied_discount_code text;
alter table public.order_requests add column if not exists discount_amount numeric(10,2) not null default 0;
alter table public.order_requests add column if not exists is_test boolean not null default false;
alter table public.order_requests add column if not exists updated_at timestamptz not null default now();
alter table public.order_requests add column if not exists archived_at timestamptz;

alter table public.order_requests enable row level security;

create policy "Anyone can create order requests"
on public.order_requests for insert
with check (true);

create policy "Customers can view their own order requests"
on public.order_requests for select
using (auth.uid() = customer_id);

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

alter table public.offers add column if not exists updated_at timestamptz not null default now();
alter table public.offers add column if not exists is_test boolean not null default false;
alter table public.offers add column if not exists payment_method text;
alter table public.offers add column if not exists payment_shipping_address jsonb;
alter table public.offers add column if not exists payment_customer_phone text;
alter table public.offers add column if not exists payment_items jsonb;
alter table public.offers add column if not exists payment_notes text;
alter table public.offers add column if not exists payment_submitted_at timestamptz;
alter table public.offers add column if not exists archived_at timestamptz;
alter table public.order_requests add column if not exists source_offer_id uuid references public.offers(id) on delete restrict;
create unique index if not exists order_requests_source_offer_unique
on public.order_requests (source_offer_id) where source_offer_id is not null;

alter table public.offers enable row level security;

drop policy if exists "Anyone can create offers" on public.offers;
drop policy if exists "Guests can create guest offers" on public.offers;
create policy "Guests can create guest offers"
on public.offers for insert
to anon
with check (customer_id is null);

drop policy if exists "Members can create their own offers" on public.offers;
create policy "Members can create their own offers"
on public.offers for insert
to authenticated
with check (customer_id = auth.uid());

create policy "Customers can view their own offers"
on public.offers for select
using (auth.uid() = customer_id);

insert into public.categories (name, slug, sort_order)
values
  ('Sport Legend Standees', 'sport-legend-standees', 10),
  ('Movie Character Standees', 'movie-character-standees', 20),
  ('People & Public Figure Standees', 'people-public-figure-standees', 30),
  ('Music Artist Standees', 'music-artist-standees', 40),
  ('Game & Fantasy Standees', 'game-fantasy-standees', 50),
  ('Faith & Celebration Standees', 'faith-celebration-standees', 60),
  ('Holiday Standees', 'holiday-standees', 70),
  ('Dinosaur & Animal Standees', 'dinosaur-animal-standees', 80),
  ('Fan Request Standees', 'fan-request-standees', 90),
  ('Custom Photo Standees', 'custom-photo-standees', 100),
  ('Party Pack Standees', 'party-pack-standees', 110)
on conflict (slug) do update
set name = excluded.name,
    sort_order = excluded.sort_order;

-- Admin order/offer review access.
-- After creating your Supabase login, run:
-- insert into public.admin_profiles (user_id)
-- values ('PASTE-YOUR-AUTH-USER-ID-HERE')
-- on conflict (user_id) do nothing;
create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_profiles add column if not exists test_mode_enabled boolean not null default false;
alter table public.admin_profiles add column if not exists test_customer_type text not null default 'guest';

alter table public.admin_profiles enable row level security;

create table if not exists public.offer_messages (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete set null,
  sender_type text not null check (sender_type in ('guest', 'member', 'admin', 'system')),
  message_type text not null,
  event_type text not null,
  amount numeric(10,2),
  message text,
  created_at timestamptz not null default now()
);

alter table public.offer_messages add column if not exists is_test boolean not null default false;

create index if not exists offer_messages_offer_created_idx
on public.offer_messages (offer_id, created_at);

alter table public.offer_messages enable row level security;

insert into public.offer_messages (
  offer_id, sender_user_id, sender_type, message_type, event_type, amount, created_at
)
select
  offers.id,
  offers.customer_id,
  case when offers.customer_id is null then 'guest' else 'member' end,
  'customer_offer',
  'customer_offer',
  offers.amount,
  offers.created_at
from public.offers
where not exists (
  select 1 from public.offer_messages
  where offer_messages.offer_id = offers.id
    and offer_messages.event_type = 'customer_offer'
);

insert into public.offer_messages (
  offer_id, sender_user_id, sender_type, message_type, event_type, message, created_at
)
select
  offers.id,
  offers.customer_id,
  case when offers.customer_id is null then 'guest' else 'member' end,
  'customer_comment',
  'customer_comment',
  nullif(trim(split_part(coalesce(offers.message, ''), E'Message: ', 2)), ''),
  offers.created_at
from public.offers
where nullif(trim(split_part(coalesce(offers.message, ''), E'Message: ', 2)), '') is not null
  and not exists (
    select 1 from public.offer_messages
    where offer_messages.offer_id = offers.id
      and offer_messages.event_type = 'customer_comment'
  );

drop policy if exists "Admins can view their admin profile" on public.admin_profiles;
create policy "Admins can view their admin profile"
on public.admin_profiles for select
using (auth.uid() = user_id);

drop policy if exists "Admins can view all order requests" on public.order_requests;
create policy "Admins can view all order requests"
on public.order_requests for select
using (exists (
  select 1 from public.admin_profiles
  where admin_profiles.user_id = auth.uid()
));

drop policy if exists "Admins can delete order requests" on public.order_requests;
create policy "Admins can delete order requests"
on public.order_requests for delete
using (exists (
  select 1 from public.admin_profiles
  where admin_profiles.user_id = auth.uid()
));

drop policy if exists "Admins can update order requests" on public.order_requests;
create policy "Admins can update order requests"
on public.order_requests for update
using (exists (
  select 1 from public.admin_profiles
  where admin_profiles.user_id = auth.uid()
))
with check (exists (
  select 1 from public.admin_profiles
  where admin_profiles.user_id = auth.uid()
));

drop policy if exists "Admins can view all offers" on public.offers;
create policy "Admins can view all offers"
on public.offers for select
using (exists (
  select 1 from public.admin_profiles
  where admin_profiles.user_id = auth.uid()
));

drop policy if exists "Members can view their own offer history" on public.offer_messages;
create policy "Members can view their own offer history"
on public.offer_messages for select
using (exists (
  select 1 from public.offers
  where offers.id = offer_messages.offer_id
    and offers.customer_id = auth.uid()
));

drop policy if exists "Admins can view all offer history" on public.offer_messages;
create policy "Admins can view all offer history"
on public.offer_messages for select
using (exists (
  select 1 from public.admin_profiles
  where admin_profiles.user_id = auth.uid()
));

drop policy if exists "Admins can delete offers" on public.offers;
create policy "Admins can delete offers"
on public.offers for delete
using (exists (
  select 1 from public.admin_profiles
  where admin_profiles.user_id = auth.uid()
));

drop policy if exists "Admins can update offers" on public.offers;
create policy "Admins can update offers"
on public.offers for update
using (exists (
  select 1 from public.admin_profiles
  where admin_profiles.user_id = auth.uid()
))
with check (exists (
  select 1 from public.admin_profiles
  where admin_profiles.user_id = auth.uid()
));

create or replace function public.respond_to_member_offer(
  p_offer_id uuid,
  p_action text,
  p_amount numeric default null,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_offer public.offers;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required.';
  end if;

  select * into current_offer
  from public.offers
  where id = p_offer_id
    and customer_id = auth.uid()
  for update;

  if current_offer.id is null then
    raise exception 'Offer not found.';
  end if;
  if current_offer.status <> 'countered' then
    raise exception 'This offer is not awaiting a member response.';
  end if;

  if p_action = 'accept' then
    update public.offers
    set status = 'accepted_awaiting_payment',
        buyer_final_amount = current_offer.seller_counter_amount,
        buyer_final_message = 'Accepted admin counteroffer'
    where id = p_offer_id
    returning * into current_offer;
  elsif p_action = 'decline' then
    update public.offers
    set status = 'declined'
    where id = p_offer_id
    returning * into current_offer;
  elsif p_action = 'counter' then
    if p_amount is null or p_amount <= 0 then
      raise exception 'Enter a valid counteroffer amount.';
    end if;
    update public.offers
    set status = 'buyer_countered',
        buyer_final_amount = round(p_amount, 2),
        buyer_final_message = nullif(trim(coalesce(p_message, '')), '')
    where id = p_offer_id
    returning * into current_offer;
  else
    raise exception 'Unsupported offer response.';
  end if;

  return to_jsonb(current_offer);
end;
$$;

revoke all on function public.respond_to_member_offer(uuid, text, numeric, text) from public;
grant execute on function public.respond_to_member_offer(uuid, text, numeric, text) to authenticated;

create or replace function public.set_offer_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_offer_updated_at on public.offers;
create trigger set_offer_updated_at
before update on public.offers
for each row execute function public.set_offer_updated_at();

create or replace function public.prevent_duplicate_active_member_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_size text;
  selected_design text;
  selected_background text;
begin
  if new.customer_id is null then
    return new;
  end if;

  selected_size := nullif(trim(split_part(split_part(coalesce(new.message, ''), E'Selected size: ', 2), E'\n', 1)), '');
  selected_design := nullif(trim(split_part(split_part(coalesce(new.message, ''), E'Design: ', 2), E'\n', 1)), '');
  selected_background := nullif(trim(split_part(split_part(coalesce(new.message, ''), E'Background: ', 2), E'\n', 1)), '');
  perform pg_advisory_xact_lock(hashtextextended(new.customer_id::text || '|' || lower(new.product_name) || '|' || coalesce(selected_size, '') || '|' || coalesce(selected_design, '') || '|' || coalesce(selected_background, ''), 0));

  if exists (
    select 1
    from public.offers existing
    where existing.customer_id = new.customer_id
      and lower(existing.product_name) = lower(new.product_name)
      and nullif(trim(split_part(split_part(coalesce(existing.message, ''), E'Selected size: ', 2), E'\n', 1)), '') is not distinct from selected_size
      and (
        nullif(trim(split_part(split_part(coalesce(existing.message, ''), E'Design: ', 2), E'\n', 1)), '') is null
        or nullif(trim(split_part(split_part(coalesce(existing.message, ''), E'Design: ', 2), E'\n', 1)), '') is not distinct from selected_design
      )
      and (
        nullif(trim(split_part(split_part(coalesce(existing.message, ''), E'Background: ', 2), E'\n', 1)), '') is null
        or nullif(trim(split_part(split_part(coalesce(existing.message, ''), E'Background: ', 2), E'\n', 1)), '') is not distinct from selected_background
      )
      and existing.status in ('pending', 'countered', 'buyer_countered', 'accepted', 'accepted_awaiting_payment', 'payment_submitted')
  ) then
    raise exception 'An active offer already exists for this product and size.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_duplicate_active_member_offer on public.offers;
create trigger prevent_duplicate_active_member_offer
before insert on public.offers
for each row execute function public.prevent_duplicate_active_member_offer();

create or replace function public.record_new_offer_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_comment text;
begin
  insert into public.offer_messages (
    offer_id, sender_user_id, sender_type, message_type, event_type, amount, message, is_test
  ) values (
    new.id,
    new.customer_id,
    case when new.customer_id is null then 'guest' else 'member' end,
    'customer_offer',
    'customer_offer',
    new.amount,
    null,
    new.is_test
  );

  customer_comment := nullif(trim(split_part(coalesce(new.message, ''), E'Message: ', 2)), '');
  if customer_comment is not null then
    insert into public.offer_messages (
      offer_id, sender_user_id, sender_type, message_type, event_type, message, is_test
    ) values (
      new.id,
      new.customer_id,
      case when new.customer_id is null then 'guest' else 'member' end,
      'customer_comment',
      'customer_comment',
      customer_comment,
      new.is_test
    );
  end if;
  return new;
end;
$$;

drop trigger if exists record_new_offer_history on public.offers;
create trigger record_new_offer_history
after insert on public.offers
for each row execute function public.record_new_offer_history();

create or replace function public.record_offer_update_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_type text;
  history_type text;
  history_amount numeric(10,2);
  history_message text;
begin
  actor_type := case
    when exists (select 1 from public.admin_profiles where user_id = auth.uid()) then 'admin'
    when auth.uid() = new.customer_id then 'member'
    else 'system'
  end;

  if new.status = 'countered' and (
    old.status is distinct from new.status
    or old.seller_counter_amount is distinct from new.seller_counter_amount
    or old.seller_counter_message is distinct from new.seller_counter_message
  ) then
    history_type := 'admin_counteroffer';
    history_amount := new.seller_counter_amount;
    history_message := new.seller_counter_message;
  elsif new.status = 'buyer_countered' and old.status is distinct from new.status then
    history_type := 'member_counteroffer';
    history_amount := new.buyer_final_amount;
    history_message := new.buyer_final_message;
  elsif new.status in ('accepted', 'accepted_awaiting_payment', 'declined', 'payment_pending', 'payment_submitted', 'paid', 'archived')
    and old.status is distinct from new.status then
    history_type := new.status;
    history_amount := case when new.status in ('accepted', 'accepted_awaiting_payment', 'payment_submitted', 'paid') then coalesce(new.buyer_final_amount, new.seller_counter_amount, new.amount) else null end;
  end if;

  if history_type is not null then
    insert into public.offer_messages (
      offer_id, sender_user_id, sender_type, message_type, event_type, amount, message, is_test
    ) values (
      new.id,
      auth.uid(),
      actor_type,
      history_type,
      history_type,
      history_amount,
      history_message,
      new.is_test
    );
  end if;
  return new;
end;
$$;

drop trigger if exists record_offer_update_history on public.offers;
create trigger record_offer_update_history
after update on public.offers
for each row execute function public.record_offer_update_history();

grant usage on schema public to anon, authenticated;
grant select on public.categories, public.products, public.product_images to anon, authenticated;
grant insert on public.order_requests, public.offers to anon, authenticated;
grant select on public.order_requests, public.offers, public.admin_profiles to authenticated;
grant select on public.offer_messages to authenticated;
grant delete on public.order_requests, public.offers to authenticated;
grant update on public.order_requests, public.offers to authenticated;

-- Live admin edits.
-- This stores small text/image-position edits made from Admin Mode so they stay live
-- after refresh and load for visitors. Large product image uploads should later move
-- to GitHub files or Supabase Storage instead of being saved here.
create table if not exists public.site_edits (
  page_key text primary key,
  edits jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.site_edits enable row level security;

drop policy if exists "Anyone can view site edits" on public.site_edits;
create policy "Anyone can view site edits"
on public.site_edits for select
using (true);

drop policy if exists "Admins can create site edits" on public.site_edits;
create policy "Admins can create site edits"
on public.site_edits for insert
with check (exists (
  select 1 from public.admin_profiles
  where admin_profiles.user_id = auth.uid()
));

drop policy if exists "Admins can update site edits" on public.site_edits;
create policy "Admins can update site edits"
on public.site_edits for update
using (exists (
  select 1 from public.admin_profiles
  where admin_profiles.user_id = auth.uid()
))
with check (exists (
  select 1 from public.admin_profiles
  where admin_profiles.user_id = auth.uid()
));

drop policy if exists "Admins can delete site edits" on public.site_edits;
create policy "Admins can delete site edits"
on public.site_edits for delete
using (exists (
  select 1 from public.admin_profiles
  where admin_profiles.user_id = auth.uid()
));

grant select on public.site_edits to anon, authenticated;
grant insert, update, delete on public.site_edits to authenticated;

create table if not exists public.fan_votes (
  id uuid primary key default gen_random_uuid(),
  vote_id text not null,
  vote_date date not null default current_date,
  customer_id uuid references auth.users(id) on delete set null,
  guest_id text,
  created_at timestamptz not null default now(),
  constraint fan_votes_has_voter check (customer_id is not null or guest_id is not null)
);

drop index if exists public.fan_votes_customer_daily_unique;
drop index if exists public.fan_votes_guest_daily_unique;

create or replace function public.enforce_fan_vote_two_day_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.fan_votes existing_vote
    where existing_vote.vote_id = new.vote_id
      and existing_vote.created_at > now() - interval '2 days'
      and (
        (new.customer_id is not null and existing_vote.customer_id = new.customer_id)
        or
        (new.customer_id is null and existing_vote.customer_id is null and existing_vote.guest_id = new.guest_id)
      )
  ) then
    raise exception 'You can vote for this item once every 2 days.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_fan_vote_two_day_cooldown() from public;

drop trigger if exists enforce_fan_vote_two_day_cooldown on public.fan_votes;
create trigger enforce_fan_vote_two_day_cooldown
before insert on public.fan_votes
for each row execute function public.enforce_fan_vote_two_day_cooldown();

alter table public.fan_votes enable row level security;

drop policy if exists "Anyone can create fan votes" on public.fan_votes;
create policy "Anyone can create fan votes"
on public.fan_votes for insert
with check (
  vote_id is not null
  and vote_date = current_date
  and (customer_id = auth.uid() or customer_id is null)
);

drop policy if exists "Admins can view all fan votes" on public.fan_votes;
create policy "Admins can view all fan votes"
on public.fan_votes for select
using (exists (
  select 1 from public.admin_profiles
  where admin_profiles.user_id = auth.uid()
));

grant insert on public.fan_votes to anon, authenticated;
grant select on public.fan_votes to authenticated;

-- Secure discount codes and Admin-only workflow simulation.
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

create unique index if not exists discount_codes_upper_code_unique
on public.discount_codes (upper(code));

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

create index if not exists discount_redemptions_code_idx on public.discount_redemptions (discount_code_id);
create index if not exists discount_redemptions_customer_idx on public.discount_redemptions (customer_id, discount_code_id);
create index if not exists discount_redemptions_guest_idx on public.discount_redemptions (lower(guest_email), discount_code_id);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_request_id uuid not null references public.order_requests(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.discount_codes enable row level security;
alter table public.discount_redemptions enable row level security;
alter table public.order_events enable row level security;

drop policy if exists "Admins manage discount codes" on public.discount_codes;
create policy "Admins manage discount codes" on public.discount_codes for all
using (exists (select 1 from public.admin_profiles where user_id = auth.uid()))
with check (exists (select 1 from public.admin_profiles where user_id = auth.uid()));

drop policy if exists "Members view their discount redemptions" on public.discount_redemptions;
create policy "Members view their discount redemptions" on public.discount_redemptions for select
using (customer_id = auth.uid());

drop policy if exists "Admins view all discount redemptions" on public.discount_redemptions;
create policy "Admins view all discount redemptions" on public.discount_redemptions for select
using (exists (select 1 from public.admin_profiles where user_id = auth.uid()));

drop policy if exists "Members view their order events" on public.order_events;
create policy "Members view their order events" on public.order_events for select
using (exists (
  select 1 from public.order_requests
  where order_requests.id = order_events.order_request_id
    and order_requests.customer_id = auth.uid()
));

drop policy if exists "Admins view all order events" on public.order_events;
create policy "Admins view all order events" on public.order_events for select
using (exists (select 1 from public.admin_profiles where user_id = auth.uid()));

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_profiles where user_id = auth.uid());
$$;

create or replace function public.get_admin_test_mode()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  profile public.admin_profiles;
begin
  select * into profile from public.admin_profiles where user_id = auth.uid();
  if profile.user_id is null then
    return jsonb_build_object('enabled', false, 'customer_type', 'guest');
  end if;
  return jsonb_build_object(
    'enabled', profile.test_mode_enabled,
    'customer_type', profile.test_customer_type
  );
end;
$$;

create or replace function public.set_admin_test_mode(p_enabled boolean, p_customer_type text default 'guest')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.admin_profiles;
begin
  if p_customer_type not in ('guest', 'member') then
    raise exception 'Unsupported test customer type.';
  end if;
  update public.admin_profiles
  set test_mode_enabled = coalesce(p_enabled, false),
      test_customer_type = p_customer_type
  where user_id = auth.uid()
  returning * into profile;
  if profile.user_id is null then raise exception 'Admin access is required.'; end if;
  return jsonb_build_object('enabled', profile.test_mode_enabled, 'customer_type', profile.test_customer_type);
end;
$$;

create or replace function public.validate_discount_code(
  p_code text,
  p_original_amount numeric,
  p_customer_email text default null,
  p_product_names text[] default array[]::text[],
  p_categories text[] default array[]::text[],
  p_is_negotiated_offer boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  selected public.discount_codes;
  total_uses integer;
  customer_uses integer;
  discount numeric(10,2);
  effective_member boolean;
  admin_test_guest boolean;
begin
  if nullif(trim(coalesce(p_code, '')), '') is null then
    return jsonb_build_object('valid', false, 'message', 'Enter a discount code.');
  end if;
  select * into selected from public.discount_codes where upper(code) = upper(trim(p_code));
  if selected.id is null then return jsonb_build_object('valid', false, 'message', 'Discount code not found.'); end if;
  if not selected.active then return jsonb_build_object('valid', false, 'message', 'This discount code is inactive.'); end if;
  if selected.starts_at is not null and now() < selected.starts_at then return jsonb_build_object('valid', false, 'message', 'This discount code has not started yet.'); end if;
  if selected.expires_at is not null and now() >= selected.expires_at then return jsonb_build_object('valid', false, 'message', 'This discount code has expired.'); end if;
  if coalesce(p_original_amount, 0) < selected.minimum_order_amount then return jsonb_build_object('valid', false, 'message', format('Minimum order amount is $%s.', selected.minimum_order_amount)); end if;

  select exists (
    select 1 from public.admin_profiles
    where user_id = auth.uid() and test_mode_enabled and test_customer_type = 'guest'
  ) into admin_test_guest;
  effective_member := auth.uid() is not null and not admin_test_guest;
  if selected.audience = 'member' and not effective_member then return jsonb_build_object('valid', false, 'message', 'This discount is for signed-in members only.'); end if;
  if p_is_negotiated_offer and not selected.allow_offer_stacking then return jsonb_build_object('valid', false, 'message', 'Discount codes cannot be combined with this negotiated offer.'); end if;
  if selected.product_restriction is not null and not exists (
    select 1 from unnest(coalesce(p_product_names, array[]::text[])) value
    where lower(value) in (lower(selected.product_restriction), lower(selected.product_restriction || ' - Accepted Offer'))
  ) then return jsonb_build_object('valid', false, 'message', 'This code does not apply to the selected product.'); end if;
  if selected.category_restriction is not null and not exists (
    select 1 from unnest(coalesce(p_categories, array[]::text[])) value where lower(value) = lower(selected.category_restriction)
  ) then return jsonb_build_object('valid', false, 'message', 'This code does not apply to the selected category.'); end if;

  select count(*) into total_uses from public.discount_redemptions where discount_code_id = selected.id and not is_test;
  if selected.total_usage_limit is not null and total_uses >= selected.total_usage_limit then return jsonb_build_object('valid', false, 'message', 'This discount code has reached its usage limit.'); end if;
  if effective_member then
    select count(*) into customer_uses from public.discount_redemptions where discount_code_id = selected.id and customer_id = auth.uid() and not is_test;
  else
    select count(*) into customer_uses from public.discount_redemptions where discount_code_id = selected.id and lower(guest_email) = lower(trim(coalesce(p_customer_email, ''))) and not is_test;
  end if;
  if selected.per_customer_usage_limit is not null and customer_uses >= selected.per_customer_usage_limit then return jsonb_build_object('valid', false, 'message', 'You have already used this discount the maximum number of times.'); end if;

  discount := case selected.discount_type
    when 'percentage' then round(coalesce(p_original_amount, 0) * selected.discount_value / 100, 2)
    else selected.discount_value
  end;
  discount := least(greatest(discount, 0), greatest(coalesce(p_original_amount, 0), 0));
  return jsonb_build_object(
    'valid', true,
    'code', selected.code,
    'discount_type', selected.discount_type,
    'discount_value', selected.discount_value,
    'discount_amount', discount,
    'original_amount', greatest(coalesce(p_original_amount, 0), 0),
    'final_amount', greatest(coalesce(p_original_amount, 0) - discount, 0),
    'message', 'Discount code applied.'
  );
end;
$$;

create or replace function public.submit_order_request(
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_shipping_address jsonb,
  p_items jsonb,
  p_payment_method text,
  p_original_amount numeric,
  p_notes text,
  p_discount_code text default null,
  p_is_negotiated_offer boolean default false,
  p_is_test boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected public.discount_codes;
  validation jsonb;
  new_order public.order_requests;
  effective_customer_id uuid;
  test_profile public.admin_profiles;
  product_names text[];
  categories text[];
  discount numeric(10,2) := 0;
  final_amount numeric(10,2);
  items_amount numeric(10,2);
begin
  if coalesce(p_original_amount, 0) < 0 then raise exception 'Original amount cannot be negative.'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'At least one order item is required.'; end if;
  if p_is_test then
    select * into test_profile from public.admin_profiles where user_id = auth.uid() and test_mode_enabled for update;
    if test_profile.user_id is null then raise exception 'Admin Test Mode is not enabled.'; end if;
    effective_customer_id := case when test_profile.test_customer_type = 'member' then auth.uid() else null end;
  else
    effective_customer_id := auth.uid();
  end if;

  select
    coalesce(array_agg(value->>'name'), array[]::text[]),
    coalesce(array_agg(value->>'category') filter (where nullif(value->>'category', '') is not null), array[]::text[]),
    coalesce(sum((value->>'price')::numeric), 0)
  into product_names, categories, items_amount
  from jsonb_array_elements(p_items) as item(value);
  if round(items_amount, 2) <> round(p_original_amount, 2) then raise exception 'Order subtotal does not match the submitted items.'; end if;

  if nullif(trim(coalesce(p_discount_code, '')), '') is not null then
    select * into selected from public.discount_codes where upper(code) = upper(trim(p_discount_code)) for update;
    if selected.id is null then raise exception 'Discount code not found.'; end if;
    validation := public.validate_discount_code(selected.code, p_original_amount, p_customer_email, product_names, categories, p_is_negotiated_offer);
    if not coalesce((validation->>'valid')::boolean, false) then raise exception '%', validation->>'message'; end if;
    discount := (validation->>'discount_amount')::numeric;
  end if;
  final_amount := greatest(round(coalesce(p_original_amount, 0) - discount, 2), 0);

  insert into public.order_requests (
    customer_id, customer_name, customer_email, customer_phone, shipping_address, items,
    payment_method, subtotal, original_amount, customer_fee, applied_discount_code,
    discount_amount, total, status, notes, is_test
  ) values (
    effective_customer_id, nullif(trim(p_customer_name), ''), nullif(trim(p_customer_email), ''),
    nullif(trim(coalesce(p_customer_phone, '')), ''), coalesce(p_shipping_address, '{}'::jsonb), p_items,
    case when p_is_test then 'TEST - no real payment' else p_payment_method end,
    p_original_amount, p_original_amount, 0, selected.code, discount, final_amount, 'new', p_notes, p_is_test
  ) returning * into new_order;

  insert into public.order_events (order_request_id, event_type, actor_user_id, is_test)
  values (new_order.id, 'order_submitted', auth.uid(), p_is_test);

  if selected.id is not null then
    insert into public.discount_redemptions (
      discount_code_id, customer_id, guest_email, order_request_id,
      original_amount, discount_amount, final_amount, is_test
    ) values (
      selected.id, effective_customer_id, case when effective_customer_id is null then lower(trim(p_customer_email)) else null end,
      new_order.id, p_original_amount, discount, final_amount, p_is_test
    );
  end if;

  return jsonb_build_object(
    'order_id', new_order.id,
    'discount_code', new_order.applied_discount_code,
    'discount_amount', new_order.discount_amount,
    'original_amount', new_order.original_amount,
    'final_amount', new_order.total,
    'is_test', new_order.is_test
  );
end;
$$;

create or replace function public.submit_test_offer(
  p_product_name text,
  p_customer_name text,
  p_customer_email text,
  p_amount numeric,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.admin_profiles;
  new_offer public.offers;
begin
  select * into profile from public.admin_profiles where user_id = auth.uid() and test_mode_enabled for update;
  if profile.user_id is null then raise exception 'Admin Test Mode is not enabled.'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter a valid offer amount.'; end if;
  insert into public.offers (
    product_name, customer_id, customer_name, customer_email, amount, message, status, is_test
  ) values (
    p_product_name,
    case when profile.test_customer_type = 'member' then auth.uid() else null end,
    nullif(trim(p_customer_name), ''), nullif(trim(p_customer_email), ''), round(p_amount, 2), p_message, 'pending', true
  ) returning * into new_offer;
  return to_jsonb(new_offer);
end;
$$;

create or replace function public.update_test_order_status(p_order_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.order_requests;
begin
  if not public.is_current_user_admin() then raise exception 'Admin access is required.'; end if;
  if p_status not in ('payment_submitted', 'paid') then raise exception 'Unsupported test order status.'; end if;
  update public.order_requests set status = p_status
  where id = p_order_id and is_test
  returning * into updated;
  if updated.id is null then raise exception 'Test order not found.'; end if;
  insert into public.order_events (order_request_id, event_type, actor_user_id, is_test)
  values (updated.id, p_status, auth.uid(), true);
  return to_jsonb(updated);
end;
$$;

create or replace function public.record_test_order_event(p_order_id uuid, p_event_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected public.order_requests;
begin
  if not public.is_current_user_admin() then raise exception 'Admin access is required.'; end if;
  if p_event_type not in ('continue_to_payment', 'payment_instructions_opened') then raise exception 'Unsupported test event.'; end if;
  select * into selected from public.order_requests where id = p_order_id and is_test;
  if selected.id is null then raise exception 'Test order not found.'; end if;
  insert into public.order_events (order_request_id, event_type, actor_user_id, is_test)
  values (selected.id, p_event_type, auth.uid(), true);
  return jsonb_build_object('recorded', true, 'event_type', p_event_type);
end;
$$;

create or replace function public.prepare_offer_payment(
  p_offer_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_shipping_address jsonb,
  p_items jsonb,
  p_payment_method text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_offer public.offers;
  accepted_amount numeric(10,2);
  item_amount numeric(10,2);
  admin_access boolean;
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  select * into current_offer from public.offers where id = p_offer_id for update;
  admin_access := public.is_current_user_admin();
  if current_offer.id is null or not (
    current_offer.customer_id = auth.uid()
    or (current_offer.is_test and admin_access)
  ) then raise exception 'Accepted offer not found.'; end if;
  if current_offer.status not in ('accepted', 'accepted_awaiting_payment') then raise exception 'This offer is not awaiting payment.'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'Payment details require an order item.'; end if;
  select coalesce(sum((item->>'price')::numeric), 0) into item_amount
  from jsonb_array_elements(p_items) as selected(item);
  accepted_amount := round(coalesce(current_offer.buyer_final_amount, current_offer.seller_counter_amount, current_offer.amount), 2);
  if round(item_amount, 2) <> accepted_amount then raise exception 'Payment amount does not match the accepted offer.'; end if;

  update public.offers
  set status = 'accepted_awaiting_payment',
      customer_name = coalesce(nullif(trim(p_customer_name), ''), customer_name),
      customer_email = coalesce(nullif(trim(p_customer_email), ''), customer_email),
      payment_customer_phone = nullif(trim(coalesce(p_customer_phone, '')), ''),
      payment_shipping_address = coalesce(p_shipping_address, '{}'::jsonb),
      payment_items = p_items,
      payment_method = case when current_offer.is_test then 'TEST - no real payment' else nullif(trim(p_payment_method), '') end,
      payment_notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = p_offer_id
  returning * into current_offer;

  return jsonb_build_object(
    'offer_id', current_offer.id,
    'original_amount', accepted_amount,
    'final_amount', accepted_amount,
    'is_test', current_offer.is_test
  );
end;
$$;

create or replace function public.submit_offer_payment(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_offer public.offers;
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  select * into current_offer from public.offers where id = p_offer_id for update;
  if current_offer.id is null or not (
    current_offer.customer_id = auth.uid()
    or (current_offer.is_test and public.is_current_user_admin())
  ) then raise exception 'Accepted offer not found.'; end if;
  if current_offer.status not in ('accepted', 'accepted_awaiting_payment') then raise exception 'This offer is not ready for payment submission.'; end if;
  if current_offer.payment_method is null or current_offer.payment_items is null then raise exception 'Complete the payment details first.'; end if;

  update public.offers
  set status = 'payment_submitted', payment_submitted_at = now()
  where id = p_offer_id
  returning * into current_offer;
  return to_jsonb(current_offer);
end;
$$;

create or replace function public.confirm_offer_payment(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_offer public.offers;
  related_order public.order_requests;
  accepted_amount numeric(10,2);
  created_order boolean := false;
begin
  if not public.is_current_user_admin() then raise exception 'Admin access is required.'; end if;
  select * into current_offer from public.offers where id = p_offer_id for update;
  if current_offer.id is null then raise exception 'Offer not found.'; end if;

  select * into related_order from public.order_requests where source_offer_id = p_offer_id;
  if current_offer.status = 'paid' and related_order.id is not null then
    return jsonb_build_object('offer_id', current_offer.id, 'order_id', related_order.id, 'created', false, 'already_confirmed', true);
  end if;
  if current_offer.status <> 'payment_submitted' then raise exception 'Payment has not been submitted for this offer.'; end if;
  if current_offer.payment_items is null or current_offer.payment_method is null then raise exception 'Payment details are incomplete.'; end if;

  accepted_amount := round(coalesce(current_offer.buyer_final_amount, current_offer.seller_counter_amount, current_offer.amount), 2);
  insert into public.order_requests (
    source_offer_id, customer_id, customer_name, customer_email, customer_phone,
    shipping_address, items, payment_method, subtotal, original_amount, customer_fee,
    discount_amount, total, status, notes, is_test
  ) values (
    current_offer.id, current_offer.customer_id, current_offer.customer_name, current_offer.customer_email,
    current_offer.payment_customer_phone, coalesce(current_offer.payment_shipping_address, '{}'::jsonb),
    current_offer.payment_items, current_offer.payment_method, accepted_amount, accepted_amount, 0,
    0, accepted_amount, 'new', current_offer.payment_notes, current_offer.is_test
  ) on conflict (source_offer_id) where source_offer_id is not null do nothing
  returning * into related_order;

  if related_order.id is null then
    select * into related_order from public.order_requests where source_offer_id = p_offer_id;
  else
    created_order := true;
    insert into public.order_events (order_request_id, event_type, actor_user_id, is_test)
    values (related_order.id, 'payment_confirmed_order_created', auth.uid(), current_offer.is_test);
  end if;
  if related_order.id is null then raise exception 'Could not create the related order.'; end if;

  update public.offers set status = 'paid' where id = p_offer_id returning * into current_offer;
  return jsonb_build_object('offer_id', current_offer.id, 'order_id', related_order.id, 'created', created_order, 'already_confirmed', false);
end;
$$;

create or replace function public.admin_update_order_status(p_order_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.order_requests;
begin
  if not public.is_current_user_admin() then raise exception 'Admin access is required.'; end if;
  if p_status not in ('new', 'in_production', 'shipped', 'completed', 'archived') then raise exception 'Unsupported order status.'; end if;
  update public.order_requests
  set status = p_status,
      updated_at = now(),
      archived_at = case when p_status = 'archived' then now() else archived_at end
  where id = p_order_id
  returning * into updated;
  if updated.id is null then raise exception 'Order not found.'; end if;
  insert into public.order_events (order_request_id, event_type, actor_user_id, is_test)
  values (updated.id, p_status, auth.uid(), updated.is_test);
  return to_jsonb(updated);
end;
$$;

create or replace function public.list_eligible_discounts()
returns table (code text, description text, discount_type text, discount_value numeric, minimum_order_amount numeric, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select code, description, discount_type, discount_value, minimum_order_amount, expires_at
  from public.discount_codes
  where auth.uid() is not null
    and active
    and audience in ('public', 'member')
    and (starts_at is null or starts_at <= now())
    and (expires_at is null or expires_at > now())
    and (total_usage_limit is null or total_usage_limit > (
      select count(*) from public.discount_redemptions where discount_code_id = discount_codes.id and not is_test
    ))
    and (per_customer_usage_limit is null or per_customer_usage_limit > (
      select count(*) from public.discount_redemptions where discount_code_id = discount_codes.id and customer_id = auth.uid() and not is_test
    ))
  order by created_at desc;
$$;

drop policy if exists "Admins can delete order requests" on public.order_requests;
create policy "Admins can delete test order requests" on public.order_requests for delete
using (is_test and public.is_current_user_admin());

drop policy if exists "Anyone can create order requests" on public.order_requests;

drop policy if exists "Admins can delete offers" on public.offers;
create policy "Admins can delete test offers" on public.offers for delete
using (is_test and public.is_current_user_admin());

revoke all on function public.is_current_user_admin() from public;
revoke all on function public.get_admin_test_mode() from public;
revoke all on function public.set_admin_test_mode(boolean, text) from public;
revoke all on function public.validate_discount_code(text, numeric, text, text[], text[], boolean) from public;
revoke all on function public.submit_order_request(text, text, text, jsonb, jsonb, text, numeric, text, text, boolean, boolean) from public;
revoke all on function public.submit_test_offer(text, text, text, numeric, text) from public;
revoke all on function public.update_test_order_status(uuid, text) from public;
revoke all on function public.record_test_order_event(uuid, text) from public;
revoke all on function public.prepare_offer_payment(uuid, text, text, text, jsonb, jsonb, text, text) from public;
revoke all on function public.submit_offer_payment(uuid) from public;
revoke all on function public.confirm_offer_payment(uuid) from public;
revoke all on function public.admin_update_order_status(uuid, text) from public;
revoke all on function public.list_eligible_discounts() from public;

grant execute on function public.get_admin_test_mode() to authenticated;
grant execute on function public.set_admin_test_mode(boolean, text) to authenticated;
grant execute on function public.validate_discount_code(text, numeric, text, text[], text[], boolean) to anon, authenticated;
grant execute on function public.submit_order_request(text, text, text, jsonb, jsonb, text, numeric, text, text, boolean, boolean) to anon, authenticated;
grant execute on function public.submit_test_offer(text, text, text, numeric, text) to authenticated;
grant execute on function public.update_test_order_status(uuid, text) to authenticated;
grant execute on function public.record_test_order_event(uuid, text) to authenticated;
grant execute on function public.prepare_offer_payment(uuid, text, text, text, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.submit_offer_payment(uuid) to authenticated;
grant execute on function public.confirm_offer_payment(uuid) to authenticated;
grant execute on function public.admin_update_order_status(uuid, text) to authenticated;
grant execute on function public.list_eligible_discounts() to authenticated;
grant select, insert, update on public.discount_codes to authenticated;
grant select on public.discount_redemptions, public.order_events to authenticated;
