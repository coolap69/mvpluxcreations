const adminStateUtilsPromise = import('./admin-state-utils.js');
const adminArchitecturePromise = import('./admin-architecture.js');
const adminTabId = crypto.randomUUID?.()
  || `admin-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const adminProducts = [
  {
    slug: 'sport-legend-standee',
    title: 'Sport Legend Standees',
    description: 'Shop sports-inspired standee styles, then choose different players, sizes, and background options inside the category.',
    originalHeight: 78,
    cutoutImage: 'images/FrontPageWeb/Sports-Kobe-KB1forprint.png',
    backgroundImage: 'images/FanBackgrounds/top-favorite-stage-gold.png'
  },
  {
    slug: 'movie-character-standee',
    title: 'Movie Character Standees',
    description: 'Browse movie-style standee categories and see more character looks, poses, and display backgrounds inside.',
    originalHeight: 74,
    cutoutImage: 'images/MovieCharacterStandees/Endorskeleton/Endornobackground.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'people-public-figure-standee',
    title: 'People & Public Figure Standees',
    description: 'Plan actor, creator, historical figure, public speaker, or lookalike-style display ideas.',
    originalHeight: 78,
    cutoutImage: 'images/PeoplePublicFigureStandees/President/Nobackgroubd.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'music-artist-standee',
    title: 'Music Artist Standees',
    description: 'Explore concert-style standee categories with different performers, stage looks, and custom display choices.',
    originalHeight: 69,
    cutoutImage: 'images/FrontPageWeb/Music-MJackson-MJTR.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'faith-celebration-standee',
    title: 'Faith & Celebration Standees',
    description: 'View inspirational and celebration display categories for churches, holidays, events, rooms, and plays.',
    originalHeight: 72,
    cutoutImage: 'images/FrontPageWeb/Religious-J13D.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'holiday-standee',
    title: 'Holiday Standees',
    description: 'Seasonal displays for Christmas, Halloween, Easter, Valentine events, parties, and storefronts.',
    originalHeight: 78,
    cutoutImage: 'images/FrontPageWeb/Herobackgroundparts-hero8T.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'fan-request-standee',
    title: 'Fan Request Standees',
    description: 'See fan-inspired ideas, mashups, and custom concepts that can become full-size display pieces.',
    originalHeight: 69,
    cutoutImage: 'images/FrontPageWeb/Music-MJackson-MJzombie.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'dinosaur-party-standee',
    title: 'Dinosaur & Creature Standees',
    description: 'Shop dinosaur and creature-style displays for birthdays, rooms, outdoor setups, and big party moments.',
    originalHeight: 96,
    cutoutImage: 'images/FrontPageWeb/Dinosaurs-JPRex.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'game-fantasy-standee',
    title: 'Game & Fantasy Standees',
    description: 'Browse game-room, fantasy, stream, and themed-event standee categories with custom scene options.',
    originalHeight: 72,
    cutoutImage: 'images/FrontPageWeb/Herobackgroundparts-hero10E.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'custom-photo-standee',
    title: 'Custom Photo Standees',
    description: 'Turn your own photo, family member, athlete, or guest of honor into a custom standee display.',
    originalHeight: 66,
    cutoutImage: 'images/FrontPageWeb/Herobackgroundparts-hero7T.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'small-standee-party-pack',
    title: 'Party Pack Standees',
    description: 'Shop smaller standee packs for tables, birthdays, rooms, gifts, and party displays.',
    originalHeight: 36,
    cutoutImage: 'images/FrontPageWeb/Herobackgroundparts-hero8T.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  }
];

const adminCharacterProducts = (window.MVPLUX_PRODUCT_CATALOG || []).map((product) => ({ ...product }));

function clearLegacyAdminBrowserStorage() {
  localStorage.removeItem('mvpluxAdminAnywhereLegacy');
}

let adminLiveSettings = null;
let adminLiveRevision = 0;
let adminHomepageLiveEdits = {};
let adminPageLiveEdits = {};
let adminSiteEditRows = [];
let adminPublishedSettingsDocument = null;
let adminArchitectureState = null;
let adminSaveQueue = Promise.resolve(true);
let adminSavePending = 0;
let adminLastSaveSucceeded = null;
let adminLastSaveError = '';
let adminLatestPublishError = '';
let adminPublishedFileState = { reachable: false, publishedAt: null, commitHash: '' };
let adminTestModeState = { enabled: false, customerType: 'guest' };
let adminPotentiallyStale = false;
let adminCrossTabRefreshTimer = null;
let adminAccessReady = false;
let adminCommerceLoaded = false;
let adminDiscountCodesLoaded = false;
let adminTestModeLoaded = false;

const adminSaveChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('mvplux-admin-saves-v1') : null;

function announceAdminSave(scope, revision, keys = []) {
  const message = { source: adminTabId, scope, revision, keys, savedAt: new Date().toISOString() };
  adminSaveChannel?.postMessage(message);
  try {
    localStorage.setItem('mvpluxAdminSaveNotice', JSON.stringify(message));
  } catch (_error) {
    // Cross-tab notification is best-effort; authoritative saves do not depend on it.
  }
}

function receiveAdminSaveNotice(message) {
  if (!message || message.source === adminTabId) return;
  adminPotentiallyStale = true;
  setStatus('Another Admin tab saved newer changes. Authoritative data will be refreshed before your next save.');
  document.querySelectorAll('[data-product-save-state]').forEach((status) => {
    status.textContent = 'Potentially stale — server refresh required before saving';
    status.dataset.state = 'conflict';
  });
  clearTimeout(adminCrossTabRefreshTimer);
  adminCrossTabRefreshTimer = setTimeout(async () => {
    try {
      const settings = await loadAdminLiveSettings();
      if (!settings) return;
      adminArchitectureState = await buildAdminArchitectureState(settings);
      renderAdminProducts();
      renderAdminDashboard();
      renderPublishSummary();
      adminPotentiallyStale = false;
      setStatus('Newer saved Admin changes loaded.');
    } catch (error) {
      setStatus(`Could not refresh newer Admin changes. ${error?.message || error}`);
    }
  }, 100);
}

adminSaveChannel?.addEventListener('message', (event) => receiveAdminSaveNotice(event.data));
window.addEventListener('storage', (event) => {
  if (event.key !== 'mvpluxAdminSaveNotice' || !event.newValue) return;
  try { receiveAdminSaveNotice(JSON.parse(event.newValue)); } catch (_error) { /* Ignore invalid notices. */ }
});

function logAdminInitializationException(section, error) {
  const stack = String(error?.stack || '');
  const location = stack.match(/((?:https?:\/\/|file:\/\/|\/)[^\s():]+):(\d+):(\d+)/);
  console.error('[ADMIN] Initialization exception', {
    section,
    file: location?.[1] || 'unknown',
    line: location ? Number(location[2]) : 'unknown',
    column: location ? Number(location[3]) : 'unknown',
    type: error?.name || error?.constructor?.name || typeof error,
    message: error?.message || String(error),
    stack
  });
}

function getAdminClient() {
  return window.getMvpluxSupabaseClient?.() || null;
}

function getAdminLiveValue(key, fallback) {
  if (adminLiveSettings !== null) {
    if (Object.prototype.hasOwnProperty.call(adminLiveSettings, key)) return adminLiveSettings[key];
    if (Array.isArray(fallback)) return [];
    if (fallback && typeof fallback === 'object') return {};
    return fallback;
  }
  return fallback;
}

function updateAdminLiveSettings(patch) {
  adminLiveSettings = { ...(adminLiveSettings || {}), ...(patch || {}) };
  return adminLiveSettings;
}

async function loadAdminLiveSettings() {
  const client = getAdminClient();
  if (!client?.from) return null;

  const { data, error } = await client
    .from('site_edits')
    .select('page_key, edits, revision');

  if (error) {
    adminLastSaveError = `Supabase reload failed: ${error.message || 'unknown error'}`;
    renderAdminDiagnostics();
    return null;
  }
  adminSiteEditRows = structuredClone(data || []);
  const globalRow = data?.find((row) => row.page_key === 'admin-global');
  adminLiveSettings = globalRow?.edits || {};
  adminLiveRevision = Number(globalRow?.revision) || 0;
  adminHomepageLiveEdits = data?.find((row) => row.page_key === 'index.html')?.edits || {};
  adminPageLiveEdits = Object.fromEntries(
    (data || [])
      .filter((row) => row.page_key !== 'admin-global' && row.edits && typeof row.edits === 'object')
      .map((row) => [String(row.page_key || '').toLowerCase(), row.edits])
  );
  return adminLiveSettings;
}

const ADMIN_CATEGORY_CARD_MAP = {
  'sport-legend-standee': 'sports',
  'movie-character-standee': 'movie-characters',
  'people-public-figure-standee': 'people-public-figures',
  'music-artist-standee': 'music-artists',
  'faith-celebration-standee': 'faith-celebration',
  'holiday-standee': 'holiday',
  'fan-request-standee': 'fan-requests',
  'dinosaur-party-standee': 'dinosaur-animal',
  'game-fantasy-standee': 'video-game-fantasy',
  'custom-photo-standee': 'custom-photo',
  'small-standee-party-pack': 'small-party-packs'
};

async function buildAdminArchitectureState(settings = adminLiveSettings || {}) {
  const architecture = await adminArchitecturePromise;
  const publishedSnapshot = adminPublishedSettingsDocument?.snapshot || adminLastSuccessfulSnapshot || {};
  const candidate = architecture.buildNormalizedAdminCandidate({
    adminGlobal: settings,
    fallbackCatalog: adminCharacterProducts,
    publishedSnapshot,
    categoryDefinitions: window.MVPLUX_PRODUCT_CATEGORIES || [],
    categoryCardDefaults: adminProducts,
    categoryCardMap: ADMIN_CATEGORY_CARD_MAP
  });
  return {
    feature: architecture.architectureFeature(settings),
    candidate,
    diagnostics: architecture.architectureDiagnostics({ settings, candidate, siteEditRows: adminSiteEditRows })
  };
}

async function fetchAuthoritativeSiteEditRows() {
  const client = getAdminClient();
  const { data, error } = await client.from('site_edits').select('page_key, edits, revision');
  if (error) throw error;
  return structuredClone(data || []);
}

function adminBackupInputs(adminGlobal, siteEditRows, architecture) {
  return {
    checkpointCommit: architecture.ADMIN_ARCHITECTURE_ROLLBACK_COMMIT,
    adminGlobal,
    siteEditRows,
    publishedSettings: adminPublishedSettingsDocument || {},
    fallbackCatalog: adminCharacterProducts,
    categoryCardDefaults: adminProducts
  };
}

async function verifyStoredAdminArchitectureBackup() {
  const architecture = await adminArchitecturePromise;
  const rows = await fetchAuthoritativeSiteEditRows();
  const globalRow = rows.find((row) => row.page_key === 'admin-global') || { edits: {}, revision: 0 };
  const backup = globalRow.edits?.[architecture.ADMIN_ARCHITECTURE_BACKUP_KEY];
  const result = await architecture.verifyMigrationBackup({
    backup,
    currentAdminGlobal: globalRow.edits,
    currentSiteEditRows: rows,
    publishedSettings: adminPublishedSettingsDocument || {},
    fallbackCatalog: adminCharacterProducts,
    categoryCardDefaults: adminProducts
  });
  return { ...result, backup, rows, globalRow };
}

async function createAndVerifyAdminArchitectureBackup() {
  const architecture = await adminArchitecturePromise;
  if (!adminPublishedSettingsDocument || adminPublishedFileState.reachable !== true) {
    throw new Error('Recovery backup blocked because the published website snapshot could not be read. Check the connection and try again.');
  }
  const sourceRows = await fetchAuthoritativeSiteEditRows();
  const sourceGlobal = sourceRows.find((row) => row.page_key === 'admin-global') || { edits: {}, revision: 0 };
  const backup = await architecture.buildVerifiedMigrationBackup({
    ...adminBackupInputs(sourceGlobal.edits, sourceRows, architecture),
    sourceRevision: Number(sourceGlobal.revision) || 0
  });
  const { error } = await getAdminClient().rpc('save_site_edits', {
    p_page_key: 'admin-global',
    p_edits: { [architecture.ADMIN_ARCHITECTURE_BACKUP_KEY]: backup },
    p_expected_revision: Number(sourceGlobal.revision) || 0,
    p_replace: false
  });
  if (error) throw error;
  const readBack = await verifyStoredAdminArchitectureBackup();
  if (!readBack.ok) throw new Error(`Backup verification failed: ${readBack.errors.join(' ')}`);
  const verification = {
    verified: true,
    verifiedAt: new Date().toISOString(),
    checksum: readBack.checksum,
    sourceDigest: readBack.sourceDigest,
    siteEditRowCount: readBack.siteEditRowCount,
    siteEditIdentifiers: readBack.siteEditIdentifiers
  };
  const { data, error: verificationError } = await getAdminClient().rpc('save_site_edits', {
    p_page_key: 'admin-global',
    p_edits: { [architecture.ADMIN_ARCHITECTURE_VERIFICATION_KEY]: verification },
    p_expected_revision: Number(readBack.globalRow.revision) || 0,
    p_replace: false
  });
  if (verificationError) throw verificationError;
  adminLiveSettings = data?.edits || { ...readBack.globalRow.edits, [architecture.ADMIN_ARCHITECTURE_VERIFICATION_KEY]: verification };
  adminLiveRevision = Number(data?.revision) || Number(readBack.globalRow.revision) + 1;
  adminSiteEditRows = await fetchAuthoritativeSiteEditRows();
  adminArchitectureState = await buildAdminArchitectureState(adminLiveSettings);
  announceAdminSave('admin-global', adminLiveRevision, [architecture.ADMIN_ARCHITECTURE_BACKUP_KEY, architecture.ADMIN_ARCHITECTURE_VERIFICATION_KEY]);
  return readBack;
}

async function acquireAdminArchitectureMigrationLock(architecture) {
  const latest = await fetchAuthoritativeAdminGlobal();
  const currentLock = latest.edits?.[architecture.ADMIN_ARCHITECTURE_LOCK_KEY];
  if (architecture.migrationLockActive(currentLock) && currentLock.owner !== adminTabId) throw new Error('Another Admin tab is already preparing the migration.');
  const lock = { owner: adminTabId, acquiredAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() };
  const { error } = await getAdminClient().rpc('save_site_edits', {
    p_page_key: 'admin-global', p_edits: { [architecture.ADMIN_ARCHITECTURE_LOCK_KEY]: lock },
    p_expected_revision: latest.revision, p_replace: false
  });
  if (error) throw error;
  const readBack = await fetchAuthoritativeAdminGlobal();
  if (readBack.edits?.[architecture.ADMIN_ARCHITECTURE_LOCK_KEY]?.owner !== adminTabId) throw new Error('Migration lock could not be verified.');
  return readBack;
}

async function releaseAdminArchitectureMigrationLock(architecture) {
  const latest = await fetchAuthoritativeAdminGlobal();
  if (latest.edits?.[architecture.ADMIN_ARCHITECTURE_LOCK_KEY]?.owner !== adminTabId) return;
  await getAdminClient().rpc('save_site_edits', {
    p_page_key: 'admin-global', p_edits: { [architecture.ADMIN_ARCHITECTURE_LOCK_KEY]: null },
    p_expected_revision: latest.revision, p_replace: false
  });
}

async function prepareAdminArchitectureMigrationExplicitly() {
  const architecture = await adminArchitecturePromise;
  const verified = await verifyStoredAdminArchitectureBackup();
  if (!verified.ok) throw new Error(`Migration blocked: ${verified.errors.join(' ')}`);
  await acquireAdminArchitectureMigrationLock(architecture);
  try {
    const lockedVerification = await verifyStoredAdminArchitectureBackup();
    if (!lockedVerification.ok) throw new Error(`Migration blocked after lock: ${lockedVerification.errors.join(' ')}`);
    const state = await buildAdminArchitectureState(lockedVerification.globalRow.edits);
    const prepared = architecture.prepareAdminArchitectureMigration({ candidate: state.candidate, siteEditRows: lockedVerification.rows });
    const feature = {
      ...architecture.architectureFeature(lockedVerification.globalRow.edits),
      enabled: false,
      migrationPreparedAt: prepared.migration.preparedAt,
      migrationStatus: prepared.migration.status
    };
    const patch = {
      schemaVersion: architecture.ADMIN_ARCHITECTURE_SCHEMA_VERSION,
      products: prepared.products,
      categories: prepared.categories,
      globalDisplaySettings: prepared.globalDisplaySettings,
      [architecture.ADMIN_ARCHITECTURE_MIGRATION_KEY]: { ...prepared.migration, backupChecksum: lockedVerification.checksum },
      [architecture.ADMIN_ARCHITECTURE_FEATURE_KEY]: feature
    };
    const latest = await fetchAuthoritativeAdminGlobal();
    if (latest.edits?.[architecture.ADMIN_ARCHITECTURE_LOCK_KEY]?.owner !== adminTabId) throw new Error('Migration lock was lost before saving.');
    const { data, error } = await getAdminClient().rpc('save_site_edits', {
      p_page_key: 'admin-global', p_edits: patch, p_expected_revision: latest.revision, p_replace: false
    });
    if (error) throw error;
    adminLiveSettings = data?.edits || { ...latest.edits, ...patch };
    adminLiveRevision = Number(data?.revision) || latest.revision + 1;
    adminArchitectureState = await buildAdminArchitectureState(adminLiveSettings);
    announceAdminSave('admin-global', adminLiveRevision, ['products', 'categories', 'globalDisplaySettings', architecture.ADMIN_ARCHITECTURE_MIGRATION_KEY]);
    return prepared.migration;
  } finally {
    await releaseAdminArchitectureMigrationLock(architecture);
  }
}

function newAdminArchitectureEnabled() {
  return adminArchitectureState?.feature?.enabled === true;
}

function normalizedAdminStateAvailable() {
  return Boolean(adminLiveSettings && (
    (adminLiveSettings.products && typeof adminLiveSettings.products === 'object')
    || (adminLiveSettings.categories && typeof adminLiveSettings.categories === 'object')
  ));
}

function readAdminCategories() {
  return structuredClone(getAdminLiveValue('categories', {}));
}

function normalizedCategoryCardProducts() {
  return Object.values(readAdminCategories()).flatMap((category) => {
    if (!category?.card || !category.card.title) return [];
    const slug = Object.entries(ADMIN_CATEGORY_CARD_MAP).find(([, key]) => key === category.key)?.[0]
      || `${category.key}-category-card`;
    return [{
      slug,
      categoryKey: category.key,
      categoryCard: true,
      title: category.card.title,
      description: category.card.description,
      cutoutImage: category.card.image,
      backgroundImage: category.card.backgroundImage,
      visible: category.card.visible !== false,
      productOrder: category.card.order
    }];
  });
}

async function fetchAuthoritativeAdminGlobal() {
  const client = getAdminClient();
  if (!client?.from || !client?.auth) throw new Error('Supabase is not ready.');
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData?.session?.user) throw new Error('Sign in as admin to save live.');
  const { data, error } = await client
    .from('site_edits')
    .select('edits, revision')
    .eq('page_key', 'admin-global')
    .maybeSingle();
  if (error) throw error;
  return { edits: data?.edits || {}, revision: Number(data?.revision) || 0 };
}

function baseAdminProductForState(slug, settings = adminLiveSettings || {}) {
  const custom = (settings.customProducts || []).find((product) => product.slug === slug);
  return custom
    || adminProducts.find((product) => product.slug === slug)
    || adminCharacterProducts.find((product) => product.slug === slug)
    || {};
}

function setProductSaveState(form, message, state = '') {
  const status = form?.querySelector('[data-product-save-state]');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function refreshUntouchedProductFormFields(form, latestRecord, dirtyFields = form?._adminDirtyFields || new Set()) {
  if (!form || !latestRecord) return;
  ['title', 'description', 'cutoutImage', 'backgroundImage', 'originalHeight', 'cutoutHeight', 'cutoutLeft', 'cutoutBottom', 'logoWidth', 'logoTop', 'stageBackgroundPosition']
    .forEach((fieldName) => {
      if (dirtyFields.has(fieldName)) return;
      const field = form.elements.namedItem(fieldName);
      if (field && 'value' in field) field.value = latestRecord[fieldName] ?? '';
    });
  if (!dirtyFields.has('categories')) {
    const selected = new Set(latestRecord.categories || []);
    form.querySelectorAll('[name="categories"]').forEach((checkbox) => {
      checkbox.checked = selected.has(checkbox.value);
    });
  }
  if (!dirtyFields.has('visible')) {
    const visible = form.elements.namedItem('visible');
    if (visible) visible.checked = latestRecord.visible !== false;
  }
  form._adminRemoteRecord = structuredClone(latestRecord);
  syncPreviewFromFields(form);
}

function showProductSaveConflict(form, details, reapply) {
  form?.querySelector('[data-product-save-conflict]')?.remove();
  const conflictVersions = new Map((details.localFields || []).map((field) => [field, form?._adminDirtyVersions?.get(field) || 0]));
  const panel = document.createElement('div');
  panel.className = 'admin-save-conflict';
  panel.dataset.productSaveConflict = 'true';
  const remote = details.remoteFields.length ? details.remoteFields.join(', ') : 'none';
  const local = details.localFields.length ? details.localFields.join(', ') : 'none';
  panel.innerHTML = `
    <strong>Conflict — review required</strong>
    <p>Another Admin session or tab saved newer changes.</p>
    <p>Changed remotely: ${escapeAdminHtml(remote)}<br>Waiting locally: ${escapeAdminHtml(local)}</p>
    <div class="admin-card-actions">
      <button type="button" data-conflict-latest>Keep latest server values</button>
      <button type="button" data-conflict-reapply>Reapply my changed fields</button>
      <button type="button" data-conflict-cancel>Cancel and review</button>
    </div>
  `;
  const heading = form?.querySelector('.admin-product-heading');
  if (heading) heading.insertAdjacentElement('afterend', panel);
  else (document.getElementById('adminStatus')?.parentElement || document.body).appendChild(panel);
  panel.querySelector('[data-conflict-latest]')?.addEventListener('click', () => {
    panel.remove();
    renderAdminProducts();
    setStatus('Latest server values loaded. The rejected local changes were not saved.');
  });
  panel.querySelector('[data-conflict-reapply]')?.addEventListener('click', async () => {
    panel.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    const result = await reapply();
    if (!result?.ok) {
      panel.querySelectorAll('button').forEach((button) => { button.disabled = false; });
      return;
    }
    form._adminBaseRecord = structuredClone(result.record || form._adminRemoteRecord || form._adminBaseRecord || {});
    (details.localFields || []).forEach((field) => {
      if ((form._adminDirtyVersions?.get(field) || 0) === conflictVersions.get(field)) form._adminDirtyFields?.delete(field);
    });
    panel.remove();
    setProductSaveState(
      form,
      form._adminDirtyFields?.size ? `Unsaved changes: ${[...form._adminDirtyFields].join(', ')}` : 'Saved',
      form._adminDirtyFields?.size ? 'unsaved' : 'saved'
    );
  });
  panel.querySelector('[data-conflict-cancel]')?.addEventListener('click', () => {
    panel.remove();
    setProductSaveState(form, 'Conflict — local fields remain unsaved for review', 'conflict');
  });
}

async function saveAdminProductFieldPatch(slug, patch, baseRecord, form = null, force = false) {
  if (!slug || !Object.keys(patch || {}).length) return { ok: true, skipped: true };
  if (patch.approvalStatus === undefined) {
    patch = { ...patch, draftStatus: patch.draftStatus || 'ready', approvalStatus: 'draft', updatedAt: patch.updatedAt || new Date().toISOString() };
  }
  setProductSaveState(form, 'Saving', 'saving');
  try {
    const latest = await fetchAuthoritativeAdminGlobal();
    const latestRecord = {
      ...baseAdminProductForState(slug, latest.edits),
      ...(latest.edits.products?.[slug] || {})
    };
    const utils = await adminStateUtilsPromise;
    const analysis = utils.analyzeRecordPatch(baseRecord || {}, latestRecord, patch);
    adminLiveSettings = latest.edits;
    adminLiveRevision = latest.revision;
    adminPotentiallyStale = false;
    if (!force && !analysis.canRebase) {
      refreshUntouchedProductFormFields(form, latestRecord);
      setProductSaveState(form, 'Conflict — review required', 'conflict');
      showProductSaveConflict(form, analysis, () => saveAdminProductFieldPatch(slug, patch, latestRecord, form, true));
      return { ok: false, conflict: true, analysis };
    }

    const products = utils.applyRecordPatch(latest.edits.products || {}, slug, patch);
    const { data, error } = await getAdminClient().rpc('save_site_edits', {
      p_page_key: 'admin-global',
      p_edits: { products },
      p_expected_revision: latest.revision,
      p_replace: false
    });
    if (error) {
      if (String(error.code || '') === '40001' || String(error.message || '').includes('Admin state changed')) {
        const refreshed = await fetchAuthoritativeAdminGlobal();
        const refreshedRecord = {
          ...baseAdminProductForState(slug, refreshed.edits),
          ...(refreshed.edits.products?.[slug] || {})
        };
        const conflict = utils.analyzeRecordPatch(latestRecord, refreshedRecord, patch);
        adminLiveSettings = refreshed.edits;
        adminLiveRevision = refreshed.revision;
        refreshUntouchedProductFormFields(form, refreshedRecord);
        setProductSaveState(form, 'Conflict — review required', 'conflict');
        showProductSaveConflict(form, conflict, () => saveAdminProductFieldPatch(slug, patch, refreshedRecord, form, true));
        return { ok: false, conflict: true, analysis: conflict };
      }
      throw error;
    }
    adminLiveSettings = data?.edits || { ...latest.edits, products };
    adminLiveRevision = Number(data?.revision) || (latest.revision + 1);
    localStorage.setItem('mvpluxAdminProducts', JSON.stringify(adminLiveSettings.products || products));
    announceAdminSave('admin-global', adminLiveRevision, [`products:${slug}`]);
    setProductSaveState(form, 'Saved Privately', 'saved');
    return { ok: true, record: { ...latestRecord, ...patch }, revision: adminLiveRevision };
  } catch (error) {
    adminLastSaveError = error?.message || 'Unknown Supabase error.';
    setProductSaveState(form, 'Error — not saved', 'error');
    setStatus(`Live save failed: ${adminLastSaveError}`);
    return { ok: false, error };
  }
}

async function saveAdminProductFieldPatches(recordPatches, baseRecords = {}) {
  const entries = Object.entries(recordPatches || {}).filter(([, patch]) => Object.keys(patch || {}).length);
  if (!entries.length) return true;
  try {
    const latest = await fetchAuthoritativeAdminGlobal();
    const utils = await adminStateUtilsPromise;
    let products = { ...(latest.edits.products || {}) };
    const conflicts = [];
    entries.forEach(([slug, patch]) => {
      const latestRecord = { ...baseAdminProductForState(slug, latest.edits), ...(products[slug] || {}) };
      const analysis = utils.analyzeRecordPatch(baseRecords[slug] || latestRecord, latestRecord, patch);
      if (!analysis.canRebase) conflicts.push(`${slug}: ${analysis.conflictingFields.join(', ')}`);
      products = utils.applyRecordPatch(products, slug, patch);
    });
    adminLiveSettings = latest.edits;
    adminLiveRevision = latest.revision;
    if (conflicts.length) {
      setStatus(`Conflict — review required. ${conflicts.join('; ')}`);
      return false;
    }
    const { data, error } = await getAdminClient().rpc('save_site_edits', {
      p_page_key: 'admin-global',
      p_edits: { products },
      p_expected_revision: latest.revision,
      p_replace: false
    });
    if (error) throw error;
    adminLiveSettings = data?.edits || { ...latest.edits, products };
    adminLiveRevision = Number(data?.revision) || latest.revision + 1;
    localStorage.setItem('mvpluxAdminProducts', JSON.stringify(adminLiveSettings.products || products));
    announceAdminSave('admin-global', adminLiveRevision, entries.map(([slug]) => `products:${slug}`));
    return true;
  } catch (error) {
    if (String(error?.code || '') === '40001' || String(error?.message || '').includes('Admin state changed')) {
      try {
        const refreshed = await fetchAuthoritativeAdminGlobal();
        adminLiveSettings = refreshed.edits;
        adminLiveRevision = refreshed.revision;
      } catch (_reloadError) { /* Keep the original conflict as the reported failure. */ }
      setStatus('Conflict — review required. Another Admin tab changed product ordering; reload before trying again.');
      return false;
    }
    setStatus(`Error — not saved. ${error?.message || error}`);
    return false;
  }
}

const ADMIN_COLLECTION_STORAGE_KEYS = {
  products: 'mvpluxAdminProducts',
  customProducts: 'mvpluxAdminCustomProducts',
  savedForLaterProducts: 'mvpluxAdminArchivedProducts',
  deletedProducts: 'mvpluxDeletedProducts',
  imageDrafts: 'mvpluxImageDrafts',
  dismissedImageDrafts: 'mvpluxDismissedImageDrafts',
  configuredImagePaths: 'mvpluxConfiguredImagePaths',
  ignoredImagePaths: 'mvpluxIgnoredImagePaths',
  extraImages: 'mvpluxAdminExtraImages',
  coupons: 'mvpluxAdminCoupons'
};

function collectionRecord(collection, operation) {
  if (operation.identityKey) {
    return (Array.isArray(collection) ? collection : []).find((record) => record?.[operation.identityKey] === operation.entryKey);
  }
  return collection?.[operation.entryKey];
}

function applyCollectionRecordOperation(collection, operation) {
  if (operation.identityKey) {
    const records = [...(Array.isArray(collection) ? collection : [])];
    const index = records.findIndex((record) => record?.[operation.identityKey] === operation.entryKey);
    if (operation.remove) return records.filter((_, recordIndex) => recordIndex !== index);
    const record = { ...(index >= 0 ? records[index] : { [operation.identityKey]: operation.entryKey }), ...(operation.patch || {}) };
    if (index >= 0) records[index] = record;
    else records.push(record);
    return records;
  }
  const records = { ...(collection || {}) };
  if (operation.remove) delete records[operation.entryKey];
  else records[operation.entryKey] = { ...(records[operation.entryKey] || {}), ...(operation.patch || {}) };
  return records;
}

async function saveAdminCollectionOperations(operations) {
  const requested = (operations || []).filter(Boolean);
  if (!requested.length) return { ok: true, skipped: true };
  adminSavePending += 1;
  renderAdminDiagnostics();

  const save = async () => {
    try {
      const latest = await fetchAuthoritativeAdminGlobal();
      const utils = await adminStateUtilsPromise;
      const collections = {};
      const conflicts = [];

      requested.forEach((operation) => {
        const source = Object.prototype.hasOwnProperty.call(collections, operation.collectionKey)
          ? collections[operation.collectionKey]
          : structuredClone(latest.edits?.[operation.collectionKey] ?? (operation.type === 'membership' ? [] : {}));

        if (operation.type === 'record') {
          const latestRecord = collectionRecord(source, operation);
          if (operation.remove) {
            const analysis = utils.analyzeValuePatch(operation.baseRecord, latestRecord, undefined);
            if (!analysis.canRebase) conflicts.push(`${operation.collectionKey}:${operation.entryKey}`);
          } else {
            const analysis = utils.analyzeRecordPatch(operation.baseRecord || {}, latestRecord || {}, operation.patch || {});
            if (!analysis.canRebase) conflicts.push(`${operation.collectionKey}:${operation.entryKey}:${analysis.conflictingFields.join(',')}`);
          }
          collections[operation.collectionKey] = applyCollectionRecordOperation(source, operation);
          return;
        }

        if (operation.type === 'value') {
          const latestValue = source?.[operation.entryKey];
          const intendedValue = operation.remove ? undefined : operation.value;
          const analysis = utils.analyzeValuePatch(operation.baseValue, latestValue, intendedValue);
          if (!analysis.canRebase) conflicts.push(`${operation.collectionKey}:${operation.entryKey}`);
          const next = { ...(source || {}) };
          if (operation.remove) delete next[operation.entryKey];
          else next[operation.entryKey] = intendedValue;
          collections[operation.collectionKey] = next;
          return;
        }

        if (operation.type === 'membership') {
          const analysis = utils.analyzeMembershipPatch(operation.baseValues || [], source || [], operation.entryKey, operation.present);
          if (!analysis.canRebase) conflicts.push(`${operation.collectionKey}:${operation.entryKey}`);
          collections[operation.collectionKey] = utils.applyMembershipPatch(source || [], operation.entryKey, operation.present);
        }
      });

      adminLiveSettings = latest.edits;
      adminLiveRevision = latest.revision;
      adminPotentiallyStale = false;
      if (conflicts.length) {
        adminLastSaveSucceeded = false;
        adminLastSaveError = `Newer server changes overlap: ${conflicts.join('; ')}.`;
        setStatus(`Conflict — review required. Newer server changes overlap: ${conflicts.join('; ')}.`);
        return { ok: false, conflict: true, conflicts };
      }

      const { data, error } = await getAdminClient().rpc('save_site_edits', {
        p_page_key: 'admin-global',
        p_edits: collections,
        p_expected_revision: latest.revision,
        p_replace: false
      });
      if (error) throw error;

      adminLiveSettings = { ...latest.edits, ...collections, ...(data?.edits || {}) };
      adminLiveRevision = Number(data?.revision) || latest.revision + 1;
      Object.keys(collections).forEach((key) => {
        const storageKey = ADMIN_COLLECTION_STORAGE_KEYS[key];
        if (storageKey) localStorage.setItem(storageKey, JSON.stringify(adminLiveSettings[key]));
      });
      adminLastSaveSucceeded = true;
      adminLastSaveError = '';
      announceAdminSave('admin-global', adminLiveRevision, requested.map((operation) => `${operation.collectionKey}:${operation.entryKey}`));
      return { ok: true, edits: adminLiveSettings, revision: adminLiveRevision };
    } catch (error) {
      if (String(error?.code || '') === '40001' || String(error?.message || '').includes('Admin state changed')) {
        try {
          const refreshed = await fetchAuthoritativeAdminGlobal();
          adminLiveSettings = refreshed.edits;
          adminLiveRevision = refreshed.revision;
        } catch (_reloadError) { /* Preserve the original conflict. */ }
        setStatus('Conflict — review required. Another Admin tab saved newer changes; reload and review before saving again.');
      } else {
        setStatus(`Error — not saved. ${error?.message || error}`);
      }
      adminLastSaveSucceeded = false;
      adminLastSaveError = error?.message || String(error);
      return { ok: false, error };
    } finally {
      adminSavePending = Math.max(0, adminSavePending - 1);
      renderAdminDiagnostics();
      renderPublishSummary();
    }
  };

  const result = adminSaveQueue.then(save, save);
  adminSaveQueue = result.then(() => true, () => true);
  return result;
}

function saveAdminCustomProductFieldPatch(slug, patch, baseRecord) {
  return saveAdminCollectionOperations([{
    type: 'record',
    collectionKey: 'customProducts',
    identityKey: 'slug',
    entryKey: slug,
    baseRecord: structuredClone(baseRecord),
    patch: withoutStoredProductPrice(patch || {})
  }]);
}

function saveAdminExtraImagePatch(key, value, baseValue, remove = false) {
  return saveAdminCollectionOperations([{
    type: 'value', collectionKey: 'extraImages', entryKey: key, baseValue, value, remove
  }]);
}

function saveAdminArchiveMembership(slug, present, baseValues = readArchivedProducts()) {
  return saveAdminCollectionOperations([{
    type: 'membership', collectionKey: 'savedForLaterProducts', entryKey: slug, present, baseValues
  }]);
}

function saveAdminImageDraftPatch(path, patch, baseRecord, remove = false) {
  return saveAdminCollectionOperations([{
    type: 'record', collectionKey: 'imageDrafts', entryKey: path, baseRecord, patch, remove
  }]);
}

async function saveAdminSettingsLive(patch) {
  const baseSettings = structuredClone(adminLiveSettings || {});
  adminSavePending += 1;
  renderAdminDiagnostics();

  const save = async () => {
    try {
      const latest = await fetchAuthoritativeAdminGlobal();
      const utils = await adminStateUtilsPromise;
      const conflictingKeys = Object.keys(patch || {}).filter((key) => (
        !utils.valuesEqual(baseSettings[key], latest.edits[key])
        && !utils.valuesEqual(patch[key], latest.edits[key])
      ));
      adminLiveSettings = latest.edits;
      adminLiveRevision = latest.revision;
      adminPotentiallyStale = false;
      if (conflictingKeys.length) {
        throw new Error(`Conflict — review required. Newer server changes exist in: ${conflictingKeys.join(', ')}.`);
      }
      const { data, error } = await getAdminClient().rpc('save_site_edits', {
        p_page_key: 'admin-global',
        p_edits: patch || {},
        p_expected_revision: latest.revision,
        p_replace: false
      });
      if (error) throw error;
      adminLiveSettings = data?.edits || { ...latest.edits, ...(patch || {}) };
      adminLiveRevision = Number(data?.revision) || (latest.revision + 1);

      adminLastSaveSucceeded = true;
      adminLastSaveError = '';
      announceAdminSave('admin-global', adminLiveRevision, Object.keys(patch || {}));
      return true;
    } catch (error) {
      if (String(error?.code || '') === '40001' || String(error?.message || '').includes('Admin state changed')) {
        try {
          const refreshed = await fetchAuthoritativeAdminGlobal();
          adminLiveSettings = refreshed.edits;
          adminLiveRevision = refreshed.revision;
        } catch (_reloadError) { /* Keep the original conflict as the reported failure. */ }
      }
      adminLastSaveSucceeded = false;
      adminLastSaveError = error?.message || 'Unknown Supabase error.';
      setStatus(`Live save failed: ${adminLastSaveError}`);
      return false;
    } finally {
      adminSavePending = Math.max(0, adminSavePending - 1);
      renderAdminDiagnostics();
      renderPublishSummary();
    }
  };

  const result = adminSaveQueue.then(save, save);
  adminSaveQueue = result.then(() => true, () => true);
  return result;
}

async function waitForAdminSaves() {
  await adminSaveQueue;
  return adminLastSaveSucceeded !== false;
}

async function requireSupabaseAdminAccess() {
  console.log('[ADMIN] Authorization started');
  try {
    const client = getAdminClient();
    if (!client?.auth) {
      setCommerceStatus('Supabase is not loaded yet.');
      return false;
    }

    const { data: sessionData } = await client.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) {
      window.location.href = 'signin.html';
      return false;
    }

    setAdminSignedInAs(`Signed in as ${user.email || 'admin user'}`);

    const { data, error } = await client
      .from('admin_profiles')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !data) {
      localStorage.removeItem('mvpluxAdminSignedIn');
      setCommerceStatus(`You are signed in as ${user.email || 'this account'}, but it is not admin yet. In Supabase, add this user ID to admin_profiles: ${user.id}`);
      return false;
    }

    localStorage.removeItem('mvpluxAdminSignedIn');
    localStorage.setItem('mvpluxCustomerSignedIn', 'true');
    localStorage.setItem('mvpluxSignedInName', user.user_metadata?.screen_name || user.email?.split('@')[0] || 'Admin');
    console.log('[ADMIN] Authorization passed');
    return true;
  } catch (error) {
    logAdminInitializationException('Authorization', error);
    throw error;
  }
}

function renderAdminTestMode() {
  const enabled = Boolean(adminTestModeState.enabled);
  const warning = document.getElementById('adminTestModeWarning');
  const checkbox = document.getElementById('adminTestModeEnabled');
  const customerType = document.getElementById('adminTestCustomerType');
  if (warning) warning.hidden = !enabled;
  if (checkbox) checkbox.checked = enabled;
  if (customerType) {
    customerType.value = adminTestModeState.customerType || 'guest';
    customerType.disabled = !enabled;
  }
  document.body.classList.toggle('admin-test-mode-active', enabled);
}

async function loadAdminTestMode() {
  const client = getAdminClient();
  if (!client) return;
  const { data, error } = await client.rpc('get_admin_test_mode');
  if (error) {
    setCommerceStatus(`Test Mode is unavailable until its database migration is applied. ${error.message || error}`);
    return;
  }
  adminTestModeState = {
    enabled: Boolean(data?.enabled),
    customerType: data?.customer_type === 'member' ? 'member' : 'guest'
  };
  adminTestModeLoaded = true;
  renderAdminTestMode();
}

function setupAdminTestMode() {
  const form = document.getElementById('adminTestModeForm');
  const checkbox = document.getElementById('adminTestModeEnabled');
  checkbox?.addEventListener('change', () => {
    const customerType = document.getElementById('adminTestCustomerType');
    if (customerType) customerType.disabled = !checkbox.checked;
  });
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const client = getAdminClient();
    const button = form.querySelector('button[type="submit"]');
    if (!client || !button) return;
    button.disabled = true;
    button.textContent = 'Saving...';
    const enabled = Boolean(checkbox?.checked);
    const customerType = document.getElementById('adminTestCustomerType')?.value === 'member' ? 'member' : 'guest';
    const { data, error } = await client.rpc('set_admin_test_mode', {
      p_enabled: enabled,
      p_customer_type: customerType
    });
    button.disabled = false;
    button.textContent = 'Save Test Mode';
    if (error) {
      setCommerceStatus(`Could not save Test Mode. ${error.message || error}`);
      await loadAdminTestMode();
      return;
    }
    adminTestModeState = { enabled: Boolean(data?.enabled), customerType: data?.customer_type || customerType };
    renderAdminTestMode();
    setCommerceStatus(enabled
      ? 'TEST MODE enabled. No real payment destinations or customer emails will be used for test records.'
      : 'Test Mode is off. Normal customer behavior is active.');
  });
}

const extraImageItems = [
  { key: 'wanted-basketball-cutout', group: 'Most Wanted', label: 'Sport Legend standee', fallback: 'images/FrontPageWeb/Sports-Kobe-KB1forprint.png' },
  { key: 'wanted-basketball-bg', group: 'Most Wanted', label: 'Basketball Legend background', fallback: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-premium.jpg' },
  { key: 'wanted-movie-cutout', group: 'Most Wanted', label: 'Movie Inspired standee', fallback: 'images/MovieCharacterStandees/Endorskeleton/Endornobackground.png' },
  { key: 'wanted-movie-bg', group: 'Most Wanted', label: 'Movie Inspired background', fallback: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-premium.jpg' },
  { key: 'wanted-music-cutout', group: 'Most Wanted', label: 'Music Artist standee', fallback: 'images/FrontPageWeb/Music-MJackson-MJTR.png' },
  { key: 'wanted-music-bg', group: 'Most Wanted', label: 'Music Artist background', fallback: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-premium.jpg' },
  { key: 'wanted-dinosaur-cutout', group: 'Most Wanted', label: 'Dinosaur Movie standee', fallback: 'images/FrontPageWeb/Dinosaurs-JPRex.png' },
  { key: 'wanted-dinosaur-bg', group: 'Most Wanted', label: 'Dinosaur Movie background', fallback: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-premium.jpg' },
  { key: 'wanted-custom-cutout', group: 'Most Wanted', label: 'Custom Mashup standee', fallback: 'images/FrontPageWeb/Music-MJackson-MJzombie.png' },
  { key: 'wanted-custom-bg', group: 'Most Wanted', label: 'Custom Mashup background', fallback: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-premium.jpg' },
  { key: 'gallery-hero-cutout', group: 'Gallery', label: 'Golden Hero standee', fallback: 'images/FrontPageWeb/Religious-J13D.png' },
  { key: 'gallery-hero-bg', group: 'Gallery', label: 'Golden Hero background', fallback: 'images/FrontPageWeb/FanBackgrounds-gallery-poster-heroic.jpg' },
  { key: 'gallery-adventure-cutout', group: 'Gallery', label: 'Dinosaur Movie Night standee', fallback: 'images/FrontPageWeb/Dinosaurs-JPRex.png' },
  { key: 'gallery-adventure-bg', group: 'Gallery', label: 'Dinosaur Movie Night background', fallback: 'images/FrontPageWeb/FanBackgrounds-gallery-poster-adventure.jpg' },
  { key: 'gallery-vip-cutout', group: 'Gallery', label: 'VIP Spotlight standee', fallback: 'images/FrontPageWeb/Music-TS-TSfinal.png' },
  { key: 'gallery-vip-bg', group: 'Gallery', label: 'VIP Spotlight background', fallback: 'images/FrontPageWeb/FanBackgrounds-gallery-poster-premium.jpg' }
];

function withoutStoredProductPrice(product = {}) {
  const { originalPrice, ...heightBasedProduct } = product;
  return heightBasedProduct;
}

function cleanAdminProductMap(products = {}) {
  return Object.fromEntries(
    Object.entries(products || {}).map(([slug, product]) => [slug, withoutStoredProductPrice(product)])
  );
}

function readAdminProducts() {
  return cleanAdminProductMap(getAdminLiveValue('products', readJsonStorage('mvpluxAdminProducts', {})));
}

function readCustomProducts() {
  if (newAdminArchitectureEnabled()) return [];
  return getAdminLiveValue('customProducts', readJsonStorage('mvpluxAdminCustomProducts', []))
    .map(withoutStoredProductPrice);
}

function normalizeImageChoices(choices = []) {
  const seen = new Set();
  return (Array.isArray(choices) ? choices : []).flatMap((choice) => {
    const image = String(choice?.image || '').trim();
    const stage = String(choice?.stage || '').trim();
    const identity = `${image}\u0000${stage}`;
    if (!image || seen.has(identity)) return [];
    seen.add(identity);
    const role = String(choice?.role || '').trim();
    return [{
      label: String(choice?.label || '').trim() || 'Alternate image',
      image,
      ...(stage ? { stage } : {}),
      ...(role ? { role } : {})
    }];
  });
}

function readArchivedProducts() {
  return [...getAdminLiveValue('savedForLaterProducts', readJsonStorage('mvpluxAdminArchivedProducts', []))];
}

function readDeletedProducts() {
  return [...getAdminLiveValue('deletedProducts', readJsonStorage('mvpluxDeletedProducts', []))];
}

function readPriceSettings() {
  return { ...getAdminLiveValue('priceSettings', readJsonStorage('mvpluxAdminPriceSettings', {})) };
}

async function writePriceSettings(settings) {
  const values = settings || {};
  if (!await saveAdminSettingsLive({ priceSettings: values })) return null;
  localStorage.setItem('mvpluxAdminPriceSettings', JSON.stringify(values));
  return values;
}

function readExtraImages() {
  return structuredClone(getAdminLiveValue('extraImages', readJsonStorage('mvpluxAdminExtraImages', {})));
}

async function writeExtraImages(images) {
  const values = images || {};
  if (!await saveAdminSettingsLive({ extraImages: values })) return null;
  localStorage.setItem('mvpluxAdminExtraImages', JSON.stringify(values));
  return values;
}

function readCoupons() {
  return getAdminLiveValue('coupons', readJsonStorage('mvpluxAdminCoupons', []));
}

async function writeCoupons(coupons) {
  const values = coupons || [];
  if (!await saveAdminSettingsLive({ coupons: values })) return null;
  localStorage.setItem('mvpluxAdminCoupons', JSON.stringify(values));
  return values;
}

function readJsonStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch (error) {
    return fallback;
  }
}

function buildAdminExport() {
  return {
    exportedAt: new Date().toISOString(),
    note: 'These edits are saved live when Supabase is available.',
    products: readAdminProducts(),
    customProducts: readCustomProducts(),
    savedForLaterProducts: readArchivedProducts(),
    deletedProducts: readDeletedProducts(),
    imageDrafts: readImageDraftEdits(),
    dismissedImageDrafts: readImageDraftPaths('dismissedImageDrafts'),
    configuredImagePaths: readImageDraftPaths('configuredImagePaths'),
    ignoredImagePaths: readImageDraftPaths('ignoredImagePaths'),
    priceSettings: readPriceSettings(),
    extraImages: readExtraImages(),
    coupons: readCoupons(),
    pageEdits: readJsonStorage('mvpluxInlineAdminEdits', {}),
    cardsSavedForLater: getAdminLiveValue('cardsSavedForLater', readJsonStorage('mvpluxInlineHiddenCards', {}))
  };
}

function renderAdminExportPreview(exportData = buildAdminExport()) {
  const preview = document.getElementById('adminExportPreview');
  const json = JSON.stringify(exportData, null, 2);
  if (preview) preview.value = json;
  return json;
}

function normalizedCategoryOrder(order = {}) {
  return Object.fromEntries(
    Object.entries(order || {})
      .filter(([, value]) => Number.isFinite(Number(value)))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, Number(value)])
  );
}

function publishImageReference(value) {
  const reference = String(value || '');
  if (!reference.startsWith('data:image/')) return reference;
  let hash = 2166136261;
  for (let index = 0; index < reference.length; index += 1) {
    hash ^= reference.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const mime = reference.slice(5, reference.indexOf(';') > 5 ? reference.indexOf(';') : 32);
  return `admin-upload:${mime}:${reference.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function publishableNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function publishablePageVisualStates(baseline = {}) {
  const pages = structuredClone(baseline || {});
  Object.entries(adminPageLiveEdits || {}).forEach(([pageKey, edits]) => {
    const visualStates = { ...(pages[pageKey] || {}) };
    Object.entries(edits || {}).forEach(([elementKey, edit]) => {
      if (!edit || typeof edit !== 'object' || edit.type) return;
      if (edit.approvalStatus === 'draft') return;
      if (newAdminArchitectureEnabled() && /^product-.+-(?:title-link|title-heading|description|product-cutout|product-stage-bg|original-choice|original-size-label)$/i.test(elementKey)) return;
      const hasGeometry = ['x', 'y', 'scale', 'rotate'].some((field) => Number.isFinite(Number(edit[field])));
      if (!hasGeometry) return;
      visualStates[elementKey] = {
        x: publishableNumber(edit.x, 0, -140, 140),
        y: publishableNumber(edit.y, 0, -140, 140),
        scale: publishableNumber(edit.scale, 1, 0.45, 2.1),
        rotate: publishableNumber(edit.rotate, 0, -28, 28)
      };
    });
    if (Object.keys(visualStates).length) pages[pageKey] = visualStates;
  });
  return pages;
}

function publishableProduct(product = {}, archived = false) {
  return {
    slug: product.slug,
    ...(product.custom === true ? { custom: true } : {}),
    title: String(product.title || product.slug || 'Untitled product'),
    description: String(product.description || ''),
    funFact: String(product.funFact || ''),
    cutoutImage: publishImageReference(product.cutoutImage),
    backgroundImage: publishImageReference(product.backgroundImage),
    imageChoices: normalizeImageChoices(product.imageChoices).map((choice) => ({
      label: choice.label,
      image: publishImageReference(choice.image),
      ...(choice.stage ? { stage: publishImageReference(choice.stage) } : {}),
      ...(choice.role ? { role: choice.role } : {})
    })),
    originalHeight: String(product.originalHeight || ''),
    ...(Number.isFinite(Number(product.priceOverride)) && product.priceOverride !== '' && product.priceOverride !== null
      ? { priceOverride: Number(product.priceOverride) }
      : {}),
    cutoutHeight: String(product.cutoutHeight || ''),
    cutoutLeft: String(product.cutoutLeft || ''),
    cutoutBottom: String(product.cutoutBottom || ''),
    logoWidth: String(product.logoWidth || ''),
    logoTop: String(product.logoTop || ''),
    stageBackgroundPosition: String(product.stageBackgroundPosition || ''),
    categories: [...new Set(product.categories || [])].sort(),
    visible: !archived && product.visible !== false,
    categoryOrder: normalizedCategoryOrder(product.categoryOrder),
    ...(Number.isFinite(Number(product.productOrder)) ? { productOrder: Number(product.productOrder) } : {}),
    displayOverrides: structuredClone(product.displayOverrides || {})
  };
}

function publishableCategory(category = {}) {
  return {
    key: String(category.key || ''),
    title: String(category.title || category.key || 'Untitled category'),
    description: String(category.description || ''),
    funFact: String(category.funFact || ''),
    page: String(category.page || ''),
    visible: category.visible !== false,
    order: Number(category.order || 0),
    card: {
      title: String(category.card?.title || category.title || ''),
      description: String(category.card?.description || ''),
      image: publishImageReference(category.card?.image || ''),
      backgroundImage: publishImageReference(category.card?.backgroundImage || ''),
      visible: category.card?.visible !== false,
      order: Number(category.card?.order || 0)
    },
    displaySettings: structuredClone(category.displaySettings || { backgroundPosition: 'center center' })
  };
}

function publishablePageContent(baseline = {}) {
  const pageContent = structuredClone(baseline || {});
  Object.entries(adminPageLiveEdits || {}).forEach(([pageKey, edits]) => {
    const entries = { ...(pageContent[pageKey] || {}) };
    Object.entries(edits || {}).forEach(([elementKey, edit]) => {
      if (!edit || typeof edit !== 'object' || edit.type) return;
      if (edit.approvalStatus === 'draft') return;
      if (newAdminArchitectureEnabled() && /^product-.+-(?:title-link|title-heading|description|product-cutout|product-stage-bg|original-choice|original-size-label)$/i.test(elementKey)) return;
      const content = {};
      if (typeof edit.text === 'string') content.text = edit.text;
      if (typeof edit.src === 'string' && validatePublishImagePath(edit.src)) content.src = edit.src;
      if (edit.visible === false) content.visible = false;
      if (Object.keys(content).length) entries[elementKey] = content;
    });
    if (Object.keys(entries).length) pageContent[pageKey] = entries;
  });
  return pageContent;
}

function publishableSnapshotProduct(baseProduct, value, archived) {
  const published = publishableProduct(value, archived);
  if (published.cutoutImage.startsWith('admin-upload:')) {
    published.cutoutImage = publishImageReference(baseProduct.cutoutImage);
  }
  if (published.backgroundImage.startsWith('admin-upload:')) {
    published.backgroundImage = publishImageReference(baseProduct.backgroundImage);
  }
  published.imageChoices = published.imageChoices.filter((choice) => (
    !choice.image.startsWith('admin-upload:') && !String(choice.stage || '').startsWith('admin-upload:')
  ));
  return published;
}

function buildDefaultPublishBaseline() {
  return {
    version: 1,
    schemaVersion: 1,
    priceSettings: window.MVPLUX_PRICING.normalizePriceSettings({}),
    products: Object.fromEntries(adminCharacterProducts.map((product) => [product.slug, publishableProduct(product)])),
    categoryDisplayCards: Object.fromEntries(adminProducts.map((product) => [product.slug, publishableProduct(product)])),
    deletedProducts: [],
    homepageCategoryOrder: [],
    ignoredImagePaths: [],
    pageVisualStates: {},
    extraImages: {},
    categories: {},
    categorySettings: {},
    globalDisplaySettings: {},
    pageContent: {}
  };
}

function buildCurrentPublishSnapshot() {
  if (newAdminArchitectureEnabled()) return buildNormalizedPublishSnapshot();
  const saved = readAdminProducts();
  const archived = new Set(readArchivedProducts());
  const deleted = new Set(readDeletedProducts());
  const products = {};
  const categoryDisplayCards = {};

  allAdminProducts().forEach((product) => {
    if (!product?.slug || deleted.has(product.slug)) return;
    const value = { ...product, ...(saved[product.slug] || {}) };
    const target = product.categoryCard ? categoryDisplayCards : products;
    target[product.slug] = publishableSnapshotProduct(product, value, archived.has(product.slug));
  });

  const homepageOrder = adminHomepageLiveEdits?.['homepage-category-card-order'];

  return {
    version: 1,
    priceSettings: window.MVPLUX_PRICING.normalizePriceSettings(readPriceSettings()),
    products,
    categoryDisplayCards,
    deletedProducts: [...deleted].sort(),
    ignoredImagePaths: [...new Set(readImageDraftPaths('ignoredImagePaths'))].sort(),
    homepageCategoryOrder: homepageOrder?.type === 'homepageCategoryOrder' && Array.isArray(homepageOrder.rows)
      ? homepageOrder.rows.map((row) => [...row])
      : [],
    pageVisualStates: publishablePageVisualStates(),
    extraImages: Object.fromEntries(
      Object.entries(readExtraImages()).filter(([, path]) => validatePublishImagePath(String(path || '')))
    )
  };
}

function buildNormalizedPublishSnapshot() {
  const archived = new Set(readArchivedProducts());
  const deleted = new Set(readDeletedProducts());
  const published = adminPublishedBaseline || buildDefaultPublishBaseline();
  const products = { ...(published.products || {}) };
  const privateProducts = readAdminProducts();
  Object.entries(privateProducts).forEach(([slug, product]) => {
    if (deleted.has(slug)) {
      delete products[slug];
      return;
    }
    if (product.approvalStatus === 'draft') return;
    products[slug] = publishableSnapshotProduct(product, product, archived.has(slug));
  });

  const categories = { ...(published.categories || {}) };
  Object.entries(readAdminCategories()).forEach(([key, category]) => {
    if (category.approvalStatus === 'draft') return;
    categories[key] = publishableCategory({ ...category, key });
  });
  const categoryDisplayCards = { ...(published.categoryDisplayCards || {}) };
  Object.values(categories).forEach((category) => {
    const slug = Object.entries(ADMIN_CATEGORY_CARD_MAP).find(([, key]) => key === category.key)?.[0]
      || `${category.key}-category-card`;
    categoryDisplayCards[slug] = publishableProduct({
      slug,
      title: category.card?.title || category.title,
      description: category.card?.description || category.description,
      cutoutImage: category.card?.image || '',
      backgroundImage: category.card?.backgroundImage || '',
      visible: category.visible !== false && category.card?.visible !== false,
      productOrder: category.card?.order ?? category.order,
      categories: []
    });
  });
  const homepageOrder = adminHomepageLiveEdits?.['homepage-category-card-order'];
  return {
    version: 1,
    schemaVersion: 2,
    products,
    categories,
    categoryDisplayCards,
    categorySettings: Object.fromEntries(Object.entries(categories).map(([key, category]) => [key, structuredClone(category.displaySettings || {})])),
    globalDisplaySettings: structuredClone(adminLiveSettings?.globalDisplaySettings || {}),
    deletedProducts: [...deleted].sort(),
    ignoredImagePaths: [...new Set(readImageDraftPaths('ignoredImagePaths'))].sort(),
    homepageCategoryOrder: homepageOrder?.type === 'homepageCategoryOrder' && Array.isArray(homepageOrder.rows)
      ? homepageOrder.rows.map((row) => [...row]) : [],
    pageContent: publishablePageContent(published.pageContent),
    pageVisualStates: publishablePageVisualStates(published.pageVisualStates),
    extraImages: Object.fromEntries(Object.entries(readExtraImages()).filter(([, path]) => validatePublishImagePath(String(path || '')))),
    priceSettings: window.MVPLUX_PRICING.normalizePriceSettings(readPriceSettings())
  };
}

function categoryPublishLabel(key) {
  return (window.MVPLUX_PRODUCT_CATEGORIES || []).find((category) => category.key === key)?.label || key;
}

function productPublishTitle(product, fallbackSlug = '') {
  return product?.title || fallbackSlug.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatPublishedHeight(value) {
  const text = String(value || '').trim();
  return /^\d+$/.test(text) ? `${text}"` : text || 'not set';
}

function addPublishImageLine(lines, seenImages, prefix, path) {
  if (!path) return;
  lines.push(`${prefix}: ${path}`);
  seenImages.add(path);
}

function summarizeHomepageOrder(beforeRows = [], afterRows = []) {
  if (JSON.stringify(beforeRows) === JSON.stringify(afterRows)) return [];
  if (!beforeRows.length || !afterRows.length) return ['Changed homepage category card order'];

  const beforePositions = new Map();
  beforeRows.forEach((row, rowIndex) => row.forEach((slug, index) => beforePositions.set(slug, `${rowIndex}:${index}`)));
  const titles = new Map(adminProducts.map((product) => [product.slug, product.title]));
  const changes = [];
  afterRows.forEach((row, rowIndex) => row.forEach((slug, index) => {
    if (beforePositions.get(slug) === `${rowIndex}:${index}`) return;
    changes.push(`Moved ${titles.get(slug) || productPublishTitle(null, slug)} to row ${rowIndex + 1}, position ${index + 1}`);
  }));
  return changes.length ? changes : ['Changed homepage category card order'];
}

function generatePublishChanges(before, after) {
  const lines = [];
  const seenImages = new Set();
  if (JSON.stringify(before?.priceSettings || {}) !== JSON.stringify(after?.priceSettings || {})) {
    lines.push('Updated published price settings');
  }
  const beforeProducts = { ...(before?.categoryDisplayCards || {}), ...(before?.products || {}) };
  const afterProducts = { ...(after?.categoryDisplayCards || {}), ...(after?.products || {}) };
  const slugs = [...new Set([...Object.keys(beforeProducts), ...Object.keys(afterProducts)])].sort();

  slugs.forEach((slug) => {
    const previous = beforeProducts[slug];
    const current = afterProducts[slug];
    const title = productPublishTitle(current || previous, slug);

    if (!previous && current) {
      lines.push(`Created product/card: ${title}`);
      addPublishImageLine(lines, seenImages, `Added cutout image for ${title}`, current.cutoutImage);
      addPublishImageLine(lines, seenImages, `Added background image for ${title}`, current.backgroundImage);
      normalizeImageChoices(current.imageChoices).forEach((choice) => {
        addPublishImageLine(lines, seenImages, `Added image choice ${choice.label} for ${title}`, choice.image);
      });
      if (current.categories.length) {
        lines.push(`Assigned ${title} to ${current.categories.map(categoryPublishLabel).join(' and ')}`);
      }
      if (!current.visible) lines.push(`Created ${title} as hidden`);
      return;
    }

    if (previous && !current) {
      lines.push(`Deleted product/card: ${title}`);
      return;
    }

    if (previous.title !== current.title) lines.push(`Changed title from ${previous.title} to ${current.title}`);
    if (previous.description !== current.description) lines.push(`Changed description for ${title}`);
    if (previous.originalHeight !== current.originalHeight) {
      lines.push(`Changed ${title} original height from ${formatPublishedHeight(previous.originalHeight)} to ${formatPublishedHeight(current.originalHeight)}`);
    }
    if (previous.cutoutImage !== current.cutoutImage) {
      lines.push(`Changed cutout image for ${title} from ${previous.cutoutImage || 'not set'} to ${current.cutoutImage || 'not set'}`);
      if (current.cutoutImage) seenImages.add(current.cutoutImage);
    }
    if (previous.backgroundImage !== current.backgroundImage) {
      lines.push(`Changed background image for ${title} from ${previous.backgroundImage || 'not set'} to ${current.backgroundImage || 'not set'}`);
      if (current.backgroundImage) seenImages.add(current.backgroundImage);
    }
    const placementFields = [
      ['cutoutHeight', 'standee size'],
      ['cutoutLeft', 'horizontal position'],
      ['cutoutBottom', 'vertical position'],
      ['logoWidth', 'logo size'],
      ['logoTop', 'logo position'],
      ['stageBackgroundPosition', 'background position']
    ];
    placementFields.forEach(([field, label]) => {
      if (String(previous[field] || '') !== String(current[field] || '')) {
        lines.push(`Changed ${label} for ${title}`);
      }
    });
    const previousChoices = new Map(normalizeImageChoices(previous.imageChoices).map((choice) => [choice.image, choice]));
    const currentChoices = new Map(normalizeImageChoices(current.imageChoices).map((choice) => [choice.image, choice]));
    currentChoices.forEach((choice, image) => {
      const oldChoice = previousChoices.get(image);
      if (!oldChoice) lines.push(`Added image choice ${choice.label} to ${title}: ${image}`);
      else if (oldChoice.label !== choice.label) lines.push(`Changed image choice label for ${title} from ${oldChoice.label} to ${choice.label}`);
      seenImages.add(image);
    });
    previousChoices.forEach((choice, image) => {
      if (!currentChoices.has(image)) lines.push(`Removed image choice ${choice.label} from ${title}: ${image}`);
    });
    if (previous.visible !== current.visible) lines.push(`${current.visible ? 'Showed' : 'Hid'} ${title}`);

    const previousCategories = new Set(previous.categories || []);
    const currentCategories = new Set(current.categories || []);
    const addedCategories = [...currentCategories].filter((category) => !previousCategories.has(category));
    const removedCategories = [...previousCategories].filter((category) => !currentCategories.has(category));
    if (addedCategories.length) lines.push(`Assigned ${title} to ${addedCategories.map(categoryPublishLabel).join(' and ')}`);
    if (removedCategories.length) lines.push(`Removed ${title} from ${removedCategories.map(categoryPublishLabel).join(' and ')}`);

    const orderedCategories = new Set([
      ...Object.keys(previous.categoryOrder || {}),
      ...Object.keys(current.categoryOrder || {})
    ]);
    orderedCategories.forEach((category) => {
      const oldOrder = previous.categoryOrder?.[category];
      const newOrder = current.categoryOrder?.[category];
      if (oldOrder === newOrder || !currentCategories.has(category)) return;
      lines.push(`Moved ${title} in ${categoryPublishLabel(category)} to position ${Number(newOrder) + 1}`);
    });
  });

  lines.push(...summarizeHomepageOrder(before?.homepageCategoryOrder, after?.homepageCategoryOrder));
  const beforeIgnored = new Set(before?.ignoredImagePaths || []);
  const afterIgnored = new Set(after?.ignoredImagePaths || []);
  afterIgnored.forEach((path) => {
    if (!beforeIgnored.has(path)) lines.push(`Ignored non-product image: ${path}`);
  });
  const beforeExtraImages = before?.extraImages || {};
  const afterExtraImages = after?.extraImages || {};
  [...new Set([...Object.keys(beforeExtraImages), ...Object.keys(afterExtraImages)])].sort().forEach((key) => {
    if (beforeExtraImages[key] === afterExtraImages[key]) return;
    lines.push(`Changed website image ${key} from ${beforeExtraImages[key] || 'not set'} to ${afterExtraImages[key] || 'not set'}`);
  });
  const beforeVisualStates = before?.pageVisualStates || {};
  const afterVisualStates = after?.pageVisualStates || {};
  [...new Set([...Object.keys(beforeVisualStates), ...Object.keys(afterVisualStates)])].sort().forEach((pageKey) => {
    if (JSON.stringify(beforeVisualStates[pageKey] || {}) !== JSON.stringify(afterVisualStates[pageKey] || {})) {
      lines.push(`Updated saved image positioning on ${pageKey}`);
    }
  });
  const beforeCategories = before?.categories || {};
  const afterCategories = after?.categories || {};
  [...new Set([...Object.keys(beforeCategories), ...Object.keys(afterCategories)])].sort().forEach((key) => {
    if (JSON.stringify(beforeCategories[key] || null) !== JSON.stringify(afterCategories[key] || null)) {
      lines.push(`${beforeCategories[key] ? 'Updated' : 'Created'} category: ${afterCategories[key]?.title || beforeCategories[key]?.title || key}`);
    }
  });
  if (JSON.stringify(before?.globalDisplaySettings || {}) !== JSON.stringify(after?.globalDisplaySettings || {})) {
    lines.push('Updated global display settings');
  }
  const beforePageContent = before?.pageContent || {};
  const afterPageContent = after?.pageContent || {};
  [...new Set([...Object.keys(beforePageContent), ...Object.keys(afterPageContent)])].sort().forEach((pageKey) => {
    if (JSON.stringify(beforePageContent[pageKey] || {}) !== JSON.stringify(afterPageContent[pageKey] || {})) {
      lines.push(`Updated page content on ${pageKey}`);
    }
  });
  return [...new Set(lines)];
}

function defaultPublishTitle(changes) {
  if (changes.length && changes.every((line) => /image/i.test(line))) return 'Update product images';
  return 'Update product cards and categories';
}

let currentPublishReview = null;
let adminPublishedBaseline = null;
let adminLastSuccessfulSnapshot = null;
let imageImportPublishSelection = null;
let selectedPublishChangeIds = new Set();
let selectedPublishMode = false;

function buildSelectedImageImportSnapshot(paths) {
  const baseline = structuredClone(adminPublishedBaseline || buildDefaultPublishBaseline());
  const current = buildCurrentPublishSnapshot();
  const drafts = readImageDraftEdits();
  (paths || []).forEach((path) => {
    const draft = normalizeImageImportDraft(drafts[path] || {});
    if (draft.resultSlug && current.products[draft.resultSlug]) {
      baseline.products[draft.resultSlug] = current.products[draft.resultSlug];
    } else if (draft.resultSlug && current.categoryDisplayCards[draft.resultSlug]) {
      baseline.categoryDisplayCards[draft.resultSlug] = current.categoryDisplayCards[draft.resultSlug];
    } else if (draft.websiteImageKey && current.extraImages[draft.websiteImageKey]) {
      baseline.extraImages[draft.websiteImageKey] = current.extraImages[draft.websiteImageKey];
    }
  });
  return baseline;
}

function normalizePublishedBaseline(snapshot) {
  const baseline = buildDefaultPublishBaseline();
  if (!snapshot || snapshot.version !== 1 || !snapshot.products || typeof snapshot.products !== 'object') return baseline;
  Object.entries(snapshot.products).forEach(([slug, product]) => {
    if (!product || typeof product !== 'object' || Array.isArray(product)) return;
    baseline.products[slug] = { ...(baseline.products[slug] || {}), ...product, slug };
  });
  Object.entries(snapshot.categoryDisplayCards || {}).forEach(([slug, product]) => {
    if (!product || typeof product !== 'object' || Array.isArray(product)) return;
    baseline.categoryDisplayCards[slug] = { ...(baseline.categoryDisplayCards[slug] || {}), ...product, slug };
  });
  (Array.isArray(snapshot.deletedProducts) ? snapshot.deletedProducts : []).forEach((slug) => {
    delete baseline.products[slug];
  });
  baseline.deletedProducts = Array.isArray(snapshot.deletedProducts) ? [...snapshot.deletedProducts] : [];
  baseline.homepageCategoryOrder = Array.isArray(snapshot.homepageCategoryOrder)
    ? snapshot.homepageCategoryOrder.map((row) => Array.isArray(row) ? [...row] : [])
    : [];
  baseline.ignoredImagePaths = Array.isArray(snapshot.ignoredImagePaths) ? [...snapshot.ignoredImagePaths] : [];
  baseline.extraImages = snapshot.extraImages && typeof snapshot.extraImages === 'object' && !Array.isArray(snapshot.extraImages)
    ? { ...snapshot.extraImages }
    : {};
  baseline.pageVisualStates = snapshot.pageVisualStates && typeof snapshot.pageVisualStates === 'object'
    ? structuredClone(snapshot.pageVisualStates)
    : {};
  baseline.schemaVersion = Number(snapshot.schemaVersion) || 1;
  baseline.categories = snapshot.categories && typeof snapshot.categories === 'object' && !Array.isArray(snapshot.categories)
    ? structuredClone(snapshot.categories) : {};
  baseline.categorySettings = snapshot.categorySettings && typeof snapshot.categorySettings === 'object' && !Array.isArray(snapshot.categorySettings)
    ? structuredClone(snapshot.categorySettings) : {};
  baseline.globalDisplaySettings = snapshot.globalDisplaySettings && typeof snapshot.globalDisplaySettings === 'object' && !Array.isArray(snapshot.globalDisplaySettings)
    ? structuredClone(snapshot.globalDisplaySettings) : {};
  baseline.pageContent = snapshot.pageContent && typeof snapshot.pageContent === 'object' && !Array.isArray(snapshot.pageContent)
    ? structuredClone(snapshot.pageContent) : {};
  baseline.priceSettings = window.MVPLUX_PRICING.normalizePriceSettings(snapshot.priceSettings || {});
  return baseline;
}

async function loadPublishedPublishBaseline() {
  try {
    const response = await fetch('published-admin-settings.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Published settings file is unavailable.');
    const value = await response.json();
    adminPublishedSettingsDocument = structuredClone(value);
    adminPublishedBaseline = normalizePublishedBaseline(value?.snapshot);
    adminLastSuccessfulSnapshot = value?.publishedAt ? value?.snapshot || null : null;
    adminPublishedFileState = {
      reachable: true,
      publishedAt: value?.publishedAt || null,
      commitHash: String(value?.commitHash || '')
    };
  } catch (error) {
    adminPublishedSettingsDocument = null;
    adminPublishedBaseline = buildDefaultPublishBaseline();
    adminLastSuccessfulSnapshot = null;
    adminPublishedFileState = { reachable: false, publishedAt: null, commitHash: '' };
  }
  renderAdminDiagnostics();
  return adminPublishedBaseline;
}

function productLifecycleState(product, saved, archived) {
  const current = publishableProduct({ ...product, ...(saved[product.slug] || {}) }, archived.has(product.slug));
  const publishedSnapshot = adminLiveSettings?.lastPublishedSnapshot || adminLastSuccessfulSnapshot;
  const published = publishedSnapshot?.products?.[product.slug];
  if (!published) return { key: 'waiting', label: 'Waiting to Publish' };
  const canonicalJson = (value) => JSON.stringify(value, (_, item) => (
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)))
      : item
  ));
  if (canonicalJson(current) === canonicalJson(published)) return { key: 'published', label: 'Published' };
  return { key: 'waiting', label: 'Changes Waiting to Publish' };
}

