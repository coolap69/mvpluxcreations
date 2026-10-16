function assert(condition, message) {
  if (!condition) throw new Error(message);
}

Deno.test('every catalog and published sellable product has a valid original height', async () => {
  const pricingWindow = {};
  new Function('window', await Deno.readTextFile(new URL('../pricing.js', import.meta.url)))(pricingWindow);
  const catalogWindow = {};
  new Function('window', await Deno.readTextFile(new URL('../product-catalog.js', import.meta.url)))(catalogWindow);
  const published = JSON.parse(await Deno.readTextFile(new URL('../published-admin-settings.json', import.meta.url))).snapshot;
  for (const product of [...catalogWindow.MVPLUX_PRODUCT_CATALOG, ...Object.values(published.products || {})]) {
    assert(pricingWindow.MVPLUX_PRICING.parseHeight(product.originalHeight), `${product.slug} must have a valid originalHeight`);
  }
});

Deno.test('unknown merchandise height uses the Admin-set default through the central pricing engine', async () => {
  const pricingWindow = {};
  new Function('window', await Deno.readTextFile(new URL('../pricing.js', import.meta.url)))(pricingWindow);
  const pricing = pricingWindow.MVPLUX_PRICING;
  const settings = { defaultMerchandiseHeight: 72, fullHeight: 78, fullPrice: 129.99 };
  const height = pricing.resolveMerchandiseHeight('', settings);
  assert(height === 72, 'blank new merchandise must resolve to the Admin-set default height');
  assert(pricing.calculateHeightPrice(height, settings) === pricing.calculateHeightPrice(72, settings), 'the default must use the existing central price formula');
  assert(pricing.resolveMerchandiseHeight("5'9", settings) === 69, 'a known height must always win over the fallback');
});

Deno.test('height labels consistently show plain feet and inches without changing stored inches', async () => {
  const pricingWindow = {};
  new Function('window', await Deno.readTextFile(new URL('../pricing.js', import.meta.url)))(pricingWindow);
  const pricing = pricingWindow.MVPLUX_PRICING;
  assert(pricing.formatHeight(75) === '6 ft 3 in', '75 stored inches must display as 6 ft 3 in');
  assert(pricing.formatHeight("5'8") === '5 ft 8 in', 'saved apostrophe notation must display in the plain feet-and-inches format');
  assert(pricing.parseHeight('5 ft 8 in') === 68, 'plain feet-and-inches input must normalize to inches for pricing');
  assert(pricing.parseHeight(75) === 75, 'display formatting must not change the stored inch value used by pricing');
});

Deno.test('product creation and publishing require an effective merchandise height', async () => {
  const admin = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
  const publisher = await Deno.readTextFile(new URL('../supabase/functions/publish-admin-changes/index.ts', import.meta.url));
  assert(admin.includes('adminDefaultMerchandiseHeight') && admin.includes('parseAdminHeight(originalHeight) || adminDefaultMerchandiseHeight()'), 'Admin creation must fill unknown height from the configured fallback');
  assert(publisher.includes("collectionName === 'products' && !isValidMerchandiseHeight(product.originalHeight)"), 'publisher must reject a sellable product without a valid height');
});

