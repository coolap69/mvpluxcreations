import * as adminUtils from '../admin-state-utils.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    snapshot: () => Object.fromEntries(values)
  };
}

class TestFormData {
  constructor(form) { this.form = form; }
  control(name) { return this.form?.elements?.namedItem?.(name) || null; }
  has(name) {
    const control = this.control(name);
    if (!control || control.disabled) return false;
    return control.type === 'checkbox' ? control.checked === true : true;
  }
  get(name) {
    const control = this.control(name);
    if (!control || control.disabled || (control.type === 'checkbox' && !control.checked)) return null;
    return control.type === 'checkbox' ? (control.value || 'on') : (control.value ?? '');
  }
  getAll(name) {
    const control = this.control(name);
    if (!control) return [];
    const controls = Array.isArray(control) ? control : [control];
    return controls.filter((item) => !item.disabled && (item.type !== 'checkbox' || item.checked)).map((item) => item.value ?? '');
  }
}

function categoryTestForm(values = {}) {
  const controls = {};
  const preview = { hidden: true, innerHTML: '' };
  const checkbox = (checked, disabled = false) => ({ type: 'checkbox', checked, disabled, value: 'on', dataset: {} });
  const input = (value = '') => ({ type: 'text', value: String(value), disabled: false, dataset: {} });
  Object.assign(controls, {
    title: input(values.title ?? 'Sports Legends'),
    description: input(values.description ?? 'Sports description'),
    funFact: input(values.funFact ?? 'Sports fun fact'),
    page: input(values.page ?? 'sports-legends.html'),
    order: input(values.order ?? 1),
    visible: checkbox(values.visible ?? true),
    homepageVisible: checkbox(values.homepageVisible ?? true, values.homepageDisabled ?? false),
    cardImage: input(values.cardImage ?? 'images/sports.png'),
    cardBackgroundImage: input(values.cardBackgroundImage ?? ''),
    backgroundPosition: input(values.backgroundPosition ?? '25% 75%'),
    backgroundSizePercent: input(values.backgroundSizePercent ?? 135),
    standeeSizePercent: input(values.standeeSizePercent ?? 84),
    standeeLeftPercent: input(values.standeeLeftPercent ?? 12),
    standeeVerticalPercent: input(values.standeeVerticalPercent ?? -8),
    titleLeftPercent: input(values.titleLeftPercent ?? 7),
    titleVerticalPercent: input(values.titleVerticalPercent ?? -6),
    titleAlign: input(values.titleAlign ?? 'right'),
    titleSizePercent: input(values.titleSizePercent ?? 130),
    descriptionLeftPercent: input(values.descriptionLeftPercent ?? -9),
    descriptionVerticalPercent: input(values.descriptionVerticalPercent ?? 11),
    descriptionAlign: input(values.descriptionAlign ?? 'left'),
    descriptionSizePercent: input(values.descriptionSizePercent ?? 115)
  });
  return {
    dataset: { categoryEdit: 'sports' },
    elements: { namedItem: (name) => controls[name] || null },
    querySelector(selector) { return selector === '[data-category-edit-preview]' ? preview : null; },
    closest() { return null; },
    controls,
    preview
  };
}

