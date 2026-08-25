import {
  ADMIN_ARCHITECTURE_BACKUP_KEY,
  ADMIN_ARCHITECTURE_LOCK_KEY,
  ADMIN_ARCHITECTURE_ROLLBACK_COMMIT,
  ADMIN_ARCHITECTURE_SCHEMA_VERSION,
  architectureDiagnostics,
  architectureFeature,
  buildVerifiedMigrationBackup,
  buildMigrationBackup,
  buildMainCollectionMigrationDrafts,
  buildNormalizedAdminCandidate,
  isMigratedProductPageKey,
  mergeProductSources,
  migrationLockActive,
  normalizeCategories,
  resolveProductDisplaySettings,
  verifyMigrationBackup,
  prepareAdminArchitectureMigration,
  scanProductOwnedPageOverrides
} from '../admin-architecture.js';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

Deno.test('new architecture stays disabled until explicitly enabled', () => {
  assert(architectureFeature({}).enabled === false, 'missing flag must preserve old readers');
  assert(architectureFeature({ adminArchitectureV2: { enabled: true } }).enabled === true, 'explicit flag should enable new readers');
});

Deno.test('migration backup is complete, recovery-only, and non-recursive', () => {
  const input = {
    products: { alpha: { title: 'Alpha' } },
    customProducts: [{ slug: 'custom' }],
    imageDrafts: { 'images/new.png': { status: 'draft' } },
    extraImages: { hero: 'images/hero.png' },
    savedForLaterProducts: ['alpha'],
    deletedProducts: ['old'],
    ignoredImagePaths: ['images/ignore.png'],
    lastPublishedSnapshot: { version: 1 },
    [ADMIN_ARCHITECTURE_BACKUP_KEY]: { old: true }
  };
  const backup = buildMigrationBackup({
    capturedAt: '2026-07-20T12:00:00.000Z',
    adminGlobal: input,
    siteEditRows: [{ page_key: 'index.html', revision: 4, edits: { title: { text: 'Home' } } }],
    publishedSettings: { publishedAt: 'now', snapshot: { products: {} } },
    fallbackCatalog: [{ slug: 'fallback' }],
    categoryCardDefaults: [{ slug: 'sports-card' }]
  });
  assert(backup.recoveryOnly === true, 'backup must be marked recovery-only');
  assert(backup.checkpointCommit === ADMIN_ARCHITECTURE_ROLLBACK_COMMIT, 'rollback commit must be recorded');
  assert(!backup.adminGlobal[ADMIN_ARCHITECTURE_BACKUP_KEY], 'backup must not recursively contain itself');
  assert(backup.adminGlobal.products.alpha.title === 'Alpha', 'Admin products must be preserved');
  assert(backup.siteEdits[0].revision === 4, 'page rows and revisions must be preserved');
  assert(backup.publishedAdminSettings.publishedAt === 'now', 'published settings must be preserved');
  assert(backup.productCatalogFallback[0].slug === 'fallback', 'fallback catalog must be preserved');
});

async function verifiedBackupFixture() {
  const adminGlobal = {
    products: { alpha: { slug: 'alpha', title: 'Alpha' } },
    customProducts: [{ slug: 'custom', title: 'Custom' }],
    categories: { sports: { key: 'sports', title: 'Sports' } },
    imageDrafts: { 'images/new.png': { imagePath: 'images/new.png', status: 'draft' } },
    extraImages: { gallery: 'images/gallery.png' },
    lastPublishedSnapshot: { schemaVersion: 1 }
  };
  const rows = [
    { page_key: 'admin-global', revision: 9, edits: adminGlobal },
    { page_key: 'index.html', revision: 3, edits: { heading: { text: 'Home' } } }
  ];
  const publishedSettings = { publishedAt: '2026-07-20T12:00:00.000Z', snapshot: { products: { alpha: { title: 'Published Alpha' } } } };
  const fallbackCatalog = [{ slug: 'alpha', title: 'Fallback Alpha' }];
  const categoryCardDefaults = [{ slug: 'sports-card', title: 'Sports' }];
  const backup = await buildVerifiedMigrationBackup({
    capturedAt: '2026-07-21T12:00:00.000Z', sourceRevision: 9, adminGlobal,
    siteEditRows: rows, publishedSettings, fallbackCatalog, categoryCardDefaults
  });
  return { adminGlobal, rows, publishedSettings, fallbackCatalog, categoryCardDefaults, backup };
}

