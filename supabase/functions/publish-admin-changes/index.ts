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
    `${supabaseUrl}/rest/v1/site_edits?page_key=eq.admin-global&select=edits`,
    { headers: { Authorization: authorization, apikey: anonKey } }
  );
  const rows = await readJson(response);
  if (!response.ok) throw new PublishError('supabase-read', 502, 'ADMIN_STATE_READ_FAILED', 'Could not read Admin publish history.');
  return Array.isArray(rows) && rows[0]?.edits ? rows[0].edits : {};
}

async function writeAdminGlobal(
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
  edits: Record<string, unknown>,
  userId: string
) {
  const response = await fetch(`${supabaseUrl}/rest/v1/site_edits?on_conflict=page_key`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      apikey: anonKey,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify({
      page_key: 'admin-global',
      edits,
      updated_by: userId,
      updated_at: new Date().toISOString()
    })
  });
  if (!response.ok) throw new PublishError('supabase-history-write', 502, 'PUBLISH_HISTORY_SAVE_FAILED', 'GitHub committed the snapshot, but publish history could not be saved.');
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

async function snapshotFingerprint(snapshot: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

type PublishImageFile = { path: string; content: string };

function isRepositoryImagePath(value: unknown) {
  return typeof value === 'string'
    && /^images\/[A-Za-z0-9_./ '\-]+\.(?:png|jpe?g|webp|gif)$/i.test(value)
    && !value.includes('..')
    && !value.includes('\\');
}

function validatePublishedSnapshot(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PublishError('validation', 400, 'INVALID_SNAPSHOT', 'Published snapshot must be an object.');
  }
  const snapshot = value as Record<string, unknown>;
  if (snapshot.version !== 1) throw new PublishError('validation', 400, 'INVALID_SNAPSHOT_VERSION', 'Published snapshot version must be 1.');
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
      for (const choice of Array.isArray(product.imageChoices) ? product.imageChoices : []) {
        if (!isRepositoryImagePath(choice?.image) || (choice?.stage && !isRepositoryImagePath(choice.stage))) {
          throw new PublishError('validation', 400, 'INVALID_IMAGE_CHOICE', `Product ${slug} has an invalid image choice.`);
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

  if (imageFiles.length) {
    const currentTree = await githubRequest(token, `/repos/${owner}/${repo}/git/trees/${baseTreeHash}?recursive=1`);
    if (currentTree?.truncated) throw new Error('Could not safely verify whether selected image paths already exist.');
    const existingPaths = new Set(
      Array.isArray(currentTree?.tree) ? currentTree.tree.map((entry: { path?: string }) => entry.path).filter(Boolean) : []
    );
    const existingImage = imageFiles.find((file) => existingPaths.has(file.path));
    if (existingImage) throw new Error(`Selected image already exists in GitHub: ${existingImage.path}`);
  }

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

  try {
    const { supabaseUrl, anonKey, authorization, user } = await authenticateAdmin(request);
    const token = requiredEnvironment('GITHUB_TOKEN');
    const owner = requiredEnvironment('GITHUB_OWNER');
    const repo = requiredEnvironment('GITHUB_REPO');
    const branch = Deno.env.get('GITHUB_BRANCH')?.trim() || 'main';
    const payload = await request.json().catch(() => {
      throw new PublishError('validation', 400, 'INVALID_JSON', 'Request body must be valid JSON.');
    });
    const settings = await readAdminGlobal(supabaseUrl, anonKey, authorization);
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
      const retainedHistory = [...existingHistory.slice(0, -25), ...publishHistory];
      await writeAdminGlobal(supabaseUrl, anonKey, authorization, { ...settings, publishHistory: retainedHistory }, user.id);
      return jsonResponse(request, { publishHistory: retainedHistory });
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
    const duplicate = [...existingHistory].reverse().find((entry) => entry.snapshotFingerprint === fingerprint);
    if (duplicate) {
      return jsonResponse(request, {
        commitHash: duplicate.commitHash,
        deploymentResult: duplicate.deploymentResult,
        publishHistory: existingHistory,
        duplicate: true
      });
    }

    const publication = await publishSnapshot(token, owner, repo, branch, title, body, changeSummary, snapshot, imageFiles);
    if (!publication.commitHash) throw new Error('GitHub did not return a commit hash.');
    const result = await deploymentResult(token, owner, repo, publication.commitHash);
    const historyEntry = {
      date: publication.publishedAt,
      commitHash: publication.commitHash,
      title,
      changeSummary,
      deploymentResult: result,
      snapshotFingerprint: fingerprint
    };
    const publishHistory = [...existingHistory, historyEntry];
    await writeAdminGlobal(supabaseUrl, anonKey, authorization, {
      ...settings,
      lastPublishedSnapshot: snapshot,
      publishHistory
    }, user.id);

    return jsonResponse(request, {
      commitHash: publication.commitHash,
      publishedAt: publication.publishedAt,
      deploymentResult: result,
      publishHistory
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
