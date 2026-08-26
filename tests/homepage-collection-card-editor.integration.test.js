import { Window } from 'npm:happy-dom@18.0.1';

const adminSource = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
const styleSource = await Deno.readTextFile(new URL('../style.css', import.meta.url));
const presentationSource = await Deno.readTextFile(new URL('../category-presentation.js', import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceRange(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert(start >= 0 && end > start, `missing source range ${startToken}`);
  return source.slice(start, end);
}

function controlMarkup(name, value, minimum, maximum) {
  return `<input name="${name}" type="range" min="${minimum}" max="${maximum}" value="${value}" data-category-display-range="${name}">
    <input type="number" value="${value}" data-category-display-number="${name}">`;
}

function editorRuntime() {
  const window = new Window({ url: 'https://mvpluxcreations.com/admin.html#categories' });
  window.eval(presentationSource);
  window.document.body.innerHTML = `<form data-category-edit="sports">
    <input name="cardImage" value="images/kobe.png">
    <input name="cardBackgroundImage" value="images/gold-stage.png">
    <input name="representativeProductSlug" value="kobe-bryant">
    <input name="backgroundPosition" value="50% 100%">
    ${controlMarkup('standeeSizePercent', 80, 10, 250)}
    ${controlMarkup('standeeLeftPercent', 0, -50, 50)}
    ${controlMarkup('standeeVerticalPercent', 0, -50, 50)}
    ${controlMarkup('backgroundSizePercent', 100, 50, 300)}
    ${controlMarkup('backgroundWidthPercent', 100, 50, 300)}
    ${controlMarkup('backgroundHeightPercent', 100, 50, 300)}
    ${controlMarkup('backgroundPositionX', 50, 0, 100)}
    ${controlMarkup('backgroundPositionY', 100, 0, 100)}
  </form>`;
  const form = window.document.querySelector('form');
  let previewCount = 0;
  const setSource = sourceRange(adminSource, 'function setCategoryDisplayControlValue', '\n\nfunction updateCategoryDraftPublishedState');
  const adjustSource = sourceRange(adminSource, 'function applyCategoryDisplayAdjustment', '\n\nfunction syncCategoryBackgroundPosition');
  const helpers = new Function('window', 'CSS', 'dependencies', `
    const { syncCategoryBackgroundPosition, syncCategoryDisplayOutputs, previewCategoryEdit,
      markCategoryEditorDirty, CATEGORY_IMAGE_SIZE_DEFAULT, CATEGORY_BACKGROUND_SIZE_DEFAULT } = dependencies;
    ${setSource}
    ${adjustSource}
    return { setCategoryDisplayControlValue, applyCategoryDisplayAdjustment, resetCategoryCardLayout };
  `)(window, window.CSS, {
    syncCategoryBackgroundPosition: (target) => {
      target.elements.namedItem('backgroundPosition').value = `${target.elements.namedItem('backgroundPositionX').value}% ${target.elements.namedItem('backgroundPositionY').value}%`;
    },
    syncCategoryDisplayOutputs: () => {},
    markCategoryEditorDirty: (target) => { target.dataset.editorDirty = 'true'; },
    previewCategoryEdit: () => { previewCount += 1; },
    CATEGORY_IMAGE_SIZE_DEFAULT: 63,
    CATEGORY_BACKGROUND_SIZE_DEFAULT: 100,
    MVPLUX_CATEGORY_PRESENTATION: window.MVPLUX_CATEGORY_PRESENTATION
  });
  const value = (name) => Number(form.querySelector(`[data-category-display-range="${name}"]`).value);
  const number = (name) => Number(form.querySelector(`[data-category-display-number="${name}"]`).value);
  return { window, form, helpers, value, number, previewCount: () => previewCount };
}

function renderedCollectionEditor(width = 1440) {
  const window = new Window({ url: 'https://mvpluxcreations.com/admin.html#categories', width, height: 1100 });
  window.eval(presentationSource);
  const category = {
    key: 'sports', title: 'Sport Legends', description: 'Browse sports standees', page: 'sports-legends.html',
    visible: true, homepageVisible: true, order: 2,
    card: { image: 'images/kobe.png', backgroundImage: 'images/gold-stage.png', representativeProductSlug: 'kobe-bryant' },
    displaySettings: { standeeSizePercent: 90, standeeLeftPercent: 8, standeeVerticalPercent: -4, backgroundSizePercent: 125, backgroundWidthPercent: 115, backgroundHeightPercent: 130, backgroundPosition: '40% 85%' }
  };
  const display = {
    standeeSizePercent: 90, standeeLeftPercent: 8, standeeVerticalPercent: -4,
    backgroundSizePercent: 125, backgroundWidthPercent: 115, backgroundHeightPercent: 130, backgroundPosition: '40% 85%',
    titleSizePercent: 100, titleLeftPercent: 0, titleVerticalPercent: 0, titleAlign: 'center',
    descriptionSizePercent: 100, descriptionLeftPercent: 0, descriptionVerticalPercent: 0, descriptionAlign: 'center'
  };
  const markupSource = sourceRange(adminSource, 'function categoryDisplayAdjustmentButtons', '\n\nfunction suspiciousCategoryKeys');
  const render = new Function('dependencies', `
    const { effectiveCategoryDisplaySettings, categoryBackgroundPositionParts, readAdminCategories,
      categoryAssignedProducts, escapeAdminHtml, categoryPublishOperations, categoryCardDraftStatusMarkup,
      categoryPublishButtonMarkup, categoryVisualImagePicker, categoryDisplayRangeMarkup,
      normalizedMainCollectionsForBatch, categoryUsesSharedCollectionBackground,
      CATEGORY_IMAGE_SIZE_MIN, CATEGORY_IMAGE_SIZE_MAX, CATEGORY_BACKGROUND_SIZE_MIN,
      CATEGORY_BACKGROUND_SIZE_MAX } = dependencies;
    ${markupSource}
    return categoryEditMarkup;
  `)({
    effectiveCategoryDisplaySettings: () => display,
    categoryBackgroundPositionParts: () => ({ x: 40, y: 85 }),
    readAdminCategories: () => ({ sports: category }),
    categoryAssignedProducts: () => [{ slug: 'kobe-bryant', title: 'Kobe Bryant' }],
    escapeAdminHtml: (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;'),
    categoryPublishOperations: new Map(),
    normalizedMainCollectionsForBatch: () => [category],
    categoryUsesSharedCollectionBackground: () => false,
    categoryCardDraftStatusMarkup: () => '<section class="admin-category-draft-published-state">DRAFT PREVIEW — NOT LIVE YET</section>',
    categoryPublishButtonMarkup: () => '<button type="button" data-publish-category-edit>Publish to Website</button>',
    categoryVisualImagePicker: (_category, kind = 'category') => `<section class="admin-category-image-picker" data-image-kind="${kind}"><img class="admin-category-current-image-reference" src="${kind === 'background' ? category.card.backgroundImage : category.card.image}"><input name="${kind === 'background' ? 'cardBackgroundImage' : 'cardImage'}" value="${kind === 'background' ? category.card.backgroundImage : category.card.image}"></section>`,
    categoryDisplayRangeMarkup: controlMarkup,
    CATEGORY_IMAGE_SIZE_MIN: 10, CATEGORY_IMAGE_SIZE_MAX: 250,
    CATEGORY_BACKGROUND_SIZE_MIN: 50, CATEGORY_BACKGROUND_SIZE_MAX: 300
  });
  window.document.write(`<style>${styleSource}</style><section id="categories">${render(category)}</section>`);
  const previewSource = sourceRange(adminSource, 'function previewCategoryEdit', '\n\nfunction renderCategoryImagePickerGallery');
  const preview = new Function('window', 'dependencies', `
    const { categoryFromEditForm, effectiveAdminCategoryPresentation, adminImageReferencePresentation,
      escapeAdminHtml, IMAGE_IMPORT_DEFAULT_BACKGROUND, updateCategoryDraftPublishedState } = dependencies;
    ${previewSource}
    return previewCategoryEdit;
  `)(window, {
    categoryFromEditForm: () => category,
    effectiveAdminCategoryPresentation: () => window.MVPLUX_CATEGORY_PRESENTATION.resolveCategoryPresentation(category, { mode: 'draft', defaultBackground: 'images/default-stage.png' }),
    adminImageReferencePresentation: (value) => ({ reference: value, preview: value, label: value || 'No image' }),
    escapeAdminHtml: (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;'),
    IMAGE_IMPORT_DEFAULT_BACKGROUND: 'images/default-stage.png',
    updateCategoryDraftPublishedState: () => {}
  });
  const form = window.document.querySelector('[data-category-edit="sports"]');
  preview(form);
  return { window, form };
}

Deno.test('Homepage Collection Card movement buttons update the same image slider and numeric values', () => {
  const runtime = editorRuntime();
  runtime.helpers.applyCategoryDisplayAdjustment(runtime.form, 'standeeLeftPercent', 3);
  runtime.helpers.applyCategoryDisplayAdjustment(runtime.form, 'standeeVerticalPercent', -3);
  runtime.helpers.applyCategoryDisplayAdjustment(runtime.form, 'standeeSizePercent', 5);
  assert(runtime.value('standeeLeftPercent') === 3 && runtime.number('standeeLeftPercent') === 3, 'Right must update the normalized image X slider and number');
  assert(runtime.value('standeeVerticalPercent') === -3 && runtime.number('standeeVerticalPercent') === -3, 'Up must update the normalized image Y slider and number');
  assert(runtime.value('standeeSizePercent') === 85 && runtime.number('standeeSizePercent') === 85, 'Larger must update the normalized image-size slider and number');
  assert(runtime.previewCount() === 3, 'every button adjustment must immediately refresh the shared card preview');
});

Deno.test('Homepage Collection Card background buttons update existing position and zoom fields', () => {
  const runtime = editorRuntime();
  runtime.helpers.applyCategoryDisplayAdjustment(runtime.form, 'backgroundPositionX', -5);
  runtime.helpers.applyCategoryDisplayAdjustment(runtime.form, 'backgroundPositionY', -5);
  runtime.helpers.applyCategoryDisplayAdjustment(runtime.form, 'backgroundSizePercent', 10);
  runtime.helpers.applyCategoryDisplayAdjustment(runtime.form, 'backgroundWidthPercent', 20);
  runtime.helpers.applyCategoryDisplayAdjustment(runtime.form, 'backgroundHeightPercent', -10);
  assert(runtime.value('backgroundPositionX') === 45 && runtime.number('backgroundPositionX') === 45, 'background Left must synchronize X controls');
  assert(runtime.value('backgroundPositionY') === 95 && runtime.number('backgroundPositionY') === 95, 'background Up must synchronize Y controls');
  assert(runtime.value('backgroundSizePercent') === 110 && runtime.number('backgroundSizePercent') === 110, 'Zoom In must synchronize zoom controls');
  assert(runtime.value('backgroundWidthPercent') === 120 && runtime.number('backgroundWidthPercent') === 120, 'Wider must synchronize background-width controls');
  assert(runtime.value('backgroundHeightPercent') === 90 && runtime.number('backgroundHeightPercent') === 90, 'Shorter must synchronize background-height controls');
  assert(runtime.form.elements.namedItem('backgroundPosition').value === '45% 95%', 'background buttons must keep the one normalized backgroundPosition field synchronized');
});

Deno.test('Reset Card Layout resets geometry only and preserves representative, images, and Product data', () => {
  const runtime = editorRuntime();
  const products = { 'kobe-bryant': { slug: 'kobe-bryant', cutoutImage: 'images/product-kobe.png', backgroundImage: 'images/product-showroom.png', categories: ['sports'] } };
  const productsBefore = structuredClone(products);
  ['standeeSizePercent', 'standeeLeftPercent', 'standeeVerticalPercent', 'backgroundSizePercent', 'backgroundWidthPercent', 'backgroundHeightPercent', 'backgroundPositionX', 'backgroundPositionY']
    .forEach((name) => runtime.helpers.setCategoryDisplayControlValue(runtime.form, name, 25));
  runtime.helpers.resetCategoryCardLayout(runtime.form);
  assert(runtime.value('standeeSizePercent') === 63 && runtime.value('standeeLeftPercent') === 0 && runtime.value('standeeVerticalPercent') === -16, 'reset must restore the standard visually centered standee geometry');
  assert(runtime.value('backgroundSizePercent') === 100 && runtime.value('backgroundWidthPercent') === 100 && runtime.value('backgroundHeightPercent') === 100 && runtime.value('backgroundPositionX') === 50 && runtime.value('backgroundPositionY') === 100, 'reset must restore only the normalized background geometry');
  assert(runtime.form.elements.namedItem('cardImage').value === 'images/kobe.png', 'reset must preserve the Homepage Collection Card image');
  assert(runtime.form.elements.namedItem('cardBackgroundImage').value === 'images/gold-stage.png', 'reset must preserve the Homepage Collection Card background');
  assert(runtime.form.elements.namedItem('representativeProductSlug').value === 'kobe-bryant', 'reset must preserve the representative Product / Standee');
  assert(JSON.stringify(products) === JSON.stringify(productsBefore), 'reset must never modify Product data');
});

Deno.test('compact editor clearly separates draft preview from published website state', () => {
  const editor = sourceRange(adminSource, 'function categoryEditMarkup', '\n\nfunction suspiciousCategoryKeys');
  const events = sourceRange(adminSource, 'function setupCategoryManagerEvents', '\n\nfunction renderAdminProducts');
  assert(editor.includes('DRAFT PREVIEW — NOT LIVE YET') || adminSource.includes('DRAFT PREVIEW — NOT LIVE YET'), 'the preview must explicitly identify unpublished draft state');
  assert(adminSource.includes('Published website currently uses') && adminSource.includes('Draft will use'), 'the editor must compare compact published and draft image/background references');
  assert(editor.indexOf('admin-category-editor-actions') > editor.indexOf('admin-category-controls-column'), 'Preview, Save Draft, and Publish must live with the right-side controls');
  for (const label of ['← Left', 'Right →', '↑ Up', '↓ Down', 'Smaller', 'Larger', 'Zoom Out', 'Zoom In', 'Reset Card Layout']) assert(editor.includes(label) || adminSource.includes(label), `missing compact control ${label}`);
  assert(events.includes('applyCategoryDisplayAdjustment') && events.includes('resetCategoryCardLayout'), 'delegated Dashboard buttons must call the shared normalized control helpers');
  assert(adminSource.includes("state === 'published' && message === 'Published to Website' ? 'PUBLISHED TO WEBSITE'"), 'deployment-confirmed publication must have an unmistakable final status');
  assert(styleSource.includes('grid-template-columns: minmax(400px,.84fr) minmax(560px,1.16fr)') && styleSource.includes('position: sticky'), 'desktop must keep one live card preview beside compact controls');
});

Deno.test('fresh desktop Main Collection DOM uses one sticky combined preview beside compact controls', () => {
  const desktop = renderedCollectionEditor(1440);
  const workspace = desktop.form.querySelector('.admin-category-editor-workspace');
  const previewColumn = workspace.children[0];
  const controlsColumn = workspace.children[1];
  const workspaceStyle = desktop.window.getComputedStyle(workspace);
  assert(previewColumn.matches('.admin-category-preview-column') && controlsColumn.matches('.admin-category-controls-column'), 'the actual editor DOM must place preview left and controls right');
  assert(workspaceStyle.display === 'grid' && workspaceStyle.gridTemplateColumns.includes('minmax(400px,.84fr)') && workspaceStyle.gridTemplateColumns.includes('minmax(560px,1.16fr)'), '1440px desktop must retain the two-column workspace');
  assert(desktop.window.getComputedStyle(previewColumn).position === 'sticky', 'the large left preview must remain sticky on desktop');
  assert(desktop.window.getComputedStyle(controlsColumn.querySelector('.admin-category-editor-action-stack')).position === 'sticky', 'Save and Publish must remain sticky at the top of the right controls');
  assert(controlsColumn.querySelector('[data-back-to-collections]') && controlsColumn.querySelector('[data-preview-category-edit]') && controlsColumn.querySelector('button[type="submit"]') && controlsColumn.querySelector('[data-publish-category-edit]'), 'the right toolbar must contain Back, Preview, Save Draft, and Publish');
  assert(controlsColumn.querySelector('.admin-category-image-section[open]') && controlsColumn.querySelector('.admin-category-background-section[open]'), 'Image and Background accordions must be open by default');
  assert(!controlsColumn.querySelector('.admin-category-information[open]') && !controlsColumn.querySelector('.admin-category-settings[open]'), 'Information and Visibility sections must stay compact until opened');
  const previews = desktop.form.querySelectorAll('.admin-category-placement-preview');
  assert(previews.length === 1, 'the editor must create exactly one large Homepage Collection Card preview');
  assert(previews[0].querySelector('.category-background-layer') && previews[0].querySelector('.product-cutout'), 'background and Product/Standee image must render together in that same preview');
  assert(!controlsColumn.querySelector('.admin-category-placement-preview'), 'the controls must not contain a second large background preview');
  const compactReferences = controlsColumn.querySelectorAll('.admin-category-current-image-reference');
  assert(compactReferences.length === 2, 'Image and Background controls may retain only their two compact reference thumbnails');

  const tablet = renderedCollectionEditor(900);
  assert(tablet.window.getComputedStyle(tablet.form.querySelector('.admin-category-editor-workspace')).gridTemplateColumns === 'minmax(0, 1fr)', 'smaller screens may stack the editor into one column');
});

Deno.test('new and reset standees center visually while existing custom geometry remains unchanged', () => {
  const window = new Window();
  window.eval(presentationSource);
  const resolver = window.MVPLUX_CATEGORY_PRESENTATION;
  const defaults = resolver.defaultStandeeDisplay();
  const defaultLayout = resolver.resolveCategoryCardLayout({ display: defaults });
  const centeredBottom = (100 - defaultLayout.imageSizePercent) / 2;
  assert(defaults.standeeSizePercent === 63 && defaults.standeeLeftPercent === 0 && defaults.standeeVerticalPercent === -16, 'new/reset cards must receive only the standard centered standee defaults');
  assert(Math.abs(defaultLayout.imageBottomPercent - centeredBottom) <= 1, 'the normalized defaults must center the standee vertically instead of anchoring it to the bottom');

  const customized = { standeeSizePercent: 118, standeeLeftPercent: 21, standeeVerticalPercent: -9 };
  const presentation = resolver.resolveCategoryPresentation({ key: 'music', displaySettings: customized });
  assert(presentation.display.standeeSizePercent === 118 && presentation.display.standeeLeftPercent === 21 && presentation.display.standeeVerticalPercent === -9, 'resolving an existing customized card must not rewrite its intentional placement');
});

Deno.test('Apply Background to All builds private normalized patches containing background fields only', () => {
  const source = sourceRange(adminSource, 'function categoryBackgroundBatchOperations', '\n\nasync function applyCategoryBackgroundToAll');
  const build = new Function(`${source}; return categoryBackgroundBatchOperations;`)();
  const sourceCategory = {
    key: 'sports', title: 'Sport Legends', order: 4, visible: true,
    card: { image: 'images/kobe.png', backgroundImage: 'images/shared-stage.png', representativeProductSlug: 'kobe' },
    displaySettings: { standeeSizePercent: 121, standeeLeftPercent: 17, standeeVerticalPercent: -8, backgroundPosition: '42% 67%', backgroundSizePercent: 145, backgroundWidthPercent: 130, backgroundHeightPercent: 88 }
  };
  const target = {
    key: 'movies', title: 'Movie Characters', description: 'Movie collection', order: 1, visible: false, homepageVisible: true,
    card: { image: 'images/terminator.png', backgroundImage: 'images/old-stage.png', representativeProductSlug: 'terminator' },
    displaySettings: { standeeSizePercent: 83, standeeLeftPercent: -12, standeeVerticalPercent: 6, backgroundPosition: '50% 100%', backgroundSizePercent: 100, titleSizePercent: 115 },
    products: ['terminator'], assignments: { products: ['terminator'] }, price: 999
  };
  const before = structuredClone(target);
  const [operation] = build(sourceCategory, [target], '2026-08-26T12:00:00.000Z');
  const saved = { ...target, ...operation.patch };
  assert(saved.card.backgroundImage === 'images/shared-stage.png', 'batch background must copy the selected background reference');
  assert(saved.displaySettings.backgroundPosition === '42% 67%' && saved.displaySettings.backgroundSizePercent === 145, 'batch background must copy normalized X/Y and overall zoom');
  assert(saved.displaySettings.backgroundWidthPercent === 130 && saved.displaySettings.backgroundHeightPercent === 88, 'batch background must copy independent width and height');
  assert(saved.card.image === before.card.image && saved.card.representativeProductSlug === before.card.representativeProductSlug, 'batch background must preserve standee and representative Product');
  assert(saved.displaySettings.standeeSizePercent === before.displaySettings.standeeSizePercent && saved.displaySettings.standeeLeftPercent === before.displaySettings.standeeLeftPercent && saved.displaySettings.standeeVerticalPercent === before.displaySettings.standeeVerticalPercent, 'batch background must preserve each standee geometry');
  for (const field of ['title', 'description', 'order', 'visible', 'homepageVisible', 'products', 'assignments', 'price']) {
    assert(JSON.stringify(saved[field]) === JSON.stringify(before[field]), `batch background must preserve ${field}`);
  }
  assert(operation.patch.approvalStatus === 'draft' && operation.patch.draftStatus === 'draft', 'Apply Background to All must save privately and never publish');
});

Deno.test('Shared Collection Card Background saves every Main Collection in one protected batch', async () => {
  const window = new Window({ url: 'https://mvpluxcreations.com/admin.html#categories' });
  window.document.body.innerHTML = `<form data-shared-collection-background-form data-editor-dirty="true">
    <input name="cardBackgroundImage" value="images/shared-gold-stage.png">
    <input name="backgroundPositionX" value="37"><input name="backgroundPositionY" value="68">
    <input name="backgroundSizePercent" value="145"><input name="backgroundWidthPercent" value="132"><input name="backgroundHeightPercent" value="184">
    <p data-shared-collection-background-status></p>
  </form>`;
  const targets = [
    { key: 'sports', title: 'Sport Legends', card: { image: 'images/kobe.png', representativeProductSlug: 'kobe' }, displaySettings: { standeeSizePercent: 91, standeeLeftPercent: 17, standeeVerticalPercent: -8 }, order: 2 },
    { key: 'movies', title: 'Movie Stars', card: { image: 'images/terminator.png', representativeProductSlug: 't800' }, displaySettings: { standeeSizePercent: 84, standeeLeftPercent: -9, standeeVerticalPercent: 4 }, order: 1 }
  ];
  const before = structuredClone(targets);
  const saveSource = sourceRange(adminSource, 'async function saveSharedCollectionBackgroundChanges', '\n\nasync function applyCategoryBackgroundToAll');
  const batchBuilderSource = sourceRange(adminSource, 'function categoryBackgroundBatchOperations', '\n\nasync function saveSharedCollectionBackgroundChanges');
  let batchCalls = 0;
  let savedOperations = [];
  const save = new Function('document', 'FormData', 'dependencies', `
    const { editorHasUnsavedChanges, normalizedMainCollectionsForBatch, sharedCollectionBackgroundFromForm,
      sharedCollectionBackgroundSource, adminStateUtils, saveAdminCollectionOperations, setStatus } = dependencies;
    let adminLastSaveError = '';
    ${batchBuilderSource}
    ${saveSource}
    return saveSharedCollectionBackgroundChanges;
  `)(window.document, window.FormData, {
    editorHasUnsavedChanges: (form) => form.dataset.editorDirty === 'true',
    normalizedMainCollectionsForBatch: () => targets,
    sharedCollectionBackgroundFromForm: (form) => ({
      backgroundImage: form.elements.namedItem('cardBackgroundImage').value,
      backgroundPosition: `${form.elements.namedItem('backgroundPositionX').value}% ${form.elements.namedItem('backgroundPositionY').value}%`,
      backgroundSizePercent: Number(form.elements.namedItem('backgroundSizePercent').value),
      backgroundWidthPercent: Number(form.elements.namedItem('backgroundWidthPercent').value),
      backgroundHeightPercent: Number(form.elements.namedItem('backgroundHeightPercent').value)
    }),
    sharedCollectionBackgroundSource: (configuration) => ({ card: { backgroundImage: configuration.backgroundImage }, displaySettings: configuration }),
    adminStateUtils: { validateAdminImageReference: () => ({ valid: true }) },
    saveAdminCollectionOperations: async (operations) => { batchCalls += 1; savedOperations = structuredClone(operations); return { ok: true }; },
    setStatus: () => {}
  });
  assert(await save(), 'shared background private save must succeed');
  assert(batchCalls === 1 && savedOperations.length === 2, 'all Main Collections must be sent through one protected batch request');
  savedOperations.forEach((operation, index) => {
    const saved = { ...targets[index], ...operation.patch };
    assert(saved.card.backgroundImage === 'images/shared-gold-stage.png', 'the shared background image must be copied');
    assert(saved.displaySettings.backgroundPosition === '37% 68%' && saved.displaySettings.backgroundSizePercent === 145, 'shared X/Y/zoom must be saved from the controller values');
    assert(saved.displaySettings.backgroundWidthPercent === 132 && saved.displaySettings.backgroundHeightPercent === 184, 'shared width and height must remain independent');
    assert(saved.card.image === before[index].card.image && saved.card.representativeProductSlug === before[index].card.representativeProductSlug, 'the batch must preserve each standee image and representative Product');
    assert(saved.displaySettings.standeeSizePercent === before[index].displaySettings.standeeSizePercent && saved.displaySettings.standeeLeftPercent === before[index].displaySettings.standeeLeftPercent && saved.displaySettings.standeeVerticalPercent === before[index].displaySettings.standeeVerticalPercent, 'the batch must preserve each standee geometry');
    assert(saved.title === before[index].title && saved.order === before[index].order, 'the batch must preserve Collection text and ordering');
  });
  assert(window.document.querySelector('[data-shared-collection-background-form]').dataset.editorDirty === 'false', 'successful batch save must clear the shared controller dirty state');
});

Deno.test('Save All saves every dirty open Collection editor privately and Publish All flushes them first', async () => {
  const window = new Window({ url: 'https://mvpluxcreations.com/admin.html#categories' });
  window.document.body.innerHTML = '<form class="admin-category-edit-form" data-category-edit="sports" data-editor-dirty="true"></form><form class="admin-category-edit-form" data-category-edit="movies" data-editor-dirty="true"></form><form data-shared-collection-background-form data-editor-dirty="true"></form>';
  const saveAllSource = sourceRange(adminSource, 'async function saveAllOpenCollectionChanges', '\n\nfunction categoryKeyForActionTarget');
  const calls = [];
  let status = '';
  const saveAll = new Function('document', 'dependencies', `
    const { editorHasUnsavedChanges, readAdminCategories, saveCategoryEditForm, saveSharedCollectionBackgroundChanges, setStatus } = dependencies;
    ${saveAllSource}
    return saveAllOpenCollectionChanges;
  `)(window.document, {
    editorHasUnsavedChanges: (form) => form.dataset.editorDirty === 'true',
    readAdminCategories: () => ({ sports: { title: 'Sport Legends' }, movies: { title: 'Movie Characters' } }),
    saveCategoryEditForm: async (form, state, options) => { calls.push([form.dataset.categoryEdit, state, options.render]); form.dataset.editorDirty = 'false'; return true; },
    saveSharedCollectionBackgroundChanges: async () => { calls.push(['shared-background', 'draft', false]); return true; },
    setStatus: (message) => { status = message; }
  });
  assert(await saveAll(), 'Save All must succeed when every existing normalized save succeeds');
  assert(JSON.stringify(calls) === JSON.stringify([['sports', 'draft', false], ['movies', 'draft', false], ['shared-background', 'draft', false]]), 'Save All must reuse the existing private save controllers for every dirty editor and the shared background batch');
  assert(status.includes('saved privately') && status.includes('Nothing was published'), 'Save All must clearly remain private');

  const publishSource = sourceRange(adminSource, 'async function publishAllSavedChanges', '\n\nasync function discardArchitecturePrivateChange');
  assert(publishSource.indexOf('saveAllOpenCollectionChanges({ quiet: true })') < publishSource.indexOf('architectureReviewItems()'), 'Publish All must flush open Collection forms before building one shared deployment');
  assert((publishSource.match(/publishScopedChangeIds\(/g) || []).length === 1, 'Publish All must invoke one existing deployment operation, not one deployment per Collection');
});

Deno.test('Main Collection text remains Category-owned when representative Product changes', () => {
  const categoryFormSource = sourceRange(adminSource, 'function categoryFromEditForm', '\n\nasync function saveCategoryEditForm');
  assert(categoryFormSource.includes("title: String(data.get('title')") && categoryFormSource.includes("description: String(data.get('description')"), 'Main Collection title and description must save from their own editor fields');
  const events = sourceRange(adminSource, 'function setupCategoryManagerEvents', '\n\nfunction renderAdminProducts');
  assert(!events.includes('product?.cutoutImage') && !events.includes('product.title') && !events.includes('product.description'), 'representative selection must update only representativeProductSlug through the normal form save and must not copy Product presentation fields');
  assert(categoryFormSource.includes("representativeProductSlug: current.parentKey ? '' : String(data.get('representativeProductSlug')"), 'representative selection must remain a separate normalized card reference');
});
