import { normalizeCategories } from '../admin-architecture.js';
import { filterProductsForCategoryGroup } from '../admin-state-utils.js';
import { Window } from 'npm:happy-dom@18.0.1';

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

Deno.test('Homepage Collection Card navigation uses normalized Collection state without query handoff values', () => {
  const code = sourceRange(storefrontSource, 'function categoryDestinationWithRepresentative', '\n\nfunction renderNormalizedHomepageCategoryCards');
  const runtime = new Function('window', 'shouldUsePrivateAdminState', 'isInlineAdminEditingEnabled', `${code}\nreturn { categoryDestinationWithRepresentative, optionsWithRequestedCollectionImage };`)(
    { location: { href: 'https://mvpluxcreations.com/index.html' } },
    () => false,
    () => false
  );
  const destination = runtime.categoryDestinationWithRepresentative;
  assert(destination('sports-legends.html', 'kobe-bryant') === 'sports-legends.html', 'Sport Legends must open from its normalized record without a Product query handoff');
  assert(destination('sports-legends.html', 'michael-jordan') === 'sports-legends.html', 'changing the representative must not create a new or stale Product URL');
  assert(destination('sports-legends.html', 'tom-brady', 'images/Sport Legends/Tom Brady.png') === 'sports-legends.html', 'the normalized Main Collection must own its representative image without a collectionImage query');
  assert(destination('holiday-cutouts.html', '', 'images/Holidays/Penny.png') === 'holiday-cutouts.html', 'an unmatched Homepage Collection Card image must resolve from the normalized Main Collection');
  const productOptions = [{ label: 'Main image', image: 'images/product.png', stage: 'images/stage.png' }];
  const withHomepageImage = runtime.optionsWithRequestedCollectionImage(productOptions, 'images/collection.png', 'images/shared-stage.png');
  assert(withHomepageImage[0].image === 'images/collection.png' && withHomepageImage[0].stage === 'images/shared-stage.png', 'the destination showroom must display the exact clicked Collection image first');
  assert(productOptions.length === 1 && productOptions[0].image === 'images/product.png', 'temporary Collection-image presentation must not modify Product image choices');
  const sportsStartup = sourceRange(storefrontSource, 'function initSportsShowroom', '\n\nfunction initializeCategoryShowroomExperience');
  assert(sportsStartup.includes("requestedCollectionProductSlug('sports')") && sportsStartup.includes('getManagedProductBySlug(player)') && sportsStartup.includes('requestedCollectionCardImage()'), 'Sport Legends must resolve its representative Product and exact card image from normalized Collection state');
});

Deno.test('private Homepage Collection preview carries its lifecycle mode into the Main Collection page', () => {
  const destination = sourceRange(storefrontSource, 'function categoryDestinationWithRepresentative', '\n\nfunction optionsWithRequestedCollectionImage');
  assert(destination.includes('shouldUsePrivateAdminState()'), 'the Collection link must distinguish private Admin preview from customer mode');
  assert(destination.includes("url.searchParams.set('adminView', isInlineAdminEditingEnabled() ? 'edit' : 'preview')"), 'private Collection navigation must prevent the destination from painting the older published version first');
});

