-- Custom Order inquiries are not checkout orders. They may be saved before a
-- shipping address or payment method is agreed, while normal website checkout
-- orders must continue to use a valid U.S. shipping address.

create or replace function public.enforce_us_order_shipping()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not coalesce(new.is_test, false)
     and not coalesce(new.items, '[]'::jsonb) @> '[{"type":"custom-order"}]'::jsonb
     and (tg_op = 'INSERT' or new.shipping_address is distinct from old.shipping_address)
     and not public.is_us_shipping_address(new.shipping_address) then
    raise exception 'International website checkout is not available yet. International shipping will be offered separately.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_us_order_shipping() from public;
