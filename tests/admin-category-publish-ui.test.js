const assert = (condition, message) => { if (!condition) throw new Error(message); };

const source = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
const publisherSource = await Deno.readTextFile(new URL('../supabase/functions/publish-admin-changes/index.ts', import.meta.url));

function extractedFunction(startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert(start >= 0 && end > start, `Could not extract ${startToken}`);
  return source.slice(start, end);
}

function categoryPublisherHarness({ saveResult = true, publishResult = true, deferredSave = null } = {}) {
  const functionSource = extractedFunction('async function publishCategoryByKey', 'async function saveCategoryProductAssignments');
  const operations = new Map();
  const states = [];
  let saveCalls = 0;
  let publishCalls = 0;
  const factory = new Function(
    'window', 'categoryPublishOperations', 'readAdminCategories', 'setStatus', 'setCategoryPublishState',
    'publishAllSavedChanges', 'saveCategoryEditForm', 'saveAdminCollectionOperations', 'adminLastSaveError', 'ADMIN_CATEGORY_CARD_MAP',
    'publishableCategory', 'loadSelectedPublishImages', 'callAdminPublisher', 'saveAdminSettingsLive',
    'adminPublishedBaseline', 'buildDefaultPublishBaseline', 'normalizePublishedBaseline',
    'adminLastSuccessfulSnapshot', 'refreshVisibleAdminAreaAfterPublish',
    `${functionSource}; return publishCategoryByKey;`
  );
  const publish = factory(
    {
      confirm: () => true,
      MVPLUX_CATEGORY_PUBLISHER: {
        publishCategoryByKey: async (key, options) => {
          options.onProgress('Saving Category…', 'publishing');
          const saved = await options.saveApprovedDraft(key);
          if (!saved) {
            options.onProgress('Publish stopped: Category draft could not be saved.', 'failed');
            return { ok: false };
          }
          publishCalls += 1;
          options.onProgress(publishResult ? 'Published to Website' : 'Publish Failed — test', publishResult ? 'published' : 'failed');
          return { ok: publishResult };
        }
      }
    },
    operations,
    () => ({ sports: { key: 'sports', title: 'Sports', card: { image: 'images/sports.png' } } }),
    () => {},
    (key, message, state) => { operations.set(key, { message, state }); states.push({ key, message, state }); },
    async (_label, _status, options) => {
      publishCalls += 1;
      options?.onProgress?.(publishResult ? 'Published to Website' : 'Publish Failed — test', publishResult ? 'published' : 'failed');
      return publishResult;
    },
    async () => {
      saveCalls += 1;
      operations.set('sports', { message: 'Saving Category…', state: 'publishing' });
      states.push({ key: 'sports', message: 'Saving Category…', state: 'publishing' });
      if (deferredSave) await deferredSave;
      if (!saveResult) {
        operations.set('sports', { message: 'Publish stopped: Category draft could not be saved.', state: 'failed' });
        states.push({ key: 'sports', message: 'Publish stopped: Category draft could not be saved.', state: 'failed' });
      }
      return saveResult;
    },
    async () => { saveCalls += 1; if (deferredSave) await deferredSave; return { ok: saveResult }; },
    'Private save failed.',
    {}, (category) => category, async () => [], async () => ({}), async () => true,
    { version: 1, products: {}, categories: {} }, () => ({ version: 1, products: {}, categories: {} }), (value) => value,
    null, () => {}
  );
  return { publish, operations, states, counts: () => ({ saveCalls, publishCalls }) };
}

Deno.test('Category Publish reacts immediately and blocks duplicate clicks', async () => {
  let release;
  const deferredSave = new Promise((resolve) => { release = resolve; });
  const harness = categoryPublisherHarness({ deferredSave });
  const first = harness.publish('sports', {});
  const duplicate = await harness.publish('sports', {});
  assert(harness.states[0]?.message === 'Saving Category…' && harness.states[0]?.state === 'publishing', 'first synchronous state must acknowledge the click');
  assert(duplicate === false && harness.counts().saveCalls === 1, 'a second click must not start another save or publish');
  release();
  assert(await first, 'the publish-all result must be returned');
  assert(harness.counts().publishCalls === 1, 'the shared publish-all controller must be called exactly once');
  assert(harness.states.some((entry) => entry.state === 'published'), 'success state must be visible');
});

Deno.test('Category Publish exposes save and publish failures', async () => {
  const saveFailure = categoryPublisherHarness({ saveResult: false });
  assert(!await saveFailure.publish('sports', {}), 'failed private save must stop publication');
  assert(saveFailure.states.at(-1)?.state === 'failed', 'private save failure must be visible');
  const publishFailure = categoryPublisherHarness({ publishResult: false });
  assert(!await publishFailure.publish('sports', {}), 'publisher failure must be returned');
  assert(publishFailure.states.at(-1)?.state === 'failed', 'publisher failure must be visible');
});

