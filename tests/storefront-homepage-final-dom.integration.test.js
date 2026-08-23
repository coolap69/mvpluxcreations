import { Window } from 'npm:happy-dom@18.0.1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceFunction(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from, `missing source range ${start}`);
  return source.slice(from, to);
}

async function actualFinalHomepageDom() {
  const [html, css, source, catalogSource, presentationSource, publishedDocument] = await Promise.all([
    Deno.readTextFile(new URL('../index.html', import.meta.url)),
    Deno.readTextFile(new URL('../style.css', import.meta.url)),
    Deno.readTextFile(new URL('../script.js', import.meta.url)),
    Deno.readTextFile(new URL('../product-catalog.js', import.meta.url)),
    Deno.readTextFile(new URL('../category-presentation.js', import.meta.url)),
    Deno.readTextFile(new URL('../published-admin-settings.json', import.meta.url)).then(JSON.parse)
  ]);
  const window = new Window({ url: 'https://mvpluxcreations.com/index.html', width: 1440, height: 1200 });
  window.document.write(html);
  const style = window.document.createElement('style');
  style.textContent = css;
  window.document.head.append(style);
  new Function('window', catalogSource)(window);
  new Function('window', presentationSource)(window);
  window.mvpluxPublishedAdminSettings = structuredClone(publishedDocument.snapshot);

  const code = [
    sourceFunction(source, 'function compatibilityMasterCategories', 'function getAdminGlobalDisplaySettings'),
    sourceFunction(source, 'function getEffectiveCategoryPresentation', 'function resolveStorefrontProductDisplay'),
    sourceFunction(source, 'function homepageCategoryRecords', 'function managedCategoryCardMarkup'),
    sourceFunction(source, 'function renderAdminManagedCards', 'function applyAdminProductOverrides'),
    sourceFunction(source, 'function applyInlineHiddenCards', 'function getHomepageCategoryRows'),
    sourceFunction(source, 'function applyHomepageCategoryCardOrder', 'function saveHomepageCategoryCardOrder'),
    sourceFunction(source, 'function applyInlineAdminEdits', 'function cleanInlineAdminImageSrc')
  ].join('\n');
  const cardMap = {
    'sport-legend-standee': 'sports', 'movie-character-standee': 'movie-characters',
    'people-public-figure-standee': 'people-public-figures', 'music-artist-standee': 'music-artists',
    'faith-celebration-standee': 'faith-celebration', 'holiday-standee': 'holiday',
    'fan-request-standee': 'fan-requests', 'dinosaur-party-standee': 'dinosaur-animal',
    'game-fantasy-standee': 'video-game-fantasy', 'custom-photo-standee': 'custom-photo',
    'small-standee-party-pack': 'small-party-packs'
  };
  const pageMap = {
    'sport-legend-standee': 'sports-legends.html', 'movie-character-standee': 'movie-inspired.html',
    'people-public-figure-standee': 'people-public-figures.html', 'music-artist-standee': 'music-artists.html',
    'faith-celebration-standee': 'religious-cutouts.html', 'holiday-standee': 'holiday-cutouts.html',
    'fan-request-standee': 'fan-inspired.html', 'dinosaur-party-standee': 'dinosaur-cutouts.html',
    'game-fantasy-standee': 'videogame-cutouts.html', 'custom-photo-standee': 'custom-photo-cutouts.html',
    'small-standee-party-pack': 'small-cutout-party-packs.html'
  };
  const factory = new Function('window', 'document', 'dependencies', `
    const { structuredClone, shouldUsePrivateAdminState, STOREFRONT_CATEGORY_CARD_MAP, STOREFRONT_CATEGORY_PAGE_MAP,
      inlineAdminPageKey, getAdminGlobalDisplaySettings, getShowroomStageBackground, escapeHtml,
      getAdminArchivedProducts, getAdminDeletedProducts, getAdminCustomProducts, productCardMarkup,
      getHomepageCategoryRows, getHomepageCategoryCardOrder, getCardAdminKey, isCardHiddenByAdmin,
      inlineAdminKey, getInlineAdminPageEdits, getProductSlug } = dependencies;
    ${code}
    return { getAdminCategories, homepageCategoryRecords, renderNormalizedHomepageCategoryCards,
      renderAdminManagedCards, applyHomepageCategoryCardOrder, applyInlineHiddenCards, applyInlineAdminEdits };
  `);
  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  let inlineKeyIndex = 0;
  const functions = factory(window, window.document, {
    structuredClone, shouldUsePrivateAdminState: () => false,
    STOREFRONT_CATEGORY_CARD_MAP: cardMap, STOREFRONT_CATEGORY_PAGE_MAP: pageMap,
    inlineAdminPageKey: () => 'index.html',
    getAdminGlobalDisplaySettings: () => window.mvpluxPublishedAdminSettings.globalDisplaySettings || {},
    getShowroomStageBackground: () => 'images/FrontPageWeb/Herobackgroundparts-backgroundforimages.jpg', escapeHtml,
    getAdminArchivedProducts: () => [], getAdminDeletedProducts: () => [], getAdminCustomProducts: () => [], productCardMarkup: () => '',
    getHomepageCategoryRows: () => [...window.document.querySelectorAll('#shop .featured-category-row .product-carousel-row')],
    getHomepageCategoryCardOrder: () => [], getCardAdminKey: (card) => card.dataset.adminSlug || '', isCardHiddenByAdmin: () => false,
    getProductSlug: (value) => String(value || 'product').replace(/\W+/g, '-').toLowerCase(),
    inlineAdminKey: (element) => { element.dataset.adminEdit ||= `test-${inlineKeyIndex++}`; return element.dataset.adminEdit; },
    getInlineAdminPageEdits: () => ({})
  });

  const authLinks = window.document.querySelector('.auth-links');
  authLinks.innerHTML = '<a data-admin-dashboard-link href="/admin.html">Admin Dashboard</a><button data-admin-mode-toggle>Admin Mode</button><button data-auth-signout>Log Out</button>';
  const fallbackInitiallyHidden = window.document.querySelector('[data-homepage-category-fallback]').hidden;
  functions.renderNormalizedHomepageCategoryCards();
  const initiallyRendered = window.document.querySelectorAll('#homepageCategoryGrid > .admin-master-category-card').length;
  functions.renderAdminManagedCards();
  functions.applyHomepageCategoryCardOrder();
  functions.applyInlineHiddenCards();
  functions.applyInlineAdminEdits();
  functions.renderNormalizedHomepageCategoryCards();
  return { window, source, functions, initiallyRendered, fallbackInitiallyHidden };
}

