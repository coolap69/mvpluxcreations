function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)])
  );
}

export function valuesEqual(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

const PRODUCT_DISPLAY_DEFAULTS = Object.freeze({
  backgroundPosition: 'center center',
  backgroundSizePercent: 100,
  titleLeftPercent: 0,
  titleVerticalPercent: 0,
  titleAlign: 'center',
  titleSizePercent: 100,
  descriptionLeftPercent: 0,
  descriptionVerticalPercent: 0,
  descriptionAlign: 'center',
  descriptionSizePercent: 100
});

const CATEGORY_DISPLAY_DEFAULTS = Object.freeze({
  ...PRODUCT_DISPLAY_DEFAULTS,
  backgroundPosition: 'center bottom'
});

const ADMIN_ONLY_FIELDS = new Set([
  'approvalStatus', 'draftStatus', 'createdAt', 'updatedAt', 'lastError',
  'savedForLater', 'selected', 'status', 'subjectIdentity'
]);

function meaningfulScalar(value) {
  if (value === undefined || value === null || value === '') return undefined;
  return value;
}

function cleanSemanticValue(value) {
  if (Array.isArray(value)) return value.map(cleanSemanticValue);
  if (!value || typeof value !== 'object') return meaningfulScalar(value);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, item]) => !ADMIN_ONLY_FIELDS.has(key) && meaningfulScalar(item) !== undefined)
      .map(([key, item]) => [key, cleanSemanticValue(item)])
      .filter(([, item]) => item !== undefined)
  );
}

function inheritedDisplaySettings(product = {}, context = {}) {
  const inherited = {
    ...PRODUCT_DISPLAY_DEFAULTS,
    ...(context.globalDisplaySettings || {})
  };
  for (const category of Array.isArray(product.categories) ? product.categories : []) {
    Object.assign(inherited, context.categorySettings?.[category] || {});
  }
  return inherited;
}

export function normalizeProductForComparison(product = {}, context = {}) {
  const normalized = cleanSemanticValue(product) || {};
  const inherited = inheritedDisplaySettings(normalized, context);
  const overrides = normalized.displayOverrides && typeof normalized.displayOverrides === 'object'
    ? normalized.displayOverrides
    : {};
  normalized.displayOverrides = cleanSemanticValue({ ...inherited, ...overrides }) || {};
  normalized.categories = [...new Set(Array.isArray(normalized.categories) ? normalized.categories : [])].sort();
  if (normalized.categoryOrder && typeof normalized.categoryOrder === 'object') {
    normalized.categoryOrder = Object.fromEntries(
      Object.entries(normalized.categoryOrder)
        .filter(([category, order]) => category && Number.isFinite(Number(order)))
        .map(([category, order]) => [category, Number(order)])
    );
  }
  if (normalized.priceOverride !== undefined && Number.isFinite(Number(normalized.priceOverride))) {
    normalized.priceOverride = Number(normalized.priceOverride);
  }
  if (normalized.productOrder !== undefined && Number.isFinite(Number(normalized.productOrder))) {
    normalized.productOrder = Number(normalized.productOrder);
  }
  return canonicalize(normalized);
}

export function semanticProductEqual(left, right, context = {}) {
  if (!left || !right) return left === right;
  return valuesEqual(
    normalizeProductForComparison(left, context),
    normalizeProductForComparison(right, context)
  );
}

export function normalizeForSemanticComparison(value) {
  return canonicalize(cleanSemanticValue(value));
}

export function semanticValuesEqual(left, right) {
  return valuesEqual(normalizeForSemanticComparison(left), normalizeForSemanticComparison(right));
}

export function normalizeCategoryForComparison(category = {}) {
  const normalized = cleanSemanticValue(category) || {};
  normalized.displaySettings = cleanSemanticValue({
    ...CATEGORY_DISPLAY_DEFAULTS,
    ...(normalized.displaySettings || {})
  }) || {};
  return canonicalize(normalized);
}

