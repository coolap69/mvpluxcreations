import {
  categoryDeletionBlockers,
  categoryHierarchyWarnings,
  categoryProductCounts,
  childCategories,
  childCategoryDefaults,
  deleteCategoriesFromState,
  filterProductsForCategoryGroup,
  findEquivalentCategories,
  withProductCategories
} from '../admin-state-utils.js';
import { normalizeCategories } from '../admin-architecture.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const categories = {
  sports: { key: 'sports', title: 'Sports', page: 'sports-legends.html', card: { image: 'images/sports.png' } },
  music: { key: 'music', title: 'Music Artists', page: 'music-artists.html', card: { image: 'images/music.png' } },
  empty: { key: 'empty', title: 'Empty', page: 'category.html?category=empty', card: { image: 'images/empty.png' } }
};
const products = {
  jordan: { slug: 'jordan', title: 'Jordan', cutoutImage: 'images/jordan.png', backgroundImage: 'images/stage.png', categories: ['sports'], categoryOrder: { sports: 0 } },
  crossover: { slug: 'crossover', title: 'Crossover', cutoutImage: 'images/crossover.png', categories: ['sports', 'music'], categoryOrder: { sports: 1, music: 2 } }
};

Deno.test('master Category records produce accurate product counts', () => {
  const counts = categoryProductCounts(categories, products);
  assert(counts.sports === 2 && counts.music === 1 && counts.empty === 0, 'counts must come from product categories[]');
});

Deno.test('assigning and removing Categories preserves the product and its images', () => {
  const assigned = withProductCategories(products.jordan, ['sports', 'music']);
  assert(assigned.categories.includes('music'), 'additional Category must be assigned');
  const removed = withProductCategories(assigned, ['music']);
  assert(!removed.categories.includes('sports') && removed.categories.includes('music'), 'only the selected assignment should be removed');
  assert(removed.slug === products.jordan.slug && removed.cutoutImage === products.jordan.cutoutImage && removed.backgroundImage === products.jordan.backgroundImage, 'product and image references must survive assignment changes');
});

Deno.test('single Category deletion removes assignments, card order, and fallback resurrection path', () => {
  const state = deleteCategoriesFromState({
    categories, products, homepageCategoryOrder: [['sport-legend-standee', 'music-category-card']],
    categoryCardMap: { 'sport-legend-standee': 'sports' }
  }, ['sports']);
  assert(!state.categories.sports && state.categories.music, 'only the selected Category record should be removed');
  assert(state.products.jordan.slug === 'jordan' && state.products.jordan.categories.length === 0, 'product must remain while assignment is removed');
  assert(state.products.jordan.cutoutImage === 'images/jordan.png', 'physical image reference must be preserved');
  assert(!state.products.crossover.categoryOrder.sports && state.products.crossover.categories.includes('music'), 'deleted Category order must be removed without affecting another assignment');
  assert(!state.homepageCategoryOrder.flat().includes('sport-legend-standee'), 'homepage card must be removed');
  assert(state.deletedCategories.includes('sports'), 'a tombstone must prevent fallback resurrection');
});

Deno.test('bulk Category deletion preserves every product record and image path', () => {
  const state = deleteCategoriesFromState({ categories, products }, ['sports', 'music']);
  assert(Object.keys(state.products).length === Object.keys(products).length, 'bulk deletion must preserve all products');
  assert(state.products.crossover.cutoutImage === products.crossover.cutoutImage, 'bulk deletion must preserve image references');
  assert(state.products.crossover.categories.length === 0 && Object.keys(state.products.crossover.categoryOrder).length === 0, 'all selected assignments and order entries must be removed');
});

Deno.test('deleted fallback Category stays deleted and can later be recreated', () => {
  const normalized = normalizeCategories({
    categoryDefinitions: [{ key: 'sports', label: 'Sports', page: 'sports-legends.html' }],
    deletedCategories: ['sports']
  });
  assert(!normalized.sports, 'fallback normalization must honor deleted Category tombstones');
  assert(findEquivalentCategories({}, categories.sports).length === 0, 'a properly deleted Category must be eligible for recreation');
});