function getProductLifecycleCounts() {
  const saved = readAdminProducts();
  const archived = new Set(readArchivedProducts());
  const deleted = new Set(readDeletedProducts());
  const products = allAdminProducts().filter((product) => !product.categoryCard && !archived.has(product.slug) && !deleted.has(product.slug));
  const states = products.map((product) => productLifecycleState(product, saved, archived));
  return {
    approved: products.length,
    waiting: states.filter((state) => state.key === 'waiting').length,
    published: states.filter((state) => state.key === 'published').length
  };
}

function renderAdminDiagnostics() {
  const container = document.getElementById('adminPublishDiagnostics');
  if (!container) return;
  const counts = getProductLifecycleCounts();
  const history = getAdminLiveValue('publishHistory', []);
  const lastPublish = history.length ? history[history.length - 1] : null;
  const saveStatus = adminSavePending
    ? `Saving (${adminSavePending} queued)`
    : adminLastSaveSucceeded === true ? 'Saved privately' : adminLastSaveSucceeded === false ? 'Save failed' : 'Private changes loaded';
  container.innerHTML = `
    <dl>
      <div><dt>Private save status</dt><dd>${escapeAdminHtml(saveStatus)}</dd></div>
      <div><dt>Approved changes</dt><dd>${counts.approved}</dd></div>
      <div><dt>Waiting to publish</dt><dd>${counts.waiting}</dd></div>
      <div><dt>Already published</dt><dd>${counts.published}</dd></div>
      <div><dt>Last successful publish</dt><dd>${escapeAdminHtml(lastPublish?.date || adminPublishedFileState.publishedAt || 'Never')}</dd></div>
      <div><dt>Published version ID</dt><dd>${escapeAdminHtml(lastPublish?.commitHash || adminPublishedFileState.commitHash || 'None')}</dd></div>
      <div><dt>Latest save error</dt><dd>${escapeAdminHtml(adminLastSaveError || 'None')}</dd></div>
      <div><dt>Latest publish error</dt><dd>${escapeAdminHtml(adminLatestPublishError || 'None')}</dd></div>
      <div><dt>Published website data</dt><dd>${adminPublishedFileState.reachable ? 'Available' : 'Unavailable'}</dd></div>
    </dl>
  `;
}

