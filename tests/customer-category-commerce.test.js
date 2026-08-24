import { filterProductsForCategoryGroup } from '../admin-state-utils.js';
import { Window } from 'npm:happy-dom@18.0.1';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
const sportsHtml = await Deno.readTextFile(new URL('../sports-legends.html', import.meta.url));
const standeeHtml = await Deno.readTextFile(new URL('../standee.html', import.meta.url));

function between(startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert(start >= 0 && end > start, `Could not isolate ${startToken}`);
  return source.slice(start, end);
}

Deno.test('Main and Child Group filtering preserves the existing shared Sports purchase showroom', () => {
  const filteredRenderer = between('function renderManagedCategoryPageProducts()', 'function renderGenericCategoryOptions');
  const purchase = between('function showroomPurchaseMarkup', 'function updateShowroomPurchase');
  assert(filteredRenderer.includes("onclick=\"selectSportsStandee('") && filteredRenderer.includes('sports-player-card'), 'filtered Sports cards must keep the existing Sports selection path');
  for (const control of ['Buy Now', 'addSelectedToCart(this)', 'Offer Now', 'live-size-price']) assert(purchase.includes(control), `shared Sports showroom lost ${control}`);
  for (const control of ['Buy Now', 'addSelectedToCart(this)', 'Offer Now', 'sportsSizeBuilder']) assert(sportsHtml.includes(control), `published Sports page lost ${control}`);
});

Deno.test('normal product-page purchase UI retains prices, sizes, Buy, and cart controls', () => {
  const detail = between('function renderStandeeDetailPage()', 'function bindCategoryStandeeCards');
  for (const control of ['live-size-price', 'Original Size', 'Custom Size', 'Buy It Now', 'addSelectedToCart(this)', 'Pick Your Own Size']) assert(detail.includes(control), `product detail lost ${control}`);
  assert(standeeHtml.includes('cartPanel') && standeeHtml.includes('cartTotal'), 'normal product page must retain the cart shell');
  assert(source.includes('function openSelectedOffer') && source.includes('function openOffer'), 'existing Offer/bidding implementation must remain intact');
});

Deno.test('Child Group results and related discovery deduplicate products by slug', () => {
  const fixture = {
    kobe: { slug: 'kobe', visible: true, categories: ['sports', 'basketball'] },
    duplicate: { slug: 'kobe', visible: true, categories: ['sports', 'basketball'] },
    jordan: { slug: 'jordan', visible: true, categories: ['sports', 'basketball'] },
    messi: { slug: 'messi', visible: true, categories: ['sports', 'soccer'] }
  };
  assert(filterProductsForCategoryGroup(fixture, 'sports', 'basketball').map((product) => product.slug).join(',') === 'kobe,jordan', 'filtered cards must deduplicate by slug');
  const related = between('function relatedProductGroups', 'function setStandeeBackground');
  assert(related.includes('categoryGroupDiscovery(masterKey, child.key, currentSlug') && related.includes('item.slug !== currentSlug'), 'related products must exclude the current product and reuse generic Child Group discovery');
  assert(related.includes('discovery.primary') && related.includes('discovery.secondary'), 'related discovery must present Child Group products before broader Main Category discovery');
  assert(related.includes('standee.html?item='), 'related cards must lead to the existing normal product page');
});

Deno.test('invalid or hidden Child Group URLs remain unavailable without changing current Sports data', async () => {
  const groupFramework = between('function visibleCategoryChildGroups', 'function renderCategoryGroupNavigation');
  assert(groupFramework.includes('category.visible !== false'), 'hidden Child Groups must be excluded from customer navigation');
  assert(groupFramework.includes("requestedKey: invalidRequestedGroup ? '' : requestedKey"), 'invalid Child Group query must safely fall back to All');
  assert(groupFramework.includes('unavailable: hiddenRequestedChild'), 'hidden Child Group query must remain unavailable');
  const published = JSON.parse(await Deno.readTextFile(new URL('../published-admin-settings.json', import.meta.url))).snapshot;
  assert(!Object.values(published.categories || {}).some((category) => category.parentKey === 'sports'), 'this code task must not create real Sports Child Groups');
});

