const root = new URL('..', import.meta.url);
const adminHtml = await Deno.readTextFile(new URL('admin.html', root));
const adminSource = await Deno.readTextFile(new URL('admin.js', root));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

Deno.test('organized folder importer uses one normalized private Product workflow for every Main Collection', () => {
  for (const text of ['Create Products From Organized Image Folders', 'Choose a Main Collection', 'Import Selected as Private Drafts']) {
    assert(adminHtml.includes(text), `missing collection folder importer guidance: ${text}`);
  }
  assert(adminHtml.includes('data-folder-import-collection'), 'folder import must expose a Main Collection dropdown');
  const start = adminSource.indexOf('async function importSelectedCollectionFolderProducts');
  const end = adminSource.indexOf('\n\nfunction setupCollectionFolderProductImporter', start);
  const source = adminSource.slice(start, end);
  assert(source.includes("collectionKey: 'products'") && source.includes('newProductRecordOperation(product)'), 'folder import must use normalized Product record operations');
  assert(source.includes('saveAdminCollectionOperations(operations)'), 'folder import must use the existing protected private save controller');
  assert(!source.includes('savePublicLiveSnapshot') && !source.includes('callAdminPublisher') && !source.includes('publishSavedProductBySlug'), 'folder import must not publish automatically');
  assert(source.includes("visible: false") && source.includes("approvalStatus: 'draft'"), 'new folder Products must remain private and hidden for review');
  assert(source.includes('collectionFolderCategoryAssignments(group.folder, categoryKey, categories)'), 'new Products must use the Main Collection selected in the dropdown');
  assert(source.includes("categories: [...new Set([...(existing.categories || []), ...folderAssignments])]"), 'integrating an existing Product must add the explicitly selected Collection assignment without removing its other assignments');
});

Deno.test('collection folder dropdown remains complete when normalized Main Collections are only partially migrated', () => {
  const helperStart = adminSource.indexOf('function collectionFolderImportDefinitions');
  const helperEnd = adminSource.indexOf('\n\nfunction selectedCollectionFolderImportKey', helperStart);
  const helperSource = adminSource.slice(helperStart, helperEnd);
  assert(helperSource.includes('Object.keys(COLLECTION_PRODUCT_IMAGE_FOLDERS)'), 'dropdown must begin with every supported repository Collection folder');
  assert(helperSource.includes('adminArchitectureState?.candidate?.categories'), 'normalized and compatibility Collection titles should be reused when available');
  assert(helperSource.includes('readAdminCategories()'), 'private normalized titles must win when a Main Collection has been migrated');

  const setupStart = adminSource.indexOf('function setupCollectionFolderProductImporter');
  const setupEnd = adminSource.indexOf('\n\nfunction productVisualOptionsMarkup', setupStart);
  const setupSource = adminSource.slice(setupStart, setupEnd);
  assert(setupSource.includes('const definitions = collectionFolderImportDefinitions()'), 'dropdown setup must use the complete merged definition list');
  assert(!setupSource.includes('categoryDefinitionsForAdmin().filter'), 'a partial normalized collection map must not reduce the dropdown to Movies only');
});

Deno.test('collection folder importer groups Movie and Sports files into one Product with alternate choices', () => {
  const groupStart = adminSource.indexOf('const COLLECTION_PRODUCT_IMAGE_FOLDERS');
  const groupEnd = adminSource.indexOf('\n\nfunction preferredCollectionFolderMainImage', groupStart);
  const mainStart = groupEnd + 2;
  const mainEnd = adminSource.indexOf('\n\nfunction normalizedProductImageReferences', mainStart);
  const validatePublishImagePath = (path) => /\.(?:png|jpe?g|webp|gif|avif)$/i.test(path);
  const helpers = new Function('validatePublishImagePath', `${adminSource.slice(groupStart, groupEnd)}; return { collectionProductFolderGroups };`)(validatePublishImagePath);
  const preferredCollectionFolderMainImage = new Function(`${adminSource.slice(mainStart, mainEnd)}; return preferredCollectionFolderMainImage;`)();
  const paths = [
    'images/Movie Stars/Movie Characters/Captain America/CAPTAINAnobackgroundpng.png',
    'images/Movie Stars/Movie Characters/Captain America/CAPTAbackground.png',
    'images/Movie Stars/Movie Characters/Captain America/CAPTAwhitebackground.png',
    'images/Sport Legends/Football/TomBrady/TB12Nobackground.png',
    'images/Sport Legends/Football/TomBrady/TB12white.png',
    'images/CardBackgrounds/stage.jpg'
  ];
  const movies = helpers.collectionProductFolderGroups(paths, 'movie-characters');
  const sports = helpers.collectionProductFolderGroups(paths, 'sports');
  assert(movies.length === 1 && sports.length === 1, 'the dropdown selection must isolate the chosen Main Collection folder');
  const captain = movies[0];
  assert(captain.images.length === 3, 'all Captain America variants must remain in one Product folder group');
  assert(preferredCollectionFolderMainImage(captain.images).endsWith('CAPTAINAnobackgroundpng.png'), 'transparent/no-background variant should be the suggested main Product image');
  assert(sports[0].images.length === 2, 'the same grouping architecture must work outside Movies');
});

