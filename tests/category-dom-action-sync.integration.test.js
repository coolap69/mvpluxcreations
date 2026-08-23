import { Window } from 'npm:happy-dom@18.0.1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceRange(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start);
  assert(start >= 0 && end > start, `missing source range: ${startToken}`);
  return source.slice(start, end);
}

async function categoryRuntime() {
  const [source, presentationSource] = await Promise.all([
    Deno.readTextFile(new URL('../script.js', import.meta.url)),
    Deno.readTextFile(new URL('../category-presentation.js', import.meta.url))
  ]);
  const window = new Window({ url: 'https://mvpluxcreations.com/index.html?adminView=edit#home' });
  new Function('window', presentationSource)(window);
  const categories = {
    sports: {
      key: 'sports', title: 'Sports Legends', description: 'Sports collection', page: 'sports-legends.html',
      visible: true, homepageVisible: true, order: 1,
      card: { image: 'images/sports-a.png', backgroundImage: 'images/sports-bg-a.jpg' },
      displaySettings: { standeeSizePercent: 80, standeeLeftPercent: 0, standeeVerticalPercent: 0, backgroundPosition: '50% 100%', backgroundSizePercent: 100 }
    },
    music: {
      key: 'music', title: 'Music Artists', description: 'Music collection', page: 'music-artists.html',
      visible: true, homepageVisible: true, order: 2,
      card: { image: 'images/music-a.png', backgroundImage: 'images/music-bg-a.jpg' },
      displaySettings: { standeeSizePercent: 90, standeeLeftPercent: -4, standeeVerticalPercent: 3, backgroundPosition: '40% 90%', backgroundSizePercent: 125 }
    }
  };
  const presentation = (key) => window.MVPLUX_CATEGORY_PRESENTATION.resolveCategoryPresentation(categories[key], {
    mode: 'draft', defaultBackground: 'images/shared.jpg', globalDisplaySettings: {}
  });
  const renderSource = sourceRange(source, 'function renderExistingCategoryCardFromNormalized', '\n\nfunction refreshStorefrontCategoryFromNormalized');
  const render = new Function('dependencies', `
    const { getAdminCategories, getEffectiveCategoryPresentation, renderInlineAdminImageState, initializeInlineCategoryImageControls, document, window } = dependencies;
    ${renderSource}
    return renderExistingCategoryCardFromNormalized;
  `)({
    getAdminCategories: () => categories,
    getEffectiveCategoryPresentation: presentation,
    renderInlineAdminImageState: () => {},
    initializeInlineCategoryImageControls: () => {},
    document: window.document,
    window
  });
  const makeCard = (key) => {
    const card = window.document.createElement('article');
    card.className = 'admin-master-category-card';
    card.dataset.adminCategoryKey = key;
    card.innerHTML = `<a class="product-image-link"><div class="admin-category-storefront-stage"><span class="category-background-layer"></span><img class="product-cutout"></div></a><h3 data-admin-category-field="title"><a class="product-title-link"></a></h3><p data-admin-category-field="description"></p><a class="button-link"></a>`;
    window.document.body.append(card);
    render(card, key);
    return card;
  };
  return { source, window, categories, presentation, render, makeCard };
}

