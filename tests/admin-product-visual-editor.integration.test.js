import { Window } from 'npm:happy-dom@18.0.1';
import { mergeProductSources } from '../admin-architecture.js';

const adminSource = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
const styleSource = await Deno.readTextFile(new URL('../style.css', import.meta.url));
const storefrontSource = await Deno.readTextFile(new URL('../script.js', import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceRange(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from, `missing source range ${start}`);
  return source.slice(from, to);
}

function visualPatchRuntime() {
  const source = sourceRange(adminSource, 'function normalizedProductVisualPatch', '\n\nasync function useDefaultProductShowroomBackground');
  return new Function('normalizeImageChoices', `${source}\nreturn normalizedProductVisualPatch;`)((choices) => structuredClone(choices || []));
}

Deno.test('Remove Background clears only normalized product.backgroundImage', () => {
  const patch = visualPatchRuntime();
  const product = {
    slug: 'performer', title: 'Performer', cutoutImage: 'images/main.png', backgroundImage: 'images/showroom.png',
    imageChoices: [{ label: 'Alternate', image: 'images/alternate.png' }], categories: ['music', 'performers'],
    originalHeight: '70', priceOverride: 99, visible: true
  };
  const categories = {
    music: { card: { image: 'images/homepage.png', backgroundImage: 'images/homepage-background.png' } }
  };
  const categoriesBefore = structuredClone(categories);
  const result = { ...product, ...patch(product, 'remove-background') };
  assert(result.backgroundImage === '', 'Remove Background must use the normalized empty/default state');
  for (const field of ['slug', 'title', 'cutoutImage', 'imageChoices', 'categories', 'originalHeight', 'priceOverride', 'visible']) {
    assert(JSON.stringify(result[field]) === JSON.stringify(product[field]), `Remove Background changed protected Product field ${field}`);
  }
  assert(JSON.stringify(categories) === JSON.stringify(categoriesBefore), 'Product background removal must not touch Homepage Collection Card image/background');
});

Deno.test('Remove Product Image clears only the normalized Product image reference', () => {
  const patch = visualPatchRuntime();
  const product = {
    slug: 'performer', title: 'Performer', description: 'Description', funFact: 'Fact', cutoutImage: 'images/main.png',
    backgroundImage: 'images/showroom.png', imageChoices: [{ label: 'Alternate', image: 'images/alternate.png' }],
    categories: ['music'], originalHeight: '70', priceOverride: 99, visible: true
  };
  const result = { ...product, ...patch(product, 'remove-product-image') };
  assert(result.cutoutImage === '', 'Remove Product Image must create an explicit normalized empty image reference');
  for (const field of ['slug', 'title', 'description', 'funFact', 'backgroundImage', 'imageChoices', 'categories', 'originalHeight', 'priceOverride', 'visible']) {
    assert(JSON.stringify(result[field]) === JSON.stringify(product[field]), `Remove Product Image changed protected Product field ${field}`);
  }
  const removeSource = sourceRange(adminSource, 'async function removeProductMainImage', '\n\nasync function useDefaultProductShowroomBackground');
  assert(!/Deno\.(remove|removeSync)|unlink|rmSync/.test(removeSource), 'Remove Product Image must never delete the physical image file');
});

Deno.test('Product Editor background removal produces a background-only private save patch', () => {
  const window = new Window({ url: 'https://mvpluxcreations.com/admin.html' });
  window.document.body.innerHTML = `<form data-slug="performer"><input name="backgroundImage" value=""><input name="cutoutImage" value="images/main.png"><input name="originalHeight" value="70"><input name="priceOverride" value="99"><input name="title" value="Performer"><input name="description" value="Description"><input name="funFact" value="Fact"><input name="cutoutHeight" value="63"><input name="cutoutLeft" value="50"><input name="cutoutBottom" value="21"><input name="logoWidth" value="82"><input name="logoTop" value="-4"><input name="stageBackgroundPosition" value="center center"></form>`;
  const form = window.document.querySelector('form');
  form._adminDirtyFields = new Set(['backgroundImage']);
  const source = sourceRange(adminSource, 'function collectProductFormData', '\n\nasync function saveProductForm');
  const collect = new Function('FormData', 'allAdminProducts', 'readAdminProducts', 'parseAdminHeight', 'adminDefaultMerchandiseHeight', `${source}\nreturn collectProductFormData;`)(
    window.FormData,
    () => [{ slug: 'performer', cutoutImage: 'images/main.png', backgroundImage: 'images/showroom.png', imageChoices: [{ label: 'Alt', image: 'images/alt.png' }], categories: ['music'], originalHeight: '70', priceOverride: 99 }],
    () => ({}),
    Number,
    () => 72
  );
  const savedPatch = collect(form);
  assert(JSON.stringify(savedPatch) === JSON.stringify({ backgroundImage: '' }), 'private Product save must write only the cleared normalized background field');
});

Deno.test('Remove Image Choice changes only the selected normalized image-choice relationship', () => {
  const patch = visualPatchRuntime();
  const product = {
    slug: 'athlete', cutoutImage: 'images/main.png', backgroundImage: 'images/stage.png', categories: ['sports', 'basketball'],
    originalHeight: '78', priceOverride: 129.99,
    imageChoices: [{ label: 'Home', image: 'images/home.png' }, { label: 'Away', image: 'images/away.png', stage: 'images/away-stage.png' }]
  };
  const result = { ...product, ...patch(product, 'remove-image-choice', 'images/home.png') };
  assert(result.imageChoices.length === 1 && result.imageChoices[0].image === 'images/away.png', 'only the selected alternate choice must be removed');
  for (const field of ['slug', 'cutoutImage', 'backgroundImage', 'categories', 'originalHeight', 'priceOverride']) {
    assert(JSON.stringify(result[field]) === JSON.stringify(product[field]), `alternate removal changed protected field ${field}`);
  }
  const removeSource = sourceRange(adminSource, 'async function removeProductImageChoice', '\n\nasync function replaceProductImageChoice');
  assert(removeSource.includes('writeProductImageChoices') && !removeSource.includes('configuredImagePaths'), 'alternate removal must save only product.imageChoices and leave image inventory ownership alone');
  assert(!/Deno\.(remove|removeSync)|unlink|rmSync/.test(removeSource), 'alternate removal must never delete a physical image file');
});

Deno.test('Product Editor exposes every actual visual layer with accurate ownership', () => {
  for (const label of ['Product / Standee Image', 'Change / Replace Product Image', 'Remove Product Image', 'Product Showroom Background', 'Change / Replace Background', 'Remove Background', 'Use Default / Clean Showroom Background', 'Alternate Image Choices', 'Remove Image Choice', 'Shared Storefront Logo Overlay', 'Reset Logo Overlay to Normal']) {
    assert(adminSource.includes(label), `missing Product visual control ${label}`);
  }
  assert(adminSource.includes('There is no separate Product logo image, horizontal position, or removable Product reference.'), 'shared wordmark controls must not pretend a per-Product logo image store exists');
  assert(styleSource.includes('.admin-product-current-visual') && styleSource.includes('height: 96px'), 'visual references must remain compact instead of duplicating the large sticky Product preview');
});

Deno.test('published explicit empty Product image beats catalog and static fallback imagery', () => {
  const sanitizerSource = sourceRange(storefrontSource, 'function sanitizeProductImageChoices', '\n\nfunction validatePublishedAdminSettings');
  const sanitize = new Function(`${sanitizerSource}\nreturn sanitizePublishedProduct;`)();
  const published = sanitize('athlete', { title: 'Athlete', cutoutImage: '', backgroundImage: '', imageChoices: [], categories: ['sports'], visible: true });
  assert(Object.prototype.hasOwnProperty.call(published, 'cutoutImage') && published.cutoutImage === '', 'published sanitizer must retain an explicit empty Product image');
  const merged = mergeProductSources({
    fallbackProducts: [{ slug: 'athlete', cutoutImage: 'images/legacy.png', backgroundImage: 'images/legacy-stage.png' }],
    publishedProducts: { athlete: published }
  });
  assert(merged.athlete.cutoutImage === '', 'published empty Product image must override product-catalog compatibility data');

  const window = new Window({ url: 'https://mvpluxcreations.com/index.html' });
  window.document.body.innerHTML = '<article class="product-card"><div class="product-stage-preview"><img class="product-stage-bg" src="images/old-stage.png"><img class="product-stage-logo"><img class="product-cutout" src="images/old-static.png"></div><div class="size-builder" data-admin-slug="athlete" data-product-name="Athlete"></div><a class="product-title-link"></a><p class="product-description"></p></article>';
  const rendererSource = sourceRange(storefrontSource, 'function applyAdminProductOverrides', '\n\nfunction updateBuilderOriginalDisplay');
  const apply = new Function('ensureProductAdminSlugs', 'getAdminProducts', 'getProductSlug', 'resolveStorefrontProductDisplay', 'getShowroomStageBackground', 'safeAdminImageNumber', `${rendererSource}\nreturn applyAdminProductOverrides;`)(
    () => {}, () => ({ athlete: published }), () => 'athlete', () => ({}), () => 'images/default-stage.png', (value, fallback) => Number(value) || fallback
  );
  apply(window.document.querySelector('.size-builder'));
  const cutout = window.document.querySelector('.product-cutout');
  assert(cutout.hidden && !cutout.hasAttribute('src'), 'fresh customer DOM must remove and hide the old static Product image when published normalized image is empty');
  assert(storefrontSource.includes("Object.prototype.hasOwnProperty.call(managed, 'cutoutImage')") && storefrontSource.includes("Object.prototype.hasOwnProperty.call(product, 'cutoutImage')"), 'Product detail and generated-card paths must distinguish explicit empty from a missing legacy field');
});

Deno.test('visual resets change only existing placement fields', () => {
  const resetSource = sourceRange(adminSource, 'function resetProductVisualPlacement', '\n\nasync function removeProductImageChoice');
  const reset = new Function('markProductFieldDirty', 'updateProductPreview', `${resetSource}\nreturn resetProductVisualPlacement;`)(() => {}, () => {});
  const values = { cutoutHeight: '91', cutoutLeft: '74', cutoutBottom: '38', stageBackgroundPosition: 'right top', logoWidth: '45', logoTop: '20' };
  const fields = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { value }]));
  const form = { elements: { namedItem: (name) => fields[name] || null } };
  const product = { slug: 'athlete', categories: ['sports'], originalHeight: '78', priceOverride: 129.99, cutoutImage: 'images/main.png', backgroundImage: 'images/stage.png' };
  const before = structuredClone(product);
  reset(form, 'image');
  reset(form, 'background');
  reset(form, 'logo');
  assert(fields.cutoutHeight.value === '63' && fields.cutoutLeft.value === '50' && fields.cutoutBottom.value === '21', 'Product image reset must restore existing placement defaults');
  assert(fields.stageBackgroundPosition.value === 'center center', 'background reset must restore only normalized background position');
  assert(fields.logoWidth.value === '82' && fields.logoTop.value === '-4', 'shared logo reset must restore only existing normalized logo fields');
  assert(JSON.stringify(product) === JSON.stringify(before), 'visual reset must not change Product identity, pricing, assignments, or image references');
});

