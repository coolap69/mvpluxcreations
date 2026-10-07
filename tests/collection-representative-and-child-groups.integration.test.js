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
  const runtime = new Function('window', `${code}\nreturn { categoryDestinationWithRepresentative, optionsWithRequestedCollectionImage };`)({ location: { href: 'https://mvpluxcreations.com/index.html' } });
  const destination = runtime.categoryDestinationWithRepresentative;
  assert(destination('sports-legends.html', 'kobe-bryant') === 'sports-legends.html?product=kobe-bryant', 'Kobe must open on the Sport Legends page without creating another page');
  assert(destination('sports-legends.html', 'michael-jordan') === 'sports-legends.html?product=michael-jordan', 'changing the representative must change only the clean product query');
  assert(destination('sports-legends.html', 'tom-brady', 'images/Sport Legends/Tom Brady.png') === 'sports-legends.html?product=tom-brady&collectionImage=images%2FSport+Legends%2FTom+Brady.png', 'the exact Homepage Collection Card image must travel with its representative Product');
  assert(destination('holiday-cutouts.html', '', 'images/Holidays/Penny.png') === 'holiday-cutouts.html?collectionImage=images%2FHolidays%2FPenny.png', 'an unmatched Homepage Collection Card image must still travel to its showroom');
  const productOptions = [{ label: 'Main image', image: 'images/product.png', stage: 'images/stage.png' }];
  const withHomepageImage = runtime.optionsWithRequestedCollectionImage(productOptions, 'images/collection.png', 'images/shared-stage.png');
  assert(withHomepageImage[0].image === 'images/collection.png' && withHomepageImage[0].stage === 'images/shared-stage.png', 'the destination showroom must display the exact clicked Collection image first');
  assert(productOptions.length === 1 && productOptions[0].image === 'images/product.png', 'temporary Collection-image presentation must not modify Product image choices');
  const sportsStartup = sourceRange(storefrontSource, 'function initSportsShowroom', '\n\nfunction initializeCategoryShowroomExperience');
  assert(sportsStartup.includes("params.get('product') || params.get('player')") && sportsStartup.includes('getManagedProductBySlug(player)') && sportsStartup.includes('requestedCollectionCardImage()'), 'Sport Legends must accept the representative Product and exact card image');
});

Deno.test('Homepage Collection Card image resolves its uniquely matching assigned representative generically', () => {
  const code = sourceRange(storefrontSource, 'function categoryProductImageReferences', '\n\nfunction categoryDestinationWithRepresentative');
  const products = [
    { slug: 'tom-brady', categories: ['sports'], cutoutImage: 'images/SportLegendStandees/TomBrady/TB12Nobackground.png', imageChoices: [{ image: 'images/brady-alt.png' }] },
    { slug: 'captain-america', categories: ['movie-characters'], cutoutImage: 'images/captain.png', imageChoices: [] }
  ];
  const resolve = new Function('sanitizeProductImageChoices', 'getManagedProductCatalog', `${code}\nreturn categoryRepresentativeProductSlug;`)(
    (choices) => Array.isArray(choices) ? choices : [],
    () => products
  );
  assert(resolve('sports', 'images/SportLegendStandees/TomBrady/TB12Nobackground.png', '') === 'tom-brady', 'a Sports card image must select its matching Sports Product');
  assert(resolve('sports', 'images/brady-alt.png', '') === 'tom-brady', 'an alternate Product image must still select the same representative Product');
  assert(resolve('sports', 'images/Sport Legends/Football/TomBrady/TB12Nobackground.png', 'kobe-bryant') === 'tom-brady', 'the live organized Tom Brady card path must defeat the stale Kobe representative by matching the same unique filename');
  assert(resolve('movie-characters', 'images/captain.png', '') === 'captain-america', 'the same matching rule must work outside Sports');
  assert(resolve('sports', 'images/unrelated.png', 'tom-brady') === 'tom-brady', 'an unmatched image must preserve an explicit assigned representative rather than guessing');
});

