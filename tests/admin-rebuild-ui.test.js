const assert = (condition, message) => { if (!condition) throw new Error(message); };

const adminHtml = await Deno.readTextFile(new URL('../admin.html', import.meta.url));
const adminSource = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
const storefrontSource = await Deno.readTextFile(new URL('../script.js', import.meta.url));
const assistantSource = await Deno.readTextFile(new URL('../supabase/functions/admin-content-assistant/index.ts', import.meta.url));
const assistantProviderSource = await Deno.readTextFile(new URL('../supabase/functions/admin-content-assistant/ai-providers.ts', import.meta.url));
const publisherSource = await Deno.readTextFile(new URL('../supabase/functions/publish-admin-changes/index.ts', import.meta.url));

Deno.test('Admin workspace exposes the simplified everyday areas and keeps technical publishing in Advanced', () => {
  for (const id of ['dashboard', 'products', 'image-inbox', 'categories', 'orders', 'admin-settings', 'advanced']) {
    assert(adminHtml.includes(`id="${id}"`), `missing ${id} Admin area`);
  }
  const navigation = adminHtml.slice(adminHtml.indexOf('id="adminWorkspaceNav"'), adminHtml.indexOf('</nav>', adminHtml.indexOf('id="adminWorkspaceNav"')));
  for (const label of ['Dashboard', 'Products', 'Image Inbox', 'Categories', 'Orders &amp; Offers', 'Settings', 'Advanced']) assert(navigation.includes(`>${label}<`), `navigation is missing ${label}`);
  assert(!navigation.includes('Review Changes') && !navigation.includes('>Publish<'), 'review and publish must not be everyday destinations');
  assert(adminHtml.includes('id="publish-changes" data-admin-area="advanced"'), 'technical publisher must remain available in Advanced');
  assert(adminHtml.includes('Legacy Recovery Editor'), 'legacy editor must remain available only as recovery');
});

Deno.test('Admin router honors direct hashes before asynchronous initialization and switches immediately', () => {
  const routerStart = adminSource.indexOf('function showAdminAreaFromHash()');
  const routerEnd = adminSource.indexOf('function setupCommerceTabs()', routerStart);
  const router = adminSource.slice(routerStart, routerEnd);
  for (const route of ['dashboard', 'products', 'image-inbox', 'categories', 'orders', 'settings', 'advanced']) {
    assert(adminHtml.includes(`data-admin-area="${route}"`), `Admin route ${route} must have a matching section`);
  }
  for (const alias of ['create-content', 'new-image-drafts', 'approved-products', 'admin-settings', 'publish-changes', 'recovery-advanced']) {
    assert(router.includes(`'${alias}'`), `legacy route ${alias} must resolve through the current router`);
  }
  assert(router.includes("window.location.hash || '#dashboard'"), 'Dashboard must only be the missing/invalid hash fallback');
  assert(router.includes('section.hidden = section.dataset.adminArea !== area'), 'routing must synchronously hide every nonmatching section');
  assert(router.includes("link.setAttribute('aria-current', 'page')"), 'the active navigation link must be announced and highlighted');
  assert(adminSource.includes("window.addEventListener('hashchange', showAdminAreaFromHash)"), 'Back and Forward must remain bound to hashchange');

  const bindingStart = adminSource.indexOf('function bindAdminWorkspaceNavigation()');
  const bindingEnd = adminSource.indexOf('function setupAdminArchitectureWorkspace()', bindingStart);
  const binding = adminSource.slice(bindingStart, bindingEnd);
  assert(binding.includes('event.preventDefault()') && binding.includes('window.location.hash = hash') && binding.includes('showAdminAreaFromHash();'), 'navigation clicks must update the hash and switch sections immediately');

  const startupStart = adminSource.indexOf("document.addEventListener('DOMContentLoaded', async () => {");
  const startup = adminSource.slice(startupStart);
  assert(startup.indexOf('bindAdminWorkspaceNavigation();') < startup.indexOf('await adminStateUtilsPromise;'), 'the router listener must be installed before the first asynchronous startup operation');
  assert(startup.indexOf('showAdminAreaFromHash();') < startup.indexOf('await adminStateUtilsPromise;'), 'the initial hash must be rendered before authentication or data loading');
});