export function semanticCategoryEqual(left, right) {
  if (!left || !right) return left === right;
  return valuesEqual(normalizeCategoryForComparison(left), normalizeCategoryForComparison(right));
}

const ADMIN_REPOSITORY_IMAGE_PATTERN = /^images\/[A-Za-z0-9_./ '\-]+\.(?:png|jpe?g|webp|gif)$/i;

export function validateAdminImageReference(value, { allowBlank = true } = {}) {
  const reference = String(value ?? '').trim();
  if (!reference) return allowBlank
    ? { valid: true, value: '' }
    : { valid: false, value: reference, reason: 'Choose a repository image.' };
  if (/^(?:data:image\/|blob:|admin-upload:|https?:\/\/)/i.test(reference)) {
    return { valid: false, value: reference, reason: 'Embedded, temporary, and external image URLs cannot be saved. Choose an images/... repository path.' };
  }
  if (!ADMIN_REPOSITORY_IMAGE_PATTERN.test(reference) || reference.includes('..') || reference.includes('\\')) {
    return { valid: false, value: reference, reason: 'Image references must be safe images/... repository paths.' };
  }
  return { valid: true, value: reference };
}

export function invalidAdminCollectionImageReferences(collectionKey, value, path = []) {
  const failures = [];
  const visit = (item, itemPath) => {
    if (Array.isArray(item)) {
      item.forEach((entry, index) => visit(entry, [...itemPath, String(index)]));
      return;
    }
    if (!item || typeof item !== 'object') return;
    Object.entries(item).forEach(([key, entry]) => {
      const nextPath = [...itemPath, key];
      const parentKey = itemPath[itemPath.length - 1] || '';
      const isImageField = ['cutoutImage', 'backgroundImage', 'selectedPreviewImage', 'stage'].includes(key)
        || (['image', 'src'].includes(key) && (parentKey === 'card' || itemPath.includes('imageChoices')))
        || (collectionKey === 'imageDrafts' && key === 'path');
      if (isImageField && typeof entry === 'string') {
        const validation = validateAdminImageReference(entry, { allowBlank: true });
        if (!validation.valid) failures.push({ path: nextPath.join('.'), value: entry, reason: validation.reason });
      } else visit(entry, nextPath);
    });
  };
  if (collectionKey === 'extraImages' && typeof value === 'string') {
    const validation = validateAdminImageReference(value, { allowBlank: true });
    if (!validation.valid) failures.push({ path: path.join('.') || 'extraImages', value, reason: validation.reason });
  } else if (['products', 'categories', 'imageDrafts'].includes(collectionKey)) visit(value, path);
  return failures;
}

export function normalizeCategoryIdentity(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\.html(?:\?.*)?$/i, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function findEquivalentCategories(categories = {}, candidate = {}, excludedKey = '') {
  const candidateKey = normalizeCategoryIdentity(candidate.key || candidate.title);
  const candidateTitle = normalizeCategoryIdentity(candidate.title);
  const candidatePage = normalizeCategoryIdentity(candidate.page);
  const candidateParent = String(candidate.parentKey || '');
  return Object.values(categories || {}).filter((category) => {
    if (!category?.key || category.key === excludedKey) return false;
    const sameKey = candidateKey && normalizeCategoryIdentity(category.key) === candidateKey;
    const sameTitle = candidateTitle
      && String(category.parentKey || '') === candidateParent
      && normalizeCategoryIdentity(category.title) === candidateTitle;
    const samePage = candidatePage && normalizeCategoryIdentity(category.page) === candidatePage;
    return sameKey || sameTitle || samePage;
  });
}

export function childCategories(categories = {}, parentKey = '', { includeHidden = true } = {}) {
  return Object.values(categories || {})
    .filter((category) => category?.key && category.parentKey === parentKey && (includeHidden || category.visible !== false))
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0)
      || String(left.title || left.key).localeCompare(String(right.title || right.key)));
}