function selectedPublishImagePaths() {
  const value = document.getElementById('adminPublishImagePaths')?.value || '';
  return [...new Set(value.split(/\r?\n/).map((path) => path.trim()).filter(Boolean))];
}

function validatePublishImagePath(path) {
  return /^images\/[A-Za-z0-9_./ '\-]+\.(?:png|jpe?g|webp|gif)$/i.test(path)
    && !path.includes('..')
    && !path.includes('\\');
}

function renderPublishSummary() {
  const before = adminPublishedBaseline || buildDefaultPublishBaseline();
  const selectedItems = selectedPublishMode
    ? architectureReviewItems().filter((item) => selectedPublishChangeIds.has(item.id) && item.approved)
    : [];
  const snapshot = selectedPublishMode
    ? buildSelectedArchitectureSnapshot(selectedItems)
    : imageImportPublishSelection
      ? buildSelectedImageImportSnapshot(imageImportPublishSelection)
      : structuredClone(before);
  const selectedImages = [...new Set([
    ...automaticPublishImagePaths(selectedItems, snapshot),
    ...selectedPublishImagePaths()
  ])];
  const invalidImages = selectedImages.filter((path) => !validatePublishImagePath(path));
  const changes = [
    ...generatePublishChanges(before, snapshot),
    ...selectedImages.filter(validatePublishImagePath).map((path) => `Added image file: ${path}`)
  ];
  if (invalidImages.length) changes.push(...invalidImages.map((path) => `Invalid image path (will not publish): ${path}`));
  const summary = changes.map((line) => `- ${line}`).join('\n');
  const titleInput = document.getElementById('adminCommitTitle');
  const summaryInput = document.getElementById('adminCommitSummary');
  const publishButton = document.getElementById('publishAdminChanges');
  if (titleInput && (!currentPublishReview || !titleInput.value.trim())) titleInput.value = defaultPublishTitle(changes);
  if (summaryInput) summaryInput.value = summary || 'No product changes since the previous publish.';
  if (publishButton) publishButton.disabled = changes.length === 0 || invalidImages.length > 0 || (selectedPublishMode && !selectedItems.length);
  currentPublishReview = { snapshot, changes, summary, selectedImages, invalidImages, selectedChangeIds: selectedItems.map((item) => item.id) };
  return currentPublishReview;
}

function escapeAdminHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPublishHistory() {
  const container = document.getElementById('adminPublishHistory');
  if (!container) return;
  const history = getAdminLiveValue('publishHistory', []);
  if (!history.length) {
    container.innerHTML = '<p class="admin-note">No GitHub publishes have been recorded yet.</p>';
    return;
  }
  container.innerHTML = [...history].reverse().map((entry) => {
    const hash = /^[a-f0-9]{7,40}$/i.test(entry.commitHash || '') ? entry.commitHash : '';
    const commit = hash
      ? `<a href="https://github.com/coolap69/mvpluxcreations/commit/${hash}" target="_blank" rel="noopener">${hash.slice(0, 7)}</a>`
      : 'Unavailable';
    return `
      <article class="admin-publish-history-item">
        <h4>${escapeAdminHtml(entry.title || 'Admin publish')}</h4>
        <p>${escapeAdminHtml(entry.date || '')} · Commit ${commit} · Deployment: ${escapeAdminHtml(entry.deploymentResult || 'queued')}</p>
        <pre>${escapeAdminHtml(entry.changeSummary || '')}</pre>
      </article>
    `;
  }).join('');
}

async function callAdminPublisher(payload) {
  const client = getAdminClient();
  const projectUrl = window.MVPLUX_SUPABASE?.url;
  if (!client?.auth || !projectUrl) throw new Error('Supabase is unavailable.');
  const { data } = await client.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sign in as admin before publishing.');
  const response = await fetch(`${projectUrl}/functions/v1/publish-admin-changes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: window.MVPLUX_SUPABASE?.publishableKey || ''
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const stage = result.stage ? ` at ${result.stage}` : '';
    const detail = result.error || result.message || result.code || 'Unknown publisher error.';
    const error = new Error(`Publish failed${stage} (HTTP ${response.status}): ${detail}`);
    error.httpStatus = response.status;
    error.responseBody = result;
    throw error;
  }
  return { ...result, httpStatus: response.status };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

async function loadSelectedPublishImages(paths) {
  const files = [];
  for (const path of paths) {
    if (!validatePublishImagePath(path)) throw new Error(`Invalid image path: ${path}`);
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load selected image: ${path}`);
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.startsWith('image/')) throw new Error(`Selected path is not an image: ${path}`);
    files.push({ path, content: arrayBufferToBase64(await response.arrayBuffer()) });
  }
  return files;
}

async function publishAdminChanges() {
  setStatus('Confirming all Admin changes are saved to Supabase...');
  if (!await waitForAdminSaves()) return;
  const persisted = await loadAdminLiveSettings();
  if (!persisted) {
    setStatus(`Publish stopped: ${adminLastSaveError || 'could not reload persisted Admin state from Supabase.'}`);
    return;
  }
  if (newAdminArchitectureEnabled()) {
    const migration = adminLiveSettings?.adminArchitectureMigrationV2?.productPageOverrides;
    const unresolved = (migration?.conflicts?.length || 0) + (migration?.unsupported?.length || 0);
    if (unresolved) {
      setStatus(`Publish stopped: ${unresolved} migrated page override conflict(s) still require review.`);
      return;
    }
  }
  renderAdminProducts();
  const review = renderPublishSummary();
  if (!review.changes.length || review.invalidImages.length) return;
  const title = document.getElementById('adminCommitTitle')?.value.trim();
  const notes = document.getElementById('adminCommitNotes')?.value.trim();
  if (!title) {
    setStatus('Add a short commit title before publishing.');
    return;
  }
  const body = `${review.summary}${notes ? `\n\nNotes:\n${notes}` : ''}`;
  if (!window.confirm(`Publish one GitHub commit titled "${title}"?`)) return;

  setStatus('Loading explicitly selected images...');
  try {
    const imageFiles = await loadSelectedPublishImages(review.selectedImages);
    setStatus('Publishing one GitHub commit...');
    const result = await callAdminPublisher({
      action: 'publish',
      title,
      body,
      changeSummary: review.summary,
      snapshot: review.snapshot,
      imageFiles
    });
    const tracked = await saveAdminSettingsLive({
      lastPublishedSnapshot: review.snapshot,
      publishHistory: result.publishHistory || []
    });
    if (!tracked) {
      adminLatestPublishError = `GitHub commit ${result.commitHash || ''} was created, but Supabase could not record the successful published snapshot. Reload before publishing again.`;
      renderAdminDiagnostics();
      setStatus(adminLatestPublishError);
      return;
    }
    adminLatestPublishError = '';
    adminPublishedFileState = {
      reachable: true,
      publishedAt: result.publishedAt || new Date().toISOString(),
      commitHash: result.commitHash || ''
    };
    document.getElementById('adminCommitNotes').value = '';
    document.getElementById('adminPublishImagePaths').value = '';
    adminPublishedBaseline = normalizePublishedBaseline(review.snapshot);
    imageImportPublishSelection = null;
    selectedPublishChangeIds.clear();
    selectedPublishMode = false;
    currentPublishReview = null;
    renderPublishSummary();
    renderPublishHistory();
    renderAdminProducts();
    renderAdminDiagnostics();
    renderImageImportPending();
    setStatus(`Published commit ${result.commitHash?.slice(0, 7) || ''} (HTTP ${result.httpStatus}). Deployment: ${result.deploymentResult || 'queued'}.`);
  } catch (error) {
    adminLatestPublishError = error.message || 'GitHub publish failed.';
    renderAdminDiagnostics();
    setStatus(adminLatestPublishError);
  }
}

async function refreshPublishHistory() {
  setStatus('Refreshing deployment results...');
  try {
    const result = await callAdminPublisher({ action: 'refresh-history' });
    updateAdminLiveSettings({ publishHistory: result.publishHistory || [] });
    renderPublishHistory();
    setStatus('Deployment results refreshed.');
  } catch (error) {
    setStatus(error.message || 'Could not refresh deployment results.');
  }
}

async function restoreImportedPageEdits(pageEdits = {}) {
  const client = getAdminClient();
  for (const [pageKey, edits] of Object.entries(pageEdits || {})) {
    const { data: current, error: loadError } = await client
      .from('site_edits')
      .select('revision')
      .eq('page_key', pageKey)
      .maybeSingle();
    if (loadError) throw loadError;
    const { error } = await client.rpc('save_site_edits', {
      p_page_key: pageKey,
      p_edits: edits || {},
      p_expected_revision: Number(current?.revision) || 0,
      p_replace: true
    });
    if (error) throw error;
  }
}

async function applyAdminExport(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid export');
  const globalPatch = {
    products: cleanAdminProductMap(data.products || {}),
    customProducts: (data.customProducts || []).map(withoutStoredProductPrice),
    savedForLaterProducts: data.savedForLaterProducts || [],
    deletedProducts: [...new Set(data.deletedProducts || [])],
    imageDrafts: data.imageDrafts || {},
    dismissedImageDrafts: [...new Set(data.dismissedImageDrafts || [])],
    configuredImagePaths: [...new Set(data.configuredImagePaths || [])],
    ignoredImagePaths: [...new Set(data.ignoredImagePaths || [])],
    priceSettings: data.priceSettings || {},
    extraImages: data.extraImages || {},
    coupons: data.coupons || [],
    cardsSavedForLater: data.cardsSavedForLater || {}
  };

  setStatus('Restoring export to authoritative Admin state…');
  if (!await saveAdminSettingsLive(globalPatch)) throw new Error(adminLastSaveError || 'The Admin export was not saved.');
  await restoreImportedPageEdits(data.pageEdits || {});

  Object.entries(ADMIN_COLLECTION_STORAGE_KEYS).forEach(([key, storageKey]) => {
    if (Object.prototype.hasOwnProperty.call(globalPatch, key)) localStorage.setItem(storageKey, JSON.stringify(globalPatch[key]));
  });
  localStorage.setItem('mvpluxAdminPriceSettings', JSON.stringify(globalPatch.priceSettings));
  localStorage.setItem('mvpluxInlineAdminEdits', JSON.stringify(data.pageEdits || {}));
  localStorage.setItem('mvpluxInlineHiddenCards', JSON.stringify(globalPatch.cardsSavedForLater));
  renderAdminProducts();
  fillPriceSettingsForm();
  renderExtraImages();
  renderAdminExportPreview();
  setStatus('Imported changes saved to authoritative Admin state.');
}

function importAdminChangesFromFile(file) {
  if (!file) return;
  const reader = new FileReader();

  reader.addEventListener('load', async () => {
    try {
      await applyAdminExport(JSON.parse(reader.result));
    } catch (error) {
      setStatus(`That export file could not be restored. ${error?.message || error}`);
    }
  });

  reader.addEventListener('error', () => {
    setStatus('That export file could not be opened.');
  });

  reader.readAsText(file);
}