Deno.test('verified migration backup round-trips every source row and collection', async () => {
  const fixture = await verifiedBackupFixture();
  const savedGlobal = { ...fixture.adminGlobal, [ADMIN_ARCHITECTURE_BACKUP_KEY]: fixture.backup };
  const savedRows = fixture.rows.map((row) => row.page_key === 'admin-global' ? { ...row, revision: 10, edits: savedGlobal } : row);
  const result = await verifyMigrationBackup({
    backup: fixture.backup,
    currentAdminGlobal: savedGlobal,
    currentSiteEditRows: savedRows,
    publishedSettings: fixture.publishedSettings,
    fallbackCatalog: fixture.fallbackCatalog,
    categoryCardDefaults: fixture.categoryCardDefaults
  });
  assert(result.ok, `complete backup should verify: ${result.errors.join(' ')}`);
  assert(result.siteEditRowCount === 2, 'every site_edits row must be counted');
  assert(result.siteEditIdentifiers.join(',') === 'admin-global,index.html', 'row identifiers must be deterministic');
  assert(fixture.backup.verification.adminGlobalCaptured === true, 'admin-global must be recorded in the manifest');
  assert(fixture.backup.verification.productCount === 1, 'product count must be recorded');
  assert(fixture.backup.verification.customProductCount === 1, 'custom product count must be recorded');
  assert(fixture.backup.verification.categoryCount === 1, 'category count must be recorded');
  assert(fixture.backup.verification.imageDraftCount === 1, 'image draft count must be recorded');
});

Deno.test('checksum mismatch and source changes both block migration readiness', async () => {
  const fixture = await verifiedBackupFixture();
  const tampered = structuredClone(fixture.backup);
  tampered.adminGlobal.products.alpha.title = 'Tampered';
  const checksumResult = await verifyMigrationBackup({
    backup: tampered, currentAdminGlobal: fixture.adminGlobal, currentSiteEditRows: fixture.rows,
    publishedSettings: fixture.publishedSettings, fallbackCatalog: fixture.fallbackCatalog,
    categoryCardDefaults: fixture.categoryCardDefaults
  });
  assert(!checksumResult.ok && checksumResult.errors.some((error) => error.includes('checksum')), 'tampered backup must fail checksum verification');

  const changedGlobal = structuredClone(fixture.adminGlobal);
  changedGlobal.products.alpha.title = 'Changed after backup';
  const sourceResult = await verifyMigrationBackup({
    backup: fixture.backup, currentAdminGlobal: changedGlobal,
    currentSiteEditRows: fixture.rows.map((row) => row.page_key === 'admin-global' ? { ...row, edits: changedGlobal } : row),
    publishedSettings: fixture.publishedSettings, fallbackCatalog: fixture.fallbackCatalog,
    categoryCardDefaults: fixture.categoryCardDefaults
  });
  assert(!sourceResult.ok && sourceResult.errors.some((error) => error.includes('changed after')), 'newer source data must invalidate the backup');
});

Deno.test('backup without a published snapshot is never migration-ready', async () => {
  const backup = await buildVerifiedMigrationBackup({
    adminGlobal: { products: {} },
    siteEditRows: [{ page_key: 'admin-global', revision: 1, edits: { products: {} } }],
    publishedSettings: {}
  });
  const result = await verifyMigrationBackup({
    backup,
    currentAdminGlobal: { products: {} },
    currentSiteEditRows: [{ page_key: 'admin-global', revision: 1, edits: { products: {} } }],
    publishedSettings: {}
  });
  assert(!result.ok && result.errors.some((error) => error.includes('Published snapshot')), 'missing published data must block migration');
});

Deno.test('migration lock blocks another tab until it expires', () => {
  const active = { owner: 'tab-a', expiresAt: new Date(Date.now() + 60_000).toISOString() };
  const expired = { owner: 'tab-a', expiresAt: new Date(Date.now() - 1_000).toISOString() };
  assert(migrationLockActive(active), 'active lock must block a second tab');
  assert(!migrationLockActive(expired), 'expired lock must permit recovery');
  assert(ADMIN_ARCHITECTURE_LOCK_KEY === 'adminArchitectureMigrationLockV2', 'lock storage key must remain stable');
});

Deno.test('product normalization uses fallback then published then custom then saved precedence', () => {
  const products = mergeProductSources({
    fallbackProducts: [{ slug: 'alpha', title: 'Fallback', description: 'Fallback description', originalHeight: 72 }],
    publishedProducts: { alpha: { title: 'Published' } },
    customProducts: [{ slug: 'alpha', description: 'Custom description', cutoutImage: 'images/custom.png' }],
    savedProducts: { alpha: { title: 'Private', originalHeight: 78 } }
  });
  assert(products.alpha.title === 'Private', 'private product value must win');
  assert(products.alpha.description === 'Custom description', 'custom base must remain when no private override exists');
  assert(products.alpha.cutoutImage === 'images/custom.png', 'custom image must be preserved');
  assert(products.alpha.originalHeight === 78, 'private height must win');
});

