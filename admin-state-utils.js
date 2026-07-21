function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)])
  );
}

export function valuesEqual(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
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
