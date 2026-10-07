import { Window } from 'npm:happy-dom@18.0.1';

const assert = (condition, message = 'Assertion failed') => { if (!condition) throw new Error(message); };

const root = new URL('../', import.meta.url);
const read = (path) => Deno.readTextFile(new URL(path, root));
const [admin, storefront, architecture, publisher, migration, supabaseConfig] = await Promise.all([
  read('admin.js'),
  read('script.js'),
  read('admin-architecture.js'),
  read('supabase/functions/publish-admin-changes/index.ts'),
  read('supabase/migrations/20261004120000_reduce_admin_state_egress.sql'),
  read('supabase-config.js')
]);

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, `Could not find source range ${start} -> ${end}`);
  return source.slice(from, to);
}

Deno.test('customer startup loads private admin-global only in explicit Admin editing context', () => {
  const startup = storefront.slice(storefront.indexOf("document.addEventListener('DOMContentLoaded'"));
  assert(startup.includes('const loadPrivateAdminState = shouldLoadPrivateAdminState()'));
  assert(startup.includes('if (loadPrivateAdminState) await loadLiveAdminSettings()'));
  assert(startup.includes('if (loadPrivateAdminState && isInlineAdminEditingEnabled())'));
});

Deno.test('normal working-state reads and saves never transfer the complete site_edits row', () => {
  const readWorking = between(publisher, 'async function readAdminWorkingState', 'async function saveAdminWorkingState');
  const saveWorking = between(publisher, 'async function saveAdminWorkingState', 'async function readAdminRecoveryState');
  assert(readWorking.includes('/rest/v1/rpc/get_admin_working_state'));
  assert(!readWorking.includes('/rest/v1/site_edits'));
  assert(saveWorking.includes('/rest/v1/rpc/save_admin_working_state'));
  assert(!saveWorking.includes('save_site_edits'));
});

Deno.test('routine Admin reads fail closed instead of downloading the full admin-global row', () => {
  const load = between(admin, 'async function loadAdminLiveSettings', 'async function ensureAdminWorkingCollections');
  assert(load.includes('The full admin-global record was not downloaded'));
  assert(!load.includes(".from('site_edits')"), 'initial Admin loading must never fall back to the multi-megabyte site_edits row');
  const authoritative = between(admin, 'async function fetchAuthoritativeAdminGlobal', 'function baseAdminProductForState');
  const keyedBranch = authoritative.slice(authoritative.indexOf('if (requestedKeys.length)'), authoritative.indexOf("const { data, error }"));
  assert(keyedBranch.includes('full admin-global record was not downloaded'));
  assert(keyedBranch.includes('throw new Error'), 'a failed reduced request must stop instead of silently using the large row');
  assert(!keyedBranch.includes(".from('site_edits')"));
});

Deno.test('routine Product and Image Box saves request only Product working-state keys', () => {
  const productPatch = between(admin, 'async function saveAdminProductFieldPatch', 'async function saveAdminProductFieldPatches');
  const newProduct = between(admin, 'async function saveNewProductFromForm', 'async function saveNewCategoryFromForm');
  const newCategory = between(admin, 'async function saveNewCategoryFromForm', 'function setupAdminCreationWorkspace');
  assert(productPatch.includes("fetchAuthoritativeAdminGlobal(['products', 'customProducts'])"));
  assert(newProduct.includes("fetchAuthoritativeAdminGlobal(['products', 'customProducts'])"));
  assert(newCategory.includes("fetchAuthoritativeAdminGlobal(['categories'])"));
});

Deno.test('high-frequency Collection and Product controls remain previews until explicit save', () => {
  assert(!admin.includes('scheduleCategoryLiveAutosave'));
  assert(!admin.includes('categoryLiveAutosaveTimers'));
  assert(!admin.includes('schedulePlacementSave'));
  assert(admin.includes('UNSAVED CHANGES — preview only until you choose Save Draft or Save Live.'));
});

Deno.test('deployment polling checks GitHub only and runs at a reduced interval', () => {
  const status = between(publisher, "if (payload?.action === 'deployment-status')", 'const initialAdminState');
  assert(!status.includes('readAdminGlobal'));
  assert(status.includes('deploymentResult(token, owner, repo, commitHash)'));
  assert(admin.includes('pollIntervalMs = 15000'));
});