function downloadAdminChanges() {
  const json = renderAdminExportPreview();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `mvplux-admin-changes-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus('Exported changes file. This is the file to use when making edits permanent.');
}

async function copyAdminChanges() {
  const json = renderAdminExportPreview();
  try {
    await navigator.clipboard.writeText(json);
    setStatus('Copied changes. You can paste them when making the website permanent.');
  } catch (error) {
    setStatus('Changes are shown in the box. Select the box and copy them.');
  }
}

function setStatus(message) {
  const status = document.getElementById('adminStatus');
  if (status) status.textContent = message;
  if (document.getElementById('adminExportPreview')) renderAdminExportPreview();
}

function setCommerceStatus(message) {
  const status = document.getElementById('commerceAdminStatus');
  if (status) status.textContent = message || '';
}

function setAdminSignedInAs(message) {
  const status = document.getElementById('adminSignedInAs');
  if (status) status.textContent = message || '';
}

function adminMoney(value) {
  const amount = Number(value) || 0;
  return '$' + amount.toFixed(2);
}

function adminDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function adminListItems(items) {
  if (!Array.isArray(items) || !items.length) return 'No item listed';
  return items.map((item) => `${item.name || 'Item'} (${adminMoney(item.price)})`).join(', ');
}

function adminAddressText(address) {
  if (!address || typeof address !== 'object') return 'No address yet';
  return [
    address.address1,
    address.address2,
    [address.city, address.state, address.zip].filter(Boolean).join(', '),
    address.country
  ].filter(Boolean).join(' | ') || 'No address yet';
}

function commerceEmptyMarkup(text) {
  return `<div class="admin-commerce-empty">${text}</div>`;
}

function orderCardMarkup(order) {
  const status = order.status === 'sent_to_production' ? 'in_production' : String(order.status || 'new');
  const isTest = Boolean(order.is_test);
  const nextAction = status === 'new'
    ? { status: 'in_production', label: 'Start Production' }
    : status === 'in_production'
    ? { status: 'shipped', label: 'Mark Shipped' }
    : status === 'shipped'
    ? { status: 'completed', label: 'Mark Completed' }
    : status === 'completed'
    ? { status: 'archived', label: 'Archive Order' }
    : null;
  return `
    <article class="admin-commerce-card ${status === 'in_production' ? 'is-production-sent' : ''} ${isTest ? 'is-test-record' : ''}">
      <div class="admin-commerce-card-head">
        <strong>${order.customer_name || 'Customer'}</strong>
        <span>${isTest ? '<b class="test-record-badge">TEST</b> ' : ''}${escapeAdminHtml(status.replace(/_/g, ' '))}</span>
      </div>
      <p>${adminListItems(order.items)}</p>
      <p><strong>Original:</strong> ${adminMoney(order.original_amount ?? order.subtotal)}${order.applied_discount_code ? ` · <strong>Code:</strong> ${escapeAdminHtml(order.applied_discount_code)} · <strong>Discount:</strong> ${adminMoney(order.discount_amount)}` : ''}</p>
      <p><strong>Total:</strong> ${adminMoney(order.total)} · <strong>Pay:</strong> ${order.payment_method || 'Not chosen'}</p>
      <p><strong>Email:</strong> ${order.customer_email || 'Not provided'} · <strong>Phone:</strong> ${order.customer_phone || 'Not provided'}</p>
      <p><strong>Ship:</strong> ${adminAddressText(order.shipping_address)}</p>
      ${order.notes ? `<p><strong>Notes:</strong> ${order.notes}</p>` : ''}
      <small>${adminDate(order.created_at)}</small>
      ${nextAction ? `<button class="admin-production-toggle" type="button" data-order-status="${nextAction.status}" data-id="${escapeAdminHtml(order.id)}">${nextAction.label}</button>` : ''}
      ${isTest ? `<button class="admin-commerce-delete" type="button" data-delete-commerce="order" data-id="${escapeAdminHtml(order.id)}">Delete Test Record</button>` : ''}
    </article>
  `;
}

function parseOfferDetails(message) {
  const details = {};
  String(message || '').split('\n').forEach((line) => {
    const separator = line.indexOf(':');
    if (separator < 0) return;
    const key = line.slice(0, separator).trim().toLowerCase();
    details[key] = line.slice(separator + 1).trim();
  });
  return details;
}

let adminOfferHistoryById = new Map();

function adminOfferHistoryMarkup(offerId) {
  const history = adminOfferHistoryById.get(offerId) || [];
  if (!history.length) return '<p><strong>Offer history:</strong> No dedicated history recorded yet.</p>';
  return `
    <ol class="admin-offer-history">
      ${history.map((event) => `
        <li>
          <strong>${escapeAdminHtml(String(event.event_type || event.message_type || 'update').replace(/_/g, ' '))}</strong>
          <span>${escapeAdminHtml(event.sender_type || 'system')} · ${escapeAdminHtml(adminDate(event.created_at))}</span>
          ${event.amount != null ? `<b>${adminMoney(event.amount)}</b>` : ''}
          ${event.message ? `<p>${escapeAdminHtml(event.message)}</p>` : ''}
        </li>
      `).join('')}
    </ol>
  `;
}

function offerCardMarkup(offer) {
  const details = parseOfferDetails(offer.message);
  const status = String(offer.status || 'pending').toLowerCase();
  const isMember = Boolean(offer.customer_id);
  const canDecide = ['pending', 'buyer_countered'].includes(status);
  const canCounter = isMember && status === 'pending';
  const statusLabel = ['accepted', 'accepted_awaiting_payment'].includes(status)
    ? 'accepted / awaiting payment'
    : status.replace(/_/g, ' ');
  const responseOwner = status === 'countered'
    ? 'Waiting for member response'
    : status === 'buyer_countered'
    ? 'Waiting for Admin final decision'
    : status === 'payment_submitted'
    ? 'Waiting for Admin payment confirmation'
    : '';
  return `
    <article class="admin-commerce-card ${offer.is_test ? 'is-test-record' : ''}" data-offer-card="${escapeAdminHtml(offer.id)}">
      <div class="admin-commerce-card-head">
        <strong>${escapeAdminHtml(offer.customer_name || 'Customer')}</strong>
        <span>${offer.is_test ? '<b class="test-record-badge">TEST</b> ' : ''}${escapeAdminHtml(statusLabel)}</span>
      </div>
      <p><strong>Customer:</strong> ${escapeAdminHtml(offer.customer_name || 'Customer')} · ${isMember ? 'Signed-in member' : 'Guest'}</p>
      <p><strong>Email:</strong> ${escapeAdminHtml(offer.customer_email || 'Not provided')}</p>
      <p><strong>Product:</strong> ${escapeAdminHtml(offer.product_name || 'Selected item')}</p>
      <p><strong>Design:</strong> ${escapeAdminHtml(details.design || 'Not provided')}</p>
      <p><strong>Description:</strong> ${escapeAdminHtml(details.description || 'Not provided')}</p>
      <p><strong>Selected size:</strong> ${escapeAdminHtml(details['selected size'] || 'Not provided')}</p>
      <p><strong>Original height:</strong> ${escapeAdminHtml(details['original height'] || 'Not provided')}</p>
      <p><strong>Background/display:</strong> ${escapeAdminHtml(details.background || 'Not provided')}</p>
      <p><strong>Normal asking price:</strong> ${escapeAdminHtml(details['asking price'] || 'Not provided')}</p>
      <p><strong>Offer:</strong> ${adminMoney(offer.amount)}</p>
      <p><strong>Comment:</strong> ${escapeAdminHtml(details.message || 'No comment')}</p>
      ${details.phone ? `<p><strong>Phone:</strong> ${escapeAdminHtml(details.phone)}</p>` : ''}
      ${details.shipping ? `<p><strong>Shipping:</strong> ${escapeAdminHtml(details.shipping)}</p>` : ''}
      ${offer.seller_counter_amount ? `<p><strong>Admin counteroffer:</strong> ${adminMoney(offer.seller_counter_amount)}${offer.seller_counter_message ? ` · ${escapeAdminHtml(offer.seller_counter_message)}` : ''}</p>` : ''}
      ${offer.buyer_final_amount ? `<p><strong>Member counteroffer:</strong> ${adminMoney(offer.buyer_final_amount)}${offer.buyer_final_message ? ` · ${escapeAdminHtml(offer.buyer_final_message)}` : ''}</p>` : ''}
      ${responseOwner ? `<p><strong>Next:</strong> ${escapeAdminHtml(responseOwner)}</p>` : ''}
      <small>${adminDate(offer.created_at)}</small>
      ${adminOfferHistoryMarkup(offer.id)}
      ${canDecide ? `
        <div class="admin-offer-actions">
          <button type="button" data-offer-action="accept" data-id="${escapeAdminHtml(offer.id)}">Accept Offer</button>
          <button type="button" data-offer-action="decline" data-id="${escapeAdminHtml(offer.id)}">Decline Offer</button>
          ${canCounter ? `<button type="button" data-offer-action="show-counter" data-id="${escapeAdminHtml(offer.id)}">Send Counteroffer</button>` : ''}
        </div>
      ` : ''}
      ${canCounter ? `
        <div class="admin-offer-counter-form" hidden>
          <label>Counteroffer amount<input type="text" inputmode="decimal" data-offer-counter-amount></label>
          <label>Message (optional)<textarea data-offer-counter-message></textarea></label>
          <button type="button" data-offer-action="counter" data-id="${escapeAdminHtml(offer.id)}">Send Counteroffer</button>
        </div>
      ` : ''}
      ${offer.is_test && ['accepted', 'accepted_awaiting_payment'].includes(status) ? `<a class="admin-production-toggle" href="index.html?resumeOffer=${encodeURIComponent(offer.id)}">Continue Test Payment</a>` : ''}
      ${status === 'payment_submitted' ? `<button class="admin-production-toggle" type="button" data-confirm-offer-payment data-id="${escapeAdminHtml(offer.id)}">Mark Payment Confirmed</button>` : ''}
      ${['paid', 'declined'].includes(status) ? `<button type="button" data-offer-action="archive" data-id="${escapeAdminHtml(offer.id)}">Archive Offer</button>` : ''}
      ${offer.is_test ? `<button class="admin-commerce-delete" type="button" data-delete-test-offer data-id="${escapeAdminHtml(offer.id)}">Delete Test Offer</button>` : ''}
    </article>
  `;
}

async function updateAdminOffer(button) {
  const client = window.getMvpluxSupabaseClient?.();
  const action = button?.dataset?.offerAction;
  const id = button?.dataset?.id;
  const card = button?.closest?.('[data-offer-card]');
  if (!client || !action || !id || !card) return;

  if (action === 'show-counter') {
    const form = card.querySelector('.admin-offer-counter-form');
    if (form) form.hidden = !form.hidden;
    return;
  }

  if (action === 'accept' || action === 'decline') {
    const verb = action === 'accept' ? 'accept' : 'decline';
    if (!window.confirm(`${verb[0].toUpperCase()}${verb.slice(1)} this offer? The offer record will be kept.`)) return;
  } else if (action === 'archive') {
    if (!window.confirm('Archive this offer? Its record and full history will be preserved.')) return;
  } else if (action === 'counter') {
    const amount = Number(String(card.querySelector('[data-offer-counter-amount]')?.value || '').replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) {
      setCommerceStatus('Enter a valid counteroffer amount.');
      return;
    }
  } else {
    return;
  }

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = 'Saving...';
  const amount = action === 'counter'
    ? Number(String(card.querySelector('[data-offer-counter-amount]')?.value || '').replace(/[^0-9.]/g, ''))
    : null;
  const message = action === 'counter'
    ? card.querySelector('[data-offer-counter-message]')?.value?.trim() || null
    : null;
  const { error } = await client.rpc('respond_to_member_offer', {
    p_offer_id: id,
    p_action: action,
    p_amount: amount,
    p_message: message
  });
  if (error) {
    button.disabled = false;
    button.textContent = originalText;
    setCommerceStatus(`Could not update the offer. ${error.message || error}`);
    return;
  }
  await refreshCommerceAdmin();
  const successMessages = {
    accept: 'Offer accepted and moved to Accepted / Awaiting Payment.',
    decline: 'Offer declined and moved to Declined.',
    counter: 'Counteroffer saved and moved to Counteroffers.',
    archive: 'Offer archived.'
  };
  setCommerceStatus(successMessages[action] || 'Offer updated.');
}

async function deleteTestOffer(button) {
  const client = getAdminClient();
  const id = button?.dataset?.id;
  if (!client || !id || !window.confirm('Delete this TEST offer permanently? Only a server-verified test offer and any linked TEST order will be removed. Real customer records cannot be deleted.')) return;
  button.disabled = true;
  button.textContent = 'Deleting...';
  const { data, error } = await client.rpc('delete_test_offer', { p_offer_id: id });
  if (error) {
    button.disabled = false;
    button.textContent = 'Delete Test Offer';
    setCommerceStatus(`Could not delete the test offer. ${error.message || error}`);
    return;
  }
  await refreshCommerceAdmin();
  setCommerceStatus(`Deleted ${Number(data?.deleted_offers) || 0} test offer${Number(data?.deleted_offers) === 1 ? '' : 's'}${Number(data?.deleted_orders) ? ` and ${Number(data.deleted_orders)} linked test order${Number(data.deleted_orders) === 1 ? '' : 's'}` : ''}.`);
}

async function deleteAllTestOffers() {
  const client = getAdminClient();
  if (!client) return;
  const confirmation = window.prompt('This permanently deletes every TEST offer and only linked orders separately marked TEST. Real offers, real orders, and customer accounts are preserved. Type DELETE ALL TEST OFFERS to continue.');
  if (confirmation !== 'DELETE ALL TEST OFFERS') {
    if (confirmation !== null) setCommerceStatus('Delete All Test Offers canceled: confirmation text did not match.');
    return;
  }
  const button = document.getElementById('deleteAllTestOffers');
  if (button) {
    button.disabled = true;
    button.textContent = 'Deleting Test Offers...';
  }
  const { data, error } = await client.rpc('delete_all_test_offers');
  if (button) {
    button.disabled = false;
    button.textContent = 'Delete All Test Offers';
  }
  if (error) {
    setCommerceStatus(`Could not delete test offers. ${error.message || error}`);
    return;
  }
  await refreshCommerceAdmin();
  setCommerceStatus(`Deleted ${Number(data?.deleted_offers) || 0} test offers${Number(data?.deleted_orders) ? ` and ${Number(data.deleted_orders)} linked test orders` : ''}. Real records were preserved.`);
}

async function deleteCommerceRecord(button) {
  const client = window.getMvpluxSupabaseClient?.();
  const type = button?.dataset?.deleteCommerce;
  const id = button?.dataset?.id;
  const table = type === 'order' ? 'order_requests' : '';

  if (!client || !table || !id) return;

  const label = `test ${type}`;
  if (button.dataset.confirmDelete !== 'true') {
    button.dataset.confirmDelete = 'true';
    button.textContent = 'Click Again To Delete';
    setCommerceStatus(`Ready to delete this ${label}. Click the same delete button one more time to confirm.`);
    setTimeout(() => {
      if (button.dataset.confirmDelete === 'true') {
        button.dataset.confirmDelete = 'false';
        button.textContent = 'Delete Test Record';
      }
    }, 6000);
    return;
  }

  button.disabled = true;
  button.textContent = 'Deleting...';

  const { error } = await client.from(table).delete().eq('id', id).eq('is_test', true);
  if (error) {
    button.disabled = false;
    button.textContent = 'Delete Test Record';
    setCommerceStatus('Could not delete yet. Run the admin delete SQL in Supabase, then try again.');
    return;
  }

  setCommerceStatus(`Deleted ${label}.`);
  refreshCommerceAdmin();
}

function handleCommerceAdminClick(event) {
  const offerButton = event.target.closest?.('[data-offer-action]');
  if (offerButton) {
    updateAdminOffer(offerButton);
    return;
  }

  const orderStatusButton = event.target.closest?.('[data-order-status]');
  if (orderStatusButton) {
    updateOrderStatus(orderStatusButton);
    return;
  }

  const confirmPaymentButton = event.target.closest?.('[data-confirm-offer-payment]');
  if (confirmPaymentButton) {
    confirmOfferPayment(confirmPaymentButton);
    return;
  }

  const testOfferButton = event.target.closest?.('[data-delete-test-offer]');
  if (testOfferButton) {
    deleteTestOffer(testOfferButton);
    return;
  }

  const button = event.target.closest?.('[data-delete-commerce]');
  if (!button) return;
  deleteCommerceRecord(button);
}

async function confirmOfferPayment(button) {
  const client = getAdminClient();
  const id = button?.dataset?.id;
  if (!client || !id || !window.confirm('Confirm that payment was received? This creates exactly one related order.')) return;
  button.disabled = true;
  button.textContent = 'Confirming...';
  const { data, error } = await client.rpc('confirm_offer_payment', { p_offer_id: id });
  if (error) {
    button.disabled = false;
    button.textContent = 'Mark Payment Confirmed';
    setCommerceStatus(`Could not confirm the payment. ${error.message || error}`);
    return;
  }
  setCommerceStatus(data?.created
    ? 'Payment confirmed. The offer moved to Paid and one New Order was created.'
    : 'Payment was already confirmed; the existing related order was preserved.');
  refreshCommerceAdmin();
}

async function updateOrderStatus(button) {
  const client = window.getMvpluxSupabaseClient?.();
  const id = button?.dataset?.id;
  const nextStatus = button?.dataset?.orderStatus;
  if (!client || !id) return;

  if (nextStatus === 'archived' && !window.confirm('Archive this order? The complete order record and history will be preserved.')) return;

  button.disabled = true;
  button.textContent = 'Saving...';
  const { error } = await client.rpc('admin_update_order_status', {
    p_order_id: id,
    p_status: nextStatus
  });

  if (error) {
    button.disabled = false;
    button.textContent = 'Try Again';
    setCommerceStatus(`Could not update the order. ${error.message || error}`);
    return;
  }

  setCommerceStatus(`Order moved to ${nextStatus.replace(/_/g, ' ')}.`);
  refreshCommerceAdmin();
}

async function refreshCommerceAdmin() {
  const offerLists = {
    pending: document.getElementById('adminOffersPending'),
    countered: document.getElementById('adminOffersCountered'),
    accepted: document.getElementById('adminOffersAccepted'),
    paid: document.getElementById('adminOffersPaid'),
    declined: document.getElementById('adminOffersDeclined'),
    archived: document.getElementById('adminOffersArchived')
  };
  const orderLists = {
    new: document.getElementById('adminOrdersNew'),
    in_production: document.getElementById('adminOrdersProduction'),
    shipped: document.getElementById('adminOrdersShipped'),
    completed: document.getElementById('adminOrdersCompleted'),
    archived: document.getElementById('adminOrdersArchived')
  };
  const client = window.getMvpluxSupabaseClient?.();

  if (Object.values(offerLists).some((list) => !list) || Object.values(orderLists).some((list) => !list)) return;
  if (!client) {
    setCommerceStatus('Orders could not be loaded.');
    const technical = document.getElementById('commerceTechnicalDetails');
    if (technical) technical.textContent = 'The website connection is not available in this browser session.';
    return;
  }

  setCommerceStatus('Loading orders and offers...');
  Object.values(orderLists).forEach((list) => { list.innerHTML = commerceEmptyMarkup('Loading orders...'); });
  Object.values(offerLists).forEach((list) => { list.innerHTML = commerceEmptyMarkup('Loading offers...'); });

  const [ordersResponse, offersResponse] = await Promise.all([
    client.from('order_requests').select('*').order('created_at', { ascending: false }).limit(25),
    client.from('offers').select('*').order('created_at', { ascending: false }).limit(25)
  ]);

  if (ordersResponse.error || offersResponse.error) {
    adminCommerceLoaded = false;
    setCommerceStatus('Orders could not be loaded.');
    Object.values(orderLists).forEach((list) => { list.innerHTML = commerceEmptyMarkup('Orders could not be loaded.'); });
    Object.values(offerLists).forEach((list) => { list.innerHTML = commerceEmptyMarkup('Offers could not be loaded.'); });
    const technical = document.getElementById('commerceTechnicalDetails');
    if (technical) technical.textContent = ordersResponse.error?.message || offersResponse.error?.message || 'Connection failed.';
    return;
  }

  adminCommerceLoaded = true;

  adminOfferHistoryById = new Map();
  let historyError = null;
  if (offersResponse.data?.length) {
    const historyResponse = await client
      .from('offer_messages')
      .select('*')
      .in('offer_id', offersResponse.data.map((offer) => offer.id))
      .order('created_at', { ascending: true });
    historyError = historyResponse.error;
    (historyResponse.data || []).forEach((event) => {
      if (!adminOfferHistoryById.has(event.offer_id)) adminOfferHistoryById.set(event.offer_id, []);
      adminOfferHistoryById.get(event.offer_id).push(event);
    });
  }

  const offersByQueue = { pending: [], countered: [], accepted: [], paid: [], declined: [], archived: [] };
  (offersResponse.data || []).forEach((offer) => {
    const status = String(offer.status || 'pending');
    const queue = status === 'pending'
      ? 'pending'
      : ['countered', 'buyer_countered'].includes(status)
      ? 'countered'
      : ['accepted', 'accepted_awaiting_payment', 'payment_pending', 'payment_submitted'].includes(status)
      ? 'accepted'
      : ['paid', 'completed'].includes(status)
      ? 'paid'
      : status === 'declined'
      ? 'declined'
      : 'archived';
    offersByQueue[queue].push(offer);
  });
  Object.entries(offerLists).forEach(([queue, list]) => {
    list.innerHTML = offersByQueue[queue].length
      ? offersByQueue[queue].map(offerCardMarkup).join('')
      : commerceEmptyMarkup(queue === 'pending' ? 'No new offers right now.' : `No ${queue.replace(/_/g, ' ')} offers right now.`);
  });

  const ordersByQueue = { new: [], in_production: [], shipped: [], completed: [], archived: [] };
  (ordersResponse.data || []).forEach((order) => {
    const status = order.status === 'sent_to_production' ? 'in_production' : String(order.status || 'new');
    const queue = Object.prototype.hasOwnProperty.call(ordersByQueue, status) ? status : 'new';
    ordersByQueue[queue].push(order);
  });
  Object.entries(orderLists).forEach(([queue, list]) => {
    list.innerHTML = ordersByQueue[queue].length
      ? ordersByQueue[queue].map(orderCardMarkup).join('')
      : commerceEmptyMarkup(queue === 'new' ? 'No new orders right now.' : `No ${queue.replace(/_/g, ' ')} orders right now.`);
  });

  setCommerceStatus(`Loaded ${ordersResponse.data?.length || 0} orders and ${offersResponse.data?.length || 0} offers.${historyError ? ' Some conversation details are temporarily unavailable.' : ''}`);
  const technical = document.getElementById('commerceTechnicalDetails');
  if (technical) technical.textContent = historyError?.message || 'Connection is working.';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseAdminHeight(value) {
  return window.MVPLUX_PRICING.parseHeight(value);
}

function formatAdminMoney(price) {
  return Number.isFinite(price) ? `$${price.toFixed(2)}` : 'Enter a valid height';
}

function calculateAdminOriginalPrice(height, settings = readPriceSettings()) {
  return window.MVPLUX_PRICING.calculateHeightPrice(height, settings);
}

function updateAdminOriginalPrice(form, settings = readPriceSettings()) {
  const output = form?.querySelector('.admin-original-price');
  if (!output) return;
  output.value = formatAdminMoney(calculateAdminOriginalPrice(form.querySelector('[name="originalHeight"]')?.value, settings));
}

function allAdminProducts() {
  const categoryCards = newAdminArchitectureEnabled()
    ? normalizedCategoryCardProducts()
    : adminProducts.map((product) => ({ ...product, categoryCard: true }));
  if (newAdminArchitectureEnabled()) {
    return [...categoryCards, ...Object.values(readAdminProducts()).filter((product) => product?.slug)];
  }
  const products = [
    ...categoryCards,
    ...adminCharacterProducts,
    ...readCustomProducts()
  ];
  const known = new Set(products.map((product) => product.slug));
  Object.values(readAdminProducts()).forEach((product) => {
    if (product?.slug && !known.has(product.slug)) products.push(product);
  });
  return products;
}

function creationCategoryMarkup() {
  const categories = newAdminArchitectureEnabled()
    ? Object.values(readAdminCategories())
    : window.MVPLUX_PRODUCT_CATEGORIES || [];
  return categories
    .filter((category) => category?.key)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
    .map((category) => `<label><input name="categories" type="checkbox" value="${escapeAdminHtml(category.key)}"> ${escapeAdminHtml(category.title || category.label || category.key)}</label>`)
    .join('');
}

function createFormDisplaySettings(form) {
  const number = (name) => {
    const raw = form.elements.namedItem(name)?.value;
    return raw === '' || raw === undefined ? undefined : Number(raw);
  };
  return Object.fromEntries(Object.entries({
    backgroundImage: form.elements.namedItem('backgroundImage')?.value.trim() || undefined,
    backgroundPosition: form.elements.namedItem('backgroundPosition')?.value.trim() || 'center center',
    standeeSizePercent: number('standeeSizePercent'),
    standeeLeftPercent: number('standeeLeftPercent'),
    standeeVerticalPercent: number('standeeVerticalPercent'),
    logoSizePercent: number('logoSizePercent'),
    logoVerticalPercent: number('logoVerticalPercent')
  }).filter(([, value]) => value !== undefined && value !== ''));
}

function parseCreationImageChoices(value = '') {
  return String(value || '').split(/\r?\n/).flatMap((line) => {
    const [label, ...pathParts] = line.split('|');
    const image = pathParts.join('|').trim();
    return image ? [{ label: label.trim() || 'Alternate image', image }] : [];
  });
}

function creationImageLabel(path = '') {
  const fileName = String(path).split('/').pop() || 'Image';
  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function creationImageLibrary(kind = 'product') {
  const values = new Set();
  const add = (path) => { if (validatePublishImagePath(String(path || ''))) values.add(String(path)); };
  if (kind === 'background') add(IMAGE_IMPORT_DEFAULT_BACKGROUND);
  allAdminProducts().forEach((product) => {
    if (kind === 'background') add(product.backgroundImage);
    else {
      add(product.cutoutImage);
      (product.imageChoices || []).forEach((choice) => add(choice.image || choice.src));
    }
  });
  Object.values(adminArchitectureState?.candidate?.categories || {}).forEach((category) => {
    if (kind === 'background') {
      add(category.card?.backgroundImage);
      add(category.displaySettings?.backgroundImage);
    } else add(category.card?.image);
  });
  if (kind !== 'background') imageDraftInventory.forEach((draft) => add(draft?.path));
  return [...values].sort((left, right) => creationImageLabel(left).localeCompare(creationImageLabel(right)));
}

function populateCreationImagePickers(form) {
  form?.querySelectorAll('[data-admin-image-picker]').forEach((select) => {
    const multiple = select.multiple;
    const selected = new Set([...select.selectedOptions].map((option) => option.value).filter(Boolean));
    const kind = select.dataset.adminImagePicker === 'background' ? 'background' : 'product';
    const prompt = select.dataset.adminImagePicker === 'background'
      ? '<option value="">Use the clean showroom background</option>'
      : multiple ? '' : '<option value="">Choose an image…</option>';
    select.innerHTML = prompt + creationImageLibrary(kind).map((path) => (
      `<option value="${escapeAdminHtml(path)}" ${selected.has(path) ? 'selected' : ''}>${escapeAdminHtml(creationImageLabel(path))}</option>`
    )).join('');
  });
}

function creationSelectedImageChoices(formData) {
  const choices = formData.getAll('imageChoicePicker').map((image) => ({ label: creationImageLabel(image), image: String(image) }));
  return [...choices, ...parseCreationImageChoices(formData.get('imageChoices'))]
    .filter((choice, index, items) => choice.image && items.findIndex((item) => item.image === choice.image) === index);
}

function buildNewProductRecord({ slug, title, description = '', funFact = '', originalHeight = '', priceOverride, cutoutImage, backgroundImage = IMAGE_IMPORT_DEFAULT_BACKGROUND, imageChoices = [], categories = [], visible = true, displayOverrides = {}, approvalStatus = 'draft', createdAt = new Date().toISOString() } = {}) {
  const productSlug = makeSlug(slug || title);
  const price = priceOverride === '' || priceOverride === undefined ? undefined : Number(priceOverride);
  return {
    slug: productSlug,
    custom: true,
    title: String(title || '').trim(),
    description: String(description || '').trim(),
    funFact: String(funFact || '').trim(),
    originalHeight: String(originalHeight || '').trim(),
    ...(Number.isFinite(price) && price >= 0 ? { priceOverride: price } : {}),
    cutoutImage: String(cutoutImage || '').trim(),
    backgroundImage: String(backgroundImage || IMAGE_IMPORT_DEFAULT_BACKGROUND).trim(),
    imageChoices: normalizeImageChoices(imageChoices).filter((choice) => choice.image !== String(cutoutImage || '').trim()),
    categories: [...new Set((categories || []).filter(Boolean))],
    visible: Boolean(visible),
    categoryOrder: Object.fromEntries((categories || []).filter(Boolean).map((category) => [category, 999])),
    productOrder: 999,
    displayOverrides,
    createdAt,
    updatedAt: createdAt,
    draftStatus: approvalStatus === 'approved' ? 'ready' : 'draft',
    approvalStatus
  };
}

function newProductRecordOperation(product) {
  return { type: 'record', collectionKey: 'products', entryKey: product.slug, baseRecord: undefined, patch: product };
}

function syncGeneratedCreationValue(form, fieldName) {
  const field = form.elements.namedItem(fieldName);
  const title = form.elements.namedItem('title')?.value || '';
  if (!field) return;
  const generated = makeSlug(title);
  if (!field.value || field.value === field.dataset.generatedValue) field.value = generated === 'custom-card' && !title.trim() ? '' : generated;
  field.dataset.generatedValue = field.value;
}

function renderNewProductPreview(form) {
  const preview = form.querySelector('[data-create-product-preview]');
  if (!preview) return;
  const image = form.elements.namedItem('cutoutImage')?.value.trim() || 'images/FrontPageWeb/Sports-Kobe-KB1forprint.png';
  const background = form.elements.namedItem('backgroundImage')?.value.trim() || IMAGE_IMPORT_DEFAULT_BACKGROUND;
  const title = form.elements.namedItem('title')?.value.trim() || 'Example Standee';
  const description = form.elements.namedItem('description')?.value.trim() || 'Your product description will appear here.';
  const selectedCategory = form.querySelector('[name="categories"]:checked')?.closest('label')?.textContent.trim() || 'New Collection';
  const size = Number(form.elements.namedItem('standeeSizePercent')?.value || 63);
  const left = 50 + Number(form.elements.namedItem('standeeLeftPercent')?.value || 0);
  const vertical = 18 - Number(form.elements.namedItem('standeeVerticalPercent')?.value || 0);
  const logoSize = Number(form.elements.namedItem('logoSizePercent')?.value || 82);
  const logoVertical = Number(form.elements.namedItem('logoVerticalPercent')?.value || -4);
  const backgroundPosition = form.elements.namedItem('backgroundPosition')?.value || 'center center';
  preview.innerHTML = `<article class="admin-builder-product-card">
    <p class="admin-builder-category">${escapeAdminHtml(selectedCategory)}</p>
    <h4>${escapeAdminHtml(title)}</h4><p>${escapeAdminHtml(description)}</p>
    <div class="admin-preview-stage" style="background-image:url('${escapeAdminHtml(background)}');background-position:${escapeAdminHtml(backgroundPosition)}">
      <img class="admin-preview-logo" src="images/FrontPageWeb/Herobackgroundparts-logowords.png" alt="" style="width:${logoSize}%;top:${logoVertical}%">
      <img class="admin-preview-cutout" src="${escapeAdminHtml(image)}" alt="Product preview" style="height:${size}%;left:${left}%;bottom:${vertical}%">
      <div class="admin-preview-choice-row"><span>Original</span><span>Custom Size</span></div>
    </div>
  </article>`;
}

function renderNewCategoryPreview(form) {
  const preview = form.querySelector('[data-create-category-preview]');
  if (!preview) return;
  const image = form.elements.namedItem('cardImage')?.value.trim() || 'images/FrontPageWeb/Sports-Kobe-KB1forprint.png';
  const background = form.elements.namedItem('cardBackgroundImage')?.value.trim() || IMAGE_IMPORT_DEFAULT_BACKGROUND;
  const title = form.elements.namedItem('title')?.value.trim() || 'Example Collection';
  const description = form.elements.namedItem('description')?.value.trim() || 'A short description of this collection appears here.';
  const position = form.elements.namedItem('backgroundPosition')?.value || 'center center';
  preview.innerHTML = `<article class="admin-builder-category-card" style="background-image:url('${escapeAdminHtml(background)}');background-position:${escapeAdminHtml(position)}">
    <img src="${escapeAdminHtml(image)}" alt="Category preview">
    <div><h4>${escapeAdminHtml(title)}</h4><p>${escapeAdminHtml(description)}</p><span class="admin-button admin-button-primary">View Collection</span></div>
  </article>`;
}

function setCreationStatus(form, message, state = '') {
  const status = form?.querySelector('.admin-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

async function requestAdminContentSuggestion(form, action, button) {
  if (button.dataset.aiBusy === 'true') return;
  button.dataset.aiBusy = 'true';
  button.disabled = true;
  const client = getAdminClient();
  const projectUrl = window.MVPLUX_SUPABASE?.url;
  const status = form.querySelector('[data-ai-status], .admin-status, [data-image-draft-status]');
  if (!client?.auth || !projectUrl) {
    if (status) status.textContent = 'AI suggestions are unavailable. You can continue entering text manually.';
    button.disabled = false;
    delete button.dataset.aiBusy;
    return;
  }
  const originalText = button.textContent;
  button.textContent = 'Thinking…';
  if (status) status.textContent = 'Preparing an editable suggestion…';
  let timeout = 0;
  try {
    const { data, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    const token = data?.session?.access_token;
    if (!token) throw new Error('Sign in as Admin to use optional AI suggestions.');
    const formData = new FormData(form);
    const controller = new AbortController();
    timeout = window.setTimeout(() => controller.abort(), 45_000);
    const response = await fetch(`${projectUrl}/functions/v1/admin-content-assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: window.MVPLUX_SUPABASE?.publishableKey || '' },
      body: JSON.stringify({
        action,
        identity: String(formData.get('subjectIdentity') || ''),
        imagePath: String(formData.get('selectedPreviewImage') || formData.get('cutoutImage') || formData.get('cardImage') || form.dataset.imagePath || ''),
        category: formData.getAll('categories').join(', '),
        context: {
          title: String(formData.get('title') || ''),
          description: String(formData.get('description') || ''),
          funFact: String(formData.get('funFact') || '')
        }
      }),
      signal: controller.signal
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || result.message || `AI request failed (HTTP ${response.status}).`);
    const fieldNames = action === 'improve' ? ['title', 'description', 'funFact'] : [action];
    fieldNames.forEach((fieldName) => {
      const field = form.elements.namedItem(fieldName);
      const suggestion = String(result[fieldName] || '').trim();
      if (!field || !suggestion) return;
      if (field.value.trim() && !window.confirm(`Replace the current ${fieldName === 'funFact' ? 'fun fact' : fieldName} with this suggestion?`)) return;
      field.value = suggestion;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    if (status) status.textContent = 'Suggestion added for review. Nothing was saved.';
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'The AI request timed out. Try again.' : error?.message || error;
    if (status) status.textContent = `AI suggestion unavailable: ${message}. Manual entry still works.`;
  } finally {
    if (timeout) window.clearTimeout(timeout);
    button.disabled = false;
    button.textContent = originalText;
    delete button.dataset.aiBusy;
  }
}

function bindAdminAiAssistance(root = document) {
  if (root.documentElement?.dataset.adminAiBound) return;
  if (root.documentElement) root.documentElement.dataset.adminAiBound = 'true';
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-ai-suggest]');
    const form = button?.closest('form');
    if (!button || !form) return;
    requestAdminContentSuggestion(form, button.dataset.aiSuggest, button);
  });
}

async function saveNewProductFromForm(form, approvalStatus) {
  const formData = new FormData(form);
  const slug = makeSlug(formData.get('slug') || formData.get('title'));
  if (!slug || !formData.get('title') || !formData.get('cutoutImage') || !formData.get('originalHeight')) {
    setCreationStatus(form, 'Add the title, slug, main image, and original height.', 'error');
    return false;
  }
  const latest = await fetchAuthoritativeAdminGlobal();
  if (latest.edits?.products?.[slug]) {
    setCreationStatus(form, 'That slug already belongs to an existing product.', 'error');
    return false;
  }
  const categories = formData.getAll('categories');
  const product = buildNewProductRecord({
    slug, title: formData.get('title'), description: formData.get('description'), funFact: formData.get('funFact'),
    originalHeight: formData.get('originalHeight'), priceOverride: formData.get('priceOverride'), cutoutImage: formData.get('cutoutImage'),
    backgroundImage: formData.get('backgroundImage'), imageChoices: creationSelectedImageChoices(formData), categories,
    visible: formData.has('visible'), displayOverrides: createFormDisplaySettings(form), approvalStatus
  });
  setCreationStatus(form, 'Saving…', 'saving');
  const result = await saveAdminCollectionOperations([newProductRecordOperation(product)]);
  if (!result.ok) {
    setCreationStatus(form, adminLastSaveError || 'Save failed — your values remain on screen.', 'error');
    return false;
  }
  form.dataset.lastCreatedSlug = slug;
  form.dataset.lastCreatedPage = (readAdminCategories()[categories[0]]?.page || 'index.html');
  form.querySelector('[data-open-created-product]').disabled = false;
  setCreationStatus(form, approvalStatus === 'approved' ? 'Approved — Waiting to Publish' : 'Draft saved privately.', 'saved');
  form.reset();
  form.querySelector('[name="backgroundPosition"]').value = 'center center';
  renderNewProductPreview(form);
  renderAdminProducts();
  return true;
}

async function saveNewCategoryFromForm(form, approvalStatus) {
  const formData = new FormData(form);
  const key = makeSlug(formData.get('key') || formData.get('title'));
  if (!key || !formData.get('title')) {
    setCreationStatus(form, 'Add the category title and key.', 'error');
    return false;
  }
  const latest = await fetchAuthoritativeAdminGlobal();
  if (latest.edits?.categories?.[key]) {
    setCreationStatus(form, 'That category key already exists.', 'error');
    return false;
  }
  const now = new Date().toISOString();
  const category = {
    key,
    title: String(formData.get('title')).trim(),
    description: String(formData.get('description') || '').trim(),
    funFact: String(formData.get('funFact') || '').trim(),
    page: String(formData.get('page') || '').trim() || `category.html?category=${encodeURIComponent(key)}`,
    visible: formData.has('visible'),
    order: Number(formData.get('order') || 999),
    card: {
      title: String(formData.get('title')).trim(),
      description: String(formData.get('description') || '').trim(),
      image: String(formData.get('cardImage') || '').trim(),
      backgroundImage: String(formData.get('cardBackgroundImage') || '').trim(),
      visible: formData.has('visible'),
      order: Number(formData.get('order') || 999)
    },
    displaySettings: createFormDisplaySettings(form),
    createdAt: now,
    updatedAt: now,
    draftStatus: approvalStatus === 'approved' ? 'ready' : 'draft',
    approvalStatus
  };
  setCreationStatus(form, 'Saving…', 'saving');
  const result = await saveAdminCollectionOperations([{
    type: 'record', collectionKey: 'categories', entryKey: key, baseRecord: undefined, patch: category
  }]);
  if (!result.ok) {
    setCreationStatus(form, adminLastSaveError || 'Save failed — your values remain on screen.', 'error');
    return false;
  }
  form.dataset.lastCreatedPage = category.page;
  form.querySelector('[data-open-created-category]').disabled = false;
  setCreationStatus(form, approvalStatus === 'approved' ? 'Approved — Waiting to Publish' : 'Draft saved privately.', 'saved');
  form.reset();
  form.querySelector('[name="backgroundPosition"]').value = 'center center';
  renderNewCategoryPreview(form);
  return true;
}

function setupAdminCreationWorkspace() {
  const section = document.getElementById('create-content');
  const productForm = document.getElementById('createProductForm');
  const categoryForm = document.getElementById('createCategoryForm');
  if (!productForm || !categoryForm) return;
  productForm.querySelector('[data-create-product-categories]').innerHTML = creationCategoryMarkup();
  populateCreationImagePickers(productForm);
  populateCreationImagePickers(categoryForm);
  [productForm, categoryForm].forEach((form) => {
    const enabled = normalizedAdminStateAvailable();
    form.querySelectorAll('button[type="submit"]').forEach((button) => { button.disabled = !enabled; });
    const availability = form.querySelector('[data-builder-availability]');
    if (availability) availability.textContent = enabled
      ? 'Saved privately — customers cannot see this until you publish.'
      : 'Preview available. Activate the New Admin System from Dashboard before saving.';
  });
  if (section) section.dataset.architectureReady = String(newAdminArchitectureEnabled());
  if (productForm.dataset.creationBound) {
    renderNewProductPreview(productForm);
    renderNewCategoryPreview(categoryForm);
    return;
  }
  productForm.dataset.creationBound = 'true';
  categoryForm.dataset.creationBound = 'true';
  productForm.addEventListener('input', (event) => {
    if (event.target.name === 'title') syncGeneratedCreationValue(productForm, 'slug');
    renderNewProductPreview(productForm);
  });
  categoryForm.addEventListener('input', (event) => {
    if (event.target.name === 'title') syncGeneratedCreationValue(categoryForm, 'key');
    renderNewCategoryPreview(categoryForm);
  });
  productForm.querySelector('[data-preview-new-product]')?.addEventListener('click', () => renderNewProductPreview(productForm));
  categoryForm.querySelector('[data-preview-new-category]')?.addEventListener('click', () => renderNewCategoryPreview(categoryForm));
  productForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!newAdminArchitectureEnabled()) {
      setCreationStatus(productForm, 'Activate the New Admin System from Dashboard before saving.', 'error');
      return;
    }
    saveNewProductFromForm(productForm, event.submitter?.value === 'approve' ? 'approved' : 'draft');
  });
  categoryForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!newAdminArchitectureEnabled()) {
      setCreationStatus(categoryForm, 'Activate the New Admin System from Dashboard before saving.', 'error');
      return;
    }
    saveNewCategoryFromForm(categoryForm, event.submitter?.value === 'approve' ? 'approved' : 'draft');
  });
  productForm.querySelector('[data-open-created-product]')?.addEventListener('click', () => {
    if (productForm.dataset.lastCreatedSlug) window.open(`${productForm.dataset.lastCreatedPage || 'index.html'}#${productForm.dataset.lastCreatedSlug}`, '_blank', 'noopener');
  });
  categoryForm.querySelector('[data-open-created-category]')?.addEventListener('click', () => {
    if (categoryForm.dataset.lastCreatedPage) window.open(categoryForm.dataset.lastCreatedPage, '_blank', 'noopener');
  });
  productForm.addEventListener('reset', () => setTimeout(() => {
    populateCreationImagePickers(productForm);
    syncGeneratedCreationValue(productForm, 'slug');
    renderNewProductPreview(productForm);
  }));
  categoryForm.addEventListener('reset', () => setTimeout(() => {
    populateCreationImagePickers(categoryForm);
    syncGeneratedCreationValue(categoryForm, 'key');
    renderNewCategoryPreview(categoryForm);
  }));
  renderNewProductPreview(productForm);
  renderNewCategoryPreview(categoryForm);
}

function makeSlug(title) {
  return (title || 'custom-card').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom-card';
}

async function createCustomProduct() {
  const title = document.getElementById('newProductTitle')?.value.trim() || 'Custom Standee';
  const products = readCustomProducts();
  const slug = makeSlug(title);
  if (products.some((product) => product.slug === slug) || [...adminProducts, ...adminCharacterProducts].some((product) => product.slug === slug)) {
    setStatus('A card with that name already exists.');
    return;
  }

  const product = {
    slug,
    custom: true,
    title,
    description: 'New custom standee card.',
    originalHeight: 72,
    cutoutImage: 'images/FrontPageWeb/Sports-Kobe-KB1forprint.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg',
    categories: [],
    visible: false,
    categoryOrder: {}
  };
  const result = await saveAdminCollectionOperations([{
    type: 'record', collectionKey: 'customProducts', identityKey: 'slug', entryKey: slug,
    baseRecord: undefined, patch: product
  }]);
  if (!result.ok) return;
  renderAdminProducts();
  setStatus('Card created and saved live.');
}

async function archiveProduct(slug) {
  const baseValues = readArchivedProducts();
  const result = await saveAdminArchiveMembership(slug, true, baseValues);
  if (!result.ok) return;
  renderAdminProducts();
  setStatus('Card saved for later live.');
}

async function restoreProduct(slug) {
  const baseValues = readArchivedProducts();
  const result = await saveAdminArchiveMembership(slug, false, baseValues);
  if (!result.ok) return;
  renderAdminProducts();
  setStatus('Card restored.');
}

