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
    'categoryPublishOperations', 'readAdminCategories', 'setStatus', 'setCategoryPublishState',
    'saveCategoryEditForm', 'saveAdminCollectionOperations', 'adminLastSaveError', 'publishScopedChangeIds',
    `${functionSource}; return publishCategoryByKey;`
  );
  const publish = factory(
    operations,
    () => ({ sports: { key: 'sports', title: 'Sports', card: { image: 'images/sports.png' } } }),
    () => {},
    (key, message, state) => { operations.set(key, { message, state }); states.push({ key, message, state }); },
    async () => { saveCalls += 1; if (deferredSave) await deferredSave; return saveResult; },
    async () => { saveCalls += 1; if (deferredSave) await deferredSave; return { ok: saveResult }; },
    'Private save failed.',
    async (ids, _label, _target, options) => {
      publishCalls += 1;
      assert(ids.length === 1 && ids[0] === 'category:sports', 'Category publish must remain scoped to one Category');
      options.onProgress('Sending the scoped update to GitHub…', 'publishing');
      options.onProgress(publishResult ? 'Published successfully.' : 'Publish Failed — test', publishResult ? 'published' : 'failed');
      return publishResult;
    }
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
  assert(await first, 'the real scoped publish result must be returned');
  assert(harness.counts().publishCalls === 1, 'the existing scoped publisher must be called exactly once');
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
});

Deno.test('scoped publishing reports real stages and refreshes only the visible Admin area', () => {
  const scoped = extractedFunction('async function publishScopedChangeIds', 'async function publishExistingProductForm');
  for (const stage of ['Validating the latest private save…', 'Preparing approved images…', 'Sending the scoped update to GitHub…', 'Synchronizing Admin state…', 'GitHub published successfully']) {
    assert(scoped.includes(stage), `missing real publish stage ${stage}`);
  }
  assert(scoped.includes('refreshVisibleAdminAreaAfterPublish()'), 'post-publish refresh must be visibility-aware');
  for (const hiddenRender of ['renderAdminProducts();\n    renderAdminDashboard();', 'renderImageImportPending();\n    setLocalStatus']) {
    assert(!scoped.includes(hiddenRender), 'scoped publish must not rebuild hidden workspaces');
  }
  assert(scoped.includes('performance?.now') && scoped.includes('publishTimingSummary'), 'publish timings must measure real work');
  assert(scoped.includes('Website deployment is queued and may take 10–30+ seconds.'), 'queued Pages deployment must be stated honestly without pretending the live deployment already finished');
});

Deno.test('Edge publisher returns internal GitHub and synchronization timings', () => {
  assert(publisherSource.includes('githubPublicationMs') && publisherSource.includes('deploymentLookupMs') && publisherSource.includes('historySaveMs'), 'Edge response must separate major remote publish stages');
  assert(publisherSource.includes("payload?.action === 'save-working-state'"), 'existing Edge Function must support the reduced private-save response');
  assert(publisherSource.includes('ADMIN_WORKING_STATE_KEYS.has(key)'), 'reduced private-save action must reject unsupported Admin collections');
});