Deno.test('recovery backup cannot recursively embed the previous admin-global backup', () => {
  const backup = between(architecture, 'export function buildMigrationBackup', 'export function buildNormalizedAdminCandidate');
  assert(backup.includes('adminArchitectureSource'));
  assert(backup.includes('delete safeGlobal[ADMIN_ARCHITECTURE_BACKUP_KEY]'));
});

Deno.test('reduced RPCs are authenticated Admin-only and preserve revision checks', () => {
  assert(migration.includes('create or replace function public.get_admin_working_state'));
  assert(migration.includes('create or replace function public.save_admin_working_state'));
  assert(migration.includes('public.is_current_user_admin()'));
  assert(migration.includes("p_expected_revision"));
  assert(migration.includes('revoke all on function public.get_admin_working_state(text[]) from public, anon, authenticated'));
  assert(migration.includes('grant execute on function public.get_admin_working_state(text[]) to authenticated'));
  assert(migration.includes('revoke all on function public.save_admin_working_state(jsonb,bigint) from public, anon, authenticated'));
});

Deno.test('Admin-only Supabase activity monitor reports every existing request without creating another request', async () => {
  const window = new Window({ url: 'https://mvpluxcreations.com/admin.html' });
  let networkRequests = 0;
  window.fetch = async () => {
    networkRequests += 1;
    return { ok: true, status: 200, headers: { get: () => '4096' } };
  };
  window.eval(supabaseConfig);
  await window.fetch('https://ncbddqxdinvcsoszdsxr.supabase.co/rest/v1/rpc/save_admin_working_state', {
    method: 'POST', body: '{}'
  });
  assert(networkRequests === 1, 'the monitor must not create a tracking request');
  assert(window.mvpluxSupabaseActivityLog.length === 2, 'one request must record sending and completion states');
  assert(window.mvpluxSupabaseActivityLog[0].state === 'sending');
  assert(window.mvpluxSupabaseActivityLog[1].state === 'success');
  assert(window.mvpluxSupabaseActivityLog[1].kind === 'WRITE');
  assert(window.mvpluxSupabaseActivityLog[1].usage === 'minimal' && window.mvpluxSupabaseActivityLog[1].responseBytes === 4096, 'the existing request report must classify actual response bytes');
  assert(window.document.getElementById('mvpluxSupabaseActivity')?.textContent.includes('MINIMAL USAGE'), 'Admin must see the successful green minimal-usage report');
  await window.fetch('https://mvpluxcreations.com/style.css');
  assert(networkRequests === 2 && window.mvpluxSupabaseActivityLog.length === 2, 'non-Supabase requests must pass through without activity entries');
});

Deno.test('Supabase monitor uses green, orange, and red response-size levels', async () => {
  const window = new Window({ url: 'https://mvpluxcreations.com/admin.html' });
  const sizes = [20 * 1024, 300 * 1024, 2 * 1024 * 1024];
  window.fetch = async () => ({ ok: true, status: 200, headers: { get: () => String(sizes.shift()) } });
  window.eval(supabaseConfig);
  const target = 'https://ncbddqxdinvcsoszdsxr.supabase.co/rest/v1/rpc/get_public_site_snapshot';
  for (const expected of ['minimal', 'medium', 'high']) {
    await window.fetch(target, { method: 'POST', body: '{}' });
    const monitor = window.document.getElementById('mvpluxSupabaseActivity');
    assert(monitor?.dataset.usage === expected, `expected ${expected} usage color`);
  }
  const reports = window.mvpluxSupabaseActivityLog.filter((entry) => entry.state === 'success');
  assert(reports.map((entry) => entry.usage).join(',') === 'minimal,medium,high');
});

Deno.test('Supabase monitor keeps high usage red and shows failed requests in purple', async () => {
  const window = new Window({ url: 'https://mvpluxcreations.com/admin.html' });
  window.fetch = async () => ({ ok: false, status: 503, headers: { get: () => '2097152' } });
  window.eval(supabaseConfig);
  await window.fetch('https://ncbddqxdinvcsoszdsxr.supabase.co/rest/v1/rpc/save_admin_working_state', { method: 'POST', body: '{}' });
  const monitor = window.document.getElementById('mvpluxSupabaseActivity');
  assert(monitor?.dataset.usage === 'failed', 'a failed request must use the separate purple state');
  assert(monitor?.textContent.includes('FAILED'));
  assert(supabaseConfig.includes('[data-usage="high"]') && supabaseConfig.includes('[data-usage="failed"]'), 'high usage and failure must retain separate red and purple selectors');
});
