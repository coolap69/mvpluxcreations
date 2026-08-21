const assert = (condition, message) => { if (!condition) throw new Error(message); };

const adminSource = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
const publisherSource = await Deno.readTextFile(new URL('../supabase/functions/publish-admin-changes/index.ts', import.meta.url));

function sourceBetween(startToken, endToken) {
  const start = adminSource.indexOf(startToken);
  const end = adminSource.indexOf(endToken, start + startToken.length);
  assert(start >= 0 && end > start, `Could not isolate ${startToken}`);
  return adminSource.slice(start, end);
}

Deno.test('Dashboard startup does not request image inventory or construct hidden workspaces', () => {
  const startupStart = adminSource.indexOf("document.addEventListener('DOMContentLoaded', async () => {");
  const startup = adminSource.slice(startupStart, adminSource.indexOf("if (window.location.hash.startsWith('#product-'))", startupStart));
  for (const forbidden of [
    'await loadImageDraftInventory()', 'renderImageDrafts();', 'renderAdminProducts();',
    'renderCategoryManager();', 'renderAdminRecoveryTools();', 'renderPublishSummary();',
    'renderAdminExportPreview();', 'setupAdminCreationWorkspace();'
  ]) assert(!startup.includes(forbidden), `startup must not call ${forbidden}`);
  assert(startup.includes('setupAdminArchitectureWorkspace();'), 'startup must hand the current hash to the lazy section loader');
  assert(startup.includes('loadAdminLiveSettings(ADMIN_DASHBOARD_COLLECTIONS, { replace: true })'), 'startup must request only Dashboard working collections');
  const dashboardCollections = sourceBetween('const ADMIN_DASHBOARD_COLLECTIONS', 'const adminSaveChannel');
  for (const heavy of ["'categories'", "'imageDrafts'", "'adminPublishingMigrationBackupV1'"]) {
    assert(!dashboardCollections.includes(heavy), `Dashboard collection request must exclude ${heavy}`);
  }
});

Deno.test('router changes visible state before starting section loading', () => {
  const router = sourceBetween('function showAdminAreaFromHash()', 'function setupCommerceTabs()');
  assert(router.indexOf('section.hidden = section.dataset.adminArea !== area') < router.indexOf('void ensureAdminAreaLoaded(area)'), 'route visibility must update before async loading starts');
  assert(router.indexOf("link.classList.toggle('active', active)") < router.indexOf('void ensureAdminAreaLoaded(area)'), 'selected navigation state must update before async loading starts');
});

Deno.test('Image Inbox inventory is requested only by its lazy loader or explicit Category repository search', () => {
  const loader = sourceBetween('async function ensureAdminAreaLoaded', 'function showAdminAreaFromHash');
  assert(loader.includes("if (area === 'image-inbox')") && loader.includes('await loadImageDraftInventory()'), 'Image Inbox route must own its inventory request');
  const categoryEvents = sourceBetween('function setupCategoryManagerEvents()', 'function renderAdminProducts()');
  assert(categoryEvents.includes("if (!imageInventoryLoaded) await loadImageDraftInventory({ renderInbox: false })"), 'Search All Repository Images may explicitly load inventory without rendering Image Inbox');
});

Deno.test('Categories mount editors, products, and image galleries only after explicit actions', () => {
  const manager = sourceBetween('function renderCategoryManager()', 'function updateDeleteSelectedCategoriesButton');
  assert(manager.includes("openedCategoryEditors.has(category.key) ? categoryEditMarkup(category) : ''"), 'Category editors must be absent until Edit');
  assert(manager.includes("openedCategoryProductLists.has(category.key) ? categoryProductsMarkup(category) : ''"), 'Category product lists must be absent until Open Products');
  const picker = sourceBetween('function categoryVisualImagePicker', 'function populateNewCategoryVisualPickers');
  assert(picker.includes('Choose Change Image to load associated images.'), 'image gallery must begin as an unloaded placeholder');
  assert(!picker.includes('categoryImagePickerChoices(preferred'), 'associated thumbnails must not be constructed with the editor');
});

Deno.test('Image Inbox and Products render compact summaries before full forms', () => {
  const inbox = sourceBetween('function renderImageDrafts()', 'function imageImportPublished');
  assert(inbox.includes("if (!openedImageInboxItems.has(draft.path))"), 'unopened Image Inbox entries must stay compact');
  assert(inbox.includes('data-configure-image-inbox'), 'compact Image Inbox cards need an explicit configure action');
  const products = sourceBetween('function renderAdminProducts()', 'function filterAdminProductLibrary');
  assert(products.includes('productSummaryMarkup') && products.includes("editorOpen ? productMarkup([product]) : ''"), 'Products must render compact cards and only opened editors');
});

Deno.test('normal working-state response strips recovery backup without changing it', () => {
  assert(publisherSource.includes("payload?.action === 'working-state'"), 'publisher must expose the authenticated working-state read');
  assert(publisherSource.includes('adminPublishingMigrationBackupV1: recoveryBackup, ...workingEdits'), 'working-state must omit the backup from its response');
  assert(publisherSource.includes("payload?.action === 'recovery-state'"), 'Advanced must have an explicit full recovery-state read');
  const workingState = publisherSource.slice(publisherSource.indexOf('async function readAdminWorkingState'), publisherSource.indexOf('async function readAdminRecoveryState'));
  assert(!workingState.includes('save_site_edits') && !workingState.includes('method: \'POST\''), 'working-state must be read-only');
});

Deno.test('invalid embedded image values are labeled, never printed, and old Base64 upload is disabled', () => {
  assert(adminSource.includes("'Legacy Base64 image'"), 'legacy embedded images need a short label');
  assert(adminSource.includes('presentation.valid ? selected : \'\''), 'invalid raw values must not enter hidden form fields');
  assert(!adminSource.includes('canvas.toDataURL') && !adminSource.includes('reader.readAsDataURL'), 'legacy Base64 upload conversion must be removed');
  assert(adminSource.includes('Embedded Base64 images are blocked.'), 'local upload control must explain the repository workflow');
});