Deno.test('top and editor Publish buttons share one Category publisher and state', () => {
  const markup = extractedFunction('function categoryPublishButtonMarkup', 'function categoryDisplayRangeMarkup');
  const events = extractedFunction('function setupCategoryManagerEvents()', 'function renderAdminProducts()');
  assert(markup.includes('data-publish-category-key') && markup.includes("operation?.state === 'publishing'"), 'all Category Publish buttons must bind to shared state');
  assert(events.includes("event.target.closest('[data-publish-category-key]')") && events.includes('publishCategoryByKey('), 'one delegated handler must own both Publish locations');
  assert(events.includes('card?.querySelector(`[data-category-edit="${CSS.escape(publishKey)}"]`)'), 'top Category Publish must submit only the mounted sibling editor for its exact Category key');
  assert(!events.includes("card?.querySelector('[data-category-edit]')"), 'top Category Publish must never select an unrelated nested Main/Child editor');
  const categoryPublish = extractedFunction('async function publishCategoryByKey', 'async function saveCategoryProductAssignments');
  assert(categoryPublish.includes('publishAllSavedChanges('), 'Dashboard Category buttons must use the shared Publish All controller');
});

Deno.test('Publish All prepares every saved item and sends every change id through one deployment', async () => {
  const implementation = extractedFunction('async function publishAllSavedChanges', '\n\nasync function discardArchitecturePrivateChange');
  const items = [
    { id: 'product:one', type: 'product', title: 'One', approved: false, after: { cutoutImage: 'images/one.png' } },
    { id: 'category:sports', type: 'category', title: 'Sport Legends', approved: true, after: { card: { image: 'images/sports.png' } } },
    { id: 'page:index:title', type: 'page', title: 'Homepage title', approved: false, after: { text: 'New title' } }
  ];
  const prepared = [];
  let publishedIds = [];
  let publishAllSavedChangesPromise = null;
  const run = new Function(
    'architectureReviewItems', 'waitForAdminSaves', 'loadAdminLiveSettings', 'setArchitectureReviewStatus',
    'publishScopedChangeIds', 'setStatus', 'adminLastSaveError', 'saveAllOpenCollectionChanges',
    `let publishAllSavedChangesPromise = null; ${implementation}; return publishAllSavedChanges;`
  )(
    () => items.map((item) => ({ ...item, approved: item.approved || prepared.includes(item.id) })),
    async () => true, async () => true,
    async (item) => { prepared.push(item.id); return true; },
    async (ids) => { publishedIds = ids; return true; }, () => {}, '', async () => true
  );
  assert(await run(), 'Publish All should complete');
  assert(prepared.join(',') === 'product:one,page:index:title', 'every saved draft must be prepared before publishing');
  assert(publishedIds.join(',') === items.map((item) => item.id).join(','), 'one deployment must receive every saved change id');
});

Deno.test('an intentionally empty Homepage Collection Card image does not block unrelated saved publication', async () => {
  const implementation = extractedFunction('async function publishAllSavedChanges', '\n\nasync function discardArchitecturePrivateChange');
  const messages = [];
  let calledPublisher = false;
  const run = new Function(
    'architectureReviewItems', 'waitForAdminSaves', 'loadAdminLiveSettings', 'setArchitectureReviewStatus',
    'publishScopedChangeIds', 'setStatus', 'adminLastSaveError', 'saveAllOpenCollectionChanges',
    `let publishAllSavedChangesPromise = null; ${implementation}; return publishAllSavedChanges;`
  )(
    () => [{ id: 'category:custom', type: 'category', title: 'Custom / Other', approved: true, after: { card: { image: '' } } }],
    async () => true, async () => true, async () => true,
    async () => { calledPublisher = true; return true; }, (message) => messages.push(message), '', async () => true
  );
  assert(await run(), 'an explicit empty normalized card image is a publishable Main Collection state');
  assert(calledPublisher, 'one incomplete visual must not block every other saved Admin change');
});

