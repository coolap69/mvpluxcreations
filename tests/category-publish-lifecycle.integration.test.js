import { Window } from 'npm:happy-dom@18.0.1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceRange(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from, `missing source range ${start}`);
  return source.slice(from, to);
}

const [presentationSource, publisherSource, storefrontSource] = await Promise.all([
  Deno.readTextFile(new URL('../category-presentation.js', import.meta.url)),
  Deno.readTextFile(new URL('../category-publisher.js', import.meta.url)),
  Deno.readTextFile(new URL('../script.js', import.meta.url))
]);

function lifecycleRuntime() {
  const window = new Window({ url: 'https://mvpluxcreations.com/index.html?adminView=edit#home' });
  new Function('window', presentationSource)(window);
  new Function('window', publisherSource)(window);
  const published = {
    version: 1, schemaVersion: 2, products: {},
    categoryDisplayCards: {
      'sport-legend-standee': { cutoutImage: 'images/legacy-sports.png', visible: true },
      'music-artist-standee': { cutoutImage: 'images/legacy-music.png', visible: true }
    },
    categorySettings: {}, deletedCategories: [],
    categories: {
      sports: {
        key: 'sports', title: 'Sport Legends', description: 'Sports', page: 'sports-legends.html', visible: true, homepageVisible: true, order: 1,
        card: { image: 'images/sports-a.png', backgroundImage: 'images/stage-a.png' },
        displaySettings: { standeeSizePercent: 80, standeeLeftPercent: 0, standeeVerticalPercent: 0 }
      },
      music: {
        key: 'music', title: 'Music Artists', description: 'Music', page: 'music-artists.html', visible: true, homepageVisible: true, order: 2,
        card: { image: 'images/music-a.png', backgroundImage: 'images/stage-a.png' },
        displaySettings: { standeeSizePercent: 75, standeeLeftPercent: -3, standeeVerticalPercent: 4 }
      }
    }
  };
  const drafts = {
    sports: { ...structuredClone(published.categories.sports), card: { image: 'images/sports-b.png', backgroundImage: 'images/stage-b.png' }, displaySettings: { standeeSizePercent: 120, standeeLeftPercent: 20, standeeVerticalPercent: -10 } },
    music: { ...structuredClone(published.categories.music), card: { image: 'images/music-b.png', backgroundImage: 'images/stage-b.png' }, displaySettings: { standeeSizePercent: 132, standeeLeftPercent: 16, standeeVerticalPercent: -12 } }
  };
  return { window, published, drafts };
}

function renderFreshHomepage(window, snapshot) {
  window.document.body.innerHTML = '<section><div id="homepageCategoryGrid"></div><div data-homepage-category-fallback hidden></div></section>';
  const code = [
    sourceRange(storefrontSource, 'function homepageCategoryRecords', '\n\nfunction renderNormalizedHomepageCategoryCards'),
    sourceRange(storefrontSource, 'function renderNormalizedHomepageCategoryCards', '\n\nfunction initializeInlineCategoryImageControls')
  ].join('\n');
  const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const render = new Function('window', 'document', 'dependencies', `
    const { getAdminCategories, inlineAdminPageKey, getEffectiveCategoryPresentation, STOREFRONT_CATEGORY_CARD_MAP, escapeHtml } = dependencies;
    ${code}
    return renderNormalizedHomepageCategoryCards;
  `)(window, window.document, {
    getAdminCategories: () => snapshot.categories,
    inlineAdminPageKey: () => 'index.html',
    getEffectiveCategoryPresentation: (key) => window.MVPLUX_CATEGORY_PRESENTATION.resolveCategoryPresentation(snapshot.categories[key], { mode: 'published', defaultBackground: 'images/default.jpg' }),
    STOREFRONT_CATEGORY_CARD_MAP: { 'sport-legend-standee': 'sports', 'music-artist-standee': 'music' },
    escapeHtml
  });
  render();
  return window.document.getElementById('homepageCategoryGrid');
}