Deno.test('actual published and compatibility Main Categories remain visible in the dedicated final homepage mount', async () => {
  const { window, functions, initiallyRendered, fallbackInitiallyHidden } = await actualFinalHomepageDom();
  const mount = window.document.getElementById('homepageCategoryGrid');
  const cards = [...window.document.querySelectorAll('#homepageCategoryGrid > .admin-master-category-card')];
  const sports = mount.querySelector('[data-admin-category-key="sports"]');
  const another = mount.querySelector('[data-admin-category-key="movie-characters"]');
  assert(initiallyRendered > 0 && cards.length > 0, 'the actual dedicated homepage Category mount must contain cards');
  assert(sports && another, 'Sports and at least one compatibility Main Category must render generically');
  assert(cards.length === functions.homepageCategoryRecords().length, 'every eligible resolved Main Category must use the one renderer');
  assert(sports.querySelector('.product-title-link')?.textContent.trim() === 'Sport Legends', 'authoritative published Sports title must render');
  assert(sports.querySelector('.product-cutout')?.getAttribute('src') === window.mvpluxPublishedAdminSettings.categories.sports.card.image, 'authoritative published Category image must render');
  assert(sports.querySelector('.category-background-layer') && sports.querySelector('.product-stage-preview'), 'published background and stage presentation must render');
  assert(!sports.hidden && !sports.closest('[hidden]'), 'rendered Category and dedicated mount must remain visible');
  assert(window.getComputedStyle(mount).display === 'grid' && window.getComputedStyle(sports).display === 'flex', 'dedicated mount and card must compute to visible layouts');
  assert(fallbackInitiallyHidden, 'hard-coded Category markup must be inert before normalized rendering starts');
  assert(window.document.querySelector('[data-homepage-category-fallback]').hidden, 'legacy fallback must hide only after authoritative rendering succeeds');
});

