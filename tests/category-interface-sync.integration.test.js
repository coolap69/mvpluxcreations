function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function resolver() {
  const source = await Deno.readTextFile(new URL('../category-presentation.js', import.meta.url));
  const window = {};
  new Function('window', source)(window);
  return window.MVPLUX_CATEGORY_PRESENTATION.resolveCategoryPresentation;
}

const publishedSports = {
  key: 'sports', title: 'Published Sports', description: 'Published description', funFact: 'Published fact',
  page: 'sports-legends.html', visible: true, homepageVisible: true, order: 4,
  card: { image: 'images/published.png', backgroundImage: '' },
  displaySettings: { standeeSizePercent: 70, standeeLeftPercent: 0, backgroundPosition: '50% 100%' }
};

const draftSports = {
  ...publishedSports, title: 'Draft Sports', description: 'Draft description', order: 2,
  card: { image: 'images/draft.png', backgroundImage: 'images/draft-background.png' },
  displaySettings: {
    standeeSizePercent: 142, standeeLeftPercent: 18, standeeVerticalPercent: -7,
    backgroundPosition: '25% 80%', backgroundSizePercent: 165,
    titleLeftPercent: 4, titleVerticalPercent: -3, titleSizePercent: 125, titleAlign: 'left',
    descriptionLeftPercent: -5, descriptionVerticalPercent: 8, descriptionSizePercent: 110, descriptionAlign: 'right'
  }
};

Deno.test('Dashboard and Storefront Admin Mode resolve the same normalized Category presentation', async () => {
  const resolve = await resolver();
  const options = { mode: 'draft', defaultBackground: 'images/shared.png', globalDisplaySettings: {} };
  const dashboard = resolve(draftSports, options);
  const adminMode = resolve(draftSports, options);
  assert(JSON.stringify(dashboard) === JSON.stringify(adminMode), 'both Admin interfaces must use one effective Category presentation');
  assert(dashboard.image === 'images/draft.png' && dashboard.display.standeeSizePercent === 142, 'Dashboard image size must be visible in Admin Mode');
  assert(adminMode.display.standeeLeftPercent === 18, 'Admin Mode image X must be visible in Dashboard');
  assert(adminMode.background === 'images/draft-background.png' && adminMode.display.backgroundSizePercent === 165, 'background override and zoom must match');
});

Deno.test('customer mode stays published while Admin preview uses the saved draft', async () => {
  const resolve = await resolver();
  const published = resolve(publishedSports, { mode: 'published', defaultBackground: 'images/shared.png' });
  const draft = resolve(draftSports, { mode: 'draft', defaultBackground: 'images/shared.png' });
  assert(published.title === 'Published Sports' && published.image === 'images/published.png', 'customer presentation must remain published');
  assert(draft.title === 'Draft Sports' && draft.image === 'images/draft.png', 'Admin preview must use the saved private Category');
  assert(published.mode === 'published' && draft.mode === 'draft', 'presentation mode must stay explicit');
});

Deno.test('shared resolver owns every supported Category visual field and background fallback', async () => {
  const resolve = await resolver();
  const presentation = resolve(draftSports, { mode: 'draft', defaultBackground: 'images/shared.png' });
  for (const field of [
    'standeeSizePercent', 'standeeLeftPercent', 'standeeVerticalPercent', 'backgroundPosition', 'backgroundSizePercent',
    'titleLeftPercent', 'titleVerticalPercent', 'titleSizePercent', 'titleAlign',
    'descriptionLeftPercent', 'descriptionVerticalPercent', 'descriptionSizePercent', 'descriptionAlign'
  ]) assert(presentation.display[field] !== undefined, `shared presentation is missing ${field}`);
  const inherited = resolve({ ...draftSports, card: { image: 'images/draft.png' }, displaySettings: {} }, {
    mode: 'draft', defaultBackground: 'images/shared.png'
  });
  assert(inherited.background === 'images/shared.png', 'blank custom background must inherit the shared background');
});

