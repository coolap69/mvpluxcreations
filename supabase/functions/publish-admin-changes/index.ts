const allowedOrigins = new Set([
  'https://mvpluxcreations.com',
  'https://www.mvpluxcreations.com',
  'http://localhost:3000',
  'http://localhost:4173'
]);

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://mvpluxcreations.com',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function jsonResponse(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' }
  });
}

class PublishError extends Error {
  stage: string;
  status: number;
  code: string;

  constructor(stage: string, status: number, code: string, message: string) {
    super(message);
    this.stage = stage;
    this.status = status;
    this.code = code;
  }
}

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

function requiredEnvironment(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new PublishError('configuration', 500, 'MISSING_SECRET', `Missing server secret: ${name}`);
  return value;
}

async function authenticateAdmin(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw new PublishError('authentication', 401, 'ADMIN_SIGN_IN_REQUIRED', 'Admin sign-in is required.');

  const supabaseUrl = requiredEnvironment('SUPABASE_URL');
  const anonKey = requiredEnvironment('SUPABASE_ANON_KEY');
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey }
  });
  const user = await readJson(userResponse);
  if (!userResponse.ok || !user?.id) throw new PublishError('authentication', 401, 'INVALID_ADMIN_SESSION', 'Admin session is invalid or expired.');

  const profileResponse = await fetch(
    `${supabaseUrl}/rest/v1/admin_profiles?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`,
    { headers: { Authorization: authorization, apikey: anonKey } }
  );
  const profiles = await readJson(profileResponse);
  if (!profileResponse.ok || !Array.isArray(profiles) || !profiles.length) {
    throw new PublishError('authorization', 403, 'ADMIN_ACCESS_DENIED', 'This account does not have Admin publishing access.');
  }

  return { supabaseUrl, anonKey, authorization, user };
}

async function readAdminGlobal(supabaseUrl: string, anonKey: string, authorization: string) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/site_edits?page_key=eq.admin-global&select=edits,revision`,
    { headers: { Authorization: authorization, apikey: anonKey } }
  );
  const rows = await readJson(response);
  if (!response.ok) throw new PublishError('supabase-read', 502, 'ADMIN_STATE_READ_FAILED', 'Could not read Admin publish history.');
  return {
    edits: Array.isArray(rows) && rows[0]?.edits ? rows[0].edits as Record<string, unknown> : {},
    revision: Array.isArray(rows) ? Number(rows[0]?.revision) || 0 : 0
  };
}

const ADMIN_WORKING_STATE_KEYS = new Set([
  'adminArchitectureV2', 'adminArchitectureMigrationV2', 'cardsSavedForLater', 'categories', 'configuredImagePaths',
  'coupons', 'customProducts', 'deletedCategories', 'deletedProducts', 'dismissedImageDrafts',
  'extraImages', 'globalDisplaySettings', 'ignoredImagePaths', 'imageDrafts', 'lastPublishedSnapshot',
  'liveContentEnabled', 'liveContentRevision', 'livePublishedAt',
  'priceSettings', 'productRelationshipHistory', 'products', 'publishHistory', 'savedForLaterProducts',
  'schemaVersion'
]);

async function readAdminWorkingState(supabaseUrl: string, anonKey: string, authorization: string, requestedKeys: unknown) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/site_edits?page_key=eq.admin-global&select=page_key,edits,revision`,
    { headers: { Authorization: authorization, apikey: anonKey } }
  );
  const rows = await readJson(response);
  if (!response.ok) throw new PublishError('supabase-read', 502, 'ADMIN_STATE_READ_FAILED', 'Could not read Admin working state.');
  const row = Array.isArray(rows) && rows[0] ? rows[0] : { page_key: 'admin-global', edits: {}, revision: 0 };
  const edits = row.edits && typeof row.edits === 'object' && !Array.isArray(row.edits)
    ? row.edits as Record<string, unknown>
    : {};
  const { adminPublishingMigrationBackupV1: recoveryBackup, ...workingEdits } = edits;
  const keys = Array.isArray(requestedKeys)
    ? [...new Set(requestedKeys.map((key) => String(key)).filter((key) => ADMIN_WORKING_STATE_KEYS.has(key)))]
    : [...ADMIN_WORKING_STATE_KEYS];
  const selectedEdits = Object.fromEntries(keys
    .filter((key) => Object.prototype.hasOwnProperty.call(workingEdits, key))
    .map((key) => [key, workingEdits[key]]));
  return {
    rows: [{ page_key: 'admin-global', edits: selectedEdits, revision: Number(row.revision) || 0 }],
    keys,
    recoveryBackupAvailable: Boolean(recoveryBackup)
  };
}

