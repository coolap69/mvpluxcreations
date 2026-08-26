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
  const code = sourceRange(storefrontSource, 'async function loadPublicLiveAdminSettings', '\n\nfunction getPublishedProducts');
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
  const all = sourceRange(adminSource, 'async function saveAllLiveChanges', 'function arrayBufferToBase64');
  assert(individual.includes('saveLiveChangeIds([`product:${slug}`]'), 'Product Save Live must scope the existing normalized Product');
  assert(category.includes('saveCategoryEditForm') && category.includes('saveLiveChangeIds([`category:${categoryKey}`]'), 'Collection Save Live must save current form state before scoping the normalized Collection');
  assert(all.includes('saveAllOpenAdminChanges') && all.includes('architectureReviewItems()') && all.includes('savePublicLiveSnapshot'), 'Save All Live must flush dirty editors and perform one public snapshot write');
  assert(adminSource.includes("action: 'publish'"), 'the existing GitHub/static asset publisher must remain available for rollback and new files');
});

Deno.test('Save Live rejects undeployed physical files but accepts repository image references as data', () => {
  const images = sourceRange(adminSource, 'async function undeployedLiveSnapshotImages', 'async function savePublicLiveSnapshot');
  const save = sourceRange(adminSource, 'async function savePublicLiveSnapshot', 'async function prepareArchitectureItemsForLive');
  assert(images.includes('repositoryImagePaths.has(path)') && images.includes('localOnlyImagePaths.has(path)'), 'live save must distinguish existing repository images from new physical files');
  assert(save.includes('New physical image file requires the static asset publisher'), 'new physical files must stay on the asset deployment path');
  assert(!save.includes("action: 'publish'"), 'ordinary live content saves must never create a GitHub publication');
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
    assert(html.includes('script.js?v=20260826-fast-live-content'), `${file} must load the Supabase-first storefront bundle`);
  }
  assert(scriptPages.length >= 10, 'expected customer pages must be covered by the cache transition');
  assert(migrationSource.includes('Fast public content snapshots'), 'activation migration must remain identifiable and reviewable');
  assert(migrationSource.includes('b146bc7a0298b626453f3a245a8c7f04f756fd16'), 'pre-fast-publishing rollback checkpoint must remain documented');
});
