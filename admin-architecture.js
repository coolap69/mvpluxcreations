export const ADMIN_ARCHITECTURE_SCHEMA_VERSION = 2;
export const ADMIN_ARCHITECTURE_BACKUP_KEY = 'adminPublishingMigrationBackupV1';
export const ADMIN_ARCHITECTURE_FEATURE_KEY = 'adminArchitectureV2';
export const ADMIN_ARCHITECTURE_MIGRATION_KEY = 'adminArchitectureMigrationV2';
export const ADMIN_ARCHITECTURE_LOCK_KEY = 'adminArchitectureMigrationLockV2';
export const ADMIN_ARCHITECTURE_VERIFICATION_KEY = 'adminArchitectureBackupVerificationV1';
export const ADMIN_ARCHITECTURE_ROLLBACK_COMMIT = 'df63f6c042dce5e93bae7fb90e6ed53f060f63fa';

const PRODUCT_FIELDS = [
  'slug',
  'title',
  'description',
  'funFact',
  'originalHeight',
  'priceOverride',
  'cutoutImage',
  'backgroundImage',
  'imageChoices',
  'categories',
  'visible',
  'categoryOrder',
  'productOrder',
  'displayOverrides',
  'createdAt',
  'updatedAt',
  'draftStatus',
  'approvalStatus'
];

const DISPLAY_FIELDS = [
  'backgroundImage',
  'backgroundPosition',
  'backgroundSizePercent',
  'standeeSizePercent',
  'standeeLeftPercent',
  'standeeVerticalPercent',
  'titleLeftPercent',
  'titleVerticalPercent',
  'titleAlign',
  'titleSizePercent',
  'descriptionLeftPercent',
  'descriptionVerticalPercent',
  'descriptionAlign',
  'descriptionSizePercent',
  'logoSizePercent',
  'logoVerticalPercent'
];

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]).filter(([, item]) => item !== undefined));
  }
  return value;
}

export function deterministicJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export async function sha256Digest(value) {
  const bytes = new TextEncoder().encode(deterministicJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function adminArchitectureSource(settings = {}) {
  const source = clone(asObject(settings));
  [ADMIN_ARCHITECTURE_BACKUP_KEY, ADMIN_ARCHITECTURE_FEATURE_KEY, ADMIN_ARCHITECTURE_MIGRATION_KEY, ADMIN_ARCHITECTURE_LOCK_KEY, ADMIN_ARCHITECTURE_VERIFICATION_KEY, 'schemaVersion']
    .forEach((key) => delete source[key]);
  return source;
}

function normalizedBackupRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    page_key: String(row?.page_key || ''),
    revision: row?.page_key === 'admin-global' ? 0 : Number(row?.revision) || 0,
    edits: row?.page_key === 'admin-global' ? adminArchitectureSource(row?.edits) : clone(asObject(row?.edits))
  })).filter((row) => row.page_key).sort((left, right) => left.page_key.localeCompare(right.page_key));
}

export async function buildVerifiedMigrationBackup(options = {}) {
  const backup = buildMigrationBackup(options);
  const rows = normalizedBackupRows(backup.siteEdits);
  const source = {
    adminGlobal: adminArchitectureSource(backup.adminGlobal),
    siteEdits: rows,
    publishedAdminSettings: backup.publishedAdminSettings,
    productCatalogFallback: backup.productCatalogFallback,
    categoryDisplayCardDefaults: backup.categoryDisplayCardDefaults
  };
  const manifest = {
    algorithm: 'SHA-256',
    sourceRevision: Number(options.sourceRevision) || 0,
    sourceDigest: await sha256Digest(source),
    siteEditRowCount: rows.length,
    siteEditIdentifiers: rows.map((row) => row.page_key),
    adminGlobalCaptured: rows.some((row) => row.page_key === 'admin-global'),
    productCount: Object.keys(asObject(backup.adminGlobal?.products)).length,
    customProductCount: Array.isArray(backup.adminGlobal?.customProducts) ? backup.adminGlobal.customProducts.length : 0,
    categoryCount: Object.keys(asObject(backup.adminGlobal?.categories)).length,
    imageDraftCount: Object.keys(asObject(backup.adminGlobal?.imageDrafts)).length,
    publishedSnapshotCaptured: Boolean(
      backup.publishedAdminSettings
      && typeof backup.publishedAdminSettings === 'object'
      && Object.keys(backup.publishedAdminSettings).length
    )
  };
  const checksum = await sha256Digest({ ...backup, verification: manifest });
  return { ...backup, verification: { ...manifest, checksum } };
}