Deno.test('category cards normalize into category records without deleting category settings', () => {
  const categories = normalizeCategories({
    categoryDefinitions: [{ key: 'sports', label: 'Sports', page: 'sports-legends.html' }],
    existingCategories: { sports: { displaySettings: { standeeSizePercent: 92 } } },
    categoryCardDefaults: [{ slug: 'sport-legend-standee', title: 'Sports Default', cutoutImage: 'images/default.png' }],
    publishedCategoryCards: { 'sport-legend-standee': { title: 'Sports Published' } },
    savedProductOverrides: { 'sport-legend-standee': { description: 'Private description' } },
    categoryCardMap: { 'sport-legend-standee': 'sports' }
  });
  assert(categories.sports.card.title === 'Sports Published', 'published card value must override hard-coded default');
  assert(categories.sports.card.description === 'Private description', 'private card override must win');
  assert(categories.sports.card.image === 'images/default.png', 'fallback card image must remain');
  assert(categories.sports.displaySettings.standeeSizePercent === 92, 'existing display settings must remain');
});

Deno.test('normalized candidate is diagnostic-only while feature flag is disabled', () => {
  const candidate = buildNormalizedAdminCandidate({
    adminGlobal: { products: { alpha: { title: 'Private' } } },
    fallbackCatalog: [{ slug: 'alpha', title: 'Fallback' }],
    categoryDefinitions: [{ key: 'sports', label: 'Sports' }]
  });
  const diagnostics = architectureDiagnostics({
    settings: { schemaVersion: ADMIN_ARCHITECTURE_SCHEMA_VERSION },
    candidate,
    siteEditRows: [{ page_key: 'index.html', edits: {} }]
  });
  assert(candidate.feature.enabled === false, 'candidate must not activate itself');
  assert(candidate.products.alpha.title === 'Private', 'candidate must expose normalized private product');
  assert(diagnostics.productCount === 1 && diagnostics.categoryCount === 1, 'diagnostic counts should match candidate');
  assert(diagnostics.backupReady === false, 'missing recovery backup must be reported');
});

Deno.test('category card slugs do not remain duplicated as products', () => {
  const candidate = buildNormalizedAdminCandidate({
    adminGlobal: { products: { 'sports-card': { title: 'Private card' } } },
    fallbackCatalog: [{ slug: 'alpha', title: 'Alpha' }],
    categoryCardDefaults: [{ slug: 'sports-card', title: 'Sports' }],
    categoryCardMap: { 'sports-card': 'sports' }
  });
  assert(!candidate.products['sports-card'], 'category card must not remain in products');
  assert(candidate.categories.sports.card.title === 'Private card', 'category card override must migrate to category.card');
});

Deno.test('recognized legacy Homepage Collection Cards become clean private Main Collection drafts', () => {
  const candidate = normalizeCategories({
    categoryDefinitions: [
      { key: 'people-public-figures', label: 'People / Public Figures', page: 'people-public-figures.html' },
      { key: 'custom-other', label: 'Custom / Other', pages: ['custom-photo-cutouts.html', 'small-cutout-party-packs.html'] }
    ],
    categoryCardDefaults: [{
      slug: 'people-public-figure-standee', title: 'Default People', description: 'Default description',
      cutoutImage: 'images/default-people.png', backgroundImage: 'images/default-stage.png'
    }],
    publishedCategoryCards: {
      'people-public-figure-standee': {
        title: 'People & Public Figure Standees', description: 'Published collection description',
        cutoutImage: 'images/published-people.png', backgroundImage: 'images/published-stage.png', visible: true
      }
    },
    categoryCardMap: { 'people-public-figure-standee': 'people-public-figures' }
  });
  const products = { speaker: { slug: 'speaker', categories: ['people-public-figures'], categoryOrder: { 'people-public-figures': 4 } } };
  const productBefore = structuredClone(products);
  const drafts = buildMainCollectionMigrationDrafts({
    candidateCategories: candidate,
    allowedKeys: ['people-public-figures', 'custom-other'],
    migratedAt: '2026-08-25T12:00:00.000Z'
  });
  assert(Object.keys(drafts).join(',') === 'people-public-figures,custom-other', 'one normalized draft must be created per eligible Main Collection key');
  assert(drafts['people-public-figures'].title === 'People & Public Figure Standees', 'the current legacy customer title must become the normalized root title');
  assert(drafts['people-public-figures'].description === 'Published collection description', 'the current legacy customer description must become the normalized root description');
  assert(drafts['people-public-figures'].card.image === 'images/published-people.png' && drafts['people-public-figures'].card.backgroundImage === 'images/published-stage.png', 'the current legacy Homepage Collection Card visuals must be preserved in normalized card fields');
  assert(!('visible' in drafts['people-public-figures'].card) && !('order' in drafts['people-public-figures'].card), 'legacy card visibility and order must not remain competing owners');
  assert(drafts['people-public-figures'].draftStatus === 'draft' && drafts['people-public-figures'].approvalStatus === 'draft', 'migration must create private drafts, never approved/published records');
  assert(drafts['custom-other'].card.image === '', 'Custom / Other must remain intentionally empty when no legitimate Homepage Collection Card image exists');
  assert(JSON.stringify(products) === JSON.stringify(productBefore), 'Main Collection migration must not modify Products or their assignments');
});

