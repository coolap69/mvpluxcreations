import { Window } from 'npm:happy-dom@18.0.1';

const adminSource = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
const storefrontSource = await Deno.readTextFile(new URL('../script.js', import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceRange(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert(start >= 0 && end > start, `missing source range ${startToken}`);
  return source.slice(start, end);
}

Deno.test('Dashboard migration action writes only normalized private Main Collection records', async () => {
  const window = new Window({ url: 'https://mvpluxcreations.com/admin.html#categories' });
  window.document.body.innerHTML = '<p data-main-collection-migration-status></p>';
  const drafts = {
    people: { key: 'people', title: 'People', card: { image: 'images/people.png' }, draftStatus: 'draft', approvalStatus: 'draft' },
    custom: { key: 'custom', title: 'Custom', card: { image: '' }, draftStatus: 'draft', approvalStatus: 'draft' }
  };
  const operations = [];
  const messages = [];
  let rendered = 0;
  const implementation = sourceRange(adminSource, 'async function saveLegacyMainCollectionsAsDrafts', '\n\nfunction homepageOrderedAdminCategories');
  const migrate = new Function('document', 'dependencies', `
    const { mainCollectionMigrationDrafts, saveAdminCollectionOperations, renderCategoryManager, setStatus } = dependencies;
    let adminLastSaveError = '';
    ${implementation}
    return saveLegacyMainCollectionsAsDrafts;
  `)(window.document, {
    mainCollectionMigrationDrafts: () => structuredClone(drafts),
    saveAdminCollectionOperations: async (value) => { operations.push(...value); return { ok: true }; },
    renderCategoryManager: () => { rendered += 1; },
    setStatus: (message) => messages.push(message)
  });
  assert(await migrate(), 'migration should report success after the protected private save succeeds');
  assert(operations.length === 2 && operations.every((operation) => operation.collectionKey === 'categories' && operation.type === 'record'), 'migration may write only normalized categories records');
  assert(operations.every((operation) => operation.patch.approvalStatus === 'draft' && operation.patch.draftStatus === 'draft'), 'every migrated record must remain a private draft');
  assert(rendered === 1 && messages.at(-1).includes('published customer content') && messages.at(-1).includes('unchanged'), 'Dashboard must re-render and clearly explain that nothing was published');
  assert(!implementation.includes('callAdminPublisher') && !implementation.includes('publishCategoryByKey') && !implementation.includes("action: 'publish'"), 'the migration action must have no publication path');
});

Deno.test('legacy compatibility remains temporary, while a published normalized Main Collection is complete authority', () => {
  const compatibilitySource = sourceRange(storefrontSource, 'function compatibilityMasterCategories', '\n\nfunction getAdminCategories');
  const resolve = (published) => new Function('window', 'STOREFRONT_CATEGORY_CARD_MAP', 'STOREFRONT_CATEGORY_PAGE_MAP', `${compatibilitySource}\nreturn compatibilityMasterCategories;`)({
    MVPLUX_PRODUCT_CATEGORIES: [{ key: 'music', label: 'Music Artists', page: 'music-artists.html' }],
    mvpluxPublishedAdminSettings: published
  }, { 'music-artist-standee': 'music' }, { 'music-artist-standee': 'music-artists.html' })();
  const legacy = {
    deletedCategories: [], categories: {},
    categoryDisplayCards: {
      'music-artist-standee': {
        title: 'Legacy Music', description: 'Legacy description', cutoutImage: 'images/legacy.png',
        backgroundImage: 'images/legacy-stage.png', visible: true, productOrder: 8
      }
    }
  };
  const before = resolve(legacy).music;
  assert(before.card.image === 'images/legacy.png', 'recognized compatibility data may keep the customer card working before normalized publication');
  const normalized = {
    key: 'music', title: 'Normalized Music', description: '', page: 'music-artists.html', visible: true,
    homepageVisible: true, order: 2, card: { image: '', backgroundImage: '', representativeProductSlug: '' }, displaySettings: {}
  };
  const after = resolve({ ...legacy, categories: { music: normalized } }).music;
  assert(after.title === 'Normalized Music' && after.description === '' && after.order === 2, 'published normalized root fields must completely replace legacy title, description, and order');
  assert(after.card.image === '' && after.card.backgroundImage === '' && after.card.representativeProductSlug === '', 'legacy imagery or representative values may not fill empty normalized Homepage Collection Card fields');
  assert(Object.keys(after.displaySettings).length === 0, 'legacy display data may not fill normalized display settings');
});

Deno.test('migration controls identify legacy ownership and the intentionally empty Custom / Other image', () => {
  const markup = sourceRange(adminSource, 'function mainCollectionMigrationMarkup', '\n\nasync function saveLegacyMainCollectionsAsDrafts');
  assert(markup.includes('LEGACY HOMEPAGE CARD') && markup.includes('Needs Main Collection Migration'), 'Dashboard must identify compatibility-driven cards without calling them normalized published Main Collections');
  assert(markup.includes('No Homepage Collection Card Image Selected'), 'Dashboard must expose the intentionally empty Custom / Other image state');
  assert(markup.includes('Create Normalized Main Collection Drafts'), 'Dashboard must offer one explicit migration action');
  assert(markup.includes('creates no Products') && markup.includes('publishes nothing'), 'the migration explanation must state its safety boundary');
});