function emptyElement() {
  return {
    hidden: false,
    dataset: {},
    style: { setProperty() {}, getPropertyValue() { return ''; } },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {},
    insertAdjacentElement() {},
    insertAdjacentHTML() {},
    addEventListener() {},
    setAttribute() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

async function loadActualStorefrontHelpers({ client, storage = memoryStorage() }) {
  let source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  source = source.replace(
    "const adminStateUtilsPromise = import('./admin-state-utils.js');",
    'const adminStateUtilsPromise = Promise.resolve(adminUtils);'
  );
  source = source.replace(
    "const adminArchitecturePromise = import('./admin-architecture.js');",
    'const adminArchitecturePromise = Promise.resolve({});'
  );
  const queryElements = new Map();
  const document = {
    body: emptyElement(),
    addEventListener() {},
    getElementById() { return null; },
    querySelector(selector) { return queryElements.get(selector) || null; },
    querySelectorAll() { return []; },
    createElement() { return emptyElement(); },
    __setQueryElement(selector, element) { queryElements.set(selector, element); }
  };
  const window = {
    MVPLUX_PRODUCT_CATALOG: [],
    MVPLUX_PRODUCT_CATEGORIES: [],
    mvpluxPublishedAdminSettings: null,
    mvpluxLiveAdminSettings: null,
    mvpluxLiveAdminRevision: 0,
    mvpluxLiveAdminStateLoaded: false,
    getMvpluxSupabaseClient: () => client,
    addEventListener() {},
    clearTimeout,
    setTimeout,
    location: { pathname: '/index.html', reload() {} }
  };
  const factory = new Function(
    'adminUtils', 'window', 'document', 'localStorage', 'sessionStorage', 'BroadcastChannel',
    `${source}
      return {
        saveStorefrontProductPatch,
        saveStorefrontCategoryPatch,
        saveStorefrontProductPatches,
        saveStorefrontListMembershipPatch,
        saveInlineAdminEditsLive,
        getAdminProducts,
        getAdminCategories,
        compatibilityMasterCategories,
        inlineAdminOwnedField,
        persistInlineOwnedField,
        getAdminViewMode,
        shouldUsePrivateAdminState,
        getInlineAdminPageEdits,
        withoutProductOwnedPageValues,
        __setQueryElement(selector, element) { document.__setQueryElement(selector, element); },
        __setConflictSink(fn) { showStorefrontAdminConflict = fn; },
        __setInlineState(page, live, revision, draft, dirty, versions, base) {
          window.location.pathname = '/' + page;
          inlineAdminLiveEdits = { [page]: structuredClone(live) };
          inlineAdminLiveRevisions = { [page]: revision };
          inlineAdminDraftEdits = { [page]: structuredClone(draft) };
          inlineAdminDirtyKeys = { [page]: new Set(dirty) };
          inlineAdminDirtyVersions = { [page]: new Map(Object.entries(versions)) };
          inlineAdminBasePageEdits = { [page]: structuredClone(base) };
        },
        __editInlineKey(page, key, value) {
          markInlineAdminElementDirty(page, key);
          inlineAdminDraftEdits[page] = inlineAdminDraftEdits[page] || {};
          inlineAdminDraftEdits[page][key] = structuredClone(value);
        },
        __inlineState(page) {
          return {
            live: structuredClone(inlineAdminLiveEdits?.[page] || {}),
            draft: structuredClone(inlineAdminDraftEdits?.[page] || {}),
            dirty: [...(inlineAdminDirtyKeys[page] || [])],
            revision: inlineAdminLiveRevisions[page]
          };
        }
      };
    `
  );
  return { helpers: factory(adminUtils, window, document, storage, memoryStorage(), undefined), window, storage };
}

async function loadActualAdminHelpers({ client, storage = memoryStorage() }) {
  let source = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
  source = source.replace(
    "const adminStateUtilsPromise = import('./admin-state-utils.js');",
    'const adminStateUtilsPromise = Promise.resolve(adminUtils);'
  );
  source = source.replace(
    "const adminArchitecturePromise = import('./admin-architecture.js');",
    'const adminArchitecturePromise = Promise.resolve({});'
  );
  const document = {
    body: emptyElement(),
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return emptyElement(); }
  };
  const window = {
    MVPLUX_PRODUCT_CATALOG: [],
    MVPLUX_PRODUCT_CATEGORIES: [],
    MVPLUX_SUPABASE: { url: 'https://example.supabase.co', publishableKey: 'test-key' },
    MVPLUX_PRICING: {
      normalizePriceSettings: (value) => ({ ...(value || {}) }),
      parseHeight: (value) => Number(value),
      calculateHeightPrice: () => 0
    },
    getMvpluxSupabaseClient: () => client,
    addEventListener() {},
    location: { hash: '' }
  };
  const publisherFetch = async (_url, init = {}) => {
    const payload = JSON.parse(init.body || '{}');
    if (payload.action === 'working-state') {
      const { data, error } = await client.from('site_edits').select('edits, revision').eq('page_key', 'admin-global').maybeSingle();
      return { ok: !error, status: error ? 500 : 200, json: async () => error ? error : { rows: [{ page_key: 'admin-global', edits: data?.edits || {}, revision: data?.revision || 0 }] } };
    }
    if (payload.action === 'save-working-state') {
      const { data, error } = await client.rpc('save_site_edits', {
        p_page_key: 'admin-global', p_edits: payload.edits, p_expected_revision: payload.expectedRevision, p_replace: false
      });
      return { ok: !error, status: error ? 409 : 200, json: async () => error ? error : { edits: data?.edits || payload.edits, revision: data?.revision || payload.expectedRevision + 1 } };
    }
    return { ok: false, status: 400, json: async () => ({ error: 'Unsupported test publisher action.' }) };
  };
  const factory = new Function(
    'adminUtils', 'window', 'document', 'localStorage', 'BroadcastChannel', 'fetch', 'FormData', 'CSS',
    `${source}
      return {
        saveAdminProductFieldPatch,
        saveAdminProductFieldPatches,
        saveAdminCollectionOperations,
        saveAdminCustomProductFieldPatch,
        saveAdminExtraImagePatch,
        saveAdminArchiveMembership,
        saveAdminImageDraftPatch,
        applyAdminExport,
        writeCoupons,
        buildNormalizedPublishSnapshot,
        architectureReviewItems,
        buildSelectedArchitectureSnapshot,
        automaticPublishImagePaths,
        categoryFromEditForm,
        saveCategoryEditForm,
        previewCategoryEdit,
        readAdminCategories,
        allAdminProducts,
        __setLive(edits, revision) { adminLiveSettings = structuredClone(edits); adminLiveRevision = revision; },
        __setArchitectureState(settings, published = {}, pages = {}) {
          adminArchitectureState = { feature: { enabled: true }, diagnostics: {} };
          adminLiveSettings = structuredClone(settings);
          adminPublishedBaseline = structuredClone(published);
          adminPageLiveEdits = structuredClone(pages);
        },
        __setConflictSink(fn) { showProductSaveConflict = fn; }
      };
    `
  );
  return { helpers: factory(adminUtils, window, document, storage, undefined, publisherFetch, TestFormData, { escape: (value) => String(value) }), window, storage };
}

function adminGlobalClient(rows, rpcHandler) {
  return {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'admin' }, access_token: 'test-token' } }, error: null }) },
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => structuredClone(rows.shift() || { data: null, error: null })
      };
    },
    rpc: rpcHandler
  };
}

Deno.test('actual product patch helper rebases a different field and updates backup only after success', async () => {
  const calls = [];
  const rows = [{ data: { edits: { products: { p: { title: 'Server', description: 'Old' } } }, revision: 4 }, error: null }];
  const client = adminGlobalClient(rows, async (_name, args) => {
    calls.push(args);
    return { data: { edits: args.p_edits, revision: 5 }, error: null };
  });
  const { helpers, window, storage } = await loadActualStorefrontHelpers({ client });
  window.MVPLUX_PRODUCT_CATALOG = [{ slug: 'p', title: 'Old', description: 'Old' }];
  const saved = await helpers.saveStorefrontProductPatch('p', { description: 'Local' }, { title: 'Old', description: 'Old' });
  assert(saved, 'different-field product patch should save');
  assert(calls.length === 1 && calls[0].p_expected_revision === 4, 'actual helper must use latest revision');
  assert(calls[0].p_edits.products.p.title === 'Server', 'latest title must survive');
  assert(calls[0].p_edits.products.p.description === 'Local', 'intended description must save');
  assert(JSON.parse(storage.snapshot().mvpluxAdminProducts).p.description === 'Local', 'backup updates after success');
});

