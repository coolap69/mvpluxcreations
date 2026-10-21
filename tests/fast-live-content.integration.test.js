import { Window } from 'npm:happy-dom@18.0.1';

const assert = (condition, message) => { if (!condition) throw new Error(message); };

const storefrontSource = await Deno.readTextFile(new URL('../script.js', import.meta.url));
const adminSource = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
const adminHtml = await Deno.readTextFile(new URL('../admin.html', import.meta.url));
const edgeSource = await Deno.readTextFile(new URL('../supabase/functions/publish-admin-changes/index.ts', import.meta.url));
const migrationSource = await Deno.readTextFile(new URL('../supabase/migrations/20260826190000_fast_live_content_snapshot.sql', import.meta.url));

function sourceRange(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert(start >= 0 && end > start, `missing source range ${startToken}`);
  return source.slice(start, end);
}

Deno.test('storefront uses one Supabase live snapshot and falls back atomically to static JSON', async () => {
  const code = sourceRange(storefrontSource, 'const PUBLIC_LIVE_FAILURE_BACKOFF_KEY', '\n\nfunction getPublishedProducts');
  const liveSnapshot = { version: 1, products: { live: {} }, categoryDisplayCards: {} };
  const staticSnapshot = { version: 1, products: { static: {} }, categoryDisplayCards: {} };
  let rpcResult = { data: { snapshot: liveSnapshot, liveRevision: 7, publishedAt: 'live-now' }, error: null };
  let staticFetches = 0;
  const window = {
    setTimeout, clearTimeout,
    mvpluxPublishedAdminSettings: null,
    mvpluxPublishedAdminSettingsSource: '',
    mvpluxPublishedAdminSettingsRevision: 0
  };
  const factory = new Function('window', 'getSupabaseClient', 'validatePublishedAdminSettings', 'fetch', `${code}; return { loadPublishedAdminSettings };`);
  const runtime = factory(
    window,
    () => ({ rpc: async () => rpcResult }),
    (document) => document?.snapshot || null,
    async () => { staticFetches += 1; return { ok: true, json: async () => ({ snapshot: staticSnapshot }) }; }
  );
  const live = await runtime.loadPublishedAdminSettings();
  assert(live === liveSnapshot && window.mvpluxPublishedAdminSettingsSource === 'supabase-live', 'valid activated Supabase live state must be authoritative');
  assert(window.mvpluxPublishedAdminSettingsRevision === 7 && staticFetches === 0, 'healthy live state must not read or merge the static fallback');

  rpcResult = { data: null, error: new Error('RPC unavailable') };
  const fallback = await runtime.loadPublishedAdminSettings();
  assert(fallback === staticSnapshot && window.mvpluxPublishedAdminSettingsSource === 'static-fallback', 'static JSON must be an all-or-nothing emergency fallback');
  assert(staticFetches === 1 && !fallback.products.live, 'fallback must never merge with a failed Supabase response');
});

Deno.test('same-tab Collection navigation reuses the validated live snapshot without another blocking Supabase read', async () => {
  const code = sourceRange(storefrontSource, 'const PUBLIC_LIVE_FAILURE_BACKOFF_KEY', '\n\nfunction getPublishedProducts');
  const liveSnapshot = { version: 1, products: { live: {} }, categoryDisplayCards: {}, categories: {} };
  const memory = new Map();
  let rpcReads = 0;
  const window = {
    setTimeout, clearTimeout,
    sessionStorage: {
      getItem: (key) => memory.get(key) || null,
      setItem: (key, value) => memory.set(key, value),
      removeItem: (key) => memory.delete(key)
    },
    mvpluxPublishedAdminSettings: null,
    mvpluxPublishedAdminSettingsSource: '',
    mvpluxPublishedAdminSettingsRevision: 0
  };
  const factory = new Function('window', 'getSupabaseClient', 'validatePublishedAdminSettings', 'fetch', `${code}; return { loadPublishedAdminSettings };`);
  const runtime = factory(
    window,
    () => ({ rpc: async () => { rpcReads += 1; return { data: { snapshot: liveSnapshot, liveRevision: 12, publishedAt: 'now' }, error: null }; } }),
    (document) => document?.snapshot || null,
    async () => { throw new Error('static fallback should not load'); }
  );

  const first = await runtime.loadPublishedAdminSettings();
  assert(first.products.live && rpcReads === 1, 'the first page must read the authoritative live snapshot once');
  const second = await runtime.loadPublishedAdminSettings();
  assert(second.products.live && rpcReads === 1, 'the next Collection page must render from the same validated session snapshot without a second blocking read');
  assert(window.mvpluxPublishedAdminSettingsSource === 'supabase-live-navigation-cache', 'the reused state must remain identified as the Supabase live snapshot, not a static merge');
});