Deno.test('actual Category Size and movement control path persists normalized state and re-renders from it', async () => {
  const runtime = await categoryRuntime();
  const card = runtime.makeCard('sports');
  const image = card.querySelector('.product-cutout');
  const stage = card.querySelector('.admin-category-storefront-stage');
  stage.getBoundingClientRect = () => ({ width: 400, height: 200 });
  image._adminImageState = { x: 0, y: 0, scale: 1, rotate: 0, locked: false };
  image._adminCategoryDisplayBase = { standeeSizePercent: 80, standeeLeftPercent: 0, standeeVerticalPercent: 0 };

  const patchSource = sourceRange(runtime.source, 'function inlineCategoryDisplayPatch', '\n\nasync function persistInlineOwnedDisplay');
  const persistSource = sourceRange(runtime.source, 'async function persistInlineOwnedDisplay', '\n\nfunction scheduleInlineOwnedDisplaySave');
  const controlSource = sourceRange(runtime.source, 'function changeSelectedInlineAdminImage', '\n\nfunction getInlineAdminImageFrame');
  let savedPatch = null;
  let optimisticState = null;
  const factory = new Function('dependencies', `
    const { inlineAdminOwnedField, getEffectiveCategoryPresentation, getInlineAdminImageFrame, window,
      getAdminCategories, saveStorefrontCategoryPatch, updateInlineAdminToolbarState, getManagedProductBySlug,
      saveStorefrontProductPatch, getActiveInlineAdminImage, isInlineAdminBackgroundImage, getInlineAdminSnapshot,
      safeAdminImageNumber, renderInlineAdminImageState, saveInlineAdminEdit, pushInlineAdminHistory } = dependencies;
    ${patchSource}
    ${persistSource}
    ${controlSource}
    return { inlineCategoryDisplayPatch, persistInlineOwnedDisplay, changeSelectedInlineAdminImage };
  `);
  const helpers = factory({
    inlineAdminOwnedField: () => ({ type: 'category-card', categoryKey: 'sports' }),
    getEffectiveCategoryPresentation: runtime.presentation,
    getInlineAdminImageFrame: () => stage,
    window: runtime.window,
    getAdminCategories: () => runtime.categories,
    saveStorefrontCategoryPatch: async (key, section, patch) => {
      assert(section === 'displaySettings', 'toolbar placement must save normalized displaySettings');
      savedPatch = structuredClone(patch);
      runtime.categories[key].displaySettings = { ...runtime.categories[key].displaySettings, ...patch };
      runtime.render(card, key);
      return true;
    },
    updateInlineAdminToolbarState: () => {},
    getManagedProductBySlug: () => null,
    saveStorefrontProductPatch: async () => false,
    getActiveInlineAdminImage: () => image,
    isInlineAdminBackgroundImage: () => false,
    getInlineAdminSnapshot: () => ({}),
    safeAdminImageNumber: (value, fallback, minimum, maximum) => Number.isFinite(Number(value)) ? Math.max(minimum, Math.min(maximum, Number(value))) : fallback,
    renderInlineAdminImageState: (target) => { target.style.transform = `translate(${target._adminImageState.x}px, ${target._adminImageState.y}px) scale(${target._adminImageState.scale})`; },
    saveInlineAdminEdit: (_target, state) => { optimisticState = structuredClone(state); },
    pushInlineAdminHistory: () => {}
  });

  helpers.changeSelectedInlineAdminImage({ x: 96, y: 20, scale: 1.05 });
  assert(optimisticState?.scale === 1.05 && image.style.transform.includes('scale(1.05)'), 'Size + must optimistically update the selected DOM image');
  await helpers.persistInlineOwnedDisplay(image, optimisticState, { type: 'category-card', categoryKey: 'sports' });
  assert(savedPatch.standeeSizePercent === 84, 'Size + path must persist its normalized Category size');
  assert(savedPatch.standeeLeftPercent === 24 && savedPatch.standeeVerticalPercent === 10, 'movement must persist normalized Category X/Y fields');
  assert(runtime.presentation('sports').display.standeeSizePercent === 84, 'Admin Mode reload must resolve the saved size');
  assert(card.querySelector('.product-cutout').style.height === '84%', 'DOM must be rendered back from the normalized saved Category');
  assert(runtime.categories.sports.displaySettings.standeeLeftPercent === 24, 'Dashboard must read the same normalized X value');
});

