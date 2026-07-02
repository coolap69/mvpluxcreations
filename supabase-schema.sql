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
  created_at timestamptz not null default now()
);

alter table public.offers enable row level security;

create policy "Anyone can create offers"
on public.offers for insert
with check (true);

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
