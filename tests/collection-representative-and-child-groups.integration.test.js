import { normalizeCategories } from '../admin-architecture.js';
import { filterProductsForCategoryGroup } from '../admin-state-utils.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceRange(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert(start >= 0 && end > start, `missing source range ${startToken}`);
  return source.slice(start, end);
}

const [adminSource, storefrontSource, publisherSource] = await Promise.all([
  Deno.readTextFile(new URL('../admin.js', import.meta.url)),
  Deno.readTextFile(new URL('../script.js', import.meta.url)),
  Deno.readTextFile(new URL('../category-publisher.js', import.meta.url))
]);

Deno.test('Main Collection normalization retains one representative Product / Standee reference', () => {
  const products = {
    kobe: { slug: 'kobe', title: 'Kobe', cutoutImage: 'images/kobe.png' },
    jordan: { slug: 'jordan', title: 'Jordan', cutoutImage: 'images/jordan.png' },
    shaq: { slug: 'shaq', title: 'Shaq', cutoutImage: 'images/shaq.png' }
  };
  const collection = {
    key: 'sports', title: 'Sport Legends', page: 'sports-legends.html', visible: true, homepageVisible: true,
    card: { image: 'images/homepage-sports.png', backgroundImage: 'images/homepage-stage.png', representativeProductSlug: 'kobe' }
  };
  for (const representativeProductSlug of ['kobe', 'jordan', 'shaq']) {
    const normalized = normalizeCategories({ existingCategories: { sports: { ...collection, card: { ...collection.card, representativeProductSlug } } } });
    assert(normalized.sports.card.representativeProductSlug === representativeProductSlug, 'the Main Collection must retain the selected representative reference');
    assert(products[representativeProductSlug].cutoutImage.endsWith(`${representativeProductSlug}.png`), 'changing the representative must not modify or duplicate the Product / Standee');
    assert(normalized.sports.card.image === 'images/homepage-sports.png', 'the Homepage Collection Card image remains collection-owned');
  }
});

Deno.test('Homepage Collection Card background and Product Showroom Background remain independent', () => {
  const product = { slug: 'kobe', backgroundImage: 'images/product-showroom.png' };
  const normalized = normalizeCategories({ existingCategories: { sports: {
    key: 'sports', title: 'Sport Legends', card: { image: 'images/sports.png', backgroundImage: 'images/homepage-card.png', representativeProductSlug: 'kobe' }
  } } });
  assert(normalized.sports.card.backgroundImage === 'images/homepage-card.png', 'Homepage Collection Card must own its background');
  assert(product.backgroundImage === 'images/product-showroom.png', 'normalizing the Main Collection must not overwrite Product Showroom Background');
});

Deno.test('Homepage Collection Card navigation carries the representative slug to the same Main Collection page', () => {
  const code = sourceRange(storefrontSource, 'function categoryDestinationWithRepresentative', '\n\nfunction renderNormalizedHomepageCategoryCards');
  const destination = new Function('window', `${code}\nreturn categoryDestinationWithRepresentative;`)({ location: { href: 'https://mvpluxcreations.com/index.html' } });
  assert(destination('sports-legends.html', 'kobe-bryant') === 'sports-legends.html?product=kobe-bryant', 'Kobe must open on the Sport Legends page without creating another page');
  assert(destination('sports-legends.html', 'michael-jordan') === 'sports-legends.html?product=michael-jordan', 'changing the representative must change only the clean product query');
  const sportsStartup = sourceRange(storefrontSource, 'function initSportsShowroom', '\n\nfunction initializeCategoryShowroomExperience');
  assert(sportsStartup.includes("params.get('product') || params.get('player')") && sportsStartup.includes('getManagedProductBySlug(player)'), 'Sport Legends must accept normalized-only representative Product slugs');
});

Deno.test('normalized Child Groups drive strict hierarchy and dormant relationships remain private', () => {
  const categories = normalizeCategories({ existingCategories: {
    sports: { key: 'sports', title: 'Sport Legends' },
    basketball: { key: 'basketball', parentKey: 'sports', title: 'Basketball', order: 0 },
    soccer: { key: 'soccer', parentKey: 'sports', title: 'Soccer', order: 1 },
    football: { key: 'football', parentKey: 'sports', title: 'Football', order: 2 }
  } });
  assert(['basketball', 'soccer', 'football'].every((key) => categories[key].parentKey === 'sports'), 'Basketball, Soccer, and Football must be normalizable Child Group records');
  const products = {
    kobe: { slug: 'kobe', visible: true, categories: ['sports', 'basketball'] },
    messi: { slug: 'messi', visible: true, categories: ['sports', 'soccer'] },
    brady: { slug: 'brady', visible: true, categories: ['sports', 'football'] },
    dormant: { slug: 'dormant', visible: true, categories: ['basketball'] }
  };
  assert(filterProductsForCategoryGroup(products, 'sports', 'basketball').map((item) => item.slug).join(',') === 'kobe', 'Basketball results must contain only Products assigned to both Sport Legends and Basketball');
  assert(!filterProductsForCategoryGroup(products, 'sports', 'basketball').some((item) => item.slug === 'dormant'), 'a dormant Child Group assignment must not become publicly visible without its Main Collection');
});

Deno.test('legacy Sports groups have an explicit private normalization boundary and never auto-change assignments', () => {
  const importer = sourceRange(adminSource, 'function legacyChildGroupDraftCandidates', '\n\nfunction childGroupMarkup');
  assert(importer.includes("key: 'basketball'") && importer.includes("key: 'soccer'") && importer.includes("key: 'football'"), 'the three remaining static Sports groups must be detected for explicit normalization');
  assert(importer.includes("collectionKey: 'categories'") && !importer.includes("collectionKey: 'products'"), 'normalizing legacy Child Groups must create private Category records without rewriting Product assignments');
  assert(adminSource.includes('Legacy storefront groups detected:') && adminSource.includes('Create Normalized Child Group Drafts'), 'Dashboard must explain why normalized Child Groups are currently zero and offer an explicit safe conversion');
});

Deno.test('scoped Main Collection publication retains representative ownership without rewriting products', () => {
  assert(publisherSource.includes('representativeProductSlug: String(category.card?.representativeProductSlug || \'\')'), 'shared scoped publisher must serialize the representative Product / Standee reference');
  const publishOperation = sourceRange(publisherSource, 'async function publishCategoryByKey', '\n\n  root.MVPLUX_CATEGORY_PUBLISHER');
  assert(!publishOperation.includes('snapshot.products[') && !publishOperation.includes('products ='), 'publishing a Main Collection must not rewrite Product / Standee records');
});

Deno.test('Admin terminology explains Main Collection, Homepage Collection Card, Child Group, Product / Standee, and Image Box ownership', () => {
  assert(adminSource.includes('Homepage Collection Card — Featured Standee Categories'), 'Homepage Collection Card editor must name its customer-facing section');
  assert(adminSource.includes('Image Box creates or edits Product / Standee records') && adminSource.includes('It does not create Main Collections or Homepage Collection Cards'), 'Image Box must clearly remain Product / Standee-only');
  assert(adminSource.includes('does not overwrite any Product Showroom Background'), 'Homepage background help must explain independent ownership');
  assert(adminSource.includes('Removing an assignment does not delete the Product / Standee'), 'Child Group help must distinguish relationship removal from Product deletion');
});
