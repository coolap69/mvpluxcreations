begin;

-- Admin Test Mode can represent a signed-in member with the Admin's auth UID.
-- Process an owned countered offer as the member response before applying the
-- caller's Admin role; all other Admin and member transitions remain unchanged.
create or replace function public.respond_to_member_offer(
  p_offer_id uuid,
  p_action text,
  p_amount numeric default null,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_offer public.offers;
  admin_access boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required.';
  end if;

  admin_access := public.is_current_user_admin();
  select * into current_offer from public.offers where id = p_offer_id for update;

  if current_offer.id is null then
    raise exception 'Offer not found.';
  end if;

  if current_offer.customer_id = auth.uid()
    and current_offer.status = 'countered'
    and p_action in ('accept', 'decline', 'counter') then
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
    else
      if p_amount is null or p_amount <= 0 then
        raise exception 'Enter a valid counteroffer amount.';
      end if;
      update public.offers
      set status = 'buyer_countered',
          buyer_final_amount = round(p_amount, 2),
          buyer_final_message = nullif(trim(coalesce(p_message, '')), '')
      where id = p_offer_id
      returning * into current_offer;
    end if;
    return to_jsonb(current_offer);
  end if;

  if admin_access then
    if p_action in ('accept', 'decline') and current_offer.status not in ('pending', 'buyer_countered') then
      raise exception 'This offer is not awaiting an Admin decision.';
    end if;
    if p_action = 'accept' then
      update public.offers set status = 'accepted_awaiting_payment' where id = p_offer_id returning * into current_offer;
    elsif p_action = 'decline' then
      update public.offers set status = 'declined' where id = p_offer_id returning * into current_offer;
    elsif p_action = 'counter' then
      if current_offer.status <> 'pending' then raise exception 'Only a pending offer can receive an Admin counteroffer.'; end if;
      if current_offer.customer_id is null then raise exception 'Only a signed-in member offer can receive a counteroffer.'; end if;
      if p_amount is null or p_amount <= 0 then raise exception 'Enter a valid counteroffer amount.'; end if;
      update public.offers
      set status = 'countered', seller_counter_amount = round(p_amount, 2), seller_counter_message = nullif(trim(coalesce(p_message, '')), '')
      where id = p_offer_id returning * into current_offer;
    elsif p_action = 'archive' then
      if current_offer.status not in ('paid', 'completed', 'declined') then raise exception 'Only a completed or declined offer can be archived.'; end if;
      update public.offers set status = 'archived', archived_at = now() where id = p_offer_id returning * into current_offer;
    else
      raise exception 'Unsupported Admin offer response.';
    end if;
    return to_jsonb(current_offer);
  end if;

  if current_offer.customer_id is distinct from auth.uid() then raise exception 'Offer not found.'; end if;
  if current_offer.status <> 'countered' then raise exception 'This offer is not awaiting a member response.'; end if;
  if p_action = 'accept' then
    update public.offers
    set status = 'accepted_awaiting_payment',
        buyer_final_amount = current_offer.seller_counter_amount,
        buyer_final_message = 'Accepted admin counteroffer'
    where id = p_offer_id
    returning * into current_offer;
  elsif p_action = 'decline' then
    update public.offers set status = 'declined' where id = p_offer_id returning * into current_offer;
  elsif p_action = 'counter' then
    if p_amount is null or p_amount <= 0 then raise exception 'Enter a valid counteroffer amount.'; end if;
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

commit;