Deno.test('every visible Admin publish entry reaches the same Publish All controller', async () => {
  const [html, storefront] = await Promise.all([
    Deno.readTextFile(new URL('../admin.html', import.meta.url)),
    Deno.readTextFile(new URL('../script.js', import.meta.url))
  ]);
  for (const control of [
    'data-publish-new-product', 'data-publish-new-category', 'id="publishAllCollections"', 'id="publishAdminChanges"',
    'data-publish-category-product', 'data-publish-category-key', 'data-publish-category-deletion',
    'data-publish-product', 'data-publish-image-box', 'data-publish-all-saved'
  ]) assert(html.includes(control) || source.includes(control), `missing Publish All entry ${control}`);
  assert((source.match(/publishScopedChangeIds\(/g) || []).length === 2, 'only the shared Publish All controller may call the one-deployment scoped engine');
  assert(source.includes('return publishAllSavedChanges(label || base.title || slug, statusTarget)'), 'Product and Image Box publication must converge on Publish All');
  assert(source.includes('return publishAllSavedChanges(initialCategory.title || categoryKey'), 'Main Collection publication must converge on Publish All');
  assert(source.includes("publishAllSavedChanges(`Delete ${publishDeletion.dataset.publishCategoryDeletion}`)"), 'deletion publication must converge on Publish All');
  assert(storefront.includes("await markSelectedInlineAdminReady()") && storefront.includes("admin.html?publishAll=1#advanced"), 'Storefront Admin Mode must save first and hand off to the Dashboard Publish All authority');
});

Deno.test('scoped publishing reports real stages and refreshes only the visible Admin area', () => {
  const scoped = extractedFunction('async function publishScopedChangeIds', 'async function publishExistingProductForm');
  const polling = extractedFunction('async function waitForPublishedDeployment', 'async function publishScopedChangeIds');
  for (const stage of ['Validating the latest private save…', 'Preparing approved images…', 'Publishing to GitHub…', 'GitHub commit created:', 'Synchronizing Admin…', 'LIVE — Published successfully']) {
    assert(scoped.includes(stage), `missing real publish stage ${stage}`);
  }
  assert(polling.includes('Waiting for website deployment…'), 'exact-commit polling must expose its live wait stage');
  assert(scoped.includes('refreshVisibleAdminAreaAfterPublish()'), 'post-publish refresh must be visibility-aware');
  for (const hiddenRender of ['renderAdminProducts();\n    renderAdminDashboard();', 'renderImageImportPending();\n    setLocalStatus']) {
    assert(!scoped.includes(hiddenRender), 'scoped publish must not rebuild hidden workspaces');
  }
  assert(scoped.includes('performance?.now') && scoped.includes('publishTimingSummary'), 'publish timings must measure real work');
  assert(scoped.indexOf('waitForPublishedDeployment') < scoped.indexOf('LIVE — Published successfully'), 'LIVE success must remain impossible before exact-commit deployment polling');
  assert(scoped.includes('Published to GitHub, but live deployment has not been confirmed yet.'), 'deployment timeout must not falsely report live success or failed publication');
});

Deno.test('Edge publisher returns internal GitHub and synchronization timings', () => {
  assert(publisherSource.includes('githubPublicationMs') && publisherSource.includes('deploymentLookupMs') && publisherSource.includes('historySaveMs'), 'Edge response must separate major remote publish stages');
  assert(publisherSource.includes("payload?.action === 'save-working-state'"), 'existing Edge Function must support the reduced private-save response');
  assert(publisherSource.includes('ADMIN_WORKING_STATE_KEYS.has(key)'), 'reduced private-save action must reject unsupported Admin collections');
  assert(publisherSource.includes("payload?.action === 'deployment-status'") && publisherSource.includes('INVALID_COMMIT_HASH'), 'existing Edge publisher must expose an authenticated exact-commit deployment check');
});

function deploymentPollHarness(results) {
  const functionSource = extractedFunction('async function waitForPublishedDeployment', 'async function publishScopedChangeIds');
  let clock = 0;
  let calls = 0;
  const progress = [];
  const factory = new Function('callAdminPublisher', 'window', `${functionSource}; return waitForPublishedDeployment;`);
  const poll = factory(
    async ({ action, commitHash }) => {
      assert(action === 'deployment-status' && commitHash === 'a'.repeat(40), 'poll must check the exact published commit');
      const value = results[Math.min(calls, results.length - 1)];
      calls += 1;
      if (value instanceof Error) throw value;
      return { deploymentResult: value };
    },
    { setTimeout }
  );
  const run = (options = {}) => poll('a'.repeat(40), {
    timeoutMs: options.timeoutMs ?? 30,
    pollIntervalMs: 10,
    now: () => clock,
    wait: async (milliseconds) => { clock += milliseconds; },
    onProgress: (message, state) => progress.push({ message, state })
  });
  return { run, progress, calls: () => calls };
}

Deno.test('deployment polling waits for exact-commit success', async () => {
  const harness = deploymentPollHarness(['queued', 'in_progress', 'success']);
  const result = await harness.run();
  assert(result.confirmed && result.status === 'success' && result.checks === 3, 'queued deployment must be polled through success');
  assert(harness.progress.every((entry) => entry.message === 'Waiting for website deployment…' && entry.state === 'publishing'), 'every wait must remain visibly in progress');
});

Deno.test('deployment polling distinguishes failure from timeout', async () => {
  const failure = await deploymentPollHarness(['queued', 'failure']).run();
  assert(failure.failed && !failure.confirmed && failure.status === 'failure', 'terminal deployment failure must be reported');
  const timeout = await deploymentPollHarness(['queued']).run({ timeoutMs: 20 });
  assert(timeout.timeout && !timeout.failed && !timeout.confirmed && timeout.status === 'queued', 'timeout must remain an unconfirmed GitHub publication, not a false failure');
});