Deno.test('Child Group discovery is generic, ordered, and excludes current or already shown slugs', () => {
  const framework = between('function productsForCategoryGroup', 'function bindCategoryGroupNavigation');
  const categoryGroupDiscovery = new Function(`
    ${framework}
    return categoryGroupDiscovery;
  `)();
  const categories = {
    sports: { key: 'sports', title: 'Sports', visible: true },
    basketball: { key: 'basketball', title: 'Basketball', parentKey: 'sports', visible: true },
    soccer: { key: 'soccer', title: 'Soccer', parentKey: 'sports', visible: true },
    movies: { key: 'movies', title: 'Movies', visible: true },
    robots: { key: 'robots', title: 'Robots', parentKey: 'movies', visible: true },
    heroes: { key: 'heroes', title: 'Heroes', parentKey: 'movies', visible: true }
  };
  const products = [
    { slug: 'current', title: 'Current', visible: true, categories: ['sports', 'basketball'], categoryOrder: { basketball: 0, sports: 0 } },
    { slug: 'jordan', title: 'Jordan', visible: true, categories: ['sports', 'basketball'], categoryOrder: { basketball: 1, sports: 1 } },
    { slug: 'messi', title: 'Messi', visible: true, categories: ['sports', 'soccer'], categoryOrder: { sports: 2 } },
    { slug: 'brady', title: 'Brady', visible: true, categories: ['sports', 'soccer'], categoryOrder: { sports: 3 } },
    { slug: 'robot-current', title: 'Robot Current', visible: true, categories: ['movies', 'robots'], categoryOrder: { robots: 0 } },
    { slug: 'robot-two', title: 'Robot Two', visible: true, categories: ['movies', 'robots'], categoryOrder: { robots: 1 } },
    { slug: 'hero-one', title: 'Hero One', visible: true, categories: ['movies', 'heroes'], categoryOrder: { movies: 2 } }
  ];
  const sports = categoryGroupDiscovery('sports', 'basketball', 'current', products, categories, 4, 0);
  assert(sports.primary.map((item) => item.slug).join(',') === 'jordan', 'primary discovery must contain only the selected Child Group in its saved order and exclude current');
  assert(sports.secondary.map((item) => item.slug).join(',') === 'messi,brady', 'secondary discovery must use the Main Category without duplicating current or primary products');
  assert(categoryGroupDiscovery('sports', 'basketball', 'current', products, categories, 4, 1).secondary.map((item) => item.slug).join(',') === 'brady,messi', 'secondary discovery must rotate while preserving the preferred sibling-product pool');
  const movies = categoryGroupDiscovery('movies', 'robots', 'robot-current', products, categories, 4, 0);
  assert(movies.primary.map((item) => item.slug).join(',') === 'robot-two' && movies.secondary.map((item) => item.slug).join(',') === 'hero-one', 'the same hierarchy algorithm must work for a non-Sports fixture');
  const allSlugs = [...sports.primary, ...sports.secondary].map((item) => item.slug);
  assert(new Set(allSlugs).size === allSlugs.length, 'discovery groups must never duplicate a slug');
});