async function saveAdminWorkingState(supabaseUrl: string, anonKey: string, authorization: string, payload: Record<string, unknown>) {
  const edits = payload.edits && typeof payload.edits === 'object' && !Array.isArray(payload.edits)
    ? payload.edits as Record<string, unknown>
    : null;
  if (!edits) throw new PublishError('validation', 400, 'INVALID_ADMIN_PATCH', 'Admin working-state edits must be an object.');
  const keys = Object.keys(edits);
  if (!keys.length || keys.some((key) => !ADMIN_WORKING_STATE_KEYS.has(key))) {
    throw new PublishError('validation', 400, 'INVALID_ADMIN_PATCH_KEY', 'Admin working-state edits contain an unsupported collection.');
  }
  const expectedRevision = Number(payload.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new PublishError('validation', 400, 'INVALID_ADMIN_REVISION', 'A valid Admin revision is required.');
  }
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/save_site_edits`, {
    method: 'POST',
    headers: { Authorization: authorization, apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_page_key: 'admin-global', p_edits: edits, p_expected_revision: expectedRevision, p_replace: false })
  });
  const result = await readJson(response);
  if (!response.ok) {
    const detail = result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : {};
    throw new PublishError('supabase-save', response.status, String(detail.code || 'ADMIN_STATE_SAVE_FAILED'), String(detail.message || 'Admin state could not be saved.'));
  }
  const saved = Array.isArray(result) ? result[0] : result;
  const savedEdits = saved && typeof saved === 'object' && !Array.isArray(saved) && 'edits' in saved
    ? (saved as { edits?: Record<string, unknown> }).edits || {}
    : {};
  return {
    edits: Object.fromEntries(keys.filter((key) => Object.prototype.hasOwnProperty.call(savedEdits, key)).map((key) => [key, savedEdits[key]])),
    revision: saved && typeof saved === 'object' && !Array.isArray(saved) && 'revision' in saved ? Number((saved as { revision?: unknown }).revision) || expectedRevision + 1 : expectedRevision + 1
  };
}

async function readAdminRecoveryState(supabaseUrl: string, anonKey: string, authorization: string) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/site_edits?select=page_key,edits,revision`,
    { headers: { Authorization: authorization, apikey: anonKey } }
  );
  const rows = await readJson(response);
  if (!response.ok) throw new PublishError('supabase-read', 502, 'ADMIN_RECOVERY_READ_FAILED', 'Could not read Admin recovery state.');
  return { rows: Array.isArray(rows) ? rows : [] };
}

async function patchAdminGlobal(
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
  createPatch: (settings: Record<string, unknown>) => Record<string, unknown>
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readAdminGlobal(supabaseUrl, anonKey, authorization);
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/save_site_edits`, {
      method: 'POST',
      headers: { Authorization: authorization, apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_page_key: 'admin-global',
        p_edits: createPatch(current.edits),
        p_expected_revision: current.revision,
        p_replace: false
      })
    });
    const result = await readJson(response);
    if (response.ok) return result;
    if (result?.code !== '40001') {
      throw new PublishError('supabase-history-write', 502, 'PUBLISH_HISTORY_SAVE_FAILED', result?.message || 'GitHub committed the snapshot, but publish history could not be saved.');
    }
  }
  throw new PublishError('supabase-history-write', 409, 'ADMIN_STATE_CONFLICT', 'Admin state kept changing while publish history was saved. The GitHub commit succeeded; refresh deployment results to reconcile history.');
}

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'MVPLUXCREATIONS-Admin-Publisher'
  };
}

async function githubRequest(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { ...githubHeaders(token), ...(init.headers || {}) }
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw new PublishError('github-api', 502, 'GITHUB_API_FAILED', data?.message || `GitHub request failed (${response.status}).`);
  }
  return data;
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonicalJsonValue(entry)]));
}

async function snapshotFingerprint(snapshot: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalJsonValue(snapshot)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function snapshotDifferenceKeys(left: Record<string, unknown>, right: Record<string, unknown>) {
  return [...new Set([...Object.keys(left || {}), ...Object.keys(right || {})])]
    .filter((key) => JSON.stringify(canonicalJsonValue(left?.[key])) !== JSON.stringify(canonicalJsonValue(right?.[key])))
    .sort();
}

async function verifyLiveBaseline(
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
  expectedSnapshot: unknown
) {
  const expected = validatePublishedSnapshot(expectedSnapshot);
  const current = await readAdminGlobal(supabaseUrl, anonKey, authorization);
  const storedValue = current.edits.lastPublishedSnapshot;
  const stored = storedValue && typeof storedValue === 'object' && !Array.isArray(storedValue)
    ? storedValue as Record<string, unknown>
    : null;
  const expectedFingerprint = await snapshotFingerprint(expected);
  const storedFingerprint = stored ? await snapshotFingerprint(stored) : '';
  return {
    matches: Boolean(stored && storedFingerprint === expectedFingerprint),
    expectedFingerprint,
    storedFingerprint,
    differingTopLevelKeys: stored ? snapshotDifferenceKeys(expected, stored) : ['lastPublishedSnapshot'],
    siteRevision: current.revision,
    liveContentEnabled: current.edits.liveContentEnabled === true,
    liveRevision: Number(current.edits.liveContentRevision) || 0
  };
}

async function activateLiveContent(
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
  payload: Record<string, unknown>
) {
  const expected = validatePublishedSnapshot(payload.snapshot);
  const verification = await verifyLiveBaseline(supabaseUrl, anonKey, authorization, expected);
  if (!verification.matches) {
    throw new PublishError(
      'live-activation',
      409,
      'LIVE_BASELINE_MISMATCH',
      `Stored live snapshot differs from the deployed static snapshot in: ${verification.differingTopLevelKeys.join(', ')}.`
    );
  }
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/activate_public_site_snapshot`, {
    method: 'POST',
    headers: { Authorization: authorization, apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_expected_snapshot: expected, p_expected_revision: verification.siteRevision })
  });
  const result = await readJson(response);
  if (!response.ok) {
    throw new PublishError('live-activation', response.status, String(result?.code || 'LIVE_ACTIVATION_FAILED'), String(result?.message || 'Fast live content could not be activated.'));
  }
  return { ...result, baselineFingerprint: verification.expectedFingerprint };
}

