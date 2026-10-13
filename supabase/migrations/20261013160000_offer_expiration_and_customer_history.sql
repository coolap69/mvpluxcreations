begin;

-- Customer response deadlines apply only after Admin sends a counteroffer.
-- Pending customer offers and buyer counteroffers wait for Admin indefinitely.
alter table public.offers
  add column if not exists expires_at timestamptz;

create index if not exists offers_customer_history_idx
  on public.offers (lower(customer_email), created_at desc);

create index if not exists offers_expiration_idx
  on public.offers (expires_at)
  where status = 'countered' and expires_at is not null;

-- Existing counteroffers receive the same two-day window, measured from their
-- last saved update. No other existing offer or order is changed.
update public.offers
set expires_at = updated_at + interval '48 hours'
where status = 'countered' and expires_at is null;

create or replace function public.expire_stale_member_offers()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  expired_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required.';
  end if;

  if public.is_current_user_admin() then
    update public.offers
    set status = 'expired'
    where status = 'countered'
      and expires_at is not null
      and expires_at <= now();
  else
    update public.offers
    set status = 'expired'
    where customer_id = auth.uid()
      and status = 'countered'
      and expires_at is not null
      and expires_at <= now();
  end if;

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

create or replace function public.prevent_duplicate_active_member_offer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_size text;
  selected_design text;
  selected_background text;
begin
  if new.customer_id is null then return new; end if;
  selected_size := nullif(trim(split_part(split_part(coalesce(new.message,''), E'Selected size: ',2), E'\n',1)), '');
  selected_design := nullif(trim(split_part(split_part(coalesce(new.message,''), E'Design: ',2), E'\n',1)), '');
  selected_background := nullif(trim(split_part(split_part(coalesce(new.message,''), E'Background: ',2), E'\n',1)), '');
  perform pg_advisory_xact_lock(hashtextextended(new.customer_id::text||'|'||lower(new.product_name)||'|'||coalesce(selected_size,'')||'|'||coalesce(selected_design,'')||'|'||coalesce(selected_background,''),0));
  if exists (
    select 1 from public.offers existing
    where existing.customer_id = new.customer_id
      and lower(existing.product_name) = lower(new.product_name)
      and nullif(trim(split_part(split_part(coalesce(existing.message,''), E'Selected size: ',2), E'\n',1)),'') is not distinct from selected_size
      and (nullif(trim(split_part(split_part(coalesce(existing.message,''), E'Design: ',2), E'\n',1)),'') is null
        or nullif(trim(split_part(split_part(coalesce(existing.message,''), E'Design: ',2), E'\n',1)),'') is not distinct from selected_design)
      and (nullif(trim(split_part(split_part(coalesce(existing.message,''), E'Background: ',2), E'\n',1)),'') is null
        or nullif(trim(split_part(split_part(coalesce(existing.message,''), E'Background: ',2), E'\n',1)),'') is not distinct from selected_background)
      and existing.status in ('pending','countered','buyer_countered','accepted','accepted_awaiting_payment','payment_pending','payment_submitted')
      and not (existing.status = 'countered' and existing.expires_at is not null and existing.expires_at <= now())
  ) then
    raise exception 'An active offer already exists for this product and size.';
  end if;
  return new;
end;
$$;

create or replace function public.record_offer_update_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_type text;
  history_type text;
  history_amount numeric(10,2);
  history_message text;
begin
  actor_type := case when public.is_current_user_admin() then 'admin' when auth.uid() = new.customer_id then 'member' else 'system' end;
  if new.status = 'countered' and (old.status is distinct from new.status or old.seller_counter_amount is distinct from new.seller_counter_amount or old.seller_counter_message is distinct from new.seller_counter_message) then
    history_type := 'admin_counteroffer';
    history_amount := new.seller_counter_amount;
    history_message := new.seller_counter_message;
  elsif new.status = 'buyer_countered' and old.status is distinct from new.status then
    history_type := 'member_counteroffer';
    history_amount := new.buyer_final_amount;
    history_message := new.buyer_final_message;
  elsif new.status in ('accepted','accepted_awaiting_payment','declined','expired','payment_pending','payment_submitted','paid','archived') and old.status is distinct from new.status then
    history_type := new.status;
    history_amount := case when new.status in ('accepted','accepted_awaiting_payment','payment_submitted','paid') then coalesce(new.buyer_final_amount,new.seller_counter_amount,new.amount) end;
    history_message := case when new.status = 'expired' then 'Customer response deadline passed after 48 hours.' end;
  end if;
  if history_type is not null then
    insert into public.offer_messages(offer_id,sender_user_id,sender_type,message_type,event_type,amount,message,is_test)
    values(new.id,auth.uid(),actor_type,history_type,history_type,history_amount,history_message,new.is_test);
  end if;
  return new;