export async function verifyMigrationBackup({ backup, currentAdminGlobal = {}, currentSiteEditRows = [], publishedSettings = {}, fallbackCatalog = [], categoryCardDefaults = [] } = {}) {
  const errors = [];
  if (!backup?.recoveryOnly || backup?.backupVersion !== 1) errors.push('Recovery backup format is invalid.');
  if (!backup?.verification?.checksum || backup.verification.algorithm !== 'SHA-256') errors.push('Backup checksum is missing.');
  if (!backup?.adminGlobal || !Array.isArray(backup?.siteEdits)) errors.push('Backup content is incomplete.');
  if (backup?.verification?.publishedSnapshotCaptured !== true) errors.push('Published snapshot data is missing from the backup.');
  const storedRows = normalizedBackupRows(backup?.siteEdits);
  const currentRows = normalizedBackupRows(currentSiteEditRows);
  const storedIdentifiers = storedRows.map((row) => row.page_key);
  const currentIdentifiers = currentRows.map((row) => row.page_key);
  if (storedRows.length !== currentRows.length) errors.push('The number of saved page records does not match the current source.');
  if (deterministicJson(storedIdentifiers) !== deterministicJson(currentIdentifiers)) errors.push('One or more page record identifiers are missing from the backup.');
  if (currentIdentifiers.includes('admin-global') && !storedIdentifiers.includes('admin-global')) errors.push('The main Admin record is missing from the backup.');
  const expectedChecksum = backup?.verification ? await sha256Digest({ ...backup, verification: { ...backup.verification, checksum: undefined } }) : '';
  if (backup?.verification?.checksum && expectedChecksum !== backup.verification.checksum) errors.push('Backup checksum verification failed.');
  const currentSource = {
    adminGlobal: adminArchitectureSource(currentAdminGlobal),
    siteEdits: currentRows,
    publishedAdminSettings: clone(asObject(publishedSettings)),
    productCatalogFallback: clone(Array.isArray(fallbackCatalog) ? fallbackCatalog : []),
    categoryDisplayCardDefaults: clone(Array.isArray(categoryCardDefaults) ? categoryCardDefaults : [])
  };
  const sourceDigest = await sha256Digest(currentSource);
  if (backup?.verification?.sourceDigest && sourceDigest !== backup.verification.sourceDigest) errors.push('Private Admin data changed after the backup was created.');
  for (const key of ['products', 'customProducts', 'categories', 'imageDrafts']) {
    if (deterministicJson(adminArchitectureSource(backup?.adminGlobal)[key]) !== deterministicJson(adminArchitectureSource(currentAdminGlobal)[key])) errors.push(`${key} does not match the backup.`);
  }
  if (deterministicJson(backup?.publishedAdminSettings) !== deterministicJson(publishedSettings)) errors.push('Published snapshot data does not match the backup.');
  return {
    ok: errors.length === 0,
    errors,
    sourceDigest,
    siteEditRowCount: currentRows.length,
    siteEditIdentifiers: currentIdentifiers,
    checksum: backup?.verification?.checksum || ''
  };
}

