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

async function finalHomepageDom() {
  const [html, css, source, publishedDocument] = await Promise.all([
    Deno.readTextFile(new URL('../index.html', import.meta.url)),
    Deno.readTextFile(new URL('../style.css', import.meta.url)),
    Deno.readTextFile(new URL('../script.js', import.meta.url)),
    Deno.readTextFile(new URL('../published-admin-settings.json', import.meta.url)).then(JSON.parse)
  ]);
  const window = new Window({ url: 'https://mvpluxcreations.com/index.html', width: 1440, height: 1200 });
  window.document.write(html);
  const style = window.document.createElement('style');
  style.textContent = css;
  window.document.head.append(style);

  const publishedSports = publishedDocument.snapshot.categories.sports;
  const categories = {
    sports: structuredClone(publishedSports),
    music: {
      key: 'music', title: 'Music Artists', description: 'Music displays', page: 'music-artists.html',
      visible: true, homepageVisible: true, order: Number(publishedSports.order || 0) + 1,
      card: { image: 'images/MusicArtistStandees/example.png', backgroundImage: '' }, displaySettings: {}
    }
  };
  const code = [
    sourceFunction(source, 'function homepageCategoryRecords', 'function managedCategoryCardMarkup'),
    sourceFunction(source, 'function renderAdminManagedCards', 'function applyAdminProductOverrides'),
    sourceFunction(source, 'function applyInlineHiddenCards', 'function getHomepageCategoryRows'),
    sourceFunction(source, 'function applyHomepageCategoryCardOrder', 'function saveHomepageCategoryCardOrder'),
    sourceFunction(source, 'function applyInlineAdminEdits', 'function cleanInlineAdminImageSrc')
  ].join('\n');
  const factory = new Function('document', 'dependencies', `
    const { inlineAdminPageKey, getAdminCategories, getAdminGlobalDisplaySettings, getShowroomStageBackground,
      escapeHtml, STOREFRONT_CATEGORY_CARD_MAP, getAdminArchivedProducts, getAdminDeletedProducts,
      getAdminCustomProducts, productCardMarkup, getHomepageCategoryRows, getHomepageCategoryCardOrder,
      getCardAdminKey, isCardHiddenByAdmin, inlineAdminKey, getInlineAdminPageEdits } = dependencies;
    ${code}
    return { renderNormalizedHomepageCategoryCards, renderAdminManagedCards, applyHomepageCategoryCardOrder,
      applyInlineHiddenCards, applyInlineAdminEdits };
  `);
  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  let inlineKeyIndex = 0;
  const dependencies = {
    inlineAdminPageKey: () => 'index.html', getAdminCategories: () => categories,
    getAdminGlobalDisplaySettings: () => ({}), getShowroomStageBackground: () => 'images/shared-stage.jpg',
    escapeHtml, STOREFRONT_CATEGORY_CARD_MAP: { 'sport-legend-standee': 'sports', 'music-artist-standee': 'music' },
    getAdminArchivedProducts: () => [], getAdminDeletedProducts: () => [], getAdminCustomProducts: () => [],
    productCardMarkup: () => '', getHomepageCategoryOrder: () => [],
    getHomepageCategoryRows: () => [...window.document.querySelectorAll('#shop .featured-category-row .product-carousel-row')],
    getHomepageCategoryCardOrder: () => [], getCardAdminKey: (card) => card.dataset.adminSlug || '',
    isCardHiddenByAdmin: () => false,
    inlineAdminKey: (element) => { element.dataset.adminEdit ||= `test-${inlineKeyIndex++}`; return element.dataset.adminEdit; },
    getInlineAdminPageEdits: () => ({})
  };
  const functions = factory(window.document, dependencies);

  // Match the real startup order of every function that can mutate these homepage grids/cards.
  functions.renderNormalizedHomepageCategoryCards();
  functions.renderAdminManagedCards();
  functions.applyHomepageCategoryCardOrder();
  functions.applyInlineHiddenCards();
  functions.renderNormalizedHomepageCategoryCards();
  functions.applyInlineAdminEdits();

  return { window, source };
}

Deno.test('final homepage DOM retains visible Sport Legends and another published Main Category', async () => {
  const { window } = await finalHomepageDom();
  const selector = '#shop .featured-category-row .product-grid > .admin-master-category-card';
  const cards = [...window.document.querySelectorAll(selector)];
  const sports = window.document.querySelector(`${selector}[data-admin-category-key="sports"]`);
  const music = window.document.querySelector(`${selector}[data-admin-category-key="music"]`);
  assert(cards.length === 2 && sports && music, 'both eligible published Main Categories must survive in the final DOM');
  assert(sports.querySelector('h3')?.textContent.trim() === 'Sport Legends', 'final Sport Legends card must use the published authoritative title');
  assert(!sports.hidden && !sports.closest('[hidden]'), 'Sport Legends and its parents must not be hidden');
  assert(window.getComputedStyle(sports).display === 'flex', 'Sport Legends card must compute to a visible flex card');
  const containerStyle = window.getComputedStyle(sports.parentElement);
  assert(containerStyle.display === 'grid', 'the exact Category container must compute to a visible grid');
  assert(containerStyle.gridAutoColumns.includes('minmax'), 'the final grid must allocate a nonzero card column');
  assert(window.getComputedStyle(sports).visibility !== 'hidden' && window.getComputedStyle(sports).opacity !== '0', 'the final card must not be visually suppressed');
  assert(sports.querySelector('.product-stage-preview') && sports.querySelector('.product-title-link'), 'the final card must retain visible stage and title content');
});

Deno.test('homepage startup renders published Categories before auth and test-mode network work', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const init = source.slice(source.indexOf("document.addEventListener('DOMContentLoaded'"));
  const authForms = init.indexOf('bindAuthForms()');
  const published = init.indexOf('await loadPublishedAdminSettings()');
  const render = init.indexOf('renderNormalizedHomepageCategoryCards()', published);
  const auth = init.indexOf('await syncSupabaseAuthState()', published);
  const testMode = init.indexOf('await loadStorefrontTestMode()', published);
  assert(authForms >= 0 && authForms < published, 'auth forms must bind before unrelated published storefront work');
  assert(published >= 0 && render > published && auth > render && testMode > render, 'published final-DOM rendering must precede optional Supabase/auth requests');
});