Deno.test('public snapshot reads are abortable, deduplicated, and backed off after failure', () => {
  const code = sourceRange(storefrontSource, 'const PUBLIC_LIVE_FAILURE_BACKOFF_KEY', '\n\nconst PUBLIC_LIVE_NAVIGATION_CACHE_KEY');
  assert(code.includes('let publicLiveAdminSettingsRequest = null'), 'the storefront must share one in-flight public snapshot request');
  assert(code.includes('rpcRequest.abortSignal(controller.signal)') && code.includes('controller.abort()'), 'a timed-out Supabase snapshot request must be cancelled where supported');
  assert(code.includes('retryAt') && code.includes('PUBLIC_LIVE_FAILURE_BACKOFF_MAX_MS'), 'failed public reads must use bounded navigation-session backoff');
  assert(adminSource.includes('let adminPublicLiveRequest = null')
    && adminSource.includes('rpcRequest.abortSignal(controller.signal)')
    && adminSource.includes('adminPublicLiveRetryAt'), 'Admin public snapshot verification must have equivalent cancellation, deduplication, and backoff');
});

Deno.test('signed-in homepage rerenders keep the fast Collection navigation handoff', () => {
  const code = sourceRange(storefrontSource, 'function normalizeFrontPageCategoryLinks()', '\n\nfunction scrollToSelectedStandeeHash');
  const window = new Window({ url: 'http://localhost:3000/index.html' });
  window.document.body.innerHTML = '<div id="homepageCategoryGrid"><a href="sports-legends.html?product=old">Sport Legends</a></div>';
  window.mvpluxPublishedAdminSettings = { version: 1, products: {}, categories: {} };
  window.mvpluxPublishedAdminSettingsRevision = 19;
  window.mvpluxPublishedAdminSettingsSource = 'supabase-live';
  let handoffs = 0;
  window.mvpluxLiveAdminSettings = { categories: { sports: { key: 'sports' } }, recoveryBackup: { mustNotBeCopied: true } };
  window.mvpluxLiveAdminRevision = 31;
  window.mvpluxLiveAdminStateLoaded = true;
  let privateHandoffs = 0;
  const factory = new Function(
    'window', 'document', 'writePublicLiveNavigationCache', 'shouldUsePrivateAdminState', 'writePrivateAdminNavigationCache',
    `${code}; return normalizeFrontPageCategoryLinks;`
  );
  const normalize = factory(
    window,
    window.document,
    () => { handoffs += 1; },
    () => true,
    () => { privateHandoffs += 1; }
  );

  normalize();
  window.document.querySelector('#homepageCategoryGrid a').click();
  assert(handoffs === 1, 'the initially rendered Collection link must hand off the already-loaded snapshot');

  window.document.getElementById('homepageCategoryGrid').innerHTML = '<a href="movie-inspired.html">Movie Stars</a>';
  window.document.querySelector('#homepageCategoryGrid a').click();
  assert(handoffs === 2, 'a signed-in Admin/private-state rerender must not remove the fast navigation handoff');
  assert(privateHandoffs === 2, 'signed-in private preview navigation must hand off the already-loaded normalized Admin state');
});