Deno.test('actual admin.html product helper rebases only intended dirty fields', async () => {
  const calls = [];
  const rows = [{ data: { edits: { products: { p: { title: 'Server', description: 'Old', originalHeight: '72' } } }, revision: 6 }, error: null }];
  const client = adminGlobalClient(rows, async (_name, args) => {
    calls.push(args);
    return { data: { edits: args.p_edits, revision: 7 }, error: null };
  });
  const { helpers, window } = await loadActualAdminHelpers({ client });
  window.MVPLUX_PRODUCT_CATALOG = [{ slug: 'p', title: 'Old', description: 'Old', originalHeight: '72' }];
  const result = await helpers.saveAdminProductFieldPatch('p', { description: 'Local' }, { title: 'Old', description: 'Old', originalHeight: '72' });
  assert(result.ok && calls.length === 1, 'admin product helper should save once');
  assert(calls[0].p_edits.products.p.title === 'Server', 'admin helper must retain newest title');
  assert(calls[0].p_edits.products.p.description === 'Local', 'admin helper must apply only dirty description');
});

Deno.test('actual multi-product helper preserves latest records while patching intended ordering fields', async () => {
  const calls = [];
  const rows = [{ data: { edits: { products: { a: { title: 'A server' }, b: { title: 'B server' }, untouched: { title: 'Keep' } } }, revision: 8 }, error: null }];
  const client = adminGlobalClient(rows, async (_name, args) => {
    calls.push(args);
    return { data: { edits: args.p_edits, revision: 9 }, error: null };
  });
  const { helpers, window } = await loadActualStorefrontHelpers({ client });
  window.MVPLUX_PRODUCT_CATALOG = [{ slug: 'a' }, { slug: 'b' }, { slug: 'untouched' }];
  const saved = await helpers.saveStorefrontProductPatches(
    { a: { categoryOrder: { sports: 2 } }, b: { categoryOrder: { sports: 1 } } },
    { a: { title: 'A server' }, b: { title: 'B server' } }
  );
  assert(saved && calls.length === 1, 'multi-product patch should save once');
  assert(calls[0].p_edits.products.untouched.title === 'Keep', 'unrelated product must survive');
});

Deno.test('actual page helper merges different elements and uses merge mode', async () => {
  const calls = [];
  const pageRows = [{ data: { edits: { remote: { text: 'Server' } }, revision: 2 }, error: null }];
  const client = adminGlobalClient(pageRows, async (_name, args) => {
    calls.push(args);
    return { data: { edits: { remote: { text: 'Server' }, ...args.p_edits }, revision: 3 }, error: null };
  });
  const { helpers } = await loadActualStorefrontHelpers({ client });
  helpers.__setInlineState('index.html', {}, 1, { local: { text: 'Local' } }, ['local'], { local: 1 }, {});
  const saved = await helpers.saveInlineAdminEditsLive();
  const state = helpers.__inlineState('index.html');
  assert(saved && calls[0].p_replace === false, 'page helper must use merge mode');
  assert(calls[0].p_edits.local.text === 'Local', 'only dirty element should be submitted');
  assert(state.live.remote.text === 'Server' && state.live.local.text === 'Local', 'both page elements must survive');
});

Deno.test('actual page helper preserves an edit made while the first request is in flight', async () => {
  let releaseRpc;
  const rpcWait = new Promise((resolve) => { releaseRpc = resolve; });
  const rows = [{ data: { edits: {}, revision: 1 }, error: null }];
  const client = adminGlobalClient(rows, async (_name, args) => {
    await rpcWait;
    return { data: { edits: args.p_edits, revision: 2 }, error: null };
  });
  const { helpers } = await loadActualStorefrontHelpers({ client });
  helpers.__setInlineState('index.html', {}, 1, { a: { text: 'First' } }, ['a'], { a: 1 }, {});
  const saving = helpers.saveInlineAdminEditsLive();
  await Promise.resolve();
  helpers.__editInlineKey('index.html', 'a', { text: 'Newer' });
  releaseRpc();
  await saving;
  const state = helpers.__inlineState('index.html');
  assert(state.dirty.includes('a'), 'newer edit must remain dirty');
  assert(state.draft.a.text === 'Newer', 'newer draft value must remain available');
});

Deno.test('actual page conflict exposes cancel, keep-latest, and explicit reapply without a silent write', async () => {
  let rpcCalls = 0;
  const rows = [
    { data: { edits: { a: { text: 'Server' } }, revision: 2 }, error: null },
    { data: { edits: { a: { text: 'Server' } }, revision: 2 }, error: null }
  ];
  const client = adminGlobalClient(rows, async (_name, args) => {
    rpcCalls += 1;
    return { data: { edits: { a: args.p_edits.a }, revision: 3 }, error: null };
  });
  const { helpers } = await loadActualStorefrontHelpers({ client });
  let actions;
  helpers.__setConflictSink((details, retry, keepLatest, cancel) => { actions = { details, retry, keepLatest, cancel }; });
  helpers.__setInlineState('index.html', { a: { text: 'Old' } }, 1, { a: { text: 'Local' } }, ['a'], { a: 1 }, { a: { text: 'Old' } });
  const first = await helpers.saveInlineAdminEditsLive();
  assert(!first && rpcCalls === 0, 'same-element conflict must stop before RPC');
  assert(actions?.retry && actions?.keepLatest && actions?.cancel, 'all explicit conflict actions must be provided');
  await actions.cancel();
  assert(helpers.__inlineState('index.html').draft.a.text === 'Local', 'cancel must retain local draft for review');
  const reapplied = await actions.retry();
  assert(reapplied && rpcCalls === 1, 'reapply must write only after explicit approval');
});

