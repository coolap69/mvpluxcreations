const assert = (condition, message) => { if (!condition) throw new Error(message); };

const adminHtml = await Deno.readTextFile(new URL('../admin.html', import.meta.url));
const adminSource = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
const storefrontSource = await Deno.readTextFile(new URL('../script.js', import.meta.url));
const publisherSource = await Deno.readTextFile(new URL('../supabase/functions/publish-admin-changes/index.ts', import.meta.url));

Deno.test('Admin workspace exposes focused creation, review, publish, and recovery areas', () => {
  for (const id of ['dashboard', 'create-content', 'new-image-drafts', 'approved-products', 'publish-changes', 'recovery-advanced']) {
    assert(adminHtml.includes(`id="${id}"`), `missing ${id} Admin area`);
  }
  assert(adminHtml.includes('Legacy Recovery Editor'), 'legacy editor must remain available only as recovery');
});

Deno.test('manual creation forms save and reset without unrelated assistant dependencies', () => {
  assert(adminHtml.includes('id="createProductForm"') && adminHtml.includes('id="createCategoryForm"'), 'manual creation forms must exist');
  assert(adminSource.includes("form.reset();"), 'successful creation must reset the focused form');
  assert(!adminSource.includes('admin-content-assistant'), 'focused deployment must not alter the separate AI integration');
});

Deno.test('inline ownership routes products and categories away from page content', () => {
  assert(storefrontSource.includes("type: 'category-card'"), 'category card ownership must be explicit');
  assert(storefrontSource.includes('saveStorefrontProductPatch(owned.slug'), 'product-owned fields must use the product patch path');
  assert(storefrontSource.includes('scheduleInlineOwnedDisplaySave'), 'product geometry must use product display overrides');
  assert(storefrontSource.includes('delete pagePatch.text') && storefrontSource.includes('delete pagePatch.src'), 'page drafts must omit product-owned content');
});

Deno.test('publisher accepts and validates normalized backward-compatible snapshot fields', () => {
  for (const field of ['schemaVersion', 'categories', 'globalDisplaySettings', 'pageContent']) {
    assert(publisherSource.includes(field), `publisher must handle ${field}`);
  }
  assert(adminSource.includes('version: 1') && adminSource.includes('schemaVersion: 2'), 'snapshot must keep legacy version while adding schemaVersion');
});

Deno.test('new categories use the reusable category page without product-specific code', () => {
  assert(adminSource.includes('category.html?category='), 'category creation must default to reusable page');
  assert(storefrontSource.includes('setupDynamicCategoryPage'), 'storefront must initialize reusable category page');
  assert(storefrontSource.includes('renderNormalizedHomepageCategoryCards'), 'new visible categories must render on homepage');
});

Deno.test('normal Admin startup performs no migration, save, commerce, coupon, or test-mode writes', () => {
  const startupStart = adminSource.indexOf("document.addEventListener('DOMContentLoaded', async () => {");
  assert(startupStart >= 0, 'Admin startup block is missing');
  const startup = adminSource.slice(startupStart);
  for (const forbidden of [
    'createAndVerifyAdminArchitectureBackup()',
    'prepareAdminArchitectureMigrationExplicitly()',
    "rpc('save_site_edits'",
    'await loadAdminTestMode()',
    'refreshCommerceAdmin();'
  ]) assert(!startup.includes(forbidden), `Admin startup must not call ${forbidden}`);
  assert(adminSource.includes("if (area === 'orders' && !adminCommerceLoaded) void refreshCommerceAdmin()"), 'commerce reads must be lazy and bounded to Orders');
  assert(adminSource.includes("if (area === 'admin-settings')"), 'settings reads must be lazy and bounded to Settings');
});