Deno.test('Custom Order supports a new quote or a pre-discussed order using the same request record', async () => {
  const html = await Deno.readTextFile(new URL('../custom-order.html', import.meta.url));
  const source = await Deno.readTextFile(new URL('../custom-order.js', import.meta.url));
  assert(html.includes('name="referenceImages"') && html.includes('multiple'), 'Custom Order must accept multiple reference images');
  assert(html.includes('name="orderMode"') && html.includes('value="discussed"'), 'customer must be able to identify a pre-discussed order');
  assert(html.includes('name="fulfillmentType"') && html.includes('value="physical"') && html.includes('value="digital"'), 'customer must choose a U.S. physical standee or worldwide digital design file');
  assert(html.includes('free shipping is available only to U.S. delivery addresses') && html.includes('available worldwide with no physical shipping'), 'fulfillment choices must clearly explain shipping eligibility');
  assert(html.includes('name="agreedPrice"') && html.includes('name="tipAmount"'), 'pre-discussed order must capture the complete agreed price and optional extra');
  assert(html.includes('additional $20 underpayment processing fee'), 'underpayment consequences must be explicit before submission');
  for (const field of ['description', 'desiredHeight', 'name', 'email', 'phone', 'contactPreference']) {
    assert(html.includes(`name="${field}"`), `Custom Order must include ${field}`);
  }
  assert(source.includes('MVPLUX_PRICING.calculateHeightPrice') && source.includes('MVPLUX_PRICING.parseHeight'), 'desired size estimate must use the central pricing engine');
  assert(source.includes('/functions/v1/submit-custom-order') && source.includes('new FormData(form)'), 'the form must submit references through the secure endpoint');
  assert(source.includes('Sign in to submit a Custom Order request.') && source.includes('initializeAccountAccess'), 'Custom Orders must require and visibly verify a signed-in account');
  assert(source.includes('required: !discussed') && source.includes('form.elements.referenceImages.required = !discussed'), 'references must remain required for new quotes but optional after a design was already discussed');
  assert(source.includes('openMvpluxCustomOrderPayment') && source.includes('getMvpluxCheckoutPaymentMethods') && html.includes('data-custom-order-payment-methods'), 'a recorded pre-discussed order must continue into the shared Admin-managed payment UI');
});

Deno.test('Custom Order upload endpoint validates files and stores only private reference paths', async () => {
  const source = await Deno.readTextFile(new URL('../supabase/functions/submit-custom-order/index.ts', import.meta.url));
  const migration = await Deno.readTextFile(new URL('../supabase/migrations/20260823040000_custom_order_reference_storage.sql', import.meta.url));
  assert(source.includes('files.length > 5') && source.includes('file.size > 6_000_000'), 'endpoint must bound file count and size');
  assert(source.includes("['image/png', 'png']") && source.includes("['image/jpeg', 'jpg']") && source.includes("['image/webp', 'webp']"), 'endpoint must allow only supported image types');
  assert(source.includes("type: 'custom-order'") && source.includes('reference_images: uploaded'), 'Admin order data must store private object paths rather than embedded images');
  assert(source.includes('/auth/v1/user') && source.includes('customer_id: user.id'), 'the protected endpoint must verify the account token and own the request by that customer');
  assert(source.includes('fulfillment_type: fulfillmentType') && source.includes("requires_shipping: fulfillmentType === 'physical'"), 'the normalized request must distinguish physical shipping from digital delivery');
  assert(source.includes("orderMode === 'discussed'") && source.includes('awaiting_manual_verification'), 'pre-discussed requests must remain pending manual payment verification');
  assert(source.includes('original_amount: agreedPrice') && source.includes('total: paymentTotal'), 'agreed price and optional extra must be stored in the existing order totals');
  assert(source.includes("!alreadyDiscussed && !files.length"), 'the endpoint must allow no new reference only for a pre-discussed order');
  assert(migration.includes("'custom-order-references'") && migration.includes('public = false'), 'reference bucket must remain private');
  assert(migration.includes('Admins view custom order references'), 'only approved Admins may read stored references');
});

Deno.test('Custom Order server insert is restored without allowing direct browser inserts', async () => {
  const migration = await Deno.readTextFile(new URL('../supabase/migrations/20261015120000_restore_server_custom_order_insert.sql', import.meta.url));
  assert(migration.includes('revoke insert on table public.order_requests from anon, authenticated'), 'anonymous and signed-in browsers must remain unable to insert Custom Orders directly');
  assert(migration.includes('grant insert on table public.order_requests to service_role'), 'the protected Custom Order function must be able to record requests');
  assert(!/grant\s+insert[^;]+\b(anon|authenticated)\b/i.test(migration), 'the repair must not expose direct browser insert access');
});