Deno.test('Cmd or Ctrl S submits the active existing editor and never publishes', () => {
  const window = new Window({ url: 'https://mvpluxcreations.com/admin.html#products' });
  window.document.body.innerHTML = '<section data-admin-area="products"><form class="admin-product-card"><input name="title"></form></section>';
  const shortcutSource = sourceRange(adminSource, 'function activeAdminDraftForm', '\n\nfunction setupAdminArchitectureWorkspace');
  const bind = new Function('document', 'window', 'editorHasUnsavedChanges', `${shortcutSource}\nreturn bindAdminDraftSaveShortcuts;`)(window.document, window, () => false);
  let submits = 0;
  const form = window.document.querySelector('form');
  form.addEventListener('submit', (event) => { event.preventDefault(); submits += 1; });
  bind();
  form.querySelector('input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
  assert(submits === 1, 'Ctrl/Cmd+S must invoke the same form submit controller as visible Save Draft');
  window.document.body.innerHTML = '<section data-admin-area="categories"><form data-category-edit="sports"><textarea name="description"></textarea></form></section>';
  const categoryForm = window.document.querySelector('form');
  categoryForm.addEventListener('submit', (event) => { event.preventDefault(); submits += 1; });
  categoryForm.querySelector('textarea').dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true }));
  assert(submits === 2, 'Cmd/Ctrl+S must use the visible Main Collection or Child Group form submit controller too');
  assert(!shortcutSource.includes('publishSavedProductBySlug') && !shortcutSource.includes('publishScopedChangeIds'), 'save shortcut must never publish');
});