Deno.test('backup, migration preparation, activation, and publishing are separate explicit actions', () => {
  for (const action of ['data-create-migration-backup', 'data-prepare-admin-migration', 'data-activate-admin-locally']) {
    assert(adminSource.includes(action), `missing explicit ${action} control`);
  }
  assert(adminSource.includes('verifyStoredAdminArchitectureBackup()'), 'migration and activation must read back and verify the backup');
  assert(adminSource.includes('migrationLockActive') && adminSource.includes('Migration lock could not be verified'), 'migration must use a verified cross-tab lock');
  assert(adminSource.includes("verification.checksum !== verified.checksum"), 'activation must require the verified backup checksum');
  assert(adminSource.includes("migration.backupChecksum !== verified.checksum"), 'activation must require migration prepared from the same backup');
  assert(adminSource.includes("document.getElementById('publishAdminChanges')?.addEventListener('click', publishAdminChanges)"), 'publishing must remain a separate explicit button');
});

Deno.test('Image Imports and manual Create share one authoritative product creation operation', () => {
  const manualStart = adminSource.indexOf('async function saveNewProductFromForm');
  const manualEnd = adminSource.indexOf('async function saveNewCategoryFromForm', manualStart);
  const manual = adminSource.slice(manualStart, manualEnd);
  const importStart = adminSource.indexOf('async function configureImageDraft');
  const importEnd = adminSource.indexOf('function imageDraftMarkup', importStart);
  const imageImport = adminSource.slice(importStart, importEnd);
  for (const source of [manual, imageImport]) {
    assert(source.includes('buildNewProductRecord('), 'both workflows must use the shared product builder');
    assert(source.includes('newProductRecordOperation('), 'both workflows must use the same authoritative products operation');
  }
  assert(imageImport.includes('cutoutImage: draft.path'), 'the imported image must automatically become the main image');
  assert(!imageImport.includes("collectionKey: 'customProducts'"), 'Image Imports must not create a competing customProducts record');
});

Deno.test('essential creation fields are visible and technical controls are collapsed', () => {
  const advancedGroups = [...adminHtml.matchAll(/<details class="admin-advanced-fields"[^>]*>/g)].map((match) => match[0]);
  assert(advancedGroups.length >= 2, 'product and category builders need collapsed Advanced groups');
  assert(advancedGroups.every((tag) => !/\sopen(?:\s|>)/.test(tag)), 'Advanced groups must be closed by default');
  assert(adminSource.includes("syncGeneratedCreationValue(productForm, 'slug')"), 'product slug must generate from the title');
  assert(adminSource.includes("syncGeneratedCreationValue(categoryForm, 'key')"), 'category key must generate from the title');
});

Deno.test('storefront product editing routes every product-owned field to products', () => {
  for (const field of ['title', 'description', 'funFact', 'originalHeight', 'priceOverride', 'cutoutImage', 'backgroundImage', 'imageChoices', 'categories', 'visible', 'productOrder', 'displayOverrides']) {
    assert(storefrontSource.includes(field), `storefront product editing contract is missing ${field}`);
  }
  assert(storefrontSource.includes('saveStorefrontProductPatch(owned.slug'), 'product-owned content must save through the products patch path');
  assert(storefrontSource.includes('scheduleInlineOwnedDisplaySave'), 'product placement must save as a product display override');
});

Deno.test('Dashboard cards always have visible labels, values, explanations, and actions', () => {
  for (const label of ['Draft Products', 'Draft Categories', 'New Image Imports', 'Waiting for Approval', 'Approved — Waiting to Publish', 'Save Errors', 'Conflicts', 'Hidden Products', 'Archived Products', 'Last Published']) {
    assert(adminSource.includes(`title: '${label}'`), `dashboard is missing ${label}`);
  }
  assert(adminSource.includes('admin-dashboard-card-title') && adminSource.includes('<strong>'), 'dashboard cards must render a title and value');
  assert(adminSource.includes("'Not available'"), 'unavailable dashboard values must not render blank');
  const dashboardStart = adminHtml.indexOf('id="dashboard"');
  const dashboardEnd = adminHtml.indexOf('id="orders"');
  const dashboard = adminHtml.slice(dashboardStart, dashboardEnd);
  assert(!dashboard.includes('<a href='), 'dashboard actions must not use unstyled browser links');
  assert(dashboard.includes('admin-button'), 'dashboard quick actions must use the Admin button system');
});