Deno.test('signed-in Collection navigation paints cached private state before authenticated revalidation', () => {
  const cacheCode = sourceRange(storefrontSource, "const PUBLIC_LIVE_NAVIGATION_CACHE_KEY", '\n\nfunction usePublishedAdminSettings');
  const startup = sourceRange(storefrontSource, "document.addEventListener('DOMContentLoaded'", '\n});');
  assert(cacheCode.includes("const PRIVATE_ADMIN_NAVIGATION_KEYS = [")
    && cacheCode.includes("'categories'") && cacheCode.includes("'products'")
    && !cacheCode.includes("'adminArchitectureBackupVerificationV1'"),
  'the tab-only Admin handoff must contain storefront presentation records without recovery data');
  assert(startup.includes('const cachedPrivateAdminState = shouldLoadPrivateAdminState()')
    && startup.includes('window.mvpluxLiveAdminSettings = cachedPrivateAdminState.settings')
    && startup.indexOf('initializeCategoryShowroomExperience()') < startup.indexOf('await authStatePromise'),
  'cached private presentation must render before authentication and server revalidation can delay the page');
  assert(!startup.includes('deferInitialStorefrontPresentation'),
    'signed-in browsing must never deliberately keep the showroom behind a private-state loading shell');
});

Deno.test('public RPC exposes only activated live snapshot while drafts and table stay private', () => {
  assert(migrationSource.includes("coalesce(state_row.edits->>'liveContentEnabled', 'false') = 'true'"), 'public read must remain disabled until exact-baseline activation');
  assert(migrationSource.includes("'snapshot', state_row.edits->'lastPublishedSnapshot'"), 'public read may expose only lastPublishedSnapshot');
  for (const privateKey of ['products', 'categories', 'adminArchitectureMigrationV2', 'previousLiveSnapshot']) {
    const publicFunction = sourceRange(migrationSource, 'create or replace function public.get_public_site_snapshot', 'create or replace function public.activate_public_site_snapshot');
    assert(!publicFunction.includes(`edits->'${privateKey}'`), `public read must not expose private ${privateKey}`);
  }
  assert(migrationSource.includes('revoke all on function public.get_public_site_snapshot() from public')
    && migrationSource.includes('grant execute on function public.get_public_site_snapshot() to anon, authenticated'), 'only the narrow RPC—not site_edits—must be public');
  assert(!migrationSource.includes('grant select on public.site_edits to anon'), 'anonymous users must never receive direct site_edits access');
});

Deno.test('activation refuses an old database snapshot and live writes are atomic and Admin-only', () => {
  const activation = sourceRange(migrationSource, 'create or replace function public.activate_public_site_snapshot', 'create or replace function public.save_live_site_snapshot');
  const save = sourceRange(migrationSource, 'create or replace function public.save_live_site_snapshot', 'revoke all on function public.get_public_site_snapshot');
  assert(activation.includes("is distinct from p_expected_snapshot") && activation.includes('Stored live snapshot does not match'), 'activation must stop when static and database snapshots differ');
  assert(activation.includes('public.is_current_user_admin()') && save.includes('public.is_current_user_admin()'), 'activation and Save Live must require approved Admin access');
  assert(save.includes('for update') && save.includes('p_expected_revision') && save.includes('p_expected_live_revision'), 'Save Live must lock and revision-check the one authoritative record');
  assert(save.includes("'previousLiveSnapshot'") && save.includes("'lastPublishedSnapshot', p_snapshot"), 'failed/recovery-safe lifecycle must retain the previous public snapshot while replacing the one live snapshot');
});

Deno.test('Edge Function validates and verifies Save Live before reporting success without GitHub', () => {
  const save = sourceRange(edgeSource, 'async function saveLiveSnapshot', 'type PublishImageFile');
  const routing = sourceRange(edgeSource, "if (payload?.action === 'recovery-state')", "const token = requiredEnvironment('GITHUB_TOKEN')");
  assert(save.includes('validatePublishedSnapshot(payload.snapshot)'), 'Save Live must use the existing normalized publication validator');
  assert(save.includes('/rest/v1/rpc/save_live_site_snapshot') && save.includes('publicFingerprint !== fingerprint'), 'Edge Save Live must use the atomic RPC and verify the public projection');
  assert(routing.includes("payload?.action === 'save-live'") && routing.includes("payload?.action === 'verify-live-baseline'") && routing.includes("payload?.action === 'activate-live-content'"), 'Edge must expose guarded verify, activate, and save-live operations');
  assert(!routing.includes('GITHUB_TOKEN')
    && edgeSource.indexOf("payload?.action === 'save-live'") < edgeSource.indexOf("requiredEnvironment('GITHUB_TOKEN')"), 'ordinary Save Live must not require GitHub credentials or deployment');
});