Deno.test('manual creation remains available without AI and successful saves reset forms', () => {
  assert(adminHtml.includes('id="createProductForm"') && adminHtml.includes('id="createCategoryForm"'), 'manual creation forms must exist');
  assert(adminSource.includes("form.reset();"), 'successful creation must reset the focused form');
  assert(adminSource.includes("Suggestion added for review. Nothing was saved."), 'AI response must be preview-only');
});

Deno.test('AI controls are enabled after secure Edge Function deployment and remain review-only', () => {
  const staticButtons = [...adminHtml.matchAll(/<button[^>]+data-ai-suggest="[^"]+"[^>]*>/g)].map((match) => match[0]);
  assert(staticButtons.length === 8, 'both visual builders must expose four AI controls');
  assert(staticButtons.every((button) => !button.includes('disabled')), 'deployed AI controls must be enabled');
  const dynamicButtons = [...adminSource.matchAll(/<button[^>]+data-ai-suggest="[^"]+"[^>]*>/g)].map((match) => match[0]);
  assert(dynamicButtons.length >= 4 && dynamicButtons.every((button) => !button.includes('disabled')), 'Image Import AI controls must also be enabled');
  assert(adminHtml.includes('They never save or publish automatically.'), 'AI controls must explain that suggestions are review-only');
  assert(adminHtml.includes('data-ai-status aria-live="polite"') && adminSource.includes("form.querySelector('[data-ai-status]"), 'AI errors must render directly beneath the controls');
  assert(adminSource.includes("button.dataset.aiBusy === 'true'") && adminSource.includes("button.dataset.aiBusy = 'true'"), 'duplicate simultaneous AI clicks must be blocked');
});

Deno.test('product creation and Image Imports pass authoritative identity to AI without publishing', () => {
  const productStart = adminHtml.indexOf('id="createProductForm"');
  const categoryStart = adminHtml.indexOf('id="createCategoryForm"');
  const productForm = adminHtml.slice(productStart, categoryStart);
  assert(productForm.includes('Who or what is this?') && productForm.includes('name="subjectIdentity"'), 'manual product creation needs the identity field');
  assert(adminSource.includes('Who or what is this?') && adminSource.includes('value="${escapeAdminHtml(draft.subjectIdentity || \'\')}"'), 'Image Imports must render saved identity context');
  assert(adminSource.includes("identity: String(formData.get('subjectIdentity') || '')"), 'every AI action must send the identity value');
  assert(adminSource.includes("subjectIdentity: String(formData.get('subjectIdentity') || '').trim()"), 'Image Import drafts must preserve identity context');
  assert(!adminSource.includes('subjectIdentity: formData.get'), 'identity context must not be added to product publication records');
});

Deno.test('shared storefront navigation reveals an Admin-only Dashboard link after authorization', () => {
  assert(storefrontSource.includes('data-admin-dashboard-link href="/admin.html">Admin Dashboard</a>'), 'shared navigation needs a clear direct Admin Dashboard link');
  const revealStart = storefrontSource.indexOf('async function revealAdminControlsIfApproved');
  const revealEnd = storefrontSource.indexOf('async function turnOnCurrentPageAdminMode', revealStart);
  const reveal = storefrontSource.slice(revealStart, revealEnd);
  assert(reveal.indexOf('if (!canUseAdmin)') < reveal.indexOf('addAdminDashboardLinkIfMissing()'), 'Dashboard link must be added only after authoritative Admin approval');
  assert(reveal.includes("document.querySelectorAll('[data-admin-dashboard-link]').forEach((link) => link.remove())"), 'non-Admin sessions must remove the Dashboard link');
  assert(!adminHtml.includes('data-admin-dashboard-link'), 'the Admin Dashboard link must not be statically exposed');
});

Deno.test('optional AI endpoint requires Admin authorization and keeps its API key server-side', () => {
  assert(assistantSource.includes('admin_profiles?user_id=eq.'), 'AI endpoint must verify admin_profiles');
  assert(assistantProviderSource.includes("configuredSecret(env, 'GEMINI_API_KEY')"), 'Gemini key must come from Edge Function environment');
  assert(assistantProviderSource.includes("configuredSecret(env, 'OPENAI_API_KEY')"), 'OpenAI key support must remain server-side');
  assert(!adminSource.includes('GEMINI_API_KEY') && !adminSource.includes('OPENAI_API_KEY'), 'browser Admin code must not contain AI secret names');
  assert(assistantSource.includes('recentRequests') && assistantSource.includes('active.length >= 10'), 'AI endpoint must rate limit requests');
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
  const lazyLoader = adminSource.slice(adminSource.indexOf('async function ensureAdminAreaLoaded'), adminSource.indexOf('function showAdminAreaFromHash'));
  assert(lazyLoader.includes("if (area === 'orders' && !adminCommerceLoaded) await refreshCommerceAdmin()"), 'commerce reads must be lazy and bounded to Orders');
  assert(lazyLoader.includes("if (area === 'settings')"), 'settings reads must be lazy and bounded to Settings');
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
  for (const label of ['Products', 'Drafts', 'Unpublished Changes', 'Orders / Offers', 'Recent Publications', 'Errors']) {
    assert(adminSource.includes(`title: '${label}'`), `dashboard is missing ${label}`);
  }
  assert(adminSource.includes('admin-dashboard-card-title') && adminSource.includes('<strong>'), 'dashboard cards must render a title and value');
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
  const productsStart = adminHtml.indexOf('id="products"');
  const orders = adminHtml.slice(ordersStart, productsStart);
  assert(!orders.includes('supabase-schema.sql') && !orders.includes('SQL'), 'Orders must not instruct the Admin to run SQL');
  for (const tab of ['New Orders', 'Offers', 'Awaiting Response', 'Completed', 'Archived']) assert(orders.includes(`>${tab}<`), `Orders is missing ${tab} tab`);
  assert(!orders.includes('adminTestModeForm') && !orders.includes('deleteAllTestOffers'), 'Test Mode must not appear in Orders');
  const settingsStart = adminHtml.indexOf('id="admin-settings"');
  assert(adminHtml.indexOf('id="adminTestModeForm"') > settingsStart, 'Test Mode must be under Settings');
});

Deno.test('Products starts compact and mounts one full editor only after Edit', () => {
  assert(adminSource.includes('approvedContainer.innerHTML = productSummaryMarkup(approvedProducts)'), 'Products must render compact summaries first');
  assert(adminSource.includes('openedProductEditors.add(button.dataset.editProduct)'), 'Edit must explicitly opt one product into full editor rendering');
  assert(adminSource.includes("editorOpen ? productMarkup([product]) : ''"), 'unopened products must not build full forms');
  assert(adminSource.includes('Technical published/private comparison'), 'Advanced must retain the technical comparison');
  assert(adminSource.includes('publishScopedChangeIds([`product:${slug}`]'), 'normal product publishing must scope itself to one product');
  assert(adminSource.includes('publisher.publishCategoryByKey(categoryKey'), 'normal Category publishing must use the shared scoped Category operation');
  assert(adminHtml.includes('data-publish-new-product>Publish to Website</button>'), 'new products need a direct publish action');
  assert(adminHtml.includes('data-publish-new-category>Publish to Website</button>'), 'new categories need a direct publish action');
  assert(!adminHtml.includes('Mark Ready') && !storefrontSource.includes('>Mark Ready</button>'), 'normal Admin surfaces must not expose Ready terminology');
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