Deno.test('normalized Sports and non-Sports presentation changes own the actual final card before and after publication reload', async () => {
  const { window, functions } = await actualFinalHomepageDom();
  const snapshot = window.mvpluxPublishedAdminSettings;
  snapshot.categoryDisplayCards['sport-legend-standee'] = {
    title: 'Legacy Sports', cutoutImage: 'images/legacy-sports.png', backgroundImage: 'images/legacy-stage.png', visible: true, productOrder: 0
  };
  snapshot.categoryDisplayCards['movie-character-standee'] = {
    title: 'Legacy Movies', cutoutImage: 'images/legacy-movies.png', backgroundImage: 'images/legacy-movie-stage.png', visible: true, productOrder: 1
  };
  snapshot.categories.sports = {
    key: 'sports', title: 'Sports Image A', description: 'Initial Sports description', page: 'sports-legends.html',
    visible: true, homepageVisible: true, order: 2,
    card: { image: 'images/category-image-a.png', backgroundImage: 'images/category-background-a.png' },
    displaySettings: { standeeSizePercent: 90, standeeLeftPercent: 0, standeeVerticalPercent: 0, backgroundPosition: '50% 50%', backgroundSizePercent: 100 }
  };
  snapshot.categories['movie-characters'] = {
    key: 'movie-characters', title: 'Movie Image A', description: 'Initial Movie description', page: 'movie-inspired.html',
    visible: true, homepageVisible: true, order: 3,
    card: { image: 'images/movie-image-a.png', backgroundImage: 'images/movie-background-a.png' }, displaySettings: {}
  };
  functions.renderNormalizedHomepageCategoryCards();
  assert(window.document.querySelector('[data-admin-category-key="sports"] .product-cutout')?.getAttribute('src') === 'images/category-image-a.png', 'initial normalized image A must render instead of legacy markup');

  snapshot.categories.sports = {
    ...snapshot.categories.sports,
    title: 'Sports Image B', description: 'Published Sports B', page: 'sports-legends.html?view=new', order: 7,
    card: { image: 'images/category-image-b.png', backgroundImage: 'images/category-background-b.png' },
    displaySettings: {
      standeeSizePercent: 177, standeeLeftPercent: 18, standeeVerticalPercent: -29,
      backgroundPosition: '27% 81%', backgroundSizePercent: 142,
      titleLeftPercent: 11, titleVerticalPercent: -7, titleSizePercent: 126, titleAlign: 'right',
      descriptionLeftPercent: -9, descriptionVerticalPercent: 13, descriptionSizePercent: 114, descriptionAlign: 'left'
    }
  };
  snapshot.categories['movie-characters'] = {
    ...snapshot.categories['movie-characters'],
    title: 'Movie Image B', description: 'Published Movie B', order: 1,
    card: { image: 'images/movie-image-b.png', backgroundImage: 'images/movie-background-b.png' },
    displaySettings: { standeeSizePercent: 121, standeeLeftPercent: -14, standeeVerticalPercent: 8, backgroundPosition: '62% 34%', backgroundSizePercent: 118 }
  };

  // The same object shape is what Publish writes; cloning it simulates a clean public reload from that snapshot.
  window.mvpluxPublishedAdminSettings = structuredClone(snapshot);
  functions.renderNormalizedHomepageCategoryCards();
  const sports = window.document.querySelector('[data-admin-category-key="sports"]');
  const movie = window.document.querySelector('[data-admin-category-key="movie-characters"]');
  const sportsImage = sports.querySelector('.product-cutout');
  const sportsBackground = sports.querySelector('.category-background-layer');
  assert(sportsImage.getAttribute('src') === 'images/category-image-b.png', 'published normalized Sports image B must win over legacy image A');
  assert(sportsImage.style.height === '177%' && sportsImage.style.left === '68%' && sportsImage.style.bottom === '31%', 'published normalized Sports image size and X/Y must reach the visible image');
  assert(sportsBackground.style.backgroundImage.includes('category-background-b.png'), 'published normalized Sports background must win over the legacy background');
  assert(sportsBackground.style.backgroundPosition === '27% 81%' && sportsBackground.style.transform === 'scale(1.42)', 'published background X/Y and zoom must reach the visible layer');
  assert(sports.querySelector('.product-title-link').textContent === 'Sports Image B' && sports.querySelector('.product-description').textContent === 'Published Sports B', 'published normalized title and description must render');
  assert(sports.querySelector('.product-image-link').getAttribute('href') === 'sports-legends.html?view=new', 'published normalized destination must render');
  assert(movie.querySelector('.product-cutout').getAttribute('src') === 'images/movie-image-b.png', 'the same normalized image authority must work for a non-Sports Category');
  assert(movie.querySelector('.category-background-layer').style.transform === 'scale(1.18)', 'non-Sports background zoom must use the same presentation path');
  const keys = [...window.document.querySelectorAll('#homepageCategoryGrid > .admin-master-category-card')].map((card) => card.dataset.adminCategoryKey);
  assert(keys.indexOf('movie-characters') < keys.indexOf('sports'), 'normalized Category order must determine final DOM order');
  assert(window.document.querySelector('[data-homepage-category-fallback]').hidden, 'hard-coded fallback must remain inert after the published reload');
});