Deno.test('actual product helper stops on RPC 40001, reloads, and does not update local backup', async () => {
  let conflict;
  const rows = [
    { data: { edits: { products: { p: { title: 'Old' } } }, revision: 1 }, error: null },
    { data: { edits: { products: { p: { title: 'New server' } } }, revision: 2 }, error: null }
  ];
  const client = adminGlobalClient(rows, async () => ({ data: null, error: { code: '40001', message: 'Admin state changed' } }));
  const storage = memoryStorage();
  const { helpers, window } = await loadActualStorefrontHelpers({ client, storage });
  window.MVPLUX_PRODUCT_CATALOG = [{ slug: 'p', title: 'Old' }];
  helpers.__setConflictSink((details, retry) => { conflict = { details, retry }; });
  const saved = await helpers.saveStorefrontProductPatch('p', { title: 'Local' }, { title: 'Old' });
  assert(!saved && conflict?.details?.conflictingFields?.includes('title'), '40001 must become a visible same-field conflict');
  assert(!storage.snapshot().mvpluxAdminProducts, 'failed RPC must not update product backup');
});

Deno.test('actual storefront state ignores stale product localStorage after live Supabase state loads', async () => {
  const storage = memoryStorage({ mvpluxAdminProducts: JSON.stringify({ p: { title: 'Old local' } }) });
  const client = adminGlobalClient([], async () => ({ data: null, error: null }));
  const { helpers, window } = await loadActualStorefrontHelpers({ client, storage });
  storage.setItem('mvpluxAdminAnywhere', 'true');
  window.mvpluxLiveAdminStateLoaded = true;
  window.mvpluxLiveAdminSettings = { products: { p: { title: 'Server' } } };
  assert(helpers.getAdminProducts().p.title === 'Server', 'live state must defeat stale product backup');
});

Deno.test('new architecture prevents page rows from overriding product content but preserves geometry', async () => {
  const client = adminGlobalClient([{ edits: {}, revision: 1 }], async () => ({ data: {}, error: null }));
  const { helpers, window } = await loadActualStorefrontHelpers({ client });
  window.mvpluxLiveAdminSettings = { adminArchitectureV2: { enabled: true } };
  const filtered = helpers.withoutProductOwnedPageValues({
    'product-alpha-title-link': { text: 'Stale page title' },
    'product-alpha-description': { text: 'Stale page description' },
    'product-height-alpha': { type: 'originalHeight', originalHeight: 72 },
    'product-alpha-product-cutout': { src: 'images/stale.png', x: 9, y: 2, scale: 1.1, rotate: 3 },
    'page-heading': { text: 'Page heading' }
  });
  assert(!filtered['product-alpha-title-link'], 'product title override must be ignored');
  assert(!filtered['product-alpha-description'], 'product description override must be ignored');
  assert(!filtered['product-height-alpha'], 'product height override must be ignored');
  assert(!('src' in filtered['product-alpha-product-cutout']), 'product image source must be ignored');
  assert(filtered['product-alpha-product-cutout'].x === 9, 'page-specific product geometry must remain');
  assert(filtered['page-heading'].text === 'Page heading', 'page-owned content must remain');
});

Deno.test('inline Category title saves to the normalized root and reloads from the same record', async () => {
  const calls = [];
  const base = {
    key: 'sports',
    title: 'Sports',
    card: { title: 'Legacy homepage title', image: 'images/sports.png' }
  };
  const rows = [{ data: { edits: { adminArchitectureV2: { enabled: true }, categories: { sports: base } }, revision: 4 }, error: null }];
  const client = adminGlobalClient(rows, async (_name, args) => {
    calls.push(structuredClone(args));
    return { data: { edits: { adminArchitectureV2: { enabled: true }, ...args.p_edits }, revision: 5 }, error: null };
  });
  const storage = memoryStorage({ mvpluxIsAdminApproved: 'true', mvpluxAdminViewModeV2: 'preview' });
  const { helpers, window } = await loadActualStorefrontHelpers({ client, storage });
  window.mvpluxLiveAdminSettings = { adminArchitectureV2: { enabled: true }, categories: { sports: base } };
  window.mvpluxLiveAdminStateLoaded = true;
  const host = { dataset: { adminCategoryKey: 'sports' } };
  const heading = {
    dataset: { adminCategoryField: 'title' },
    closest(selector) {
      if (selector === '[data-admin-category-key]') return host;
      if (selector === '[data-admin-category-field]') return this;
      return null;
    }
  };
  const owned = helpers.inlineAdminOwnedField(heading);
  assert(owned?.categoryKey === 'sports' && owned.field === 'title' && owned.section === '', 'inline Sports heading must resolve to the normalized Category root');
  assert(await helpers.persistInlineOwnedField(heading, owned, 'Sports Legends'), 'inline root Category save must succeed');
  assert(calls.length === 1 && calls[0].p_page_key === 'admin-global', 'inline Category title must save only through admin-global');
  assert(calls[0].p_edits.categories.sports.title === 'Sports Legends', 'authoritative categories.sports.title must receive the edit');
  assert(calls[0].p_edits.categories.sports.card.image === 'images/sports.png', 'unrelated Category card fields must survive the title save');
  assert(helpers.getAdminCategories().sports.title === 'Sports Legends', 'a reload/read must resolve the saved normalized root title');
});

Deno.test('legacy Category card title feeds the root only until a normalized Category exists', async () => {
  const client = adminGlobalClient([], async () => ({ data: {}, error: null }));
  const { helpers, window } = await loadActualStorefrontHelpers({ client });
  window.MVPLUX_PRODUCT_CATEGORIES = [{ key: 'sports', label: 'Sports', page: 'sports-legends.html' }];
  window.mvpluxPublishedAdminSettings = {
    categoryDisplayCards: { 'sport-legend-standee': { title: 'Sport Legend Standees' } },
    categories: {}
  };
  assert(helpers.compatibilityMasterCategories().sports.title === 'Sport Legend Standees', 'legacy published text must preserve the current visible title without remaining a competing render source');
  window.mvpluxPublishedAdminSettings.categories.sports = { key: 'sports', title: 'Sports Legends' };
  assert(helpers.compatibilityMasterCategories().sports.title === 'Sports Legends', 'normalized Category title must win once published');
});