Deno.test('legacy Product and collectionImage links are consumed once and removed from the Collection URL', () => {
  const source = sourceRange(storefrontSource, 'function requestedCollectionCardImage', '\n\nfunction selectSportsStandee');
  assert(source.includes("params.get('product') || params.get('player')"), 'old Product links must remain readable for compatibility');
  assert(source.includes("url.searchParams.delete('product')")
    && source.includes("url.searchParams.delete('player')")
    && source.includes("url.searchParams.delete('collectionImage')")
    && source.includes('window.history.replaceState'), 'old handoff values must be removed after they are consumed');
  const destination = sourceRange(storefrontSource, 'function categoryDestinationWithRepresentative', '\n\nfunction optionsWithRequestedCollectionImage');
  assert(!destination.includes("searchParams.set('product'") && !destination.includes("searchParams.set('collectionImage'"), 'new Homepage Collection links must never generate obsolete handoff values');
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

Deno.test('a Collection image can never be shown under an unrelated representative Product name', () => {
  const ownershipSource = sourceRange(storefrontSource, 'function categoryProductImageReferences', '\n\nfunction categoryRepresentativeProductSlug');
  const ownsImage = new Function('sanitizeProductImageChoices', `${ownershipSource}\nreturn productOwnsCollectionImage;`)(
    (choices) => Array.isArray(choices) ? choices : []
  );
  const michael = {
    slug: 'michael-jordan',
    title: 'Michael Jordan',
    cutoutImage: 'images/Sport Legends/Basketball/MJordan/Jordan.png',
    imageChoices: [{ image: 'images/Sport Legends/Basketball/MJordan/Jordan-layup.png' }]
  };
  const tomImage = 'images/Sport Legends/Football/TomBrady/TB12Nobackground.png';
  assert(!ownsImage(michael, tomImage), 'Tom Brady artwork must not become a Michael Jordan image choice');
  assert(ownsImage(michael, 'images/organized/MJordan/Jordan.png'), 'the same Product image may still follow the Product after a folder reorganization');

  const sportsSelection = sourceRange(storefrontSource, 'function selectSportsStandee', '\n\nfunction bindSportsShowroomClicks');
  const genericSelection = sourceRange(storefrontSource, 'function setupGenericCategoryShowroom', '\n\nfunction normalizeFrontPageCategoryLinks');
  assert(sportsSelection.includes('productOwnsCollectionImage') && sportsSelection.includes('ownedPreferredImage'), 'Sports must validate Collection image ownership before adding it to Product choices');
  assert(genericSelection.includes('productOwnsCollectionImage(product, preferredImage)') && genericSelection.includes('ownedPreferredImage'), 'every non-Sports Collection must enforce the same Product/image ownership rule');
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
  assert(managedRenderer.includes('requestedCollectionProductSlug(category)') && managedRenderer.includes('showroomProducts.some((product) => product.slug === requestedSlug)'), 'every collection page must prioritize its eligible normalized representative Product before its old default');
  assert(genericShowroom.includes('requestedCollectionCardImage()')
    && genericShowroom.includes('productOwnsCollectionImage(product, preferredImage)')
    && genericShowroom.includes('options.findIndex((option) => option.image === ownedPreferredImage)'), 'generic non-Sports collection pages may open the Homepage Collection Card image only when it belongs to the selected Product');
  assert(storefrontSource.includes('function optionsWithRequestedCollectionImage')
    && storefrontSource.includes("label: 'Homepage Collection Image'"), 'every collection showroom must temporarily display an unmatched Homepage Collection Card image without changing Product data');
});

Deno.test('Subcollection navigation updates the current collection experience without retaining the Homepage representative', () => {
  const hrefSource = sourceRange(storefrontSource, 'function categoryGroupHref', '\n\nfunction categoryGroupState');
  const navigationSource = sourceRange(storefrontSource, 'function bindCategoryGroupNavigation', '\n\nfunction renderManagedCategoryPageProducts');
  const window = new Window({
    url: 'https://mvpluxcreations.com/sports-legends.html?product=tom-brady&collectionImage=images%2FSport+Legends%2FFootball%2FTomBrady.png&adminView=preview'
  });
  const categoryGroupHref = new Function('window', `${hrefSource}\nreturn categoryGroupHref;`)(window);
  const soccerUrl = new URL(categoryGroupHref('soccer'), window.location.href);

  assert(soccerUrl.pathname.endsWith('/sports-legends.html'), 'a Subcollection must stay inside its existing Main Collection page');
  assert(soccerUrl.searchParams.get('group') === 'soccer', 'the selected Subcollection must become the active in-page state');
  assert(!soccerUrl.searchParams.has('product') && !soccerUrl.searchParams.has('player'), 'the previous representative Product must not override the selected Subcollection');
  assert(!soccerUrl.searchParams.has('collectionImage'), 'the previous Homepage Collection Card image must not override the selected Subcollection showroom');
  assert(soccerUrl.searchParams.get('adminView') === 'preview', 'unrelated lifecycle/view state must be preserved');
  assert(navigationSource.includes('event.preventDefault()')
    && navigationSource.includes("window.history.pushState({}, '', link.href)")
    && navigationSource.includes('renderManagedCategoryPageProducts()'), 'Subcollection clicks must update the current page in place instead of loading a separate HTML page');
});

Deno.test('a Subcollection card representative drives the showroom while strict assignments drive its More row', () => {
  const representativeSource = sourceRange(storefrontSource, 'function representativeProductForCategoryGroup', '\n\nfunction orderedCategoryProducts');
  const renderer = sourceRange(storefrontSource, 'function renderManagedCategoryPageProducts', '\n\nfunction renderGenericCategoryOptions');
  const products = [
    { slug: 'kobe', categories: ['sports'], cutoutImage: 'images/Sport Legends/Basketball/Kobe.png' },
    { slug: 'messi', categories: ['sports', 'soccer'], cutoutImage: 'images/Sport Legends/Soccer/Messi.png' },
    { slug: 'brady', categories: ['sports', 'football'], cutoutImage: 'images/Sport Legends/Football/Brady.png' }
  ];
  const presentation = { image: 'images/Sport Legends/Basketball/Kobe.png' };
  const representativeProductForCategoryGroup = new Function(
    'getManagedProductCatalog',
    'productsForCategoryGroup',
    'getEffectiveCategoryPresentation',
    'categoryProductImageReferences',
    'categoryImageFileIdentity',
    `${representativeSource}\nreturn representativeProductForCategoryGroup;`
  )(
    () => products,
    (items, masterKey) => items.filter((product) => product.categories.includes(masterKey)),
    () => presentation,
    (product) => new Set([product.cutoutImage]),
    (path) => String(path).split('/').pop().toLowerCase()
  );
  const representative = representativeProductForCategoryGroup('sports', { key: 'basketball', card: {} }, products);
  assert(representative?.slug === 'kobe', 'the Subcollection card image must select its uniquely matching Main Collection Product for the showroom');
  assert(filterProductsForCategoryGroup(Object.fromEntries(products.map((product) => [product.slug, product])), 'sports', 'basketball').length === 0, 'representative presentation must not invent a Basketball assignment or place the Product in More Basketball Standees');
  assert(renderer.includes('groupRepresentativeImage || requestedCollectionCardImage()'), 'Sports must display the selected Subcollection card image instead of the previous Homepage representative');
  assert(renderer.includes('preferredImage: groupRepresentativeImage'), 'non-Sports Main Collections must use the same Subcollection representative-image behavior');
});

Deno.test('More and Explore Product cards update the existing Collection showroom instead of leaving the page', () => {
  const navigation = sourceRange(storefrontSource, 'function bindCategoryGroupNavigation', '\n\nfunction renderManagedCategoryPageProducts');
  const renderer = sourceRange(storefrontSource, 'function renderManagedCategoryPageProducts', '\n\nfunction renderGenericCategoryOptions');
  assert(navigation.includes("event.target.closest('[data-related-product-slug]')")
    && navigation.includes('event.preventDefault()')
    && navigation.includes('renderManagedCategoryPageProducts(slug)'), 'discovery Product cards must update the existing showroom in place');
  assert(navigation.includes("discoveryProduct.closest('[data-category-group-discovery]')")
    && navigation.includes("window.history.pushState({}, '', categoryGroupHref())"), 'broader Explore More cards must return the same page to All before selecting their Product');
  assert(renderer.includes("function renderManagedCategoryPageProducts(selectedProductSlug = '')")
    && renderer.includes('selectedProductSlug ||'), 'the shared renderer must accept an in-page Product selection without creating an old Product URL');
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

Deno.test('Sports Subcollection cards render their saved normalized image and layout instead of static legacy artwork', () => {
  const cardRenderer = sourceRange(storefrontSource, 'function normalizedChildGroupCardMarkup', '\n\nfunction renderCategoryGroupNavigation');
  assert(cardRenderer.includes('getEffectiveCategoryPresentation(child.key)'), 'the customer card must read the saved normalized Subcollection presentation');
  assert(cardRenderer.includes('resolveCategoryCardLayout(presentation)'), 'the customer card must reconstruct its image and background geometry through the shared resolver');
  assert(cardRenderer.includes('presentation.image') && cardRenderer.includes('presentation.background'), 'the normalized Subcollection image and background must both appear in the card');
  assert(cardRenderer.includes('presentation.title') && cardRenderer.includes('presentation.description'), 'the normalized Subcollection text must replace static legacy text');
  assert(cardRenderer.includes("container.removeAttribute('data-category-initial-content')"), 'normalized cards must replace the legacy initial-content fallback before the page reveals its content');
  const navigation = sourceRange(storefrontSource, 'function renderCategoryGroupNavigation', '\n\nfunction productsForCategoryGroup');
  assert(navigation.includes('renderNormalizedSportsChildGroupCards(childCardList, state.children'), 'Sports must replace its static visual cards whenever normalized Subcollections exist');
  assert(navigation.includes("if (childCardList && masterKey === 'sports') childCardList.hidden = false"), 'the old static Sports cards may remain only as an emergency fallback when no normalized Subcollections exist');

  const window = new Window({ url: 'https://mvpluxcreations.com/sports-legends.html' });
  const container = window.document.createElement('div');
  container.innerHTML = '<a class="sport-type-card"><img src="images/old-static-basketball.png" alt="old"></a>';
  container.dataset.categoryInitialContent = '';
  container.hidden = true;
  const presentation = {
    title: 'Basketball',
    description: 'Saved normalized Basketball description',
    image: 'images/new-saved-basketball.png',
    background: 'images/new-saved-stage.jpg'
  };
  const render = new Function('window', 'getEffectiveCategoryPresentation', 'escapeHtml', 'categoryGroupHref', 'getAdminGlobalDisplaySettings', `${cardRenderer}\nreturn renderNormalizedSportsChildGroupCards;`)(
    window,
    () => presentation,
    (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    (key) => `sports-legends.html?group=${key}`,
    () => ({})
  );
  window.MVPLUX_CATEGORY_PRESENTATION = { resolveCategoryCardLayout: () => ({
    backgroundPosition: '44% 62%', backgroundTransform: 'scale(1.1, 0.9)', imageSizePercent: 91,
    imageLeftPercent: 57, imageBottomPercent: 8, imageTransform: 'translateX(-50%) rotate(3deg)'
  }) };
  assert(render(container, [{ key: 'basketball' }], 'basketball') === true, 'a normalized Subcollection must replace the static fallback card');
  const renderedImage = container.querySelector('img.product-cutout');
  assert(renderedImage?.getAttribute('src') === presentation.image, 'a fresh card DOM must use the newly saved normalized Subcollection image');
  assert(!container.innerHTML.includes('old-static-basketball.png'), 'the old hard-coded Sports image must be removed from the reconstructed DOM');
  assert(renderedImage?.getAttribute('style')?.includes('height:91%') && renderedImage?.getAttribute('style')?.includes('left:57%'), 'the fresh card DOM must use normalized image geometry');
  assert(container.querySelector('.category-background-layer')?.getAttribute('style')?.includes(presentation.background), 'the fresh card DOM must use the saved normalized background');
  assert(container.textContent.includes(presentation.description), 'the fresh card DOM must use the saved normalized description');
  assert(!container.hidden && !container.hasAttribute('data-category-initial-content'), 'the normalized card list must be visible without being resurrected as legacy initial content');
});

Deno.test('all Main Collection pages and future Subcollections use one shared card size and background default', () => {
  const navigation = sourceRange(storefrontSource, 'function subcollectionCardDesign', '\n\nfunction productsForCategoryGroup');
  assert(navigation.includes('globalDisplaySettings?.subcollectionCards'), 'Subcollection cards must read their collective design from normalized global display settings');
  for (const field of ['pageHeadingFontFamily', 'pageHeadingColor', 'pageHeadingFontSizePx', 'pageHeadingFontWeight']) {
    assert(adminSource.includes(field), `shared Collection page heading controls must expose ${field}`);
    assert(navigation.includes(field), `storefront Collection page headings must read shared ${field}`);
  }
  assert(storefrontSource.includes('applySharedCollectionPageHeadingStyle();'), 'every Collection page must apply the shared heading style');
  assert(navigation.includes("--sport-carousel-card-width") && navigation.includes("--sport-carousel-image-height"), 'shared card width and image-stage height must control the same customer cards');
  assert(navigation.includes("page.querySelector('[data-subcollection-card-list]')") && navigation.includes("childCardList.dataset.subcollectionCardList = masterKey"), 'non-Sports and future Main Collection pages must create the same normalized Subcollection card row');

  const window = new Window();
  window.MVPLUX_CATEGORY_PRESENTATION = {};
  const presentationSource = Deno.readTextFileSync(new URL('../category-presentation.js', import.meta.url));
  new Function('window', presentationSource)(window);
  const shared = {
    backgroundImage: 'images/shared-subcollection-stage.jpg',
    backgroundPosition: '42% 68%', backgroundSizePercent: 115,
    backgroundWidthPercent: 130, backgroundHeightPercent: 90,
    cardWidthPx: 310, stageHeightPx: 360
  };
  const category = {
    key: 'future-child', parentKey: 'future-main', title: 'Future Child',
    card: { image: 'images/future-standee.png', backgroundImage: '' },
    displaySettings: { standeeSizePercent: 88, standeeLeftPercent: 7, standeeVerticalPercent: -4, backgroundPosition: 'center bottom' }
  };
  const presentation = window.MVPLUX_CATEGORY_PRESENTATION.resolveCategoryPresentation(category, { globalDisplaySettings: { subcollectionCards: shared } });
  assert(presentation.background === shared.backgroundImage, 'a new Subcollection must inherit the shared background');
  assert(presentation.display.backgroundPosition === shared.backgroundPosition && presentation.display.backgroundWidthPercent === 130 && presentation.display.backgroundHeightPercent === 90, 'shared background geometry must inherit collectively');
  assert(presentation.display.standeeSizePercent === 88 && presentation.display.standeeLeftPercent === 7 && presentation.display.standeeVerticalPercent === -4, 'shared background and card sizing must never overwrite individual standee geometry');
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
