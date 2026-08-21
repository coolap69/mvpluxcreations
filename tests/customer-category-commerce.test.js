import { filterProductsForCategoryGroup } from '../admin-state-utils.js';

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
  assert(related.includes('const used = new Set([currentSlug])'), 'related products must exclude the current product');
  assert(related.includes('productsForCategoryGroup(products, masterKey, child.key)') && related.includes('productsForCategoryGroup(products, masterKey)'), 'related discovery must prefer Child Group then Main Category');
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