Deno.test('shared scoped Category publish moves the saved normalized draft into a fresh customer DOM', async () => {
  for (const categoryKey of ['sports', 'music']) {
    const runtime = lifecycleRuntime();
    const resolve = (category, mode) => runtime.window.MVPLUX_CATEGORY_PRESENTATION.resolveCategoryPresentation(category, { mode, defaultBackground: 'images/default.jpg' });
    const draftBeforePublish = resolve(runtime.drafts[categoryKey], 'draft');
    const customerBeforePublish = resolve(runtime.published.categories[categoryKey], 'published');
    assert(draftBeforePublish.image.endsWith('-b.png'), `${categoryKey} Admin preview must use image B`);
    assert(customerBeforePublish.image.endsWith('-a.png'), `${categoryKey} customer view must remain on image A before Publish`);

    let publishedAfter = structuredClone(runtime.published);
    let publishedRequest = null;
    const progress = [];
    const result = await runtime.window.MVPLUX_CATEGORY_PUBLISHER.publishCategoryByKey(categoryKey, {
      categoryCardMap: { 'sport-legend-standee': 'sports', 'music-artist-standee': 'music' },
      saveApprovedDraft: async () => ({ ...structuredClone(runtime.drafts[categoryKey]), approvalStatus: 'approved' }),
      loadPublishedSnapshot: async () => structuredClone(runtime.published),
      confirmPublish: () => true,
      prepareImages: async () => [],
      callPublisher: async (payload) => {
        if (payload.action === 'publish') {
          publishedRequest = structuredClone(payload.snapshot);
          return { commitHash: 'a'.repeat(40), publishHistory: [] };
        }
        assert(payload.action === 'deployment-status', 'shared operation must poll the exact deployment action');
        return { deploymentResult: 'success', publishHistory: [] };
      },
      synchronizePublishedState: async (snapshot) => { publishedAfter = structuredClone(snapshot); },
      onProgress: (message, state) => progress.push({ message, state }),
      deploymentOptions: { wait: async () => {}, timeoutMs: 10, pollIntervalMs: 1 }
    });
    assert(result.ok && publishedRequest, `${categoryKey} shared Category publication must complete`);
    assert(publishedRequest.categories[categoryKey].card.image === runtime.drafts[categoryKey].card.image, `${categoryKey} published snapshot must contain normalized draft image B`);
    assert(JSON.stringify(publishedRequest.categories[categoryKey].displaySettings) === JSON.stringify(runtime.drafts[categoryKey].displaySettings), `${categoryKey} published snapshot must contain the exact normalized draft geometry`);
    const legacySlug = categoryKey === 'sports' ? 'sport-legend-standee' : 'music-artist-standee';
    assert(publishedRequest.categoryDisplayCards[legacySlug].cutoutImage.includes('legacy-'), `${categoryKey} scoped publish must not copy normalized visuals into the legacy compatibility store`);
    assert(progress.at(-1)?.message === 'Published to Website', `${categoryKey} must report website publication only after deployment confirmation`);

    const grid = renderFreshHomepage(runtime.window, structuredClone(publishedAfter));
    const image = grid.querySelector(`[data-admin-category-key="${categoryKey}"] .product-cutout`);
    const expected = runtime.window.MVPLUX_CATEGORY_PRESENTATION.resolveCategoryCardLayout(resolve(runtime.drafts[categoryKey], 'published'));
    assert(image?.getAttribute('src') === runtime.drafts[categoryKey].card.image, `${categoryKey} fresh customer DOM must use published image B`);
    assert(image.style.height === `${expected.imageSizePercent}%` && image.style.left === `${expected.imageLeftPercent}%` && image.style.bottom === `${expected.imageBottomPercent}%`, `${categoryKey} fresh customer DOM must reconstruct published size and X/Y`);
  }
});

Deno.test('Admin Mode exposes one shared Category publisher and never publishes when switching view mode', () => {
  const modeSwitch = sourceRange(storefrontSource, 'async function setAdminViewMode', '\n\nfunction renderAdminViewModeLabel');
  assert(storefrontSource.includes('data-admin-toolbar-action="publish-category"') && storefrontSource.includes('Publish Category'), 'selected normalized Categories must expose an explicit Publish Category action');
  assert(storefrontSource.includes('MVPLUX_CATEGORY_PUBLISHER.publishCategoryByKey') || storefrontSource.includes('publisher.publishCategoryByKey(categoryKey'), 'Admin Mode must call the shared Category publisher');
  assert(!modeSwitch.includes('publishCategory') && !modeSwitch.includes("action: 'publish'"), 'Admin Mode Off must never publish automatically');
  const turnOff = sourceRange(storefrontSource, 'function turnOffInlineAdminMode', '\n\nfunction installInlineAdminMode');
  assert(turnOff.includes("setAdminViewMode('published')"), 'Admin Mode Off must switch from the saved draft preview to the published customer lifecycle state');
});
