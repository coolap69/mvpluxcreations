const assert = (condition, message = 'Assertion failed') => { if (!condition) throw new Error(message); };

const root = new URL('../', import.meta.url);
const read = (path) => Deno.readTextFile(new URL(path, root));
const [admin, storefront, architecture, publisher, migration] = await Promise.all([
  read('admin.js'),
  read('script.js'),
  read('admin-architecture.js'),
  read('supabase/functions/publish-admin-changes/index.ts'),
  read('supabase/migrations/20261004120000_reduce_admin_state_egress.sql')
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
