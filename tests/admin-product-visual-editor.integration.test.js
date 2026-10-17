import { Window } from 'npm:happy-dom@18.0.1';
import { mergeProductSources, normalizeProductRecord } from '../admin-architecture.js';

const adminSource = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
const adminHtml = await Deno.readTextFile(new URL('../admin.html', import.meta.url));
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
  for (const label of ['Product / Standee Image', 'Change / Replace Product Image', 'Remove Product Image', 'Product Showroom Background', 'Change / Replace Background', 'Remove Background', 'Use Default / Clean Showroom Background', 'Alternate Image Choices', 'Remove Image Choice', 'Shared Storefront Logo Overlay', 'Remove Logo Overlay from Product', 'Reset Logo Overlay to Normal']) {
    assert(adminSource.includes(label), `missing Product visual control ${label}`);
  }
  assert(adminSource.includes('never deletes the shared image file'), 'shared wordmark removal must be described as a Product reference change, not physical file deletion');
  assert(styleSource.includes('.admin-product-current-visual') && styleSource.includes('height: 96px'), 'visual references must remain compact instead of duplicating the large sticky Product preview');
});

Deno.test('existing Product Editor uses the shared text-only AI helper for all Product details', () => {
  const productEditor = sourceRange(adminSource, 'function renderAdminProducts', '\n\nfunction filterAdminProductLibrary');
  for (const token of ['Who or what is this?', 'Fill Title, Description, Fun Fact &amp; Height with AI', 'data-ai-suggest="fillAll"', 'data-ai-status']) {
    assert(productEditor.includes(token), `existing Product Editor is missing AI control ${token}`);
  }
  const assistant = sourceRange(adminSource, 'async function requestAdminContentSuggestion', '\n\nfunction bindAdminAiAssistance');
  assert(assistant.includes("formData.get('productSlug')") && assistant.includes('form.dataset.slug'), 'AI must resolve the exact existing normalized Product being edited');
  assert(assistant.includes("imagePath: ''"), 'routine Product AI must remain text-only to avoid sending repository images through Supabase');
  assert(assistant.includes("['title', 'description', 'funFact'"), 'Fill All must populate title, description, and fun fact');
  assert(assistant.includes("['originalHeight']"), 'Fill All must include original height when the Product editor exposes that field');
  assert(!assistant.includes('saveAdminCollectionOperations') && !assistant.includes('saveLiveChangeIds'), 'AI suggestions must never save or publish automatically');
});

