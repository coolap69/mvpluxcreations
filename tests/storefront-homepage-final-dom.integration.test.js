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
  const [html, css, source, catalogSource, publishedDocument] = await Promise.all([
    Deno.readTextFile(new URL('../index.html', import.meta.url)),
    Deno.readTextFile(new URL('../style.css', import.meta.url)),
    Deno.readTextFile(new URL('../script.js', import.meta.url)),
    Deno.readTextFile(new URL('../product-catalog.js', import.meta.url)),
    Deno.readTextFile(new URL('../published-admin-settings.json', import.meta.url)).then(JSON.parse)
  ]);
  const window = new Window({ url: 'https://mvpluxcreations.com/index.html', width: 1440, height: 1200 });
  window.document.write(html);
  const style = window.document.createElement('style');
  style.textContent = css;
  window.document.head.append(style);
  new Function('window', catalogSource)(window);
  window.mvpluxPublishedAdminSettings = structuredClone(publishedDocument.snapshot);

  const code = [
    sourceFunction(source, 'function compatibilityMasterCategories', 'function getAdminGlobalDisplaySettings'),
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

  functions.renderNormalizedHomepageCategoryCards();
  const initiallyRendered = window.document.querySelectorAll('#homepageCategoryGrid > .admin-master-category-card').length;
  functions.renderAdminManagedCards();
  functions.applyHomepageCategoryCardOrder();
  functions.applyInlineHiddenCards();
  functions.applyInlineAdminEdits();
  functions.renderNormalizedHomepageCategoryCards();
  return { window, source, functions, initiallyRendered };
}

Deno.test('actual published and compatibility Main Categories remain visible in the dedicated final homepage mount', async () => {
  const { window, functions, initiallyRendered } = await actualFinalHomepageDom();
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
  assert(window.document.querySelector('[data-homepage-category-fallback]').hidden, 'legacy fallback must hide only after authoritative rendering succeeds');
});

Deno.test('later storefront functions cannot erase, reorder, or hide the dedicated Category mount', async () => {
  const { window, initiallyRendered } = await actualFinalHomepageDom();
  const mount = window.document.getElementById('homepageCategoryGrid');
  const finalCards = window.document.querySelectorAll('#homepageCategoryGrid > .admin-master-category-card');
  assert(initiallyRendered > 0 && finalCards.length === initiallyRendered, 'later storefront startup must not erase dedicated Category cards');
  assert([...finalCards].every((card) => !card.hidden && card.style.display !== 'none'), 'later hidden-card logic must ignore dedicated Category cards');
});

Deno.test('homepage startup binds auth then renders the dedicated Category mount before private Admin work', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const init = source.slice(source.indexOf("document.addEventListener('DOMContentLoaded'"));
  const authForms = init.indexOf('bindAuthForms()');
  const published = init.indexOf('await loadPublishedAdminSettings()');
  const render = init.indexOf('renderNormalizedHomepageCategoryCards()', published);
  const auth = init.indexOf('await syncSupabaseAuthState()', published);
  const privateLoad = init.indexOf('await loadLiveAdminSettings()', published);
  assert(authForms >= 0 && authForms < published && render > published, 'auth binding and published Category render must lead startup');
  assert(auth > render && privateLoad > render, 'optional auth and private Admin reads must follow the published mount render');
  assert(source.includes("document.getElementById('homepageCategoryGrid')"), 'renderer must target only the permanent dedicated mount');
});
