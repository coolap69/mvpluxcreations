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

Deno.test('product creation and publishing require an effective merchandise height', async () => {
  const admin = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
  const publisher = await Deno.readTextFile(new URL('../supabase/functions/publish-admin-changes/index.ts', import.meta.url));
  assert(admin.includes('adminDefaultMerchandiseHeight') && admin.includes('parseAdminHeight(originalHeight) || adminDefaultMerchandiseHeight()'), 'Admin creation must fill unknown height from the configured fallback');
  assert(publisher.includes("collectionName === 'products' && !isValidMerchandiseHeight(product.originalHeight)"), 'publisher must reject a sellable product without a valid height');
});

Deno.test('Custom Order page supports multiple private references, description, size, contact, and immediate estimate', async () => {
  const html = await Deno.readTextFile(new URL('../custom-order.html', import.meta.url));
  const source = await Deno.readTextFile(new URL('../custom-order.js', import.meta.url));
  assert(html.includes('name="referenceImages"') && html.includes('multiple required'), 'Custom Order must accept multiple reference images');
  for (const field of ['description', 'desiredHeight', 'name', 'email', 'phone', 'contactPreference']) {
    assert(html.includes(`name="${field}"`), `Custom Order must include ${field}`);
  }
  assert(source.includes('MVPLUX_PRICING.calculateHeightPrice') && source.includes('MVPLUX_PRICING.parseHeight'), 'desired size estimate must use the central pricing engine');
  assert(source.includes('/functions/v1/submit-custom-order') && source.includes('new FormData(form)'), 'the form must submit references through the secure endpoint');
});

Deno.test('Custom Order upload endpoint validates files and stores only private reference paths', async () => {
  const source = await Deno.readTextFile(new URL('../supabase/functions/submit-custom-order/index.ts', import.meta.url));
  const migration = await Deno.readTextFile(new URL('../supabase/migrations/20260823040000_custom_order_reference_storage.sql', import.meta.url));
  assert(source.includes('files.length > 5') && source.includes('file.size > 6_000_000'), 'endpoint must bound file count and size');
  assert(source.includes("['image/png', 'png']") && source.includes("['image/jpeg', 'jpg']") && source.includes("['image/webp', 'webp']"), 'endpoint must allow only supported image types');
  assert(source.includes("type: 'custom-order'") && source.includes('reference_images: uploaded'), 'Admin order data must store private object paths rather than embedded images');
  assert(migration.includes("'custom-order-references'") && migration.includes('public = false'), 'reference bucket must remain private');
  assert(migration.includes('Admins view custom order references'), 'only approved Admins may read stored references');
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
  assert(renderer.includes('2 - display.standeeVerticalPercent') && presentationSource.includes("'center bottom'"), 'standee and shared fallback background must anchor near the stage bottom');
});

Deno.test('auth restoration starts before storefront snapshot loading but is awaited after public rendering', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const init = source.slice(source.indexOf("document.addEventListener('DOMContentLoaded'"));
  const start = init.indexOf('const authStatePromise = syncSupabaseAuthState()');
  const published = init.indexOf('await loadPublishedAdminSettings()');
  const render = init.indexOf('renderNormalizedHomepageCategoryCards()', published);
  const wait = init.indexOf('await authStatePromise');
  assert(start >= 0 && start < published, 'persisted Supabase session restoration must start immediately');
  assert(render > published && wait > render, 'public Categories must render before startup waits for Admin authorization');
});