Deno.test('Product logo overlay can be disabled without changing the background, Product, or physical asset', () => {
  const window = new Window({ url: 'https://mvpluxcreations.com/admin.html' });
  window.document.body.innerHTML = `<form data-slug="performer"><input name="title" value="Performer"><input name="description" value="Description"><input name="funFact" value="Fact"><input name="cutoutImage" value="images/main.png"><input name="backgroundImage" value="images/background-with-logo.png"><input name="originalHeight" value="70"><input name="priceOverride" value="99"><input name="cutoutHeight" value="63"><input name="cutoutLeft" value="50"><input name="cutoutBottom" value="21"><input name="logoWidth" value="82"><input name="logoTop" value="-4"><input name="logoVisible" type="checkbox"><input name="stageBackgroundPosition" value="center center"></form>`;
  const form = window.document.querySelector('form');
  form._adminDirtyFields = new Set(['logoVisible']);
  const collectSource = sourceRange(adminSource, 'function collectProductFormData', '\n\nasync function saveProductForm');
  const collect = new Function('FormData', 'allAdminProducts', 'readAdminProducts', 'parseAdminHeight', 'adminDefaultMerchandiseHeight', `${collectSource}\nreturn collectProductFormData;`)(
    window.FormData,
    () => [{ slug: 'performer', cutoutImage: 'images/main.png', backgroundImage: 'images/background-with-logo.png', categories: ['music'], logoVisible: true }],
    () => ({}),
    Number,
    () => 72
  );
  assert(JSON.stringify(collect(form)) === JSON.stringify({ logoVisible: false }), 'removing the overlay must save only logoVisible=false');
  assert(adminSource.includes('Show separate MVPLUX logo overlay') && adminHtml.includes('Show separate MVPLUX logo overlay'), 'existing and new Product editors must expose the same overlay choice');
  assert(adminHtml.includes('<input name="logoVisible" type="checkbox">'), 'new Products must default the optional separate logo overlay to off');
  assert(adminSource.includes('logoVisible = false'), 'the normalized new Product builder must default the optional separate logo overlay to off');
  assert(!/Deno\.(remove|removeSync)|unlink|rmSync/.test(sourceRange(adminSource, "form.querySelector('[data-toggle-product-logo]')", "form.querySelectorAll('[data-product-image-adjust]')")), 'logo toggle must never delete its physical asset');

  const sanitizerSource = sourceRange(storefrontSource, 'function sanitizeProductImageChoices', '\n\nfunction validatePublishedAdminSettings');
  const sanitize = new Function(`${sanitizerSource}\nreturn sanitizePublishedProduct;`)();
  const published = sanitize('performer', { title: 'Performer', cutoutImage: 'images/main.png', backgroundImage: 'images/background-with-logo.png', logoVisible: false, visible: true });
  assert(published.logoVisible === false && published.backgroundImage === 'images/background-with-logo.png', 'published state must preserve both the background and explicit hidden overlay');
  assert(storefrontSource.includes("if (logo) logo.hidden = override.logoVisible === false"), 'fresh/static storefront cards must honor the normalized logoVisible field');
  assert(storefrontSource.includes("product.logoVisible === false ? ''"), 'newly generated storefront cards must omit the overlay when disabled');
});

Deno.test('new Product image pickers load the full organized repository inventory', () => {
  const library = sourceRange(adminSource, 'function creationImageLibrary', '\n\nfunction productVisualOptionsMarkup');
  const inventory = sourceRange(adminSource, 'async function loadImageDraftInventory', '\n\nfunction downloadAdminJson');
  const setup = sourceRange(adminSource, 'function setupAdminCreationWorkspace', '\n\nfunction makeSlug');
  assert(library.includes('repositoryImagePaths.forEach(add)') && library.includes('imageDraftInventory.forEach'), 'Product creation must include deployed and local repository image inventory');
  assert(library.includes('preferOrganizedRepositoryImagePaths'), 'organized image paths must win over recognized legacy duplicates');
  assert(inventory.includes("populateCreationImagePickers(document.getElementById('createProductForm'))"), 'Product image dropdowns must refresh after repository inventory finishes loading');
  assert(setup.includes('loadImageDraftInventory({ renderInbox: false })'), 'opening Products must load the full repository inventory without requiring a visit to Image Inbox');
});