Deno.test('Category-owned page title overrides are ignored instead of competing after reload', async () => {
  const client = adminGlobalClient([], async () => ({ data: {}, error: null }));
  const { helpers, window } = await loadActualStorefrontHelpers({ client });
  window.mvpluxLiveAdminSettings = { adminArchitectureV2: { enabled: true }, categories: { sports: { key: 'sports', title: 'Sports Legends' } } };
  const host = { dataset: { adminCategoryKey: 'sports' } };
  const heading = {
    dataset: { adminCategoryField: 'title' },
    closest(selector) {
      if (selector === '[data-admin-category-key]') return host;
      if (selector === '[data-admin-category-field]') return this;
      return null;
    }
  };
  helpers.__setQueryElement('[data-admin-edit="sports-heading"]', heading);
  const filtered = helpers.withoutProductOwnedPageValues({
    'sports-heading': { text: 'Stale page override' },
    'page-footer': { text: 'Keep this page-owned value' }
  });
  assert(!filtered['sports-heading'], 'stale Category title page override must not visually win after reload');
  assert(filtered['page-footer'].text === 'Keep this page-owned value', 'unrelated page-owned content must remain');
});

Deno.test('Category publishing mirrors the authoritative root title into compatibility output', async () => {
  const client = adminGlobalClient([], async () => ({ data: {}, error: null }));
  const { helpers } = await loadActualAdminHelpers({ client });
  helpers.__setArchitectureState({
    categories: {
      sports: {
        key: 'sports', title: 'Sports Legends', description: 'Sports products', page: 'sports-legends.html',
        visible: true, homepageVisible: true, order: 0,
        card: { title: 'Stale legacy title', description: 'Stale legacy description', image: 'images/sports.png', visible: true, order: 0 },
        displaySettings: {}, approvalStatus: 'approved', draftStatus: 'ready'
      }
    },
    products: {}, deletedProducts: [], deletedCategories: []
  }, {
    version: 1, schemaVersion: 2, products: {}, categories: {}, categoryDisplayCards: {}, deletedProducts: [], deletedCategories: [],
    homepageCategoryOrder: [], pageContent: {}, pageVisualStates: {}, extraImages: {}, globalDisplaySettings: {}, priceSettings: {}
  });
  const snapshot = helpers.buildNormalizedPublishSnapshot();
  assert(snapshot.categories.sports.title === 'Sports Legends', 'normalized published Category must keep the root title');
  assert(snapshot.categoryDisplayCards['sport-legend-standee'].title === 'Sports Legends', 'legacy compatibility card must mirror the root title during Publish');
});

Deno.test('actual Category Save Draft persists text and every supported visual field without publishing', async () => {
  const calls = [];
  const sports = {
    key: 'sports', title: 'Sports', description: '', funFact: '', page: 'sports-legends.html',
    visible: true, homepageVisible: true, order: 0,
    card: { image: 'images/sports.png', backgroundImage: '', visible: true, order: 0 },
    displaySettings: { backgroundPosition: 'center center' }
  };
  const edits = { adminArchitectureV2: { enabled: true }, categories: { sports } };
  const rows = [{ data: { edits, revision: 9 }, error: null }];
  const client = adminGlobalClient(rows, async (_name, args) => {
    calls.push(structuredClone(args));
    return { data: { edits: { ...edits, ...args.p_edits }, revision: 10 }, error: null };
  });
  const { helpers } = await loadActualAdminHelpers({ client });
  helpers.__setArchitectureState(edits, { categories: { sports } });
  const form = categoryTestForm();
  assert(await helpers.saveCategoryEditForm(form, 'draft'), 'the actual Category Save Draft handler must succeed');
  assert(calls.length === 1, 'Save Draft must perform one revision-protected private save');
  const saved = calls[0].p_edits.categories.sports;
  assert(saved.key === 'sports' && saved.title === 'Sports Legends', 'Save Draft must preserve the key and save the authoritative title');
  assert(saved.description === 'Sports description' && saved.funFact === 'Sports fun fact', 'description and fun fact must save');
  assert(saved.draftStatus === 'draft' && saved.approvalStatus === 'draft', 'Save Draft must remain private and unapproved');
  assert(saved.card.image === 'images/sports.png' && saved.card.backgroundImage === '', 'image references must save without modifying files');
  assert(saved.displaySettings.backgroundPosition === '25% 75%', 'background X/Y must save through backgroundPosition');
  assert(saved.displaySettings.backgroundSizePercent === 135, 'background zoom must survive Save Draft');
  for (const [field, expected] of Object.entries({
    standeeSizePercent: 84, standeeLeftPercent: 12, standeeVerticalPercent: -8,
    titleLeftPercent: 7, titleVerticalPercent: -6, titleSizePercent: 130,
    descriptionLeftPercent: -9, descriptionVerticalPercent: 11, descriptionSizePercent: 115
  })) assert(saved.displaySettings[field] === expected, `${field} must survive Save Draft`);
  assert(saved.displaySettings.titleAlign === 'right' && saved.displaySettings.descriptionAlign === 'left', 'text alignment must survive Save Draft');
  assert(helpers.readAdminCategories().sports.title === 'Sports Legends', 'the Admin working state must immediately reflect the saved title');
});

