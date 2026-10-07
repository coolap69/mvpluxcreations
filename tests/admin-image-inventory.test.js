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

Deno.test('live Image Inbox reads the public GitHub tree first and keeps the authenticated publisher as a read-only fallback', () => {
  const publicLoaderStart = adminSource.indexOf('async function loadPublicRepositoryImagePaths');
  const publicLoaderEnd = adminSource.indexOf('\n\nasync function loadImageDraftInventory', publicLoaderStart);
  const publicLoader = adminSource.slice(publicLoaderStart, publicLoaderEnd);
  const loadStart = adminSource.indexOf('async function loadImageDraftInventory');
  const loadEnd = adminSource.indexOf('\n\nfunction downloadAdminJson', loadStart);
  const loader = adminSource.slice(loadStart, loadEnd);
  assert(publicLoader.includes('PUBLIC_GITHUB_IMAGE_TREE_URL') && publicLoader.includes("entry?.type === 'blob'"), 'live Admin must discover every deployed repository image without requiring Supabase');
  assert(loader.indexOf('loadPublicRepositoryImagePaths()') < loader.indexOf("callAdminPublisher({ action: 'image-inventory' })"), 'the Supabase inventory action must be fallback-only');
  assert(loader.includes('The local image scanner is unavailable, so Admin is showing every deployed repository image.'), 'localhost must fall back to the complete deployed inventory instead of a tiny legacy list');
  assert(publisherSource.includes("payload?.action === 'image-inventory'"), 'publisher must expose the inventory action');
  assert(publisherSource.includes('repositoryImageInventory(token, owner, repo, branch)'), 'inventory must read the configured repository branch');
  const inventoryStart = publisherSource.indexOf('async function repositoryImageInventory');
  const inventoryEnd = publisherSource.indexOf('async function publishSnapshot', inventoryStart);
  const inventory = publisherSource.slice(inventoryStart, inventoryEnd);
  assert(!inventory.includes("method: 'POST'") && !inventory.includes("method: 'PATCH'"), 'inventory action must not write to GitHub');
});

Deno.test('Category image browsers exclude missing inventory paths and replace failed previews instead of showing broken images', () => {
  assert(adminSource.includes('function imageReferenceExistsInLoadedInventory') && adminSource.includes('imageReferenceExistsInLoadedInventory(path)'), 'Category pickers must filter references against the loaded local or GitHub inventory');
  assert(adminSource.includes("section.addEventListener('error'") && adminSource.includes('Image moved or unavailable — choose a replacement.'), 'broken Admin thumbnails and previews must become understandable replacement messages');
  assert(adminSource.includes("data-admin-image-role=\"sample\"") && adminSource.includes('No available sample standee image'), 'the shared-background sample must not display a broken image icon');
});

Deno.test('Category image browsers open in the relevant folder and close after choosing an image', () => {
  assert(adminSource.includes('function preferredCategoryImageFolder') && adminSource.includes("category.key === '__shared-collection-background__'"), 'image pickers must choose a relevant Collection folder and the shared editor must start in CardBackgrounds');
  assert(adminSource.includes("folder.value = ''") && adminSource.includes("picker.dataset.categoryFolderInitialized = 'true'"), 'All Images must remain an explicit user action');
  assert(adminSource.includes('Image selected. Choose Change Image to browse again.') && adminSource.includes('browser.open = false'), 'the repository gallery must close after an image is selected');
});

Deno.test('repository inventory hides legacy-folder duplicates when an organized image exists', () => {
  assert(adminSource.includes('const LEGACY_REPOSITORY_IMAGE_FOLDER') && adminSource.includes('function preferOrganizedRepositoryImagePaths'), 'Admin must have one reusable legacy-folder duplicate filter');
  assert(adminSource.includes('return preferOrganizedRepositoryImagePaths(paths);'), 'the complete GitHub inventory must prefer organized paths before rendering Image Inbox');
  assert(adminSource.includes('!LEGACY_REPOSITORY_IMAGE_FOLDER.test(relative) || !organizedNames.has(filename)'), 'unique legacy images must remain available when no organized filename exists');
});

Deno.test('new physical images remain on the static asset publisher while existing references can Save Live', () => {
  assert(adminSource.includes('saveLiveChangeIds([`product:${slug}`]'), 'normal Product updates must enter the fast live controller');
  assert(adminSource.includes('New physical image file requires the static asset publisher'), 'Save Live must reject undeployed physical image files');
  assert(adminSource.includes('items.map((item) => item.id)'), 'Publish All must pass every saved change id into one snapshot');
  assert(adminSource.includes('localOnlyImagePaths.has(path)'), 'local-only referenced images must be selected automatically');
  assert(adminSource.includes('const imageFiles = await loadSelectedPublishImages(selectedImages)'), 'selected local images must be sent with the snapshot');
  assert(publisherSource.includes("{ path: 'published-admin-settings.json'"), 'publisher must write the snapshot in its Git tree');
  assert(publisherSource.includes('...imageEntries'), 'publisher must place selected images in that same Git tree');
});