export function childCategoryDefaults(parentKey = '', value = {}) {
  return {
    ...value,
    parentKey: String(parentKey || ''),
    visible: value.visible !== false,
    homepageVisible: false,
    card: { ...(value.card || {}), visible: false }
  };
}

export function filterProductsForCategoryGroup(products = {}, masterKey = '', childKey = '') {
  const unique = new Map();
  Object.values(products || {}).forEach((product) => {
    const assignments = new Set(Array.isArray(product?.categories) ? product.categories : []);
    if (!product?.slug || product.visible === false || !assignments.has(masterKey) || (childKey && !assignments.has(childKey))) return;
    if (!unique.has(product.slug)) unique.set(product.slug, product);
  });
  return [...unique.values()];
}

export function categoryHierarchyWarnings(categories = {}, products = {}) {
  const warnings = [];
  Object.values(categories || {}).forEach((category) => {
    const parentKey = String(category?.parentKey || '');
    if (!category?.key || !parentKey) return;
    if (parentKey === category.key) warnings.push({ type: 'self-parent', categoryKey: category.key, parentKey });
    else if (!categories[parentKey]) warnings.push({ type: 'missing-parent', categoryKey: category.key, parentKey });
    else {
      const visited = new Set([category.key]);
      let ancestorKey = parentKey;
      while (ancestorKey && categories[ancestorKey]) {
        if (visited.has(ancestorKey)) {
          warnings.push({ type: 'parent-cycle', categoryKey: category.key, parentKey });
          break;
        }
        visited.add(ancestorKey);
        ancestorKey = String(categories[ancestorKey]?.parentKey || '');
      }
    }
  });
  Object.values(products || {}).forEach((product) => {
    const assignments = new Set(Array.isArray(product?.categories) ? product.categories : []);
    assignments.forEach((categoryKey) => {
      const parentKey = String(categories?.[categoryKey]?.parentKey || '');
      if (parentKey && !assignments.has(parentKey)) warnings.push({
        type: 'missing-master-assignment', productSlug: product.slug, categoryKey, parentKey
      });
    });
  });
  return warnings;
}

export function categoryDeletionBlockers(categories = {}, categoryKeys = []) {
  const requested = new Set(categoryKeys || []);
  return [...requested].flatMap((key) => childCategories(categories, key)
    .map((child) => ({ categoryKey: key, childKey: child.key, childTitle: child.title || child.key })));
}

export function categoryProductCounts(categories = {}, products = {}) {
  const counts = Object.fromEntries(Object.keys(categories || {}).map((key) => [key, 0]));
  Object.values(products || {}).forEach((product) => {
    [...new Set(Array.isArray(product?.categories) ? product.categories : [])].forEach((key) => {
      counts[key] = (counts[key] || 0) + 1;
    });
  });
  return counts;
}

export function withProductCategories(product = {}, categoryKeys = []) {
  const categories = [...new Set((categoryKeys || []).filter(Boolean))];
  const existingOrder = product.categoryOrder && typeof product.categoryOrder === 'object'
    ? product.categoryOrder
    : {};
  const categoryOrder = Object.fromEntries(categories.map((key, index) => [
    key,
    Number.isFinite(Number(existingOrder[key])) ? Number(existingOrder[key]) : 999 + index
  ]));
  return { ...product, categories, categoryOrder };
}