Deno.test('Main Collection draft migration is idempotent and skips normalized private or published records', () => {
  const candidates = {
    music: { key: 'music', title: 'Music', card: { image: 'images/music.png' }, displaySettings: {} },
    holiday: { key: 'holiday', title: 'Holiday', card: { image: 'images/holiday.png' }, displaySettings: {} },
    custom: { key: 'custom', title: 'Custom', card: { image: '' }, displaySettings: {} }
  };
  const first = buildMainCollectionMigrationDrafts({
    candidateCategories: candidates,
    privateCategories: { holiday: { key: 'holiday' } },
    publishedCategories: { music: { key: 'music' } },
    allowedKeys: ['music', 'holiday', 'custom'],
    migratedAt: 'now'
  });
  assert(Object.keys(first).join(',') === 'custom', 'existing normalized private and published Main Collections must never be duplicated');
  const second = buildMainCollectionMigrationDrafts({
    candidateCategories: candidates,
    privateCategories: { holiday: { key: 'holiday' }, ...first },
    publishedCategories: { music: { key: 'music' } },
    allowedKeys: ['music', 'holiday', 'custom'],
    migratedAt: 'later'
  });
  assert(Object.keys(second).length === 0, 'running the migration again must create no duplicate records');
});

Deno.test('unambiguous page product values migrate while geometry stays in page rows', () => {
  const candidate = buildNormalizedAdminCandidate({
    fallbackCatalog: [{ slug: 'alpha', title: 'Alpha', cutoutImage: 'images/old.png' }]
  });
  const rows = [{
    page_key: 'sports.html', revision: 3, edits: {
      'product-alpha-title-link': { text: 'New Alpha' },
      'product-alpha-product-cutout': { src: 'images/new.png', x: 12, scale: 1.2 }
    }
  }];
  const prepared = prepareAdminArchitectureMigration({ candidate, siteEditRows: rows, preparedAt: 'now' });
  assert(prepared.products.alpha.title === 'New Alpha', 'unambiguous title should migrate');
  assert(prepared.products.alpha.cutoutImage === 'images/new.png', 'unambiguous main image should migrate');
  assert(rows[0].edits['product-alpha-product-cutout'].x === 12, 'page geometry must remain untouched');
  assert(prepared.migration.productPageOverrides.resolved.length === 2, 'both product fields should be recorded');
});

Deno.test('different page values create review conflicts and are not silently selected', () => {
  const products = { alpha: { slug: 'alpha', title: 'Current' } };
  const rows = [
    { page_key: 'one.html', edits: { 'product-alpha-title-link': { text: 'One' } } },
    { page_key: 'two.html', edits: { 'product-alpha-title-link': { text: 'Two' } } }
  ];
  const scan = scanProductOwnedPageOverrides(rows, products);
  const prepared = prepareAdminArchitectureMigration({ candidate: { products }, siteEditRows: rows });
  assert(scan.conflicts.length === 1, 'different values must create one conflict');
  assert(prepared.products.alpha.title === 'Current', 'conflicting title must remain unchanged');
  assert(prepared.migration.status === 'review-required', 'migration must require review');
  assert(isMigratedProductPageKey({ adminArchitectureMigrationV2: prepared.migration }, 'one.html', 'product-alpha-title-link'), 'conflicting key must remain identifiable for later review');
});

Deno.test('product display override wins over category and global defaults', () => {
  const display = resolveProductDisplaySettings({
    builtIn: { standeeSizePercent: 70, backgroundPosition: 'left top' },
    global: { standeeSizePercent: 75, standeeLeftPercent: 45 },
    category: { displaySettings: { standeeSizePercent: 88, standeeLeftPercent: 52 } },
    product: { displayOverrides: { standeeLeftPercent: 61, imageTransform: { x: 4, scale: 1.2 } } }
  });
  assert(display.standeeSizePercent === 88, 'category default should beat global and built-in values');
  assert(display.standeeLeftPercent === 61, 'product override should beat category value');
  assert(display.imageTransform.x === 4 && display.imageTransform.scale === 1.2, 'product transform should remain normalized');
});