export function migrationLockActive(lock = {}, now = Date.now()) {
  return Boolean(lock?.owner && Number(new Date(lock.expiresAt)) > now);
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizeImageChoices(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).flatMap((choice) => {
    const image = String(choice?.image || '').trim();
    const stage = String(choice?.stage || '').trim();
    const identity = `${image}\u0000${stage}`;
    if (!image || seen.has(identity)) return [];
    seen.add(identity);
    return [{
      label: String(choice?.label || '').trim() || 'Alternate image',
      image,
      ...(stage ? { stage } : {}),
      ...(choice?.role ? { role: String(choice.role) } : {})
    }];
  });
}

export function architectureFeature(settings = {}) {
  const value = asObject(settings?.[ADMIN_ARCHITECTURE_FEATURE_KEY]);
  return {
    enabled: value.enabled === true,
    rollbackCommit: String(value.rollbackCommit || ADMIN_ARCHITECTURE_ROLLBACK_COMMIT),
    installedAt: value.installedAt || null
  };
}

export function normalizeDisplaySettings(value = {}) {
  const source = asObject(value);
  const normalized = {
    backgroundPosition: String(source.backgroundPosition || 'center center')
  };
  DISPLAY_FIELDS.forEach((field) => {
    if (field === 'backgroundPosition' || source[field] === undefined || source[field] === '') return;
    normalized[field] = ['backgroundImage', 'titleAlign', 'descriptionAlign'].includes(field) ? String(source[field]) : Number(source[field]);
  });
  const transform = asObject(source.imageTransform);
  if (Object.keys(transform).length) {
    normalized.imageTransform = {
      x: Number.isFinite(Number(transform.x)) ? Number(transform.x) : 0,
      y: Number.isFinite(Number(transform.y)) ? Number(transform.y) : 0,
      scale: Number.isFinite(Number(transform.scale)) ? Number(transform.scale) : 1,
      rotate: Number.isFinite(Number(transform.rotate)) ? Number(transform.rotate) : 0
    };
  }
  return normalized;
}

export function resolveProductDisplaySettings({ product = {}, category = {}, global = {}, builtIn = {} } = {}) {
  const inherited = {
    ...normalizeDisplaySettings(builtIn),
    ...normalizeDisplaySettings(global),
    ...normalizeDisplaySettings(category?.displaySettings || category),
    ...normalizeDisplaySettings(product?.displayOverrides || product)
  };
  const transform = asObject(product?.displayOverrides?.imageTransform);
  if (Object.keys(transform).length) inherited.imageTransform = normalizeDisplaySettings({ imageTransform: transform }).imageTransform;
  return inherited;
}

export function normalizeProductRecord(value = {}, slug = '') {
  const source = asObject(value);
  const productSlug = String(source.slug || slug || '').trim();
  const normalized = {};
  PRODUCT_FIELDS.forEach((field) => {
    if (source[field] !== undefined) normalized[field] = clone(source[field]);
  });
  normalized.slug = productSlug;
  normalized.title = String(source.title || productSlug || 'Untitled product');
  normalized.description = String(source.description || '');
  normalized.funFact = String(source.funFact || '');
  normalized.originalHeight = source.originalHeight ?? '';
  if (source.priceOverride !== undefined && source.priceOverride !== '') {
    const price = Number(source.priceOverride);
    if (Number.isFinite(price) && price >= 0) normalized.priceOverride = price;
    else delete normalized.priceOverride;
  } else {
    delete normalized.priceOverride;
  }
  normalized.cutoutImage = String(source.cutoutImage || '');
  normalized.backgroundImage = String(source.backgroundImage || '');
  normalized.imageChoices = normalizeImageChoices(source.imageChoices);
  normalized.categories = uniqueStrings(source.categories);
  normalized.visible = source.visible !== false;
  normalized.categoryOrder = asObject(source.categoryOrder);
  normalized.displayOverrides = normalizeDisplaySettings(source.displayOverrides || {});
  normalized.draftStatus = String(source.draftStatus || 'approved');
  normalized.approvalStatus = String(source.approvalStatus || 'approved');
  return normalized;
}