async function deleteProduct(slug) {
  if (!window.confirm('Delete this product record? Its image file will not be deleted.')) return;
  const isCustom = readCustomProducts().some((product) => product.slug === slug);
  const products = readAdminProducts();
  delete products[slug];
  const patch = { products };
  if (isCustom) patch.customProducts = readCustomProducts().filter((product) => product.slug !== slug);
  if (!isCustom) patch.deletedProducts = [...new Set([...readDeletedProducts(), slug])];
  if (!await saveProductWorkflowPatch(patch)) return;
  renderAdminProducts();
  setStatus('Product record deleted. Its image file was not changed.');
}

async function returnProductToDraft(slug) {
  const customProducts = readCustomProducts();
  const product = customProducts.find((item) => item.slug === slug);
  if (!product?.cutoutImage) {
    setStatus('Only approved custom products with a repository image can return to Draft.');
    return;
  }
  if (!window.confirm(`Return ${product.title} to New Images Waiting for Setup? The image file will not be changed.`)) return;

  const imageDrafts = readImageDraftEdits();
  imageDrafts[product.cutoutImage] = {
    path: product.cutoutImage,
    purpose: 'new-product',
    title: product.title || '',
    slug: product.slug || '',
    description: product.description || '',
    originalHeight: String(product.originalHeight || ''),
    backgroundImage: product.backgroundImage || '',
    categories: Array.isArray(product.categories) ? [...product.categories] : []
  };
  const configuredImagePaths = readImageDraftPaths('configuredImagePaths').filter((path) => path !== product.cutoutImage);
  const products = readAdminProducts();
  delete products[slug];
  const savedForLaterProducts = readArchivedProducts().filter((item) => item !== slug);
  const saved = await saveProductWorkflowPatch({
    customProducts: customProducts.filter((item) => item.slug !== slug),
    products,
    savedForLaterProducts,
    configuredImagePaths,
    imageDrafts
  });
  if (!saved) return;
  renderAdminProducts();
  renderImageDrafts();
  setStatus('Product returned to Draft. The physical image file was preserved.');
}

function productPreviewMarkup(value) {
  const title = value.title || 'Product Card';
  const description = value.description || '';
  const cutoutImage = value.cutoutImage || '';
  const backgroundImage = value.backgroundImage || 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg';
  const cutoutHeight = value.cutoutHeight || '63';
  const cutoutLeft = value.cutoutLeft || '50';
  const cutoutBottom = value.cutoutBottom || '21';
  const logoWidth = value.logoWidth || '82';
  const logoTop = value.logoTop || '-4';
  const backgroundPosition = value.stageBackgroundPosition || 'center center';

  return `
    <div class="admin-card-preview">
      <h4>${title}</h4>
      <p>${description}</p>
      <div class="admin-preview-stage" style="background-image: url('${backgroundImage}'); background-position: ${backgroundPosition};">
        <img class="admin-preview-logo" src="images/FrontPageWeb/Herobackgroundparts-logowords.png" alt="" style="width: ${logoWidth}%; top: ${logoTop}%;">
        <img class="admin-preview-cutout" src="${cutoutImage}" alt="" style="height: ${cutoutHeight}%; left: ${cutoutLeft}%; bottom: ${cutoutBottom}%;">
        <button class="admin-resize-handle admin-cutout-resize" type="button" aria-label="Resize standee"></button>
        <button class="admin-resize-handle admin-logo-resize" type="button" aria-label="Resize logo"></button>
        <div class="admin-preview-choice-row">
          <span>Original</span>
          <span>Custom Size</span>
        </div>
      </div>
    </div>
  `;
}

function updateProductPreview(form) {
  const preview = form.querySelector('.admin-card-preview-wrap');
  if (!preview) return;

  const formData = new FormData(form);
  preview.innerHTML = productPreviewMarkup({
    title: formData.get('title').trim(),
    description: formData.get('description').trim(),
    cutoutImage: formData.get('cutoutImage').trim(),
    backgroundImage: formData.get('backgroundImage').trim(),
    cutoutHeight: formData.get('cutoutHeight').trim(),
    cutoutLeft: formData.get('cutoutLeft').trim(),
    cutoutBottom: formData.get('cutoutBottom').trim(),
    logoWidth: formData.get('logoWidth').trim(),
    logoTop: formData.get('logoTop').trim(),
    stageBackgroundPosition: formData.get('stageBackgroundPosition').trim()
  });
  attachPreviewControls(form);
}

function updateFieldValue(form, name, value) {
  const field = form.querySelector(`[name="${name}"]`);
  if (!field) return;
  field.value = String(Math.round(value));
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function syncPreviewFromFields(form) {
  const stage = form.querySelector('.admin-preview-stage');
  const cutout = form.querySelector('.admin-preview-cutout');
  const logo = form.querySelector('.admin-preview-logo');
  const cutoutHandle = form.querySelector('.admin-cutout-resize');
  const logoHandle = form.querySelector('.admin-logo-resize');
  const backgroundImage = form.querySelector('[name="backgroundImage"]')?.value.trim();
  const cutoutImage = form.querySelector('[name="cutoutImage"]')?.value.trim();
  const backgroundPosition = form.querySelector('[name="stageBackgroundPosition"]')?.value.trim() || 'center center';
  const cutoutHeight = form.querySelector('[name="cutoutHeight"]')?.value || '63';
  const cutoutLeft = form.querySelector('[name="cutoutLeft"]')?.value || '50';
  const cutoutBottom = form.querySelector('[name="cutoutBottom"]')?.value || '21';
  const logoWidth = form.querySelector('[name="logoWidth"]')?.value || '82';
  const logoTop = form.querySelector('[name="logoTop"]')?.value || '-4';

  if (stage && backgroundImage) {
    stage.style.backgroundImage = `url("${backgroundImage}")`;
    stage.style.backgroundPosition = backgroundPosition;
  }

  if (cutout && cutoutImage) {
    cutout.src = cutoutImage;
    cutout.style.height = `${cutoutHeight}%`;
    cutout.style.left = `${cutoutLeft}%`;
    cutout.style.bottom = `${cutoutBottom}%`;
  }

  if (logo) {
    logo.style.width = `${logoWidth}%`;
    logo.style.top = `${logoTop}%`;
  }

  if (cutoutHandle) {
    cutoutHandle.style.left = `${clamp(Number(cutoutLeft) + 15, 8, 94)}%`;
    cutoutHandle.style.bottom = `${clamp(Number(cutoutBottom) + Number(cutoutHeight) * 0.18, 8, 84)}%`;
  }

  if (logoHandle) {
    logoHandle.style.left = `${clamp(50 + Number(logoWidth) / 2 - 4, 12, 94)}%`;
    logoHandle.style.top = `${clamp(Number(logoTop) + 7, 2, 40)}%`;
  }
}

function attachPreviewControls(form) {
  const preview = form.querySelector('.admin-preview-stage');
  const cutout = form.querySelector('.admin-preview-cutout');
  const logo = form.querySelector('.admin-preview-logo');
  const cutoutHandle = form.querySelector('.admin-cutout-resize');
  const logoHandle = form.querySelector('.admin-logo-resize');
  if (!preview || !cutout || cutout.dataset.controlsReady) return;

  cutout.dataset.controlsReady = 'true';
  cutout.title = 'Drag to move. Drag gold corner to resize.';
  logo.title = 'Drag logo to move. Drag gold corner to resize.';
  if (cutoutHandle) cutoutHandle.title = 'Drag to resize standee.';
  if (logoHandle) logoHandle.title = 'Drag to resize logo.';

  syncPreviewFromFields(form);

  const dragTarget = (event, target) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const move = (moveEvent) => {
      const rect = preview.getBoundingClientRect();
      const xPercent = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      const bottomPercent = ((rect.bottom - moveEvent.clientY) / rect.height) * 100;

      if (target === 'cutout') {
        updateFieldValue(form, 'cutoutLeft', clamp(xPercent, 0, 100));
        updateFieldValue(form, 'cutoutBottom', clamp(bottomPercent, 0, 60));
      } else {
        updateFieldValue(form, 'logoTop', clamp(((moveEvent.clientY - rect.top) / rect.height) * 100, -20, 40));
      }
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  cutout.addEventListener('pointerdown', (event) => dragTarget(event, 'cutout'));
  logo.addEventListener('pointerdown', (event) => dragTarget(event, 'logo'));

  const resizeTarget = (event, name, min, max, baseValue, direction = 1) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const startY = event.clientY;
    const field = form.querySelector(`[name="${name}"]`);
    const startValue = parseFloat(field?.value || baseValue);
    const move = (moveEvent) => {
      const delta = ((startY - moveEvent.clientY) / preview.getBoundingClientRect().height) * 100 * direction;
      updateFieldValue(form, name, clamp(startValue + delta, min, max));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  cutoutHandle?.addEventListener('pointerdown', (event) => resizeTarget(event, 'cutoutHeight', 30, 100, 63));
  logoHandle?.addEventListener('pointerdown', (event) => resizeTarget(event, 'logoWidth', 30, 100, 82));

  cutout.addEventListener('wheel', (event) => {
    event.preventDefault();
    const field = form.querySelector('[name="cutoutHeight"]');
    const current = parseFloat(field.value || '63');
    updateFieldValue(form, 'cutoutHeight', clamp(current + (event.deltaY < 0 ? 2 : -2), 30, 100));
  });

  logo.addEventListener('wheel', (event) => {
    event.preventDefault();
    const field = form.querySelector('[name="logoWidth"]');
    const current = parseFloat(field.value || '82');
    updateFieldValue(form, 'logoWidth', clamp(current + (event.deltaY < 0 ? 2 : -2), 30, 100));
  });
}

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('error', () => reject(new Error('Could not read image.')));
    reader.addEventListener('load', () => {
      const image = new Image();
      image.addEventListener('error', () => reject(new Error('Could not load image.')));
      image.addEventListener('load', () => {
        const maxSide = 1800;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const keepTransparency = file.type === 'image/png' || file.type === 'image/webp';
        resolve(canvas.toDataURL(keepTransparency ? 'image/png' : 'image/jpeg', 0.86));
      });
      image.src = reader.result;
    });
    reader.readAsDataURL(file);
  });
}

function collectProductFormData(form, dirtyFields = form?._adminDirtyFields || new Set()) {
  const formData = new FormData(form);
  const base = allAdminProducts().find((product) => product.slug === form.dataset.slug) || {};
  const current = { ...base, ...(readAdminProducts()[form.dataset.slug] || {}) };
  const patch = {};
  const textFields = ['title', 'description', 'cutoutImage', 'backgroundImage', 'originalHeight', 'cutoutHeight', 'cutoutLeft', 'cutoutBottom', 'logoWidth', 'logoTop', 'stageBackgroundPosition'];
  textFields.forEach((field) => {
    if (dirtyFields.has(field)) patch[field] = String(formData.get(field) || '').trim();
  });
  if (dirtyFields.has('categories')) patch.categories = current.categoryCard ? [] : formData.getAll('categories');
  if (dirtyFields.has('visible')) patch.visible = current.categoryCard ? current.visible !== false : formData.has('visible');
  return patch;
}

async function saveProductForm(form, message = 'Saved product changes live. Go back to Shop to see them.') {
  const patch = collectProductFormData(form);
  if (!Object.keys(patch).length) {
    setProductSaveState(form, 'Saved — no unsaved fields', 'saved');
    setStatus('No product fields have changed.');
    return true;
  }
  const savedVersions = new Map(Object.keys(patch).map((field) => [field, form._adminDirtyVersions?.get(field) || 0]));
  let result;
  const categoryKey = newAdminArchitectureEnabled() ? ADMIN_CATEGORY_CARD_MAP[form.dataset.slug] : '';
  if (categoryKey) {
    const cardFieldMap = { title: 'title', description: 'description', cutoutImage: 'image', backgroundImage: 'backgroundImage', visible: 'visible' };
    const cardPatch = Object.fromEntries(Object.entries(patch).flatMap(([field, value]) => cardFieldMap[field] ? [[cardFieldMap[field], value]] : []));
    const displayFieldMap = {
      stageBackgroundPosition: 'backgroundPosition',
      cutoutHeight: 'standeeSizePercent',
      cutoutLeft: 'standeeLeftPercent',
      cutoutBottom: 'standeeVerticalPercent',
      logoWidth: 'logoSizePercent',
      logoTop: 'logoVerticalPercent'
    };
    const displayPatch = Object.fromEntries(Object.entries(patch).flatMap(([field, value]) => displayFieldMap[field] ? [[displayFieldMap[field], value === '' ? null : Number(value)]] : []));
    const latestCategory = readAdminCategories()[categoryKey] || {};
    const operations = [];
    if (Object.keys(cardPatch).length) operations.push({
      type: 'record', collectionKey: 'categories', entryKey: categoryKey,
      baseRecord: latestCategory,
      patch: { card: { ...(latestCategory.card || {}), ...cardPatch }, updatedAt: new Date().toISOString(), draftStatus: 'ready', approvalStatus: 'draft' }
    });
    if (Object.keys(displayPatch).length) operations.push({
      type: 'record', collectionKey: 'categories', entryKey: categoryKey,
      baseRecord: latestCategory,
      patch: { displaySettings: { ...(latestCategory.displaySettings || {}), ...displayPatch }, updatedAt: new Date().toISOString(), draftStatus: 'ready', approvalStatus: 'draft' }
    });
    const saved = await saveAdminCollectionOperations(operations);
    result = saved.ok ? { ok: true, record: { ...(form._adminBaseRecord || {}), ...patch } } : saved;
  } else {
    result = await saveAdminProductFieldPatch(form.dataset.slug, patch, form._adminBaseRecord || {}, form);
  }
  if (!result.ok) return false;
  form._adminBaseRecord = structuredClone(result.record || { ...(form._adminBaseRecord || {}), ...patch });
  Object.keys(patch).forEach((field) => {
    if ((form._adminDirtyVersions?.get(field) || 0) === savedVersions.get(field)) form._adminDirtyFields?.delete(field);
  });
  form.querySelector('[data-product-save-conflict]')?.remove();
  renderAdminExportPreview();
  if (form._adminDirtyFields?.size) {
    setProductSaveState(form, `Unsaved changes: ${[...form._adminDirtyFields].join(', ')}`, 'unsaved');
    setStatus('Earlier fields saved; newer edits are still unsaved.');
  } else {
    setStatus(message);
  }
  return true;
}

function productDirtyFieldForControl(field) {
  if (!field?.name || field.name === 'activeCategory' || field.matches('[type="file"]')) return '';
  if (field.name === 'categories') return 'categories';
  return field.name;
}

function markProductFieldDirty(form, fieldName) {
  if (!form || !fieldName) return;
  form._adminDirtyFields = form._adminDirtyFields || new Set();
  form._adminDirtyVersions = form._adminDirtyVersions || new Map();
  form._adminDirtyVersions.set(fieldName, (form._adminDirtyVersions.get(fieldName) || 0) + 1);
  form._adminDirtyFields.add(fieldName);
  setProductSaveState(form, `Unsaved changes: ${[...form._adminDirtyFields].join(', ')}`, 'unsaved');
}

function schedulePlacementSave(form) {
  clearTimeout(form._placementSaveTimer);
  form._placementSaveTimer = setTimeout(() => {
    saveProductForm(form, 'Placement preview changed.');
  }, 550);
}

async function handleImageUpload(fileInput, targetInput, form) {
  const file = fileInput.files?.[0];
  if (!file || !targetInput) return;

  setStatus('Loading image...');

  try {
    targetInput.value = await resizeImageFile(file);
    syncPreviewFromFields(form);
    await saveProductForm(form, 'Image changed and saved live.');
  } catch (error) {
    setStatus('That image could not be loaded. Try another image file.');
  }
}

function renderExtraImages() {
  const container = document.getElementById('adminExtraImages');
  if (!container) return;

  const saved = readExtraImages();
  const grouped = extraImageItems.reduce((groups, item) => {
    groups[item.group] = groups[item.group] || [];
    groups[item.group].push(item);
    return groups;
  }, {});

  container.innerHTML = Object.entries(grouped).map(([group, items]) => `
    <div class="admin-extra-image-group">
      <h3>${group}</h3>
      <div class="admin-extra-image-grid">
        ${items.map((item) => {
          const src = saved[item.key] || item.fallback;
          return `
            <div class="admin-extra-image-card" data-extra-image="${item.key}">
              <img src="${src}" alt="">
              <strong>${item.label}</strong>
              <input class="admin-long-path" type="text" value="${src}" readonly>
              <input type="file" accept="image/*">
              <button type="button" data-reset-extra-image="${item.key}">Reset</button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.admin-extra-image-card').forEach((card) => {
    const key = card.dataset.extraImage;
    const input = card.querySelector('input[type="file"]');
    input?.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;

      setStatus('Loading image...');
      try {
        const dataUrl = await resizeImageFile(file);
        const images = readExtraImages();
        const result = await saveAdminExtraImagePatch(key, dataUrl, images[key]);
        if (!result.ok) {
          setStatus('Error — image was not saved.');
          return;
        }
        card.querySelector('img').src = dataUrl;
        card.querySelector('.admin-long-path').value = dataUrl;
        setStatus('Image saved live.');
      } catch (error) {
        setStatus('That image could not be loaded. Try another image file.');
      }
    });
  });

  container.querySelectorAll('[data-reset-extra-image]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Clear this image edit and go back to the original image?')) return;
      const images = readExtraImages();
      const key = button.dataset.resetExtraImage;
      const result = await saveAdminExtraImagePatch(key, undefined, images[key], true);
      if (!result.ok) {
        setStatus('Error — image reset was not saved.');
        return;
      }
      renderExtraImages();
      setStatus('Image reset and saved live.');
    });
  });
}

function renderSavedProducts() {
  const container = document.getElementById('savedProducts');
  if (!container) return;

  const archived = readArchivedProducts();
  if (!archived.length) {
    container.innerHTML = '';
    return;
  }

  const bySlug = Object.fromEntries(allAdminProducts().map((product) => [product.slug, product]));
  container.innerHTML = `
    <div class="admin-saved-box">
      <h3>Saved for Later</h3>
      <div class="admin-saved-list">
        ${archived.map((slug) => `
          <button type="button" data-restore-slug="${slug}">Restore ${bySlug[slug]?.title || slug}</button>
        `).join('')}
      </div>
    </div>
  `;

  container.querySelectorAll('[data-restore-slug]').forEach((button) => {
    button.addEventListener('click', () => restoreProduct(button.dataset.restoreSlug));
  });
}

function categoryAssignmentMarkup(value) {
  const categories = window.MVPLUX_PRODUCT_CATEGORIES || [];
  const selected = new Set(value.categories || []);
  return `
    <fieldset class="admin-category-controls">
      <legend>Sections</legend>
      <label class="admin-visible-toggle">
        <input name="visible" type="checkbox" ${value.visible === false ? '' : 'checked'}>
        Show this product in assigned sections
      </label>
      <details>
        <summary>Add to Another Section</summary>
        <div class="admin-category-options">
          ${categories.map((category) => `
            <label>
              <input name="categories" type="checkbox" value="${category.key}" ${selected.has(category.key) ? 'checked' : ''}>
              ${category.label}
            </label>
          `).join('')}
        </div>
      </details>
      <div class="admin-category-order-row">
        <label>
          Current section
          <select name="activeCategory">
            ${categories.map((category) => `<option value="${category.key}" ${selected.has(category.key) ? 'selected' : ''}>${category.label}</option>`).join('')}
          </select>
        </label>
        <button type="button" data-remove-section>Remove from This Category</button>
        <button type="button" data-move-product="-1" title="Move left">←</button>
        <button type="button" data-move-product="1" title="Move right">→</button>
        <button type="button" data-move-product="-3" title="Move up">↑</button>
        <button type="button" data-move-product="3" title="Move down">↓</button>
      </div>
    </fieldset>
  `;
}

async function setProductVisibility(form, visible) {
  const input = form.querySelector('[name="visible"]');
  if (input) input.checked = visible;
  markProductFieldDirty(form, 'visible');
  if (!await saveProductForm(form, visible ? 'Product shown in assigned sections.' : 'Product hidden from customer sections.')) return;
  renderAdminProducts();
}

async function removeProductFromSelectedSection(form) {
  const category = form.querySelector('[name="activeCategory"]')?.value;
  const checkbox = form.querySelector(`[name="categories"][value="${category}"]`);
  if (!category || !checkbox || !checkbox.checked) {
    setStatus('That product is not assigned to the selected section.');
    return;
  }
  checkbox.checked = false;
  markProductFieldDirty(form, 'categories');
  if (!await saveProductForm(form, 'Removed from this section without deleting the product.')) return;
  renderAdminProducts();
}

async function moveProductInSelectedSection(form, offset) {
  const category = form.querySelector('[name="activeCategory"]')?.value;
  const slug = form.dataset.slug;
  const saved = readAdminProducts();
  const deleted = new Set(readDeletedProducts());
  const products = allAdminProducts()
    .filter((product) => !product.categoryCard && !deleted.has(product.slug))
    .map((product) => ({ ...product, ...(saved[product.slug] || {}) }))
    .filter((product) => product.visible !== false && (product.categories || []).includes(category))
    .sort((a, b) => (Number(a.categoryOrder?.[category]) || 0) - (Number(b.categoryOrder?.[category]) || 0));
  const index = products.findIndex((product) => product.slug === slug);
  const target = products[index + offset];
  if (index < 0 || !target) {
    setStatus('That product is already at the edge of this section.');
    return;
  }

  const currentOrder = Number(products[index].categoryOrder?.[category]) || index;
  const targetOrder = Number(target.categoryOrder?.[category]) || index + offset;
  const patches = {
    [slug]: { categoryOrder: { ...(products[index].categoryOrder || {}), [category]: targetOrder } },
    [target.slug]: { categoryOrder: { ...(target.categoryOrder || {}), [category]: currentOrder } }
  };
  if (!await saveAdminProductFieldPatches(patches, {
    [slug]: products[index],
    [target.slug]: target
  })) return;
  renderAdminProducts();
  setStatus('Product order saved for the selected section.');
}

function effectiveAdminProducts() {
  const saved = readAdminProducts();
  const deleted = new Set(readDeletedProducts());
  return allAdminProducts()
    .filter((product) => !product.categoryCard && !deleted.has(product.slug))
    .map((product) => ({ ...product, ...(saved[product.slug] || {}) }));
}

function effectiveAdminProduct(slug) {
  return effectiveAdminProducts().find((product) => product.slug === slug) || null;
}

function productCategoryNames(product) {
  const labels = new Map((window.MVPLUX_PRODUCT_CATEGORIES || []).map((category) => [category.key, category.label]));
  return (product?.categories || []).map((category) => labels.get(category) || category).join(', ') || 'Uncategorized';
}

function parentProductPickerMarkup(selectedSlug = '', excludedSlug = '', selectName = 'parentProductSlug') {
  const products = effectiveAdminProducts()
    .filter((product) => product.slug !== excludedSlug)
    .sort((left, right) => String(left.title || left.slug).localeCompare(String(right.title || right.slug)));
  return `
    <div class="admin-parent-product-picker">
      <label>
        Search product cards
        <input type="search" data-parent-product-search placeholder="Search title, slug, or category">
      </label>
      <label>
        Belongs to product card
        <select name="${selectName}" data-parent-product-select required>
          <option value="">Select a product card</option>
          ${products.map((product) => `
            <option value="${escapeAdminHtml(product.slug)}" ${product.slug === selectedSlug ? 'selected' : ''}
              data-search="${escapeAdminHtml(`${product.title} ${product.description || ''} ${product.slug} ${productCategoryNames(product)}`.toLowerCase())}">
              ${escapeAdminHtml(product.title)} — ${escapeAdminHtml(product.slug)} — ${escapeAdminHtml(productCategoryNames(product))}
            </option>
          `).join('')}
        </select>
      </label>
      <button type="button" data-create-product-from-search>+ Create New Product</button>
      <div class="admin-parent-product-preview" data-parent-product-preview></div>
    </div>
  `;
}

function bindParentProductPicker(scope) {
  const search = scope.querySelector('[data-parent-product-search]');
  const select = scope.querySelector('[data-parent-product-select]');
  const preview = scope.querySelector('[data-parent-product-preview]');
  if (!select) return;

  const updatePreview = () => {
    const product = effectiveAdminProduct(select.value);
    if (!preview) return;
    preview.innerHTML = product ? `
      <img src="${escapeAdminHtml(product.cutoutImage || '')}" alt="">
      <span><strong>${escapeAdminHtml(product.title)}</strong><br>${escapeAdminHtml(product.slug)}<br>${escapeAdminHtml(productCategoryNames(product))}</span>
    ` : '<span>No parent product selected.</span>';
  };

  search?.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    [...select.options].forEach((option, index) => {
      if (index === 0) return;
      option.hidden = Boolean(query) && !String(option.dataset.search || '').includes(query);
    });
  });
  select.addEventListener('change', updatePreview);
  scope.querySelector('[data-create-product-from-search]')?.addEventListener('click', () => {
    const destination = scope.querySelector('[name="imageDestination"]');
    if (!destination) return;
    destination.value = 'create-product';
    destination.dispatchEvent(new Event('change', { bubbles: true }));
  });
  updatePreview();
}

function findProductImageOwner(path, excludedSlug = '') {
  const imagePath = String(path || '').trim();
  if (!imagePath) return null;
  return effectiveAdminProducts().find((product) => (
    product.slug !== excludedSlug
    && (product.cutoutImage === imagePath || normalizeImageChoices(product.imageChoices).some((choice) => choice.image === imagePath || choice.stage === imagePath))
  )) || null;
}

async function writeProductImageChoices(slug, choices) {
  const normalized = normalizeImageChoices(choices);
  const customProducts = readCustomProducts();
  const customProduct = customProducts.find((product) => product.slug === slug);
  if (customProduct) {
    const result = await saveAdminCustomProductFieldPatch(slug, { imageChoices: normalized }, customProduct);
    return result.ok;
  }
  const baseRecord = effectiveAdminProduct(slug) || {};
  const result = await saveAdminProductFieldPatch(slug, { imageChoices: normalized }, baseRecord);
  return result.ok;
}

async function addImageChoiceToProduct(parentSlug, choice, excludedSlug = '') {
  const parent = effectiveAdminProduct(parentSlug);
  if (!parent) throw new Error('Select an existing parent product card.');
  const owner = findProductImageOwner(choice.image, excludedSlug);
  if (owner) throw new Error(`That image is already assigned to ${owner.title} (${owner.slug}).`);
  if (!await writeProductImageChoices(parentSlug, [...normalizeImageChoices(parent.imageChoices), choice])) {
    throw new Error('Could not save the image choice to Supabase.');
  }
  return parent;
}

async function removeProductImageChoice(parentSlug, imagePath) {
  const parent = effectiveAdminProduct(parentSlug);
  if (!parent) return;
  const choice = normalizeImageChoices(parent.imageChoices).find((item) => item.image === imagePath);
  if (!choice || !window.confirm(`Remove “${choice.label}” from ${parent.title}? The image file will not be deleted.`)) return;
  const choices = normalizeImageChoices(parent.imageChoices).filter((item) => item.image !== imagePath);
  const configuredImagePaths = readImageDraftPaths('configuredImagePaths');
  const operations = [{
    type: 'membership', collectionKey: 'configuredImagePaths', entryKey: imagePath, present: false, baseValues: configuredImagePaths
  }];
  const customProducts = readCustomProducts();
  const customProduct = customProducts.find((product) => product.slug === parentSlug);
  if (customProduct) {
    operations.push({
      type: 'record', collectionKey: 'customProducts', identityKey: 'slug', entryKey: parentSlug,
      baseRecord: customProduct, patch: { imageChoices: choices }
    });
  } else {
    operations.push({
      type: 'record', collectionKey: 'products', entryKey: parentSlug,
      baseRecord: readAdminProducts()[parentSlug] || {}, patch: { imageChoices: choices }
    });
  }
  const result = await saveAdminCollectionOperations(operations);
  if (!result.ok) return;
  renderAdminProducts();
  renderImageDrafts();
  setStatus('Image choice removed. The physical image file was not changed.');
}

async function renameProductImageChoice(parentSlug, imagePath, label) {
  const parent = effectiveAdminProduct(parentSlug);
  const nextLabel = String(label || '').trim();
  if (!parent || !nextLabel) {
    setStatus('Enter an image-choice label before saving.');
    return;
  }
  const choices = normalizeImageChoices(parent.imageChoices).map((choice) => (
    choice.image === imagePath ? { ...choice, label: nextLabel } : choice
  ));
  if (!await writeProductImageChoices(parentSlug, choices)) return;
  renderAdminProducts();
  setStatus('Image-choice label saved.');
}

async function moveProductImageChoice(sourceSlug, imagePath, targetSlug) {
  const source = effectiveAdminProduct(sourceSlug);
  const target = effectiveAdminProduct(targetSlug);
  const choice = normalizeImageChoices(source?.imageChoices).find((item) => item.image === imagePath);
  if (!source || !target || !choice || sourceSlug === targetSlug) {
    setStatus('Select a different product card for this image choice.');
    return;
  }
  if (findProductImageOwner(imagePath, sourceSlug)) {
    setStatus('That image path is already assigned to another product.');
    return;
  }
  if (!window.confirm(`Move “${choice.label}” from ${source.title} to ${target.title}? The physical image file will be preserved.`)) return;

  const customProducts = readCustomProducts();
  const products = readAdminProducts();
  const operations = [];
  const addChoiceOperation = (slug, choices) => {
    const customProduct = customProducts.find((product) => product.slug === slug);
    operations.push(customProduct ? {
      type: 'record', collectionKey: 'customProducts', identityKey: 'slug', entryKey: slug,
      baseRecord: customProduct, patch: { imageChoices: normalizeImageChoices(choices) }
    } : {
      type: 'record', collectionKey: 'products', entryKey: slug,
      baseRecord: products[slug] || {}, patch: { imageChoices: normalizeImageChoices(choices) }
    });
  };
  addChoiceOperation(sourceSlug, normalizeImageChoices(source.imageChoices).filter((item) => item.image !== imagePath));
  addChoiceOperation(targetSlug, [...normalizeImageChoices(target.imageChoices), choice]);
  const result = await saveAdminCollectionOperations(operations);
  if (!result.ok) return;
  renderAdminProducts();
  setStatus('Image choice moved. The physical image file was not changed.');
}

async function moveCustomProductToExistingProduct(form) {
  const sourceSlug = form.dataset.slug;
  const source = readCustomProducts().find((product) => product.slug === sourceSlug);
  const parentSlug = form.querySelector('[name="moveParentProductSlug"]')?.value || '';
  const label = form.querySelector('[name="moveImageChoiceLabel"]')?.value.trim() || source?.title || 'Alternate image';
  const parent = effectiveAdminProduct(parentSlug);
  if (!source || !parent || parentSlug === sourceSlug) {
    setStatus('Select a different existing product card.');
    return;
  }
  if (!source.cutoutImage) {
    setStatus('That standalone product does not have an image path to move.');
    return;
  }
  if (!window.confirm(`Move ${source.title} into ${parent.title} as an image choice? The physical image file will be preserved.`)) return;

  try {
    const incomingChoices = [
      { label, image: source.cutoutImage },
      ...normalizeImageChoices(source.imageChoices)
    ];
    incomingChoices.forEach((choice) => {
      const owner = findProductImageOwner(choice.image, sourceSlug);
      if (owner) throw new Error(`Image ${choice.image} is already assigned to ${owner.title} (${owner.slug}).`);
    });
    const parentChoices = [...normalizeImageChoices(parent.imageChoices), ...incomingChoices];
    const customProducts = readCustomProducts();
    const parentIndex = customProducts.findIndex((product) => product.slug === parentSlug);
    const remainingProducts = customProducts.filter((product) => product.slug !== sourceSlug);
    const patch = {};
    if (parentIndex >= 0) {
      const remainingParentIndex = remainingProducts.findIndex((product) => product.slug === parentSlug);
      remainingProducts[remainingParentIndex] = { ...remainingProducts[remainingParentIndex], imageChoices: parentChoices };
      patch.customProducts = remainingProducts;
    } else {
      patch.customProducts = remainingProducts;
      const products = readAdminProducts();
      products[parentSlug] = { ...(products[parentSlug] || {}), imageChoices: parentChoices };
      delete products[sourceSlug];
      patch.products = products;
    }
    const archived = readArchivedProducts().filter((slug) => slug !== sourceSlug);
    patch.savedForLaterProducts = archived;
    const history = getAdminLiveValue('productRelationshipHistory', []);
    const entry = { action: 'moved-to-image-choice', sourceSlug, parentSlug, image: source.cutoutImage, date: new Date().toISOString() };
    patch.productRelationshipHistory = [...history, entry];
    if (!await saveProductWorkflowPatch(patch)) return;
    localStorage.setItem('mvpluxProductRelationshipHistory', JSON.stringify(patch.productRelationshipHistory));
    renderAdminProducts();
    renderImageDrafts();
    setStatus('Standalone product moved into the selected product card. The image file was preserved.');
  } catch (error) {
    setStatus(error.message || 'Could not move that product.');
  }
}