Deno.test('ambiguous existing Products require an explicit integration target instead of duplicating', () => {
  const renderStart = adminSource.indexOf('function renderCollectionFolderProductImporter');
  const renderEnd = adminSource.indexOf('\n\nasync function importSelectedCollectionFolderProducts', renderStart);
  const source = adminSource.slice(renderStart, renderEnd);
  assert(source.includes('row.matches.length > 1'), 'multiple Products using one folder must be detected as a conflict');
  assert(source.includes("conflict ? 'disabled'"), 'ambiguous folders must not be selectable for automatic import');
  assert(source.includes("Conflict: ${row.matches.join(', ')}"), 'the conflicting Product slugs must be shown to the Admin');
  assert(source.includes('data-collection-folder-existing-product'), 'a conflict must let the Admin choose the existing normalized Product to integrate');

  const setupStart = adminSource.indexOf('function setupCollectionFolderProductImporter');
  const setupEnd = adminSource.indexOf('\n\nfunction productVisualOptionsMarkup', setupStart);
  const setupSource = adminSource.slice(setupStart, setupEnd);
  assert(setupSource.includes("row.dataset.folderConflict = event.target.value ? 'resolved' : 'true'"), 'choosing the Product owner must resolve the conflict so the selected folder can be imported');
  assert(setupSource.includes('checkbox.checked = Boolean(event.target.value)'), 'the resolved folder must become intentionally selected for integration');
});

Deno.test('collection folder integration records durable ownership and rechecks current server state', () => {
  const matcherStart = adminSource.indexOf('function normalizedProductFolder');
  const matcherEnd = adminSource.indexOf('\n\nfunction collectionFolderCategoryAssignments', matcherStart);
  const matcherSource = adminSource.slice(matcherStart, matcherEnd);
  assert(matcherSource.includes('product?.repositoryImageFolder'), 'matching must prefer the durable Product folder identity');
  assert(matcherSource.includes('if (explicitOwners.length) return explicitOwners'), 'a claimed folder must not fall back to another Product image match');

  const importStart = adminSource.indexOf('async function importSelectedCollectionFolderProducts');
  const importEnd = adminSource.indexOf('\n\nfunction setupCollectionFolderProductImporter', importStart);
  const importSource = adminSource.slice(importStart, importEnd);
  assert(importSource.includes('fetchAuthoritativeAdminGlobal'), 'import must re-read authoritative normalized Products immediately before saving');
  assert(importSource.includes('latestMatches = group ? collectionFolderMatchingProductSlugs'), 'import must repeat duplicate detection against the newest server state');
  assert(importSource.includes('repositoryImageFolder: normalizedProductFolder(group.folder)'), 'existing Products must receive durable folder ownership');
  assert(importSource.includes('product.repositoryImageFolder = normalizedProductFolder(group.folder)'), 'new Products must receive durable folder ownership');
  assert(importSource.includes('folder ownership changed on the server'), 'a concurrent ownership change must stop the import rather than create a duplicate');
});

Deno.test('durable collection folder ownership wins over old overlapping image references', () => {
  const matcherStart = adminSource.indexOf('function normalizedProductFolder');
  const matcherEnd = adminSource.indexOf('\n\nfunction collectionFolderCategoryAssignments', matcherStart);
  const makeSlug = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const normalizedProductImageReferences = (product = {}) => [product.cutoutImage, ...(product.imageChoices || []).map((choice) => choice.image)].filter(Boolean);
  const helpers = new Function('makeSlug', 'normalizedProductImageReferences', `${adminSource.slice(matcherStart, matcherEnd)}; return { collectionFolderMatchingProductSlugs };`)(makeSlug, normalizedProductImageReferences);
  const folder = 'images/Movie Stars/Movie Characters/Captain America';
  const products = {
    chosen: { repositoryImageFolder: folder, cutoutImage: `${folder}/chosen.png` },
    'old-duplicate': { cutoutImage: `${folder}/old.png` }
  };
  const matches = helpers.collectionFolderMatchingProductSlugs(folder, products);
  assert(matches.length === 1 && matches[0] === 'chosen', 'the linked normalized Product must remain the single folder owner on later scans');
});

Deno.test('already-linked folders stay out of Product creation and new files appear as revisions', () => {
  const rowsStart = adminSource.indexOf('function collectionFolderProductImportRows');
  const rowsEnd = adminSource.indexOf('\n\nfunction setCollectionFolderImportStatus', rowsStart);
  const rowsSource = adminSource.slice(rowsStart, rowsEnd);
  assert(rowsSource.includes("? 'revision'") && rowsSource.includes(": 'synced'"), 'folder rows must distinguish later image revisions from fully synchronized Product folders');
  assert(rowsSource.includes('group.images.filter((image) => !existingReferences.has(image))'), 'revision detection must compare repository images with the Product normalized image references');

  const renderStart = adminSource.indexOf('function renderCollectionFolderProductImporter');
  const renderEnd = adminSource.indexOf('\n\nasync function importSelectedCollectionFolderProducts', renderStart);
  const renderSource = adminSource.slice(renderStart, renderEnd);
  assert(renderSource.includes("row.importKind === 'new' || row.importKind === 'conflict'"), 'the creation list must contain only genuinely new or unresolved folders');
  assert(renderSource.includes("row.importKind === 'revision'"), 'new files in owned folders must have a separate revisions section');
  assert(renderSource.includes('Product Image Revisions'), 'the Admin must clearly label the optional revision workflow');
  assert(renderSource.includes('up to date and hidden from this list'), 'fully synchronized folders must not keep reappearing as work to do');

  const setupStart = adminSource.indexOf('function setupCollectionFolderProductImporter');
  const setupEnd = adminSource.indexOf('\n\nfunction productVisualOptionsMarkup', setupStart);
  const setupSource = adminSource.slice(setupStart, setupEnd);
  assert(setupSource.includes('[data-folder-import-kind="new"]'), 'Select Safe Folders must not automatically select Product revisions');
});