export function mergeProductSources({ fallbackProducts = [], publishedProducts = {}, customProducts = [], savedProducts = {} } = {}) {
  const merged = {};
  const merge = (slug, value) => {
    if (!slug) return;
    merged[slug] = { ...(merged[slug] || {}), ...clone(asObject(value)), slug };
  };
  (Array.isArray(fallbackProducts) ? fallbackProducts : []).forEach((product) => merge(product?.slug, product));
  Object.entries(asObject(publishedProducts)).forEach(([slug, product]) => merge(slug, product));
  (Array.isArray(customProducts) ? customProducts : []).forEach((product) => merge(product?.slug, product));
  Object.entries(asObject(savedProducts)).forEach(([slug, product]) => merge(slug, product));
  return Object.fromEntries(Object.entries(merged).map(([slug, product]) => [slug, normalizeProductRecord(product, slug)]));
}

function normalizeCategoryCard(value = {}) {
  const source = asObject(value);
  return {
    title: String(source.title || ''),
    description: String(source.description || ''),
    image: String(source.image || source.cutoutImage || ''),
    backgroundImage: String(source.backgroundImage || ''),
    visible: source.visible !== false,
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : 0
  };
}

export function normalizeCategories({ categoryDefinitions = [], existingCategories = {}, categoryCardDefaults = [], publishedCategoryCards = {}, savedProductOverrides = {}, categoryCardMap = {}, deletedCategories = [] } = {}) {
  const categories = {};
  const deleted = new Set(Array.isArray(deletedCategories) ? deletedCategories : []);
  (Array.isArray(categoryDefinitions) ? categoryDefinitions : []).forEach((definition, index) => {
    const key = String(definition?.key || '').trim();
    if (!key || deleted.has(key)) return;
    categories[key] = {
      key,
      parentKey: String(definition.parentKey || ''),
      title: String(definition.label || key),
      description: '',
      page: String(definition.page || definition.pages?.[0] || ''),
      visible: definition.visible !== false,
      homepageVisible: definition.homepageVisible !== false,
      order: index,
      card: normalizeCategoryCard({}),
      displaySettings: normalizeDisplaySettings({}),
      draftStatus: 'approved',
      approvalStatus: 'approved'
    };
  });

  (Array.isArray(categoryCardDefaults) ? categoryCardDefaults : []).forEach((card, index) => {
    const key = String(categoryCardMap[card?.slug] || card?.categoryKey || card?.slug || '').trim();
    if (!key || deleted.has(key)) return;
    const existing = categories[key] || {
      key, title: String(card.title || key), description: '', page: '', visible: true, order: index,
      card: normalizeCategoryCard({}), displaySettings: normalizeDisplaySettings({}),
      draftStatus: 'approved', approvalStatus: 'approved'
    };
    const published = asObject(publishedCategoryCards)[card.slug] || {};
    const saved = asObject(savedProductOverrides)[card.slug] || {};
    const compatibilityCard = { ...card, ...published, ...saved };
    categories[key] = {
      ...existing,
      title: String(compatibilityCard.title || existing.title || key),
      page: String(existing.page || card.page || ''),
      homepageVisible: existing.homepageVisible !== false,
      card: normalizeCategoryCard({ ...compatibilityCard, order: existing.card?.order ?? index })
    };
  });

  Object.entries(asObject(existingCategories)).forEach(([key, value]) => {
    if (deleted.has(key)) return;
    const current = categories[key] || { key, card: {}, displaySettings: {} };
    const source = asObject(value);
    categories[key] = {
      ...current,
      ...clone(source),
      key,
      parentKey: String(source.parentKey || current.parentKey || ''),
      title: String(source.title || current.title || key),
      description: String(source.description || current.description || ''),
      funFact: String(source.funFact || current.funFact || ''),
      page: String(source.page || current.page || ''),
      visible: source.visible !== false,
      homepageVisible: source.homepageVisible !== false,
      order: Number.isFinite(Number(source.order)) ? Number(source.order) : Number(current.order || 0),
      card: normalizeCategoryCard({ ...current.card, ...asObject(source.card) }),
      displaySettings: normalizeDisplaySettings({ ...current.displaySettings, ...asObject(source.displaySettings) })
    };
  });
  return categories;
}

