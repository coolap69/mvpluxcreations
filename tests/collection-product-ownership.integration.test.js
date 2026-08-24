import { filterProductsForCategoryGroup, withProductCategories } from '../admin-state-utils.js';
import { Window } from 'npm:happy-dom@18.0.1';

const storefrontSource = await Deno.readTextFile(new URL('../script.js', import.meta.url));
const adminSource = await Deno.readTextFile(new URL('../admin.js', import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceRange(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert(start >= 0 && end > start, `missing source range ${startToken}`);
  return source.slice(start, end);
}

Deno.test('published Product records never become Homepage Collection Cards', () => {
  const getPublishedProducts = new Function('window', `${sourceRange(storefrontSource, 'function getPublishedProducts', 'function getAdminProducts')}\nreturn getPublishedProducts;`)({
    mvpluxPublishedAdminSettings: {
      products: { jordan: { slug: 'jordan', title: 'Michael Jordan', categories: ['sports', 'basketball'] } },
      categoryDisplayCards: { 'sport-legend-standee': { slug: 'sport-legend-standee', title: 'Legacy Sport Legends' } }
    }
  });
  const products = getPublishedProducts();
  assert(Object.keys(products).join(',') === 'jordan', 'legacy Homepage Collection Cards must not enter the Product catalog');
  const homepageSelector = sourceRange(storefrontSource, 'function homepageCategoryRecords', 'function renderNormalizedHomepageCategoryCards');
  assert(homepageSelector.includes('Object.values(categories || {})') && !homepageSelector.includes('getPublishedProducts'), 'homepage collection selection must read only normalized Main Category / Collection records');
  const compatibility = sourceRange(storefrontSource, 'function compatibilityMasterCategories', 'function getAdminCategories');
  assert(compatibility.includes('const key = STOREFRONT_CATEGORY_CARD_MAP[slug];') && !compatibility.includes("slug.replace(/-category-card$/"), 'an arbitrary legacy Product-like record must not be promoted into a Main Collection');
  const resolveCompatibility = new Function('window', 'STOREFRONT_CATEGORY_CARD_MAP', 'STOREFRONT_CATEGORY_PAGE_MAP', `${compatibility}\nreturn compatibilityMasterCategories;`)({
    MVPLUX_PRODUCT_CATEGORIES: [{ key: 'sports', label: 'Sport Legends', page: 'sports-legends.html' }],
    mvpluxPublishedAdminSettings: {
      categories: {}, deletedCategories: [],
      categoryDisplayCards: {
        'sport-legend-standee': { title: 'Sport Legends', cutoutImage: 'images/sports.png' },
        'new-basketball-product': { title: 'New Basketball Product', cutoutImage: 'images/player.png' }
      }
    }
  }, { 'sport-legend-standee': 'sports' }, { 'sport-legend-standee': 'sports-legends.html' });
  const collections = resolveCompatibility();
  assert(Object.keys(collections).join(',') === 'sports', 'a Product mistakenly present in legacy compatibility data must not create a Homepage Collection Card');
});

Deno.test('normalized-only Image Box products enter collection pages and published images override Sports fallback data', () => {
  const catalog = sourceRange(storefrontSource, 'function getManagedProductCatalog', 'function getAdminArchivedProducts');
  assert(catalog.includes('...Object.values(overrides)') && catalog.includes('...(overrides[slug] || {})'), 'normalized products must enter the managed collection catalog and remain authoritative over compatibility products');
  const sportsSelection = sourceRange(storefrontSource, 'function selectSportsStandee', 'function initSportsShowroom');
  assert(sportsSelection.includes('const product = managed ?') && sportsSelection.indexOf('const product = managed ?') < sportsSelection.indexOf('catalogProduct ?'), 'a published normalized Sports product must win over the static compatibility catalog');
  assert(sportsSelection.includes("image: managed.cutoutImage"), 'the selected showroom image must come from the normalized Product / Standee record');
});

Deno.test('fresh Sport Legends showroom DOM reconstructs the selected image from the normalized published Product', () => {
  const window = new Window({ url: 'https://mvpluxcreations.com/sports-legends.html' });
  window.document.body.innerHTML = `<section class="sports-showroom"><div id="sportsMainStage"><img id="sportsMainImage"></div><div id="sportsSelectedSport"></div><h2 id="sportsSelectedName"></h2><p id="sportsSelectedDescription"></p><div id="sportsSelectedFacts"></div><div class="sports-choice-section"><div id="sportsOptionStrip"></div></div><div id="sportsSizeBuilder"></div></section>`;
  const framework = sourceRange(storefrontSource, 'function selectSportsOption', 'function bindSportsShowroomClicks');
  const normalized = {
    slug: 'player-one', title: 'Published Player', description: 'Published description', originalHeight: 81,
    cutoutImage: 'images/published-player.png', backgroundImage: 'images/published-stage.png',
    categories: ['sports'], imageChoices: [{ label: 'Alternate', image: 'images/published-alt.png' }]
  };
  const select = new Function('window', 'document', 'dependencies', `
    const { getManagedProductBySlug, sanitizeProductImageChoices, formatHeight, updateShowroomPurchase,
      findWhiteTriangleImage, applyInlineAdminEdits, updateCategoryGroupCurrentProduct, getShowroomStageBackground } = dependencies;
    let selectedSportsStandeeKey = 'player-one';
    const sportsStandeeCatalog = { 'player-one': { name: 'Static Old Player', options: [{ label: 'Old', image: 'images/static-old.png' }] } };
    ${framework}
    return selectSportsStandee;
  `)(window, window.document, {
    getManagedProductBySlug: () => structuredClone(normalized),
    sanitizeProductImageChoices: (choices) => choices || [], formatHeight: (height) => `${height} inches`,
    updateShowroomPurchase: () => {}, findWhiteTriangleImage: () => '', applyInlineAdminEdits: () => {},
    updateCategoryGroupCurrentProduct: () => {}, getShowroomStageBackground: () => 'images/default.png'
  });
  select('player-one', false);
  assert(window.document.getElementById('sportsMainImage').getAttribute('src') === 'images/published-player.png', 'fresh showroom selection must replace the static fallback with the normalized published image');
  assert(window.document.getElementById('sportsSelectedName').textContent === 'Published Player', 'fresh showroom title must also use the normalized Product / Standee');
  assert(window.document.querySelector('#sportsOptionStrip img').getAttribute('src') === 'images/published-player.png', 'published primary image must own the image-choice strip after reload');
});

Deno.test('Remove from Collection and Remove from Child Group preserve the product and unrelated assignments', () => {
  const original = {
    slug: 'jordan', title: 'Michael Jordan', cutoutImage: 'images/jordan.png', originalHeight: 78,
    categories: ['sports', 'basketball', 'fan-requests'], categoryOrder: { sports: 1, basketball: 2, 'fan-requests': 3 }
  };
  const withoutMain = withProductCategories(original, original.categories.filter((key) => key !== 'sports'));
  assert(withoutMain.slug === 'jordan' && withoutMain.cutoutImage === original.cutoutImage && withoutMain.originalHeight === 78, 'removing a Collection assignment must preserve the normalized Product / Standee');
  assert(withoutMain.categories.join(',') === 'basketball,fan-requests' && !('sports' in withoutMain.categoryOrder), 'only the Main Collection assignment and its order entry may be removed');
  assert(filterProductsForCategoryGroup({ jordan: withoutMain }, 'sports', 'basketball').length === 0, 'a dormant Child Group relationship must not make the product customer-visible without its Main Collection');
  const withoutChild = withProductCategories(original, original.categories.filter((key) => key !== 'basketball'));
  assert(withoutChild.categories.join(',') === 'sports,fan-requests' && !('basketball' in withoutChild.categoryOrder), 'removing a Child Group must preserve its Main Collection and every unrelated assignment');
});

Deno.test('storefront Admin Mode saves the exact selected Collection or Child Group assignment as a Product draft', async () => {
  const removeSource = sourceRange(storefrontSource, 'async function removeManagedProductFromCurrentSection', 'async function moveManagedProductInCurrentSection');
  const savedPatches = [];
  const cardsRemoved = [];
  const remove = new Function('dependencies', `
    const { getCurrentProductCategory, categoryGroupState, getManagedProductBySlug, saveManagedProductPatch, updateInlineAdminToolbarState } = dependencies;
    ${removeSource}
    return removeManagedProductFromCurrentSection;
  `)({
    getCurrentProductCategory: () => 'sports',
    categoryGroupState: () => ({ activeChild: { key: 'basketball' } }),
    getManagedProductBySlug: () => ({ slug: 'jordan', categories: ['sports', 'basketball', 'fan-requests'], categoryOrder: { sports: 1, basketball: 2, 'fan-requests': 3 } }),
    saveManagedProductPatch: async (slug, patch) => { savedPatches.push({ slug, patch }); return true; },
    updateInlineAdminToolbarState: () => {}
  });
  await remove({ dataset: { productId: 'jordan' }, remove: () => cardsRemoved.push('jordan') });
  assert(savedPatches.length === 1 && savedPatches[0].slug === 'jordan', 'Admin Mode must save one exact normalized Product / Standee record');
  assert(savedPatches[0].patch.categories.join(',') === 'sports,fan-requests', 'the active Child Group key must be the only assignment removed');
  assert(!('basketball' in savedPatches[0].patch.categoryOrder) && cardsRemoved.length === 1, 'the matching Child Group order must be removed only after save succeeds');
  assert(removeSource.includes('Draft Saved') && removeSource.includes('publish this Product / Standee when ready'), 'draft and explicit publication must remain unambiguous');
});

Deno.test('Dashboard and storefront use the same normalized Product assignment and separate destructive actions', () => {
  const dashboardSave = sourceRange(adminSource, 'async function saveCategoryProductAssignments', 'async function saveNewChildGroupFromForm');
  assert(dashboardSave.includes("collectionKey: 'products'") && dashboardSave.includes('withProductCategories(product, selected)'), 'Dashboard assignment editing must patch the same normalized products collection');
  assert(adminSource.includes('Remove from ${category.parentKey ? \'Child Group\' : \'Collection\'}') && adminSource.includes('Publish Product / Standee'), 'Dashboard must expose relationship removal and explicit Product publication separately');
  assert(storefrontSource.includes('data-admin-card-action="delete-product">Delete Product</button>') && storefrontSource.includes('removeManagedProductFromCurrentSection'), 'true Product deletion must remain separate from removing a Collection relationship');
});