Deno.test('duplicate detection checks key, normalized title, and route', () => {
  assert(findEquivalentCategories(categories, { key: 'SPORTS' }).length === 1, 'equivalent key must be detected');
  assert(findEquivalentCategories(categories, { title: 'Music--Artists' }).some((item) => item.key === 'music'), 'normalized title must be detected');
  assert(findEquivalentCategories(categories, { page: 'sports-legends.html?preview=1' }).some((item) => item.key === 'sports'), 'equivalent route must be detected');
});

Deno.test('Custom Other, Custom Photo, and Party Packs remain separate for the Admin to decide', async () => {
  const published = JSON.parse(await Deno.readTextFile(new URL('../published-admin-settings.json', import.meta.url))).snapshot;
  const assignments = Object.values(published.products || {}).flatMap((product) => product.categories || []);
  assert(assignments.filter((key) => key === 'custom-other').length === 6, 'the six Custom Other assignments must remain unchanged');
  assert(assignments.filter((key) => key === 'custom-photo').length === 0, 'Custom Photo must remain unassigned');
  assert(assignments.filter((key) => key === 'small-party-packs').length === 0, 'Party Packs must remain unassigned');
});

Deno.test('Admin Category manager exposes products, image selection, draft, preview, scoped publish, and deletion controls', async () => {
  const html = await Deno.readTextFile(new URL('../admin.html', import.meta.url));
  const source = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
  for (const token of ['Search Categories', 'Delete Selected Categories', 'adminCategoryBuilderMount']) assert(html.includes(token), `missing ${token}`);
  for (const token of ['Open Products', 'Delete Category', 'data-category-product', 'data-remove-product-category', 'data-category-image-picker', 'Save Draft', 'data-preview-category-edit', 'data-publish-category-edit']) assert(source.includes(token), `missing ${token}`);
  assert(source.includes('publishScopedChangeIds([`category:${key}`]'), 'Category publish must stay scoped');
  assert(source.includes('collectionKey: \'deletedCategories\''), 'Category deletion must persist a tombstone');
});

Deno.test('Category editor reuses authoritative AI assistance without saving or publishing', async () => {
  const source = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
  const editor = source.slice(source.indexOf('function categoryEditMarkup'), source.indexOf('function suspiciousCategoryKeys'));
  for (const token of ['Who or what is this?', 'Generate Title', 'Generate Description', 'Generate Fun Fact', 'Improve Existing Text', 'name="subjectIdentity"']) {
    assert(editor.includes(token), `Category editor is missing ${token}`);
  }
  assert(source.includes("identity: String(formData.get('subjectIdentity') || '')"), 'Category identity must use the existing secure AI request');
  assert(source.includes("existingCategory?.title"), 'current Category context must be sent to the existing assistant');
  assert(editor.includes('never save or publish automatically'), 'AI suggestions must remain review-only');
  assert(editor.indexOf('name="title"') < editor.indexOf('Generate Title'), 'AI actions should follow the editable Category text fields');
});

Deno.test('Category visual picker prioritizes assigned product images and searches the repository inventory', async () => {
  const source = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
  const picker = source.slice(source.indexOf('function repositoryCategoryImageLibrary'), source.indexOf('function categoryEditMarkup'));
  assert(picker.includes('categoryAssignedProducts(category.key)'), 'preferred images must come from products assigned to this Category');
  assert(picker.includes('product.cutoutImage') && picker.includes('product.imageChoices'), 'main and additional product images must be preferred');
  assert(picker.includes('repositoryImagePaths') && picker.includes('imageDraftInventory'), 'repository search must use the existing image inventory');
  assert(picker.includes('Shared default background'), 'background picker must support inherited shared background');
  assert(picker.includes('Search All Repository Images'), 'repository-wide search must be an explicit secondary action');
  assert(!picker.includes('<select'), 'Category image selection must not fall back to a giant native dropdown');
});

Deno.test('Category editor keeps background controls Advanced and uses a full visual layout', async () => {
  const source = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
  const editor = source.slice(source.indexOf('function categoryEditMarkup'), source.indexOf('function suspiciousCategoryKeys'));
  for (const section of ['Category Information', 'Category Image', 'Category Appearance', 'Category Settings', 'Advanced Display Settings']) {
    assert(editor.includes(section), `Category editor is missing ${section}`);
  }
  assert(editor.indexOf("categoryVisualImagePicker(category, 'background')") > editor.indexOf('Advanced Display Settings'), 'custom background selection must stay under Advanced');
  assert(editor.includes('data-category-edit-preview hidden'), 'Category Appearance must contain the large live preview');
  assert(!editor.includes('Standee size %'), 'legacy Standee Size wording must be absent from normal Category editing');
});

