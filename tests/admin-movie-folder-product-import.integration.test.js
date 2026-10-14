const root = new URL('..', import.meta.url);
const adminHtml = await Deno.readTextFile(new URL('admin.html', root));
const adminSource = await Deno.readTextFile(new URL('admin.js', root));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

Deno.test('Movie folder importer is a private Product workflow, not another Product store', () => {
  for (const text of ['Create Products From Movie Image Folders', 'One image folder belongs to one normalized Product', 'Import Selected as Private Drafts']) {
    assert(adminHtml.includes(text), `missing Movie folder importer guidance: ${text}`);
  }
  const start = adminSource.indexOf('async function importSelectedMovieFolderProducts');
  const end = adminSource.indexOf('\n\nfunction setupMovieFolderProductImporter', start);
  const source = adminSource.slice(start, end);
  assert(source.includes("collectionKey: 'products'") && source.includes('newProductRecordOperation(product)'), 'Movie folder import must use normalized Product record operations');
  assert(source.includes('saveAdminCollectionOperations(operations)'), 'Movie folder import must use the existing protected private save controller');
  assert(!source.includes('savePublicLiveSnapshot') && !source.includes('callAdminPublisher') && !source.includes('publishSavedProductBySlug'), 'Movie folder import must not publish automatically');
  assert(source.includes("visible: false") && source.includes("approvalStatus: 'draft'"), 'new folder Products must remain private and hidden for review');
});

Deno.test('Movie folder importer groups files into one Product with alternate image choices', () => {
  const groupStart = adminSource.indexOf('function movieProductFolderGroups');
  const groupEnd = adminSource.indexOf('\n\nfunction preferredMovieFolderMainImage', groupStart);
  const mainStart = groupEnd + 2;
  const mainEnd = adminSource.indexOf('\n\nfunction normalizedProductImageReferences', mainStart);
  const validatePublishImagePath = (path) => /\.(?:png|jpe?g|webp|gif|avif)$/i.test(path);
  const movieProductFolderGroups = new Function('validatePublishImagePath', `${adminSource.slice(groupStart, groupEnd)}; return movieProductFolderGroups;`)(validatePublishImagePath);
  const preferredMovieFolderMainImage = new Function(`${adminSource.slice(mainStart, mainEnd)}; return preferredMovieFolderMainImage;`)();
  const paths = [
    'images/Movie Stars/Movie Characters/Captain America/CAPTAINAnobackgroundpng.png',
    'images/Movie Stars/Movie Characters/Captain America/CAPTAbackground.png',
    'images/Movie Stars/Movie Characters/Captain America/CAPTAwhitebackground.png',
    'images/Movie Stars/Movie Characters/DoctorDoom/drdoom2nobackground.png',
    'images/CardBackgrounds/stage.jpg'
  ];
  const groups = movieProductFolderGroups(paths);
  assert(groups.length === 2, 'Movie files must group by their leaf Product folder and ignore non-Movie folders');
  const captain = groups.find((group) => group.folder.endsWith('/Captain America'));
  assert(captain?.images.length === 3, 'all Captain America variants must remain in one Product folder group');
  assert(preferredMovieFolderMainImage(captain.images).endsWith('CAPTAINAnobackgroundpng.png'), 'transparent/no-background variant should be the suggested main Product image');
  assert(captain.images.filter((image) => image !== preferredMovieFolderMainImage(captain.images)).length === 2, 'remaining folder images must be available as alternate choices');
});

Deno.test('ambiguous existing Movie Products require an explicit integration target instead of duplicating', () => {
  const renderStart = adminSource.indexOf('function renderMovieFolderProductImporter');
  const renderEnd = adminSource.indexOf('\n\nasync function importSelectedMovieFolderProducts', renderStart);
  const source = adminSource.slice(renderStart, renderEnd);
  assert(source.includes('row.matches.length > 1'), 'multiple Products using one folder must be detected as a conflict');
  assert(source.includes("conflict ? 'disabled'"), 'ambiguous folders must not be selectable for automatic import');
  assert(source.includes("Conflict: ${row.matches.join(', ')}"), 'the conflicting Product slugs must be shown to the Admin');
  assert(source.includes('data-movie-folder-existing-product'), 'a conflict must let the Admin choose the existing normalized Product to integrate');
});

Deno.test('Movie folder integration records durable ownership and rechecks current server state', () => {
  const matcherStart = adminSource.indexOf('function normalizedMovieProductFolder');
  const matcherEnd = adminSource.indexOf('\n\nfunction movieFolderCategoryAssignments', matcherStart);
  const matcherSource = adminSource.slice(matcherStart, matcherEnd);
  assert(matcherSource.includes('product?.repositoryImageFolder'), 'matching must prefer the durable Product folder identity');
  assert(matcherSource.includes('if (explicitOwners.length) return explicitOwners'), 'a claimed folder must not fall back to another Product image match');

  const importStart = adminSource.indexOf('async function importSelectedMovieFolderProducts');
  const importEnd = adminSource.indexOf('\n\nfunction setupMovieFolderProductImporter', importStart);
  const importSource = adminSource.slice(importStart, importEnd);
  assert(importSource.includes('fetchAuthoritativeAdminGlobal'), 'import must re-read authoritative normalized Products immediately before saving');
  assert(importSource.includes('latestMatches = group ? movieFolderMatchingProductSlugs'), 'import must repeat duplicate detection against the newest server state');
  assert(importSource.includes('repositoryImageFolder: normalizedMovieProductFolder(group.folder)'), 'existing Products must receive durable folder ownership');
  assert(importSource.includes('product.repositoryImageFolder = normalizedMovieProductFolder(group.folder)'), 'new Products must receive durable folder ownership');
  assert(importSource.includes('folder ownership changed on the server'), 'a concurrent ownership change must stop the import rather than create a duplicate');
});

Deno.test('durable Movie folder ownership wins over old overlapping image references', () => {
  const matcherStart = adminSource.indexOf('function normalizedMovieProductFolder');
  const matcherEnd = adminSource.indexOf('\n\nfunction movieFolderCategoryAssignments', matcherStart);
  const makeSlug = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const normalizedProductImageReferences = (product = {}) => [product.cutoutImage, ...(product.imageChoices || []).map((choice) => choice.image)].filter(Boolean);
  const helpers = new Function('makeSlug', 'normalizedProductImageReferences', `${adminSource.slice(matcherStart, matcherEnd)}; return { movieFolderMatchingProductSlugs };`)(makeSlug, normalizedProductImageReferences);
  const folder = 'images/Movie Stars/Movie Characters/Captain America';
  const products = {
    chosen: { repositoryImageFolder: folder, cutoutImage: `${folder}/chosen.png` },
    'old-duplicate': { cutoutImage: `${folder}/old.png` }
  };
  const matches = helpers.movieFolderMatchingProductSlugs(folder, products);
  assert(matches.length === 1 && matches[0] === 'chosen', 'the linked normalized Product must remain the single folder owner on later scans');
});