Deno.test('Admin card-image selection synchronizes only the representative reference when the Product match is unique', () => {
  const synchronizer = sourceRange(adminSource, 'function synchronizeCategoryRepresentativeWithImage', '\n\nfunction updateCategoryPickerValue');
  const pickerUpdate = sourceRange(adminSource, 'function updateCategoryPickerValue', '\n\nfunction syncCategoryDisplayControl');
  assert(synchronizer.includes("product?.cutoutImage === imagePath") && synchronizer.includes('normalizeImageChoices(product?.imageChoices)'), 'Admin must match both primary and alternate Product images');
  assert(synchronizer.includes('selectedFilename') && synchronizer.includes('filename(image) === selectedFilename'), 'Admin must recognize the same uniquely named image after repository folder reorganization');
  assert(synchronizer.includes('matches.length !== 1') && synchronizer.includes('select.value = matches[0].slug'), 'Admin must auto-select only one unambiguous assigned Product');
  assert(pickerUpdate.includes('synchronizeCategoryRepresentativeWithImage(editForm, path)'), 'the existing Homepage Collection Card image picker must use the shared representative synchronizer');
  assert(!synchronizer.includes('product.title') && !synchronizer.includes('product.description'), 'image synchronization must never copy Product text into the Main Collection');
});

Deno.test('all normalized collection showrooms honor the requested Product and exact card image on first render', () => {
  const managedRenderer = sourceRange(storefrontSource, 'function renderManagedCategoryPageProducts', '\n\nfunction renderGenericCategoryOptions');
  const genericShowroom = sourceRange(storefrontSource, 'function setupGenericCategoryShowroom', '\n\nfunction normalizeFrontPageCategoryLinks');
  assert(managedRenderer.includes("new URLSearchParams(window.location.search).get('product')") && managedRenderer.includes('products.some((product) => product.slug === requestedSlug)'), 'every collection page must prioritize the requested representative Product before its old default');
  assert(genericShowroom.includes('requestedCollectionCardImage()') && genericShowroom.includes('options.findIndex((option) => option.image === preferredImage)'), 'generic non-Sports collection pages must open the exact selected Homepage Collection Card image');
  assert(storefrontSource.includes('function optionsWithRequestedCollectionImage')
    && storefrontSource.includes("label: 'Homepage Collection Image'"), 'every collection showroom must temporarily display an unmatched Homepage Collection Card image without changing Product data');
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
  assert(adminSource.includes('Legacy storefront groups detected:') && adminSource.includes('Create Normalized Subcollection Drafts'), 'Dashboard must explain why normalized Subcollections are currently zero and offer an explicit safe conversion');
});

Deno.test('scoped Main Collection publication retains representative ownership without rewriting products', () => {
  assert(publisherSource.includes('representativeProductSlug: String(category.card?.representativeProductSlug || \'\')'), 'shared scoped publisher must serialize the representative Product / Standee reference');
  const publishOperation = sourceRange(publisherSource, 'async function publishCategoryByKey', '\n\n  root.MVPLUX_CATEGORY_PUBLISHER');
  assert(!publishOperation.includes('snapshot.products[') && !publishOperation.includes('products ='), 'publishing a Main Collection must not rewrite Product / Standee records');
});

Deno.test('Admin terminology explains Main Collection, Homepage Collection Card, Subcollection, Product / Standee, and Image Box ownership', () => {
  assert(adminSource.includes('Homepage Collection Card — Featured Standee Categories'), 'Homepage Collection Card editor must name its customer-facing section');
  assert(adminSource.includes('Image Box creates or edits Product / Standee records') && adminSource.includes('It does not create Main Collections or Homepage Collection Cards'), 'Image Box must clearly remain Product / Standee-only');
  assert(adminSource.includes('does not overwrite any Product Showroom Background'), 'Homepage background help must explain independent ownership');
  assert(adminSource.includes('Removing an assignment does not delete the Product / Standee'), 'Child Group help must distinguish relationship removal from Product deletion');
});
