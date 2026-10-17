begin;

create table if not exists public.custom_order_messages (
  id uuid primary key default gen_random_uuid(),
  order_request_id uuid not null references public.order_requests(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_type text not null default 'customer' check (sender_type in ('customer', 'admin')),
  message text not null check (char_length(trim(message)) between 1 and 3000),
  created_at timestamptz not null default now()
);

create index if not exists custom_order_messages_order_created_idx
  on public.custom_order_messages(order_request_id, created_at);

alter table public.custom_order_messages enable row level security;

drop policy if exists "Customers view messages for their custom orders" on public.custom_order_messages;
create policy "Customers view messages for their custom orders"
on public.custom_order_messages for select to authenticated
using (
  exists (
    select 1
    from public.order_requests request
    where request.id = custom_order_messages.order_request_id
      and request.customer_id = auth.uid()
      and request.items->0->>'type' = 'custom-order'
  )
);

drop policy if exists "Customers add messages to their custom orders" on public.custom_order_messages;
create policy "Customers add messages to their custom orders"
on public.custom_order_messages for insert to authenticated
with check (
  sender_user_id = auth.uid()
  and sender_type = 'customer'
  and exists (
    select 1
    from public.order_requests request
    where request.id = custom_order_messages.order_request_id
      and request.customer_id = auth.uid()
      and request.items->0->>'type' = 'custom-order'
  )
);

drop policy if exists "Admins view all custom order messages" on public.custom_order_messages;
create policy "Admins view all custom order messages"
on public.custom_order_messages for select to authenticated
using (public.is_current_user_admin());

grant select, insert on public.custom_order_messages to authenticated;
revoke update, delete on public.custom_order_messages from anon, authenticated;

commit;
