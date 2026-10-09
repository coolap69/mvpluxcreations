function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const script = await Deno.readTextFile(new URL('../script.js', import.meta.url));
const admin = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
const adminHtml = await Deno.readTextFile(new URL('../admin.html', import.meta.url));
const homepage = await Deno.readTextFile(new URL('../index.html', import.meta.url));
const schema = await Deno.readTextFile(new URL('../supabase-schema.sql', import.meta.url));
const migration = await Deno.readTextFile(new URL('../supabase/migrations/20261008233000_us_only_shipping_and_order_rejection.sql', import.meta.url));

const normalizeSource = script.match(/function normalizeShippingCountry\(value\) \{[\s\S]*?\n\}/)?.[0];
const countrySource = script.match(/function isUnitedStatesShippingCountry\(value\) \{[\s\S]*?\n\}/)?.[0];
assert(normalizeSource && countrySource, 'Checkout must expose one reusable U.S. country validator.');
const isUnitedStates = new Function(`${normalizeSource}\n${countrySource}\nreturn isUnitedStatesShippingCountry;`)();

for (const value of ['US', 'USA', 'United States', 'United States of America']) {
  assert(isUnitedStates(value), `${value} should be accepted by website checkout.`);
}
for (const value of ['Spain', 'España', 'Canada', '', 'United Kingdom']) {
  assert(!isUnitedStates(value), `${value || 'an empty country'} must not be accepted by website checkout.`);
}

assert(script.includes('International website checkout is not available yet'), 'Checkout must explain the temporary international restriction.');
assert(script.includes('3–5 additional business days')
  && script.includes("carrier's delivery time")
  && script.includes('purchase and email us your shipping label')
  && script.includes('matching eBay listing')
  && script.includes('marketplace fees')
  && script.includes('$15 handling fee'),
'Checkout must explain the eBay and customer-purchased-label international alternatives.');
assert(script.includes('Free within the USA') && homepage.includes('Free U.S. shipping included'), 'Free shipping must be labeled as U.S.-only everywhere customers see it.');
assert(script.includes('checkoutPaymentIsAuthorized()') && script.includes('Submit the U.S. order request before opening payment instructions.'), 'Payment instructions must remain locked until a valid order request succeeds.');

assert(migration.includes('before insert or update of shipping_address on public.order_requests'), 'The database must reject bypassed international order submissions.');
assert(migration.includes('before update of payment_shipping_address on public.offers'), 'Accepted-offer checkout must enforce the same shipping restriction.');
assert(migration.includes("'rejected'"), 'The protected Admin status operation must support rejected orders.');
assert(schema.includes('enforce_us_order_shipping') && schema.includes("'rejected'"), 'The canonical schema must include the shipping guard and rejection status.');

assert(adminHtml.includes('id="adminOrdersRejected"') && adminHtml.includes('Rejected Orders'), 'Orders Admin must have a visible preserved Rejected queue.');
assert(admin.includes('data-order-status="rejected"') && admin.includes('Reject Order'), 'Eligible orders must expose a Reject Order action.');
assert(admin.includes('isInternationalOrderAddress') && admin.includes('Reject & Prepare Apology Email'), 'International orders must be clearly identified with a specific rejection action.');
assert(admin.includes('This does not issue a refund') && admin.includes('No refund was issued automatically'), 'Admin must not imply that rejection automatically refunded payment.');
assert(admin.includes("const canReject = ['new', 'in_production'].includes(status)"), 'Only unshipped active orders should expose the ordinary rejection action.');
assert(admin.includes('function rejectedOrderApologyEmail')
  && admin.includes('Reject & Prepare Apology Email')
  && admin.includes('Open Apology Email Again'),
'Rejected international orders must retain a reviewable apology-email action.');
assert(admin.includes('printer sends the finished standee to MVPLUXCREATIONS first')
  && admin.includes('3–5 additional business days')
  && admin.includes("carrier's delivery time is additional")
  && admin.includes('packaged dimensions and weight')
  && admin.includes('purchase the international shipping label yourself')
  && admin.includes('matching eBay listing')
  && admin.includes('eBay price may be different')
  && admin.includes('$15 handling fee'),
'The apology must accurately offer the eBay and manual international fulfillment options.');
assert(admin.includes('review the message and press Send yourself')
  && admin.includes('No refund was issued automatically'),
'Admin must distinguish preparing an email from sending it and rejecting from refunding it.');

console.log('U.S.-only shipping and preserved order rejection checks passed.');
