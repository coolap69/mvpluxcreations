import { Window } from 'npm:happy-dom@18.0.1';

const source = await Deno.readTextFile(new URL('../admin.js', import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceRange(startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert(start >= 0 && end > start, `missing source range ${startToken}`);
  return source.slice(start, end);
}

Deno.test('Image Box exposes one clear lifecycle toolbar and AI remains suggestion-only', () => {
  const markup = sourceRange('function renderImageDrafts()', 'function imageImportPublished');
  for (const label of ['Undo', 'Redo', 'Save', 'Preview', 'Save Live', 'Continue in Product Editor', 'More']) {
    assert(markup.includes(`>${label}<`), `Image Box toolbar is missing ${label}`);
  }
  assert((markup.match(/>Continue in Product Editor</g) || []).length === 1, 'Image Box must have exactly one Continue in Product Editor button');
  assert(markup.includes('Create Product From Image') && markup.includes('UNSAVED CHANGES') && markup.includes('DRAFT SAVED — PRIVATE'), 'title and lifecycle status must be separate and unambiguous');
  assert(markup.includes('const normalizedProduct = workflowDraft.resultSlug ? effectiveAdminProduct(workflowDraft.resultSlug)') && markup.includes('title: normalizedProduct.title'), 'reopened Image Box must hydrate from the same normalized product that Product Editor saved');
  assert(markup.includes('AI can help fill these fields') && markup.includes('then click Save'), 'AI guidance must explain the Save and Publish lifecycle');
  const ai = sourceRange('async function requestAdminContentSuggestion', 'function bindAdminAiAssistance');
  assert(ai.includes("field.dispatchEvent(new Event('input'"), 'AI suggestions must flow through normal editable field changes');
  assert(!ai.includes('saveAdmin') && !ai.includes('publishScoped') && !ai.includes("action: 'publish'"), 'AI suggestions must never save or publish');
});

Deno.test('actual Image Box history tracks dirty state and protects the last saved draft', () => {
  const window = new Window({ url: 'https://mvpluxcreations.com/admin.html#image-inbox' });
  window.document.body.innerHTML = `<form class="admin-image-draft" data-image-path="images/test.png">
    <p data-image-draft-status></p>
    <input name="title" value="Saved title">
    <textarea name="description">Saved description</textarea>
    <label><input name="categories" type="checkbox" value="sports" checked></label>
    <label><input name="categories" type="checkbox" value="music"></label>
    <button type="button" data-image-box-undo></button><button type="button" data-image-box-redo></button>
  </form>`;
  const historySource = sourceRange('const imageBoxHistoryByPath', 'function setImageDraftActionsBusy');
  const api = new Function('window', 'document', `
    const updateImageDraftDestination = () => {};
    const updateImageImportPreview = () => {};
    const setImageDraftActionStatus = (form, message, state = '') => {
      const status = form.querySelector('[data-image-draft-status]');
      status.textContent = message;
      status.dataset.state = state;
    };
    ${historySource}
    return { initializeImageBoxHistory, recordImageBoxChange, undoImageBoxChange, redoImageBoxChange, markImageBoxSaved };
  `)(window, window.document);
  const form = window.document.querySelector('form');
  const title = form.elements.namedItem('title');
  const status = form.querySelector('[data-image-draft-status]');
  api.initializeImageBoxHistory(form, true);
  title.value = 'Edited title';
  api.recordImageBoxChange(form);
  assert(form.dataset.imageBoxDirty === 'true' && status.textContent === 'UNSAVED CHANGES', 'editing must create an explicit unsaved state');
  assert(api.undoImageBoxChange(form) && title.value === 'Saved title', 'Undo must restore the previous unsaved value');
  assert(api.redoImageBoxChange(form) && title.value === 'Edited title', 'Redo must restore the undone value');
  api.markImageBoxSaved(form);
  assert(form.dataset.imageBoxDirty === 'false' && status.textContent === 'DRAFT SAVED — PRIVATE', 'successful persistence must establish the saved safety point');
  assert(!api.undoImageBoxChange(form) && title.value === 'Edited title', 'Undo must not cross and destroy the last successfully saved draft');
});

function imageBoxPublishHarness({ saveSucceeds = true } = {}) {
  const handleSource = sourceRange('async function handleImageInboxAction', 'async function ignoreImageDraft');
  const calls = [];
  const status = { textContent: '', dataset: {} };
  const form = {
    dataset: { imagePath: 'images/test.png', productSlug: 'test-product' },
    current: { title: 'Michael Jackson', description: 'Newest screen value' },
    querySelector(selector) { return selector === '[data-image-draft-status]' ? status : null; }
  };
  let savedProduct = { slug: 'test-product', title: 'Older saved title', description: 'Old' };
  const handle = new Function('dependencies', `
    const { saveImageBoxProductDraft, setImageDraftActionStatus, collectImageDraftForm, normalizeImageImportDraft,
      readImageDraftEdits, effectiveAdminProduct, publishSavedProductBySlug, setImageDraftActionsBusy,
      updateImageBoxHistoryButtons, markImageBoxSaved } = dependencies;
    ${handleSource}
    return handleImageInboxAction;
  `)({
    saveImageBoxProductDraft: async (target) => {
      calls.push('save');
      if (!saveSucceeds) return false;
      savedProduct = { ...savedProduct, ...structuredClone(target.current) };
      return true;
    },
    setImageDraftActionStatus: (_form, message, state) => { status.textContent = message; status.dataset.state = state || ''; },
    collectImageDraftForm: () => ({ path: 'images/test.png', parentProductSlug: '', destination: 'create-product' }),
    normalizeImageImportDraft: (value) => value,
    readImageDraftEdits: () => ({ 'images/test.png': { resultSlug: 'test-product' } }),
    effectiveAdminProduct: () => structuredClone(savedProduct),
    publishSavedProductBySlug: async (_slug, title) => {
      calls.push(`publish:${title}:${savedProduct.description}`);
      status.dataset.state = 'published';
      return true;
    },
    setImageDraftActionsBusy: () => {}, updateImageBoxHistoryButtons: () => {}, markImageBoxSaved: () => {}
  });
  return { handle, form, status, calls };
}

Deno.test('Publish saves the newest screen state first and save failure stops stale publication', async () => {
  const success = imageBoxPublishHarness();
  assert(await success.handle(success.form, 'publish'), 'valid Image Box publish should complete');
  assert(success.calls.join('|') === 'save|publish:Michael Jackson:Newest screen value', 'Publish must use the product reconstructed from the newest saved screen state');
  assert(success.status.textContent === 'LIVE', 'success must be reported only after the shared public-live controller confirms customer read-back');

  const failure = imageBoxPublishHarness({ saveSucceeds: false });
  assert(!await failure.handle(failure.form, 'publish'), 'save failure must stop Publish');
  assert(failure.calls.join('|') === 'save' && failure.status.textContent.includes('SAVE FAILED — WEBSITE NOT CHANGED'), 'an older saved product must never go live after current-state save failure');
});

Deno.test('Save, keyboard Save, editor handoff, and Publish reuse one normalized save operation', () => {
  const save = sourceRange('async function saveImageBoxProductDraft', 'async function openProductEditorFromImageInbox');
  const open = sourceRange('async function openProductEditorFromImageInbox', 'async function handleImageInboxAction');
  const handle = sourceRange('async function handleImageInboxAction', 'async function ignoreImageDraft');
  const binding = sourceRange("container.querySelectorAll('.admin-image-draft')", 'renderImageImportPending();');
  assert(save.includes("configureImageDraft(form, 'draft')") && save.includes('markImageBoxSaved(form)'), 'visible Save must persist the normalized product and then establish the saved state');
  assert(open.indexOf('saveImageBoxProductDraft(form)') < open.indexOf('openedProductEditors.add(slug)'), 'Continue must save first and open the exact normalized product');
  assert(handle.includes("if (action === 'save') return saveImageBoxProductDraft(form)") && handle.includes('if (!await saveImageBoxProductDraft(form))'), 'manual Save and Publish pre-save must call the same operation');
  assert(binding.includes("key === 's'") && binding.includes("handleImageInboxAction(form, 'save')"), 'CMD/CTRL+S must invoke the same Save action');
  assert(handle.includes('publishSavedProductBySlug('), 'Image Box must reuse the Product Editor scoped product publisher');
});

Deno.test('Create and Add Existing write only normalized product records plus workflow metadata', () => {
  const configure = sourceRange('async function configureImageDraft', 'async function saveImageBoxProductDraft');
  assert(configure.includes('newProductRecordOperation(product)'), 'Create New Product must create one normalized products record');
  assert(configure.includes('imageImportProductOperation(existingDraftProduct') && configure.includes('imageImportProductOperation(parent'), 'later Create edits and Add Existing must patch the explicitly resolved normalized product');
  assert(configure.includes("const parent = effectiveAdminProduct(draft.parentProductSlug)"), 'Add Existing must require the explicitly selected product key');
  assert(configure.includes("collectionKey: 'imageDrafts'") && configure.includes('resultSlug'), 'Image draft storage must remain workflow metadata pointing to the normalized product');
  assert(!configure.includes("collectionKey: 'customProducts'"), 'the Image Box itself must not create a second customProducts authority');
  assert(!configure.includes("collectionKey: 'categories'") && !configure.includes("collectionKey: 'categoryDisplayCards'"), 'Image Box must never create a Main Collection or Homepage Collection Card');
  assert(!configure.includes("destination === 'create-category'") && !configure.includes("destination === 'existing-category'"), 'unreachable legacy Collection destinations must not remain as product-creation paths');
  const bulkPublish = sourceRange('async function publishImageImports', 'async function loadImageDraftInventory');
  assert(bulkPublish.includes("changeIds.add(`product:${draft.resultSlug}`)") && !bulkPublish.includes("changeIds.add(`category:${draft.resultSlug}`)"), 'legacy Image Box bulk publication must also remain Product-only');
});

Deno.test('actual Image Box normalized builder carries every supported product field into one draft', () => {
  const builderSource = sourceRange('function buildImageBoxNormalizedProduct', 'async function configureImageDraft');
  const build = new Function('dependencies', `
    const { buildNewProductRecord, parseAdminHeight, adminDefaultMerchandiseHeight } = dependencies;
    ${builderSource}
    return buildImageBoxNormalizedProduct;
  `)({
    buildNewProductRecord: (value) => ({ ...value, normalized: true }),
    parseAdminHeight: (value) => Number(value), adminDefaultMerchandiseHeight: () => 78
  });
  const draft = {
    slug: 'new-product', path: 'images/new.png', title: 'New title', description: 'New description', funFact: 'New fact',
    originalHeight: '74', priceOverride: '88.50', backgroundImage: 'images/stage.png', categories: ['music', 'featured']
  };
  const created = build(draft, null, 'draft');
  assert(created.normalized && created.slug === 'new-product' && created.cutoutImage === 'images/new.png', 'Create must send one normalized product identity and selected image to the shared builder');
  assert(created.title === 'New title' && created.description === 'New description' && created.funFact === 'New fact', 'all Image Box text must enter the normalized draft');
  assert(created.originalHeight === '74' && created.backgroundImage === 'images/stage.png' && created.priceOverride === '88.50', 'height, background, and optional price must enter the normalized draft');
  assert(created.categories.join(',') === 'music,featured', 'Category assignments must enter the same normalized draft');

  const updated = build(draft, { slug: 'new-product', categoryOrder: { music: 4 } }, 'draft');
  assert(updated.cutoutImage === 'images/new.png' && updated.originalHeight === '74' && updated.priceOverride === 88.5, 'later Image Box saves must patch the same normalized draft with current values');
  assert(updated.categoryOrder.music === 4 && updated.categoryOrder.featured === 999, 'existing Category order must survive while newly selected Categories receive the standard draft order');
  assert(updated.approvalStatus === 'draft' && updated.draftStatus === 'draft', 'Save must remain private and never approve or publish');
});

Deno.test('Preview and navigation safeguards never publish or warn after a successful Save', () => {
  const binding = sourceRange("container.querySelectorAll('.admin-image-draft')", 'renderImageImportPending();');
  const safeguards = sourceRange('function bindImageBoxGlobalSafeguards', 'function renderImageDrafts');
  assert(binding.includes('PREVIEW — UNSAVED CHANGES') && !binding.slice(binding.indexOf("[data-preview-image-import]"), binding.indexOf("[data-save-image-box]")).includes('publish'), 'Preview must use current values without publishing');
  assert(safeguards.includes("data-image-box-dirty=\"true\"") && safeguards.includes('beforeunload'), 'leaving with genuinely unsaved Image Box changes must warn');
  assert(source.includes("form.dataset.imageBoxDirty = 'false'") && source.includes('markImageBoxSaved(form)'), 'successful Save must clear the warning condition');
});