function productImageChoicesMarkup(value) {
  const choices = normalizeImageChoices(value.imageChoices);
  const moveTargets = effectiveAdminProducts()
    .filter((product) => product.slug !== value.slug)
    .sort((left, right) => String(left.title || left.slug).localeCompare(String(right.title || right.slug)));
  return `
    <fieldset class="admin-image-choice-manager">
      <legend>Image Choices For Selected Standee</legend>
      ${choices.length ? choices.map((choice) => `
        <div class="admin-image-choice-row">
          <img src="${escapeAdminHtml(choice.image)}" alt="">
          <span><strong>${escapeAdminHtml(choice.label)}</strong><br>${escapeAdminHtml(choice.image)}</span>
          <label>Rename choice<input type="text" value="${escapeAdminHtml(choice.label)}" data-image-choice-label="${escapeAdminHtml(choice.image)}"></label>
          <button type="button" data-rename-image-choice="${escapeAdminHtml(choice.image)}">Save label</button>
          <label>Move choice to
            <select data-move-image-choice-target="${escapeAdminHtml(choice.image)}">
              <option value="">Select product</option>
              ${moveTargets.map((product) => `<option value="${escapeAdminHtml(product.slug)}">${escapeAdminHtml(product.title)} — ${escapeAdminHtml(product.slug)}</option>`).join('')}
            </select>
          </label>
          <button type="button" data-move-image-choice="${escapeAdminHtml(choice.image)}">Move choice</button>
          <button type="button" data-remove-image-choice="${escapeAdminHtml(choice.image)}">Remove image choice</button>
        </div>
      `).join('') : '<p class="admin-note">No alternate image choices assigned.</p>'}
    </fieldset>
  `;
}

function architectureReviewItems() {
  const baseline = adminPublishedBaseline || buildDefaultPublishBaseline();
  const items = [];
  Object.entries(readAdminProducts()).forEach(([slug, product]) => {
    const before = baseline.products?.[slug];
    const after = publishableProduct(product, readArchivedProducts().includes(slug));
    if (JSON.stringify(before || null) === JSON.stringify(after)) return;
    items.push({
      id: `product:${slug}`,
      type: 'product', key: slug,
      group: before ? 'Product Edits' : 'New Products',
      title: product.title || slug,
      approved: product.approvalStatus !== 'draft',
      updatedAt: product.updatedAt || '',
      before, after,
      page: readAdminCategories()[product.categories?.[0]]?.page || 'index.html'
    });
  });
  Object.entries(readAdminCategories()).forEach(([key, category]) => {
    const before = baseline.categories?.[key];
    const after = publishableCategory({ ...category, key });
    if (JSON.stringify(before || null) === JSON.stringify(after)) return;
    items.push({
      id: `category:${key}`,
      type: 'category', key,
      group: before ? 'Category Edits' : 'New Categories',
      title: category.title || key,
      approved: category.approvalStatus !== 'draft',
      updatedAt: category.updatedAt || '',
      before, after, page: category.page || 'index.html'
    });
  });
  Object.entries(adminPageLiveEdits || {}).forEach(([pageKey, entries]) => {
    Object.entries(entries || {}).forEach(([elementKey, edit]) => {
      if (!edit || typeof edit !== 'object' || edit.type) return;
      const before = { ...(baseline.pageContent?.[pageKey]?.[elementKey] || {}), ...(baseline.pageVisualStates?.[pageKey]?.[elementKey] || {}) };
      const after = Object.fromEntries(Object.entries(edit).filter(([field]) => !['approvalStatus', 'updatedAt'].includes(field)));
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      items.push({
        id: `page:${pageKey}:${elementKey}`,
        type: 'page', key: elementKey, pageKey,
        group: ['x', 'y', 'scale', 'rotate'].some((field) => after[field] !== undefined) ? 'Layout Changes' : 'Page Edits',
        title: `${pageKey}: ${elementKey}`,
        approved: edit.approvalStatus !== 'draft',
        updatedAt: edit.updatedAt || '', before, after, page: pageKey
      });
    });
  });
  if (JSON.stringify(baseline.extraImages || {}) !== JSON.stringify(readExtraImages())) {
    items.push({ id: 'extraImages:all', type: 'extraImages', key: 'all', group: 'Image Changes', title: 'Most Wanted / Gallery images', approved: true, before: baseline.extraImages || {}, after: readExtraImages(), page: 'index.html' });
  }
  return items;
}

function categoryCardSlugForKey(key) {
  return Object.entries(ADMIN_CATEGORY_CARD_MAP).find(([, categoryKey]) => categoryKey === key)?.[0]
    || `${key}-category-card`;
}

function buildSelectedArchitectureSnapshot(items) {
  const baseline = structuredClone(adminPublishedBaseline || buildDefaultPublishBaseline());
  const current = buildNormalizedPublishSnapshot();
  baseline.version = 1;
  baseline.schemaVersion = Math.max(2, Number(current.schemaVersion) || 0);
  (items || []).forEach((item) => {
    if (item.type === 'product') {
      if (current.products?.[item.key]) baseline.products[item.key] = structuredClone(current.products[item.key]);
      else delete baseline.products[item.key];
      return;
    }
    if (item.type === 'category') {
      if (current.categories?.[item.key]) baseline.categories[item.key] = structuredClone(current.categories[item.key]);
      else delete baseline.categories[item.key];
      const cardSlug = categoryCardSlugForKey(item.key);
      if (current.categoryDisplayCards?.[cardSlug]) baseline.categoryDisplayCards[cardSlug] = structuredClone(current.categoryDisplayCards[cardSlug]);
      else delete baseline.categoryDisplayCards[cardSlug];
      baseline.categorySettings ||= {};
      if (current.categorySettings?.[item.key]) baseline.categorySettings[item.key] = structuredClone(current.categorySettings[item.key]);
      else delete baseline.categorySettings[item.key];
      return;
    }
    if (item.type === 'page') {
      for (const collectionKey of ['pageContent', 'pageVisualStates']) {
        const entry = current[collectionKey]?.[item.pageKey]?.[item.key];
        baseline[collectionKey] ||= {};
        baseline[collectionKey][item.pageKey] ||= {};
        if (entry) baseline[collectionKey][item.pageKey][item.key] = structuredClone(entry);
        else delete baseline[collectionKey][item.pageKey][item.key];
      }
      return;
    }
    if (item.type === 'extraImages') baseline.extraImages = structuredClone(current.extraImages || {});
  });
  return baseline;
}

function publishSnapshotImagePaths(snapshot) {
  const paths = new Set();
  const add = (value) => {
    if (validatePublishImagePath(String(value || ''))) paths.add(String(value));
  };
  ['products', 'categoryDisplayCards'].forEach((collectionKey) => {
    Object.values(snapshot?.[collectionKey] || {}).forEach((product) => {
      add(product?.cutoutImage);
      add(product?.backgroundImage);
      normalizeImageChoices(product?.imageChoices).forEach((choice) => { add(choice.image); add(choice.stage); });
    });
  });
  Object.values(snapshot?.categories || {}).forEach((category) => {
    add(category?.card?.image);
    add(category?.card?.backgroundImage);
    add(category?.displaySettings?.backgroundImage);
  });
  Object.values(snapshot?.extraImages || {}).forEach(add);
  Object.values(snapshot?.pageContent || {}).forEach((entries) => Object.values(entries || {}).forEach((entry) => add(entry?.src)));
  return paths;
}

function automaticPublishImagePaths(items, snapshot) {
  if (!(items || []).length) return [];
  const publishedPaths = publishSnapshotImagePaths(adminPublishedBaseline || buildDefaultPublishBaseline());
  return [...publishSnapshotImagePaths(snapshot)].filter((path) => !publishedPaths.has(path)).sort();
}

function prepareSelectedPublish(items) {
  const readyItems = (items || []).filter((item) => item.approved);
  if (!readyItems.length) {
    setStatus('Select at least one Ready item before going live.');
    return false;
  }
  selectedPublishMode = true;
  selectedPublishChangeIds = new Set(readyItems.map((item) => item.id));
  imageImportPublishSelection = null;
  const snapshot = buildSelectedArchitectureSnapshot(readyItems);
  const input = document.getElementById('adminPublishImagePaths');
  if (input) input.value = automaticPublishImagePaths(readyItems, snapshot).join('\n');
  renderPublishSummary();
  renderReadyPublishSelection();
  window.location.hash = 'publish-changes';
  setStatus(`${readyItems.length} Ready item${readyItems.length === 1 ? '' : 's'} selected for one publish. Unselected changes remain private.`);
  return true;
}

function readyPublishSelectionMarkup(items) {
  const ready = (items || []).filter((item) => item.approved);
  if (!ready.length) return '<p class="admin-note">No Ready changes are waiting to publish.</p>';
  return `
    <div class="admin-panel-actions">
      <button type="button" data-select-all-ready-items>Select All Ready Items</button>
      <button type="button" data-go-live-selected>Publish Selected / Go Live</button>
      <button type="button" data-go-live-all-ready>Publish All Ready Items</button>
    </div>
    <div class="admin-publish-ready-list">
      ${ready.map((item) => `<label class="admin-review-select"><input type="checkbox" data-ready-publish-select value="${escapeAdminHtml(item.id)}" ${selectedPublishChangeIds.has(item.id) ? 'checked' : ''}> ${escapeAdminHtml(item.title)} <small>${escapeAdminHtml(item.group)}</small></label>`).join('')}
    </div>`;
}

function bindReadyPublishSelection(container) {
  if (!container || container.dataset.readyPublishBound) return;
  container.dataset.readyPublishBound = 'true';
  container.addEventListener('change', (event) => {
    const input = event.target.closest('[data-ready-publish-select]');
    if (!input) return;
    if (input.checked) selectedPublishChangeIds.add(input.value);
    else selectedPublishChangeIds.delete(input.value);
  });
  container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-select-all-ready-items], [data-go-live-selected], [data-go-live-all-ready]');
    if (!button) return;
    const ready = architectureReviewItems().filter((item) => item.approved);
    if (button.hasAttribute('data-select-all-ready-items')) {
      const allSelected = ready.length && ready.every((item) => selectedPublishChangeIds.has(item.id));
      ready.forEach((item) => allSelected ? selectedPublishChangeIds.delete(item.id) : selectedPublishChangeIds.add(item.id));
      renderReadyPublishSelection();
      renderAdminProducts();
      return;
    }
    const selected = button.hasAttribute('data-go-live-all-ready')
      ? ready
      : ready.filter((item) => selectedPublishChangeIds.has(item.id));
    prepareSelectedPublish(selected);
  });
}

function renderReadyPublishSelection() {
  const container = document.getElementById('adminReadyPublishItems');
  if (!container) return;
  container.innerHTML = readyPublishSelectionMarkup(architectureReviewItems());
  bindReadyPublishSelection(container);
}

function architectureReviewSummary(value) {
  const text = JSON.stringify(value ?? null);
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

function architectureReviewImage(item) {
  return item.type === 'category'
    ? item.after?.card?.image || item.before?.card?.image || ''
    : item.after?.cutoutImage || item.before?.cutoutImage || '';
}

function adminPreviewUrl(page = 'index.html') {
  const value = String(page || 'index.html');
  return `${value}${value.includes('?') ? '&' : '?'}adminView=preview`;
}

function architectureReviewMarkup(items) {
  if (!items.length) return '<p class="admin-note">No private changes are waiting for review or publication.</p>';
  const groups = Object.groupBy ? Object.groupBy(items, (item) => item.group) : items.reduce((result, item) => {
    (result[item.group] ||= []).push(item); return result;
  }, {});
  return `<div class="admin-panel-actions"><button type="button" data-select-all-ready-items>Select All Ready Items</button><button type="button" data-go-live-selected>Publish Selected / Go Live</button><button type="button" data-go-live-all-ready>Publish All Ready Items</button></div>` + Object.entries(groups).map(([group, groupItems]) => `
    <section class="admin-review-group">
      <div class="admin-panel-header"><h3>${escapeAdminHtml(group)}</h3><button type="button" data-select-ready-group="${escapeAdminHtml(group)}">Select All Ready in This Group</button></div>
      ${groupItems.map((item) => `
        <article class="admin-review-item" data-review-id="${escapeAdminHtml(item.id)}">
          <label class="admin-review-select"><input type="checkbox" data-ready-publish-select value="${escapeAdminHtml(item.id)}" ${item.approved ? '' : 'disabled'} ${selectedPublishChangeIds.has(item.id) ? 'checked' : ''}> ${item.approved ? 'Select for publishing' : 'Draft'}</label>
          <div class="admin-review-image">${architectureReviewImage(item) ? `<img src="${escapeAdminHtml(architectureReviewImage(item))}" alt="">` : '<span>No image</span>'}</div>
          <div class="admin-review-summary"><strong>${escapeAdminHtml(item.title)}</strong><p>${escapeAdminHtml(item.group)}</p><p class="admin-status-message" data-state="${item.approved ? 'approved' : 'waiting'}">${item.approved ? 'Ready to publish' : 'Draft — not included in publishing'}</p><small>Last edited: ${escapeAdminHtml(item.updatedAt ? new Date(item.updatedAt).toLocaleString() : 'Not available')}</small></div>
          <div class="admin-review-values"><p><strong>Published:</strong> ${escapeAdminHtml(architectureReviewSummary(item.before))}</p><p><strong>Private:</strong> ${escapeAdminHtml(architectureReviewSummary(item.after))}</p></div>
          <div class="admin-card-actions">
            <a class="admin-button admin-button-secondary" href="${escapeAdminHtml(adminPreviewUrl(item.page))}" target="_blank">Preview</a>
            <a class="admin-button admin-button-secondary" href="${escapeAdminHtml(item.page || 'index.html')}" target="_blank">Open on Website</a>
            ${item.approved ? `<button type="button" data-review-draft="${escapeAdminHtml(item.id)}">Return to Draft</button>` : `<button type="button" data-review-approve="${escapeAdminHtml(item.id)}">Mark Ready</button>`}
            ${item.before && ['product', 'category'].includes(item.type) ? `<button type="button" data-review-discard="${escapeAdminHtml(item.id)}">Discard Private Change</button>` : ''}
          </div>
        </article>`).join('')}
    </section>`).join('');
}

async function savePageReviewStatus(item, status) {
  const client = getAdminClient();
  const { data: row, error: loadError } = await client.from('site_edits').select('edits, revision').eq('page_key', item.pageKey).maybeSingle();
  if (loadError) throw loadError;
  const latest = row?.edits?.[item.key];
  if (!latest) throw new Error('That page change no longer exists.');
  const { data, error } = await client.rpc('save_site_edits', {
    p_page_key: item.pageKey,
    p_edits: { [item.key]: { ...latest, approvalStatus: status, updatedAt: new Date().toISOString() } },
    p_expected_revision: Number(row?.revision) || 0,
    p_replace: false
  });
  if (error) throw error;
  adminPageLiveEdits[item.pageKey] = data?.edits || { ...(row?.edits || {}), [item.key]: { ...latest, approvalStatus: status } };
}

async function setArchitectureReviewStatus(item, status) {
  if (item.type === 'product') return (await saveAdminProductFieldPatch(item.key, { approvalStatus: status, draftStatus: status === 'approved' ? 'ready' : 'draft', updatedAt: new Date().toISOString() }, readAdminProducts()[item.key] || {})).ok;
  if (item.type === 'category') return (await saveAdminCollectionOperations([{
    type: 'record', collectionKey: 'categories', entryKey: item.key,
    baseRecord: readAdminCategories()[item.key] || {},
    patch: { approvalStatus: status, draftStatus: status === 'approved' ? 'ready' : 'draft', updatedAt: new Date().toISOString() }
  }])).ok;
  if (item.type === 'page') { await savePageReviewStatus(item, status); return true; }
  return true;
}

async function discardArchitecturePrivateChange(item) {
  if (!item.before || !window.confirm(`Discard the private changes for ${item.title} and restore the published values?`)) return false;
  if (item.type === 'product') return (await saveAdminCollectionOperations([{
    type: 'record', collectionKey: 'products', entryKey: item.key,
    baseRecord: readAdminProducts()[item.key] || {},
    patch: { ...item.before, approvalStatus: 'approved', draftStatus: 'approved', updatedAt: new Date().toISOString() }
  }])).ok;
  if (item.type === 'category') return (await saveAdminCollectionOperations([{
    type: 'record', collectionKey: 'categories', entryKey: item.key,
    baseRecord: readAdminCategories()[item.key] || {},
    patch: { ...item.before, approvalStatus: 'approved', draftStatus: 'approved', updatedAt: new Date().toISOString() }
  }])).ok;
  return false;
}

function bindArchitectureReview(container) {
  if (!container || container.dataset.reviewBound) return;
  container.dataset.reviewBound = 'true';
  container.addEventListener('change', (event) => {
    const input = event.target.closest('[data-ready-publish-select]');
    if (!input) return;
    if (input.checked) selectedPublishChangeIds.add(input.value);
    else selectedPublishChangeIds.delete(input.value);
  });
  container.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-review-approve], [data-review-draft], [data-review-discard], [data-select-ready-group], [data-select-all-ready-items], [data-go-live-selected], [data-go-live-all-ready]');
    if (!button) return;
    const items = architectureReviewItems();
    const ready = items.filter((item) => item.approved);
    if (button.hasAttribute('data-select-all-ready-items') || button.dataset.selectReadyGroup) {
      const targets = button.dataset.selectReadyGroup ? ready.filter((item) => item.group === button.dataset.selectReadyGroup) : ready;
      const allSelected = targets.length && targets.every((item) => selectedPublishChangeIds.has(item.id));
      targets.forEach((item) => allSelected ? selectedPublishChangeIds.delete(item.id) : selectedPublishChangeIds.add(item.id));
      renderAdminProducts();
      renderReadyPublishSelection();
      return;
    }
    if (button.hasAttribute('data-go-live-selected') || button.hasAttribute('data-go-live-all-ready')) {
      prepareSelectedPublish(button.hasAttribute('data-go-live-all-ready') ? ready : ready.filter((item) => selectedPublishChangeIds.has(item.id)));
      return;
    }
    let targets = [];
    {
      const id = button.dataset.reviewApprove || button.dataset.reviewDraft || button.dataset.reviewDiscard;
      targets = items.filter((item) => item.id === id);
    }
    button.disabled = true;
    try {
      for (const item of targets) {
        if (button.dataset.reviewDiscard) await discardArchitecturePrivateChange(item);
        else await setArchitectureReviewStatus(item, button.dataset.reviewDraft ? 'draft' : 'approved');
      }
      renderAdminProducts();
      renderPublishSummary();
    } catch (error) {
      setStatus(`Could not update review status. ${error?.message || error}`);
      button.disabled = false;
    }
  });
}

function renderAdminProducts() {
  const approvedContainer = document.getElementById('approvedProducts');
  const publishedContainer = document.getElementById('publishedProducts');
  const categoryContainer = document.getElementById('adminProducts');
  const recoveryContainer = document.getElementById('legacyRecoveryProducts');
  const productContainers = [approvedContainer, publishedContainer, categoryContainer, recoveryContainer].filter(Boolean);
  const saved = readAdminProducts();
  const archived = new Set(readArchivedProducts());
  if (!productContainers.length) return;

  renderSavedProducts();

  const deleted = new Set(readDeletedProducts());
  const availableProducts = allAdminProducts().filter((product) => !archived.has(product.slug) && !deleted.has(product.slug));
  const productMarkup = (products, lifecycleLabel = '') => products.map((product) => {
    const value = { ...product, ...(saved[product.slug] || {}) };
    const lifecycle = product.categoryCard ? '' : lifecycleLabel || productLifecycleState(product, saved, archived).label;
    return `
      <form class="admin-product-card" id="product-${product.slug}" data-slug="${product.slug}">
        <div class="admin-product-heading">
          <div><h3>${product.title}</h3>${lifecycle ? `<p class="admin-note">${escapeAdminHtml(lifecycle)}</p>` : ''}<p class="admin-note" data-product-save-state data-state="saved">Saved</p></div>
          <div class="admin-card-actions">
            <button type="submit">Save Product</button>
            <button type="button" data-archive-product="${product.slug}">Save for Later</button>
            ${product.categoryCard ? '' : `<button type="button" data-visibility-toggle="${value.visible === false ? 'show' : 'hide'}">${value.visible === false ? 'Show' : 'Hide'}</button>`}
            ${value.custom === true ? `<button type="button" data-return-to-draft="${product.slug}">Return to Draft</button>` : ''}
            ${product.categoryCard ? '' : `<button type="button" data-delete-product="${product.slug}">Delete Product</button>`}
          </div>
        </div>
        <div class="admin-product-layout">
          <div class="admin-card-preview-wrap">
            ${productPreviewMarkup(value)}
          </div>
          <div class="admin-control-groups">
            <fieldset>
              <legend>Card Text</legend>
              <label>
                Card title
                <input name="title" type="text" value="${value.title || ''}">
              </label>
              ${product.categoryCard ? '' : `
                <label>
                  Product slug
                  <input name="productSlug" type="text" value="${escapeAdminHtml(value.slug || product.slug)}" readonly>
                </label>
              `}
              <label>
                Card description
                <textarea name="description" rows="3">${value.description || ''}</textarea>
              </label>
            </fieldset>
            ${product.categoryCard ? '' : categoryAssignmentMarkup(value)}
            <fieldset>
              <legend>Images</legend>
              <label>
                Standee image path
                <input name="cutoutImage" class="admin-long-path" type="text" value="${value.cutoutImage || ''}" readonly>
              </label>
              <label>
                Upload standee image
                <input name="cutoutUpload" type="file" accept="image/*">
              </label>
              <label>
                Background image path
                <input name="backgroundImage" class="admin-long-path" type="text" value="${value.backgroundImage || ''}" readonly>
              </label>
              <label>
                Upload background image
                <input name="backgroundUpload" type="file" accept="image/*">
              </label>
            </fieldset>
            ${product.categoryCard ? '' : productImageChoicesMarkup(value)}
            ${value.custom === true ? `
              <details class="admin-move-product-panel">
                <summary>Move to existing product</summary>
                ${parentProductPickerMarkup('', value.slug, 'moveParentProductSlug')}
                <label>
                  Image-choice label
                  <input name="moveImageChoiceLabel" type="text" value="${escapeAdminHtml(value.title || '')}" placeholder="Alternate pose">
                </label>
                <button type="button" data-move-to-existing-product>Move to existing product</button>
                <p class="admin-note">This removes only the standalone Admin product relationship. The physical image file is preserved.</p>
              </details>
            ` : ''}
            <fieldset>
              <legend>Size & Price</legend>
              <div class="admin-form-row">
                <label>
                  Original height
                  <input name="originalHeight" type="text" value="${value.originalHeight || ''}" placeholder="6'6, 78, 2, or 24">
                </label>
                <label>
                  Original price
                  <output class="admin-original-price">${formatAdminMoney(calculateAdminOriginalPrice(value.originalHeight))}</output>
                </label>
              </div>
            </fieldset>
            <fieldset>
              <legend>Main Page Placement</legend>
              <div class="admin-form-row admin-placement-row">
                <label>
                  Standee size %
                  <input name="cutoutHeight" type="range" min="30" max="100" step="1" value="${value.cutoutHeight || '63'}">
                </label>
                <label>
                  Left / right %
                  <input name="cutoutLeft" type="range" min="0" max="100" step="1" value="${value.cutoutLeft || '50'}">
                </label>
                <label>
                  Up / down %
                  <input name="cutoutBottom" type="range" min="0" max="60" step="1" value="${value.cutoutBottom || '21'}">
                </label>
              </div>
              <div class="admin-form-row admin-placement-row">
                <label>
                  Logo size %
                  <input name="logoWidth" type="range" min="30" max="100" step="1" value="${value.logoWidth || '82'}">
                </label>
                <label>
                  Logo up / down %
                  <input name="logoTop" type="range" min="-20" max="40" step="1" value="${value.logoTop || '-4'}">
                </label>
                <label>
                  Background position
                  <input name="stageBackgroundPosition" type="text" value="${value.stageBackgroundPosition || ''}" placeholder="center center">
                </label>
              </div>
            </fieldset>
          </div>
        </div>
      </form>
    `;
  }).join('');

  const approvedProducts = availableProducts.filter((product) => !product.categoryCard);
  const reviewItems = architectureReviewItems();
  if (approvedContainer) {
    approvedContainer.innerHTML = architectureReviewMarkup(reviewItems);
    bindArchitectureReview(approvedContainer);
  }
  renderReadyPublishSelection();
  if (publishedContainer) {
    publishedContainer.innerHTML = Object.values(adminPublishedBaseline?.products || {}).map((product) => `
      <article class="admin-review-item admin-published-item"><div class="admin-review-image">${product.cutoutImage ? `<img src="${escapeAdminHtml(product.cutoutImage)}" alt="">` : '<span>No image</span>'}</div><div><strong>${escapeAdminHtml(product.title || product.slug)}</strong><p>Published — customers can see this</p></div></article>
    `).join('') || '<div class="admin-empty-state"><strong>No published products yet</strong><span>Published products will appear here after the first successful publish.</span></div>';
  }
  if (categoryContainer) {
    const categories = Object.values(newAdminArchitectureEnabled() ? readAdminCategories() : adminArchitectureState?.candidate?.categories || {});
    categoryContainer.innerHTML = categories.length ? categories.map((category) => `
      <article class="admin-review-item admin-category-manager-card">
        <div class="admin-review-image">${category.card?.image ? `<img src="${escapeAdminHtml(category.card.image)}" alt="">` : '<span>No image</span>'}</div>
        <div><strong>${escapeAdminHtml(category.title || category.key)}</strong><p>${category.visible === false ? 'Hidden' : 'Visible'} · ${escapeAdminHtml(category.page || 'Reusable category page')}</p></div>
        <a class="admin-button admin-button-secondary" href="${escapeAdminHtml(category.page || `category.html?category=${encodeURIComponent(category.key)}`)}" target="_blank">Edit on Website</a>
      </article>`).join('') : '<div class="admin-empty-state"><strong>No categories available</strong><span>Create a category from the Create section.</span></div>';
  }
  const recoveryDetails = document.getElementById('legacyRecoveryEditor');
  if (recoveryContainer) recoveryContainer.innerHTML = recoveryDetails?.open ? productMarkup(availableProducts) : '';

  productContainers.forEach((container) => container.querySelectorAll('.admin-product-card').forEach((form) => {
    const baseProduct = allAdminProducts().find((product) => product.slug === form.dataset.slug) || {};
    form._adminBaseRecord = structuredClone({ ...baseProduct, ...(saved[form.dataset.slug] || {}) });
    form._adminDirtyFields = new Set();
    form._adminDirtyVersions = new Map();
    bindParentProductPicker(form);
    updateAdminOriginalPrice(form);
    form.querySelectorAll('input, textarea').forEach((field) => {
      field.addEventListener('input', () => {
        markProductFieldDirty(form, productDirtyFieldForControl(field));
        if (field.name === 'originalHeight') updateAdminOriginalPrice(form);
        if (field.matches('[type="range"], .admin-long-path, [name="stageBackgroundPosition"]')) {
          syncPreviewFromFields(form);
          if (field.matches('[type="range"], [name="stageBackgroundPosition"]')) {
            schedulePlacementSave(form);
          }
        } else if (!field.matches('[type="file"]')) {
          updateProductPreview(form);
        }
      });
    });
    form.querySelectorAll('select, input[type="checkbox"]').forEach((field) => {
      field.addEventListener('change', () => markProductFieldDirty(form, productDirtyFieldForControl(field)));
    });
    attachPreviewControls(form);

    form.querySelector('[name="cutoutUpload"]')?.addEventListener('change', (event) => {
      markProductFieldDirty(form, 'cutoutImage');
      handleImageUpload(event.target, form.querySelector('[name="cutoutImage"]'), form);
    });

    form.querySelector('[name="backgroundUpload"]')?.addEventListener('change', (event) => {
      markProductFieldDirty(form, 'backgroundImage');
      handleImageUpload(event.target, form.querySelector('[name="backgroundImage"]'), form);
    });

    form.querySelector('[data-archive-product]')?.addEventListener('click', (event) => {
      archiveProduct(event.target.dataset.archiveProduct);
    });

    form.querySelector('[data-delete-product]')?.addEventListener('click', (event) => {
      deleteProduct(event.target.dataset.deleteProduct);
    });

    form.querySelector('[data-return-to-draft]')?.addEventListener('click', (event) => {
      returnProductToDraft(event.target.dataset.returnToDraft);
    });

    form.querySelector('[data-visibility-toggle]')?.addEventListener('click', (event) => {
      setProductVisibility(form, event.target.dataset.visibilityToggle === 'show');
    });

    form.querySelector('[data-remove-section]')?.addEventListener('click', () => {
      removeProductFromSelectedSection(form);
    });

    form.querySelectorAll('[data-move-product]').forEach((button) => {
      button.addEventListener('click', () => {
        moveProductInSelectedSection(form, Number(button.dataset.moveProduct));
      });
    });

    form.querySelectorAll('[data-remove-image-choice]').forEach((button) => {
      button.addEventListener('click', () => removeProductImageChoice(form.dataset.slug, button.dataset.removeImageChoice));
    });

    form.querySelectorAll('[data-rename-image-choice]').forEach((button) => {
      button.addEventListener('click', () => {
        const imagePath = button.dataset.renameImageChoice;
        const label = button.closest('.admin-image-choice-row')?.querySelector('[data-image-choice-label]')?.value;
        renameProductImageChoice(form.dataset.slug, imagePath, label);
      });
    });

    form.querySelectorAll('[data-move-image-choice]').forEach((button) => {
      button.addEventListener('click', () => {
        const imagePath = button.dataset.moveImageChoice;
        const target = button.closest('.admin-image-choice-row')?.querySelector('[data-move-image-choice-target]')?.value || '';
        moveProductImageChoice(form.dataset.slug, imagePath, target);
      });
    });

    form.querySelector('[data-move-to-existing-product]')?.addEventListener('click', () => {
      moveCustomProductToExistingProduct(form);
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      saveProductForm(form);
    });
  }));
  renderAdminDiagnostics();
}

function fillPriceSettingsForm() {
  const settings = readPriceSettings();
  const twoFootPrice = document.getElementById('twoFootPrice');
  const threeFootPrice = document.getElementById('threeFootPrice');
  const fullHeight = document.getElementById('fullHeight');
  const fullPrice = document.getElementById('fullPrice');
  const extraInchPrice = document.getElementById('extraInchPrice');

  if (twoFootPrice) twoFootPrice.value = settings.twoFootPrice || '35.00';
  if (threeFootPrice) threeFootPrice.value = settings.threeFootPrice || '50.00';
  if (fullHeight) fullHeight.value = settings.fullHeight || '78';
  if (fullPrice) fullPrice.value = settings.fullPrice || '129.99';
  if (extraInchPrice) extraInchPrice.value = settings.extraInchPrice || '2.00';
}

function setupPriceRules() {
  const form = document.getElementById('priceRulesForm');
  if (!form) return;

  fillPriceSettingsForm();

  const getDraftSettings = () => ({
    twoFootPrice: document.getElementById('twoFootPrice')?.value,
    threeFootPrice: document.getElementById('threeFootPrice')?.value,
    fullHeight: document.getElementById('fullHeight')?.value,
    fullPrice: document.getElementById('fullPrice')?.value,
    extraInchPrice: document.getElementById('extraInchPrice')?.value
  });

  form.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', () => {
      document.querySelectorAll('.admin-product-card').forEach((productForm) => {
        updateAdminOriginalPrice(productForm, getDraftSettings());
      });
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const settings = {
      twoFootPrice: document.getElementById('twoFootPrice')?.value.trim() || '35.00',
      threeFootPrice: document.getElementById('threeFootPrice')?.value.trim() || '50.00',
      fullHeight: String(parseAdminHeight(document.getElementById('fullHeight')?.value || '78') || 78),
      fullPrice: document.getElementById('fullPrice')?.value.trim() || '129.99',
      extraInchPrice: document.getElementById('extraInchPrice')?.value.trim() || '2.00'
    };
    if (!await writePriceSettings(settings)) {
      setStatus('Error — prices were not saved.');
      return;
    }
    fillPriceSettingsForm();
    document.querySelectorAll('.admin-product-card').forEach((productForm) => updateAdminOriginalPrice(productForm, settings));
    setStatus('Prices saved live.');
  });
}

let adminDiscountCodes = [];

function setCouponStatus(message) {
  const status = document.getElementById('adminCouponStatus');
  if (status) status.textContent = message || '';
}

function couponDateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 16);
}

function clearCouponForm() {
  const form = document.getElementById('couponForm');
  form?.reset();
  if (document.getElementById('couponId')) document.getElementById('couponId').value = '';
  if (document.getElementById('couponActive')) document.getElementById('couponActive').checked = true;
  if (document.getElementById('couponMinimum')) document.getElementById('couponMinimum').value = '0';
}

