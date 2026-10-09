-- Direct website checkout is limited to U.S. delivery addresses.
-- International checkout will be added later as a manual workflow: the customer
-- purchases and emails the label, pays a $15 handling fee, and allows additional
-- handling time because the printer ships to the seller first.
-- Existing orders are not rewritten; Admin may explicitly reject and preserve one.

create or replace function public.is_us_shipping_address(p_shipping_address jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(
    lower(trim(coalesce(p_shipping_address->>'country', ''))),
    '[^a-z]',
    '',
    'g'
  ) = any (array['us', 'usa', 'unitedstates', 'unitedstatesofamerica']);
$$;

create or replace function public.enforce_us_order_shipping()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not coalesce(new.is_test, false)
     and (tg_op = 'INSERT' or new.shipping_address is distinct from old.shipping_address)
     and not public.is_us_shipping_address(new.shipping_address) then
    raise exception 'International website checkout is not available yet. International shipping will be offered separately.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_us_order_shipping on public.order_requests;
create trigger enforce_us_order_shipping
before insert or update of shipping_address on public.order_requests
for each row execute function public.enforce_us_order_shipping();

create or replace function public.enforce_us_offer_payment_shipping()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not coalesce(new.is_test, false)
     and new.payment_shipping_address is not null
     and new.payment_shipping_address is distinct from old.payment_shipping_address
     and not public.is_us_shipping_address(new.payment_shipping_address) then
    raise exception 'International website checkout is not available yet. International shipping will be offered separately.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_us_offer_payment_shipping on public.offers;
create trigger enforce_us_offer_payment_shipping
before update of payment_shipping_address on public.offers
for each row execute function public.enforce_us_offer_payment_shipping();

create or replace function public.admin_update_order_status(p_order_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated public.order_requests;
begin
  if not public.is_current_user_admin() then raise exception 'Admin access is required.'; end if;
  if p_status not in ('new', 'in_production', 'shipped', 'completed', 'rejected', 'archived') then raise exception 'Unsupported order status.'; end if;
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

revoke all on function public.is_us_shipping_address(jsonb) from public;
revoke all on function public.enforce_us_order_shipping() from public;
revoke all on function public.enforce_us_offer_payment_shipping() from public;
revoke all on function public.admin_update_order_status(uuid, text) from public;
grant execute on function public.admin_update_order_status(uuid, text) to authenticated;