Deno.test('Custom Order emails are server-side, post-persistence, and honestly reported', async () => {
  const [endpoint, browser, html] = await Promise.all([
    Deno.readTextFile(new URL('../supabase/functions/submit-custom-order/index.ts', import.meta.url)),
    Deno.readTextFile(new URL('../custom-order.js', import.meta.url)),
    Deno.readTextFile(new URL('../custom-order.html', import.meta.url))
  ]);
  const insert = endpoint.indexOf("fetch(`${url}/rest/v1/order_requests`");
  const insertCheck = endpoint.indexOf('if (!insert.ok)', insert);
  const notifications = endpoint.indexOf('await sendCustomOrderNotifications', insertCheck);
  assert(insert >= 0 && insertCheck > insert && notifications > insertCheck, 'notifications must run only after the request insert succeeds');
  assert(endpoint.includes("Deno.env.get('RESEND_API_KEY')") && endpoint.includes("Deno.env.get('CUSTOM_ORDER_ADMIN_EMAIL')"), 'email credentials and Admin destination must remain server secrets');
  assert(endpoint.includes('customer: customerResult.sent') && endpoint.includes('admin: adminResult.sent'), 'the response must report customer and Admin delivery separately');
  assert(endpoint.includes('Custom Order submission failed — customer follow-up needed') && endpoint.includes('This is an alert, not a saved order.'), 'a validated server failure must alert Admin without pretending the request was saved');
  assert(browser.includes('Your request was saved, but an email confirmation could not be sent.'), 'the browser must distinguish a saved request from a failed confirmation email');
  assert(!browser.includes('RESEND_API_KEY') && !html.includes('RESEND_API_KEY'), 'no email provider credential may enter customer JavaScript or HTML');
});

Deno.test('Admin has a private searchable complete Custom Order history page', async () => {
  const [html, admin] = await Promise.all([
    Deno.readTextFile(new URL('../admin.html', import.meta.url)),
    Deno.readTextFile(new URL('../admin.js', import.meta.url))
  ]);
  assert(html.includes('href="#custom-order-requests"') && html.includes('id="custom-order-requests"'), 'Admin navigation must expose the private Custom Order history');
  assert(html.includes('id="adminCustomOrderSearch"') && html.includes('id="adminCustomOrderStatusFilter"') && html.includes('id="loadMoreCustomOrderRequests"'), 'history must support search, status filtering, and loading older requests');
  assert(admin.includes(".contains('items', [{ type: 'custom-order' }])"), 'the page must show only normalized Custom Order records');
  assert(admin.includes('ADMIN_CUSTOM_ORDER_PAGE_SIZE = 50') && admin.includes('.range(adminCustomOrderOffset'), 'requests must be paginated without deleting or hiding older history');
  assert(admin.includes("area === 'custom-order-requests'") && admin.includes('loadAdminCustomOrderRequests'), 'the protected Admin area must load its history on demand');
  assert(admin.includes('loadAdminCustomOrderNotificationCount') && admin.includes('New Custom Order requests'), 'Admin must show a lightweight new-request notification without depending on email delivery');
});

Deno.test('pre-discussed Custom Order payment never auto-approves or starts production', async () => {
  const [storefront, admin] = await Promise.all([
    Deno.readTextFile(new URL('../script.js', import.meta.url)),
    Deno.readTextFile(new URL('../admin.js', import.meta.url))
  ]);
  const customPaymentStart = storefront.indexOf('window.openMvpluxCustomOrderPayment');
  const customPayment = storefront.slice(customPaymentStart, customPaymentStart + 1200);
  assert(customPayment.includes('openPaymentOption(method)') && !customPayment.includes("p_status: 'in_production'"), 'custom payment must reuse payment instructions without starting production');
  assert(storefront.includes('manually verifies the full payment'), 'customer payment instructions must explain manual verification');
  assert(admin.includes('Pre-discussed order — verify payment manually before production.'), 'Admin must show the verification requirement');
  assert(admin.includes("status === 'new'") && admin.includes("status: 'in_production', label: 'Start Production'"), 'Admin must retain the explicit manual Start Production action');
  assert(admin.includes("data-order-status=\"rejected\""), 'Admin must retain the explicit Reject Order action');
});

