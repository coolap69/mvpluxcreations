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
  window.document.body.innerHTML = `<form data-category-edit="sports">
    <input name="cardImage" value="images/kobe.png">
    <input name="cardBackgroundImage" value="images/gold-stage.png">
    <input name="representativeProductSlug" value="kobe-bryant">
    <input name="backgroundPosition" value="50% 100%">
    ${controlMarkup('standeeSizePercent', 80, 10, 250)}
    ${controlMarkup('standeeLeftPercent', 0, -50, 50)}
    ${controlMarkup('standeeVerticalPercent', 0, -50, 50)}
    ${controlMarkup('backgroundSizePercent', 100, 50, 300)}
    ${controlMarkup('backgroundPositionX', 50, 0, 100)}
    ${controlMarkup('backgroundPositionY', 100, 0, 100)}
  </form>`;
  const form = window.document.querySelector('form');
  let previewCount = 0;
  const setSource = sourceRange(adminSource, 'function setCategoryDisplayControlValue', '\n\nfunction updateCategoryDraftPublishedState');
  const adjustSource = sourceRange(adminSource, 'function applyCategoryDisplayAdjustment', '\n\nfunction syncCategoryBackgroundPosition');
  const helpers = new Function('CSS', 'dependencies', `
    const { syncCategoryBackgroundPosition, syncCategoryDisplayOutputs, previewCategoryEdit,
      markCategoryEditorDirty, CATEGORY_IMAGE_SIZE_DEFAULT, CATEGORY_BACKGROUND_SIZE_DEFAULT } = dependencies;
    ${setSource}
    ${adjustSource}
    return { setCategoryDisplayControlValue, applyCategoryDisplayAdjustment, resetCategoryCardLayout };
  `)(window.CSS, {
    syncCategoryBackgroundPosition: (target) => {
      target.elements.namedItem('backgroundPosition').value = `${target.elements.namedItem('backgroundPositionX').value}% ${target.elements.namedItem('backgroundPositionY').value}%`;
    },
    syncCategoryDisplayOutputs: () => {},
    markCategoryEditorDirty: (target) => { target.dataset.editorDirty = 'true'; },
    previewCategoryEdit: () => { previewCount += 1; },
    CATEGORY_IMAGE_SIZE_DEFAULT: 63,
    CATEGORY_BACKGROUND_SIZE_DEFAULT: 100
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
    displaySettings: { standeeSizePercent: 90, standeeLeftPercent: 8, standeeVerticalPercent: -4, backgroundSizePercent: 125, backgroundPosition: '40% 85%' }
  };
  const display = {
    standeeSizePercent: 90, standeeLeftPercent: 8, standeeVerticalPercent: -4,
    backgroundSizePercent: 125, backgroundPosition: '40% 85%',
    titleSizePercent: 100, titleLeftPercent: 0, titleVerticalPercent: 0, titleAlign: 'center',
    descriptionSizePercent: 100, descriptionLeftPercent: 0, descriptionVerticalPercent: 0, descriptionAlign: 'center'
  };
  const markupSource = sourceRange(adminSource, 'function categoryDisplayAdjustmentButtons', '\n\nfunction suspiciousCategoryKeys');
  const render = new Function('dependencies', `
    const { effectiveCategoryDisplaySettings, categoryBackgroundPositionParts, readAdminCategories,
      categoryAssignedProducts, escapeAdminHtml, categoryPublishOperations, categoryCardDraftStatusMarkup,
      categoryPublishButtonMarkup, categoryVisualImagePicker, categoryDisplayRangeMarkup,
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
  assert(runtime.value('backgroundPositionX') === 45 && runtime.number('backgroundPositionX') === 45, 'background Left must synchronize X controls');
  assert(runtime.value('backgroundPositionY') === 95 && runtime.number('backgroundPositionY') === 95, 'background Up must synchronize Y controls');
  assert(runtime.value('backgroundSizePercent') === 110 && runtime.number('backgroundSizePercent') === 110, 'Zoom In must synchronize zoom controls');
  assert(runtime.form.elements.namedItem('backgroundPosition').value === '45% 95%', 'background buttons must keep the one normalized backgroundPosition field synchronized');
});

Deno.test('Reset Card Layout resets geometry only and preserves representative, images, and Product data', () => {
  const runtime = editorRuntime();
  const products = { 'kobe-bryant': { slug: 'kobe-bryant', cutoutImage: 'images/product-kobe.png', backgroundImage: 'images/product-showroom.png', categories: ['sports'] } };
  const productsBefore = structuredClone(products);
  ['standeeSizePercent', 'standeeLeftPercent', 'standeeVerticalPercent', 'backgroundSizePercent', 'backgroundPositionX', 'backgroundPositionY']
    .forEach((name) => runtime.helpers.setCategoryDisplayControlValue(runtime.form, name, 25));
  runtime.helpers.resetCategoryCardLayout(runtime.form);
  assert(runtime.value('standeeSizePercent') === 63 && runtime.value('standeeLeftPercent') === 0 && runtime.value('standeeVerticalPercent') === 0, 'reset must restore only normal image geometry');
  assert(runtime.value('backgroundSizePercent') === 100 && runtime.value('backgroundPositionX') === 50 && runtime.value('backgroundPositionY') === 100, 'reset must restore the shared bottom-anchored background geometry');
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
  assert(workspaceStyle.display === 'grid' && workspaceStyle.gridTemplateColumns.includes('minmax(400px,.84fr)') && workspaceStyle.gridTemplateColumns.includes('minmax(560px,1.16fr)'), '1440px desktop must retain the approximately 42/58 two-column workspace');
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