Deno.test('Main Collection discovery shows up to twenty unique other products generically', () => {
  const framework = between('function productsForCategoryGroup', 'function categoryCollectionTitle');
  const mainCategoryDiscovery = new Function(`${framework}\nreturn mainCategoryDiscovery;`)();
  const sportsProducts = Array.from({ length: 25 }, (_, index) => ({
    slug: `legend-${index}`, title: `Legend ${index}`, visible: true, categories: ['sports'], categoryOrder: { sports: index }
  }));
  sportsProducts.push({ ...sportsProducts[2] }, { slug: 'hidden', visible: false, categories: ['sports'] });
  const sports = mainCategoryDiscovery('sports', 'legend-0', sportsProducts, 20, 0);
  assert(sports.length === 20 && !sports.some((product) => product.slug === 'legend-0'), 'Other Legends must cap at twenty and exclude the selected product');
  assert(new Set(sports.map((product) => product.slug)).size === sports.length, 'Other Legends must not contain duplicate slugs');
  const movies = mainCategoryDiscovery('movies', 'movie-0', [
    { slug: 'movie-0', visible: true, categories: ['movies'] },
    { slug: 'movie-1', visible: true, categories: ['movies'] },
    { slug: 'sports-only', visible: true, categories: ['sports'] }
  ], 20, 0);
  assert(movies.map((product) => product.slug).join(',') === 'movie-1', 'the same discovery helper must work for a non-Sports Main Collection');
  assert(sportsHtml.includes('data-main-collection-discovery-title="Other Legends"'), 'Sport Legends must label its Main Collection discovery section Other Legends');
});

Deno.test('showroom pricing is correct immediately and updates synchronously when selection changes', async () => {
  const pricingWindow = {};
  new Function('window', await Deno.readTextFile(new URL('../pricing.js', import.meta.url)))(pricingWindow);
  const purchaseSource = between('function showroomPurchaseMarkup', 'function selectSportsOption');
  let centralPriceCalls = 0;
  const calculateCutoutPrice = (height) => {
    centralPriceCalls += 1;
    return pricingWindow.MVPLUX_PRICING.calculateHeightPrice(height, {});
  };
  const updateShowroomPurchase = new Function('dependencies', `
    const { getShowroomOriginalPrice, resolveSellableProductHeight, getStandeeSlug, getAdminProducts, ensureFinishChoices, updateBuilderOriginalDisplay } = dependencies;
    ${purchaseSource}
    return updateShowroomPurchase;
  `)({
    getShowroomOriginalPrice: (height) => calculateCutoutPrice(height),
    resolveSellableProductHeight: (height) => pricingWindow.MVPLUX_PRICING.resolveMerchandiseHeight(height, {}),
    getStandeeSlug: (value) => String(value).toLowerCase().replace(/\W+/g, '-'), getAdminProducts: () => ({}), ensureFinishChoices: () => {},
    updateBuilderOriginalDisplay: (builder) => {
      builder.dataset.originalPrice = String(calculateCutoutPrice(Number(builder.dataset.originalHeight)));
      builder.querySelector('.live-size-price').textContent = `$${Number(builder.dataset.originalPrice).toFixed(2)}`;
    }
  });
  const window = new Window();
  window.document.body.innerHTML = `<div class="size-builder"><label class="showroom-size-button"><input type="radio" value="original" checked><span></span></label><label class="showroom-size-button"><input type="radio" value="custom"><span></span></label><input class="custom-height-input"><span class="live-size-price">Calculating...</span></div>`;
  const builder = window.document.querySelector('.size-builder');
  updateShowroomPurchase({ builder }, 'Known 72', 72, 'known-72');
  assert(builder.dataset.originalHeight === '72' && builder.querySelector('.live-size-price').textContent === '$118.56', 'known original height must calculate immediately with the central pricing rules');
  updateShowroomPurchase({ builder }, 'Known 36', 36, 'known-36');
  assert(builder.dataset.originalHeight === '36' && builder.querySelector('.live-size-price').textContent === '$50.00', 'selecting another product must immediately replace height and price');
  assert(centralPriceCalls >= 4, 'both selection updates must use central price calculation without a timer');
  const init = source.slice(source.indexOf("document.addEventListener('DOMContentLoaded'"));
  assert(init.indexOf('initializeCategoryShowroomExperience()') < init.indexOf('await authStatePromise'), 'showroom pricing must initialize before waiting for optional authentication and private Admin work');
});