Deno.test('Create Product and Create Category are visual builders with image pickers', () => {
  assert(adminHtml.includes('class="admin-create-form admin-visual-builder" data-builder="product"'), 'visual product builder is missing');
  assert(adminHtml.includes('data-create-product-preview') && adminSource.includes('admin-builder-product-card'), 'visual product preview is missing');
  assert(adminHtml.includes('class="admin-create-form admin-visual-builder" data-builder="category"'), 'visual category builder is missing');
  assert(adminHtml.includes('data-create-category-preview') && adminSource.includes('admin-builder-category-card'), 'visual category preview is missing');
  assert(adminHtml.includes('data-admin-image-picker="product"') && adminHtml.includes('data-admin-image-picker="background"'), 'creation must use image selectors');
  assert(adminSource.includes("syncGeneratedCreationValue(productForm, 'slug')") && adminSource.includes("syncGeneratedCreationValue(categoryForm, 'key')"), 'technical identifiers must be generated from titles');
});

Deno.test('Orders use plain-language tabs and Testing is outside Orders', () => {
  const ordersStart = adminHtml.indexOf('id="orders"');
  const createStart = adminHtml.indexOf('id="create-content"');
  const orders = adminHtml.slice(ordersStart, createStart);
  assert(!orders.includes('supabase-schema.sql') && !orders.includes('SQL'), 'Orders must not instruct the Admin to run SQL');
  for (const tab of ['New Orders', 'Offers', 'Awaiting Response', 'Completed', 'Archived']) assert(orders.includes(`>${tab}<`), `Orders is missing ${tab} tab`);
  assert(!orders.includes('adminTestModeForm') && !orders.includes('deleteAllTestOffers'), 'Test Mode must not appear in Orders');
  const settingsStart = adminHtml.indexOf('id="admin-settings"');
  assert(adminHtml.indexOf('id="adminTestModeForm"') > settingsStart, 'Test Mode must be under Settings');
});

Deno.test('Review Changes never renders the full product editor', () => {
  const reviewStart = adminHtml.indexOf('id="approved-products"');
  const categoryStart = adminHtml.indexOf('id="category-display-cards"');
  const review = adminHtml.slice(reviewStart, categoryStart);
  assert(!review.includes('admin-product-card') && !review.includes('Save Product'), 'Review Changes must contain compact reviews only');
  assert(adminSource.includes('approvedContainer.innerHTML = architectureReviewMarkup(reviewItems)'), 'review renderer must use compact review markup');
  assert(!adminSource.includes("approvedContainer.innerHTML = productMarkup"), 'full product forms must never render into Review Changes');
});

Deno.test('Legacy Recovery Editor is closed by default and rendered only on demand', () => {
  assert(adminHtml.includes('id="legacyRecoveryEditor"') && !adminHtml.includes('id="legacyRecoveryEditor" open'), 'Legacy Recovery Editor must be closed by default');
  assert(adminSource.includes("recoveryDetails?.open ? productMarkup(availableProducts) : ''"), 'legacy product forms must render only when deliberately opened');
});

Deno.test('Admin navigation shows one area at a time and supports mobile collapse', () => {
  assert(adminSource.includes('section.hidden = section.dataset.adminArea !== area'), 'workspace must hide unrelated Admin areas');
  assert(adminHtml.includes('id="adminNavToggle"') && adminHtml.includes('id="adminWorkspaceNav"'), 'mobile Admin menu controls are missing');
  assert(adminSource.includes("nav?.classList.remove('open')"), 'mobile menu must close after navigation');
});