Deno.test('Product image inventory is a lightweight folder-grouped text selector', () => {
  const grouping = sourceRange(adminSource, 'function creationImageFolder', '\n\nfunction creationImageLibrary');
  const options = new Function('escapeAdminHtml', 'creationImageLabel', `${grouping}\nreturn creationImageOptionsByFolder;`)(
    (value) => String(value),
    (path) => String(path).split('/').pop().replace(/\.[^.]+$/, '')
  );
  const markup = options([
    'images/Movie Stars/Actors/Arnold/main.png',
    'images/Sport Legends/Football/TomBrady/main.png',
    'images/Movie Stars/Actors/Arnold/alternate.png'
  ], new Set(['images/Sport Legends/Football/TomBrady/main.png']));
  assert(markup.includes('<optgroup label="Movie Stars / Actors / Arnold">'), 'Movie images must be grouped under their exact repository folder');
  assert(markup.includes('<optgroup label="Sport Legends / Football / TomBrady">'), 'Sports images must be grouped under their exact repository folder');
  assert(markup.includes('value="images/Sport Legends/Football/TomBrady/main.png" selected'), 'folder grouping must preserve the selected normalized image path');
  assert(!markup.includes('<img'), 'the inventory selector must remain text-only and must not load image previews');
  const picker = sourceRange(adminSource, 'function productVisualOptionsMarkup', '\n\nfunction populateCreationImagePickers');
  const createPicker = sourceRange(adminSource, 'function populateCreationImagePickers', '\n\nfunction creationSelectedImageChoices');
  assert(picker.includes('creationImageOptionsByFolder') && createPicker.includes('creationImageOptionsByFolder'), 'new and existing Product selectors must reuse the same folder grouping');
  assert(grouping.includes('Open Image Folders'), 'the visible control must open a folder browser instead of exposing the long select');
  assert(grouping.includes('select.hidden = true'), 'the huge native image select must stay out of the visible editor');
  assert(grouping.includes('data-repository-folder') && grouping.includes('activeRepositoryFolder'), 'the browser must drill through repository folders one level at a time');
  assert(grouping.includes('Images in This Folder'), 'only files in the current folder must appear as selectable images');
  assert(!sourceRange(adminSource, 'function repositoryFileBrowserDialog', '\n\nfunction creationImageLibrary').includes('<img'), 'the folder browser must remain text-only and avoid loading every image preview');
});

Deno.test('Product Editor exposes direct alternate-image attachment without creating another Product', () => {
  const choiceMarkup = sourceRange(adminSource, 'function productImageChoicesMarkup', '\n\nfunction populateProductImageChoiceBrowser');
  const attachmentHandlers = sourceRange(adminSource, "form.querySelector('[data-browse-new-image-choice]')", "form.querySelector('[data-remove-product-background]')");
  for (const control of ['Browse All Repository Images', 'Add Alternate Image Choice', 'data-new-image-choice-label', 'data-new-image-choice-path']) {
    assert(choiceMarkup.includes(control), `missing direct alternate-image control ${control}`);
  }
  assert(attachmentHandlers.includes('addImageChoiceToProduct(form.dataset.slug'), 'direct attachment must use the existing normalized Product image-choice save path');
  assert(!attachmentHandlers.includes('createImageDraft') && !attachmentHandlers.includes('publish'), 'direct attachment must neither create another Product nor publish automatically');
});

Deno.test('Shared Product Showroom controller uses normalized global settings and preserves Product ownership', () => {
  const controller = sourceRange(adminSource, 'function productShowroomDesignDefaults', '\n\nfunction renderAdminProducts');
  for (const text of ['Shared Product Showroom Design', 'All Products — Global Default', 'Stage Height', 'Background Width', 'Background Height', 'Background Left / Right', 'Background Up / Down', 'Overall Background Zoom', 'Standee Size', 'Standee Left / Right', 'Standee Up / Down', 'Center Standee', 'Save Draft', 'Save Live', 'Apply Shared Design']) {
    assert(controller.includes(text), `missing Shared Product Showroom control ${text}`);
  }
  assert(controller.includes("type: 'record', collectionKey: 'globalDisplaySettings', entryKey: 'productShowrooms'") && controller.includes("? { default: design }") && controller.includes("[scope]: design"), 'shared showroom design must narrowly patch the selected normalized scope instead of replacing every Product showroom scope');
  assert(controller.includes("await fetchAuthoritativeAdminGlobal(['globalDisplaySettings'])")
    && controller.includes('latestGlobalDisplay.productShowrooms || {}'), 'Product showroom saves must rebase the selected design on the latest authoritative server settings');
  assert(controller.includes('baseProductShowrooms = structuredClone(latestGlobalDisplay.productShowrooms || {})')
    && controller.includes('baseRecord: baseProductShowrooms, patch'), 'shared showroom conflict detection must compare and patch the selected fields of the raw server record instead of replacing every scope');
  assert(controller.includes("adminLastSaveError || 'The Product showroom design could not be saved.'"), 'Product showroom save failures must expose the real conflict or persistence error instead of a generic failure');
  assert(adminSource.includes("id: 'productShowrooms:all'") && adminSource.includes("type: 'product-showroom-design'"), 'shared showroom draft must participate in the existing Save Live snapshot lifecycle');
  assert(!controller.includes('categoryDisplayCards') && !controller.includes('product.backgroundImage ='), 'shared showroom editor must not write Homepage Collection Cards or individual Product backgrounds');
  assert(styleSource.includes('.admin-shared-product-showroom-workspace') && styleSource.includes('grid-template-columns: minmax(420px,.95fr) minmax(500px,1.05fr)'), 'shared Product Showroom editor must use a desktop preview-and-controls workspace');
  assert(adminHtml.indexOf('id="sharedProductShowroomController"') < adminHtml.indexOf('id="approvedProducts"'), 'shared Product Showroom controls must appear before the long Product list');
  assert(controller.includes('productsInSharedShowroomScope(scope).find'), 'a Main Collection showroom preview must use a sample Product from that selected Main Collection');
});