Deno.test('published Sports assignments remain the seven proven products', async () => {
  const published = JSON.parse(await Deno.readTextFile(new URL('../published-admin-settings.json', import.meta.url))).snapshot;
  const sports = Object.values(published.products || {})
    .filter((product) => (product.categories || []).includes('sports'))
    .map((product) => product.title)
    .sort();
  const expected = ['Kobe Bryant', 'Lionel Messi', 'Lionel Messi Classic', 'Michael Jordan', 'Michael Jordan Layup', "Shaquille O'Neal", 'Tom Brady'].sort();
  assert(JSON.stringify(sports) === JSON.stringify(expected), 'Sports assignments must remain unchanged until child groups are separately approved');
});

Deno.test('Category cards expose everyday visibility and confirmed Delete controls at the top', async () => {
  const source = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
  const manager = source.slice(source.indexOf('function renderCategoryManager'), source.indexOf('function updateDeleteSelectedCategoriesButton'));
  for (const token of ['Hide Category', 'Show Category', 'Hide from Homepage', 'Show on Homepage', 'Child Groups', 'data-delete-category']) {
    assert(manager.includes(token), `Category card is missing ${token}`);
  }
  assert(!manager.includes('admin-category-more-menu'), 'Delete Category must not require opening a More menu');
});

Deno.test('Hide and homepage visibility saves are narrow Category-only drafts', async () => {
  const source = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
  const visibility = source.slice(source.indexOf('async function saveCategoryVisibility'), source.indexOf('async function deleteAdminCategories'));
  assert(visibility.includes("['visible', 'homepageVisible']"), 'only the two Category visibility fields may be changed');
  assert(visibility.includes("collectionKey: 'categories'"), 'visibility must save through the Category collection');
  assert(visibility.includes("draftStatus: 'draft'") && visibility.includes("approvalStatus: 'draft'"), 'visibility must remain a private draft until publication');
  assert(!visibility.includes("collectionKey: 'products'") && !visibility.includes('withProductCategories'), 'Hide must not touch products or assignments');
  assert(visibility.includes('Products, assignments, and image files were preserved'), 'Admin confirmation must explain what Hide preserved');
});

Deno.test('Category hierarchy supports parentKey without creating child records', async () => {
  const normalized = normalizeCategories({
    categoryDefinitions: [{ key: 'sports', label: 'Sports' }],
    existingCategories: { basketball: { key: 'basketball', parentKey: 'sports', title: 'Basketball', homepageVisible: false } }
  });
  assert(normalized.basketball.parentKey === 'sports', 'child Category must retain its master parentKey');
  assert(normalized.basketball.homepageVisible === false, 'child homepage visibility must remain explicit');
  const source = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
  assert(source.includes("...(category.parentKey ? { parentKey: String(category.parentKey) } : {})"), 'published child Categories must retain a nonempty parentKey');
  assert(source.includes('categoryChildGroups(category.key, categoriesByKey).length'), 'master cards must calculate child-group counts');
});

Deno.test('hidden Categories are unavailable on Category pages while homepage visibility remains separate', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const dynamicPage = source.slice(source.indexOf('function setupDynamicCategoryPage'), source.indexOf('function renderNormalizedHomepageCategoryCards'));
  const managedPage = source.slice(source.indexOf('function renderManagedCategoryPageProducts'), source.indexOf('function renderGenericCategoryOptions'));
  assert(dynamicPage.includes('category.visible === false') && dynamicPage.includes('Category unavailable'), 'dynamic Category pages must respect Category visibility');
  assert(managedPage.includes("getAdminCategories()[category]?.visible === false"), 'existing Category pages must respect Category visibility');
  assert(source.includes('category.homepageVisible !== false'), 'homepage visibility must remain an independent setting');
});

Deno.test('Category image sizing rejects zero and storefront rendering uses the same safe range', async () => {
  const adminSource = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
  const storefrontSource = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  assert(adminSource.includes('CATEGORY_IMAGE_SIZE_MIN = 20') && adminSource.includes('CATEGORY_IMAGE_SIZE_MAX = 140'), 'Admin must expose a safe 20–140% range');
  assert(adminSource.includes('number < minimum') && adminSource.includes('CATEGORY_IMAGE_SIZE_DEFAULT = 63'), 'zero must resolve to the safe default instead of collapsing the image');
  assert(storefrontSource.includes('requestedSize >= 20 ? Math.min(140, requestedSize) : inheritedSize'), 'published Category cards must enforce the same nonzero size rule');
  assert(storefrontSource.includes('getShowroomStageBackground()'), 'blank Category backgrounds must inherit the shared showroom background');
});