export function buildMigrationBackup({ checkpointCommit = ADMIN_ARCHITECTURE_ROLLBACK_COMMIT, capturedAt = new Date().toISOString(), adminGlobal = {}, siteEditRows = [], publishedSettings = {}, fallbackCatalog = [], categoryCardDefaults = [] } = {}) {
  const safeGlobal = clone(asObject(adminGlobal));
  delete safeGlobal[ADMIN_ARCHITECTURE_BACKUP_KEY];
  return {
    backupVersion: 1,
    recoveryOnly: true,
    capturedAt,
    checkpointCommit,
    adminGlobal: safeGlobal,
    siteEdits: clone(Array.isArray(siteEditRows) ? siteEditRows : []),
    publishedAdminSettings: clone(asObject(publishedSettings)),
    productCatalogFallback: clone(Array.isArray(fallbackCatalog) ? fallbackCatalog : []),
    categoryDisplayCardDefaults: clone(Array.isArray(categoryCardDefaults) ? categoryCardDefaults : [])
  };
}

export function buildNormalizedAdminCandidate({ adminGlobal = {}, fallbackCatalog = [], publishedSnapshot = {}, categoryDefinitions = [], categoryCardDefaults = [], categoryCardMap = {} } = {}) {
  const source = asObject(adminGlobal);
  const products = mergeProductSources({
    fallbackProducts: fallbackCatalog,
    publishedProducts: asObject(publishedSnapshot).products,
    customProducts: source.customProducts,
    savedProducts: source.products
  });
  Object.keys(categoryCardMap || {}).forEach((slug) => delete products[slug]);
  return {
    schemaVersion: ADMIN_ARCHITECTURE_SCHEMA_VERSION,
    products,
    categories: normalizeCategories({
      categoryDefinitions,
      existingCategories: source.categories,
      categoryCardDefaults,
      publishedCategoryCards: asObject(publishedSnapshot).categoryDisplayCards,
      savedProductOverrides: source.products,
      categoryCardMap,
      deletedCategories: source.deletedCategories
    }),
    globalDisplaySettings: normalizeDisplaySettings(source.globalDisplaySettings || {}),
    imageDrafts: clone(asObject(source.imageDrafts)),
    deletedCategories: clone(Array.isArray(source.deletedCategories) ? source.deletedCategories : []),
    feature: architectureFeature(source)
  };
}

function pageProductField(key, slug) {
  const prefix = `product-${slug}-`;
  if (key === `${prefix}title-link` || key === `${prefix}title-heading`) return 'title';
  if (key === `${prefix}description`) return 'description';
  if (key === `${prefix}product-cutout`) return 'cutoutImage';
  if (key === `${prefix}product-stage-bg`) return 'backgroundImage';
  if (key === `product-height-${slug}`) return 'originalHeight';
  if (key.startsWith(prefix)) return 'unsupported';
  return '';
}

function pageOverrideValue(field, edit = {}) {
  if (field === 'title' || field === 'description') return edit.text;
  if (field === 'cutoutImage' || field === 'backgroundImage') return edit.src;
  if (field === 'originalHeight') return edit.originalHeight ?? edit.text;
  return undefined;
}

