(function installCategoryPublisher(root) {
  const clone = (value) => structuredClone(value || {});
  const validImage = (value) => /^images\/[A-Za-z0-9_./ '\-]+\.(?:png|jpe?g|webp|gif)$/i.test(String(value || ''))
    && !String(value).includes('..') && !String(value).includes('\\');

  function defaultPublishableCategory(category = {}) {
    return {
      key: String(category.key || ''),
      ...(category.parentKey ? { parentKey: String(category.parentKey) } : {}),
      title: String(category.title || category.key || 'Untitled category'),
      description: String(category.description || ''),
      funFact: String(category.funFact || ''),
      page: String(category.page || ''),
      visible: category.visible !== false,
      homepageVisible: !category.parentKey && category.homepageVisible !== false,
      order: Number(category.order || 0),
      card: {
        title: category.card?.titleOverride === true ? String(category.card.title || '') : '',
        description: category.card?.descriptionOverride === true ? String(category.card.description || '') : '',
        image: validImage(category.card?.image) ? String(category.card.image) : '',
        backgroundImage: validImage(category.card?.backgroundImage) ? String(category.card.backgroundImage) : ''
      },
      displaySettings: clone(category.displaySettings || {})
    };
  }

  function buildScopedCategorySnapshot({
    publishedSnapshot = {}, draftCategory = {}, categoryKey = draftCategory.key,
    serializeCategory = defaultPublishableCategory
  } = {}) {
    const snapshot = clone(publishedSnapshot);
    const category = serializeCategory({ ...draftCategory, key: categoryKey });
    snapshot.version = 1;
    snapshot.schemaVersion = Math.max(2, Number(snapshot.schemaVersion) || 0);
    snapshot.categories = { ...(snapshot.categories || {}), [categoryKey]: category };
    snapshot.deletedCategories = (snapshot.deletedCategories || []).filter((key) => key !== categoryKey);
    return snapshot;
  }

  async function waitForDeployment(callPublisher, commitHash, {
    onProgress = () => {}, timeoutMs = 120000, pollIntervalMs = 3000,
    now = () => globalThis.performance?.now?.() ?? Date.now(),
    wait = (milliseconds) => new Promise((resolve) => root.setTimeout(resolve, milliseconds))
  } = {}) {
    const startedAt = now();
    let checks = 0;
    let status = 'queued';
    let publishHistory = [];
    while (now() - startedAt <= timeoutMs) {
      onProgress('Waiting for website deployment…', 'publishing');
      try {
        const result = await callPublisher({ action: 'deployment-status', commitHash });
        checks += 1;
        status = String(result?.deploymentResult || 'unknown').toLowerCase();
        publishHistory = Array.isArray(result?.publishHistory) ? result.publishHistory : publishHistory;
        if (['success', 'active'].includes(status)) return { confirmed: true, status, checks, publishHistory };
        if (['failure', 'error', 'inactive'].includes(status)) return { confirmed: false, failed: true, status, checks, publishHistory };
      } catch (_error) {
        checks += 1;
        status = 'unknown';
      }
      const elapsed = now() - startedAt;
      if (elapsed >= timeoutMs) break;
      await wait(Math.min(pollIntervalMs, timeoutMs - elapsed));
    }
    return { confirmed: false, timeout: true, status, checks, publishHistory };
  }

  async function publishCategoryByKey(categoryKey, options = {}) {
    const progress = options.onProgress || (() => {});
    if (!categoryKey || typeof options.saveApprovedDraft !== 'function') return { ok: false, stage: 'validation' };
    progress('Saving Category…', 'publishing');
    const draftCategory = await options.saveApprovedDraft(categoryKey);
    if (!draftCategory) {
      progress('Publish stopped: Category draft could not be saved.', 'failed');
      return { ok: false, stage: 'save' };
    }
    if (!draftCategory.parentKey && !validImage(draftCategory.card?.image)) {
      progress('Publish stopped: choose a valid Category image first.', 'failed');
      return { ok: false, stage: 'validation' };
    }
    progress('Validating latest private save…', 'publishing');
    const publishedSnapshot = await options.loadPublishedSnapshot();
    const snapshot = buildScopedCategorySnapshot({
      publishedSnapshot, draftCategory, categoryKey,
      serializeCategory: options.serializeCategory || defaultPublishableCategory
    });
    const previous = publishedSnapshot?.categories?.[categoryKey] || null;
    const current = snapshot.categories?.[categoryKey] || null;
    if (JSON.stringify(previous) === JSON.stringify(current)) {
      progress('Published — no unpublished Category changes.', 'published');
      return { ok: true, unchanged: true, snapshot };
    }
    if (options.confirmPublish && !options.confirmPublish(draftCategory)) {
      progress('Publish canceled. Draft Saved.', 'draft');
      return { ok: false, canceled: true, stage: 'confirm' };
    }
    progress('Preparing approved images…', 'publishing');
    const imageFiles = await options.prepareImages?.(previous, current) || [];
    progress('Publishing to GitHub…', 'publishing');
    const result = await options.callPublisher({
      action: 'publish',
      title: `Publish ${String(draftCategory.title || categoryKey).slice(0, 64)}`,
      body: `- Updated category: ${draftCategory.title || categoryKey}`,
      changeSummary: `- Updated category: ${draftCategory.title || categoryKey}`,
      snapshot,
      imageFiles
    });
    if (!result?.commitHash) throw new Error('Category publish did not return a GitHub commit hash.');
    progress(`GitHub commit created: ${result.commitHash.slice(0, 7)}.`, 'publishing');
    const deployment = await waitForDeployment(options.callPublisher, result.commitHash, { onProgress: progress, ...(options.deploymentOptions || {}) });
    await options.synchronizePublishedState?.(snapshot, result, deployment);
    if (deployment.confirmed) {
      progress('Published to Website', 'published');
      return { ok: true, snapshot, result, deployment };
    }
    if (deployment.failed) {
      progress(`Publish failed during website deployment: ${deployment.status}.`, 'failed');
      return { ok: false, snapshot, result, deployment, stage: 'deployment' };
    }
    progress(`Published to GitHub, but live deployment has not been confirmed. Commit ${result.commitHash.slice(0, 7)}.`, 'pending');
    return { ok: true, pending: true, snapshot, result, deployment };
  }

  root.MVPLUX_CATEGORY_PUBLISHER = Object.freeze({
    buildScopedCategorySnapshot,
    defaultPublishableCategory,
    publishCategoryByKey,
    waitForDeployment
  });
})(window);