Deno.test('Admin exposes individual and batch live saves while retaining static asset publishing', () => {
  for (const label of ['Save Live', 'Save All Live Changes', 'Publish Static Backup / New Assets']) {
    assert(adminHtml.includes(label) || adminSource.includes(label), `missing clear Admin action: ${label}`);
  }
  const individual = sourceRange(adminSource, 'async function publishSavedProductBySlug', 'async function publishExistingProductForm');
  const category = sourceRange(adminSource, 'async function publishCategoryByKey', 'async function saveCategoryProductAssignments');
  const all = sourceRange(adminSource, 'async function performSaveAllLiveChanges', 'async function saveAllLiveChanges');
  assert(individual.includes('saveLiveChangeIds([`product:${slug}`]'), 'Product Save Live must scope the existing normalized Product');
  assert(category.includes('saveCategoryEditForm') && category.includes('saveLiveChangeIds([`category:${categoryKey}`]'), 'Collection Save Live must save current form state before scoping the normalized Collection');
  assert(all.includes('saveAllOpenAdminChanges') && all.includes('architectureReviewItems()') && all.includes('savePublicLiveSnapshot'), 'Save All Live must flush dirty editors and perform one public snapshot write');
  assert(adminSource.includes("action: 'publish'"), 'the existing GitHub/static asset publisher must remain available for rollback and new files');
  const scopedSave = sourceRange(adminSource, 'async function performSaveLiveChangeIds', 'async function saveLiveChangeIds');
  const oneStepPreparation = sourceRange(adminSource, 'async function ensureNormalizedAdminArchitectureForLive', 'function newAdminArchitectureEnabled');
  assert(scopedSave.includes('ensureNormalizedAdminArchitectureForLive(report)'), 'Save Live must perform its required safety preparation in the same user action');
  assert(oneStepPreparation.includes('createAndVerifyAdminArchitectureBackup()'), 'one-step Save Live must create and verify the recovery checkpoint when it is missing');
  assert(oneStepPreparation.includes('checkpointExistingAdminArchitectureForBackup') && oneStepPreparation.includes('prepareAdminArchitectureMigrationExplicitly()'), 'one-step Save Live must safely reuse prepared normalized records or prepare them through the existing migration controller');
  assert(oneStepPreparation.includes('await setAdminArchitectureEnabled(true)') && scopedSave.includes('One-step Save Live safety preparation was blocked'), 'Save Live must use the guarded existing activation controller and stop cleanly when activation fails');
  assert(!scopedSave.includes("window.confirm('The normalized Admin system"), 'explicit Save Live must activate a verified normalized system without requiring a second confirmation');
  assert(!oneStepPreparation.includes('enabled: true'), 'Save Live must never bypass the guarded activation controller by setting the feature flag directly');
  assert(individual.includes('{ workingStateCurrent }'), 'Product Save Live must reuse the authoritative Product state instead of downloading it again');
  const existingProduct = sourceRange(adminSource, 'async function publishExistingProductForm', 'async function publishNewProductFromForm');
  assert(existingProduct.includes("approvalStatus: 'approved'") && !existingProduct.includes("'Draft saved privately.'"), 'Product Save Live must avoid a separate private-draft and approval round trip');
  const edgeLiveSave = sourceRange(edgeSource, 'async function saveLiveSnapshot', '\n\ntype PublishImageFile');
  const save = sourceRange(adminSource, 'async function savePublicLiveSnapshot', 'async function prepareArchitectureItemsForLive');
  assert(edgeLiveSave.includes('snapshot: _verifiedSnapshot') && edgeLiveSave.includes('return { ...metadata, snapshotFingerprint: fingerprint }'), 'Save Live must not return a duplicate full snapshot after the browser performs its public verification read');
  assert(save.includes("error?.code !== 'ADMIN_SAVE_LIVE_TIMEOUT'") && save.includes('verifyTimedOutAdminLiveSave(snapshot, report)'), 'a delayed Save Live response must verify the public customer state instead of hanging or blindly retrying the write');
});