Deno.test('inline Category editor has no competing visibility, order, background, or page override fields', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const markup = source.slice(source.indexOf('function inlineCategoryEditorMarkup'), source.indexOf('function categoryDisplaySettingsFromForm'));
  const save = source.slice(source.indexOf('async function saveInlineRecordEditor'), source.indexOf('function openInlineRecordEditor'));
  const filter = source.slice(source.indexOf('function withoutProductOwnedPageValues'), source.indexOf('function getInlineAdminPageEdits'));
  for (const field of ['funFact', 'homepageVisible', 'cardImage', 'cardBackgroundImage', 'displayBackgroundSizePercent',
    'displayStandeeSizePercent', 'displayStandeeLeftPercent', 'displayStandeeVerticalPercent',
    'displayTitleSizePercent', 'displayTitleLeftPercent', 'displayTitleVerticalPercent',
    'displayDescriptionSizePercent', 'displayDescriptionLeftPercent', 'displayDescriptionVerticalPercent']) {
    assert(markup.includes(`name="${field}"`), `inline Category editor is missing ${field}`);
  }
  assert(!markup.includes('name="cardVisible"') && !markup.includes('name="cardOrder"') && !markup.includes('name="displayBackgroundImage"'), 'legacy duplicate owners must not remain editable');
  assert(save.includes("['title', 'description', 'funFact', 'page', 'visible', 'homepageVisible', 'order']"), 'inline root save must target normalized Category fields');
  assert(filter.includes("owned?.type === 'category-card'") && filter.includes('src: _src') && filter.includes('scale: _scale'), 'legacy Category page overrides must be stripped before rendering');
  const visibility = source.slice(source.indexOf('async function setInlineAdminCardHidden'), source.indexOf('async function deleteInlineAdminCard'));
  assert(visibility.includes('card.dataset.adminCategoryKey') && visibility.includes('homepageVisible: !hiddenValue'), 'inline Category-card hiding must save normalized homepageVisible');
  assert(visibility.indexOf('homepageVisible: !hiddenValue') < visibility.indexOf('getInlineAdminDraft()'), 'normalized Category visibility must return before the legacy page-edit path');
});

Deno.test('interface switching is navigation-only and preserves private drafts and the Supabase session', async () => {
  const [source, adminHtml] = await Promise.all([
    Deno.readTextFile(new URL('../script.js', import.meta.url)),
    Deno.readTextFile(new URL('../admin.html', import.meta.url))
  ]);
  const turnOff = source.slice(source.indexOf('function turnOffInlineAdminMode'), source.indexOf('function installInlineAdminMode'));
  assert(source.includes('Open Dashboard to Publish') && source.includes('href="admin.html#categories"'), 'Admin Mode must link clearly to the Dashboard publishing workflow');
  assert(adminHtml.includes('View/Edit on Website') && adminHtml.includes('index.html?adminView=edit#home'), 'Dashboard must link clearly to storefront editing');
  assert(!turnOff.includes('signOut') && !turnOff.includes('mvpluxLiveAdminSettings') && !turnOff.includes('categories'), 'turning off Admin Mode must not sign out or discard Category drafts');
  assert((source.match(/\.auth\.signOut\(/g) || []).length === 1, 'only explicit Log Out may call Supabase signOut');
});

Deno.test('Storefront Category movement controls save the same normalized display fields as Dashboard', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const start = source.indexOf('function inlineCategoryDisplayPatch');
  const end = source.indexOf('\n\nfunction applySavedInlineCategoryDisplay', start);
  const inlineCategoryDisplayPatch = new Function('dependencies', `
    const { inlineAdminOwnedField, getEffectiveCategoryPresentation, getInlineAdminImageFrame } = dependencies;
    ${source.slice(start, end)}
    return inlineCategoryDisplayPatch;
  `)({
    inlineAdminOwnedField: () => ({ type: 'category-card', categoryKey: 'sports' }),
    getEffectiveCategoryPresentation: () => ({ display: { standeeSizePercent: 80, standeeLeftPercent: 10, standeeVerticalPercent: -5 } }),
    getInlineAdminImageFrame: () => ({ getBoundingClientRect: () => ({ width: 400, height: 200 }) })
  });
  const patch = inlineCategoryDisplayPatch({}, { x: 40, y: 20, scale: 1.5 });
  assert(patch.standeeSizePercent === 120, 'Storefront Size must map to normalized standeeSizePercent');
  assert(patch.standeeLeftPercent === 20, 'Storefront horizontal movement must map to normalized standeeLeftPercent');
  assert(patch.standeeVerticalPercent === 5, 'Storefront vertical movement must map to normalized standeeVerticalPercent');

  const persistence = source.slice(source.indexOf('async function persistInlineOwnedDisplay'), source.indexOf('function scheduleInlineOwnedDisplaySave'));
  const inlineSave = source.slice(source.indexOf('function saveInlineAdminEdit'), source.indexOf('function scheduleInlineAdminAutoSave'));
  assert(persistence.includes("saveStorefrontCategoryPatch(owned.categoryKey, 'displaySettings', patch"), 'Category toolbar placement must use the shared normalized private Category save');
  assert(inlineSave.includes("['product', 'category-card'].includes(owned.type)"), 'Category and Product toolbar movement must enter the same owned-display save path');
  assert(!inlineSave.includes('Open Edit selected item to save Category placement'), 'the old visual-only Category movement path must be removed');
  const movement = source.slice(source.indexOf('function changeSelectedInlineAdminImage'), source.indexOf('function getInlineAdminImageFrame'));
  assert(movement.includes("owned?.type === 'category-card'") && movement.includes('Category rotation is not a shared Dashboard setting'), 'unsupported Category rotation must not pretend to save a visual-only override');
});