Deno.test('Product Admin previews resolve organized repository image paths like the storefront', () => {
  const products = sourceRange(adminSource, 'function effectiveAdminProducts', '\n\nfunction effectiveAdminProduct');
  assert(products.includes('MVPLUX_RESOLVE_REPOSITORY_IMAGE_PATH'), 'Admin Product previews must use the shared repository path resolver');
  for (const field of ['merged.cutoutImage', 'merged.backgroundImage', 'choice.image', 'choice.stage']) {
    assert(products.includes(`resolveImagePath(${field})`), `Admin Product previews must resolve ${field}`);
  }
});

Deno.test('Product image placement exposes buttons, sliders, drag, and wheel over the same saved fields', () => {
  const renderer = sourceRange(adminSource, 'function renderAdminProducts', '\n\nfunction filterAdminProductLibrary');
  for (const action of ['left', 'right', 'up', 'down', 'smaller', 'larger', 'center']) {
    assert(renderer.includes(`data-product-image-adjust="${action}"`), `missing visible Product image action ${action}`);
  }
  for (const field of ['cutoutHeight', 'cutoutLeft', 'cutoutBottom']) {
    assert(renderer.includes(`data-product-visual-value="${field}"`) && renderer.includes(`name="${field}" type="range"`), `${field} must expose one synchronized value and slider`);
  }
  assert(renderer.includes("updateFieldValue(form, 'cutoutLeft'") && renderer.includes("updateFieldValue(form, 'cutoutBottom'") && renderer.includes("updateFieldValue(form, 'cutoutHeight'"), 'buttons must update the same normalized Product fields used by sliders');
  const direct = sourceRange(adminSource, 'function attachPreviewControls', '\n\nfunction collectProductFormData');
  assert(direct.includes("dragTarget(event, 'cutout')") && direct.includes("cutout?.addEventListener('wheel'"), 'direct Product preview manipulation must retain drag and wheel sizing');
});