Deno.test('hard-coded homepage Category markup appears only as an explicit emergency fallback', async () => {
  const { window, functions } = await actualFinalHomepageDom();
  window.MVPLUX_PRODUCT_CATEGORIES = [];
  window.mvpluxPublishedAdminSettings = { categories: {}, categoryDisplayCards: {}, deletedCategories: [] };
  assert(functions.renderNormalizedHomepageCategoryCards() === false, 'empty authoritative/compatibility data must report fallback use');
  assert(window.document.getElementById('homepageCategoryGrid').hidden, 'empty normalized mount must hide');
  assert(!window.document.querySelector('[data-homepage-category-fallback]').hidden, 'legacy markup may appear only after an explicit render failure/empty result');
});

Deno.test('later storefront functions cannot erase, reorder, or hide the dedicated Category mount', async () => {
  const { window, initiallyRendered } = await actualFinalHomepageDom();
  const mount = window.document.getElementById('homepageCategoryGrid');
  const finalCards = window.document.querySelectorAll('#homepageCategoryGrid > .admin-master-category-card');
  assert(initiallyRendered > 0 && finalCards.length === initiallyRendered, 'later storefront startup must not erase dedicated Category cards');
  assert([...finalCards].every((card) => !card.hidden && card.style.display !== 'none'), 'later hidden-card logic must ignore dedicated Category cards');
});

Deno.test('later homepage startup renderers cannot overwrite the restored approved Admin header', async () => {
  const { window } = await actualFinalHomepageDom();
  const header = window.document.querySelector('.auth-links');
  assert(header.querySelector('[data-admin-dashboard-link]')?.textContent === 'Admin Dashboard', 'later homepage rendering must retain Admin Dashboard');
  assert(header.querySelector('[data-admin-mode-toggle]')?.textContent === 'Admin Mode', 'later homepage rendering must retain Admin Mode');
  assert(header.querySelector('[data-auth-signout]')?.textContent === 'Log Out', 'later homepage rendering must retain Log Out');
  assert(!header.querySelector('.sign-in-link, .sign-up-link'), 'later homepage rendering must not restore guest auth links');
});

Deno.test('homepage startup binds auth then renders the dedicated Category mount before private Admin work', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const init = source.slice(source.indexOf("document.addEventListener('DOMContentLoaded'"));
  const authForms = init.indexOf('bindAuthForms()');
  const authStart = init.indexOf('const authStatePromise = syncSupabaseAuthState()');
  const published = init.indexOf('await loadPublishedAdminSettings()');
  const render = init.indexOf('renderNormalizedHomepageCategoryCards()', published);
  const authWait = init.indexOf('await authStatePromise', published);
  const privateLoad = init.indexOf('await loadLiveAdminSettings()', published);
  assert(authForms >= 0 && authForms < authStart && authStart < published && render > published, 'auth binding and session restoration must start before the published Category request');
  assert(authWait > render && privateLoad > render, 'startup must render the published mount before waiting for Admin authorization or private state');
  assert(source.includes("document.getElementById('homepageCategoryGrid')"), 'renderer must target only the permanent dedicated mount');
});
