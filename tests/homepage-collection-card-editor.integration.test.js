import { Window } from 'npm:happy-dom@18.0.1';

const adminSource = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
const adminHtml = await Deno.readTextFile(new URL('../admin.html', import.meta.url));
const styleSource = await Deno.readTextFile(new URL('../style.css', import.meta.url));
const presentationSource = await Deno.readTextFile(new URL('../category-presentation.js', import.meta.url));
const sectionLayoutSource = await Deno.readTextFile(new URL('../storefront-section-layout.js', import.meta.url));

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
      normalizedMainCollectionsForBatch, mainCollectionsForBackgroundBatch, categoryUsesSharedCollectionBackground,
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
    mainCollectionsForBackgroundBatch: () => [category],
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
  for (const label of ['Image Zoom', 'Horizontal Position', 'Vertical Position', 'Rotate Image', 'Reset Image Position / Zoom / Rotation']) assert(editor.includes(label), `missing compact individual image control ${label}`);
  assert(events.includes('beginCategoryPreviewImageDrag') && events.includes("section.addEventListener('wheel'"), 'individual Dashboard preview must support direct drag and wheel zoom');
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
  assert(controlsColumn.querySelector('.admin-category-image-section[open]') && !controlsColumn.querySelector('.admin-category-background-section'), 'individual Main Collection editor must keep Image open and remove per-card Background controls');
  assert(!controlsColumn.querySelector('.admin-category-information[open]') && !controlsColumn.querySelector('.admin-category-settings[open]'), 'Information and Visibility sections must stay compact until opened');
  const previews = desktop.form.querySelectorAll('.admin-category-placement-preview');
  assert(previews.length === 1, 'the editor must create exactly one large Homepage Collection Card preview');
  assert(previews[0].querySelector('.category-background-layer') && previews[0].querySelector('.product-cutout'), 'background and Product/Standee image must render together in that same preview');
  assert(!controlsColumn.querySelector('.admin-category-placement-preview'), 'the controls must not contain a second large background preview');
  const compactReferences = controlsColumn.querySelectorAll('.admin-category-current-image-reference');
  assert(compactReferences.length === 1, 'the individual editor may retain only its compact image reference thumbnail');

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
  window.document.querySelector('form').dataset.initialSectionLayout = JSON.stringify({ sectionMaxWidthPx: 1400 });
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
    const { editorHasUnsavedChanges, loadAdminLiveSettings, normalizedMainCollectionsForBatch, mainCollectionsForBackgroundBatch, sharedCollectionBackgroundFromForm,
      sharedCollectionBackgroundSource, featuredCategoriesSectionLayoutFromForm, featuredCategoriesSectionLayoutOperation,
      adminStateUtils, saveAdminCollectionOperations, renderCategoryManager, setStatus } = dependencies;
    let adminLastSaveError = '';
    ${batchBuilderSource}
    ${saveSource}
    return saveSharedCollectionBackgroundChanges;
  `)(window.document, window.FormData, {
    editorHasUnsavedChanges: (form) => form.dataset.editorDirty === 'true',
    loadAdminLiveSettings: async () => true,
    normalizedMainCollectionsForBatch: () => targets,
    mainCollectionsForBackgroundBatch: () => targets,
    sharedCollectionBackgroundFromForm: (form) => ({
      backgroundImage: form.elements.namedItem('cardBackgroundImage').value,
      backgroundPosition: `${form.elements.namedItem('backgroundPositionX').value}% ${form.elements.namedItem('backgroundPositionY').value}%`,
      backgroundSizePercent: Number(form.elements.namedItem('backgroundSizePercent').value),
      backgroundWidthPercent: Number(form.elements.namedItem('backgroundWidthPercent').value),
      backgroundHeightPercent: Number(form.elements.namedItem('backgroundHeightPercent').value)
    }),
    sharedCollectionBackgroundSource: (configuration) => ({ card: { backgroundImage: configuration.backgroundImage }, displaySettings: configuration }),
    featuredCategoriesSectionLayoutFromForm: () => ({ sectionMaxWidthPx: 1400 }),
    featuredCategoriesSectionLayoutOperation: () => { throw new Error('unchanged section layout must not be saved'); },
    adminStateUtils: { validateAdminImageReference: () => ({ valid: true }) },
    saveAdminCollectionOperations: async (operations) => { batchCalls += 1; savedOperations = structuredClone(operations); return { ok: true }; },
    renderCategoryManager: () => {},
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

Deno.test('Shared background group includes recognized legacy-only cards as normalized private drafts', () => {
  const batchBuilderSource = sourceRange(adminSource, 'function categoryBackgroundBatchOperations', '\n\nasync function saveSharedCollectionBackgroundChanges');
  const build = new Function(`${batchBuilderSource}; return categoryBackgroundBatchOperations;`)();
  const normalized = {
    key: 'sports', title: 'Sport Legends', card: { image: 'images/kobe.png', backgroundImage: 'images/old.png' },
    displaySettings: { standeeSizePercent: 90, standeeLeftPercent: 8, standeeVerticalPercent: -4 }
  };
  const legacyDraft = {
    key: 'holiday', title: 'Holiday', description: 'Holiday standees', page: 'category.html?category=holiday', visible: true, homepageVisible: true,
    card: { image: 'images/holiday.png', backgroundImage: 'images/legacy.png' },
    displaySettings: { standeeSizePercent: 72, standeeLeftPercent: -5, standeeVerticalPercent: 3 },
    draftStatus: 'draft', approvalStatus: 'draft'
  };
  const source = { card: { backgroundImage: 'images/shared.png' }, displaySettings: { backgroundPosition: '40% 60%', backgroundSizePercent: 125, backgroundWidthPercent: 140, backgroundHeightPercent: 170 } };
  const operations = build(source, [normalized, legacyDraft], '2026-09-09T12:00:00.000Z', new Set(['sports']));
  assert(operations.length === 2 && operations[0].baseRecord === normalized, 'the existing normalized Collection must stay a narrow update');
  assert(operations[1].baseRecord === undefined, 'the legacy-only card must be created as a normalized draft rather than treated as an existing record');
  assert(operations[1].patch.key === 'holiday' && operations[1].patch.title === 'Holiday' && operations[1].patch.page === legacyDraft.page, 'normalization must preserve the recognized legacy Collection identity and navigation');
  assert(operations[1].patch.card.image === legacyDraft.card.image && operations[1].patch.card.backgroundImage === 'images/shared.png', 'normalization must preserve the standee image while applying the shared background');
  assert(operations[1].patch.displaySettings.standeeSizePercent === 72 && operations[1].patch.displaySettings.standeeLeftPercent === -5 && operations[1].patch.displaySettings.standeeVerticalPercent === 3, 'group background application must preserve legacy standee geometry');
  assert(operations[1].patch.displaySettings.backgroundWidthPercent === 140 && operations[1].patch.displaySettings.backgroundHeightPercent === 170, 'the new normalized draft must receive the complete shared background geometry');
});

Deno.test('Save All saves every dirty open Collection editor privately and Publish All flushes them first', async () => {
  const window = new Window({ url: 'https://mvpluxcreations.com/admin.html#categories' });
  window.document.body.innerHTML = '<form class="admin-category-edit-form" data-category-edit="sports" data-editor-dirty="true"></form><form class="admin-category-edit-form" data-category-edit="movies" data-editor-dirty="true"></form><form data-shared-collection-background-form data-editor-dirty="true"></form>';
  const saveAllSource = sourceRange(adminSource, 'async function saveAllOpenCollectionChanges', '\n\nfunction categoryKeyForActionTarget');
  const calls = [];
  let status = '';
  const saveAll = new Function('document', 'dependencies', `
    const { editorHasUnsavedChanges, cancelCategoryLiveAutosave, readAdminCategories, saveCategoryEditForm, saveSharedCollectionBackgroundChanges, setStatus } = dependencies;
    ${saveAllSource}
    return saveAllOpenCollectionChanges;
  `)(window.document, {
    editorHasUnsavedChanges: (form) => form.dataset.editorDirty === 'true',
    cancelCategoryLiveAutosave: () => {},
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

Deno.test('Collections exposes one sticky live action that includes the shared background draft', () => {
  assert(adminHtml.includes('class="admin-collection-lifecycle-bar"'), 'Collections must expose one persistent lifecycle toolbar');
  assert((adminHtml.match(/id="saveAllLiveCollections"/g) || []).length === 1, 'Collections must have exactly one authoritative main live button');
  assert(adminHtml.includes('Save All Collection Changes Live'), 'the main button must clearly say that all Collection changes go live together');
  assert(adminHtml.includes('id="collectionLiveStatus"'), 'the main live operation must have a visible Collections status target');
  assert(styleSource.includes('#categories .admin-collection-lifecycle-bar {') && styleSource.includes('position: sticky;'), 'the Collections live toolbar must remain visible while editing the shared controller');
  assert(adminSource.includes("saveAllCollectionChangesLive(\n    document.getElementById('collectionLiveStatus')"), 'the main button must use the Collection-scoped batch Save Live controller and report into Collections');
  assert(adminSource.includes('Apply Background to All Main Collections'), 'the shared background must expose one obvious Apply-to-All action');
  assert(!adminSource.includes('Save Shared Background Draft'), 'the shared controller must not duplicate the background workflow with a second save button');
  const all = sourceRange(adminSource, 'async function saveAllCollectionChangesLive', '\n\nfunction categoryKeyForActionTarget');
  assert(all.includes('saveAllOpenCollectionChanges') && all.includes("['category', 'category-delete', 'section-layout'].includes(item.type)") && all.includes('saveLiveChangeIds'), 'the main Collections action must flush Collection forms and publish only Collection and section-layout changes through one existing live controller');
});

Deno.test('shared background primary action saves the batch and makes all Collection changes live once', async () => {
  const allSource = sourceRange(adminSource, 'async function saveAllCollectionChangesLive', '\n\nfunction categoryKeyForActionTarget');
  const calls = [];
  const saveAllLive = new Function('dependencies', `
    const { saveAllOpenCollectionChanges, loadAdminLiveSettings, architectureReviewItems, saveLiveChangeIds, setStatus } = dependencies;
    let adminLastSaveError = '';
    ${allSource}
    return saveAllCollectionChangesLive;
  `)({
    saveAllOpenCollectionChanges: async (options) => { calls.push(['flush', options]); return true; },
    loadAdminLiveSettings: async () => { calls.push(['reload']); return true; },
    architectureReviewItems: () => [
      { id: 'category:sports', type: 'category' },
      { id: 'category:small-party-packs', type: 'category' },
      { id: 'product:kobe', type: 'product' }
    ],
    saveLiveChangeIds: async (ids) => { calls.push(['live', ids]); return true; },
    setStatus: () => {}
  });
  assert(await saveAllLive(), 'the Collection-wide live operation must succeed through the existing fast-live controller');
  assert(calls[0][0] === 'flush' && calls[1][0] === 'reload', 'dirty Collection and shared-background forms must be saved before live state is built');
  assert(JSON.stringify(calls[2]) === JSON.stringify(['live', ['category:sports', 'category:small-party-packs']]), 'one live operation must include all Collection changes while excluding unrelated Product drafts');
  const events = sourceRange(adminSource, 'function setupCategoryManagerEvents', '\n\nfunction renderAdminProducts');
  assert(events.indexOf("saveSharedCollectionBackgroundChanges({ quiet: true, approvalStatus: heldPrivate ? 'draft' : 'approved' })") < events.indexOf("saveAllCollectionChangesLive(document.querySelector('[data-shared-collection-background-status]'), { workingStateCurrent: true })"), 'the primary shared-background button must persist one live-ready batch before making it live');
  assert(events.includes("const heldPrivate = document.getElementById('holdCollectionChangesPrivate')?.checked"), 'the one shared-background action must use the single page-level Hold Private choice instead of a duplicate draft button');
});

Deno.test('per-Collection Apply Background to All saves one batch and then uses the Collection live controller', async () => {
  const source = sourceRange(adminSource, 'async function applyCategoryBackgroundToAll', '\n\nasync function saveAllOpenCollectionChanges');
  const window = new Window({ url: 'https://mvpluxcreations.com/admin.html#categories' });
  window.document.body.innerHTML = '<input id="holdCollectionChangesPrivate" type="checkbox"><p id="collectionLiveStatus"></p><form data-category-edit="sports" data-editor-dirty="true"></form>';
  window.confirm = () => true;
  const calls = [];
  const sports = { key: 'sports', card: { backgroundImage: 'images/shared.png' }, displaySettings: { backgroundPosition: '40% 60%', backgroundSizePercent: 125, backgroundWidthPercent: 140, backgroundHeightPercent: 170 } };
  const apply = new Function('window', 'document', 'dependencies', `
    const { saveAllOpenCollectionChanges, setStatus, readAdminCategories, categoryFromEditForm, normalizedMainCollectionsForBatch,
      mainCollectionsForBackgroundBatch, categoryBackgroundBatchOperations, saveAdminCollectionOperations, renderCategoryManager,
      saveAllCollectionChangesLive } = dependencies;
    let adminLastSaveError = '';
    ${source}
    return applyCategoryBackgroundToAll;
  `)(window, window.document, {
    saveAllOpenCollectionChanges: async () => { calls.push('flush'); return true; },
    setStatus: () => {},
    readAdminCategories: () => ({ sports }),
    categoryFromEditForm: () => sports,
    normalizedMainCollectionsForBatch: () => [sports],
    mainCollectionsForBackgroundBatch: () => [sports],
    categoryBackgroundBatchOperations: () => [{ type: 'record', collectionKey: 'categories', entryKey: 'sports', patch: {} }],
    saveAdminCollectionOperations: async () => { calls.push('batch'); return { ok: true }; },
    renderCategoryManager: () => { calls.push('render'); },
    saveAllCollectionChangesLive: async (target) => { calls.push(['live', target.id]); return true; }
  });
  assert(await apply(window.document.querySelector('form')), 'the one-click background action must succeed');
  assert(JSON.stringify(calls) === JSON.stringify(['flush', 'batch', 'render', ['live', 'collectionLiveStatus']]), 'the per-Collection action must save its normalized batch and immediately make the Collection changes live');

  calls.length = 0;
  window.document.getElementById('holdCollectionChangesPrivate').checked = true;
  assert(await apply(window.document.querySelector('form')), 'the same action must still support an intentional private hold');
  assert(JSON.stringify(calls) === JSON.stringify(['flush', 'batch', 'render']), 'Hold Private must be the only reason the Apply action stops before live save');
});

Deno.test('ordinary Collection corrections debounce into the existing Save Live controller', async () => {
  assert(adminHtml.includes('id="holdCollectionChangesPrivate"') && adminHtml.includes('Hold Collection changes privately'), 'Collections must expose private hold as an unchecked exception to the normal live correction workflow');
  const source = sourceRange(adminSource, 'function cancelCategoryLiveAutosave', '\n\nfunction editorHasUnsavedChanges');
  const window = new Window({ url: 'https://mvpluxcreations.com/admin.html#categories' });
  window.document.body.innerHTML = '<input id="holdCollectionChangesPrivate" type="checkbox"><form data-category-edit="movie-characters" data-editor-dirty="false"></form>';
  const form = window.document.querySelector('form');
  let pending;
  let published = null;
  window.setTimeout = (callback) => { pending = callback; return 7; };
  window.clearTimeout = () => {};
  const markDirty = new Function('window', 'document', 'dependencies', `
    const { categoryLiveAutosaveTimers, setCategoryPublishState, editorHasUnsavedChanges, publishCategoryByKey } = dependencies;
    ${source}
    return markCategoryEditorDirty;
  `)(window, window.document, {
    categoryLiveAutosaveTimers: new Map(),
    setCategoryPublishState: () => {},
    editorHasUnsavedChanges: (target) => target.dataset.editorDirty === 'true',
    publishCategoryByKey: async (key, target) => { published = [key, target]; return true; }
  });
  markDirty(form);
  assert(form.dataset.editorDirty === 'true' && typeof pending === 'function', 'an ordinary edit must become dirty and schedule one debounced live save');
  await pending();
  assert(published?.[0] === 'movie-characters' && published?.[1] === form, 'automatic correction must call the same Category Save Live controller with the current normalized form');
  window.document.getElementById('holdCollectionChangesPrivate').checked = true;
  pending = null;
  markDirty(form);
  assert(pending === null, 'checking Hold Collection changes privately must suppress automatic live saving while retaining the dirty private edit');
  const events = sourceRange(adminSource, 'function setupCategoryManagerEvents', '\n\nfunction renderAdminProducts');
  assert(events.includes("section.addEventListener('focusout'") && events.includes('scheduleCategoryLiveAutosave(form, 0)'), 'leaving a Collection field must immediately schedule its existing Save Live operation');
  assert(events.includes("editorHasUnsavedChanges(form) && !document.getElementById('holdCollectionChangesPrivate')?.checked") && events.includes('await publishCategoryByKey(key, form)'), 'Back to Collections must finish the live save before closing unless private hold is checked');
});

Deno.test('Main Collection text remains Category-owned when representative Product changes', () => {
  const categoryFormSource = sourceRange(adminSource, 'function categoryFromEditForm', '\n\nasync function saveCategoryEditForm');
  assert(categoryFormSource.includes("title: String(data.get('title')") && categoryFormSource.includes("description: String(data.get('description')"), 'Main Collection title and description must save from their own editor fields');
  const events = sourceRange(adminSource, 'function setupCategoryManagerEvents', '\n\nfunction renderAdminProducts');
  assert(!events.includes('product?.cutoutImage') && !events.includes('product.title') && !events.includes('product.description'), 'representative selection must update only representativeProductSlug through the normal form save and must not copy Product presentation fields');
  assert(categoryFormSource.includes("representativeProductSlug: current.parentKey ? '' : String(data.get('representativeProductSlug')"), 'representative selection must remain a separate normalized card reference');
});

Deno.test('Featured Categories section layout is reusable, bounded, and preserves unrelated global settings', () => {
  const window = new Window({ url: 'https://mvpluxcreations.com/admin.html#categories' });
  window.eval(sectionLayoutSource);
  const controller = window.MVPLUX_STOREFRONT_SECTION_LAYOUT;
  const updated = controller.withSectionLayout({ backgroundPosition: 'center bottom', untouched: 17 }, 'featuredCategories', {
    sectionMaxWidthPx: 1620,
    horizontalPaddingPx: 46,
    verticalPaddingPx: 58,
    cardGapPx: 31,
    desktopColumns: 5
  });
  assert(updated.untouched === 17 && updated.backgroundPosition === 'center bottom', 'section layout must extend the existing global display record instead of replacing it');
  assert(updated.sectionLayouts.featuredCategories.sectionMaxWidthPx === 1620, 'section width must be normalized into the reusable section layout record');
  assert(updated.sectionLayouts.featuredCategories.horizontalPaddingPx === 46 && updated.sectionLayouts.featuredCategories.verticalPaddingPx === 58, 'horizontal and vertical padding must remain independent');
  assert(updated.sectionLayouts.featuredCategories.cardGapPx === 31 && updated.sectionLayouts.featuredCategories.desktopColumns === 5, 'gap and desktop columns must remain independently configurable');

  const root = window.document.createElement('section');
  controller.apply('featuredCategories', root, updated.sectionLayouts.featuredCategories);
  assert(root.style.getPropertyValue('--featured-categories-section-max-width') === '1620px', 'the shared renderer must apply section width to the outer section variable');
  assert(root.style.getPropertyValue('--featured-categories-horizontal-padding') === '46px', 'the shared renderer must apply horizontal padding to the outer section variable');
  assert(root.style.getPropertyValue('--featured-categories-vertical-padding') === '58px', 'the shared renderer must apply vertical padding to the outer section variable');
  assert(root.style.getPropertyValue('--featured-categories-card-gap') === '31px' && root.style.getPropertyValue('--featured-categories-desktop-columns') === '5', 'the shared renderer must apply gap and columns to the grid variables');
});

Deno.test('Featured Categories layout controls share values and expose one eight-card live grid preview', () => {
  const window = new Window({ url: 'https://mvpluxcreations.com/admin.html#categories' });
  window.document.body.innerHTML = `<form>
    <input name="sectionMaxWidthPx" type="range" min="900" max="1800" value="1400" data-section-layout-range="sectionMaxWidthPx">
    <input type="number" value="1400" data-section-layout-number="sectionMaxWidthPx">
    <output data-section-layout-output="sectionMaxWidthPx">1400px</output>
  </form>`;
  const helperSource = sourceRange(adminSource, 'function syncSectionLayoutControl', '\n\nfunction featuredCategoriesSectionLayoutOperation');
  const helpers = new Function('CSS', `${helperSource}; return { syncSectionLayoutControl, setSectionLayoutControlValue };`)(window.CSS);
  const form = window.document.querySelector('form');
  const slider = form.elements.namedItem('sectionMaxWidthPx');
  slider.value = '1550';
  helpers.syncSectionLayoutControl(form, slider);
  assert(form.querySelector('[data-section-layout-number]').value === '1550' && form.querySelector('output').textContent === '1550px', 'slider changes must update the same numeric value and output');
  helpers.setSectionLayoutControlValue(form, 'sectionMaxWidthPx', 1400);
  assert(slider.value === '1400' && form.querySelector('[data-section-layout-number]').value === '1400', 'preset/reset buttons must update that same slider and numeric value');

  assert(adminSource.includes('Featured Categories Section Size'), 'the existing bottom shared editor must contain the new section layout subsection');
  assert(adminSource.includes("Array.from({ length: 8 }") && adminSource.includes('data-featured-categories-layout-preview'), 'the Admin must render one complete eight-card section preview');
  for (const label of ['Section Width', 'Horizontal Padding', 'Vertical Padding', 'Space Between Cards', 'Cards Across', 'Card / Standee Stage Height', 'Shorter Stage', 'Taller Stage', 'Narrower', 'Wider', 'Match Fan Showcase Width', 'Reset Card Layout']) {
    assert(adminSource.includes(label), `the section editor must expose ${label}`);
  }
  assert(adminSource.includes('<legend>Outer Section</legend>') && adminSource.includes('<legend>Cards & Image Area</legend>'), 'the bottom section-size editor must group outer sizing separately from card and image-area controls');
  assert(adminSource.includes('name="featured-category-shared-design" open><summary>Image & Section Layout</summary>') && adminSource.includes('name="featured-category-shared-design"><summary>Text Area & Style</summary>'), 'image/layout and shared text controls must form one exclusive accordion in the same collective editor');
  assert(adminSource.includes('Live Section, Card Image & Text Preview · 8 cards'), 'the bottom section-size editor must identify the combined grid, image, and text preview');
  assert(styleSource.includes('#categories .admin-featured-categories-layout-preview-column {\n  position: sticky;'), 'the eight-card preview must remain visible while editing shared text on desktop');
  assert(!styleSource.includes('#shop .product-card h3 {\n  min-height: 48px !important;') && !styleSource.includes('#shop .product-description {\n  height: 64px !important;'), 'legacy Product text sizing must not override the shared Featured Collection text box');
  assert(!adminSource.includes('data-category-image-edit-preview'), 'the individual Main Collection editor must not receive a second image-only preview');
  assert(styleSource.includes('grid-template-columns: minmax(360px, .78fr) minmax(620px, 1.45fr)'), 'desktop Admin must place layout controls and the large section preview side by side');
});

Deno.test('Featured Categories layout joins the protected private batch and existing Collection live path', () => {
  assert(adminHtml.indexOf('storefront-section-layout.js') < adminHtml.indexOf('admin.js?v='), 'Admin must load the shared section-layout resolver before the Collections controller');
  assert(adminSource.includes("collectionKey: 'globalDisplaySettings'") && adminSource.includes("entryKey: 'sectionLayouts'"), 'section layout must persist inside the existing normalized global display settings');
  assert(adminSource.includes("id: 'sectionLayouts:featuredCategories'") && adminSource.includes("type: 'section-layout'"), 'saved section layout must participate in the existing draft-versus-live review lifecycle');
  assert(adminSource.includes("['category', 'category-delete', 'section-layout'].includes(item.type)"), 'Collection Save Live must publish the saved section layout through the same public snapshot operation');
  assert(adminSource.includes('featuredCategoriesSectionLayoutOperation(sectionLayout)'), 'the shared background form must save layout and background through one protected batch request');
});

Deno.test('individual Featured card editor owns content and standee controls but no background or text style', () => {
  const desktop = renderedCollectionEditor(1440);
  const form = desktop.form;
  assert(form.querySelector('[name="title"]') && form.querySelector('[name="description"]') && form.querySelector('[name="funFact"]'), 'individual editor must retain title, subtitle, and description content');
  assert(form.querySelector('[name="standeeSizePercent"]') && form.querySelector('[name="standeeLeftPercent"]') && form.querySelector('[name="standeeVerticalPercent"]') && form.querySelector('[name="standeeRotationDeg"]'), 'individual editor must retain image zoom, X/Y, and rotation');
  assert(form.querySelector('[name="cardImageVisible"]') && form.querySelector('[data-reset-category-appearance]'), 'individual editor must expose image show/hide and reset');
  assert(!form.querySelector('[name="cardBackgroundImage"]') && !form.querySelector('[name="backgroundSizePercent"]'), 'individual Main Collection editor must not own any background reference or geometry');
  assert(!form.querySelector('[name="titleSizePercent"]') && !form.querySelector('[name="descriptionSizePercent"]'), 'individual Main Collection editor must not own shared text styling');
  const events = sourceRange(adminSource, 'function setupCategoryManagerEvents', '\n\nfunction renderAdminProducts');
  assert(events.includes("section.addEventListener('pointerdown', beginCategoryPreviewImageDrag)") && events.includes("section.addEventListener('wheel'"), 'preview must wire direct drag and wheel zoom to the same normalized image controls');
});

Deno.test('normalized Featured card image visibility and rotation survive reconstruction', () => {
  const window = new Window({ url: 'https://mvpluxcreations.com/' });
  window.eval(presentationSource);
  const visible = window.MVPLUX_CATEGORY_PRESENTATION.resolveCategoryPresentation({
    key: 'movies', card: { image: 'images/movie.png', imageVisible: true },
    displaySettings: { standeeRotationDeg: 27 }
  });
  const layout = window.MVPLUX_CATEGORY_PRESENTATION.resolveCategoryCardLayout(visible);
  assert(visible.image === 'images/movie.png' && layout.imageTransform === 'translateX(-50%) rotate(27deg)', 'saved image and rotation must reconstruct the card without transient DOM state');
  const hidden = window.MVPLUX_CATEGORY_PRESENTATION.resolveCategoryPresentation({
    key: 'movies', card: { image: 'images/movie.png', imageVisible: false }, displaySettings: { standeeRotationDeg: 27 }
  });
  assert(hidden.image === '' && hidden.imageReference === 'images/movie.png' && hidden.imageVisible === false, 'Hide must preserve the normalized image reference while removing only its visible presentation');
});

Deno.test('shared Featured text controls persist through the existing section layout record', () => {
  const window = new Window({ url: 'https://mvpluxcreations.com/' });
  window.eval(sectionLayoutSource);
  const value = window.MVPLUX_STOREFRONT_SECTION_LAYOUT.normalize('featuredCategories', {
    imageAreaMinHeightPx: 680, textBoxHeightPx: 78, titleFontSizePx: 24, titleFontWeight: 900,
    descriptionFontSizePx: 12, descriptionFontWeight: 500, titleLineHeightPercent: 110,
    descriptionLineHeightPercent: 130, textGapPx: 3, textPaddingPx: 7,
    titleFontFamily: 'Georgia, serif', descriptionFontFamily: 'Arial, sans-serif', textAlign: 'left'
  });
  const root = window.document.createElement('section');
  window.MVPLUX_STOREFRONT_SECTION_LAYOUT.apply('featuredCategories', root, value);
  assert(root.style.getPropertyValue('--featured-categories-image-area-min-height') === '680px' && root.style.getPropertyValue('--featured-categories-text-box-height') === '78px', 'a taller shared standee stage must apply independently from the compact text box');
  assert(root.style.getPropertyValue('--featured-categories-title-font') === 'Georgia, serif' && root.style.getPropertyValue('--featured-categories-text-align') === 'left', 'shared font and alignment must apply from the same saved section record');
  assert(adminSource.includes('admin-shared-text-control-groups') && adminSource.includes('<legend>Title</legend>') && adminSource.includes('<legend>Description</legend>') && adminSource.includes('<legend>Text Box</legend>'), 'shared text controls must be grouped by the visual element they affect');
  assert(adminSource.includes('data-shared-category-text-preview') && adminSource.includes('Compact Text') && adminSource.includes('Bold Titles') && adminSource.includes('Reset Text Style'), 'shared text editor must include an immediate local preview and simple presets');
});