Deno.test('hidden Category form preserves both homepage visibility preferences when the disabled checkbox is absent', async () => {
  for (const homepageVisible of [true, false]) {
    const sports = { key: 'sports', title: 'Sports', visible: true, homepageVisible, card: { image: 'images/sports.png' }, displaySettings: {} };
    const client = adminGlobalClient([], async () => ({ data: {}, error: null }));
    const { helpers } = await loadActualAdminHelpers({ client });
    helpers.__setArchitectureState({ adminArchitectureV2: { enabled: true }, categories: { sports } }, { categories: { sports } });
    const hiddenForm = categoryTestForm({ visible: false, homepageVisible, homepageDisabled: true });
    const hidden = helpers.categoryFromEditForm(hiddenForm);
    assert(hidden.visible === false && hidden.homepageVisible === homepageVisible, `Hide must preserve homepageVisible=${homepageVisible}`);
    hiddenForm.controls.visible.checked = true;
    hiddenForm.controls.homepageVisible.disabled = false;
    const unhidden = helpers.categoryFromEditForm(hiddenForm);
    assert(unhidden.visible === true && unhidden.homepageVisible === homepageVisible, `Unhide must restore homepageVisible=${homepageVisible}`);
  }
});

Deno.test('actual Category preview applies independent image, text, and background controls without saving', async () => {
  let writes = 0;
  const sports = { key: 'sports', title: 'Sports', visible: true, homepageVisible: true, card: { image: 'images/sports.png', backgroundImage: '' }, displaySettings: {} };
  const client = adminGlobalClient([], async () => { writes += 1; return { data: {}, error: null }; });
  const { helpers } = await loadActualAdminHelpers({ client });
  helpers.__setArchitectureState({ adminArchitectureV2: { enabled: true }, categories: { sports } }, { categories: { sports } });
  const form = categoryTestForm();
  helpers.previewCategoryEdit(form);
  const html = form.preview.innerHTML;
  for (const token of [
    'height:84%', 'left:62%', 'bottom:10%', 'background-position:25% 75%', 'transform:scale(1.35)',
    'images/FrontPageWeb/Herobackgroundparts-backgroundforimages.jpg',
    'translate(7%,-6px)', 'text-align:right', 'font-size:24.7px',
    'translate(-9%,11px)', 'text-align:left', 'font-size:16.1px',
    'Sports Legends', 'Sports description'
  ]) assert(html.includes(token), `live Category preview must apply ${token}`);
  form.controls.standeeSizePercent.value = '63';
  form.controls.standeeLeftPercent.value = '0';
  form.controls.standeeVerticalPercent.value = '0';
  form.controls.titleLeftPercent.value = '0';
  form.controls.descriptionVerticalPercent.value = '0';
  form.controls.backgroundPosition.value = 'center center';
  helpers.previewCategoryEdit(form);
  assert(form.preview.innerHTML.includes('height:63%') && form.preview.innerHTML.includes('left:50%') && form.preview.innerHTML.includes('background-position:center center'), 'reset values must immediately update the same preview');
  assert(writes === 0, 'preview and cancel/no-save behavior must never write private or published state');
});

Deno.test('three Admin view modes separate private preview from published customer state', async () => {
  const storage = memoryStorage({ mvpluxIsAdminApproved: 'true', mvpluxAdminViewModeV2: 'preview' });
  const client = adminGlobalClient([{ edits: {}, revision: 1 }], async () => ({ data: {}, error: null }));
  const { helpers, window } = await loadActualStorefrontHelpers({ client, storage });
  window.mvpluxLiveAdminSettings = {
    adminArchitectureV2: { enabled: true },
    products: { alpha: { title: 'Private title' } }
  };
  window.mvpluxLiveAdminStateLoaded = true;
  window.mvpluxPublishedAdminSettings = { products: { alpha: { title: 'Published title' } } };
  assert(helpers.getAdminViewMode() === 'preview', 'preview mode should be selected');
  assert(helpers.shouldUsePrivateAdminState() === true, 'preview should use saved private state');
  assert(helpers.getAdminProducts().alpha.title === 'Private title', 'preview should render private product data');

  storage.setItem('mvpluxAdminViewModeV2', 'published');
  assert(helpers.shouldUsePrivateAdminState() === false, 'published mode must not read private state');
  assert(helpers.getAdminProducts().alpha.title === 'Published title', 'published mode should render only published product data');
});

Deno.test('actual publish snapshot source uses persisted homepage edits rather than localStorage', async () => {
  const source = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
  const start = source.indexOf('function buildCurrentPublishSnapshot()');
  const end = source.indexOf('\nfunction ', start + 20);
  const body = source.slice(start, end);
  assert(body.includes("adminHomepageLiveEdits?.['homepage-category-card-order']"), 'publish snapshot must use loaded page-row state');
  assert(!body.includes('localStorage'), 'publish snapshot must not read local homepage order');
});

Deno.test('actual custom-product patch preserves newest unrelated fields and records', async () => {
  const calls = [];
  const rows = [{
    data: {
      edits: {
        customProducts: [
          { slug: 'custom', title: 'Newest title', imageChoices: [] },
          { slug: 'other', title: 'Keep me' }
        ]
      },
      revision: 10
    },
    error: null
  }];
  const client = adminGlobalClient(rows, async (_name, args) => {
    calls.push(args);
    return { data: { edits: args.p_edits, revision: 11 }, error: null };
  });
  const { helpers, storage } = await loadActualAdminHelpers({ client });
  const result = await helpers.saveAdminCustomProductFieldPatch(
    'custom',
    { imageChoices: [{ label: 'Alt', image: 'images/alt.png' }] },
    { slug: 'custom', title: 'Old title', imageChoices: [] }
  );
  assert(result.ok && calls.length === 1, `custom record patch should save once: ${result.error?.message || 'no error'}; calls=${calls.length}`);
  assert(calls[0].p_edits.customProducts[0].title === 'Newest title', 'newest custom title must survive');
  assert(calls[0].p_edits.customProducts[1].title === 'Keep me', 'unrelated custom product must survive');
  assert(JSON.parse(storage.snapshot().mvpluxAdminCustomProducts)[0].imageChoices.length === 1, 'backup updates after success');
});