Deno.test('Admin activation control verifies the deployed static baseline and public read-back', () => {
  assert(adminHtml.includes('id="activateFastLiveContent"') && adminHtml.includes('Activate Fast Live'), 'Advanced Admin must expose the one-time Fast Live activation control');
  const activation = sourceRange(adminSource, 'async function activateFastLiveContent', '\n\nasync function loadPublishedPublishBaseline');
  assert(activation.includes("action: 'verify-live-baseline'") && activation.includes("action: 'activate-live-content'"), 'activation must verify the exact static baseline before using the existing secure activation operation');
  assert(activation.indexOf("action: 'verify-live-baseline'") < activation.indexOf("action: 'activate-live-content'"), 'baseline verification must happen before activation');
  assert(activation.includes('loadStaticPublishedSnapshot()') && activation.includes('loadPublicLivePublishBaseline({ force: true })'), 'activation must compare the deployed static snapshot and verify through the customer public read path');
  assert(activation.includes('semanticValuesEqual(normalizePublishedBaseline(publicState.snapshot), normalizePublishedBaseline(staticSnapshot))'), 'activation must refuse to report success unless customer read-back exactly matches the static baseline');
  assert(activation.includes('ACTIVATION FAILED — WEBSITE NOT CHANGED') && activation.includes('FAST LIVE ACTIVATED'), 'activation must display unambiguous failure and success states');
  assert(adminSource.includes("document.getElementById('activateFastLiveContent')?.addEventListener('click', activateFastLiveContent)"), 'the activation button must call the single guarded controller');
});

Deno.test('Save Live rejects undeployed physical files but accepts repository image references as data', () => {
  const images = sourceRange(adminSource, 'async function undeployedLiveSnapshotImages', 'async function savePublicLiveSnapshot');
  const save = sourceRange(adminSource, 'async function savePublicLiveSnapshot', 'async function prepareArchitectureItemsForLive');
  assert(images.includes('repositoryImagePaths.has(path)') && images.includes('localOnlyImagePaths.has(path)'), 'live save must distinguish existing repository images from new physical files');
  assert(save.includes('New physical image file requires the static asset publisher'), 'new physical files must stay on the asset deployment path');
  assert(!save.includes("action: 'publish'"), 'ordinary live content saves must never create a GitHub publication');
});

Deno.test('Fast Live prepares normalized Product and Collection drafts in one protected batch', () => {
  const prepare = sourceRange(adminSource, 'async function prepareArchitectureItemsForLive', 'async function saveLiveChangeIds');
  assert(prepare.includes("const recordItems = pending.filter((item) => ['product', 'category'].includes(item.type))"), 'normalized records must be collected before preparation');
  assert(prepare.includes('saveAdminCollectionOperations(operations)'), 'all normalized records must use one revision-protected batch save');
  assert(!prepare.includes("for (const item of items.filter((entry) => !entry.approved))"), 'Fast Live must not prepare every normalized record through a separate request');
  const save = sourceRange(adminSource, 'async function performSaveLiveChangeIds', 'async function saveLiveChangeIds');
  assert(save.includes('workingStateCurrent = false'), 'a just-saved authoritative working state must be reusable without another fetch');
  assert(save.includes('if (selected.some((item) => !item.approved))'), 'already-ready Save Live changes must skip the preparation and second reload stages');
  const category = sourceRange(adminSource, 'async function publishCategoryByKey', 'async function saveCategoryProductAssignments');
  assert(category.includes("saveCategoryEditForm(form, 'approved'"), 'an intentional Main Collection Save Live must become ready in its original protected save');
  assert(category.includes('workingStateCurrent: Boolean(form)'), 'Main Collection Save Live must reuse the authoritative state returned by that save');
});