Deno.test('existing categories array can filter Sports child groups without a sportType product field', () => {
  const sportsProducts = {
    kobe: { categories: ['sports', 'basketball'] },
    messi: { categories: ['sports', 'soccer'] },
    brady: { categories: ['sports', 'american-football'] }
  };
  const inGroup = (key) => Object.values(sportsProducts).filter((product) => product.categories.includes(key));
  assert(inGroup('sports').length === 3, 'master Sports must retain all Sports products');
  assert(inGroup('basketball').length === 1 && inGroup('soccer').length === 1 && inGroup('american-football').length === 1, 'each child group must filter independently');
});

Deno.test('parentKey hierarchy returns ordered Child Groups', () => {
  const hierarchy = {
    sports: { key: 'sports', title: 'Sports' },
    soccer: { key: 'soccer', title: 'Soccer', parentKey: 'sports', order: 2 },
    basketball: { key: 'basketball', title: 'Basketball', parentKey: 'sports', order: 1 },
    terminator: { key: 'terminator', title: 'Terminator', parentKey: 'movie-characters', order: 1 }
  };
  assert(childCategories(hierarchy, 'sports').map((child) => child.key).join(',') === 'basketball,soccer', 'Child Groups must derive from parentKey and use sibling order');
});

Deno.test('new Child Group defaults never create a homepage card', () => {
  const child = childCategoryDefaults('sports', { key: 'basketball', title: 'Basketball', homepageVisible: true, card: { visible: true } });
  assert(child.parentKey === 'sports', 'Child Group must retain its Main Category');
  assert(child.homepageVisible === false && child.card.visible === false, 'Child Group homepage visibility must default off');
});

Deno.test('Child Group filtering requires both master and child assignments', () => {
  const fixture = {
    kobe: { slug: 'kobe', visible: true, categories: ['sports', 'basketball'] },
    messi: { slug: 'messi', visible: true, categories: ['sports', 'soccer'] },
    invalid: { slug: 'invalid', visible: true, categories: ['basketball'] },
    hidden: { slug: 'hidden', visible: false, categories: ['sports', 'basketball'] }
  };
  assert(filterProductsForCategoryGroup(fixture, 'sports').map((product) => product.slug).join(',') === 'kobe,messi', 'All must show visible master products');
  assert(filterProductsForCategoryGroup(fixture, 'sports', 'basketball').map((product) => product.slug).join(',') === 'kobe', 'Child filter must require master and child keys');
});

Deno.test('customer Child Group URLs are linkable and support Back and Forward', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const framework = source.slice(source.indexOf('function visibleCategoryChildGroups'), source.indexOf('function renderManagedCategoryPageProducts'));
  assert(framework.includes("searchParams.set('group', groupKey)"), 'Child Group link must write the group query parameter');
  assert(framework.includes('window.history.pushState'), 'Child Group selection must update the URL without a separate HTML file');
  assert(framework.includes("window.addEventListener('popstate'"), 'Back and Forward must rerender the selected Child Group');
});

Deno.test('hidden Child Groups are excluded from filters and direct group URLs become unavailable', async () => {
  const hierarchy = {
    sports: { key: 'sports' },
    basketball: { key: 'basketball', parentKey: 'sports', visible: false },
    soccer: { key: 'soccer', parentKey: 'sports', visible: true }
  };
  assert(childCategories(hierarchy, 'sports', { includeHidden: false }).map((child) => child.key).join(',') === 'soccer', 'hidden Child Group must not appear in customer filters');
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  assert(source.includes('unavailable: Boolean(requestedKey && !activeChild)') && source.includes('This Child Group is not available.'), 'hidden or unknown direct group URLs must be unavailable');
});

Deno.test('Child Group product results deduplicate by slug', () => {
  const fixture = {
    first: { slug: 'same', visible: true, categories: ['sports', 'basketball'] },
    duplicate: { slug: 'same', visible: true, categories: ['sports', 'basketball'] }
  };
  assert(filterProductsForCategoryGroup(fixture, 'sports', 'basketball').length === 1, 'the same product slug must render once');
});

