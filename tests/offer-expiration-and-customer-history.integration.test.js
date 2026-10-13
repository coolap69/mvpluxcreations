function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const admin = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
const adminHtml = await Deno.readTextFile(new URL('../admin.html', import.meta.url));
const member = await Deno.readTextFile(new URL('../member-account.js', import.meta.url));
const storefront = await Deno.readTextFile(new URL('../script.js', import.meta.url));
const schema = await Deno.readTextFile(new URL('../supabase-schema.sql', import.meta.url));
const migration = await Deno.readTextFile(new URL('../supabase/migrations/20261013160000_offer_expiration_and_customer_history.sql', import.meta.url));

Deno.test('Admin counteroffers give customers 48 hours while Admin decisions never expire', () => {
  assert(migration.includes("expires_at=now()+interval '48 hours'") || migration.includes("expires_at = now() + interval '48 hours'"), 'Admin counteroffers must receive an authoritative 48-hour deadline.');
  assert(migration.includes("current_offer.status = 'countered'") && migration.includes("current_offer.expires_at <= now()"), 'Customer response must be refused after the deadline.');
  assert(!migration.includes("status = 'pending' and expires_at"), 'Pending offers waiting for Admin must not expire.');
  assert(migration.includes("status='buyer_countered'") && migration.includes('expires_at=null'), 'A customer counteroffer must clear the response deadline and wait for Admin indefinitely.');
});

Deno.test('expiration preserves offer records and records an Admin-visible history event', () => {
  assert(migration.includes("set status = 'expired'"), 'Expired offers must transition to a preserved status.');
  assert(!/delete\s+from\s+public\.offers\s+where\s+status\s*=\s*'countered'/i.test(migration), 'Expiration must never delete the offer record.');
  assert(migration.includes("new.status in ('accepted','accepted_awaiting_payment','declined','expired'"), 'The offer timeline must record expiration.');
  assert(schema.includes('expire_stale_member_offers') && schema.includes('expires_at timestamptz'), 'The canonical schema must include the expiration lifecycle.');
});

Deno.test('customer account shows a live countdown and moves expired offers to Past Offers', () => {
  assert(member.includes('data-member-offer-countdown') && member.includes('setInterval(updateMemberOfferCountdowns, 1000)'), 'Customers must see a clock that updates every second.');
  assert(member.includes("expired: 'Expired — response period ended'"), 'Expired offers must have a clear customer status.');
  assert(member.includes("client.rpc('expire_stale_member_offers')"), 'Customer account loading must securely expire stale owned offers.');
  assert(storefront.includes('storefrontOfferEffectiveStatus') && storefront.includes("data?.status === 'expired'"), 'The storefront must not let an expired counteroffer remain actionable.');
  assert(storefront.includes('data-storefront-offer-countdown') && storefront.includes('setInterval(updateStorefrontOfferCountdowns, 1000)'), 'The storefront Offer panel must show the same live countdown.');
});

Deno.test('Admin has bounded searchable rejection, offer, and purchase history', () => {
  assert(adminHtml.includes('data-commerce-tab="customer-history"') && adminHtml.includes('Customer Offer & Purchase History'), 'Orders & Offers must expose a dedicated Customer History page.');
  assert(adminHtml.includes('id="adminOffersExpired"') && adminHtml.includes('Expired Offers'), 'Expired offers must remain visible to Admin.');
  assert(admin.includes(".select('id,product_name,customer_name,customer_email,amount,status,seller_counter_amount,buyer_final_amount,created_at,updated_at,expires_at,is_test')"), 'History search must request only the offer fields it needs.');
  assert(admin.includes('.limit(100)') && admin.includes('customer_email.ilike'), 'History searches must be searchable and bounded.');
  assert(admin.includes('Your counteroffer:') && admin.includes('Customer offered:'), 'Admin history must show past customer and Admin offer amounts.');
  assert(admin.includes('Purchased / order history'), 'Customer history must identify prior purchase/order records.');
});

console.log('Offer expiration and searchable customer history checks passed.');