Deno.test('Admin allows only one Save Live workflow at a time and verifies a delayed write with backoff', () => {
  const gate = sourceRange(adminSource, 'async function runAdminSaveLiveOperation', 'async function verifyTimedOutAdminLiveSave');
  const verify = sourceRange(adminSource, 'async function verifyTimedOutAdminLiveSave', 'async function savePublicLiveSnapshot');
  const scopedWrapper = sourceRange(adminSource, 'async function saveLiveChangeIds', 'async function saveAllOpenAdminChanges');
  const allWrapper = sourceRange(adminSource, 'async function saveAllLiveChanges', 'function arrayBufferToBase64');
  assert(gate.includes('adminSaveLiveOperation') && gate.includes('SAVE ALREADY IN PROGRESS'), 'a second Save Live action in the same Admin tab must be rejected while the first is running');
  assert(gate.includes('readAdminSaveLiveLease()') && gate.includes('ANOTHER ADMIN TAB'), 'the Save Live lease must prevent overlapping writes from multiple Admin tabs');
  assert(gate.includes('setAdminSaveLiveControlsBusy(true)') && gate.includes('setAdminSaveLiveControlsBusy(false)'), 'all Save Live controls must stay disabled for the complete operation');
  assert(scopedWrapper.includes('runAdminSaveLiveOperation') && allWrapper.includes('runAdminSaveLiveOperation'), 'individual and batch Save Live actions must use the same gate');
  assert(verify.includes('const delays = [0, 2000, 5000, 10000]') && verify.includes('loadPublicLivePublishBaseline'), 'a timed-out write must use paced public read-back verification rather than immediately sending another write');
  assert(adminSource.includes('ADMIN_SAVE_LIVE_RETRY_COOLDOWN_MS = 30 * 1000'), 'an unresolved timed-out write must impose a retry cooldown');
});

Deno.test('Subcollection background batch control cannot submit its containing editor form', () => {
  assert(/<button type="button" class="admin-button admin-button-primary" data-apply-child-group-background-all>/.test(adminSource), 'the Subcollection apply-to-all control must remain an explicit non-submit button');
});

Deno.test('new physical images keep the existing static asset publisher after Fast Live optimization', () => {
  assert(adminHtml.includes('Publish Static Backup / New Assets'), 'Admin must retain the explicit new-asset publishing control');
  assert(adminSource.includes("action: 'publish'"), 'new physical image files must retain the existing GitHub publisher');
  assert(adminSource.includes('loadSelectedPublishImages(selectedImages)'), 'the static publisher must still load explicitly selected new image files');
  assert(adminSource.includes('New physical image file requires the static asset publisher'), 'Fast Live must continue directing undeployed physical images to the correct publisher');
});

Deno.test('all storefront pages carry the fast-live cache version and rollback checkpoint stays documented', async () => {
  const htmlFiles = [...Deno.readDirSync(new URL('..', import.meta.url))]
    .filter((entry) => entry.isFile && entry.name.endsWith('.html'))
    .map((entry) => entry.name);
  const scriptPages = [];
  for (const file of htmlFiles) {
    const html = await Deno.readTextFile(new URL(`../${file}`, import.meta.url));
    if (!html.includes('script.js?v=')) continue;
    scriptPages.push(file);
    assert(/script\.js\?v=2026\d+-[a-z0-9-]+/.test(html), `${file} must load a cache-versioned Supabase-first storefront bundle`);
  }
  assert(scriptPages.length >= 10, 'expected customer pages must be covered by the cache transition');
  assert(migrationSource.includes('Fast public content snapshots'), 'activation migration must remain identifiable and reviewable');
  assert(migrationSource.includes('b146bc7a0298b626453f3a245a8c7f04f756fd16'), 'pre-fast-publishing rollback checkpoint must remain documented');
});