Deno.test('Admin Custom Order AI helper is editable and never saves, approves, or publishes', async () => {
  const admin = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
  const assistant = await Deno.readTextFile(new URL('../supabase/functions/admin-content-assistant/index.ts', import.meta.url));
  const helperStart = admin.indexOf('async function generateCustomOrderDesignBrief');
  const helperEnd = admin.indexOf('\n\nasync function', helperStart + 20);
  const helper = admin.slice(helperStart, helperEnd > helperStart ? helperEnd : helperStart + 6000);
  assert(admin.includes('data-custom-order-design-brief') && admin.includes('data-generate-custom-order-brief'), 'Admin orders must expose the editable helper');
  assert(assistant.includes("'designBrief'") && assistant.includes('Never claim artwork is approved or ready to publish.'), 'existing secure assistant must support safe design briefs');
  assert(helper.includes('output.value =') && !helper.includes('saveAdminSettingsLive') && !helper.includes('publishAdminChanges'), 'AI must only fill the editable textarea');
});

Deno.test('homepage Category cards remain browse-only with full-width bottom-anchored artwork', async () => {
  const [html, source, presentationSource, css] = await Promise.all([
    Deno.readTextFile(new URL('../index.html', import.meta.url)),
    Deno.readTextFile(new URL('../script.js', import.meta.url)),
    Deno.readTextFile(new URL('../category-presentation.js', import.meta.url)),
    Deno.readTextFile(new URL('../style.css', import.meta.url))
  ]);
  const renderer = source.slice(source.indexOf('function renderNormalizedHomepageCategoryCards'), source.indexOf('\n\nfunction managedCategoryCardMarkup'));
  assert(html.includes('id="homepageCategoryGrid"'), 'homepage must retain its dedicated Category mount');
  assert(renderer.includes('View Collection') && !renderer.includes('size-builder') && !renderer.includes('Buy Now') && !renderer.includes('Offer'), 'Category cards must be navigation cards, not purchase forms');
  assert(css.includes('width: min(96%, 1400px);') && css.includes('#homepageCategoryGrid .admin-category-storefront-stage'), 'Featured Categories must use the major-panel width and anchored stage treatment');
  assert(renderer.includes('layout.imageBottomPercent') && presentationSource.includes('2 - clampNumber(display.standeeVerticalPercent') && presentationSource.includes("'center bottom'"), 'shared card layout must anchor the standee and fallback background near the stage bottom');
});

Deno.test('auth restoration keeps public and signed-in startup visible while private state revalidates', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const init = source.slice(source.indexOf("document.addEventListener('DOMContentLoaded'"));
  const start = init.indexOf('const authStatePromise = syncSupabaseAuthState()');
  const cachedPrivate = init.indexOf('const cachedPrivateAdminState = shouldLoadPrivateAdminState()');
  const published = init.indexOf('await loadPublishedAdminSettings()');
  const render = init.indexOf('renderNormalizedHomepageCategoryCards()', published);
  const wait = init.indexOf('await authStatePromise');
  assert(start >= 0 && start < published, 'persisted Supabase session restoration must start immediately');
  assert(cachedPrivate > start && cachedPrivate < published && render > published && wait > render, 'storefront rendering must remain fast while private Admin state revalidates after paint');
  assert(!init.includes('deferInitialStorefrontPresentation'), 'signed-in browsing must never wait behind a private-preview loading shell');
});
