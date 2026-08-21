const assert = (condition, message) => { if (!condition) throw new Error(message); };

const adminSource = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
const localServerSource = await Deno.readTextFile(new URL('../serve-local-admin.py', import.meta.url));
const publisherSource = await Deno.readTextFile(new URL('../supabase/functions/publish-admin-changes/index.ts', import.meta.url));

Deno.test('local Image Inbox scans images without writing an inventory file', () => {
  assert(localServerSource.includes('IMAGE_ROOT.rglob("*")'), 'local server must scan images recursively');
  assert(localServerSource.includes('["git", "ls-tree", "-r", "--name-only", "origin/main"'), 'local server must distinguish images already on origin/main');
  assert(localServerSource.includes('"newImages"'), 'local endpoint must report local-only image paths');
  assert(!localServerSource.includes('write_text') && !localServerSource.includes('write_bytes'), 'inventory server must remain read-only');
  assert(adminSource.includes("fetch('/api/local-image-inventory'"), 'local Admin must use the local inventory endpoint');
});

Deno.test('live Image Inbox uses the authenticated publisher only for a read-only GitHub tree inventory', () => {
  assert(adminSource.includes("callAdminPublisher({ action: 'image-inventory' })"), 'live Admin must use authenticated inventory');
  assert(publisherSource.includes("payload?.action === 'image-inventory'"), 'publisher must expose the inventory action');
  assert(publisherSource.includes('repositoryImageInventory(token, owner, repo, branch)'), 'inventory must read the configured repository branch');
  const inventoryStart = publisherSource.indexOf('async function repositoryImageInventory');
  const inventoryEnd = publisherSource.indexOf('async function publishSnapshot', inventoryStart);
  const inventory = publisherSource.slice(inventoryStart, inventoryEnd);
  assert(!inventory.includes("method: 'POST'") && !inventory.includes("method: 'PATCH'"), 'inventory action must not write to GitHub');
});

Deno.test('scoped product publishing includes local-only images in the same secure commit', () => {
  assert(adminSource.includes('publishScopedChangeIds([`product:${slug}`]'), 'product publish must select only its own change id');
  assert(adminSource.includes('localOnlyImagePaths.has(path)'), 'local-only referenced images must be selected automatically');
  assert(adminSource.includes('const imageFiles = await loadSelectedPublishImages(selectedImages)'), 'selected local images must be sent with the snapshot');
  assert(publisherSource.includes("{ path: 'published-admin-settings.json'"), 'publisher must write the snapshot in its Git tree');
  assert(publisherSource.includes('...imageEntries'), 'publisher must place selected images in that same Git tree');
});