function fillCouponForm(coupon) {
  const values = {
    couponId: coupon.id,
    couponCode: coupon.code,
    couponDescription: coupon.description,
    couponType: coupon.discount_type,
    couponValue: coupon.discount_value,
    couponStartsAt: couponDateInputValue(coupon.starts_at),
    couponExpiresAt: couponDateInputValue(coupon.expires_at),
    couponTotalLimit: coupon.total_usage_limit,
    couponCustomerLimit: coupon.per_customer_usage_limit,
    couponAudience: coupon.audience,
    couponMinimum: coupon.minimum_order_amount,
    couponProduct: coupon.product_restriction,
    couponCategory: coupon.category_restriction
  };
  Object.entries(values).forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (input) input.value = value ?? '';
  });
  document.getElementById('couponActive').checked = Boolean(coupon.active);
  document.getElementById('couponOfferStacking').checked = Boolean(coupon.allow_offer_stacking);
  document.getElementById('couponForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderDiscountCodes() {
  const list = document.getElementById('adminCouponList');
  if (!list) return;
  list.innerHTML = adminDiscountCodes.length ? adminDiscountCodes.map((coupon) => `
    <article class="admin-commerce-card" data-discount-code="${escapeAdminHtml(coupon.id)}">
      <div class="admin-commerce-card-head"><strong>${escapeAdminHtml(coupon.code)}</strong><span>${coupon.active ? 'active' : 'inactive'}</span></div>
      <p>${escapeAdminHtml(coupon.description || 'No description')}</p>
      <p><strong>Discount:</strong> ${coupon.discount_type === 'fixed' ? adminMoney(coupon.discount_value) : `${Number(coupon.discount_value)}%`} · <strong>Audience:</strong> ${coupon.audience === 'member' ? 'Members only' : 'Public'}</p>
      <p><strong>Dates:</strong> ${coupon.starts_at ? adminDate(coupon.starts_at) : 'Now'} to ${coupon.expires_at ? adminDate(coupon.expires_at) : 'No expiration'}</p>
      <p><strong>Limits:</strong> ${coupon.total_usage_limit || 'Unlimited'} total · ${coupon.per_customer_usage_limit || 'Unlimited'} per customer</p>
      <p><strong>Minimum:</strong> ${adminMoney(coupon.minimum_order_amount)} · <strong>Offer stacking:</strong> ${coupon.allow_offer_stacking ? 'Allowed' : 'Not allowed'}</p>
      ${coupon.product_restriction ? `<p><strong>Product:</strong> ${escapeAdminHtml(coupon.product_restriction)}</p>` : ''}
      ${coupon.category_restriction ? `<p><strong>Category:</strong> ${escapeAdminHtml(coupon.category_restriction)}</p>` : ''}
      <button type="button" data-edit-discount="${escapeAdminHtml(coupon.id)}">Edit</button>
      <button type="button" data-toggle-discount="${escapeAdminHtml(coupon.id)}">${coupon.active ? 'Deactivate' : 'Activate'}</button>
    </article>
  `).join('') : commerceEmptyMarkup('No discount codes yet.');
}

async function loadDiscountCodes() {
  const client = getAdminClient();
  if (!client) return;
  const { data, error } = await client.from('discount_codes').select('*').order('created_at', { ascending: false });
  if (error) {
    adminDiscountCodesLoaded = false;
    setCouponStatus(`Discount codes are unavailable until the database migration is applied. ${error.message || error}`);
    return;
  }
  adminDiscountCodes = data || [];
  adminDiscountCodesLoaded = true;
  renderDiscountCodes();
  setCouponStatus(`Loaded ${adminDiscountCodes.length} discount code${adminDiscountCodes.length === 1 ? '' : 's'}.`);
}

function setupCoupons() {
  const form = document.getElementById('couponForm');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const client = getAdminClient();
    const button = form.querySelector('button[type="submit"]');
    const code = document.getElementById('couponCode')?.value.trim().toUpperCase() || '';
    const discountType = document.getElementById('couponType')?.value;
    const discountValue = Number(document.getElementById('couponValue')?.value);
    if (!client || !button || !code || !Number.isFinite(discountValue) || discountValue <= 0 || (discountType === 'percentage' && discountValue > 100)) {
      setCouponStatus('Enter a code and a valid discount value. Percentage discounts cannot exceed 100.');
      return;
    }
    const nullableNumber = (id) => {
      const value = document.getElementById(id)?.value;
      return value ? Number(value) : null;
    };
    const nullableDate = (id) => {
      const value = document.getElementById(id)?.value;
      return value ? new Date(value).toISOString() : null;
    };
    const coupon = {
      code,
      description: document.getElementById('couponDescription')?.value.trim() || null,
      discount_type: discountType,
      discount_value: Number(discountValue.toFixed(2)),
      active: Boolean(document.getElementById('couponActive')?.checked),
      starts_at: nullableDate('couponStartsAt'),
      expires_at: nullableDate('couponExpiresAt'),
      total_usage_limit: nullableNumber('couponTotalLimit'),
      per_customer_usage_limit: nullableNumber('couponCustomerLimit'),
      audience: document.getElementById('couponAudience')?.value,
      minimum_order_amount: nullableNumber('couponMinimum') || 0,
      product_restriction: document.getElementById('couponProduct')?.value.trim() || null,
      category_restriction: document.getElementById('couponCategory')?.value.trim() || null,
      allow_offer_stacking: Boolean(document.getElementById('couponOfferStacking')?.checked)
    };
    if (coupon.starts_at && coupon.expires_at && new Date(coupon.expires_at) <= new Date(coupon.starts_at)) {
      setCouponStatus('Expiration must be after the start date.');
      return;
    }
    button.disabled = true;
    button.textContent = 'Saving...';
    const id = document.getElementById('couponId')?.value;
    const query = id
      ? client.from('discount_codes').update(coupon).eq('id', id)
      : client.from('discount_codes').insert(coupon);
    const { error } = await query;
    button.disabled = false;
    button.textContent = 'Save Discount Code';
    if (error) {
      setCouponStatus(`Could not save the discount code. ${error.message || error}`);
      return;
    }
    clearCouponForm();
    await loadDiscountCodes();
    setCouponStatus(`Discount code ${code} saved.`);
  });

  document.getElementById('clearCouponForm')?.addEventListener('click', clearCouponForm);
  document.getElementById('adminCouponList')?.addEventListener('click', async (event) => {
    const editButton = event.target.closest?.('[data-edit-discount]');
    if (editButton) {
      const coupon = adminDiscountCodes.find((item) => item.id === editButton.dataset.editDiscount);
      if (coupon) fillCouponForm(coupon);
      return;
    }
    const toggleButton = event.target.closest?.('[data-toggle-discount]');
    if (!toggleButton) return;
    const coupon = adminDiscountCodes.find((item) => item.id === toggleButton.dataset.toggleDiscount);
    if (!coupon) return;
    toggleButton.disabled = true;
    const { error } = await getAdminClient().from('discount_codes').update({ active: !coupon.active }).eq('id', coupon.id);
    if (error) {
      toggleButton.disabled = false;
      setCouponStatus(`Could not update the code. ${error.message || error}`);
      return;
    }
    await loadDiscountCodes();
  });
}

let imageDraftInventory = [];
let imageImportReady = false;

const IMAGE_IMPORT_DEFAULT_BACKGROUND = 'images/FrontPageWeb/Herobackgroundparts-backgroundforimages.jpg';
const IMAGE_IMPORT_DESTINATIONS = [
  ['create-product', 'Create new product'],
  ['existing-product', 'Add to existing product'],
  ['create-category', 'Create new category'],
  ['existing-category', 'Add to existing category'],
  ['save-later', 'Save for later'],
  ['ignore', 'Ignore image']
];
const IMAGE_IMPORT_ROLES = [
  ['main', 'Main Image'],
  ['image-choice', 'Image Choice'],
  ['background', 'Background'],
  ['category-card', 'Category Card Image'],
  ['category-background', 'Category Background'],
  ['page-only', 'Page-only Image']
];

function normalizeImageImportDraft(value = {}) {
  const legacyDestination = value.purpose === 'image-choice'
    ? 'existing-product'
    : value.purpose === 'not-product'
      ? 'save-later'
      : 'create-product';
  const requestedDestination = String(value.destination || legacyDestination);
  const destination = IMAGE_IMPORT_DESTINATIONS.some(([key]) => key === requestedDestination)
    ? requestedDestination
    : ['background', 'gallery', 'banner', 'other-website', 'create-card'].includes(requestedDestination)
      ? 'save-later'
      : legacyDestination;
  return {
    ...value,
    destination,
    imageRole: String(value.imageRole === 'alternate' ? 'image-choice' : value.imageRole === 'background-variation' ? 'background' : value.imageRole || (value.purpose === 'image-choice' ? 'image-choice' : 'main')),
    status: String(value.status || 'draft'),
    backgroundImage: String(value.backgroundImage || IMAGE_IMPORT_DEFAULT_BACKGROUND),
    selectedPreviewImage: String(value.selectedPreviewImage || value.path || '')
  };
}

function readImageDraftEdits() {
  return structuredClone(getAdminLiveValue('imageDrafts', readJsonStorage('mvpluxImageDrafts', {})));
}

function readImageDraftPaths(key) {
  return [...getAdminLiveValue(key, readJsonStorage(`mvplux${key[0].toUpperCase()}${key.slice(1)}`, []))];
}

async function saveProductWorkflowPatch(patch) {
  const saved = await saveAdminSettingsLive(patch);
  if (!saved) return false;
  const storageKeys = {
    products: 'mvpluxAdminProducts',
    customProducts: 'mvpluxAdminCustomProducts',
    savedForLaterProducts: 'mvpluxAdminArchivedProducts',
    deletedProducts: 'mvpluxDeletedProducts',
    imageDrafts: 'mvpluxImageDrafts',
    dismissedImageDrafts: 'mvpluxDismissedImageDrafts',
    configuredImagePaths: 'mvpluxConfiguredImagePaths',
    ignoredImagePaths: 'mvpluxIgnoredImagePaths',
    extraImages: 'mvpluxAdminExtraImages'
  };
  Object.entries(patch).forEach(([key, value]) => {
    if (storageKeys[key]) localStorage.setItem(storageKeys[key], JSON.stringify(value));
  });
  return true;
}

function imageDraftCategoryMarkup(selectedCategories = []) {
  const selected = new Set(selectedCategories);
  return (window.MVPLUX_PRODUCT_CATEGORIES || []).map((category) => `
    <label>
      <input name="categories" type="checkbox" value="${category.key}" ${selected.has(category.key) ? 'checked' : ''}>
      ${category.label}
    </label>
  `).join('');
}

function collectImageDraftForm(form) {
  const formData = new FormData(form);
  const requestedSlug = String(formData.get('slug') || '').trim();
  const destination = String(formData.get('imageDestination') || 'create-product');
  return {
    path: form.dataset.imagePath,
    destination,
    purpose: destination === 'existing-product' ? 'image-choice' : destination === 'create-product' ? 'new-product' : 'not-product',
    imageRole: String(formData.get('imageRole') || 'main'),
    subjectIdentity: String(formData.get('subjectIdentity') || '').trim(),
    title: String(formData.get('title') || '').trim(),
    slug: requestedSlug ? makeSlug(requestedSlug) : '',
    description: String(formData.get('description') || '').trim(),
    funFact: String(formData.get('funFact') || '').trim(),
    originalHeight: String(formData.get('originalHeight') || '').trim(),
    priceOverride: String(formData.get('priceOverride') || '').trim(),
    backgroundImage: String(formData.get('backgroundImage') || IMAGE_IMPORT_DEFAULT_BACKGROUND),
    categories: formData.getAll('categories'),
    parentProductSlug: String(formData.get('parentProductSlug') || ''),
    parentCategoryKey: String(formData.get('parentCategoryKey') || ''),
    categoryPage: String(formData.get('categoryPage') || '').trim(),
    imageChoiceLabel: String(formData.get('imageChoiceLabel') || '').trim(),
    websiteImageKey: String(formData.get('websiteImageKey') || '').trim(),
    selectedPreviewImage: String(formData.get('selectedPreviewImage') || form.dataset.imagePath || ''),
    status: String(form.dataset.draftStatus || 'draft'),
    savedForLater: form.dataset.savedForLater === 'true'
  };
}

function setImageDraftActionStatus(form, message, state = '') {
  const status = form?.querySelector('[data-image-draft-status]');
  if (!status) return;
  status.textContent = message || '';
  status.dataset.state = state;
}

function setImageDraftActionsBusy(form, busy) {
  form?.querySelectorAll('[data-image-import-action]').forEach((button) => {
    button.disabled = busy || !imageImportReady;
  });
}

function ensureImageImportReady(form) {
  if (imageImportReady) return true;
  setImageDraftActionStatus(form, 'Image Import Center is still loading your authenticated Admin state. Please wait.', 'error');
  setStatus('Image Import Center is not ready. Wait for Admin authorization and Supabase state to finish loading.');
  return false;
}

async function saveImageDraftForm(form, options = {}) {
  if (!ensureImageImportReady(form)) return false;
  const drafts = readImageDraftEdits();
  const baseDraft = drafts[form.dataset.imagePath];
  const draft = collectImageDraftForm(form);
  draft.status = options.status || 'draft';
  draft.savedForLater = options.savedForLater === true;
  draft.updatedAt = new Date().toISOString();
  setImageDraftActionsBusy(form, true);
  setImageDraftActionStatus(form, 'Saving privately…');
  const result = await saveAdminImageDraftPatch(form.dataset.imagePath, draft, baseDraft);
  setImageDraftActionsBusy(form, false);
  if (!result.ok) {
    setImageDraftActionStatus(form, adminLastSaveError || 'Draft was not saved.', 'error');
    return false;
  }
  form.dataset.draftStatus = draft.status;
  form.dataset.savedForLater = String(draft.savedForLater);
  setImageDraftActionStatus(form, draft.savedForLater ? 'Saved for later.' : 'Draft saved privately.', 'success');
  if (!options.quiet) setStatus(draft.savedForLater ? 'Image draft saved for later.' : 'Unpublished image draft saved privately.');
  renderImageImportPending();
  return true;
}

function imageImportProductOperation(parent, updatedProduct) {
  if (newAdminArchitectureEnabled()) {
    return {
      type: 'record', collectionKey: 'products', entryKey: parent.slug,
      baseRecord: readAdminProducts()[parent.slug] || parent, patch: updatedProduct
    };
  }
  const customProducts = readCustomProducts();
  const customProduct = customProducts.find((product) => product.slug === parent.slug);
  if (customProduct) {
    return {
      type: 'record', collectionKey: 'customProducts', identityKey: 'slug', entryKey: parent.slug,
      baseRecord: customProduct, patch: updatedProduct
    };
  }
  return {
    type: 'record', collectionKey: 'products', entryKey: parent.slug,
    baseRecord: readAdminProducts()[parent.slug] || {}, patch: updatedProduct
  };
}

function importedImageChoice(draft, parent) {
  return {
    label: draft.imageChoiceLabel || IMAGE_IMPORT_ROLES.find(([key]) => key === draft.imageRole)?.[1] || 'Alternate image',
    image: draft.path,
    role: draft.imageRole
  };
}

async function configureImageDraft(form, approvalStatus = 'approved') {
  if (!ensureImageImportReady(form)) return false;
  const draft = collectImageDraftForm(form);
  if (draft.destination === 'save-later') return saveImageDraftForm(form, { savedForLater: true });
  if (draft.destination === 'ignore') {
    await ignoreImageDraft(draft.path, form);
    return true;
  }
  const operations = [];
  const baseDrafts = readImageDraftEdits();
  const baseDraft = baseDrafts[draft.path];
  let resultType = draft.destination;
  let resultSlug = '';
  setImageDraftActionsBusy(form, true);
  setImageDraftActionStatus(form, 'Applying assignment privately…');
  try {
    if (draft.imageRole === 'page-only') {
      if (!draft.websiteImageKey) throw new Error('Choose the website image slot for this page-only image.');
      const extraImages = readExtraImages();
      operations.push({
        type: 'value', collectionKey: 'extraImages', entryKey: draft.websiteImageKey,
        baseValue: extraImages[draft.websiteImageKey], value: draft.path
      });
      resultType = 'page-only';
    } else if (draft.destination === 'existing-product') {
      const parent = effectiveAdminProduct(draft.parentProductSlug);
      if (!parent) throw new Error('Select the existing product this image belongs to.');
      const owner = findProductImageOwner(draft.path);
      if (owner && owner.slug !== parent.slug) throw new Error(`That image is already assigned to ${owner.title} (${owner.slug}).`);
      let imageChoices = normalizeImageChoices(parent.imageChoices);
      const updated = {};
      if (draft.imageRole === 'main') {
        if (parent.cutoutImage && parent.cutoutImage !== draft.path && !window.confirm(`Replace the Main Image for ${parent.title}? The current Main Image will move to Image Choices and no file will be deleted.`)) {
          throw new Error('Main Image replacement canceled.');
        }
        imageChoices = imageChoices.filter((choice) => choice.image !== draft.path);
        if (parent.cutoutImage && parent.cutoutImage !== draft.path && !imageChoices.some((choice) => choice.image === parent.cutoutImage)) {
          imageChoices.push({ label: 'Previous Main Image', image: parent.cutoutImage, role: 'image-choice' });
        }
        updated.cutoutImage = draft.path;
        updated.imageChoices = imageChoices;
      } else if (draft.imageRole === 'background') {
        if (parent.backgroundImage && parent.backgroundImage !== draft.path && !window.confirm(`Replace the Background for ${parent.title}? The physical background image will not be deleted.`)) {
          throw new Error('Background replacement canceled.');
        }
        updated.backgroundImage = draft.path;
      } else {
        if (owner?.slug === parent.slug) throw new Error('That image is already assigned to this product.');
        updated.imageChoices = [...imageChoices, importedImageChoice(draft, parent)];
      }
      updated.updatedAt = new Date().toISOString();
      updated.draftStatus = 'ready';
      updated.approvalStatus = 'approved';
      operations.push(imageImportProductOperation(parent, updated));
      resultSlug = parent.slug;
    } else if (draft.destination === 'create-product') {
      draft.slug = draft.slug || makeSlug(draft.title);
      if (!draft.title || !draft.slug) throw new Error('Add a title first. The product ID will be generated automatically.');
      if (!draft.originalHeight) throw new Error('Add the original height first.');
      if (allAdminProducts().some((product) => product.slug === draft.slug)) throw new Error('That slug already belongs to another product or card.');
      const owner = findProductImageOwner(draft.path);
      if (owner) throw new Error(`That image is already assigned to ${owner.title} (${owner.slug}).`);
      const product = buildNewProductRecord({
        slug: draft.slug, title: draft.title, description: draft.description, funFact: draft.funFact,
        cutoutImage: draft.path, backgroundImage: draft.backgroundImage, originalHeight: draft.originalHeight,
        priceOverride: draft.priceOverride, categories: draft.categories, visible: draft.categories.length > 0,
        displayOverrides: {}, approvalStatus
      });
      operations.push(newProductRecordOperation(product));
      resultSlug = draft.slug;
    } else if (draft.destination === 'create-category') {
      if (!draft.title || !draft.slug) throw new Error('Add a category title and unique key first.');
      if (readAdminCategories()[draft.slug]) throw new Error('That category key already exists.');
      const now = new Date().toISOString();
      const cardImage = ['main', 'category-card'].includes(draft.imageRole) ? draft.path : '';
      const categoryBackground = ['background', 'category-background'].includes(draft.imageRole) ? draft.path : draft.backgroundImage;
      operations.push({
        type: 'record', collectionKey: 'categories', entryKey: draft.slug, baseRecord: undefined,
        patch: {
          key: draft.slug,
          title: draft.title,
          description: draft.description,
          funFact: draft.funFact,
          page: draft.categoryPage || `category.html?category=${encodeURIComponent(draft.slug)}`,
          visible: true,
          order: 999,
          card: { title: draft.title, description: draft.description, image: cardImage, backgroundImage: categoryBackground, visible: true, order: 999 },
          displaySettings: { backgroundImage: categoryBackground, backgroundPosition: 'center center' },
          createdAt: now,
          updatedAt: now,
          draftStatus: 'ready',
          approvalStatus: 'approved'
        }
      });
      resultSlug = draft.slug;
    } else if (draft.destination === 'existing-category') {
      const category = readAdminCategories()[draft.parentCategoryKey];
      if (!category) throw new Error('Select the existing category this image belongs to.');
      const patch = { updatedAt: new Date().toISOString(), draftStatus: 'ready', approvalStatus: 'approved' };
      if (draft.imageRole === 'category-card' || draft.imageRole === 'main') {
        if (category.card?.image && category.card.image !== draft.path && !window.confirm(`Replace the category card image for ${category.title}? No image file will be deleted.`)) throw new Error('Category card replacement canceled.');
        patch.card = { ...(category.card || {}), image: draft.path };
      } else if (draft.imageRole === 'category-background') {
        if (category.card?.backgroundImage && category.card.backgroundImage !== draft.path && !window.confirm(`Replace the category card background for ${category.title}? No image file will be deleted.`)) throw new Error('Category background replacement canceled.');
        patch.card = { ...(category.card || {}), backgroundImage: draft.path };
      } else if (draft.imageRole === 'background') {
        patch.displaySettings = { ...(category.displaySettings || {}), backgroundImage: draft.path };
      } else {
        throw new Error('Choose Category Card Image, Category Background, or Background for an existing category.');
      }
      operations.push({ type: 'record', collectionKey: 'categories', entryKey: category.key, baseRecord: category, patch });
      resultSlug = category.key;
    } else {
      throw new Error('Choose where this image belongs.');
    }

    operations.push({
      type: 'membership', collectionKey: 'configuredImagePaths', entryKey: draft.path,
      present: true, baseValues: readImageDraftPaths('configuredImagePaths')
    });
    operations.push({
      type: 'record', collectionKey: 'imageDrafts', entryKey: draft.path, baseRecord: baseDraft,
      patch: {
      ...draft,
      status: 'completed',
      savedForLater: false,
      resultType,
      resultSlug,
      lastError: '',
      updatedAt: new Date().toISOString()
      }
    });
    const result = await saveAdminCollectionOperations(operations);
    if (!result.ok) throw new Error(adminLastSaveError || 'Supabase did not save the assignment.');
    renderAdminProducts();
    renderImageDrafts();
    setStatus('Image assignment saved privately and added to Approved — Waiting to Publish.');
  } catch (error) {
    await saveAdminImageDraftPatch(draft.path, {
      ...draft,
      status: 'error',
      savedForLater: false,
      lastError: error.message || 'Could not apply this image assignment.',
      updatedAt: new Date().toISOString()
    }, baseDraft).catch(() => null);
    setImageDraftActionsBusy(form, false);
    setImageDraftActionStatus(form, error.message || 'Could not apply this image assignment.', 'error');
    setStatus(error.message || 'Could not apply this image assignment.');
    renderImageImportPending();
    return false;
  }
  return true;
}

async function ignoreImageDraft(path, form) {
  if (!ensureImageImportReady(form)) return;
  setImageDraftActionsBusy(form, true);
  setImageDraftActionStatus(form, 'Saving ignored inventory state…');
  const drafts = readImageDraftEdits();
  const ignoredImagePaths = readImageDraftPaths('ignoredImagePaths');
  const result = await saveAdminCollectionOperations([
    { type: 'record', collectionKey: 'imageDrafts', entryKey: path, baseRecord: drafts[path], remove: true },
    { type: 'membership', collectionKey: 'ignoredImagePaths', entryKey: path, present: true, baseValues: ignoredImagePaths }
  ]);
  if (!result.ok) {
    setImageDraftActionsBusy(form, false);
    setImageDraftActionStatus(form, adminLastSaveError || 'Could not ignore this image.', 'error');
    return;
  }
  renderImageDrafts();
  setStatus('Image marked as non-product inventory. The image file was not changed.');
}

function imageImportAssetOptions(selectedKey = '') {
  return [
    '<option value="">Select a website image slot</option>',
    ...extraImageItems.map((item) => `<option value="${escapeAdminHtml(item.key)}" ${item.key === selectedKey ? 'selected' : ''}>${escapeAdminHtml(`${item.group} — ${item.label}`)}</option>`)
  ].join('');
}

function parentCategoryPickerMarkup(selectedKey = '') {
  const categories = Object.values(readAdminCategories())
    .filter((category) => category?.key)
    .sort((left, right) => String(left.title || left.key).localeCompare(String(right.title || right.key)));
  return `
    <label>Search categories<input type="search" data-category-search placeholder="Search title or key"></label>
    <label>Existing category
      <select name="parentCategoryKey">
        <option value="">Select category</option>
        ${categories.map((category) => `<option value="${escapeAdminHtml(category.key)}" data-search="${escapeAdminHtml(`${category.title} ${category.key}`.toLowerCase())}" ${category.key === selectedKey ? 'selected' : ''}>${escapeAdminHtml(category.title || category.key)} — ${escapeAdminHtml(category.key)}</option>`).join('')}
      </select>
    </label>
    <div data-category-parent-preview class="admin-parent-product-preview"></div>
  `;
}

function bindParentCategoryPicker(scope) {
  const search = scope.querySelector('[data-category-search]');
  const select = scope.querySelector('[name="parentCategoryKey"]');
  const preview = scope.querySelector('[data-category-parent-preview]');
  if (!select) return;
  const update = () => {
    const category = readAdminCategories()[select.value];
    preview.innerHTML = category ? `
      ${category.card?.image ? `<img src="${escapeAdminHtml(category.card.image)}" alt="">` : ''}
      <span><strong>${escapeAdminHtml(category.title || category.key)}</strong><small>${escapeAdminHtml(category.key)} · ${escapeAdminHtml(category.page || 'No page')}</small></span>
    ` : '<span class="admin-note">Choose a category to see its current card assignment.</span>';
  };
  search?.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    [...select.options].forEach((option) => {
      if (!option.value) return;
      option.hidden = Boolean(query) && !String(option.dataset.search || '').includes(query);
    });
  });
  select.addEventListener('change', update);
  update();
}

function updateImageDraftDestination(form) {
  const destination = form.querySelector('[name="imageDestination"]')?.value || 'create-product';
  const role = form.querySelector('[name="imageRole"]')?.value || 'main';
  form.querySelectorAll('[data-import-destinations]').forEach((section) => {
    section.hidden = !section.dataset.importDestinations.split(' ').includes(destination);
  });
  form.querySelectorAll('[data-import-roles]').forEach((section) => {
    section.hidden = !section.dataset.importRoles.split(' ').includes(role);
  });
  const action = form.querySelector('[data-apply-image-import]');
  const draftAction = form.querySelector('[data-apply-image-import-draft]');
  if (draftAction) draftAction.hidden = destination !== 'create-product';
  if (action) {
    action.textContent = destination === 'existing-product' ? 'Add to Product'
      : destination === 'create-product' ? 'Approve Product'
        : destination === 'create-category' ? 'Create Category'
          : destination === 'existing-category' ? 'Add to Category'
            : destination === 'save-later' ? 'Save For Later'
              : destination === 'ignore' ? 'Ignore Image'
                : 'Apply Assignment';
  }
  updateImageImportPreview(form);
}

function imageImportPreviewChoices(form) {
  const importedPath = form.dataset.imagePath;
  const parent = effectiveAdminProduct(form.querySelector('[name="parentProductSlug"]')?.value);
  const importRole = form.querySelector('[name="imageRole"]')?.value || 'main';
  const choices = [{
    label: 'Current selected image',
    image: importRole === 'background' && parent?.cutoutImage ? parent.cutoutImage : importedPath,
    ...(importRole === 'background' ? { stage: importedPath } : {}),
    role: importRole,
    identity: importedPath
  }];
  if (parent?.cutoutImage && parent.cutoutImage !== importedPath) choices.push({ label: 'Main Image', image: parent.cutoutImage, role: 'main' });
  normalizeImageChoices(parent?.imageChoices).forEach((choice) => {
    const identity = choice.role === 'background' && choice.stage ? choice.stage : choice.image;
    if (!choices.some((item) => (item.identity || item.image) === identity)) choices.push({ ...choice, identity });
  });
  return choices;
}

function updateImageImportPreview(form) {
  const preview = form.querySelector('[data-image-import-preview]');
  const stage = form.querySelector('[data-image-import-stage]');
  const selectedInput = form.querySelector('[name="selectedPreviewImage"]');
  const gallery = form.querySelector('[data-image-import-choices]');
  const choices = imageImportPreviewChoices(form);
  const selected = choices.some((choice) => (choice.identity || choice.image) === selectedInput?.value) ? selectedInput.value : form.dataset.imagePath;
  const selectedChoice = choices.find((choice) => (choice.identity || choice.image) === selected) || choices[0];
  if (selectedInput) selectedInput.value = selected;
  if (preview) preview.src = selectedChoice.image;
  if (stage) stage.style.backgroundImage = `url("${selectedChoice.stage || form.querySelector('[name="backgroundImage"]')?.value || IMAGE_IMPORT_DEFAULT_BACKGROUND}")`;
  if (!gallery) return;
  gallery.innerHTML = choices.map((choice) => `
    <button type="button" class="${(choice.identity || choice.image) === selected ? 'active' : ''}" data-import-preview-image="${escapeAdminHtml(choice.identity || choice.image)}">
      <img src="${escapeAdminHtml(choice.stage || choice.image)}" alt="">
      <span>${escapeAdminHtml(choice.label || 'Image choice')}</span>
      <small>${escapeAdminHtml(IMAGE_IMPORT_ROLES.find(([key]) => key === choice.role)?.[1] || choice.role || 'Alternate Image')}</small>
    </button>
  `).join('');
  gallery.querySelectorAll('[data-import-preview-image]').forEach((button) => {
    button.addEventListener('click', async () => {
      selectedInput.value = button.dataset.importPreviewImage;
      updateImageImportPreview(form);
      await saveImageDraftForm(form, { quiet: true, status: form.dataset.draftStatus || 'draft' });
    });
  });
}