Deno.test('Back controls warn only while an editor has unsaved changes', () => {
  const window = new Window();
  const guardSource = sourceRange(adminSource, 'function editorHasUnsavedChanges', '\n\nfunction setupCategoryManagerEvents');
  const guard = new Function('window', `${guardSource}\nreturn confirmEditorCanClose;`)(window);
  const form = { dataset: { editorDirty: 'true' }, _adminDirtyFields: new Set() };
  window.confirm = () => false;
  assert(guard(form, 'Product') === false, 'Back must stop when unsaved changes are not confirmed');
  window.confirm = () => true;
  assert(guard(form, 'Product') === true, 'Back may continue only after explicit confirmation');
  form.dataset.editorDirty = 'false';
  assert(guard(form, 'Product') === true, 'Back must not show unnecessary warnings after Save succeeds');
  for (const control of ['data-back-to-products', 'data-back-to-collections', 'data-back-to-image-inbox']) assert(adminSource.includes(control), `missing explicit Back control ${control}`);
});

Deno.test('Product Save remains private and Publish saves latest state before the shared Product publisher', () => {
  const save = sourceRange(adminSource, 'async function saveProductForm', '\n\nfunction productDirtyFieldForControl');
  const publish = sourceRange(adminSource, 'async function publishExistingProductForm', '\n\nasync function publishNewProductFromForm');
  assert(save.includes('saveAdminProductFieldPatch') && save.includes('DRAFT SAVED — PRIVATE'), 'Save Draft must persist through the existing normalized private Product save path');
  assert(!save.includes('publishScopedChangeIds'), 'Save Draft must not publish customer content');
  assert(publish.indexOf('await saveProductForm') < publish.indexOf('publishSavedProductBySlug'), 'Publish Product / Standee must save the newest Product Editor state before using the shared publisher');
  assert(adminSource.includes('PUBLISHED VERSION EXISTS · DRAFT HAS UNPUBLISHED CHANGES'), 'published Product with newer private edits must have an unmistakable lifecycle state');
  for (const preserved of ['DRAFT PREVIEW — NOT LIVE YET', 'Reset Card Layout', 'admin-category-editor-actions']) assert(adminSource.includes(preserved), `existing Homepage Collection Card editor feature was lost: ${preserved}`);
});