export function deleteCategoriesFromState({
  categories = {}, products = {}, deletedCategories = [], homepageCategoryOrder = [], categoryCardMap = {}
} = {}, categoryKeys = []) {
  const deleted = new Set(categoryKeys || []);
  const nextCategories = Object.fromEntries(
    Object.entries(categories || {}).filter(([key]) => !deleted.has(key))
  );
  const nextProducts = Object.fromEntries(Object.entries(products || {}).map(([slug, product]) => [
    slug,
    withProductCategories(product, (product?.categories || []).filter((key) => !deleted.has(key)))
  ]));
  const cardSlugs = new Set(Object.entries(categoryCardMap || {})
    .filter(([, key]) => deleted.has(key))
    .map(([slug]) => slug));
  categoryKeys.forEach((key) => cardSlugs.add(`${key}-category-card`));
  const nextOrder = (Array.isArray(homepageCategoryOrder) ? homepageCategoryOrder : [])
    .map((row) => (Array.isArray(row) ? row : []).filter((value) => !deleted.has(value) && !cardSlugs.has(value)));
  return {
    categories: nextCategories,
    products: nextProducts,
    deletedCategories: [...new Set([...(deletedCategories || []), ...deleted])],
    homepageCategoryOrder: nextOrder,
    removedCategoryKeys: [...deleted],
    removedCardSlugs: [...cardSlugs]
  };
}

export function applyRecordPatch(records = {}, key, patch = {}) {
  return {
    ...(records || {}),
    [key]: { ...((records || {})[key] || {}), ...(patch || {}) }
  };
}

export function analyzeRecordPatch(baseRecord = {}, latestRecord = {}, patch = {}) {
  const localFields = Object.keys(patch || {});
  const remoteFields = [...new Set([...Object.keys(baseRecord || {}), ...Object.keys(latestRecord || {})])]
    .filter((field) => !valuesEqual(baseRecord?.[field], latestRecord?.[field]));
  const conflictingFields = localFields.filter((field) => remoteFields.includes(field));
  return {
    localFields,
    remoteFields,
    conflictingFields,
    canRebase: conflictingFields.length === 0,
    rebasedRecord: { ...(latestRecord || {}), ...(patch || {}) }
  };
}

export function analyzeElementPatch(baseEdits = {}, latestEdits = {}, changes = {}) {
  const localKeys = Object.keys(changes || {});
  const remoteKeys = [...new Set([...Object.keys(baseEdits || {}), ...Object.keys(latestEdits || {})])]
    .filter((key) => !valuesEqual(baseEdits?.[key], latestEdits?.[key]));
  const conflictingKeys = localKeys.filter((key) => remoteKeys.includes(key));
  return {
    localKeys,
    remoteKeys,
    conflictingKeys,
    canRebase: conflictingKeys.length === 0,
    mergedEdits: { ...(latestEdits || {}), ...(changes || {}) }
  };
}

export function analyzeValuePatch(baseValue, latestValue, intendedValue) {
  const remoteChanged = !valuesEqual(baseValue, latestValue);
  const alreadyApplied = valuesEqual(intendedValue, latestValue);
  return {
    remoteChanged,
    alreadyApplied,
    canRebase: !remoteChanged || alreadyApplied
  };
}

export function analyzeMembershipPatch(baseValues = [], latestValues = [], entry, intendedPresent) {
  const basePresent = new Set(baseValues || []).has(entry);
  const latestPresent = new Set(latestValues || []).has(entry);
  return {
    basePresent,
    latestPresent,
    intendedPresent: Boolean(intendedPresent),
    remoteChanged: basePresent !== latestPresent,
    alreadyApplied: latestPresent === Boolean(intendedPresent),
    canRebase: basePresent === latestPresent || latestPresent === Boolean(intendedPresent)
  };
}

export function applyMembershipPatch(values = [], entry, present) {
  const next = new Set(values || []);
  if (present) next.add(entry);
  else next.delete(entry);
  return [...next];
}

export function chooseAuthoritativeState({ liveLoaded, liveValue, emergencyBackup, unsavedChanges }) {
  if (!liveLoaded) return { ...(emergencyBackup || {}), ...(unsavedChanges || {}) };
  return { ...(liveValue || {}), ...(unsavedChanges || {}) };
}

export function buildPublishedHomepageOrder(authoritativePageEdits = {}) {
  const value = authoritativePageEdits?.['homepage-category-card-order'];
  return value?.type === 'homepageCategoryOrder' && Array.isArray(value.rows)
    ? value.rows.map((row) => Array.isArray(row) ? [...row] : [])
    : [];
}