Deno.test('Category image change persists for non-Sports Categories and failed preview restores saved presentation', async () => {
  const runtime = await categoryRuntime();
  const card = runtime.makeCard('music');
  const imageSaveSource = sourceRange(runtime.source, 'async function persistInlineOwnedField', '\n\nfunction scheduleInlineOwnedFieldSave');
  const persistInlineOwnedField = new Function('dependencies', `
    const { saveStorefrontCategoryPatch, saveStorefrontProductPatch, getManagedProductBySlug, window } = dependencies;
    ${imageSaveSource}
    return persistInlineOwnedField;
  `)({
    window: runtime.window,
    getManagedProductBySlug: () => null,
    saveStorefrontProductPatch: async () => false,
    saveStorefrontCategoryPatch: async (key, section, patch) => {
      assert(section === 'card' && Object.keys(patch).join(',') === 'image', 'Category image selector must save only categories[key].card.image');
      runtime.categories[key].card = { ...runtime.categories[key].card, ...patch };
      runtime.render(card, key);
      return true;
    }
  });
  assert(await persistInlineOwnedField(card.querySelector('.product-cutout'), {
    type: 'category-card', categoryKey: 'music', section: 'card', field: 'image'
  }, 'images/music-b.png'), 'non-Sports Category image selection must save successfully');
  runtime.categories.music.card.backgroundImage = 'images/music-bg-b.jpg';
  runtime.categories.music.displaySettings = {
    ...runtime.categories.music.displaySettings,
    backgroundPosition: '65% 35%', backgroundSizePercent: 170
  };
  runtime.render(card, 'music');
  assert(card.querySelector('.product-cutout').getAttribute('src') === 'images/music-b.png', 'normalized card.image must own the changed image');
  assert(card.querySelector('.category-background-layer').style.backgroundImage.includes('music-bg-b.jpg'), 'normalized card.backgroundImage must own the changed background');
  assert(card.querySelector('.category-background-layer').style.backgroundPosition === '65% 35%', 'background X/Y must render from normalized backgroundPosition');
  assert(card.querySelector('.category-background-layer').style.transform === 'scale(1.7)', 'background zoom must render from normalized backgroundSizePercent');

  card.querySelector('.product-cutout').style.height = '240%';
  card.querySelector('.product-cutout').style.left = '5%';
  runtime.render(card, 'music');
  assert(card.querySelector('.product-cutout').style.height === '90%', 'a failed optimistic size change must restore the last saved normalized value');
  assert(card.querySelector('.product-cutout').style.left === '46%', 'a failed optimistic movement must restore the last saved normalized position');
});

Deno.test('normalized Category controls never fall back to page-owned visibility or order edits', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const controls = sourceRange(source, 'function ensureInlineAdminCardControls', '\n\nfunction inlineRecordContext');
  const normalizedMove = sourceRange(source, 'async function moveNormalizedHomepageCategory', '\n\nfunction ensureInlineAdminCardControls');
  assert(controls.includes('Hide Category') && controls.includes('Hide from Homepage'), 'normalized Category controls must expose both visibility meanings');
  assert(controls.includes("saveInlineCategoryVisibility(card, 'visible', false)") && controls.includes("saveInlineCategoryVisibility(card, 'homepageVisible', false)"), 'each button must save its authoritative normalized field');
  assert(controls.includes('data-category-key=') && controls.includes('resolveInlineAdminCategoryKey(actionControl)'), 'every Category action must carry and verify its explicit key');
  assert(normalizedMove.includes('saveStorefrontWorkingCollections') && normalizedMove.includes('order: targetOrder'), 'Category arrows must save normalized order');
  assert(!normalizedMove.includes('inlineAdminEdits') && !normalizedMove.includes('pageVisualStates') && !normalizedMove.includes('homepageCategoryOrder'), 'normalized Category order must not use legacy page ownership');
  const visibility = sourceRange(source, 'async function saveInlineCategoryVisibility', '\n\nasync function moveNormalizedHomepageCategory');
  assert(!visibility.includes('inlineAdminEdits') && !visibility.includes('pageVisualStates') && !visibility.includes('writeInlineHiddenCards'), 'normalized visibility must not create a competing hidden-card record');

  const window = new Window();
  window.document.body.innerHTML = '<section data-admin-category-key="sports"><div data-admin-category-key="basketball"><button data-category-key="basketball">Move</button></div></section>';
  const resolverSource = sourceRange(source, 'function resolveInlineAdminCategoryKey', '\n\nfunction inlineAdminOwnedField');
  const resolveKey = new Function(`${resolverSource}\nreturn resolveInlineAdminCategoryKey;`)();
  assert(resolveKey(window.document.querySelector('button')) === 'basketball', 'the explicit Child Group action key must win over its Main Category ancestor');
});

Deno.test('Category save failure is visibly reported and restores normalized DOM', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const save = sourceRange(source, 'async function saveStorefrontCategoryPatch', '\n\nasync function saveStorefrontProductPatches');
  assert(save.includes('Saving Category…'), 'Category action must immediately identify the save attempt');
  assert(save.includes('Category save failed — change was not saved.'), 'Category save failure must be visible');
  const failure = save.lastIndexOf('refreshStorefrontCategoryFromNormalized(categoryKey)');
  const failureMessage = save.lastIndexOf('Category save failed — change was not saved.');
  assert(failure > failureMessage, 'failed saves must re-render from the last normalized Category after reporting failure');
});