async function saveLiveSnapshot(
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
  payload: Record<string, unknown>
) {
  const snapshot = validatePublishedSnapshot(payload.snapshot);
  const expectedRevision = Number(payload.expectedRevision);
  const expectedLiveRevision = Number(payload.expectedLiveRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0
    || !Number.isInteger(expectedLiveRevision) || expectedLiveRevision < 0) {
    throw new PublishError('validation', 400, 'INVALID_LIVE_REVISION', 'Valid Admin and live-content revisions are required.');
  }
  const fingerprint = await snapshotFingerprint(snapshot);
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/save_live_site_snapshot`, {
    method: 'POST',
    headers: { Authorization: authorization, apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_snapshot: snapshot,
      p_expected_revision: expectedRevision,
      p_expected_live_revision: expectedLiveRevision
    })
  });
  const result = await readJson(response);
  if (!response.ok) {
    throw new PublishError('live-save', response.status, String(result?.code || 'LIVE_SAVE_FAILED'), String(result?.message || 'Live content could not be saved.'));
  }
  const publicSnapshot = result?.snapshot;
  const publicFingerprint = publicSnapshot ? await snapshotFingerprint(publicSnapshot) : '';
  if (!publicSnapshot || publicFingerprint !== fingerprint) {
    throw new PublishError('live-verification', 502, 'LIVE_VERIFY_FAILED', 'The saved public snapshot could not be verified.');
  }
  return { ...result, snapshotFingerprint: fingerprint };
}

type PublishImageFile = { path: string; content: string };

function isRepositoryImagePath(value: unknown) {
  return typeof value === 'string'
    && /^images\/[A-Za-z0-9_./ '\-]+\.(?:png|jpe?g|webp|gif)$/i.test(value)
    && !value.includes('..')
    && !value.includes('\\');
}

function isValidMerchandiseHeight(value: unknown) {
  const raw = String(value ?? '').trim();
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw) >= 24 && Number(raw) <= 120;
  const match = raw.match(/^(\d+)\s*'\s*(\d+)?\s*"?$/);
  if (!match) return false;
  const inches = (Number(match[1]) * 12) + Number(match[2] || 0);
  return Number(match[2] || 0) < 12 && inches >= 24 && inches <= 120;
}

function validatePublishedSnapshot(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PublishError('validation', 400, 'INVALID_SNAPSHOT', 'Published snapshot must be an object.');
  }
  const snapshot = value as Record<string, unknown>;
  if (snapshot.version !== 1) throw new PublishError('validation', 400, 'INVALID_SNAPSHOT_VERSION', 'Published snapshot version must be 1.');
  if (snapshot.schemaVersion !== undefined && (!Number.isInteger(Number(snapshot.schemaVersion)) || Number(snapshot.schemaVersion) < 1)) {
    throw new PublishError('validation', 400, 'INVALID_SCHEMA_VERSION', 'schemaVersion must be a positive integer.');
  }
  const priceSettings = snapshot.priceSettings as Record<string, unknown>;
  if (!priceSettings || typeof priceSettings !== 'object' || Array.isArray(priceSettings)
    || !['twoFootPrice', 'threeFootPrice', 'fullHeight', 'fullPrice', 'extraInchPrice']
      .every((field) => Number.isFinite(Number(priceSettings[field])) && Number(priceSettings[field]) > 0)) {
    throw new PublishError('validation', 400, 'INVALID_PRICE_SETTINGS', 'Published price settings are missing or invalid.');
  }
  for (const collectionName of ['products', 'categoryDisplayCards']) {
    const collection = snapshot[collectionName];
    if (!collection || typeof collection !== 'object' || Array.isArray(collection)) {
      throw new PublishError('validation', 400, 'INVALID_PRODUCT_COLLECTION', `${collectionName} must be an object.`);
    }
    for (const [slug, rawProduct] of Object.entries(collection as Record<string, unknown>)) {
      if (!rawProduct || typeof rawProduct !== 'object' || Array.isArray(rawProduct)) {
        throw new PublishError('validation', 400, 'INVALID_PRODUCT', `Invalid product record: ${slug}.`);
      }
      const product = rawProduct as Record<string, unknown>;
      if (product.slug !== slug) throw new PublishError('validation', 400, 'INVALID_PRODUCT_SLUG', `Product slug mismatch: ${slug}.`);
      if (!isRepositoryImagePath(product.cutoutImage)) {
        throw new PublishError('validation', 400, 'INVALID_PRODUCT_IMAGE', `Product ${slug} has an invalid cutout image path.`);
      }
      if (product.backgroundImage && !isRepositoryImagePath(product.backgroundImage)) {
        throw new PublishError('validation', 400, 'INVALID_BACKGROUND_IMAGE', `Product ${slug} has an invalid background image path.`);
      }
      if (!Array.isArray(product.categories) || typeof product.visible !== 'boolean') {
        throw new PublishError('validation', 400, 'INVALID_PRODUCT_SETTINGS', `Product ${slug} has invalid category or visibility settings.`);
      }
      if (collectionName === 'products' && !isValidMerchandiseHeight(product.originalHeight)) {
        throw new PublishError('validation', 400, 'MISSING_PRODUCT_HEIGHT', `Product ${slug} needs an original or default merchandise height before publishing.`);
      }
      for (const choice of Array.isArray(product.imageChoices) ? product.imageChoices : []) {
        if (!isRepositoryImagePath(choice?.image) || (choice?.stage && !isRepositoryImagePath(choice.stage))) {
          throw new PublishError('validation', 400, 'INVALID_IMAGE_CHOICE', `Product ${slug} has an invalid image choice.`);
        }
      }
      for (const field of ['cutoutHeight', 'cutoutLeft', 'cutoutBottom', 'logoWidth', 'logoTop']) {
        if (product[field] !== undefined && product[field] !== '' && !Number.isFinite(Number(product[field]))) {
          throw new PublishError('validation', 400, 'INVALID_PRODUCT_POSITION', `Product ${slug} has an invalid ${field} value.`);
        }
      }
    }
  }
  const extraImages = snapshot.extraImages;
  if (extraImages !== undefined) {
    if (!extraImages || typeof extraImages !== 'object' || Array.isArray(extraImages)) {
      throw new PublishError('validation', 400, 'INVALID_EXTRA_IMAGES', 'extraImages must be an object.');
    }
    for (const [key, path] of Object.entries(extraImages as Record<string, unknown>)) {
      if (!key || !isRepositoryImagePath(path)) {
        throw new PublishError('validation', 400, 'INVALID_EXTRA_IMAGE', `Invalid website image assignment: ${key || 'unknown'}.`);
      }
    }
  }
  const pageVisualStates = snapshot.pageVisualStates;
  if (pageVisualStates !== undefined) {
    if (!pageVisualStates || typeof pageVisualStates !== 'object' || Array.isArray(pageVisualStates)) {
      throw new PublishError('validation', 400, 'INVALID_VISUAL_STATES', 'pageVisualStates must be an object.');
    }
    for (const [pageKey, rawStates] of Object.entries(pageVisualStates as Record<string, unknown>)) {
      if (!pageKey || !rawStates || typeof rawStates !== 'object' || Array.isArray(rawStates)) {
        throw new PublishError('validation', 400, 'INVALID_VISUAL_STATES', `Invalid visual states for ${pageKey || 'unknown page'}.`);
      }
      for (const [elementKey, rawState] of Object.entries(rawStates as Record<string, unknown>)) {
        const state = rawState as Record<string, unknown>;
        if (!elementKey || !state || typeof state !== 'object' || Array.isArray(state)
          || !['x', 'y', 'scale', 'rotate'].every((field) => Number.isFinite(Number(state[field])))) {
          throw new PublishError('validation', 400, 'INVALID_VISUAL_STATE', `Invalid image positioning state on ${pageKey}.`);
        }
      }
    }
  }
  const categories = snapshot.categories;
  if (categories !== undefined) {
    if (!categories || typeof categories !== 'object' || Array.isArray(categories)) {
      throw new PublishError('validation', 400, 'INVALID_CATEGORIES', 'categories must be an object.');
    }
    for (const [key, rawCategory] of Object.entries(categories as Record<string, unknown>)) {
      const category = rawCategory as Record<string, unknown>;
      const card = category?.card as Record<string, unknown> | undefined;
      if (!key || !category || typeof category !== 'object' || Array.isArray(category) || category.key !== key) {
        throw new PublishError('validation', 400, 'INVALID_CATEGORY', `Invalid category record: ${key || 'unknown'}.`);
      }
      if (card?.image && !isRepositoryImagePath(card.image)) throw new PublishError('validation', 400, 'INVALID_CATEGORY_IMAGE', `Category ${key} has an invalid card image.`);
      if (card?.backgroundImage && !isRepositoryImagePath(card.backgroundImage)) throw new PublishError('validation', 400, 'INVALID_CATEGORY_BACKGROUND', `Category ${key} has an invalid card background.`);
      const settings = category.displaySettings as Record<string, unknown> | undefined;
      if (settings?.backgroundImage && !isRepositoryImagePath(settings.backgroundImage)) throw new PublishError('validation', 400, 'INVALID_CATEGORY_BACKGROUND', `Category ${key} has an invalid display background.`);
    }
    const categoryRecords = categories as Record<string, Record<string, unknown>>;
    for (const [key, category] of Object.entries(categoryRecords)) {
      const parentKey = typeof category.parentKey === 'string' ? category.parentKey.trim() : '';
      if (!parentKey) continue;
      if (parentKey === key || !categoryRecords[parentKey]) {
        throw new PublishError('validation', 400, 'INVALID_CATEGORY_PARENT', `Child Group ${key} has an invalid Main Category.`);
      }
      const visited = new Set([key]);
      let ancestorKey = parentKey;
      while (ancestorKey) {
        if (visited.has(ancestorKey)) throw new PublishError('validation', 400, 'CATEGORY_PARENT_CYCLE', `Child Group hierarchy contains a cycle at ${key}.`);
        visited.add(ancestorKey);
        const ancestor = categoryRecords[ancestorKey];
        ancestorKey = ancestor && typeof ancestor.parentKey === 'string' ? ancestor.parentKey.trim() : '';
      }
    }
    // Child Group assignments may remain dormant after a Main Collection assignment is removed.
    // Customer filtering still requires both assignments, so a dormant relationship is never public.
  }
  const deletedCategories = snapshot.deletedCategories;
  if (deletedCategories !== undefined && (!Array.isArray(deletedCategories)
    || deletedCategories.some((key) => typeof key !== 'string' || !key.trim()))) {
    throw new PublishError('validation', 400, 'INVALID_DELETED_CATEGORIES', 'deletedCategories must be an array of Category keys.');
  }
  const globalDisplay = snapshot.globalDisplaySettings as Record<string, unknown> | undefined;
  if (globalDisplay?.backgroundImage && !isRepositoryImagePath(globalDisplay.backgroundImage)) {
    throw new PublishError('validation', 400, 'INVALID_GLOBAL_BACKGROUND', 'Global display background is invalid.');
  }
  const pageContent = snapshot.pageContent;
  if (pageContent !== undefined) {
    if (!pageContent || typeof pageContent !== 'object' || Array.isArray(pageContent)) {
      throw new PublishError('validation', 400, 'INVALID_PAGE_CONTENT', 'pageContent must be an object.');
    }
    for (const [pageKey, rawEntries] of Object.entries(pageContent as Record<string, unknown>)) {
      if (!pageKey || !rawEntries || typeof rawEntries !== 'object' || Array.isArray(rawEntries)) throw new PublishError('validation', 400, 'INVALID_PAGE_CONTENT', `Invalid page content for ${pageKey || 'unknown page'}.`);
      for (const [elementKey, rawEntry] of Object.entries(rawEntries as Record<string, unknown>)) {
        const entry = rawEntry as Record<string, unknown>;
        if (!elementKey || !entry || typeof entry !== 'object' || Array.isArray(entry) || (entry.src && !isRepositoryImagePath(entry.src))) {
          throw new PublishError('validation', 400, 'INVALID_PAGE_CONTENT', `Invalid page content entry on ${pageKey}.`);
        }
      }
    }
  }
  return snapshot;
}

function validatePublishImageFiles(value: unknown): PublishImageFile[] {
  if (!Array.isArray(value)) return [];
  if (value.length > 20) throw new Error('Select no more than 20 images per publish.');
  const files: PublishImageFile[] = [];
  const seen = new Set<string>();
  let encodedBytes = 0;
  for (const item of value) {
    const path = typeof item?.path === 'string' ? item.path.trim() : '';
    const content = typeof item?.content === 'string' ? item.content : '';
    if (!/^images\/[A-Za-z0-9_./ '\-]+\.(?:png|jpe?g|webp|gif)$/i.test(path) || path.includes('..') || path.includes('\\')) {
      throw new PublishError('validation', 400, 'INVALID_IMAGE_PATH', `Invalid image repository path: ${path || 'missing path'}`);
    }
    if (!content || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) throw new PublishError('validation', 400, 'INVALID_IMAGE_CONTENT', `Invalid image content for ${path}.`);
    if (seen.has(path)) continue;
    seen.add(path);
    encodedBytes += content.length;
    files.push({ path, content });
  }
  if (encodedBytes > 40_000_000) throw new PublishError('validation', 400, 'IMAGE_LIMIT_EXCEEDED', 'Selected images exceed the 30 MB publish limit.');
  return files;
}

function snapshotImagePaths(snapshot: unknown) {
  const paths = new Set<string>();
  const value = snapshot as Record<string, unknown>;
  for (const collectionName of ['products', 'categoryDisplayCards']) {
    const collection = value?.[collectionName] as Record<string, Record<string, unknown>>;
    for (const product of Object.values(collection || {})) {
      for (const path of [product.cutoutImage, product.backgroundImage]) {
        if (isRepositoryImagePath(path)) paths.add(path as string);
      }
      for (const choice of Array.isArray(product.imageChoices) ? product.imageChoices : []) {
        if (isRepositoryImagePath(choice?.image)) paths.add(choice.image);
        if (isRepositoryImagePath(choice?.stage)) paths.add(choice.stage);
      }
    }
  }
  for (const path of Object.values((value?.extraImages || {}) as Record<string, unknown>)) {
    if (isRepositoryImagePath(path)) paths.add(path as string);
  }
  for (const category of Object.values((value?.categories || {}) as Record<string, Record<string, unknown>>)) {
    const card = category?.card as Record<string, unknown> | undefined;
    const display = category?.displaySettings as Record<string, unknown> | undefined;
    for (const path of [card?.image, card?.backgroundImage, display?.backgroundImage]) {
      if (isRepositoryImagePath(path)) paths.add(path as string);
    }
  }
  const globalDisplay = value?.globalDisplaySettings as Record<string, unknown> | undefined;
  const globalBackground = globalDisplay?.backgroundImage;
  if (isRepositoryImagePath(globalBackground)) paths.add(globalBackground as string);
  for (const entries of Object.values((value?.pageContent || {}) as Record<string, Record<string, Record<string, unknown>>>)) {
    for (const entry of Object.values(entries || {})) if (isRepositoryImagePath(entry?.src)) paths.add(entry.src as string);
  }
  return paths;
}

async function deploymentResult(token: string, owner: string, repo: string, commitHash: string) {
  try {
    const deployments = await githubRequest(
      token,
      `/repos/${owner}/${repo}/deployments?sha=${encodeURIComponent(commitHash)}&per_page=1`
    );
    if (!Array.isArray(deployments) || !deployments.length) return 'queued';
    const statuses = await githubRequest(
      token,
      `/repos/${owner}/${repo}/deployments/${deployments[0].id}/statuses?per_page=1`
    );
    return Array.isArray(statuses) && statuses[0]?.state ? statuses[0].state : 'queued';
  } catch (_error) {
    return 'unknown';
  }
}

async function repositoryImageInventory(token: string, owner: string, repo: string, branch: string) {
  const branchRef = `heads/${branch.split('/').map(encodeURIComponent).join('/')}`;
  const reference = await githubRequest(token, `/repos/${owner}/${repo}/git/ref/${branchRef}`);
  const commitHash = reference?.object?.sha || '';
  if (!commitHash) throw new PublishError('github-inventory', 502, 'GITHUB_BRANCH_UNAVAILABLE', 'Could not read the GitHub branch for Image Inbox.');
  const commit = await githubRequest(token, `/repos/${owner}/${repo}/git/commits/${commitHash}`);
  const treeHash = commit?.tree?.sha || '';
  if (!treeHash) throw new PublishError('github-inventory', 502, 'GITHUB_TREE_UNAVAILABLE', 'Could not read the GitHub image tree.');
  const tree = await githubRequest(token, `/repos/${owner}/${repo}/git/trees/${treeHash}?recursive=1`);
  if (tree?.truncated) throw new PublishError('github-inventory', 502, 'GITHUB_TREE_TRUNCATED', 'The GitHub image inventory was truncated, so Image Inbox stopped safely.');
  const images = (Array.isArray(tree?.tree) ? tree.tree : [])
    .filter((entry: { type?: string; path?: string }) => entry.type === 'blob' && isRepositoryImagePath(entry.path))
    .map((entry: { path: string }) => entry.path)
    .sort((left: string, right: string) => left.localeCompare(right));
  return { images, commitHash };
}

async function publishSnapshot(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  title: string,
  body: string,
  changeSummary: string,
  snapshot: unknown,
  imageFiles: PublishImageFile[]
) {
  const publishedAt = new Date().toISOString();
  const fileContent = JSON.stringify({ publishedAt, title, changeSummary, snapshot }, null, 2) + '\n';
  const branchRef = `heads/${branch.split('/').map(encodeURIComponent).join('/')}`;
  const reference = await githubRequest(token, `/repos/${owner}/${repo}/git/ref/${branchRef}`);
  const parentCommitHash = reference?.object?.sha || '';
  if (!parentCommitHash) throw new Error('Could not determine the current GitHub branch commit.');
  const parentCommit = await githubRequest(token, `/repos/${owner}/${repo}/git/commits/${parentCommitHash}`);
  const baseTreeHash = parentCommit?.tree?.sha || '';
  if (!baseTreeHash) throw new Error('Could not determine the current GitHub tree.');

  const currentTree = await githubRequest(token, `/repos/${owner}/${repo}/git/trees/${baseTreeHash}?recursive=1`);
  if (currentTree?.truncated) throw new Error('Could not safely verify published image paths.');
  const existingPaths = new Set<string>(
    Array.isArray(currentTree?.tree) ? currentTree.tree.map((entry: { path?: string }) => entry.path).filter(Boolean) : []
  );
  const selectedPaths = new Set(imageFiles.map((file) => file.path));
  const missingImage = [...snapshotImagePaths(snapshot)].find((path) => !existingPaths.has(path) && !selectedPaths.has(path));
  if (missingImage) throw new PublishError('validation', 400, 'MISSING_PUBLISHED_IMAGE', `Published image is missing from GitHub and was not selected for upload: ${missingImage}`);

  const settingsBlob = await githubRequest(token, `/repos/${owner}/${repo}/git/blobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: encodeBase64(fileContent), encoding: 'base64' })
  });
  const imageEntries = [];
  for (const file of imageFiles) {
    const blob = await githubRequest(token, `/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: file.content, encoding: 'base64' })
    });
    const existingEntry = Array.isArray(currentTree?.tree)
      ? currentTree.tree.find((entry: { path?: string; sha?: string }) => entry.path === file.path)
      : null;
    if (existingEntry) {
      if (existingEntry.sha !== blob.sha) throw new Error(`Selected image path already exists in GitHub with different content: ${file.path}`);
      continue;
    }
    imageEntries.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const tree = await githubRequest(token, `/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base_tree: baseTreeHash,
      tree: [
        { path: 'published-admin-settings.json', mode: '100644', type: 'blob', sha: settingsBlob.sha },
        ...imageEntries
      ]
    })
  });
  const commit = await githubRequest(token, `/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `${title}${body ? `\n\n${body}` : ''}`,
      tree: tree.sha,
      parents: [parentCommitHash]
    })
  });
  await githubRequest(token, `/repos/${owner}/${repo}/git/refs/${branchRef}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: commit.sha, force: false })
  });
  return { commitHash: commit?.sha || '', publishedAt };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== 'POST') return jsonResponse(request, { error: 'Method not allowed.' }, 405);
  const requestStartedAt = performance.now();

  try {
    const { supabaseUrl, anonKey, authorization } = await authenticateAdmin(request);
    const payload = await request.json().catch(() => {
      throw new PublishError('validation', 400, 'INVALID_JSON', 'Request body must be valid JSON.');
    });
    if (payload?.action === 'working-state') {
      return jsonResponse(request, await readAdminWorkingState(supabaseUrl, anonKey, authorization, payload.keys));
    }
    if (payload?.action === 'save-working-state') {
      return jsonResponse(request, await saveAdminWorkingState(supabaseUrl, anonKey, authorization, payload));
    }
    if (payload?.action === 'recovery-state') {
      return jsonResponse(request, await readAdminRecoveryState(supabaseUrl, anonKey, authorization));
    }
    if (payload?.action === 'verify-live-baseline') {
      return jsonResponse(request, await verifyLiveBaseline(supabaseUrl, anonKey, authorization, payload.snapshot));
    }
    if (payload?.action === 'activate-live-content') {
      return jsonResponse(request, await activateLiveContent(supabaseUrl, anonKey, authorization, payload));
    }
    if (payload?.action === 'save-live') {
      return jsonResponse(request, await saveLiveSnapshot(supabaseUrl, anonKey, authorization, payload));
    }

    const token = requiredEnvironment('GITHUB_TOKEN');
    const owner = requiredEnvironment('GITHUB_OWNER');
    const repo = requiredEnvironment('GITHUB_REPO');
    const branch = Deno.env.get('GITHUB_BRANCH')?.trim() || 'main';
    if (payload?.action === 'image-inventory') {
      return jsonResponse(request, await repositoryImageInventory(token, owner, repo, branch));
    }
    if (payload?.action === 'deployment-status') {
      const commitHash = String(payload.commitHash || '').trim();
      if (!/^[0-9a-f]{40}$/i.test(commitHash)) {
        throw new PublishError('validation', 400, 'INVALID_COMMIT_HASH', 'A full GitHub commit hash is required to check website deployment.');
      }
      const deploymentStartedAt = performance.now();
      const result = await deploymentResult(token, owner, repo, commitHash);
      const current = await readAdminGlobal(supabaseUrl, anonKey, authorization);
      const currentHistory = Array.isArray(current.edits.publishHistory) ? current.edits.publishHistory : [];
      const matchingEntry = currentHistory.find((entry) => entry?.commitHash === commitHash);
      let publishHistory = currentHistory;
      if (matchingEntry && result !== 'unknown' && matchingEntry.deploymentResult !== result) {
        const saved = await patchAdminGlobal(supabaseUrl, anonKey, authorization, (latest) => ({
          publishHistory: (Array.isArray(latest.publishHistory) ? latest.publishHistory : []).map((entry) => (
            entry?.commitHash === commitHash ? { ...entry, deploymentResult: result } : entry
          ))
        }));
        publishHistory = Array.isArray(saved?.edits?.publishHistory) ? saved.edits.publishHistory : currentHistory;
      }
      return jsonResponse(request, {
        commitHash,
        deploymentResult: result,
        publishHistory,
        timing: { deploymentLookupMs: Math.round(performance.now() - deploymentStartedAt) }
      });
    }

    const initialAdminState = await readAdminGlobal(supabaseUrl, anonKey, authorization);
    const settings = initialAdminState.edits;
    const existingHistory = Array.isArray(settings.publishHistory) ? settings.publishHistory : [];

    if (payload?.action === 'refresh-history') {
      const publishHistory = [];
      for (const entry of existingHistory.slice(-25)) {
        const checkedResult = entry.commitHash
          ? await deploymentResult(token, owner, repo, entry.commitHash)
          : entry.deploymentResult || 'unknown';
        const result = checkedResult === 'unknown' ? entry.deploymentResult || 'unknown' : checkedResult;
        publishHistory.push({ ...entry, deploymentResult: result });
      }
      const refreshedByCommit = new Map(publishHistory.map((entry) => [entry.commitHash, entry]));
      const saved = await patchAdminGlobal(supabaseUrl, anonKey, authorization, (latest) => ({
        publishHistory: (Array.isArray(latest.publishHistory) ? latest.publishHistory : []).map((entry) => (
          refreshedByCommit.get(entry.commitHash) || entry
        ))
      }));
      return jsonResponse(request, { publishHistory: saved?.edits?.publishHistory || publishHistory });
    }

    if (payload?.action !== 'publish') return jsonResponse(request, { error: 'Unknown publisher action.', stage: 'validation', code: 'UNKNOWN_ACTION' }, 400);
    const title = String(payload.title || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 72);
    const body = String(payload.body || '').trim().slice(0, 50000);
    const changeSummary = String(payload.changeSummary || '').trim().slice(0, 40000);
    const snapshot = validatePublishedSnapshot(payload.snapshot);
    const imageFiles = validatePublishImageFiles(payload.imageFiles);
    if (!title || !changeSummary) {
      return jsonResponse(request, { error: 'Commit title, change summary, and snapshot are required.', stage: 'validation', code: 'INVALID_PUBLISH_PAYLOAD' }, 400);
    }

    const imageFingerprints = [];
    for (const file of imageFiles) {
      imageFingerprints.push({ path: file.path, fingerprint: await snapshotFingerprint(file.content) });
    }
    const fingerprint = await snapshotFingerprint({ snapshot, images: imageFingerprints });
    const preparationMs = performance.now() - requestStartedAt;
    const duplicate = [...existingHistory].reverse().find((entry) => entry.snapshotFingerprint === fingerprint);
    if (duplicate) {
      return jsonResponse(request, {
        commitHash: duplicate.commitHash,
        deploymentResult: duplicate.deploymentResult,
        publishHistory: existingHistory,
        duplicate: true,
        timing: { edgeTotalMs: Math.round(performance.now() - requestStartedAt), preparationMs: Math.round(preparationMs), githubPublicationMs: 0, deploymentLookupMs: 0, historySaveMs: 0 }
      });
    }

    const publicationStartedAt = performance.now();
    const publication = await publishSnapshot(token, owner, repo, branch, title, body, changeSummary, snapshot, imageFiles);
    const githubPublicationMs = performance.now() - publicationStartedAt;
    if (!publication.commitHash) throw new Error('GitHub did not return a commit hash.');
    const deploymentStartedAt = performance.now();
    const result = await deploymentResult(token, owner, repo, publication.commitHash);
    const deploymentLookupMs = performance.now() - deploymentStartedAt;
    const historyEntry = {
      date: publication.publishedAt,
      commitHash: publication.commitHash,
      title,
      changeSummary,
      deploymentResult: result,
      snapshotFingerprint: fingerprint
    };
    const historyStartedAt = performance.now();
    const saved = await patchAdminGlobal(supabaseUrl, anonKey, authorization, (latest) => {
      const latestHistory = Array.isArray(latest.publishHistory) ? latest.publishHistory : [];
      const publishHistory = latestHistory.some((entry) => entry.commitHash === historyEntry.commitHash)
        ? latestHistory
        : [...latestHistory, historyEntry];
      return { lastPublishedSnapshot: snapshot, publishHistory };
    });
    const historySaveMs = performance.now() - historyStartedAt;
    const publishHistory = saved?.edits?.publishHistory || [...existingHistory, historyEntry];

    return jsonResponse(request, {
      commitHash: publication.commitHash,
      publishedAt: publication.publishedAt,
      deploymentResult: result,
      publishHistory,
      timing: {
        edgeTotalMs: Math.round(performance.now() - requestStartedAt),
        preparationMs: Math.round(preparationMs),
        githubPublicationMs: Math.round(githubPublicationMs),
        deploymentLookupMs: Math.round(deploymentLookupMs),
        historySaveMs: Math.round(historySaveMs)
      }
    });
  } catch (error) {
    const publishError = error instanceof PublishError
      ? error
      : new PublishError('publisher', 500, 'PUBLISH_FAILED', error instanceof Error ? error.message : 'Publish failed.');
    return jsonResponse(request, {
      error: publishError.message,
      stage: publishError.stage,
      code: publishError.code
    }, publishError.status);
  }
});