Deno.test('making a Product use a shared showroom clears only showroom presentation overrides', () => {
  const patchSource = sourceRange(adminSource, 'function sharedProductShowroomInheritancePatch', '\n\nasync function makeProductsUseSharedShowroomDesign');
  const patch = new Function(`${patchSource}\nreturn sharedProductShowroomInheritancePatch;`)();
  const original = {
    slug: 'captain-america', title: 'Captain America', description: 'Hero', cutoutImage: 'images/captain.png',
    backgroundImage: 'images/custom-stage.png', stageBackgroundPosition: 'right top', originalHeight: 74,
    priceOverride: 120, categories: ['movie-characters'], imageChoices: [{ label: 'White', image: 'images/white.png' }],
    displayOverrides: { standeeSizePercent: 88, standeeLeftPercent: 12, backgroundWidthPercent: 140, backgroundPositionX: 64 }
  };
  const result = { ...original, ...patch(original) };
  assert(result.backgroundImage === '' && result.stageBackgroundPosition === '', 'shared inheritance must clear the Product-specific background reference and legacy position');
  assert(result.cutoutHeight === '' && result.cutoutLeft === '' && result.cutoutBottom === '', 'shared inheritance must clear legacy Product placement so the selected shared scope can control it');
  assert(!('standeeSizePercent' in result.displayOverrides) && !('standeeLeftPercent' in result.displayOverrides), 'shared inheritance must clear normalized Product placement overrides');
  assert(!('backgroundWidthPercent' in result.displayOverrides) && !('backgroundPositionX' in result.displayOverrides), 'shared inheritance must remove only Product background geometry overrides');
  for (const field of ['slug', 'title', 'description', 'cutoutImage', 'originalHeight', 'priceOverride', 'categories', 'imageChoices']) {
    assert(JSON.stringify(result[field]) === JSON.stringify(original[field]), `shared inheritance changed protected Product field ${field}`);
  }
  const batch = sourceRange(adminSource, 'async function makeProductsUseSharedShowroomDesign', '\n\nfunction renderSharedProductShowroomController');
  assert(batch.includes('saveAdminProductFieldPatches(patches, bases)'), 'Apply-to-scope must persist all Product inheritance changes in one protected batch');
  assert(batch.includes("saveLiveChangeIds(") && batch.includes('...products.map((product) => `product:${product.slug}`)'), 'Apply-to-scope must make the shared design and affected Product inheritance live in one scoped operation');
});

Deno.test('Product showroom inheritance is Product override then Main Collection then global default', () => {
  const helpers = sourceRange(storefrontSource, 'function productShowroomDesignDefaults', '\n\nfunction getShowroomOriginalPrice');
  const settings = {
    productShowrooms: {
      default: { backgroundImage: 'images/global.jpg', backgroundWidthPercent: 110, backgroundHeightPercent: 120, backgroundPositionX: 45, backgroundPositionY: 55, backgroundSizePercent: 105, stageHeightPx: 500, standeeSizePercent: 84, standeeLeftPercent: 48, standeeVerticalPercent: 7 },
      collections: { 'movie-characters': { backgroundImage: 'images/movies.jpg', backgroundHeightPercent: 145, stageHeightPx: 620, standeeSizePercent: 92 } }
    }
  };
  const runtime = new Function('getCurrentProductCategory', 'getAdminGlobalDisplaySettings', `${helpers}\nreturn { resolveSharedProductShowroomDesign, applyProductShowroomDesign };`)(() => 'movie-characters', () => settings);
  const inherited = runtime.resolveSharedProductShowroomDesign({ categories: ['movie-characters'] }, 'movie-characters', settings);
  assert(inherited.backgroundImage === 'images/movies.jpg' && inherited.backgroundWidthPercent === 110 && inherited.backgroundHeightPercent === 145 && inherited.stageHeightPx === 620 && inherited.standeeSizePercent === 92 && inherited.standeeLeftPercent === 48, 'Main Collection shared design must inherit unspecified global values including standee placement');
  const legacyCenteredOffset = runtime.resolveSharedProductShowroomDesign({ displayOverrides: { standeeLeftPercent: -2 } }, 'movie-characters', settings);
  assert(legacyCenteredOffset.standeeLeftPercent === 48, 'legacy negative center offsets must become absolute showroom positions instead of being clamped to the far-left edge');
  const custom = runtime.resolveSharedProductShowroomDesign({ backgroundImage: 'images/captain-custom.jpg' }, 'movie-characters', settings);
  assert(custom.backgroundImage === 'images/captain-custom.jpg' && custom.backgroundHeightPercent === 145, 'Product-specific background must remain an override without losing shared geometry');
  const style = { setProperty(name, value) { this[name] = value; } };
  const stage = { style };
  runtime.applyProductShowroomDesign(stage, {}, 'movie-characters');
  assert(style.backgroundImage === "url('images/movies.jpg')" && style.backgroundPosition === '45% 55%' && style.backgroundSize === '115.5% 152.25%' && style.minHeight === '620px', 'fresh showroom DOM must reconstruct the shared image, X/Y, independent width/height, zoom, and stage height');
  assert(style['--showroom-image-height'] === '92%' && style['--showroom-image-left'] === '48%' && style['--showroom-image-bottom'] === '7%', 'fresh showroom DOM must reconstruct shared standee size and X/Y placement');
});