function renderImageDrafts() {
  const container = document.getElementById('adminImageDrafts');
  if (!container) return;
  const edits = readImageDraftEdits();
  const hiddenPaths = new Set([
    ...readImageDraftPaths('dismissedImageDrafts'),
    ...readImageDraftPaths('configuredImagePaths'),
    ...readImageDraftPaths('ignoredImagePaths')
  ]);
  effectiveAdminProducts().forEach((product) => {
    if (product.cutoutImage) hiddenPaths.add(product.cutoutImage);
    normalizeImageChoices(product.imageChoices).forEach((choice) => hiddenPaths.add(choice.image));
  });
  const drafts = imageDraftInventory.filter((draft) => draft?.path && !hiddenPaths.has(draft.path));

  if (!drafts.length) {
    container.innerHTML = '<p class="admin-note">No new unassociated images are waiting for setup.</p>';
    return;
  }

  container.innerHTML = drafts.map((inventoryDraft) => {
    const draft = normalizeImageImportDraft({ ...inventoryDraft, ...(edits[inventoryDraft.path] || {}) });
    return `
      <form class="admin-product-card admin-image-draft" data-image-path="${escapeAdminHtml(draft.path)}" data-draft-status="${escapeAdminHtml(draft.status)}" data-saved-for-later="${draft.savedForLater === true}">
        <div class="admin-product-heading">
          <div><h3>${escapeAdminHtml(draft.title || 'Unpublished image draft')}</h3><p class="admin-note" data-image-draft-status>${imageImportReady ? 'Draft — saved privately only after you choose Save Draft.' : 'Loading authenticated Admin state…'}</p></div>
          <div class="admin-card-actions">
            <button type="button" data-image-import-action data-save-image-later ${imageImportReady ? '' : 'disabled'}>Save For Later</button>
            <button type="button" data-image-import-action data-preview-image-import>Preview</button>
            <button type="button" data-image-import-action data-apply-image-import-draft ${imageImportReady ? '' : 'disabled'}>Save Product Draft</button>
            <button type="button" data-image-import-action data-apply-image-import ${imageImportReady ? '' : 'disabled'}>Apply Assignment</button>
            <button type="button" data-image-import-action data-ignore-image ${imageImportReady ? '' : 'disabled'}>Ignore Image</button>
          </div>
        </div>
        <div class="admin-product-layout">
          <div class="admin-image-import-preview">
            <div class="admin-card-preview" data-image-import-stage style="background-image:url('${escapeAdminHtml(draft.backgroundImage)}')"><img class="admin-preview-cutout admin-draft-preview" data-image-import-preview src="${escapeAdminHtml(draft.selectedPreviewImage)}" alt="Selected image preview"></div>
            <div class="admin-import-choice-gallery" data-image-import-choices></div>
          </div>
          <div class="admin-control-groups">
            <input name="selectedPreviewImage" type="hidden" value="${escapeAdminHtml(draft.selectedPreviewImage)}">
            <label>Where does this image belong?
              <select name="imageDestination">
                ${IMAGE_IMPORT_DESTINATIONS.map(([key, label]) => `<option value="${key}" ${draft.destination === key ? 'selected' : ''}>${label}</option>`).join('')}
              </select>
            </label>
            <label data-import-destinations="create-product existing-product create-category existing-category">Image role
              <select name="imageRole">
                ${IMAGE_IMPORT_ROLES.map(([key, label]) => `<option value="${key}" ${draft.imageRole === key ? 'selected' : ''}>${label}</option>`).join('')}
              </select>
            </label>
            <div data-import-destinations="create-product create-category">
              <label>Who or what is this?<input name="subjectIdentity" type="text" value="${escapeAdminHtml(draft.subjectIdentity || '')}" placeholder="Example: Michael Jordan"></label>
              <label>Title<input name="title" type="text" value="${escapeAdminHtml(draft.title || '')}"></label>
              <label>Description<textarea name="description" rows="3">${escapeAdminHtml(draft.description || '')}</textarea></label>
              <label>Fun fact<textarea name="funFact" rows="2">${escapeAdminHtml(draft.funFact || '')}</textarea></label>
              <div class="admin-ai-actions" aria-label="Optional AI assistance">
                <button type="button" data-ai-suggest="title">Suggest Title</button>
                <button type="button" data-ai-suggest="description">Suggest Description</button>
                <button type="button" data-ai-suggest="funFact">Suggest Fun Fact</button>
                <button type="button" data-ai-suggest="improve">Improve Existing Text</button>
              </div>
              <p class="admin-note admin-ai-status" data-ai-status aria-live="polite"></p>
              <p class="admin-note">AI suggestions fill these fields for your review. They never save or publish automatically.</p>
              <label data-import-destinations="create-product">Original height<input name="originalHeight" type="text" value="${escapeAdminHtml(draft.originalHeight || '')}" placeholder="6'6 or 78"></label>
              <label>Background
                <select name="backgroundImage">
                  <option value="${IMAGE_IMPORT_DEFAULT_BACKGROUND}" ${draft.backgroundImage === IMAGE_IMPORT_DEFAULT_BACKGROUND ? 'selected' : ''}>Clean stage</option>
                  <option value="images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg" ${draft.backgroundImage === 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg' ? 'selected' : ''}>Sci-fi stage</option>
                  <option value="images/FanBackgrounds/top-favorite-stage-gold.png" ${draft.backgroundImage === 'images/FanBackgrounds/top-favorite-stage-gold.png' ? 'selected' : ''}>Gold stage</option>
                  <option value="images/FanBackgrounds/top-favorite-stage-premium.png" ${draft.backgroundImage === 'images/FanBackgrounds/top-favorite-stage-premium.png' ? 'selected' : ''}>Premium stage</option>
                </select>
              </label>
              <fieldset data-import-destinations="create-product"><legend>Category assignments</legend><div class="admin-category-options">${imageDraftCategoryMarkup(draft.categories || [])}</div></fieldset>
              <details class="admin-advanced-fields"><summary>Advanced</summary>
                <label>Generated product or category ID<input name="slug" type="text" value="${escapeAdminHtml(draft.slug || '')}" placeholder="Generated from title"></label>
                <label data-import-destinations="create-product">Price override (optional)<input name="priceOverride" type="number" min="0" step="0.01" value="${escapeAdminHtml(draft.priceOverride || '')}"></label>
                <label data-import-destinations="create-category">Category page<input name="categoryPage" type="text" value="${escapeAdminHtml(draft.categoryPage || '')}" placeholder="Reusable category page is automatic"></label>
                <label>Repository image path<input type="text" value="${escapeAdminHtml(draft.path)}" readonly></label>
              </details>
            </div>
            <div data-import-destinations="existing-product">
              ${parentProductPickerMarkup(draft.parentProductSlug || '')}
              <label>Image-choice label (optional)<input name="imageChoiceLabel" type="text" value="${escapeAdminHtml(draft.imageChoiceLabel || '')}" placeholder="Light, Dark, Print, Shade 1, Alternate pose"></label>
              <p class="admin-note">Choosing Main Image moves the current main image into Alternate Images; no physical file is deleted.</p>
            </div>
            <div data-import-destinations="existing-category">
              ${parentCategoryPickerMarkup(draft.parentCategoryKey || '')}
              <p class="admin-note">Choose Category Card Image, Category Background, or Background before adding this image.</p>
            </div>
            <div data-import-roles="page-only">
              <label>Website image slot<select name="websiteImageKey">${imageImportAssetOptions(draft.websiteImageKey || '')}</select></label>
              <p class="admin-note">Page-only images use the existing website image assignments. The physical file is never modified.</p>
            </div>
          </div>
        </div>
      </form>
    `;
  }).join('');

  container.querySelectorAll('.admin-image-draft').forEach((form) => {
    bindParentProductPicker(form);
    bindParentCategoryPicker(form);
    updateImageDraftDestination(form);
    updateImageImportPreview(form);
    form.querySelector('[name="imageDestination"]')?.addEventListener('change', () => updateImageDraftDestination(form));
    form.querySelector('[name="parentProductSlug"]')?.addEventListener('change', () => updateImageImportPreview(form));
    form.querySelector('[name="imageRole"]')?.addEventListener('change', () => {
      updateImageDraftDestination(form);
      updateImageImportPreview(form);
    });
    form.querySelector('[name="backgroundImage"]')?.addEventListener('change', () => updateImageImportPreview(form));
    form.querySelector('[name="title"]')?.addEventListener('input', () => {
      const slug = form.querySelector('[name="slug"]');
      const generated = makeSlug(form.querySelector('[name="title"]').value);
      if (slug && (!slug.value || slug.value === slug.dataset.generatedValue)) slug.value = generated;
      if (slug) slug.dataset.generatedValue = slug.value;
    });
    form.querySelector('[data-save-image-later]')?.addEventListener('click', () => saveImageDraftForm(form, { savedForLater: true }));
    form.querySelector('[data-preview-image-import]')?.addEventListener('click', () => updateImageImportPreview(form));
    form.querySelector('[data-apply-image-import-draft]')?.addEventListener('click', () => configureImageDraft(form, 'draft'));
    form.querySelector('[data-apply-image-import]')?.addEventListener('click', () => configureImageDraft(form));
    form.querySelector('[data-ignore-image]')?.addEventListener('click', () => ignoreImageDraft(form.dataset.imagePath, form));
  });
  renderImageImportPending();
}

function imageImportPublished(draft) {
  const snapshot = adminLiveSettings?.lastPublishedSnapshot || adminLastSuccessfulSnapshot;
  if (!snapshot || !['ready', 'completed'].includes(draft.status)) return false;
  if (draft.resultSlug) {
    const product = snapshot.products?.[draft.resultSlug] || snapshot.categoryDisplayCards?.[draft.resultSlug];
    if (!product) return false;
    return product.cutoutImage === draft.path || normalizeImageChoices(product.imageChoices).some((choice) => choice.image === draft.path || choice.stage === draft.path);
  }
  return Object.values(snapshot.extraImages || snapshot.siteImages || {}).some((value) => (typeof value === 'string' ? value : value?.src) === draft.path);
}

function imageImportStatus(draft) {
  if (draft.lastError || draft.status === 'error') return 'Error';
  if (imageImportPublished(draft)) return 'Published';
  if (draft.savedForLater) return 'Draft';
  if (['ready', 'completed'].includes(draft.status)) return 'Ready to Publish';
  return 'Draft';
}

function imageImportOpenUrl(draft) {
  if (!draft?.resultSlug) return '';
  const category = readAdminCategories()[draft.resultSlug];
  if (category?.page) return category.page;
  const product = effectiveAdminProduct(draft.resultSlug);
  const page = readAdminCategories()[product?.categories?.[0]]?.page || 'index.html';
  return `${page}#${draft.resultSlug}`;
}

function renderImageImportPending() {
  const container = document.getElementById('adminImagePendingChanges');
  if (!container) return;
  const drafts = Object.values(readImageDraftEdits()).map(normalizeImageImportDraft);
  if (!drafts.length) {
    container.innerHTML = '<p class="admin-note">No saved image-import changes yet.</p>';
    return;
  }
  container.innerHTML = drafts
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
    .map((draft) => {
      const status = imageImportStatus(draft);
      const openUrl = imageImportOpenUrl(draft);
      return `
        <article class="admin-image-pending-item" data-pending-image-path="${escapeAdminHtml(draft.path)}">
          <input type="checkbox" data-image-pending-select ${status === 'Published' ? 'disabled' : ''}>
          <img src="${escapeAdminHtml(draft.path)}" alt="">
          <span><strong>${escapeAdminHtml(draft.title || draft.imageChoiceLabel || draft.path.split('/').pop())}</strong><small>${escapeAdminHtml(draft.path)}</small></span>
          <span class="admin-image-status" data-status="${escapeAdminHtml(status.toLowerCase().replace(/\s+/g, '-'))}">${status}</span>
          ${openUrl ? `<a href="${escapeAdminHtml(openUrl)}" target="_blank" rel="noopener">Open on Website</a>` : ''}
        </article>
      `;
    }).join('');
}

async function saveSelectedImageImportsForLater() {
  const selected = [...document.querySelectorAll('[data-image-pending-select]:checked')]
    .map((input) => input.closest('[data-pending-image-path]')?.dataset.pendingImagePath)
    .filter(Boolean);
  if (!selected.length) {
    setStatus('Select at least one pending image first.');
    return;
  }
  const drafts = readImageDraftEdits();
  const operations = selected.flatMap((path) => drafts[path] ? [{
    type: 'record', collectionKey: 'imageDrafts', entryKey: path, baseRecord: drafts[path],
    patch: { savedForLater: true, status: drafts[path].status === 'ready' ? 'ready' : 'draft', updatedAt: new Date().toISOString() }
  }] : []);
  const result = await saveAdminCollectionOperations(operations);
  if (!result.ok) return;
  renderImageImportPending();
  setStatus(`${selected.length} image import${selected.length === 1 ? '' : 's'} saved for later.`);
}

async function publishImageImports(mode) {
  const drafts = Object.values(readImageDraftEdits()).map(normalizeImageImportDraft);
  const requestedPaths = mode === 'all'
    ? drafts.filter((draft) => !draft.savedForLater && imageImportStatus(draft) === 'Ready to Publish').map((draft) => draft.path)
    : [...document.querySelectorAll('[data-image-pending-select]:checked')]
      .map((input) => input.closest('[data-pending-image-path]')?.dataset.pendingImagePath)
      .filter((path) => drafts.some((draft) => draft.path === path && imageImportStatus(draft) === 'Ready to Publish'));
  const selectedProductSlugs = new Set(drafts.filter((draft) => requestedPaths.includes(draft.path)).map((draft) => draft.resultSlug).filter(Boolean));
  const selectedPaths = drafts
    .filter((draft) => !draft.savedForLater && imageImportStatus(draft) === 'Ready to Publish')
    .filter((draft) => requestedPaths.includes(draft.path) || selectedProductSlugs.has(draft.resultSlug))
    .map((draft) => draft.path);
  if (!selectedPaths.length) {
    setStatus('No Ready to Publish image imports are selected.');
    return;
  }
  const selectedDrafts = drafts.filter((draft) => selectedPaths.includes(draft.path));
  const reviewItems = architectureReviewItems();
  const changeIds = new Set();
  selectedDrafts.forEach((draft) => {
    if (draft.resultSlug) {
      if (readAdminProducts()[draft.resultSlug]) changeIds.add(`product:${draft.resultSlug}`);
      if (readAdminCategories()[draft.resultSlug]) changeIds.add(`category:${draft.resultSlug}`);
    }
    if (draft.websiteImageKey) changeIds.add('extraImages:all');
  });
  const selectedChanges = reviewItems.filter((item) => changeIds.has(item.id) && item.approved);
  if (!selectedChanges.length) {
    setStatus('The selected images are not attached to a Ready product, category, or website-image change. Mark the related item Ready first.');
    return;
  }
  prepareSelectedPublish(selectedChanges);
}

async function loadImageDraftInventory() {
  try {
    const response = await fetch('product-drafts.json', { cache: 'no-store' });
    imageDraftInventory = response.ok ? await response.json() : [];
  } catch (error) {
    imageDraftInventory = [];
  }
  renderImageDrafts();
  renderPublishSummary();
}

function downloadAdminJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 500);
}

async function setAdminArchitectureEnabled(enabled) {
  const architecture = await adminArchitecturePromise;
  let latest = await fetchAuthoritativeAdminGlobal();
  if (enabled) {
    const verified = await verifyStoredAdminArchitectureBackup();
    if (!verified.ok) throw new Error(`Activation blocked: ${verified.errors.join(' ')}`);
    latest = { edits: verified.globalRow.edits, revision: Number(verified.globalRow.revision) || 0 };
    const verification = latest.edits?.[architecture.ADMIN_ARCHITECTURE_VERIFICATION_KEY];
    const migration = latest.edits?.[architecture.ADMIN_ARCHITECTURE_MIGRATION_KEY];
    if (verification?.verified !== true || verification.checksum !== verified.checksum) throw new Error('Activation blocked because backup verification is incomplete.');
    if (migration?.version !== 1 || migration.backupChecksum !== verified.checksum) throw new Error('Activation blocked because migration preparation has not completed for this backup.');
    if (architecture.migrationLockActive(latest.edits?.[architecture.ADMIN_ARCHITECTURE_LOCK_KEY])) throw new Error('Activation blocked while another Admin tab is preparing migration data.');
  }
  const feature = {
    ...architecture.architectureFeature(latest.edits),
    enabled: Boolean(enabled),
    installedAt: latest.edits?.[architecture.ADMIN_ARCHITECTURE_FEATURE_KEY]?.installedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const { data, error } = await getAdminClient().rpc('save_site_edits', {
    p_page_key: 'admin-global', p_edits: { [architecture.ADMIN_ARCHITECTURE_FEATURE_KEY]: feature },
    p_expected_revision: latest.revision, p_replace: false
  });
  if (error) throw error;
  adminLiveSettings = data?.edits || { ...latest.edits, [architecture.ADMIN_ARCHITECTURE_FEATURE_KEY]: feature };
  adminLiveRevision = Number(data?.revision) || latest.revision + 1;
  announceAdminSave('admin-global', adminLiveRevision, [architecture.ADMIN_ARCHITECTURE_FEATURE_KEY]);
  adminArchitectureState = await buildAdminArchitectureState(adminLiveSettings);
  setupAdminArchitectureWorkspace();
  setupAdminCreationWorkspace();
  renderAdminProducts();
  renderPublishSummary();
  return true;
}

async function restoreAdminArchitectureBackup() {
  const architecture = await adminArchitecturePromise;
  const latest = await fetchAuthoritativeAdminGlobal();
  const backup = latest.edits?.[architecture.ADMIN_ARCHITECTURE_BACKUP_KEY];
  if (!backup?.recoveryOnly || !backup.adminGlobal || !Array.isArray(backup.siteEdits)) throw new Error('The migration backup is unavailable or invalid.');
  if (!window.confirm('Restore the recovery backup and switch back to the old Admin readers? Current normalized data will remain in the recovery export but active Admin state will be replaced.')) return false;
  const restoredGlobal = {
    ...structuredClone(backup.adminGlobal),
    [architecture.ADMIN_ARCHITECTURE_BACKUP_KEY]: backup,
    [architecture.ADMIN_ARCHITECTURE_FEATURE_KEY]: { ...architecture.architectureFeature(latest.edits), enabled: false, updatedAt: new Date().toISOString() }
  };
  const { error } = await getAdminClient().rpc('save_site_edits', {
    p_page_key: 'admin-global', p_edits: restoredGlobal,
    p_expected_revision: latest.revision, p_replace: true
  });
  if (error) throw error;
  for (const row of backup.siteEdits.filter((row) => row.page_key && row.page_key !== 'admin-global')) {
    const { data: current, error: loadError } = await getAdminClient().from('site_edits').select('revision').eq('page_key', row.page_key).maybeSingle();
    if (loadError) throw loadError;
    const { error: pageError } = await getAdminClient().rpc('save_site_edits', {
      p_page_key: row.page_key, p_edits: row.edits || {}, p_expected_revision: Number(current?.revision) || 0, p_replace: true
    });
    if (pageError) throw pageError;
  }
  window.location.reload();
  return true;
}

function renderAdminDashboard() {
  const container = document.getElementById('adminDashboardSummary');
  if (!container) return;
  const review = architectureReviewItems();
  const conflicts = adminLiveSettings?.adminArchitectureMigrationV2?.productPageOverrides;
  const products = Object.values(readAdminProducts());
  const categories = Object.values(newAdminArchitectureEnabled() ? readAdminCategories() : adminArchitectureState?.candidate?.categories || {});
  const available = (value) => value === undefined || value === null || value === '' ? 'Not available' : value;
  const cards = [
    { title: 'Draft Products', value: products.filter((item) => item.approvalStatus === 'draft' || item.draftStatus === 'draft').length, note: 'Products saved privately and still being prepared.', href: '#create-content' },
    { title: 'Draft Categories', value: categories.filter((item) => item.approvalStatus === 'draft' || item.draftStatus === 'draft').length, note: 'Categories saved privately and still being prepared.', href: '#create-content' },
    { title: 'New Image Imports', value: Object.values(readImageDraftEdits()).filter((draft) => ['draft', 'new'].includes(draft.status || 'draft')).length, note: 'Repository images waiting to be assigned.', href: '#new-image-drafts' },
    { title: 'Waiting for Approval', value: review.filter((item) => !item.approved).length, note: 'Private changes that need your review.', href: '#approved-products' },
    { title: 'Approved — Waiting to Publish', value: review.filter((item) => item.approved).length, note: 'Approved changes customers cannot see yet.', href: '#approved-products' },
    { title: 'Save Errors', value: adminLastSaveError ? 1 : 0, note: adminLastSaveError ? 'One or more changes were not saved.' : 'No failed saves detected.', href: '#recovery-advanced' },
    { title: 'Conflicts', value: (conflicts?.conflicts?.length || 0) + (conflicts?.unsupported?.length || 0), note: 'Changes that need a decision before publishing.', href: '#recovery-advanced' },
    { title: 'Hidden Products', value: products.filter((product) => product.visible === false).length, note: 'Products currently hidden in private Admin state.', href: '#approved-products' },
    { title: 'Archived Products', value: readArchivedProducts().length, note: 'Products preserved outside the active storefront.', href: '#recovery-advanced' },
    { title: 'Last Published', value: adminPublishedFileState.publishedAt ? new Date(adminPublishedFileState.publishedAt).toLocaleDateString() : 'Not available', note: 'Most recent version made visible to customers.', href: '#publish-changes' }
  ];
  container.innerHTML = cards.map((card) => `<a class="admin-dashboard-card" href="${card.href}"><span class="admin-dashboard-card-title">${escapeAdminHtml(card.title)}</span><strong>${escapeAdminHtml(String(available(card.value)))}</strong><span>${escapeAdminHtml(card.note)}</span><em>Open</em></a>`).join('');
  const flag = document.querySelector('[data-admin-dashboard-flag]');
  if (flag) flag.textContent = newAdminArchitectureEnabled() ? 'New Admin System active locally' : 'Legacy System active';
  const status = document.getElementById('adminArchitectureStatus');
  if (status) {
    const verification = adminLiveSettings?.adminArchitectureBackupVerificationV1;
    const migration = adminLiveSettings?.adminArchitectureMigrationV2;
    const backupReady = adminArchitectureState?.diagnostics?.backupReady === true && verification?.verified === true;
    const migrationReady = backupReady && migration?.version === 1 && migration.backupChecksum === verification.checksum;
    const readiness = newAdminArchitectureEnabled() ? 'Active locally' : migrationReady ? 'Ready to activate locally' : backupReady ? 'Backup verified — preparation required' : 'Backup not created';
    status.innerHTML = `<div><span>Current Admin System</span><strong>${newAdminArchitectureEnabled() ? 'New Admin System' : 'Legacy System'}</strong></div>
      <div><span>New Admin System</span><strong>${readiness}</strong></div>
      <div class="admin-panel-actions">
        ${newAdminArchitectureEnabled() ? '<button class="admin-button admin-button-warning" type="button" data-disable-admin-architecture>Return to Legacy System</button>' : `<button class="admin-button admin-button-primary" type="button" data-activate-admin-locally ${migrationReady ? '' : 'disabled'}>Activate New Admin Locally</button>`}
        <a class="admin-button admin-button-secondary" href="#recovery-advanced">View Migration Details</a>
      </div>`;
  }
}

function renderAdminRecoveryTools() {
  const container = document.getElementById('adminArchitectureRecovery');
  if (!container) return;
  const architecture = adminArchitectureState;
  const migration = adminLiveSettings?.adminArchitectureMigrationV2?.productPageOverrides;
  const conflicts = [...(migration?.conflicts || []), ...(migration?.unsupported || [])];
  const verification = adminLiveSettings?.adminArchitectureBackupVerificationV1;
  const prepared = adminLiveSettings?.adminArchitectureMigrationV2;
  container.innerHTML = `
    <h3>Migration Safety</h3>
    <p>These actions are deliberately separate. Creating a backup does not prepare migration data. Preparing migration data does not activate the new system. Activation does not publish.</p>
    <div class="admin-migration-steps">
      <div><strong>1. Recovery backup</strong><span>${verification?.verified ? `Verified · ${verification.siteEditRowCount} page records · ${escapeAdminHtml(String(verification.checksum || '').slice(0, 12))}…` : 'Not created or not verified'}</span></div>
      <div><strong>2. Migration preparation</strong><span>${prepared?.version === 1 ? `Prepared · ${escapeAdminHtml(prepared.status || 'ready')}` : 'Not prepared'}</span></div>
      <div><strong>3. Local activation</strong><span>${newAdminArchitectureEnabled() ? 'Active locally' : 'Not active'}</span></div>
    </div>
    <div class="admin-panel-actions">
      <button type="button" data-create-migration-backup>Create and Verify Recovery Backup</button>
      <button type="button" data-prepare-admin-migration ${verification?.verified ? '' : 'disabled'}>Prepare New Admin Data</button>
      ${newAdminArchitectureEnabled() ? '<button type="button" data-disable-admin-architecture>Roll Back to Old Readers</button>' : ''}
      <button type="button" data-export-private-state>Export Current Private State</button>
      <button type="button" data-export-published-state>Export Published Snapshot</button>
      <button type="button" data-export-migration-backup>Export Migration Backup</button>
      <button type="button" data-restore-migration-backup>Restore Migration Backup</button>
      <button type="button" data-clear-local-recovery>Clear Local Recovery Data</button>
    </div>
    <details><summary>Conflicting page overrides (${conflicts.length})</summary><pre>${escapeAdminHtml(JSON.stringify(conflicts, null, 2))}</pre></details>
    <details><summary>Failed saves</summary><p>${escapeAdminHtml(adminLastSaveError || 'None')}</p></details>
  `;
  if (container.dataset.recoveryBound) return;
  container.dataset.recoveryBound = 'true';
  container.addEventListener('click', async (event) => {
    const target = event.target;
    try {
      if (target.closest('[data-create-migration-backup]')) {
        if (!window.confirm('Create and verify a recovery backup of the current private Admin data? This does not prepare migration data or activate the new system.')) return;
        setStatus('Creating and verifying the recovery backup…');
        const result = await createAndVerifyAdminArchitectureBackup();
        setStatus(`Recovery backup verified. ${result.siteEditRowCount} page records were captured.`);
        setupAdminArchitectureWorkspace();
      }
      if (target.closest('[data-prepare-admin-migration]')) {
        if (!window.confirm('Prepare the normalized private Admin data from the verified backup? This does not activate or publish anything.')) return;
        setStatus('Verifying the backup again and preparing private Admin data…');
        const result = await prepareAdminArchitectureMigrationExplicitly();
        setStatus(`Private Admin data prepared. Status: ${result.status}. The new system remains disabled.`);
        setupAdminArchitectureWorkspace();
        renderAdminProducts();
      }
      if (target.closest('[data-disable-admin-architecture]')) await setAdminArchitectureEnabled(false);
      if (target.closest('[data-export-private-state]')) downloadAdminJson('mvplux-private-admin-state.json', { adminGlobal: adminLiveSettings, siteEdits: adminSiteEditRows });
      if (target.closest('[data-export-published-state]')) downloadAdminJson('mvplux-published-snapshot.json', adminPublishedBaseline || {});
      if (target.closest('[data-export-migration-backup]')) {
        const architectureModule = await adminArchitecturePromise;
        downloadAdminJson('mvplux-admin-migration-backup-v1.json', adminLiveSettings?.[architectureModule.ADMIN_ARCHITECTURE_BACKUP_KEY] || {});
      }
      if (target.closest('[data-restore-migration-backup]')) await restoreAdminArchitectureBackup();
      if (target.closest('[data-clear-local-recovery]')) {
        if (!window.confirm('Clear only local Admin recovery copies from this browser? Supabase records and physical images are not changed.')) return;
        ['mvpluxAdminProducts', 'mvpluxAdminCustomProducts', 'mvpluxInlineAdminDraftV2', 'mvpluxAdminArchivedProducts', 'mvpluxDeletedProducts', 'mvpluxAdminImageDraftEdits'].forEach((key) => localStorage.removeItem(key));
        setStatus('Local recovery copies cleared. Supabase data was not changed.');
      }
    } catch (error) { setStatus(`Recovery action stopped. ${error?.message || error}`); }
  });
}

function showAdminAreaFromHash() {
  const requested = (window.location.hash || '#dashboard').slice(1);
  const aliases = { create: 'create-content', 'image-imports': 'new-image-drafts', products: 'approved-products', categories: 'category-display-cards', publish: 'publish-changes', settings: 'admin-settings', recovery: 'recovery-advanced' };
  const candidate = requested.startsWith('product-') ? 'recovery-advanced' : aliases[requested] || requested;
  const validAreas = new Set([...document.querySelectorAll('[data-admin-area]')].map((section) => section.dataset.adminArea));
  const area = validAreas.has(candidate) ? candidate : 'dashboard';
  document.querySelectorAll('[data-admin-area]').forEach((section) => { section.hidden = section.dataset.adminArea !== area; });
  document.querySelectorAll('.admin-workspace-nav a').forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${area}`));
  const nav = document.getElementById('adminWorkspaceNav');
  const toggle = document.getElementById('adminNavToggle');
  nav?.classList.remove('open');
  toggle?.setAttribute('aria-expanded', 'false');
  if (!adminAccessReady) return;
  if (area === 'orders' && !adminCommerceLoaded) void refreshCommerceAdmin();
  if (area === 'admin-settings') {
    if (!adminTestModeLoaded) void loadAdminTestMode();
    if (!adminDiscountCodesLoaded) void loadDiscountCodes();
  }
}

function setupCommerceTabs() {
  const tabs = document.querySelector('.admin-commerce-tabs');
  if (!tabs || tabs.dataset.bound) return;
  tabs.dataset.bound = 'true';
  tabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-commerce-tab]');
    if (!button) return;
    tabs.querySelectorAll('[data-commerce-tab]').forEach((item) => item.classList.toggle('active', item === button));
    document.querySelectorAll('[data-commerce-panel]').forEach((panel) => { panel.hidden = panel.dataset.commercePanel !== button.dataset.commerceTab; });
  });
}

function bindAdminWorkspaceNavigation() {
  const nav = document.getElementById('adminWorkspaceNav');
  const toggle = document.getElementById('adminNavToggle');
  if (toggle && !toggle.dataset.bound) {
    toggle.dataset.bound = 'true';
    toggle.addEventListener('click', () => {
      const open = nav?.classList.toggle('open') === true;
      toggle.setAttribute('aria-expanded', String(open));
    });
  }
  if (!document.body.dataset.adminWorkspaceBound) {
    document.body.dataset.adminWorkspaceBound = 'true';
    window.addEventListener('hashchange', showAdminAreaFromHash);
    document.addEventListener('click', async (event) => {
      const activate = event.target.closest('[data-activate-admin-locally]');
      if (activate) {
        if (!window.confirm('Activate the New Admin System for your private Admin workspace? Customers will continue seeing the published website.')) return;
        activate.disabled = true;
        try {
          const saved = await setAdminArchitectureEnabled(true);
          if (!saved) activate.disabled = false;
        } catch (error) {
          activate.disabled = false;
          setStatus(`Activation blocked. ${error?.message || error}`);
        }
      }
      const disable = event.target.closest('#adminArchitectureStatus [data-disable-admin-architecture]');
      if (disable) await setAdminArchitectureEnabled(false);
    });
  }
  const recovery = document.getElementById('legacyRecoveryEditor');
  if (recovery && !recovery.dataset.bound) {
    recovery.dataset.bound = 'true';
    recovery.addEventListener('toggle', () => renderAdminProducts());
  }
}

function setupAdminArchitectureWorkspace() {
  const nav = document.querySelector('.admin-workspace-nav');
  if (nav) nav.hidden = false;
  bindAdminWorkspaceNavigation();
  setupCommerceTabs();
  renderAdminDashboard();
  renderAdminRecoveryTools();
  showAdminAreaFromHash();
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[ADMIN] DOMContentLoaded');
  try {
    clearLegacyAdminBrowserStorage();
  await loadImageDraftInventory();
  const hasAdminAccess = await requireSupabaseAdminAccess();
  setupAdminTestMode();
  adminAccessReady = hasAdminAccess;
  const loadedAdminState = hasAdminAccess ? await loadAdminLiveSettings().catch(() => null) : null;
  imageImportReady = Boolean(hasAdminAccess && loadedAdminState);
  renderImageDrafts();
  await loadPublishedPublishBaseline();
  if (hasAdminAccess && loadedAdminState) {
    adminArchitectureState = await buildAdminArchitectureState(adminLiveSettings);
    renderAdminDiagnostics();
  }
  renderImageImportPending();
  renderAdminProducts();
  bindAdminAiAssistance();
  setupAdminCreationWorkspace();
  setupAdminArchitectureWorkspace();
  setupPriceRules();
  renderExtraImages();
  renderPublishSummary();
  renderPublishHistory();
  if (window.location.hash.startsWith('#product-')) {
    document.querySelector(window.location.hash)?.scrollIntoView({ block: 'start' });
  }
  setupCoupons();
  document.addEventListener('click', handleCommerceAdminClick);

  if (window.location.hash === '#create-card') {
    createCustomProduct();
    history.replaceState(null, '', 'admin.html');
  }

  document.getElementById('resetAdminProducts')?.addEventListener('click', async () => {
    if (!await saveAdminSettingsLive({ products: {}, customProducts: [], savedForLaterProducts: [] })) return;
    localStorage.removeItem('mvpluxAdminProducts');
    localStorage.removeItem('mvpluxAdminCustomProducts');
    localStorage.removeItem('mvpluxAdminArchivedProducts');
    renderAdminProducts();
    setStatus('Product card saves cleared live.');
  });

  document.getElementById('createAdminProduct')?.addEventListener('click', createCustomProduct);
  document.getElementById('refreshImageDrafts')?.addEventListener('click', loadImageDraftInventory);
  document.getElementById('saveSelectedImageDrafts')?.addEventListener('click', saveSelectedImageImportsForLater);
  document.getElementById('publishSelectedImageDrafts')?.addEventListener('click', () => publishImageImports('selected'));
  document.getElementById('publishAllImageDrafts')?.addEventListener('click', () => publishImageImports('all'));
  document.getElementById('refreshPublishSummary')?.addEventListener('click', renderPublishSummary);
  document.getElementById('adminPublishImagePaths')?.addEventListener('input', () => {
    imageImportPublishSelection = null;
    renderPublishSummary();
  });
  document.getElementById('publishAdminChanges')?.addEventListener('click', publishAdminChanges);
  document.getElementById('refreshPublishHistory')?.addEventListener('click', refreshPublishHistory);

  document.getElementById('enableAdminAnywhere')?.addEventListener('click', () => {
    localStorage.setItem('mvpluxAdminAnywhere', 'true');
    setStatus('Page editing is on. Opening the website now.');
    window.location.href = 'index.html#shop';
  });

  document.getElementById('disableAdminAnywhere')?.addEventListener('click', () => {
    localStorage.removeItem('mvpluxAdminSignedIn');
    localStorage.setItem('mvpluxAdminAnywhere', 'false');
    setStatus('Page editing is off.');
  });

  document.getElementById('resetExtraImages')?.addEventListener('click', async () => {
    if (!await writeExtraImages({})) return;
    renderExtraImages();
    setStatus('Extra image saves cleared live.');
  });

  document.getElementById('refreshCommerceAdmin')?.addEventListener('click', refreshCommerceAdmin);
  document.getElementById('checkCommerceConnection')?.addEventListener('click', refreshCommerceAdmin);
  document.getElementById('deleteAllTestOffers')?.addEventListener('click', deleteAllTestOffers);

  document.getElementById('exportAdminChanges')?.addEventListener('click', downloadAdminChanges);
  document.getElementById('copyAdminChanges')?.addEventListener('click', copyAdminChanges);
  document.getElementById('importAdminChanges')?.addEventListener('click', () => {
    document.getElementById('importAdminChangesFile')?.click();
  });
  document.getElementById('importAdminChangesFile')?.addEventListener('change', (event) => {
    importAdminChangesFromFile(event.target.files?.[0]);
    event.target.value = '';
  });
    renderAdminExportPreview();
  } catch (error) {
    logAdminInitializationException('DOMContentLoaded', error);
    throw error;
  }
});