export function scanProductOwnedPageOverrides(siteEditRows = [], products = {}) {
  const productSlugs = Object.keys(asObject(products)).sort((left, right) => right.length - left.length);
  const observations = new Map();
  const unsupported = [];
  const ownedKeys = [];

  (Array.isArray(siteEditRows) ? siteEditRows : []).forEach((row) => {
    if (!row?.page_key || row.page_key === 'admin-global') return;
    Object.entries(asObject(row.edits)).forEach(([key, edit]) => {
      const slug = productSlugs.find((candidate) => pageProductField(key, candidate));
      if (!slug) return;
      const field = pageProductField(key, slug);
      const source = { pageKey: row.page_key, elementKey: key, revision: Number(row.revision) || 0 };
      ownedKeys.push(source);
      if (field === 'unsupported') {
        unsupported.push({ slug, field: null, value: clone(edit), ...source, reason: 'Product-owned page key needs manual field mapping.' });
        return;
      }
      const value = pageOverrideValue(field, asObject(edit));
      if (value === undefined || value === null || value === '') return;
      const identity = `${slug}\u0000${field}`;
      if (!observations.has(identity)) observations.set(identity, { slug, field, values: [] });
      observations.get(identity).values.push({ value: clone(value), ...source });
    });
  });

  const resolved = [];
  const conflicts = [];
  observations.forEach((observation) => {
    const unique = [];
    observation.values.forEach((item) => {
      if (!unique.some((existing) => JSON.stringify(existing.value) === JSON.stringify(item.value))) unique.push(item);
    });
    if (unique.length === 1) {
      resolved.push({ slug: observation.slug, field: observation.field, value: unique[0].value, sources: observation.values });
    } else {
      conflicts.push({ slug: observation.slug, field: observation.field, values: unique, sources: observation.values });
    }
  });
  return { resolved, conflicts, unsupported, ownedKeys };
}

export function prepareAdminArchitectureMigration({ candidate = {}, siteEditRows = [], preparedAt = new Date().toISOString() } = {}) {
  const products = clone(asObject(candidate.products));
  const pageOverrides = scanProductOwnedPageOverrides(siteEditRows, products);
  pageOverrides.resolved.forEach(({ slug, field, value }) => {
    if (!products[slug]) return;
    products[slug] = normalizeProductRecord({ ...products[slug], [field]: value }, slug);
  });
  return {
    products,
    categories: clone(asObject(candidate.categories)),
    deletedCategories: clone(Array.isArray(candidate.deletedCategories) ? candidate.deletedCategories : []),
    globalDisplaySettings: clone(asObject(candidate.globalDisplaySettings)),
    migration: {
      version: 1,
      preparedAt,
      status: pageOverrides.conflicts.length || pageOverrides.unsupported.length ? 'review-required' : 'ready',
      productPageOverrides: pageOverrides,
      legacyCustomProductsPreserved: true,
      legacyPageRowsPreserved: true
    }
  };
}

export function isMigratedProductPageKey(settings = {}, pageKey = '', elementKey = '') {
  const migration = settings?.adminArchitectureMigrationV2?.productPageOverrides;
  const migrated = [...(migration?.resolved || []), ...(migration?.conflicts || [])]
    .flatMap((item) => item.sources || []);
  return migrated.some((source) => source.pageKey === pageKey && source.elementKey === elementKey);
}

export function architectureDiagnostics({ settings = {}, candidate = {}, siteEditRows = [] } = {}) {
  const backup = settings?.[ADMIN_ARCHITECTURE_BACKUP_KEY];
  return {
    schemaVersion: Number(settings?.schemaVersion) || 1,
    targetSchemaVersion: ADMIN_ARCHITECTURE_SCHEMA_VERSION,
    featureEnabled: architectureFeature(settings).enabled,
    backupReady: Boolean(backup?.recoveryOnly && backup?.adminGlobal && Array.isArray(backup?.siteEdits)),
    productCount: Object.keys(asObject(candidate.products)).length,
    categoryCount: Object.keys(asObject(candidate.categories)).length,
    pageRowCount: (Array.isArray(siteEditRows) ? siteEditRows : []).filter((row) => row?.page_key !== 'admin-global').length
  };
}