Deno.test('actual keyed and membership patches rebase unrelated extra-image, archive, and draft changes', async () => {
  const calls = [];
  const rows = [
    { data: { edits: { extraImages: { changedElsewhere: 'images/server.png', target: 'images/old.png' } }, revision: 1 }, error: null },
    { data: { edits: { savedForLaterProducts: ['server-only'] }, revision: 2 }, error: null },
    { data: { edits: { imageDrafts: { other: { title: 'Server draft' }, target: { title: 'Old' } } }, revision: 3 }, error: null }
  ];
  const client = adminGlobalClient(rows, async (_name, args) => {
    calls.push(args);
    return { data: { edits: args.p_edits, revision: calls.length + 1 }, error: null };
  });
  const { helpers } = await loadActualAdminHelpers({ client });
  const extraResult = await helpers.saveAdminExtraImagePatch('target', 'images/new.png', 'images/old.png');
  assert(extraResult.ok, `extra image patch should save: ${extraResult.error?.message || 'no error'}`);
  assert((await helpers.saveAdminArchiveMembership('target', true, [])).ok, 'archive membership should save');
  assert((await helpers.saveAdminImageDraftPatch('target', { description: 'Local' }, { title: 'Old' })).ok, 'draft patch should save');
  assert(calls[0].p_edits.extraImages.changedElsewhere === 'images/server.png', 'unrelated extra image must survive');
  assert(calls[1].p_edits.savedForLaterProducts.includes('server-only') && calls[1].p_edits.savedForLaterProducts.includes('target'), 'unrelated archive entry must survive');
  assert(calls[2].p_edits.imageDrafts.other.title === 'Server draft', 'unrelated draft must survive');
});

Deno.test('actual collection helper stops a same-entry conflict before RPC', async () => {
  let rpcCalls = 0;
  const rows = [{ data: { edits: { extraImages: { target: 'images/server.png' } }, revision: 4 }, error: null }];
  const client = adminGlobalClient(rows, async () => {
    rpcCalls += 1;
    return { data: null, error: null };
  });
  const { helpers, storage } = await loadActualAdminHelpers({ client });
  const result = await helpers.saveAdminExtraImagePatch('target', 'images/local.png', 'images/old.png');
  assert(!result.ok && result.conflict, 'same-key stale edit must conflict');
  assert(rpcCalls === 0, 'conflict must stop before RPC');
  assert(!storage.snapshot().mvpluxAdminExtraImages, 'failed conflict must not update backup');
});

Deno.test('actual collection helper stops on RPC 40001 and leaves backup untouched', async () => {
  const rows = [
    { data: { edits: { imageDrafts: { target: { title: 'Old' } } }, revision: 1 }, error: null },
    { data: { edits: { imageDrafts: { target: { title: 'Remote' } } }, revision: 2 }, error: null }
  ];
  const client = adminGlobalClient(rows, async () => ({ data: null, error: { code: '40001', message: 'Admin state changed' } }));
  const { helpers, storage } = await loadActualAdminHelpers({ client });
  const result = await helpers.saveAdminImageDraftPatch('target', { description: 'Local' }, { title: 'Old' });
  assert(!result.ok, '40001 must stop the collection save');
  assert(!storage.snapshot().mvpluxImageDrafts, '40001 must not update the draft backup');
});

Deno.test('actual storefront archive patch preserves another tab\'s archived product', async () => {
  const calls = [];
  const rows = [{ data: { edits: { savedForLaterProducts: ['remote'] }, revision: 7 }, error: null }];
  const client = adminGlobalClient(rows, async (_name, args) => {
    calls.push(args);
    return { data: { edits: args.p_edits, revision: 8 }, error: null };
  });
  const { helpers, storage } = await loadActualStorefrontHelpers({ client });
  const saved = await helpers.saveStorefrontListMembershipPatch(
    'savedForLaterProducts', 'local', true, [], 'mvpluxAdminArchivedProducts'
  );
  assert(saved && calls.length === 1, 'storefront archive patch should save once');
  assert(calls[0].p_edits.savedForLaterProducts.includes('remote'), 'remote archive entry must survive');
  assert(calls[0].p_edits.savedForLaterProducts.includes('local'), 'intended archive entry must save');
  assert(JSON.parse(storage.snapshot().mvpluxAdminArchivedProducts).includes('remote'), 'backup must reflect confirmed merged state');
});

Deno.test('actual legacy coupon mirror waits for Supabase before updating localStorage', async () => {
  const rows = [{ data: { edits: { coupons: [] }, revision: 1 }, error: null }];
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  const client = adminGlobalClient(rows, async (_name, args) => {
    await wait;
    return { data: { edits: args.p_edits, revision: 2 }, error: null };
  });
  const { helpers, storage } = await loadActualAdminHelpers({ client });
  helpers.__setLive({ coupons: [] }, 1);
  const saving = helpers.writeCoupons([{ code: 'SAFE' }]);
  await Promise.resolve();
  assert(!storage.snapshot().mvpluxAdminCoupons, 'coupon backup must not update while save is pending');
  release();
  const saved = await saving;
  assert(saved?.[0]?.code === 'SAFE', 'coupon helper should report confirmed values');
  assert(JSON.parse(storage.snapshot().mvpluxAdminCoupons)[0].code === 'SAFE', 'coupon backup updates after success');
});