Deno.test('showroom height formatting accepts saved feet and inches text', () => {
  const formatSource = sourceRange(storefrontSource, 'function formatHeight', '\n\nfunction formatMoney');
  const format = new Function('parseHeightToInches', `${formatSource}\nreturn formatHeight;`)((value) => value === "5'5" ? 65 : Number(value));
  assert(format("5'5") === '5 ft 5 in', 'saved feet/inches text must render in the plain feet-and-inches format, never as NaN');
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

Deno.test('new Product Save Live preserves the form until the public save succeeds', () => {
  const publish = sourceRange(adminSource, 'async function publishNewProductFromForm', '\n\nasync function publishNewCategoryFromForm');
  const save = sourceRange(adminSource, 'async function saveNewProductFromForm', '\n\nasync function saveNewCategoryFromForm');
  assert(publish.includes("saveNewProductFromForm(form, 'draft', { resetAfterSave: false })"), 'Save Live must keep the entered Product fields while the public save is pending');
  assert(publish.indexOf('if (published) resetNewProductCreationForm(form)') > publish.indexOf('publishSavedProductBySlug'), 'the creation form may reset only after the Product is confirmed live');
  assert(save.includes('if (resetAfterSave) resetNewProductCreationForm(form)'), 'private draft creation must use the same explicit reset controller');
});

Deno.test('alternate Product images keep optional customer title and description with main Product fallback', () => {
  const record = normalizeProductRecord({
    slug: 'arnold', title: 'Arnold Schwarzenegger', description: 'Main description', cutoutImage: 'images/main.png',
    imageChoices: [
      { label: 'Mr. Olympia', image: 'images/olympia.png', title: 'Mr. Olympia', description: 'Competition-era pose.' },
      { label: 'Pumping Iron', image: 'images/pumping.png', title: '', description: '' }
    ]
  }, 'arnold');
  assert(record.imageChoices[0].title === 'Mr. Olympia' && record.imageChoices[0].description === 'Competition-era pose.', 'normalized Product must preserve optional per-choice customer text');
  assert(!('title' in record.imageChoices[1]) && !('description' in record.imageChoices[1]), 'blank choice text must remain an explicit inheritance choice, not duplicated Product text');

  const editor = sourceRange(adminSource, 'function productImageChoicesMarkup', '\n\nfunction populateProductImageChoiceBrowser');
  assert(editor.includes('data-image-choice-title') && editor.includes('data-image-choice-description'), 'Product editor must expose optional title and description for every alternate image');
  assert(editor.includes('Blank uses the main Product title') && editor.includes('Blank uses the main Product description'), 'inheritance behavior must be clear in the editor');
  assert(editor.includes('uses the main Product title, description, fun fact, and height automatically'), 'folder images must clearly inherit all main Product information by default');
  assert(editor.includes('admin-image-choice-customize') && editor.includes('<details'), 'per-image title and description overrides must stay in a compact optional editor');

  const genericSelection = sourceRange(storefrontSource, 'function selectGenericCategoryOption', '\n\nfunction buildGenericCategoryOptions');
  const sportsSelection = sourceRange(storefrontSource, 'function selectSportsOption', '\n\nfunction requestedCollectionCardImage');
  assert(genericSelection.includes('option.title || state.productTitle') && genericSelection.includes('option.description || state.productDescription'), 'generic Collection showroom must use choice text and fall back to the Product');
  assert(sportsSelection.includes('option.title || product.name') && sportsSelection.includes('option.description || product.description'), 'Sport Legends must use the same choice-text behavior');
});