Deno.test('child assignment requires its master and is never silently repaired', () => {
  const hierarchy = {
    sports: { key: 'sports' },
    basketball: { key: 'basketball', parentKey: 'sports' }
  };
  const invalid = { jordan: { slug: 'jordan', categories: ['basketball'] } };
  const before = JSON.stringify(invalid);
  const warnings = categoryHierarchyWarnings(hierarchy, invalid);
  assert(warnings.some((warning) => warning.type === 'missing-master-assignment' && warning.parentKey === 'sports'), 'missing master assignment must produce a warning');
  assert(JSON.stringify(invalid) === before && invalid.jordan.categories.join(',') === 'basketball', 'validation must not add the master assignment automatically');
});

Deno.test('secure publisher rejects invalid hierarchy instead of repairing it', async () => {
  const source = await Deno.readTextFile(new URL('../supabase/functions/publish-admin-changes/index.ts', import.meta.url));
  assert(source.includes('INVALID_CATEGORY_PARENT') && source.includes('CATEGORY_PARENT_CYCLE'), 'publisher must reject missing parents and hierarchy cycles');
  assert(source.includes('MISSING_MASTER_CATEGORY') && source.includes('!assignments.has(parentKey)'), 'publisher must reject a Child Group assignment without its Main Category');
  assert(!source.includes('assignments.add(parentKey)'), 'publisher must never silently repair an invalid assignment');
});

Deno.test('master permanent deletion is blocked while Child Groups exist', async () => {
  const hierarchy = {
    sports: { key: 'sports' },
    basketball: { key: 'basketball', title: 'Basketball', parentKey: 'sports' }
  };
  assert(categoryDeletionBlockers(hierarchy, ['sports']).some((blocker) => blocker.childKey === 'basketball'), 'Main Category deletion must report its Child Group blocker');
  const source = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
  assert(source.includes('Permanent Delete blocked') && source.includes('No cascading deletion was performed'), 'Admin must refuse automatic cascading deletion');
});

Deno.test('duplicate detection is sibling-aware while allowing the same title under another master', () => {
  const hierarchy = {
    sportsLegends: { key: 'sports-legends', title: 'Legends', parentKey: 'sports' },
    movieLegends: { key: 'movie-legends', title: 'Legends', parentKey: 'movie-characters' }
  };
  const sibling = findEquivalentCategories(hierarchy, { key: 'new-sports-legends', title: 'Legends', parentKey: 'sports' });
  const otherMaster = findEquivalentCategories(hierarchy, { key: 'music-legends', title: 'Legends', parentKey: 'music-artists' });
  assert(sibling.some((category) => category.key === 'sports-legends'), 'duplicate title under the same Main Category must be detected');
  assert(otherMaster.length === 0, 'same Child Group title under a different Main Category must be allowed when keys differ');
});

Deno.test('Admin renders compact Child Group rows without enabling creation', async () => {
  const source = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
  const markup = source.slice(source.indexOf('function childGroupMarkup'), source.indexOf('const CATEGORY_IMAGE_SIZE_DEFAULT'));
  for (const token of ['Child Groups', 'admin-child-group-row', 'Open Products', 'Edit Child Group', 'data-toggle-child-group', '+ Add Child Group']) assert(markup.includes(token), `missing Child Group UI token ${token}`);
  assert(markup.includes('data-add-child-group') && markup.includes('disabled'), 'Add Child Group must remain disabled while no real records may be created');
});

Deno.test('homepage is generated from master Categories and filters hidden or deleted Categories', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const renderer = source.slice(source.indexOf('function renderNormalizedHomepageCategoryCards'), source.indexOf('function managedCategoryCardMarkup'));
  assert(renderer.includes('Object.values(getAdminCategories())'), 'homepage must read the master Category collection');
  assert(renderer.includes('category.homepageVisible !== false'), 'homepage visibility must belong to the Category');
  assert(renderer.includes("grids.forEach((grid) => { grid.innerHTML = ''; })"), 'hard-coded cards must stop acting as a parallel source once master Categories load');
  assert(source.includes('published.deletedCategories') && source.includes('deleted.has(key)'), 'storefront compatibility fallback must honor deletion tombstones');
});