Deno.test('actual full import awaits authoritative global and page writes before success', async () => {
  const calls = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'admin' } } }, error: null }) },
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: { edits: {}, revision: calls.length }, error: null })
      };
    },
    rpc: async (_name, args) => {
      calls.push(args);
      return { data: { edits: args.p_edits, revision: calls.length }, error: null };
    }
  };
  const { helpers, storage } = await loadActualAdminHelpers({ client });
  await helpers.applyAdminExport({
    products: { p: { title: 'Imported' } },
    pageEdits: { 'index.html': { heading: { type: 'text', text: 'Imported heading' } } }
  });
  assert(calls.length === 2, 'import must await one admin-global write and one page write');
  assert(calls[0].p_page_key === 'admin-global', 'global import must use authoritative Admin row');
  assert(calls[1].p_page_key === 'index.html' && calls[1].p_replace === true, 'controlled page restore must use authoritative page RPC');
  assert(JSON.parse(storage.snapshot().mvpluxInlineAdminEdits)['index.html'].heading.text === 'Imported heading', 'local recovery updates only after writes complete');
});

Deno.test('normalized publish snapshot excludes unapproved private edits and preserves published values', async () => {
  const client = adminGlobalClient([], async () => ({ data: null, error: null }));
  const { helpers } = await loadActualAdminHelpers({ client });
  helpers.__setArchitectureState({
    products: {
      existing: { slug: 'existing', title: 'Private draft', cutoutImage: 'images/existing.png', categories: [], visible: true, approvalStatus: 'draft' },
      approved: { slug: 'approved', title: 'Approved new', cutoutImage: 'images/approved.png', categories: [], visible: true, approvalStatus: 'approved' }
    },
    categories: {
      old: { key: 'old', title: 'Private category draft', card: {}, displaySettings: {}, approvalStatus: 'draft' },
      fresh: { key: 'fresh', title: 'Approved category', card: {}, displaySettings: {}, approvalStatus: 'approved' }
    },
    globalDisplaySettings: { backgroundPosition: 'center center' },
    priceSettings: {}, extraImages: {}, savedForLaterProducts: [], deletedProducts: [], ignoredImagePaths: []
  }, {
    version: 1, schemaVersion: 1,
    products: { existing: { slug: 'existing', title: 'Published title', cutoutImage: 'images/existing.png', categories: [], visible: true } },
    categories: { old: { key: 'old', title: 'Published category', card: {}, displaySettings: {} } },
    categoryDisplayCards: {}, pageContent: { 'index.html': { heading: { text: 'Published heading' } } },
    pageVisualStates: {}, extraImages: {}, priceSettings: {}
  }, {
    'index.html': {
      heading: { text: 'Private draft heading', approvalStatus: 'draft' },
      intro: { text: 'Approved intro', approvalStatus: 'approved' }
    }
  });
  const snapshot = helpers.buildNormalizedPublishSnapshot();
  assert(snapshot.products.existing.title === 'Published title', 'unapproved existing product edit must preserve published value');
  assert(snapshot.products.approved.title === 'Approved new', 'approved new product must enter snapshot');
  assert(snapshot.categories.old.title === 'Published category', 'unapproved category edit must preserve published value');
  assert(snapshot.categories.fresh.title === 'Approved category', 'approved category must enter snapshot');
  assert(snapshot.pageContent['index.html'].heading.text === 'Published heading', 'unapproved page edit must preserve published content');
  assert(snapshot.pageContent['index.html'].intro.text === 'Approved intro', 'approved page edit must enter snapshot');
});

Deno.test('selected publishing includes only chosen Ready records and their required images', async () => {
  const client = adminGlobalClient([], async () => ({ data: null, error: null }));
  const { helpers } = await loadActualAdminHelpers({ client });
  const published = {
    version: 1,
    schemaVersion: 2,
    products: { existing: { slug: 'existing', title: 'Published', cutoutImage: 'images/existing.png', imageChoices: [], categories: [] } },
    categoryDisplayCards: {}, categories: {}, categorySettings: {}, globalDisplaySettings: {},
    pageContent: {}, pageVisualStates: {}, extraImages: {}, deletedProducts: [], ignoredImagePaths: [], homepageCategoryOrder: []
  };
  helpers.__setArchitectureState({
    products: {
      'jayson-tatum-terminator': {
        slug: 'jayson-tatum-terminator', title: 'Jayson Tatum Terminator',
        cutoutImage: 'images/FanRequestStandees/JTTerminator/JT12nobackground.png',
        backgroundImage: 'images/FrontPageWeb/Herobackgroundparts-backgroundforimages.jpg',
        imageChoices: [], categories: ['sports'], visible: true,
        approvalStatus: 'approved', draftStatus: 'ready'
      },
      unfinished: { slug: 'unfinished', title: 'Private draft', imageChoices: [], categories: [], approvalStatus: 'draft' }
    },
    categories: {}
  }, published);
  const jayson = helpers.architectureReviewItems().find((item) => item.id === 'product:jayson-tatum-terminator');
  assert(jayson?.approved, 'Ready product must be selectable without a second Review approval');
  const snapshot = helpers.buildSelectedArchitectureSnapshot([jayson]);
  assert(snapshot.products['jayson-tatum-terminator']?.categories?.includes('sports'), 'selected product and category assignment must enter snapshot');
  assert(!snapshot.products.unfinished, 'unselected draft must remain private');
  assert(snapshot.products.existing?.title === 'Published', 'unchanged published products must remain in snapshot');
  const images = helpers.automaticPublishImagePaths([jayson], snapshot);
  assert(images.includes('images/FanRequestStandees/JTTerminator/JT12nobackground.png'), 'new selected product image must be included automatically');
});

Deno.test('legacy Admin snapshot inventory includes normalized products with new slugs', async () => {
  const client = adminGlobalClient([], async () => ({ data: null, error: null }));
  const { helpers, window } = await loadActualAdminHelpers({ client });
  window.MVPLUX_PRODUCT_CATALOG = [{ slug: 'existing', title: 'Existing' }];
  helpers.__setLive({ products: { 'new-product': { slug: 'new-product', title: 'New Product' } } }, 1);
  assert(helpers.allAdminProducts().some((product) => product.slug === 'new-product'), 'new normalized product must not be omitted when the feature flag is off');
});