Deno.test('switching modes waits for in-flight normalized saves before reloading', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const fieldFlush = source.slice(source.indexOf('async function flushInlineOwnedFieldSaves'), source.indexOf('function inlineCategoryDisplayPatch'));
  const displayFlush = source.slice(source.indexOf('async function flushInlineOwnedDisplaySaves'), source.indexOf('function inlineAdminKey'));
  assert(source.includes('const inlineOwnedFieldSaves = new Map()') && source.includes('const inlineOwnedDisplaySaves = new Map()'), 'owned saves must remain tracked after their debounce timer fires');
  assert(fieldFlush.indexOf('await Promise.all([...inlineOwnedFieldSaves.values()])') < fieldFlush.indexOf('if (!inlineOwnedFieldTimers.size) return true'), 'text save flush must await an in-flight Supabase write before allowing view navigation');
  assert(displayFlush.indexOf('await Promise.all([...inlineOwnedDisplaySaves.values()])') < displayFlush.indexOf('if (!inlineOwnedDisplayTimers.size) return true'), 'visual save flush must await an in-flight Supabase write before allowing view navigation');
});

Deno.test('Admin view labels distinguish private drafts from the published customer website', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const labels = source.slice(source.indexOf('function renderAdminViewModeLabel'), source.indexOf('async function toggleCurrentPageAdminMode'));
  assert(labels.includes('Edit Mode — changes save privately'), 'Edit Mode must identify private saving');
  assert(labels.includes('Previewing Saved Draft — not live'), 'Preview mode must identify the saved draft as not live');
  assert(labels.includes('Customer View — published website'), 'Published mode must identify the actual customer version');
});

Deno.test('Dashboard preview and storefront rendering both call the shared resolver', async () => {
  const [adminSource, storefrontSource] = await Promise.all([
    Deno.readTextFile(new URL('../admin.js', import.meta.url)),
    Deno.readTextFile(new URL('../script.js', import.meta.url))
  ]);
  assert(adminSource.includes('effectiveAdminCategoryPresentation(category)') && adminSource.includes('MVPLUX_CATEGORY_PRESENTATION.resolveCategoryPresentation'), 'Dashboard preview must use shared resolver');
  assert(storefrontSource.includes('getEffectiveCategoryPresentation(category.key)') && storefrontSource.includes('MVPLUX_CATEGORY_PRESENTATION.resolveCategoryPresentation'), 'storefront/Admin Mode must use shared resolver');
});

Deno.test('every Category-capable interface loads the shared resolver before its editor or renderer', async () => {
  const pages = [
    'index.html', 'category.html', 'sports-legends.html', 'movie-inspired.html', 'music-artists.html',
    'people-public-figures.html', 'religious-cutouts.html', 'holiday-cutouts.html', 'dinosaur-cutouts.html',
    'fan-inspired.html', 'videogame-cutouts.html', 'custom-photo-cutouts.html', 'small-cutout-party-packs.html',
    'standee.html', 'custom-order.html', 'signin.html', 'signup.html'
  ];
  for (const page of pages) {
    const html = await Deno.readTextFile(new URL(`../${page}`, import.meta.url));
    const resolver = html.indexOf('category-presentation.js?v=');
    const storefront = html.indexOf('script.js?v=');
    assert(resolver >= 0 && storefront > resolver, `${page} must load the shared Category resolver before storefront code`);
  }
  const admin = await Deno.readTextFile(new URL('../admin.html', import.meta.url));
  assert(admin.indexOf('category-presentation.js?v=') < admin.indexOf('admin.js?v='), 'Dashboard must load the same resolver before admin.js');
});
