import { Window } from 'npm:happy-dom@18.0.1';
import { buildMainCollectionMigrationDrafts, normalizeCategories } from '../admin-architecture.js';

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

Deno.test('legacy-only homepage cards appear in Collections and can become individually editable', async () => {
  const migrationDrafts = sourceRange(adminSource, 'function mainCollectionMigrationDrafts', '\n\nfunction mainCollectionMigrationMarkup');
  assert(migrationDrafts.includes('adminArchitecture.normalizeCategories') && migrationDrafts.includes('publishedCategoryCards: adminPublishedBaseline?.categoryDisplayCards'), 'Admin must derive compatibility-only rows from the same published legacy card source that creates the homepage cards');
  assert(migrationDrafts.includes('categoryDefinitions: window.MVPLUX_PRODUCT_CATEGORIES') && migrationDrafts.includes('categoryCardMap: ADMIN_CATEGORY_CARD_MAP'), 'Admin must include recognized collection definitions and mappings without treating arbitrary Products as Collections');
  assert(!migrationDrafts.includes('candidateCategories: adminArchitectureState?.candidate?.categories'), 'the visible compatibility rows must not depend on the stale architecture candidate cache');

  const definitions = [
    'sports', 'movie-characters', 'people-public-figures', 'music-artists', 'faith-celebration',
    'holiday', 'dinosaur-animal', 'fan-requests', 'video-game-fantasy', 'custom-other'
  ].map((key) => ({ key, label: key }));
  const map = {
    'custom-photo-standee': 'custom-photo',
    'small-standee-party-pack': 'small-party-packs'
  };
  const publishedCards = {
    'custom-photo-standee': { slug: 'custom-photo-standee', title: 'Custom Photo Standees', cutoutImage: 'images/custom.png' },
    'small-standee-party-pack': { slug: 'small-standee-party-pack', title: 'Party Pack Standees', cutoutImage: 'images/party.png' }
  };
  const compatibility = normalizeCategories({
    categoryDefinitions: definitions,
    categoryCardDefaults: Object.values(publishedCards),
    publishedCategoryCards: publishedCards,
    categoryCardMap: map
  });
  const privateCategories = Object.fromEntries(definitions.map(({ key, label }) => [key, { key, title: label }]));
  const missing = buildMainCollectionMigrationDrafts({
    candidateCategories: compatibility,
    privateCategories,
    allowedKeys: [...definitions.map(({ key }) => key), 'custom-photo', 'small-party-packs']
  });
  assert(Object.keys(compatibility).length === 12, 'the live-style compatibility set must contain the ten Admin Collections plus both extra homepage cards');
  assert(Object.keys(missing).sort().join(',') === 'custom-photo,small-party-packs', 'the two extra homepage cards must become the two manageable Collections rows');

  const render = sourceRange(adminSource, 'function renderCategoryManager', '\n\nfunction updateDeleteSelectedCategoriesButton');
  assert(render.includes('{ ...legacyMigrationDrafts, ...normalizedCategories }'), 'Collections must list compatibility-only Homepage Collection Cards beside normalized Main Collections');
  assert(render.includes('LEGACY HOMEPAGE CARD · MAKE EDITABLE FIRST'), 'legacy-only rows must clearly identify their compatibility ownership');
  assert(render.includes('data-category-homepage-checkbox') && render.includes('Show on Homepage'), 'every Main Collection row must provide one simple homepage visibility checkbox');
  assert(render.includes('data-category-visible-checkbox') && render.includes('Collection Available'), 'the old Hide/Unhide Collection button must be replaced by a second clearly labeled checkbox');
  assert(!render.includes('UNHIDE COLLECTION') && !render.includes('Hide Collection</button>'), 'Collections must not retain competing Hide/Unhide buttons beside the checkboxes');
  assert(render.includes('Edit Main Collection creates its normalized draft and opens the editor here in one step.'), 'legacy cards must explain the one-step editing behavior');
  assert(render.indexOf('data-category-edit-panel') < render.indexOf('data-category-products-panel'), 'the Main Collection editor must appear directly below its Collection row instead of below the Product list');

  const events = sourceRange(adminSource, 'function setupCategoryManagerEvents', '\n\nfunction renderAdminProducts');
  assert(events.includes("panel?.setAttribute('open', '')") && events.includes("form.scrollIntoView({ behavior: 'smooth', block: 'start' })"), 'the single Edit Main Collection action must open and focus the in-place editor automatically');

  const window = new Window({ url: 'https://mvpluxcreations.com/admin.html#categories' });
  const implementation = sourceRange(adminSource, 'async function saveLegacyMainCollectionDraftByKey', '\n\nfunction homepageOrderedAdminCategories');
  const saved = [];
  const opened = new Set();
  let rendered = 0;
  let status = '';
  const makeEditable = new Function('dependencies', `
    const { mainCollectionMigrationDrafts, saveAdminCollectionOperations, openedCategoryEditors, renderCategoryManager, setStatus } = dependencies;
    let adminLastSaveError = '';
    ${implementation}
    return saveLegacyMainCollectionDraftByKey;
  `)({
    mainCollectionMigrationDrafts: () => ({ 'custom-photo': { key: 'custom-photo', title: 'Custom Photo Standees', card: { image: 'images/custom.png' }, draftStatus: 'draft', approvalStatus: 'draft' } }),
    saveAdminCollectionOperations: async (operations) => { saved.push(...operations); return { ok: true }; },
    openedCategoryEditors: opened,
    renderCategoryManager: () => { rendered += 1; },
    setStatus: (message) => { status = message; }
  });
  assert(await makeEditable('custom-photo'), 'the explicit action must create the chosen normalized private draft');
  assert(saved.length === 1 && saved[0].entryKey === 'custom-photo' && saved[0].baseRecord === undefined, 'only the selected compatibility Collection must be normalized');
  assert(opened.has('custom-photo') && rendered === 1, 'the newly normalized Collection must rerender with its editor open');
  assert(status.includes('editable Main Collection draft') && status.includes('editor is open'), 'the one-step Edit action must confirm that the normalized editor is open');

  const liveVisibilityImplementation = sourceRange(adminSource, 'async function saveCategoryVisibilityLive', '\n\nasync function deleteAdminCategories');
  const privateState = {};
  const calls = [];
  let publishSucceeds = true;
  const saveVisibilityLive = new Function('dependencies', `
    const { readAdminCategories, mainCollectionMigrationDrafts, saveAdminCollectionOperations, saveCategoryVisibility, publishCategoryByKey, renderCategoryManager, setStatus } = dependencies;
    let adminLastSaveError = '';
    ${liveVisibilityImplementation}
    return saveCategoryVisibilityLive;
  `)({
    readAdminCategories: () => structuredClone(privateState),
    mainCollectionMigrationDrafts: () => ({ 'small-party-packs': { key: 'small-party-packs', title: 'Party Pack Standees', homepageVisible: true } }),
    saveAdminCollectionOperations: async ([operation]) => {
      calls.push(['normalize-and-draft', operation.entryKey, operation.patch.homepageVisible]);
      privateState[operation.entryKey] = structuredClone(operation.patch);
      return { ok: true };
    },
    saveCategoryVisibility: async (key, field, value, options) => {
      calls.push(['draft', key, field, value, options]);
      privateState[key][field] = value;
      return true;
    },
    publishCategoryByKey: async (key) => { calls.push(['live', key]); return publishSucceeds; },
    renderCategoryManager: () => calls.push(['render']),
    setStatus: (message) => { status = message; }
  });
  assert(await saveVisibilityLive('small-party-packs', 'homepageVisible', false), 'unchecking a compatibility-only card must save its homepage state live');
  assert(calls[0][0] === 'normalize-and-draft' && calls[0][2] === false && calls[1][0] === 'live', 'the first checkbox change must normalize and save homepageVisible in one revision-protected operation before Save Live');
  assert(status.includes('hidden from the live homepage'), 'the checkbox must clearly confirm the customer-facing result');
  calls.length = 0;
  assert(await saveVisibilityLive('small-party-packs', 'homepageVisible', true), 'checking the normalized Party Pack card again must restore it live');
  assert(calls[0][0] === 'draft' && calls[0][3] === true && calls[1][0] === 'live', 'rechecking must save homepageVisible=true and must not try to normalize the record a second time');
  assert(status.includes('shown on the live homepage'), 'rechecking must clearly confirm that Party Pack is live again');
  assert(calls.at(-1)[0] === 'render', 'each live toggle must rebuild Collections from the saved value so the checkbox never remains disabled or stale');
  calls.length = 0;
  publishSucceeds = false;
  assert(!await saveVisibilityLive('small-party-packs', 'homepageVisible', false), 'a failed live write must be reported as a failure');
  assert(!calls.some(([operation]) => operation === 'render') && status.includes('SAVE FAILED') && status.includes('not changed on the website'), 'a failed live write must not replace the checkbox with misleading draft state');
});