end;
$$;

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
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  admin_access := public.is_current_user_admin();
  select * into current_offer from public.offers where id = p_offer_id for update;
  if current_offer.id is null then raise exception 'Offer not found.'; end if;

  if current_offer.status = 'countered' and current_offer.expires_at is not null and current_offer.expires_at <= now() then
    update public.offers set status = 'expired' where id = p_offer_id returning * into current_offer;
    return to_jsonb(current_offer);
  end if;

  if current_offer.customer_id = auth.uid() and current_offer.status = 'countered' and p_action in ('accept','decline','counter') then
    if p_action = 'accept' then
      update public.offers set status='accepted_awaiting_payment',buyer_final_amount=current_offer.seller_counter_amount,buyer_final_message='Accepted admin counteroffer',expires_at=null where id=p_offer_id returning * into current_offer;
    elsif p_action = 'decline' then
      update public.offers set status='declined',expires_at=null where id=p_offer_id returning * into current_offer;
    else
      if p_amount is null or p_amount <= 0 then raise exception 'Enter a valid counteroffer amount.'; end if;
      update public.offers set status='buyer_countered',buyer_final_amount=round(p_amount,2),buyer_final_message=nullif(trim(coalesce(p_message,'')),''),expires_at=null where id=p_offer_id returning * into current_offer;
    end if;
    return to_jsonb(current_offer);
  end if;

  if admin_access then
    if p_action in ('accept','decline') and current_offer.status not in ('pending','buyer_countered') then raise exception 'This offer is not awaiting an Admin decision.'; end if;
    if p_action = 'accept' then
      update public.offers set status='accepted_awaiting_payment',expires_at=null where id=p_offer_id returning * into current_offer;
    elsif p_action = 'decline' then
      update public.offers set status='declined',expires_at=null where id=p_offer_id returning * into current_offer;
    elsif p_action = 'counter' then
      if current_offer.status <> 'pending' then raise exception 'Only a pending offer can receive an Admin counteroffer.'; end if;
      if current_offer.customer_id is null then raise exception 'Only a signed-in member offer can receive a counteroffer.'; end if;
      if p_amount is null or p_amount <= 0 then raise exception 'Enter a valid counteroffer amount.'; end if;
      update public.offers set status='countered',seller_counter_amount=round(p_amount,2),seller_counter_message=nullif(trim(coalesce(p_message,'')),''),expires_at=now()+interval '48 hours' where id=p_offer_id returning * into current_offer;
    elsif p_action = 'archive' then
      if current_offer.status not in ('paid','completed','declined','expired') then raise exception 'Only a completed, declined, or expired offer can be archived.'; end if;
      update public.offers set status='archived',archived_at=now() where id=p_offer_id returning * into current_offer;
    else
      raise exception 'Unsupported Admin offer response.';
    end if;
    return to_jsonb(current_offer);
  end if;

  if current_offer.customer_id is distinct from auth.uid() then raise exception 'Offer not found.'; end if;
  if current_offer.status <> 'countered' then raise exception 'This offer is not awaiting a member response.'; end if;
  raise exception 'Unsupported offer response.';
end;
$$;

revoke all on function public.expire_stale_member_offers() from public;
grant execute on function public.expire_stale_member_offers() to authenticated;
revoke all on function public.respond_to_member_offer(uuid,text,numeric,text) from public;
grant execute on function public.respond_to_member_offer(uuid,text,numeric,text) to authenticated;

commit;
