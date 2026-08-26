import { Window } from 'npm:happy-dom@18.0.1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const [adminSource, storefrontSource] = await Promise.all([
  Deno.readTextFile(new URL('../admin.js', import.meta.url)),
  Deno.readTextFile(new URL('../script.js', import.meta.url))
]);

function sourceRange(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Missing source range: ${start} → ${end}`);
  return source.slice(from, to);
}

function selectedSnapshotBuilder(baseline, current) {
  const categorySlug = sourceRange(adminSource, 'function categoryCardSlugForKey', '\n\nfunction buildSelectedArchitectureSnapshot');
  const builder = sourceRange(adminSource, 'function buildSelectedArchitectureSnapshot', '\n\nfunction publishSnapshotImagePaths');
  return new Function('baselineFixture', 'currentFixture', `
    let adminPublishedBaseline = structuredClone(baselineFixture);
    const ADMIN_CATEGORY_CARD_MAP = { 'sport-legend-standee': 'sports' };
    const buildDefaultPublishBaseline = () => structuredClone(baselineFixture);
    const buildNormalizedPublishSnapshot = () => structuredClone(currentFixture);
    ${categorySlug}
    ${builder}
    return buildSelectedArchitectureSnapshot;
  `)(baseline, current);
}

Deno.test('published Main Collection deletion cannot be resurrected by normalized, legacy, order, assignment, or static fallback data', () => {
  const baseline = {
    version: 1, schemaVersion: 2,
    categories: { sports: { key: 'sports', title: 'Sport Legends', page: 'sports-legends.html' } },
    deletedCategories: [],
    categoryDisplayCards: {
      'sport-legend-standee': { slug: 'sport-legend-standee', cutoutImage: 'images/legacy.png' },
      'sports-category-card': { slug: 'sports-category-card', cutoutImage: 'images/second-legacy.png' }
    },
    categorySettings: { sports: { standeeSizePercent: 80 } },
    products: { player: { slug: 'player', categories: ['sports'], categoryOrder: { sports: 1 } } },
    deletedProducts: [], homepageCategoryOrder: [['sport-legend-standee', 'sports-category-card']]
  };
  const build = selectedSnapshotBuilder(baseline, baseline);
  const published = build([{ type: 'category-delete', key: 'sports' }]);
  assert(!published.categories.sports, 'published deletion must remove the normalized Main Collection');
  assert(published.deletedCategories.includes('sports'), 'published deletion must retain the Main Collection tombstone');
  assert(!published.categoryDisplayCards['sport-legend-standee'] && !published.categoryDisplayCards['sports-category-card'], 'both legacy collection-card aliases must be removed');
  assert(!published.categorySettings.sports, 'obsolete display settings must be removed');
  assert(published.products.player.categories.length === 0 && !published.products.player.categoryOrder.sports, 'only the deleted relationship and its order may be removed from Products');
  assert(published.homepageCategoryOrder.flat().length === 0, 'deleted collection aliases must leave homepage ordering');

  const compatibilitySource = sourceRange(storefrontSource, 'function compatibilityMasterCategories', '\n\nfunction getAdminCategories');
  const window = { mvpluxPublishedAdminSettings: published, MVPLUX_PRODUCT_CATEGORIES: [{ key: 'sports', label: 'Sport Legends', page: 'sports-legends.html' }] };
  const compatibility = new Function('window', 'STOREFRONT_CATEGORY_CARD_MAP', 'STOREFRONT_CATEGORY_PAGE_MAP', `${compatibilitySource}\nreturn compatibilityMasterCategories;`)(
    window, { 'sport-legend-standee': 'sports' }, { 'sport-legend-standee': 'sports-legends.html' }
  );
  assert(!compatibility().sports, 'fresh storefront compatibility resolution must honor the published tombstone');

  const browser = new Window({ url: 'https://mvpluxcreations.com/index.html' });
  browser.document.body.innerHTML = '<div id="homepageCategoryGrid"></div><div data-homepage-category-fallback><article>Static Sport Legends</article></div>';
  browser.mvpluxPublishedAdminSettings = published;
  const fallbackHelper = sourceRange(storefrontSource, 'function homepageCategoryEmergencyFallbackAllowed', '\n\nfunction categoryDestinationWithRepresentative');
  const renderer = sourceRange(storefrontSource, 'function renderNormalizedHomepageCategoryCards', '\n\nfunction initializeInlineCategoryImageControls');
  const render = new Function('window', 'document', 'dependencies', `
    const { inlineAdminPageKey, homepageCategoryRecords, getEffectiveCategoryPresentation, escapeHtml,
      STOREFRONT_CATEGORY_CARD_MAP, categoryDestinationWithRepresentative } = dependencies;
    ${fallbackHelper}
    ${renderer}
    return renderNormalizedHomepageCategoryCards;
  `)(browser, browser.document, {
    inlineAdminPageKey: () => 'index.html', homepageCategoryRecords: () => [], getEffectiveCategoryPresentation: () => ({}),
    escapeHtml: String, STOREFRONT_CATEGORY_CARD_MAP: {}, categoryDestinationWithRepresentative: String
  });
  render();
  assert(browser.document.querySelector('[data-homepage-category-fallback]').hidden, 'explicit normalized absence must not reveal hard-coded homepage cards');
});

Deno.test('published Product deletion tombstone defeats product-catalog, custom, normalized, and static-card resurrection', () => {
  const baseline = {
    version: 1, schemaVersion: 2, categories: {}, deletedCategories: [], categoryDisplayCards: {}, categorySettings: {},
    products: { player: { slug: 'player', title: 'Published Player', categories: ['sports'] } },
    deletedProducts: [], homepageCategoryOrder: []
  };
  const current = { ...structuredClone(baseline), products: {}, deletedProducts: ['player'] };
  const build = selectedSnapshotBuilder(baseline, current);
  const published = build([{ type: 'product-delete', key: 'player' }]);
  assert(!published.products.player && published.deletedProducts.includes('player'), 'scoped Product deletion must remove the published record and retain its tombstone');

  const catalogSource = sourceRange(storefrontSource, 'function getManagedProductCatalog', '\n\nfunction getManagedProductBySlug');
  let overrides = { player: { slug: 'player', title: 'Old normalized copy', categories: ['sports'] } };
  const storefrontWindow = { MVPLUX_PRODUCT_CATALOG: [{ slug: 'player', title: 'Static catalog copy', categories: ['sports'] }], mvpluxPublishedAdminSettings: published };
  const managedCatalog = new Function('window', 'dependencies', `
    const { getAdminProducts, getAdminCustomProducts, getAdminDeletedProducts, shouldUsePrivateAdminState, sanitizeProductImageChoices } = dependencies;
    ${catalogSource}
    return getManagedProductCatalog;
  `)(storefrontWindow, {
    getAdminProducts: () => overrides,
    getAdminCustomProducts: () => [{ slug: 'player', title: 'Old custom copy', categories: ['sports'] }],
    getAdminDeletedProducts: () => published.deletedProducts,
    shouldUsePrivateAdminState: () => false,
    sanitizeProductImageChoices: (choices) => choices || []
  });
  assert(managedCatalog().length === 0, 'fresh managed catalog must reject every source carrying a tombstoned slug');

  const browser = new Window();
  browser.document.body.innerHTML = '<section id="shop"><div class="product-grid"><article class="product-card"><div class="size-builder" data-admin-slug="player"></div></article></div></section>';
  const staticRenderer = sourceRange(storefrontSource, 'function renderAdminManagedCards', '\n\nfunction applyAdminProductOverrides');
  const render = new Function('document', 'dependencies', `
    const { getAdminArchivedProducts, getAdminDeletedProducts, getAdminCustomProducts, productCardMarkup } = dependencies;
    ${staticRenderer}
    return renderAdminManagedCards;
  `)(browser.document, {
    getAdminArchivedProducts: () => [], getAdminDeletedProducts: () => ['player'], getAdminCustomProducts: () => [], productCardMarkup: () => ''
  });
  render();
  assert(browser.document.querySelector('.product-card').style.display === 'none', 'a matching hard-coded Product card must remain suppressed after fresh rendering');
});

Deno.test('explicitly removed Product relationships stay empty instead of inheriting product-catalog assignments', () => {
  const catalogSource = sourceRange(storefrontSource, 'function getManagedProductCatalog', '\n\nfunction getManagedProductBySlug');
  const groupSource = sourceRange(storefrontSource, 'function productsForCategoryGroup', '\n\nfunction orderedCategoryProducts');
  const window = {
    MVPLUX_PRODUCT_CATALOG: [{ slug: 'player', categories: ['sports', 'basketball'], categoryOrder: { sports: 1, basketball: 1 } }],
    mvpluxPublishedAdminSettings: { deletedCategories: [] }
  };
  const catalog = new Function('window', 'dependencies', `
    const { getAdminProducts, getAdminCustomProducts, getAdminDeletedProducts, shouldUsePrivateAdminState, sanitizeProductImageChoices } = dependencies;
    ${catalogSource}
    return getManagedProductCatalog;
  `)(window, {
    getAdminProducts: () => ({ player: { slug: 'player', categories: [], categoryOrder: {} } }), getAdminCustomProducts: () => [],
    getAdminDeletedProducts: () => [], shouldUsePrivateAdminState: () => false, sanitizeProductImageChoices: (choices) => choices || []
  });
  const products = catalog();
  const productsForGroup = new Function(`${groupSource}\nreturn productsForCategoryGroup;`)();
  assert(products[0].categories.length === 0, 'published explicit empty assignments must override the compatibility catalog');
  assert(productsForGroup(products, 'sports').length === 0 && productsForGroup(products, 'sports', 'basketball').length === 0, 'removed Main Collection and Child Group relationships must stay absent publicly');
});

Deno.test('Product lifecycle labels derive from the published customer snapshot and distinguish all four editor states', () => {
  const lifecycleSource = sourceRange(adminSource, 'function productLifecycleState', '\n\nfunction getProductLifecycleCounts');
  const stateFor = new Function('publishedSnapshot', 'product', 'saved', `
    let adminLiveSettings = null;
    let adminLastSuccessfulSnapshot = null;
    let adminPublishedBaseline = publishedSnapshot;
    const publishableProduct = (value) => structuredClone(value);
    const semanticProductEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);
    ${lifecycleSource}
    return productLifecycleState(product, saved, new Set());
  `);
  const product = { slug: 'player', title: 'Published title' };
  assert(stateFor({ products: { player: product } }, product, {}).label === 'LIVE', 'matching customer snapshot must be labeled live');
  assert(stateFor({ products: { player: product } }, product, { player: { title: 'New private title', approvalStatus: 'draft' } }).label === 'PUBLISHED VERSION EXISTS · DRAFT HAS UNPUBLISHED CHANGES', 'older customer version plus private edits must not look absent from the website');
  assert(stateFor({ products: {} }, product, {}).label === 'DRAFT SAVED — PRIVATE', 'saved Product with no customer snapshot must be labeled private');

  const dirtySource = sourceRange(adminSource, 'function markProductFieldDirty', '\n\nfunction schedulePlacementSave');
  let dirtyStatus = '';
  const markDirty = new Function('setProductSaveState', `${dirtySource}\nreturn markProductFieldDirty;`)((_form, message) => { dirtyStatus = message; });
  markDirty({}, 'title');
  assert(dirtyStatus === 'UNSAVED CHANGES — title', 'editing after a save must enter the explicit unsaved state');
});

Deno.test('delete controls remain private until explicit publish and expose both deletion types to the shared publisher', () => {
  const deleteProductSource = sourceRange(adminSource, 'async function deleteProduct', '\n\nasync function returnProductToDraft');
  const deleteCollectionSource = sourceRange(adminSource, 'async function deleteAdminCategories', '\n\nasync function recreateDeletedCategory');
  const reviewSource = sourceRange(adminSource, 'function architectureReviewItems', '\n\nfunction categoryCardSlugForKey');
  assert(deleteProductSource.includes('patch.deletedProducts') && deleteProductSource.includes('saved privately') && !deleteProductSource.includes('publishScopedChangeIds'), 'Delete Product must save a private tombstone without auto-publishing');
  assert(deleteCollectionSource.includes("collectionKey: 'deletedCategories'") && deleteCollectionSource.includes('saved privately') && !deleteCollectionSource.includes('publishScopedChangeIds'), 'Delete Main Collection must save privately without auto-publishing');
  assert(reviewSource.includes('product-delete:') && reviewSource.includes('category-delete:'), 'both saved deletion types must become explicit shared publish items');
});
