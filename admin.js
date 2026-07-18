const adminProducts = [
  {
    slug: 'sport-legend-standee',
    title: 'Sport Legend Standees',
    description: 'Shop sports-inspired standee styles, then choose different players, sizes, and background options inside the category.',
    originalHeight: 78,
    cutoutImage: 'images/FrontPageWeb/Sports-Kobe-KB1forprint.png',
    backgroundImage: 'images/FanBackgrounds/top-favorite-stage-gold.png'
  },
  {
    slug: 'movie-character-standee',
    title: 'Movie Character Standees',
    description: 'Browse movie-style standee categories and see more character looks, poses, and display backgrounds inside.',
    originalHeight: 74,
    cutoutImage: 'images/MovieCharacterStandees/Endorskeleton/Endornobackground.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'people-public-figure-standee',
    title: 'People & Public Figure Standees',
    description: 'Plan actor, creator, historical figure, public speaker, or lookalike-style display ideas.',
    originalHeight: 78,
    cutoutImage: 'images/PeoplePublicFigureStandees/President/Nobackgroubd.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'music-artist-standee',
    title: 'Music Artist Standees',
    description: 'Explore concert-style standee categories with different performers, stage looks, and custom display choices.',
    originalHeight: 69,
    cutoutImage: 'images/FrontPageWeb/Music-MJackson-MJTR.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'faith-celebration-standee',
    title: 'Faith & Celebration Standees',
    description: 'View inspirational and celebration display categories for churches, holidays, events, rooms, and plays.',
    originalHeight: 72,
    cutoutImage: 'images/FrontPageWeb/Religious-J13D.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'holiday-standee',
    title: 'Holiday Standees',
    description: 'Seasonal displays for Christmas, Halloween, Easter, Valentine events, parties, and storefronts.',
    originalHeight: 78,
    cutoutImage: 'images/FrontPageWeb/Herobackgroundparts-hero8T.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'fan-request-standee',
    title: 'Fan Request Standees',
    description: 'See fan-inspired ideas, mashups, and custom concepts that can become full-size display pieces.',
    originalHeight: 69,
    cutoutImage: 'images/FrontPageWeb/Music-MJackson-MJzombie.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'dinosaur-party-standee',
    title: 'Dinosaur & Creature Standees',
    description: 'Shop dinosaur and creature-style displays for birthdays, rooms, outdoor setups, and big party moments.',
    originalHeight: 96,
    cutoutImage: 'images/FrontPageWeb/Dinosaurs-JPRex.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'game-fantasy-standee',
    title: 'Game & Fantasy Standees',
    description: 'Browse game-room, fantasy, stream, and themed-event standee categories with custom scene options.',
    originalHeight: 72,
    cutoutImage: 'images/FrontPageWeb/Herobackgroundparts-hero10E.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'custom-photo-standee',
    title: 'Custom Photo Standees',
    description: 'Turn your own photo, family member, athlete, or guest of honor into a custom standee display.',
    originalHeight: 66,
    cutoutImage: 'images/FrontPageWeb/Herobackgroundparts-hero7T.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'small-standee-party-pack',
    title: 'Party Pack Standees',
    description: 'Shop smaller standee packs for tables, birthdays, rooms, gifts, and party displays.',
    originalHeight: 36,
    cutoutImage: 'images/FrontPageWeb/Herobackgroundparts-hero8T.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  }
];

const adminCharacterProducts = (window.MVPLUX_PRODUCT_CATALOG || []).map((product) => ({ ...product }));

function clearLegacyAdminBrowserStorage() {
  localStorage.removeItem('mvpluxAdminAnywhereLegacy');
}

let adminLiveSettings = null;
let adminHomepageLiveEdits = {};
let adminPageLiveEdits = {};
let adminSaveQueue = Promise.resolve(true);
let adminSavePending = 0;
let adminLastSaveSucceeded = null;
let adminLastSaveError = '';
let adminLatestPublishError = '';
let adminPublishedFileState = { reachable: false, publishedAt: null, commitHash: '' };
let adminTestModeState = { enabled: false, customerType: 'guest' };

function getAdminClient() {
  return window.getMvpluxSupabaseClient?.() || null;
}

function getAdminLiveValue(key, fallback) {
  if (adminLiveSettings && Object.prototype.hasOwnProperty.call(adminLiveSettings, key)) {
    return adminLiveSettings[key];
  }
  return fallback;
}

function updateAdminLiveSettings(patch) {
  adminLiveSettings = { ...(adminLiveSettings || {}), ...(patch || {}) };
  return adminLiveSettings;
}

async function loadAdminLiveSettings() {
  const client = getAdminClient();
  if (!client?.from) return null;

  const { data, error } = await client
    .from('site_edits')
    .select('page_key, edits');

  if (error) {
    adminLastSaveError = `Supabase reload failed: ${error.message || 'unknown error'}`;
    renderAdminDiagnostics();
    return null;
  }
  adminLiveSettings = data?.find((row) => row.page_key === 'admin-global')?.edits || {};
  adminHomepageLiveEdits = data?.find((row) => row.page_key === 'index.html')?.edits || {};
  adminPageLiveEdits = Object.fromEntries(
    (data || [])
      .filter((row) => row.page_key !== 'admin-global' && row.edits && typeof row.edits === 'object')
      .map((row) => [String(row.page_key || '').toLowerCase(), row.edits])
  );
  return adminLiveSettings;
}

async function saveAdminSettingsLive(patch) {
  updateAdminLiveSettings(patch);
  adminSavePending += 1;
  renderAdminDiagnostics();

  const save = async () => {
    const client = getAdminClient();
    try {
      if (!client?.from || !client?.auth) throw new Error('Supabase is not ready.');
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      const user = sessionData?.session?.user;
      if (!user) throw new Error('Sign in as admin to save live.');

      const nextSettings = { ...(adminLiveSettings || {}) };
      const { error } = await client
        .from('site_edits')
        .upsert({
          page_key: 'admin-global',
          edits: nextSettings,
          updated_by: user.id,
          updated_at: new Date().toISOString()
        }, { onConflict: 'page_key' });
      if (error) throw error;

      adminLastSaveSucceeded = true;
      adminLastSaveError = '';
      return true;
    } catch (error) {
      adminLastSaveSucceeded = false;
      adminLastSaveError = error?.message || 'Unknown Supabase error.';
      setStatus(`Live save failed: ${adminLastSaveError}`);
      if (adminSavePending === 1) await loadAdminLiveSettings();
      return false;
    } finally {
      adminSavePending = Math.max(0, adminSavePending - 1);
      renderAdminDiagnostics();
      renderPublishSummary();
    }
  };

  const result = adminSaveQueue.then(save, save);
  adminSaveQueue = result.then(() => true, () => true);
  return result;
}

async function waitForAdminSaves() {
  await adminSaveQueue;
  return adminLastSaveSucceeded !== false;
}

async function requireSupabaseAdminAccess() {
  const client = getAdminClient();
  if (!client?.auth) {
    setCommerceStatus('Supabase is not loaded yet.');
    return false;
  }

  const { data: sessionData } = await client.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) {
    window.location.href = 'signin.html';
    return false;
  }

  setAdminSignedInAs(`Signed in as ${user.email || 'admin user'}`);

  const { data, error } = await client
    .from('admin_profiles')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) {
    localStorage.removeItem('mvpluxAdminSignedIn');
    setCommerceStatus(`You are signed in as ${user.email || 'this account'}, but it is not admin yet. In Supabase, add this user ID to admin_profiles: ${user.id}`);
    return false;
  }

  localStorage.removeItem('mvpluxAdminSignedIn');
  localStorage.setItem('mvpluxCustomerSignedIn', 'true');
  localStorage.setItem('mvpluxSignedInName', user.user_metadata?.screen_name || user.email?.split('@')[0] || 'Admin');
  return true;
}

function renderAdminTestMode() {
  const enabled = Boolean(adminTestModeState.enabled);
  const warning = document.getElementById('adminTestModeWarning');
  const checkbox = document.getElementById('adminTestModeEnabled');
  const customerType = document.getElementById('adminTestCustomerType');
  if (warning) warning.hidden = !enabled;
  if (checkbox) checkbox.checked = enabled;
  if (customerType) {
    customerType.value = adminTestModeState.customerType || 'guest';
    customerType.disabled = !enabled;
  }
  document.body.classList.toggle('admin-test-mode-active', enabled);
}

async function loadAdminTestMode() {
  const client = getAdminClient();
  if (!client) return;
  const { data, error } = await client.rpc('get_admin_test_mode');
  if (error) {
    setCommerceStatus(`Test Mode is unavailable until its database migration is applied. ${error.message || error}`);
    return;
  }
  adminTestModeState = {
    enabled: Boolean(data?.enabled),
    customerType: data?.customer_type === 'member' ? 'member' : 'guest'
  };
  renderAdminTestMode();
}

function setupAdminTestMode() {
  const form = document.getElementById('adminTestModeForm');
  const checkbox = document.getElementById('adminTestModeEnabled');
  checkbox?.addEventListener('change', () => {
    const customerType = document.getElementById('adminTestCustomerType');
    if (customerType) customerType.disabled = !checkbox.checked;
  });
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const client = getAdminClient();
    const button = form.querySelector('button[type="submit"]');
    if (!client || !button) return;
    button.disabled = true;
    button.textContent = 'Saving...';
    const enabled = Boolean(checkbox?.checked);
    const customerType = document.getElementById('adminTestCustomerType')?.value === 'member' ? 'member' : 'guest';
    const { data, error } = await client.rpc('set_admin_test_mode', {
      p_enabled: enabled,
      p_customer_type: customerType
    });
    button.disabled = false;
    button.textContent = 'Save Test Mode';
    if (error) {
      setCommerceStatus(`Could not save Test Mode. ${error.message || error}`);
      await loadAdminTestMode();
      return;
    }
    adminTestModeState = { enabled: Boolean(data?.enabled), customerType: data?.customer_type || customerType };
    renderAdminTestMode();
    setCommerceStatus(enabled
      ? 'TEST MODE enabled. No real payment destinations or customer emails will be used for test records.'
      : 'Test Mode is off. Normal customer behavior is active.');
  });
}

const extraImageItems = [
  { key: 'wanted-basketball-cutout', group: 'Most Wanted', label: 'Sport Legend standee', fallback: 'images/FrontPageWeb/Sports-Kobe-KB1forprint.png' },
  { key: 'wanted-basketball-bg', group: 'Most Wanted', label: 'Basketball Legend background', fallback: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-premium.jpg' },
  { key: 'wanted-movie-cutout', group: 'Most Wanted', label: 'Movie Inspired standee', fallback: 'images/MovieCharacterStandees/Endorskeleton/Endornobackground.png' },
  { key: 'wanted-movie-bg', group: 'Most Wanted', label: 'Movie Inspired background', fallback: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-premium.jpg' },
  { key: 'wanted-music-cutout', group: 'Most Wanted', label: 'Music Artist standee', fallback: 'images/FrontPageWeb/Music-MJackson-MJTR.png' },
  { key: 'wanted-music-bg', group: 'Most Wanted', label: 'Music Artist background', fallback: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-premium.jpg' },
  { key: 'wanted-dinosaur-cutout', group: 'Most Wanted', label: 'Dinosaur Movie standee', fallback: 'images/FrontPageWeb/Dinosaurs-JPRex.png' },
  { key: 'wanted-dinosaur-bg', group: 'Most Wanted', label: 'Dinosaur Movie background', fallback: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-premium.jpg' },
  { key: 'wanted-custom-cutout', group: 'Most Wanted', label: 'Custom Mashup standee', fallback: 'images/FrontPageWeb/Music-MJackson-MJzombie.png' },
  { key: 'wanted-custom-bg', group: 'Most Wanted', label: 'Custom Mashup background', fallback: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-premium.jpg' },
  { key: 'gallery-hero-cutout', group: 'Gallery', label: 'Golden Hero standee', fallback: 'images/FrontPageWeb/Religious-J13D.png' },
  { key: 'gallery-hero-bg', group: 'Gallery', label: 'Golden Hero background', fallback: 'images/FrontPageWeb/FanBackgrounds-gallery-poster-heroic.jpg' },
  { key: 'gallery-adventure-cutout', group: 'Gallery', label: 'Dinosaur Movie Night standee', fallback: 'images/FrontPageWeb/Dinosaurs-JPRex.png' },
  { key: 'gallery-adventure-bg', group: 'Gallery', label: 'Dinosaur Movie Night background', fallback: 'images/FrontPageWeb/FanBackgrounds-gallery-poster-adventure.jpg' },
  { key: 'gallery-vip-cutout', group: 'Gallery', label: 'VIP Spotlight standee', fallback: 'images/FrontPageWeb/Music-TS-TSfinal.png' },
  { key: 'gallery-vip-bg', group: 'Gallery', label: 'VIP Spotlight background', fallback: 'images/FrontPageWeb/FanBackgrounds-gallery-poster-premium.jpg' }
];

function withoutStoredProductPrice(product = {}) {
  const { originalPrice, ...heightBasedProduct } = product;
  return heightBasedProduct;
}

function cleanAdminProductMap(products = {}) {
  return Object.fromEntries(
    Object.entries(products || {}).map(([slug, product]) => [slug, withoutStoredProductPrice(product)])
  );
}

function readAdminProducts() {
  return cleanAdminProductMap(getAdminLiveValue('products', readJsonStorage('mvpluxAdminProducts', {})));
}

function writeAdminProducts(products) {
  const cleanedProducts = cleanAdminProductMap(products);
  return saveAdminSettingsLive({ products: cleanedProducts }).then((saved) => {
    if (saved) localStorage.setItem('mvpluxAdminProducts', JSON.stringify(cleanedProducts));
    return saved ? cleanedProducts : null;
  });
}

function readCustomProducts() {
  return getAdminLiveValue('customProducts', readJsonStorage('mvpluxAdminCustomProducts', []))
    .map(withoutStoredProductPrice);
}

function normalizeImageChoices(choices = []) {
  const seen = new Set();
  return (Array.isArray(choices) ? choices : []).flatMap((choice) => {
    const image = String(choice?.image || '').trim();
    if (!image || seen.has(image)) return [];
    seen.add(image);
    const stage = String(choice?.stage || '').trim();
    return [{ label: String(choice?.label || '').trim() || 'Alternate image', image, ...(stage ? { stage } : {}) }];
  });
}

function writeCustomProducts(products) {
  const cleanedProducts = (products || []).map(withoutStoredProductPrice);
  return saveAdminSettingsLive({ customProducts: cleanedProducts }).then((saved) => {
    if (saved) localStorage.setItem('mvpluxAdminCustomProducts', JSON.stringify(cleanedProducts));
    return saved ? cleanedProducts : null;
  });
}

function readArchivedProducts() {
  return getAdminLiveValue('savedForLaterProducts', readJsonStorage('mvpluxAdminArchivedProducts', []));
}

function writeArchivedProducts(slugs) {
  const values = slugs || [];
  return saveAdminSettingsLive({ savedForLaterProducts: values }).then((saved) => {
    if (saved) localStorage.setItem('mvpluxAdminArchivedProducts', JSON.stringify(values));
    return saved ? values : null;
  });
}

function readDeletedProducts() {
  return getAdminLiveValue('deletedProducts', readJsonStorage('mvpluxDeletedProducts', []));
}

function writeDeletedProducts(slugs) {
  const deletedProducts = [...new Set(slugs || [])];
  return saveAdminSettingsLive({ deletedProducts }).then((saved) => {
    if (saved) localStorage.setItem('mvpluxDeletedProducts', JSON.stringify(deletedProducts));
    return saved ? deletedProducts : null;
  });
}

function readPriceSettings() {
  return getAdminLiveValue('priceSettings', readJsonStorage('mvpluxAdminPriceSettings', {}));
}

function writePriceSettings(settings) {
  localStorage.setItem('mvpluxAdminPriceSettings', JSON.stringify(settings || {}));
  updateAdminLiveSettings({ priceSettings: settings || {} });
  saveAdminSettingsLive({ priceSettings: settings || {} });
  return settings;
}

function readExtraImages() {
  return getAdminLiveValue('extraImages', readJsonStorage('mvpluxAdminExtraImages', {}));
}

function writeExtraImages(images) {
  localStorage.setItem('mvpluxAdminExtraImages', JSON.stringify(images || {}));
  updateAdminLiveSettings({ extraImages: images || {} });
  saveAdminSettingsLive({ extraImages: images || {} });
  return images;
}

function readCoupons() {
  return getAdminLiveValue('coupons', readJsonStorage('mvpluxAdminCoupons', []));
}

function writeCoupons(coupons) {
  localStorage.setItem('mvpluxAdminCoupons', JSON.stringify(coupons || []));
  updateAdminLiveSettings({ coupons: coupons || [] });
  saveAdminSettingsLive({ coupons: coupons || [] });
  return coupons;
}

function readJsonStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch (error) {
    return fallback;
  }
}

function buildAdminExport() {
  return {
    exportedAt: new Date().toISOString(),
    note: 'These edits are saved live when Supabase is available.',
    products: readAdminProducts(),
    customProducts: readCustomProducts(),
    savedForLaterProducts: readArchivedProducts(),
    deletedProducts: readDeletedProducts(),
    imageDrafts: readImageDraftEdits(),
    dismissedImageDrafts: readImageDraftPaths('dismissedImageDrafts'),
    configuredImagePaths: readImageDraftPaths('configuredImagePaths'),
    ignoredImagePaths: readImageDraftPaths('ignoredImagePaths'),
    priceSettings: readPriceSettings(),
    extraImages: readExtraImages(),
    coupons: readCoupons(),
    pageEdits: readJsonStorage('mvpluxInlineAdminEdits', {}),
    cardsSavedForLater: getAdminLiveValue('cardsSavedForLater', readJsonStorage('mvpluxInlineHiddenCards', {}))
  };
}

function renderAdminExportPreview(exportData = buildAdminExport()) {
  const preview = document.getElementById('adminExportPreview');
  const json = JSON.stringify(exportData, null, 2);
  if (preview) preview.value = json;
  return json;
}

function normalizedCategoryOrder(order = {}) {
  return Object.fromEntries(
    Object.entries(order || {})
      .filter(([, value]) => Number.isFinite(Number(value)))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, Number(value)])
  );
}

function publishImageReference(value) {
  const reference = String(value || '');
  if (!reference.startsWith('data:image/')) return reference;
  let hash = 2166136261;
  for (let index = 0; index < reference.length; index += 1) {
    hash ^= reference.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const mime = reference.slice(5, reference.indexOf(';') > 5 ? reference.indexOf(';') : 32);
  return `admin-upload:${mime}:${reference.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function publishableNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function publishablePageVisualStates() {
  const pages = {};
  Object.entries(adminPageLiveEdits || {}).forEach(([pageKey, edits]) => {
    const visualStates = {};
    Object.entries(edits || {}).forEach(([elementKey, edit]) => {
      if (!edit || typeof edit !== 'object' || edit.type) return;
      const hasGeometry = ['x', 'y', 'scale', 'rotate'].some((field) => Number.isFinite(Number(edit[field])));
      if (!hasGeometry) return;
      visualStates[elementKey] = {
        x: publishableNumber(edit.x, 0, -140, 140),
        y: publishableNumber(edit.y, 0, -140, 140),
        scale: publishableNumber(edit.scale, 1, 0.45, 2.1),
        rotate: publishableNumber(edit.rotate, 0, -28, 28)
      };
    });
    if (Object.keys(visualStates).length) pages[pageKey] = visualStates;
  });
  return pages;
}

function publishableProduct(product = {}, archived = false) {
  return {
    slug: product.slug,
    ...(product.custom === true ? { custom: true } : {}),
    title: String(product.title || product.slug || 'Untitled product'),
    description: String(product.description || ''),
    cutoutImage: publishImageReference(product.cutoutImage),
    backgroundImage: publishImageReference(product.backgroundImage),
    imageChoices: normalizeImageChoices(product.imageChoices).map((choice) => ({
      label: choice.label,
      image: publishImageReference(choice.image),
      ...(choice.stage ? { stage: publishImageReference(choice.stage) } : {})
    })),
    originalHeight: String(product.originalHeight || ''),
    cutoutHeight: String(product.cutoutHeight || ''),
    cutoutLeft: String(product.cutoutLeft || ''),
    cutoutBottom: String(product.cutoutBottom || ''),
    logoWidth: String(product.logoWidth || ''),
    logoTop: String(product.logoTop || ''),
    stageBackgroundPosition: String(product.stageBackgroundPosition || ''),
    categories: [...new Set(product.categories || [])].sort(),
    visible: !archived && product.visible !== false,
    categoryOrder: normalizedCategoryOrder(product.categoryOrder)
  };
}

function publishableSnapshotProduct(baseProduct, value, archived) {
  const published = publishableProduct(value, archived);
  if (published.cutoutImage.startsWith('admin-upload:')) {
    published.cutoutImage = publishImageReference(baseProduct.cutoutImage);
  }
  if (published.backgroundImage.startsWith('admin-upload:')) {
    published.backgroundImage = publishImageReference(baseProduct.backgroundImage);
  }
  published.imageChoices = published.imageChoices.filter((choice) => (
    !choice.image.startsWith('admin-upload:') && !String(choice.stage || '').startsWith('admin-upload:')
  ));
  return published;
}

function buildDefaultPublishBaseline() {
  return {
    version: 1,
    products: Object.fromEntries(adminCharacterProducts.map((product) => [product.slug, publishableProduct(product)])),
    categoryDisplayCards: Object.fromEntries(adminProducts.map((product) => [product.slug, publishableProduct(product)])),
    deletedProducts: [],
    homepageCategoryOrder: [],
    ignoredImagePaths: [],
    pageVisualStates: {}
  };
}

function buildCurrentPublishSnapshot() {
  const saved = readAdminProducts();
  const archived = new Set(readArchivedProducts());
  const deleted = new Set(readDeletedProducts());
  const products = {};
  const categoryDisplayCards = {};

  allAdminProducts().forEach((product) => {
    if (!product?.slug || deleted.has(product.slug)) return;
    const value = { ...product, ...(saved[product.slug] || {}) };
    const target = product.categoryCard ? categoryDisplayCards : products;
    target[product.slug] = publishableSnapshotProduct(product, value, archived.has(product.slug));
  });

  const homepageDraft = readJsonStorage('mvpluxInlineAdminDraftV2', {})?.['index.html']?.['homepage-category-card-order'];
  const homepageOrder = homepageDraft?.type === 'homepageCategoryOrder'
    ? homepageDraft
    : adminHomepageLiveEdits?.['homepage-category-card-order'];

  return {
    version: 1,
    products,
    categoryDisplayCards,
    deletedProducts: [...deleted].sort(),
    ignoredImagePaths: [...new Set(readImageDraftPaths('ignoredImagePaths'))].sort(),
    homepageCategoryOrder: homepageOrder?.type === 'homepageCategoryOrder' && Array.isArray(homepageOrder.rows)
      ? homepageOrder.rows.map((row) => [...row])
      : [],
    pageVisualStates: publishablePageVisualStates()
  };
}

function categoryPublishLabel(key) {
  return (window.MVPLUX_PRODUCT_CATEGORIES || []).find((category) => category.key === key)?.label || key;
}

function productPublishTitle(product, fallbackSlug = '') {
  return product?.title || fallbackSlug.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatPublishedHeight(value) {
  const text = String(value || '').trim();
  return /^\d+$/.test(text) ? `${text}"` : text || 'not set';
}

function addPublishImageLine(lines, seenImages, prefix, path) {
  if (!path) return;
  lines.push(`${prefix}: ${path}`);
  seenImages.add(path);
}

function summarizeHomepageOrder(beforeRows = [], afterRows = []) {
  if (JSON.stringify(beforeRows) === JSON.stringify(afterRows)) return [];
  if (!beforeRows.length || !afterRows.length) return ['Changed homepage category card order'];

  const beforePositions = new Map();
  beforeRows.forEach((row, rowIndex) => row.forEach((slug, index) => beforePositions.set(slug, `${rowIndex}:${index}`)));
  const titles = new Map(adminProducts.map((product) => [product.slug, product.title]));
  const changes = [];
  afterRows.forEach((row, rowIndex) => row.forEach((slug, index) => {
    if (beforePositions.get(slug) === `${rowIndex}:${index}`) return;
    changes.push(`Moved ${titles.get(slug) || productPublishTitle(null, slug)} to row ${rowIndex + 1}, position ${index + 1}`);
  }));
  return changes.length ? changes : ['Changed homepage category card order'];
}

function generatePublishChanges(before, after) {
  const lines = [];
  const seenImages = new Set();
  const beforeProducts = { ...(before?.categoryDisplayCards || {}), ...(before?.products || {}) };
  const afterProducts = { ...(after?.categoryDisplayCards || {}), ...(after?.products || {}) };
  const slugs = [...new Set([...Object.keys(beforeProducts), ...Object.keys(afterProducts)])].sort();

  slugs.forEach((slug) => {
    const previous = beforeProducts[slug];
    const current = afterProducts[slug];
    const title = productPublishTitle(current || previous, slug);

    if (!previous && current) {
      lines.push(`Created product/card: ${title}`);
      addPublishImageLine(lines, seenImages, `Added cutout image for ${title}`, current.cutoutImage);
      addPublishImageLine(lines, seenImages, `Added background image for ${title}`, current.backgroundImage);
      normalizeImageChoices(current.imageChoices).forEach((choice) => {
        addPublishImageLine(lines, seenImages, `Added image choice ${choice.label} for ${title}`, choice.image);
      });
      if (current.categories.length) {
        lines.push(`Assigned ${title} to ${current.categories.map(categoryPublishLabel).join(' and ')}`);
      }
      if (!current.visible) lines.push(`Created ${title} as hidden`);
      return;
    }

    if (previous && !current) {
      lines.push(`Deleted product/card: ${title}`);
      return;
    }

    if (previous.title !== current.title) lines.push(`Changed title from ${previous.title} to ${current.title}`);
    if (previous.description !== current.description) lines.push(`Changed description for ${title}`);
    if (previous.originalHeight !== current.originalHeight) {
      lines.push(`Changed ${title} original height from ${formatPublishedHeight(previous.originalHeight)} to ${formatPublishedHeight(current.originalHeight)}`);
    }
    if (previous.cutoutImage !== current.cutoutImage) {
      lines.push(`Changed cutout image for ${title} from ${previous.cutoutImage || 'not set'} to ${current.cutoutImage || 'not set'}`);
      if (current.cutoutImage) seenImages.add(current.cutoutImage);
    }
    if (previous.backgroundImage !== current.backgroundImage) {
      lines.push(`Changed background image for ${title} from ${previous.backgroundImage || 'not set'} to ${current.backgroundImage || 'not set'}`);
      if (current.backgroundImage) seenImages.add(current.backgroundImage);
    }
    const placementFields = [
      ['cutoutHeight', 'standee size'],
      ['cutoutLeft', 'horizontal position'],
      ['cutoutBottom', 'vertical position'],
      ['logoWidth', 'logo size'],
      ['logoTop', 'logo position'],
      ['stageBackgroundPosition', 'background position']
    ];
    placementFields.forEach(([field, label]) => {
      if (String(previous[field] || '') !== String(current[field] || '')) {
        lines.push(`Changed ${label} for ${title}`);
      }
    });
    const previousChoices = new Map(normalizeImageChoices(previous.imageChoices).map((choice) => [choice.image, choice]));
    const currentChoices = new Map(normalizeImageChoices(current.imageChoices).map((choice) => [choice.image, choice]));
    currentChoices.forEach((choice, image) => {
      const oldChoice = previousChoices.get(image);
      if (!oldChoice) lines.push(`Added image choice ${choice.label} to ${title}: ${image}`);
      else if (oldChoice.label !== choice.label) lines.push(`Changed image choice label for ${title} from ${oldChoice.label} to ${choice.label}`);
      seenImages.add(image);
    });
    previousChoices.forEach((choice, image) => {
      if (!currentChoices.has(image)) lines.push(`Removed image choice ${choice.label} from ${title}: ${image}`);
    });
    if (previous.visible !== current.visible) lines.push(`${current.visible ? 'Showed' : 'Hid'} ${title}`);

    const previousCategories = new Set(previous.categories || []);
    const currentCategories = new Set(current.categories || []);
    const addedCategories = [...currentCategories].filter((category) => !previousCategories.has(category));
    const removedCategories = [...previousCategories].filter((category) => !currentCategories.has(category));
    if (addedCategories.length) lines.push(`Assigned ${title} to ${addedCategories.map(categoryPublishLabel).join(' and ')}`);
    if (removedCategories.length) lines.push(`Removed ${title} from ${removedCategories.map(categoryPublishLabel).join(' and ')}`);

    const orderedCategories = new Set([
      ...Object.keys(previous.categoryOrder || {}),
      ...Object.keys(current.categoryOrder || {})
    ]);
    orderedCategories.forEach((category) => {
      const oldOrder = previous.categoryOrder?.[category];
      const newOrder = current.categoryOrder?.[category];
      if (oldOrder === newOrder || !currentCategories.has(category)) return;
      lines.push(`Moved ${title} in ${categoryPublishLabel(category)} to position ${Number(newOrder) + 1}`);
    });
  });

  lines.push(...summarizeHomepageOrder(before?.homepageCategoryOrder, after?.homepageCategoryOrder));
  const beforeIgnored = new Set(before?.ignoredImagePaths || []);
  const afterIgnored = new Set(after?.ignoredImagePaths || []);
  afterIgnored.forEach((path) => {
    if (!beforeIgnored.has(path)) lines.push(`Ignored non-product image: ${path}`);
  });
  const beforeVisualStates = before?.pageVisualStates || {};
  const afterVisualStates = after?.pageVisualStates || {};
  [...new Set([...Object.keys(beforeVisualStates), ...Object.keys(afterVisualStates)])].sort().forEach((pageKey) => {
    if (JSON.stringify(beforeVisualStates[pageKey] || {}) !== JSON.stringify(afterVisualStates[pageKey] || {})) {
      lines.push(`Updated saved image positioning on ${pageKey}`);
    }
  });
  return [...new Set(lines)];
}

function defaultPublishTitle(changes) {
  if (changes.length && changes.every((line) => /image/i.test(line))) return 'Update product images';
  return 'Update product cards and categories';
}

let currentPublishReview = null;
let adminPublishedBaseline = null;
let adminLastSuccessfulSnapshot = null;

function normalizePublishedBaseline(snapshot) {
  const baseline = buildDefaultPublishBaseline();
  if (!snapshot || snapshot.version !== 1 || !snapshot.products || typeof snapshot.products !== 'object') return baseline;
  Object.entries(snapshot.products).forEach(([slug, product]) => {
    if (!product || typeof product !== 'object' || Array.isArray(product)) return;
    baseline.products[slug] = { ...(baseline.products[slug] || {}), ...product, slug };
  });
  Object.entries(snapshot.categoryDisplayCards || {}).forEach(([slug, product]) => {
    if (!product || typeof product !== 'object' || Array.isArray(product)) return;
    baseline.categoryDisplayCards[slug] = { ...(baseline.categoryDisplayCards[slug] || {}), ...product, slug };
  });
  (Array.isArray(snapshot.deletedProducts) ? snapshot.deletedProducts : []).forEach((slug) => {
    delete baseline.products[slug];
  });
  baseline.deletedProducts = Array.isArray(snapshot.deletedProducts) ? [...snapshot.deletedProducts] : [];
  baseline.homepageCategoryOrder = Array.isArray(snapshot.homepageCategoryOrder)
    ? snapshot.homepageCategoryOrder.map((row) => Array.isArray(row) ? [...row] : [])
    : [];
  baseline.ignoredImagePaths = Array.isArray(snapshot.ignoredImagePaths) ? [...snapshot.ignoredImagePaths] : [];
  baseline.pageVisualStates = snapshot.pageVisualStates && typeof snapshot.pageVisualStates === 'object'
    ? structuredClone(snapshot.pageVisualStates)
    : {};
  return baseline;
}

async function loadPublishedPublishBaseline() {
  try {
    const response = await fetch('published-admin-settings.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Published settings file is unavailable.');
    const value = await response.json();
    adminPublishedBaseline = normalizePublishedBaseline(value?.snapshot);
    adminLastSuccessfulSnapshot = value?.publishedAt ? value?.snapshot || null : null;
    adminPublishedFileState = {
      reachable: true,
      publishedAt: value?.publishedAt || null,
      commitHash: String(value?.commitHash || '')
    };
  } catch (error) {
    adminPublishedBaseline = buildDefaultPublishBaseline();
    adminLastSuccessfulSnapshot = null;
    adminPublishedFileState = { reachable: false, publishedAt: null, commitHash: '' };
  }
  renderAdminDiagnostics();
  return adminPublishedBaseline;
}

function productLifecycleState(product, saved, archived) {
  const current = publishableProduct({ ...product, ...(saved[product.slug] || {}) }, archived.has(product.slug));
  const publishedSnapshot = adminLiveSettings?.lastPublishedSnapshot || adminLastSuccessfulSnapshot;
  const published = publishedSnapshot?.products?.[product.slug];
  if (!published) return { key: 'waiting', label: 'Waiting to Publish' };
  const canonicalJson = (value) => JSON.stringify(value, (_, item) => (
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)))
      : item
  ));
  if (canonicalJson(current) === canonicalJson(published)) return { key: 'published', label: 'Published' };
  return { key: 'waiting', label: 'Changes Waiting to Publish' };
}

function getProductLifecycleCounts() {
  const saved = readAdminProducts();
  const archived = new Set(readArchivedProducts());
  const deleted = new Set(readDeletedProducts());
  const products = allAdminProducts().filter((product) => !product.categoryCard && !archived.has(product.slug) && !deleted.has(product.slug));
  const states = products.map((product) => productLifecycleState(product, saved, archived));
  return {
    approved: products.length,
    waiting: states.filter((state) => state.key === 'waiting').length,
    published: states.filter((state) => state.key === 'published').length
  };
}

function renderAdminDiagnostics() {
  const container = document.getElementById('adminPublishDiagnostics');
  if (!container) return;
  const counts = getProductLifecycleCounts();
  const history = getAdminLiveValue('publishHistory', []);
  const lastPublish = history.length ? history[history.length - 1] : null;
  const saveStatus = adminSavePending
    ? `Saving (${adminSavePending} queued)`
    : adminLastSaveSucceeded === true ? 'Saved to Supabase' : adminLastSaveSucceeded === false ? 'Save failed' : 'Loaded from Supabase';
  container.innerHTML = `
    <dl>
      <div><dt>Supabase save status</dt><dd>${escapeAdminHtml(saveStatus)}</dd></div>
      <div><dt>Approved products</dt><dd>${counts.approved}</dd></div>
      <div><dt>Waiting to publish</dt><dd>${counts.waiting}</dd></div>
      <div><dt>Already published</dt><dd>${counts.published}</dd></div>
      <div><dt>Last successful publish</dt><dd>${escapeAdminHtml(lastPublish?.date || adminPublishedFileState.publishedAt || 'Never')}</dd></div>
      <div><dt>Last commit hash</dt><dd>${escapeAdminHtml(lastPublish?.commitHash || adminPublishedFileState.commitHash || 'None')}</dd></div>
      <div><dt>Latest save error</dt><dd>${escapeAdminHtml(adminLastSaveError || 'None')}</dd></div>
      <div><dt>Latest publish error</dt><dd>${escapeAdminHtml(adminLatestPublishError || 'None')}</dd></div>
      <div><dt>Public settings file</dt><dd>${adminPublishedFileState.reachable ? 'Reachable' : 'Unavailable'}</dd></div>
    </dl>
  `;
}

function selectedPublishImagePaths() {
  const value = document.getElementById('adminPublishImagePaths')?.value || '';
  return [...new Set(value.split(/\r?\n/).map((path) => path.trim()).filter(Boolean))];
}

function validatePublishImagePath(path) {
  return /^images\/[A-Za-z0-9_./ '\-]+\.(?:png|jpe?g|webp|gif)$/i.test(path)
    && !path.includes('..')
    && !path.includes('\\');
}

function renderPublishSummary() {
  const before = adminPublishedBaseline || buildDefaultPublishBaseline();
  const snapshot = buildCurrentPublishSnapshot();
  const selectedImages = selectedPublishImagePaths();
  const invalidImages = selectedImages.filter((path) => !validatePublishImagePath(path));
  const changes = [
    ...generatePublishChanges(before, snapshot),
    ...selectedImages.filter(validatePublishImagePath).map((path) => `Added image file: ${path}`)
  ];
  if (invalidImages.length) changes.push(...invalidImages.map((path) => `Invalid image path (will not publish): ${path}`));
  const summary = changes.map((line) => `- ${line}`).join('\n');
  const titleInput = document.getElementById('adminCommitTitle');
  const summaryInput = document.getElementById('adminCommitSummary');
  const publishButton = document.getElementById('publishAdminChanges');
  if (titleInput && (!currentPublishReview || !titleInput.value.trim())) titleInput.value = defaultPublishTitle(changes);
  if (summaryInput) summaryInput.value = summary || 'No product changes since the previous publish.';
  if (publishButton) publishButton.disabled = changes.length === 0 || invalidImages.length > 0;
  currentPublishReview = { snapshot, changes, summary, selectedImages, invalidImages };
  return currentPublishReview;
}

function escapeAdminHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPublishHistory() {
  const container = document.getElementById('adminPublishHistory');
  if (!container) return;
  const history = getAdminLiveValue('publishHistory', []);
  if (!history.length) {
    container.innerHTML = '<p class="admin-note">No GitHub publishes have been recorded yet.</p>';
    return;
  }
  container.innerHTML = [...history].reverse().map((entry) => {
    const hash = /^[a-f0-9]{7,40}$/i.test(entry.commitHash || '') ? entry.commitHash : '';
    const commit = hash
      ? `<a href="https://github.com/coolap69/mvpluxcreations/commit/${hash}" target="_blank" rel="noopener">${hash.slice(0, 7)}</a>`
      : 'Unavailable';
    return `
      <article class="admin-publish-history-item">
        <h4>${escapeAdminHtml(entry.title || 'Admin publish')}</h4>
        <p>${escapeAdminHtml(entry.date || '')} · Commit ${commit} · Deployment: ${escapeAdminHtml(entry.deploymentResult || 'queued')}</p>
        <pre>${escapeAdminHtml(entry.changeSummary || '')}</pre>
      </article>
    `;
  }).join('');
}

async function callAdminPublisher(payload) {
  const client = getAdminClient();
  const projectUrl = window.MVPLUX_SUPABASE?.url;
  if (!client?.auth || !projectUrl) throw new Error('Supabase is unavailable.');
  const { data } = await client.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sign in as admin before publishing.');
  const response = await fetch(`${projectUrl}/functions/v1/publish-admin-changes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: window.MVPLUX_SUPABASE?.publishableKey || ''
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const stage = result.stage ? ` at ${result.stage}` : '';
    const detail = result.error || result.message || result.code || 'Unknown publisher error.';
    const error = new Error(`Publish failed${stage} (HTTP ${response.status}): ${detail}`);
    error.httpStatus = response.status;
    error.responseBody = result;
    throw error;
  }
  return { ...result, httpStatus: response.status };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

async function loadSelectedPublishImages(paths) {
  const files = [];
  for (const path of paths) {
    if (!validatePublishImagePath(path)) throw new Error(`Invalid image path: ${path}`);
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load selected image: ${path}`);
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.startsWith('image/')) throw new Error(`Selected path is not an image: ${path}`);
    files.push({ path, content: arrayBufferToBase64(await response.arrayBuffer()) });
  }
  return files;
}

async function publishAdminChanges() {
  setStatus('Confirming all Admin changes are saved to Supabase...');
  if (!await waitForAdminSaves()) return;
  const persisted = await loadAdminLiveSettings();
  if (!persisted) {
    setStatus(`Publish stopped: ${adminLastSaveError || 'could not reload persisted Admin state from Supabase.'}`);
    return;
  }
  renderAdminProducts();
  const review = renderPublishSummary();
  if (!review.changes.length || review.invalidImages.length) return;
  const title = document.getElementById('adminCommitTitle')?.value.trim();
  const notes = document.getElementById('adminCommitNotes')?.value.trim();
  if (!title) {
    setStatus('Add a short commit title before publishing.');
    return;
  }
  const body = `${review.summary}${notes ? `\n\nNotes:\n${notes}` : ''}`;
  if (!window.confirm(`Publish one GitHub commit titled "${title}"?`)) return;

  setStatus('Loading explicitly selected images...');
  try {
    const imageFiles = await loadSelectedPublishImages(review.selectedImages);
    setStatus('Publishing one GitHub commit...');
    const result = await callAdminPublisher({
      action: 'publish',
      title,
      body,
      changeSummary: review.summary,
      snapshot: review.snapshot,
      imageFiles
    });
    updateAdminLiveSettings({
      lastPublishedSnapshot: review.snapshot,
      publishHistory: result.publishHistory || []
    });
    adminLatestPublishError = '';
    adminPublishedFileState = {
      reachable: true,
      publishedAt: result.publishedAt || new Date().toISOString(),
      commitHash: result.commitHash || ''
    };
    document.getElementById('adminCommitNotes').value = '';
    document.getElementById('adminPublishImagePaths').value = '';
    adminPublishedBaseline = normalizePublishedBaseline(review.snapshot);
    currentPublishReview = null;
    renderPublishSummary();
    renderPublishHistory();
    renderAdminProducts();
    renderAdminDiagnostics();
    setStatus(`Published commit ${result.commitHash?.slice(0, 7) || ''} (HTTP ${result.httpStatus}). Deployment: ${result.deploymentResult || 'queued'}.`);
  } catch (error) {
    adminLatestPublishError = error.message || 'GitHub publish failed.';
    renderAdminDiagnostics();
    setStatus(adminLatestPublishError);
  }
}

async function refreshPublishHistory() {
  setStatus('Refreshing deployment results...');
  try {
    const result = await callAdminPublisher({ action: 'refresh-history' });
    updateAdminLiveSettings({ publishHistory: result.publishHistory || [] });
    renderPublishHistory();
    setStatus('Deployment results refreshed.');
  } catch (error) {
    setStatus(error.message || 'Could not refresh deployment results.');
  }
}

function applyAdminExport(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid export');

  writeAdminProducts(data.products || {});
  writeCustomProducts(data.customProducts || []);
  writeArchivedProducts(data.savedForLaterProducts || []);
  writeDeletedProducts(data.deletedProducts || []);
  writeImageDraftEdits(data.imageDrafts || {});
  writeImageDraftPaths('dismissedImageDrafts', data.dismissedImageDrafts || []);
  writeImageDraftPaths('configuredImagePaths', data.configuredImagePaths || []);
  writeImageDraftPaths('ignoredImagePaths', data.ignoredImagePaths || []);
  writePriceSettings(data.priceSettings || {});
  writeExtraImages(data.extraImages || {});
  writeCoupons(data.coupons || []);
  localStorage.setItem('mvpluxInlineAdminEdits', JSON.stringify(data.pageEdits || {}));
  localStorage.setItem('mvpluxInlineHiddenCards', JSON.stringify(data.cardsSavedForLater || {}));
  updateAdminLiveSettings({ cardsSavedForLater: data.cardsSavedForLater || {} });
  saveAdminSettingsLive({ cardsSavedForLater: data.cardsSavedForLater || {} });
  renderAdminProducts();
  fillPriceSettingsForm();
  renderExtraImages();
  renderAdminExportPreview();
  setStatus('Imported changes and saved live when Supabase is available.');
}

function importAdminChangesFromFile(file) {
  if (!file) return;
  const reader = new FileReader();

  reader.addEventListener('load', () => {
    try {
      applyAdminExport(JSON.parse(reader.result));
    } catch (error) {
      setStatus('That export file could not be restored.');
    }
  });

  reader.addEventListener('error', () => {
    setStatus('That export file could not be opened.');
  });

  reader.readAsText(file);
}

function downloadAdminChanges() {
  const json = renderAdminExportPreview();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `mvplux-admin-changes-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus('Exported changes file. This is the file to use when making edits permanent.');
}

async function copyAdminChanges() {
  const json = renderAdminExportPreview();
  try {
    await navigator.clipboard.writeText(json);
    setStatus('Copied changes. You can paste them when making the website permanent.');
  } catch (error) {
    setStatus('Changes are shown in the box. Select the box and copy them.');
  }
}

function setStatus(message) {
  const status = document.getElementById('adminStatus');
  if (status) status.textContent = message;
  if (document.getElementById('adminExportPreview')) renderAdminExportPreview();
}

function setCommerceStatus(message) {
  const status = document.getElementById('commerceAdminStatus');
  if (status) status.textContent = message || '';
}

function setAdminSignedInAs(message) {
  const status = document.getElementById('adminSignedInAs');
  if (status) status.textContent = message || '';
}

function adminMoney(value) {
  const amount = Number(value) || 0;
  return '$' + amount.toFixed(2);
}

function adminDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function adminListItems(items) {
  if (!Array.isArray(items) || !items.length) return 'No item listed';
  return items.map((item) => `${item.name || 'Item'} (${adminMoney(item.price)})`).join(', ');
}

function adminAddressText(address) {
  if (!address || typeof address !== 'object') return 'No address yet';
  return [
    address.address1,
    address.address2,
    [address.city, address.state, address.zip].filter(Boolean).join(', '),
    address.country
  ].filter(Boolean).join(' | ') || 'No address yet';
}

function commerceEmptyMarkup(text) {
  return `<div class="admin-commerce-empty">${text}</div>`;
}

function orderCardMarkup(order) {
  const sentToProduction = order.status === 'sent_to_production';
  const isTest = Boolean(order.is_test);
  const paymentSubmitted = isTest && order.status === 'payment_submitted';
  return `
    <article class="admin-commerce-card ${sentToProduction ? 'is-production-sent' : 'needs-production'} ${isTest ? 'is-test-record' : ''}">
      <div class="admin-commerce-card-head">
        <strong>${order.customer_name || 'Customer'}</strong>
        <span>${isTest ? '<b class="test-record-badge">TEST</b> ' : ''}${order.status || 'new'}</span>
      </div>
      <p>${adminListItems(order.items)}</p>
      <p><strong>Original:</strong> ${adminMoney(order.original_amount ?? order.subtotal)}${order.applied_discount_code ? ` · <strong>Code:</strong> ${escapeAdminHtml(order.applied_discount_code)} · <strong>Discount:</strong> ${adminMoney(order.discount_amount)}` : ''}</p>
      <p><strong>Total:</strong> ${adminMoney(order.total)} · <strong>Pay:</strong> ${order.payment_method || 'Not chosen'}</p>
      <p><strong>Email:</strong> ${order.customer_email || 'Not provided'} · <strong>Phone:</strong> ${order.customer_phone || 'Not provided'}</p>
      <p><strong>Ship:</strong> ${adminAddressText(order.shipping_address)}</p>
      ${order.notes ? `<p><strong>Notes:</strong> ${order.notes}</p>` : ''}
      <small>${adminDate(order.created_at)}</small>
      <button class="admin-production-toggle ${sentToProduction ? 'is-sent' : ''}" type="button" data-toggle-production="${sentToProduction ? 'new' : 'sent_to_production'}" data-id="${order.id}">
        ${sentToProduction ? 'Production Sent' : 'Needs Production'}
      </button>
      ${paymentSubmitted ? `<button class="admin-production-toggle" type="button" data-confirm-test-payment data-id="${escapeAdminHtml(order.id)}">Confirm Test Payment</button>` : ''}
      ${isTest ? `<button class="admin-commerce-delete" type="button" data-delete-commerce="order" data-id="${escapeAdminHtml(order.id)}">Delete Test Record</button>` : ''}
    </article>
  `;
}

function parseOfferDetails(message) {
  const details = {};
  String(message || '').split('\n').forEach((line) => {
    const separator = line.indexOf(':');
    if (separator < 0) return;
    const key = line.slice(0, separator).trim().toLowerCase();
    details[key] = line.slice(separator + 1).trim();
  });
  return details;
}

let adminOfferHistoryById = new Map();

function adminOfferHistoryMarkup(offerId) {
  const history = adminOfferHistoryById.get(offerId) || [];
  if (!history.length) return '<p><strong>Offer history:</strong> No dedicated history recorded yet.</p>';
  return `
    <ol class="admin-offer-history">
      ${history.map((event) => `
        <li>
          <strong>${escapeAdminHtml(String(event.event_type || event.message_type || 'update').replace(/_/g, ' '))}</strong>
          <span>${escapeAdminHtml(event.sender_type || 'system')} · ${escapeAdminHtml(adminDate(event.created_at))}</span>
          ${event.amount != null ? `<b>${adminMoney(event.amount)}</b>` : ''}
          ${event.message ? `<p>${escapeAdminHtml(event.message)}</p>` : ''}
        </li>
      `).join('')}
    </ol>
  `;
}

function offerCardMarkup(offer) {
  const details = parseOfferDetails(offer.message);
  const status = String(offer.status || 'pending').toLowerCase();
  const isMember = Boolean(offer.customer_id);
  const canDecide = ['pending', 'countered', 'buyer_countered'].includes(status);
  const canCounter = isMember && status === 'pending';
  const statusLabel = status === 'accepted'
    ? 'accepted / awaiting payment'
    : status.replace(/_/g, ' ');
  return `
    <article class="admin-commerce-card ${offer.is_test ? 'is-test-record' : ''}" data-offer-card="${escapeAdminHtml(offer.id)}">
      <div class="admin-commerce-card-head">
        <strong>${escapeAdminHtml(offer.customer_name || 'Customer')}</strong>
        <span>${offer.is_test ? '<b class="test-record-badge">TEST</b> ' : ''}${escapeAdminHtml(statusLabel)}</span>
      </div>
      <p><strong>Customer:</strong> ${escapeAdminHtml(offer.customer_name || 'Customer')} · ${isMember ? 'Signed-in member' : 'Guest'}</p>
      <p><strong>Email:</strong> ${escapeAdminHtml(offer.customer_email || 'Not provided')}</p>
      <p><strong>Product:</strong> ${escapeAdminHtml(offer.product_name || 'Selected item')}</p>
      <p><strong>Design:</strong> ${escapeAdminHtml(details.design || 'Not provided')}</p>
      <p><strong>Description:</strong> ${escapeAdminHtml(details.description || 'Not provided')}</p>
      <p><strong>Selected size:</strong> ${escapeAdminHtml(details['selected size'] || 'Not provided')}</p>
      <p><strong>Original height:</strong> ${escapeAdminHtml(details['original height'] || 'Not provided')}</p>
      <p><strong>Background/display:</strong> ${escapeAdminHtml(details.background || 'Not provided')}</p>
      <p><strong>Normal asking price:</strong> ${escapeAdminHtml(details['asking price'] || 'Not provided')}</p>
      <p><strong>Offer:</strong> ${adminMoney(offer.amount)}</p>
      <p><strong>Comment:</strong> ${escapeAdminHtml(details.message || 'No comment')}</p>
      ${details.phone ? `<p><strong>Phone:</strong> ${escapeAdminHtml(details.phone)}</p>` : ''}
      ${details.shipping ? `<p><strong>Shipping:</strong> ${escapeAdminHtml(details.shipping)}</p>` : ''}
      ${offer.seller_counter_amount ? `<p><strong>Admin counteroffer:</strong> ${adminMoney(offer.seller_counter_amount)}${offer.seller_counter_message ? ` · ${escapeAdminHtml(offer.seller_counter_message)}` : ''}</p>` : ''}
      ${offer.buyer_final_amount ? `<p><strong>Member counteroffer:</strong> ${adminMoney(offer.buyer_final_amount)}${offer.buyer_final_message ? ` · ${escapeAdminHtml(offer.buyer_final_message)}` : ''}</p>` : ''}
      <small>${adminDate(offer.created_at)}</small>
      ${adminOfferHistoryMarkup(offer.id)}
      ${canDecide ? `
        <div class="admin-offer-actions">
          <button type="button" data-offer-action="accept" data-id="${escapeAdminHtml(offer.id)}">Accept Offer</button>
          <button type="button" data-offer-action="decline" data-id="${escapeAdminHtml(offer.id)}">Decline Offer</button>
          ${canCounter ? `<button type="button" data-offer-action="show-counter" data-id="${escapeAdminHtml(offer.id)}">Send Counteroffer</button>` : ''}
        </div>
      ` : ''}
      ${canCounter ? `
        <div class="admin-offer-counter-form" hidden>
          <label>Counteroffer amount<input type="text" inputmode="decimal" data-offer-counter-amount></label>
          <label>Message (optional)<textarea data-offer-counter-message></textarea></label>
          <button type="button" data-offer-action="counter" data-id="${escapeAdminHtml(offer.id)}">Send Counteroffer</button>
        </div>
      ` : ''}
      ${offer.is_test ? `<button class="admin-commerce-delete" type="button" data-delete-commerce="offer" data-id="${escapeAdminHtml(offer.id)}">Delete Test Record</button>` : ''}
    </article>
  `;
}

async function updateAdminOffer(button) {
  const client = window.getMvpluxSupabaseClient?.();
  const action = button?.dataset?.offerAction;
  const id = button?.dataset?.id;
  const card = button?.closest?.('[data-offer-card]');
  if (!client || !action || !id || !card) return;

  if (action === 'show-counter') {
    const form = card.querySelector('.admin-offer-counter-form');
    if (form) form.hidden = !form.hidden;
    return;
  }

  const update = {};
  if (action === 'accept' || action === 'decline') {
    const verb = action === 'accept' ? 'accept' : 'decline';
    if (!window.confirm(`${verb[0].toUpperCase()}${verb.slice(1)} this offer? The offer record will be kept.`)) return;
    update.status = action === 'accept' ? 'accepted' : 'declined';
  } else if (action === 'counter') {
    const amount = Number(String(card.querySelector('[data-offer-counter-amount]')?.value || '').replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) {
      setCommerceStatus('Enter a valid counteroffer amount.');
      return;
    }
    update.status = 'countered';
    update.seller_counter_amount = Number(amount.toFixed(2));
    update.seller_counter_message = card.querySelector('[data-offer-counter-message]')?.value?.trim() || null;
  } else {
    return;
  }

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = 'Saving...';
  const { error } = await client.from('offers').update(update).eq('id', id).select('id, status').single();
  if (error) {
    button.disabled = false;
    button.textContent = originalText;
    setCommerceStatus(`Could not update the offer. ${error.message || error}`);
    return;
  }
  setCommerceStatus(action === 'counter' ? 'Counteroffer saved.' : `Offer ${update.status}.`);
  refreshCommerceAdmin();
}

async function deleteCommerceRecord(button) {
  const client = window.getMvpluxSupabaseClient?.();
  const type = button?.dataset?.deleteCommerce;
  const id = button?.dataset?.id;
  const table = type === 'order' ? 'order_requests' : type === 'offer' ? 'offers' : '';

  if (!client || !table || !id) return;

  const label = `test ${type}`;
  if (button.dataset.confirmDelete !== 'true') {
    button.dataset.confirmDelete = 'true';
    button.textContent = 'Click Again To Delete';
    setCommerceStatus(`Ready to delete this ${label}. Click the same delete button one more time to confirm.`);
    setTimeout(() => {
      if (button.dataset.confirmDelete === 'true') {
        button.dataset.confirmDelete = 'false';
        button.textContent = 'Delete Test Record';
      }
    }, 6000);
    return;
  }

  button.disabled = true;
  button.textContent = 'Deleting...';

  const { error } = await client.from(table).delete().eq('id', id).eq('is_test', true);
  if (error) {
    button.disabled = false;
    button.textContent = 'Delete Test Record';
    setCommerceStatus('Could not delete yet. Run the admin delete SQL in Supabase, then try again.');
    return;
  }

  setCommerceStatus(`Deleted ${label}.`);
  refreshCommerceAdmin();
}

function handleCommerceAdminClick(event) {
  const offerButton = event.target.closest?.('[data-offer-action]');
  if (offerButton) {
    updateAdminOffer(offerButton);
    return;
  }

  const productionButton = event.target.closest?.('[data-toggle-production]');
  if (productionButton) {
    toggleOrderProductionStatus(productionButton);
    return;
  }

  const confirmTestPaymentButton = event.target.closest?.('[data-confirm-test-payment]');
  if (confirmTestPaymentButton) {
    confirmTestPayment(confirmTestPaymentButton);
    return;
  }

  const button = event.target.closest?.('[data-delete-commerce]');
  if (!button) return;
  deleteCommerceRecord(button);
}

async function confirmTestPayment(button) {
  const client = getAdminClient();
  const id = button?.dataset?.id;
  if (!client || !id || !window.confirm('Confirm this simulated payment? No real money will be recorded.')) return;
  button.disabled = true;
  button.textContent = 'Confirming...';
  const { error } = await client.rpc('update_test_order_status', {
    p_order_id: id,
    p_status: 'paid'
  });
  if (error) {
    button.disabled = false;
    button.textContent = 'Confirm Test Payment';
    setCommerceStatus(`Could not confirm the test payment. ${error.message || error}`);
    return;
  }
  setCommerceStatus('Test payment confirmed. No real payment was recorded.');
  refreshCommerceAdmin();
}

async function toggleOrderProductionStatus(button) {
  const client = window.getMvpluxSupabaseClient?.();
  const id = button?.dataset?.id;
  const nextStatus = button?.dataset?.toggleProduction || 'sent_to_production';
  if (!client || !id) return;

  button.disabled = true;
  button.textContent = 'Saving...';
  const { error } = await client
    .from('order_requests')
    .update({ status: nextStatus })
    .eq('id', id);

  if (error) {
    button.disabled = false;
    button.textContent = nextStatus === 'sent_to_production' ? 'Needs Production' : 'Production Sent';
    setCommerceStatus('Could not update production status yet. Run the admin update SQL in Supabase, then try again.');
    return;
  }

  setCommerceStatus(nextStatus === 'sent_to_production' ? 'Order marked sent to production.' : 'Order marked as needing production again.');
  refreshCommerceAdmin();
}

async function refreshCommerceAdmin() {
  const ordersList = document.getElementById('adminOrdersList');
  const offersList = document.getElementById('adminOffersList');
  const client = window.getMvpluxSupabaseClient?.();

  if (!ordersList || !offersList) return;
  if (!client) {
    setCommerceStatus('Supabase is not loaded yet.');
    return;
  }

  setCommerceStatus('Loading orders and offers...');
  ordersList.innerHTML = commerceEmptyMarkup('Loading orders...');
  offersList.innerHTML = commerceEmptyMarkup('Loading offers...');

  const [ordersResponse, offersResponse] = await Promise.all([
    client.from('order_requests').select('*').order('created_at', { ascending: false }).limit(25),
    client.from('offers').select('*').order('created_at', { ascending: false }).limit(25)
  ]);

  if (ordersResponse.error || offersResponse.error) {
    setCommerceStatus('Could not load orders/offers yet. Make sure you are signed in and the admin Supabase policy has been added.');
    ordersList.innerHTML = commerceEmptyMarkup(ordersResponse.error?.message || 'Orders unavailable.');
    offersList.innerHTML = commerceEmptyMarkup(offersResponse.error?.message || 'Offers unavailable.');
    return;
  }

  adminOfferHistoryById = new Map();
  let historyError = null;
  if (offersResponse.data?.length) {
    const historyResponse = await client
      .from('offer_messages')
      .select('*')
      .in('offer_id', offersResponse.data.map((offer) => offer.id))
      .order('created_at', { ascending: true });
    historyError = historyResponse.error;
    (historyResponse.data || []).forEach((event) => {
      if (!adminOfferHistoryById.has(event.offer_id)) adminOfferHistoryById.set(event.offer_id, []);
      adminOfferHistoryById.get(event.offer_id).push(event);
    });
  }

  ordersList.innerHTML = ordersResponse.data?.length
    ? ordersResponse.data.map(orderCardMarkup).join('')
    : commerceEmptyMarkup('No orders yet.');

  offersList.innerHTML = offersResponse.data?.length
    ? offersResponse.data.map(offerCardMarkup).join('')
    : commerceEmptyMarkup('No offers yet.');

  setCommerceStatus(`Loaded ${ordersResponse.data?.length || 0} orders and ${offersResponse.data?.length || 0} offers.${historyError ? ' Apply the offer-history database migration to load dedicated timelines.' : ''}`);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseAdminHeight(value) {
  return window.MVPLUX_PRICING.parseHeight(value);
}

function formatAdminMoney(price) {
  return Number.isFinite(price) ? `$${price.toFixed(2)}` : 'Enter a valid height';
}

function calculateAdminOriginalPrice(height, settings = readPriceSettings()) {
  return window.MVPLUX_PRICING.calculateHeightPrice(height, settings);
}

function updateAdminOriginalPrice(form, settings = readPriceSettings()) {
  const output = form?.querySelector('.admin-original-price');
  if (!output) return;
  output.value = formatAdminMoney(calculateAdminOriginalPrice(form.querySelector('[name="originalHeight"]')?.value, settings));
}

function allAdminProducts() {
  return [
    ...adminProducts.map((product) => ({ ...product, categoryCard: true })),
    ...adminCharacterProducts,
    ...readCustomProducts()
  ];
}

function makeSlug(title) {
  return (title || 'custom-card').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom-card';
}

async function createCustomProduct() {
  const title = document.getElementById('newProductTitle')?.value.trim() || 'Custom Standee';
  const products = readCustomProducts();
  const slug = makeSlug(title);
  if (products.some((product) => product.slug === slug) || [...adminProducts, ...adminCharacterProducts].some((product) => product.slug === slug)) {
    setStatus('A card with that name already exists.');
    return;
  }

  products.push({
    slug,
    custom: true,
    title,
    description: 'New custom standee card.',
    originalHeight: 72,
    cutoutImage: 'images/FrontPageWeb/Sports-Kobe-KB1forprint.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg',
    categories: [],
    visible: false,
    categoryOrder: {}
  });
  if (!await writeCustomProducts(products)) return;
  renderAdminProducts();
  setStatus('Card created and saved live.');
}

async function archiveProduct(slug) {
  const archived = new Set(readArchivedProducts());
  archived.add(slug);
  if (!await writeArchivedProducts([...archived])) return;
  renderAdminProducts();
  setStatus('Card saved for later live.');
}

async function restoreProduct(slug) {
  if (!await writeArchivedProducts(readArchivedProducts().filter((item) => item !== slug))) return;
  renderAdminProducts();
  setStatus('Card restored.');
}

async function deleteProduct(slug) {
  if (!window.confirm('Delete this product record? Its image file will not be deleted.')) return;
  const isCustom = readCustomProducts().some((product) => product.slug === slug);
  const products = readAdminProducts();
  delete products[slug];
  const patch = { products };
  if (isCustom) patch.customProducts = readCustomProducts().filter((product) => product.slug !== slug);
  if (!isCustom) patch.deletedProducts = [...new Set([...readDeletedProducts(), slug])];
  if (!await saveProductWorkflowPatch(patch)) return;
  renderAdminProducts();
  setStatus('Product record deleted. Its image file was not changed.');
}

async function returnProductToDraft(slug) {
  const customProducts = readCustomProducts();
  const product = customProducts.find((item) => item.slug === slug);
  if (!product?.cutoutImage) {
    setStatus('Only approved custom products with a repository image can return to Draft.');
    return;
  }
  if (!window.confirm(`Return ${product.title} to New Images Waiting for Setup? The image file will not be changed.`)) return;

  const imageDrafts = readImageDraftEdits();
  imageDrafts[product.cutoutImage] = {
    path: product.cutoutImage,
    purpose: 'new-product',
    title: product.title || '',
    slug: product.slug || '',
    description: product.description || '',
    originalHeight: String(product.originalHeight || ''),
    backgroundImage: product.backgroundImage || '',
    categories: Array.isArray(product.categories) ? [...product.categories] : []
  };
  const configuredImagePaths = readImageDraftPaths('configuredImagePaths').filter((path) => path !== product.cutoutImage);
  const products = readAdminProducts();
  delete products[slug];
  const savedForLaterProducts = readArchivedProducts().filter((item) => item !== slug);
  const saved = await saveProductWorkflowPatch({
    customProducts: customProducts.filter((item) => item.slug !== slug),
    products,
    savedForLaterProducts,
    configuredImagePaths,
    imageDrafts
  });
  if (!saved) return;
  renderAdminProducts();
  renderImageDrafts();
  setStatus('Product returned to Draft. The physical image file was preserved.');
}

function productPreviewMarkup(value) {
  const title = value.title || 'Product Card';
  const description = value.description || '';
  const cutoutImage = value.cutoutImage || '';
  const backgroundImage = value.backgroundImage || 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg';
  const cutoutHeight = value.cutoutHeight || '63';
  const cutoutLeft = value.cutoutLeft || '50';
  const cutoutBottom = value.cutoutBottom || '21';
  const logoWidth = value.logoWidth || '82';
  const logoTop = value.logoTop || '-4';
  const backgroundPosition = value.stageBackgroundPosition || 'center center';

  return `
    <div class="admin-card-preview">
      <h4>${title}</h4>
      <p>${description}</p>
      <div class="admin-preview-stage" style="background-image: url('${backgroundImage}'); background-position: ${backgroundPosition};">
        <img class="admin-preview-logo" src="images/FrontPageWeb/Herobackgroundparts-logowords.png" alt="" style="width: ${logoWidth}%; top: ${logoTop}%;">
        <img class="admin-preview-cutout" src="${cutoutImage}" alt="" style="height: ${cutoutHeight}%; left: ${cutoutLeft}%; bottom: ${cutoutBottom}%;">
        <button class="admin-resize-handle admin-cutout-resize" type="button" aria-label="Resize standee"></button>
        <button class="admin-resize-handle admin-logo-resize" type="button" aria-label="Resize logo"></button>
        <div class="admin-preview-choice-row">
          <span>Original</span>
          <span>Custom Size</span>
        </div>
      </div>
    </div>
  `;
}

function updateProductPreview(form) {
  const preview = form.querySelector('.admin-card-preview-wrap');
  if (!preview) return;

  const formData = new FormData(form);
  preview.innerHTML = productPreviewMarkup({
    title: formData.get('title').trim(),
    description: formData.get('description').trim(),
    cutoutImage: formData.get('cutoutImage').trim(),
    backgroundImage: formData.get('backgroundImage').trim(),
    cutoutHeight: formData.get('cutoutHeight').trim(),
    cutoutLeft: formData.get('cutoutLeft').trim(),
    cutoutBottom: formData.get('cutoutBottom').trim(),
    logoWidth: formData.get('logoWidth').trim(),
    logoTop: formData.get('logoTop').trim(),
    stageBackgroundPosition: formData.get('stageBackgroundPosition').trim()
  });
  attachPreviewControls(form);
}

function updateFieldValue(form, name, value) {
  const field = form.querySelector(`[name="${name}"]`);
  if (!field) return;
  field.value = String(Math.round(value));
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function syncPreviewFromFields(form) {
  const stage = form.querySelector('.admin-preview-stage');
  const cutout = form.querySelector('.admin-preview-cutout');
  const logo = form.querySelector('.admin-preview-logo');
  const cutoutHandle = form.querySelector('.admin-cutout-resize');
  const logoHandle = form.querySelector('.admin-logo-resize');
  const backgroundImage = form.querySelector('[name="backgroundImage"]')?.value.trim();
  const cutoutImage = form.querySelector('[name="cutoutImage"]')?.value.trim();
  const backgroundPosition = form.querySelector('[name="stageBackgroundPosition"]')?.value.trim() || 'center center';
  const cutoutHeight = form.querySelector('[name="cutoutHeight"]')?.value || '63';
  const cutoutLeft = form.querySelector('[name="cutoutLeft"]')?.value || '50';
  const cutoutBottom = form.querySelector('[name="cutoutBottom"]')?.value || '21';
  const logoWidth = form.querySelector('[name="logoWidth"]')?.value || '82';
  const logoTop = form.querySelector('[name="logoTop"]')?.value || '-4';

  if (stage && backgroundImage) {
    stage.style.backgroundImage = `url("${backgroundImage}")`;
    stage.style.backgroundPosition = backgroundPosition;
  }

  if (cutout && cutoutImage) {
    cutout.src = cutoutImage;
    cutout.style.height = `${cutoutHeight}%`;
    cutout.style.left = `${cutoutLeft}%`;
    cutout.style.bottom = `${cutoutBottom}%`;
  }

  if (logo) {
    logo.style.width = `${logoWidth}%`;
    logo.style.top = `${logoTop}%`;
  }

  if (cutoutHandle) {
    cutoutHandle.style.left = `${clamp(Number(cutoutLeft) + 15, 8, 94)}%`;
    cutoutHandle.style.bottom = `${clamp(Number(cutoutBottom) + Number(cutoutHeight) * 0.18, 8, 84)}%`;
  }

  if (logoHandle) {
    logoHandle.style.left = `${clamp(50 + Number(logoWidth) / 2 - 4, 12, 94)}%`;
    logoHandle.style.top = `${clamp(Number(logoTop) + 7, 2, 40)}%`;
  }
}

function attachPreviewControls(form) {
  const preview = form.querySelector('.admin-preview-stage');
  const cutout = form.querySelector('.admin-preview-cutout');
  const logo = form.querySelector('.admin-preview-logo');
  const cutoutHandle = form.querySelector('.admin-cutout-resize');
  const logoHandle = form.querySelector('.admin-logo-resize');
  if (!preview || !cutout || cutout.dataset.controlsReady) return;

  cutout.dataset.controlsReady = 'true';
  cutout.title = 'Drag to move. Drag gold corner to resize.';
  logo.title = 'Drag logo to move. Drag gold corner to resize.';
  if (cutoutHandle) cutoutHandle.title = 'Drag to resize standee.';
  if (logoHandle) logoHandle.title = 'Drag to resize logo.';

  syncPreviewFromFields(form);

  const dragTarget = (event, target) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const move = (moveEvent) => {
      const rect = preview.getBoundingClientRect();
      const xPercent = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      const bottomPercent = ((rect.bottom - moveEvent.clientY) / rect.height) * 100;

      if (target === 'cutout') {
        updateFieldValue(form, 'cutoutLeft', clamp(xPercent, 0, 100));
        updateFieldValue(form, 'cutoutBottom', clamp(bottomPercent, 0, 60));
      } else {
        updateFieldValue(form, 'logoTop', clamp(((moveEvent.clientY - rect.top) / rect.height) * 100, -20, 40));
      }
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  cutout.addEventListener('pointerdown', (event) => dragTarget(event, 'cutout'));
  logo.addEventListener('pointerdown', (event) => dragTarget(event, 'logo'));

  const resizeTarget = (event, name, min, max, baseValue, direction = 1) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const startY = event.clientY;
    const field = form.querySelector(`[name="${name}"]`);
    const startValue = parseFloat(field?.value || baseValue);
    const move = (moveEvent) => {
      const delta = ((startY - moveEvent.clientY) / preview.getBoundingClientRect().height) * 100 * direction;
      updateFieldValue(form, name, clamp(startValue + delta, min, max));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  cutoutHandle?.addEventListener('pointerdown', (event) => resizeTarget(event, 'cutoutHeight', 30, 100, 63));
  logoHandle?.addEventListener('pointerdown', (event) => resizeTarget(event, 'logoWidth', 30, 100, 82));

  cutout.addEventListener('wheel', (event) => {
    event.preventDefault();
    const field = form.querySelector('[name="cutoutHeight"]');
    const current = parseFloat(field.value || '63');
    updateFieldValue(form, 'cutoutHeight', clamp(current + (event.deltaY < 0 ? 2 : -2), 30, 100));
  });

  logo.addEventListener('wheel', (event) => {
    event.preventDefault();
    const field = form.querySelector('[name="logoWidth"]');
    const current = parseFloat(field.value || '82');
    updateFieldValue(form, 'logoWidth', clamp(current + (event.deltaY < 0 ? 2 : -2), 30, 100));
  });
}

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('error', () => reject(new Error('Could not read image.')));
    reader.addEventListener('load', () => {
      const image = new Image();
      image.addEventListener('error', () => reject(new Error('Could not load image.')));
      image.addEventListener('load', () => {
        const maxSide = 1800;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const keepTransparency = file.type === 'image/png' || file.type === 'image/webp';
        resolve(canvas.toDataURL(keepTransparency ? 'image/png' : 'image/jpeg', 0.86));
      });
      image.src = reader.result;
    });
    reader.readAsDataURL(file);
  });
}

function collectProductFormData(form) {
  const formData = new FormData(form);
  const base = allAdminProducts().find((product) => product.slug === form.dataset.slug) || {};
  const current = { ...base, ...(readAdminProducts()[form.dataset.slug] || {}) };
  return {
    custom: Boolean(current?.custom),
    title: formData.get('title').trim(),
    description: formData.get('description').trim(),
    cutoutImage: formData.get('cutoutImage').trim(),
    backgroundImage: formData.get('backgroundImage').trim(),
    originalHeight: formData.get('originalHeight').trim(),
    cutoutHeight: formData.get('cutoutHeight').trim(),
    cutoutLeft: formData.get('cutoutLeft').trim(),
    cutoutBottom: formData.get('cutoutBottom').trim(),
    logoWidth: formData.get('logoWidth').trim(),
    logoTop: formData.get('logoTop').trim(),
    stageBackgroundPosition: formData.get('stageBackgroundPosition').trim(),
    categories: current.categoryCard ? [] : formData.getAll('categories'),
    visible: current.categoryCard ? current.visible !== false : formData.has('visible'),
    categoryOrder: { ...(current.categoryOrder || {}) },
    imageChoices: normalizeImageChoices(current.imageChoices)
  };
}

async function saveProductForm(form, message = 'Saved product changes live. Go back to Shop to see them.') {
  const products = readAdminProducts();
  products[form.dataset.slug] = collectProductFormData(form);
  if (!await writeAdminProducts(products)) return false;
  renderAdminExportPreview();
  setStatus(message);
  return true;
}

function schedulePlacementSave(form) {
  clearTimeout(form._placementSaveTimer);
  form._placementSaveTimer = setTimeout(() => {
    saveProductForm(form, 'Placement preview changed.');
  }, 550);
}

async function handleImageUpload(fileInput, targetInput, form) {
  const file = fileInput.files?.[0];
  if (!file || !targetInput) return;

  setStatus('Loading image...');

  try {
    targetInput.value = await resizeImageFile(file);
    syncPreviewFromFields(form);
    await saveProductForm(form, 'Image changed and saved live.');
  } catch (error) {
    setStatus('That image could not be loaded. Try another image file.');
  }
}

function renderExtraImages() {
  const container = document.getElementById('adminExtraImages');
  if (!container) return;

  const saved = readExtraImages();
  const grouped = extraImageItems.reduce((groups, item) => {
    groups[item.group] = groups[item.group] || [];
    groups[item.group].push(item);
    return groups;
  }, {});

  container.innerHTML = Object.entries(grouped).map(([group, items]) => `
    <div class="admin-extra-image-group">
      <h3>${group}</h3>
      <div class="admin-extra-image-grid">
        ${items.map((item) => {
          const src = saved[item.key] || item.fallback;
          return `
            <div class="admin-extra-image-card" data-extra-image="${item.key}">
              <img src="${src}" alt="">
              <strong>${item.label}</strong>
              <input class="admin-long-path" type="text" value="${src}" readonly>
              <input type="file" accept="image/*">
              <button type="button" data-reset-extra-image="${item.key}">Reset</button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.admin-extra-image-card').forEach((card) => {
    const key = card.dataset.extraImage;
    const input = card.querySelector('input[type="file"]');
    input?.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;

      setStatus('Loading image...');
      try {
        const dataUrl = await resizeImageFile(file);
        const images = readExtraImages();
        images[key] = dataUrl;
        writeExtraImages(images);
        card.querySelector('img').src = dataUrl;
        card.querySelector('.admin-long-path').value = dataUrl;
        setStatus('Image saved live.');
      } catch (error) {
        setStatus('That image could not be loaded. Try another image file.');
      }
    });
  });

  container.querySelectorAll('[data-reset-extra-image]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!window.confirm('Clear this image edit and go back to the original image?')) return;
      const images = readExtraImages();
      delete images[button.dataset.resetExtraImage];
      writeExtraImages(images);
      renderExtraImages();
      setStatus('Image reset and saved live.');
    });
  });
}

function renderSavedProducts() {
  const container = document.getElementById('savedProducts');
  if (!container) return;

  const archived = readArchivedProducts();
  if (!archived.length) {
    container.innerHTML = '';
    return;
  }

  const bySlug = Object.fromEntries(allAdminProducts().map((product) => [product.slug, product]));
  container.innerHTML = `
    <div class="admin-saved-box">
      <h3>Saved for Later</h3>
      <div class="admin-saved-list">
        ${archived.map((slug) => `
          <button type="button" data-restore-slug="${slug}">Restore ${bySlug[slug]?.title || slug}</button>
        `).join('')}
      </div>
    </div>
  `;

  container.querySelectorAll('[data-restore-slug]').forEach((button) => {
    button.addEventListener('click', () => restoreProduct(button.dataset.restoreSlug));
  });
}

function categoryAssignmentMarkup(value) {
  const categories = window.MVPLUX_PRODUCT_CATEGORIES || [];
  const selected = new Set(value.categories || []);
  return `
    <fieldset class="admin-category-controls">
      <legend>Sections</legend>
      <label class="admin-visible-toggle">
        <input name="visible" type="checkbox" ${value.visible === false ? '' : 'checked'}>
        Show this product in assigned sections
      </label>
      <details>
        <summary>Add to Another Section</summary>
        <div class="admin-category-options">
          ${categories.map((category) => `
            <label>
              <input name="categories" type="checkbox" value="${category.key}" ${selected.has(category.key) ? 'checked' : ''}>
              ${category.label}
            </label>
          `).join('')}
        </div>
      </details>
      <div class="admin-category-order-row">
        <label>
          Current section
          <select name="activeCategory">
            ${categories.map((category) => `<option value="${category.key}" ${selected.has(category.key) ? 'selected' : ''}>${category.label}</option>`).join('')}
          </select>
        </label>
        <button type="button" data-remove-section>Remove from This Category</button>
        <button type="button" data-move-product="-1" title="Move left">←</button>
        <button type="button" data-move-product="1" title="Move right">→</button>
        <button type="button" data-move-product="-3" title="Move up">↑</button>
        <button type="button" data-move-product="3" title="Move down">↓</button>
      </div>
    </fieldset>
  `;
}

async function setProductVisibility(form, visible) {
  const input = form.querySelector('[name="visible"]');
  if (input) input.checked = visible;
  if (!await saveProductForm(form, visible ? 'Product shown in assigned sections.' : 'Product hidden from customer sections.')) return;
  renderAdminProducts();
}

async function removeProductFromSelectedSection(form) {
  const category = form.querySelector('[name="activeCategory"]')?.value;
  const checkbox = form.querySelector(`[name="categories"][value="${category}"]`);
  if (!category || !checkbox || !checkbox.checked) {
    setStatus('That product is not assigned to the selected section.');
    return;
  }
  checkbox.checked = false;
  if (!await saveProductForm(form, 'Removed from this section without deleting the product.')) return;
  renderAdminProducts();
}

async function moveProductInSelectedSection(form, offset) {
  const category = form.querySelector('[name="activeCategory"]')?.value;
  const slug = form.dataset.slug;
  const saved = readAdminProducts();
  const deleted = new Set(readDeletedProducts());
  const products = allAdminProducts()
    .filter((product) => !product.categoryCard && !deleted.has(product.slug))
    .map((product) => ({ ...product, ...(saved[product.slug] || {}) }))
    .filter((product) => product.visible !== false && (product.categories || []).includes(category))
    .sort((a, b) => (Number(a.categoryOrder?.[category]) || 0) - (Number(b.categoryOrder?.[category]) || 0));
  const index = products.findIndex((product) => product.slug === slug);
  const target = products[index + offset];
  if (index < 0 || !target) {
    setStatus('That product is already at the edge of this section.');
    return;
  }

  const currentOrder = Number(products[index].categoryOrder?.[category]) || index;
  const targetOrder = Number(target.categoryOrder?.[category]) || index + offset;
  saved[slug] = {
    ...(saved[slug] || {}),
    categoryOrder: { ...(products[index].categoryOrder || {}), [category]: targetOrder }
  };
  saved[target.slug] = {
    ...(saved[target.slug] || {}),
    categoryOrder: { ...(target.categoryOrder || {}), [category]: currentOrder }
  };
  if (!await writeAdminProducts(saved)) return;
  renderAdminProducts();
  setStatus('Product order saved for the selected section.');
}

function effectiveAdminProducts() {
  const saved = readAdminProducts();
  const deleted = new Set(readDeletedProducts());
  return allAdminProducts()
    .filter((product) => !product.categoryCard && !deleted.has(product.slug))
    .map((product) => ({ ...product, ...(saved[product.slug] || {}) }));
}

function effectiveAdminProduct(slug) {
  return effectiveAdminProducts().find((product) => product.slug === slug) || null;
}

function productCategoryNames(product) {
  const labels = new Map((window.MVPLUX_PRODUCT_CATEGORIES || []).map((category) => [category.key, category.label]));
  return (product?.categories || []).map((category) => labels.get(category) || category).join(', ') || 'Uncategorized';
}

function parentProductPickerMarkup(selectedSlug = '', excludedSlug = '', selectName = 'parentProductSlug') {
  const products = effectiveAdminProducts()
    .filter((product) => product.slug !== excludedSlug)
    .sort((left, right) => String(left.title || left.slug).localeCompare(String(right.title || right.slug)));
  return `
    <div class="admin-parent-product-picker">
      <label>
        Search product cards
        <input type="search" data-parent-product-search placeholder="Search title, slug, or category">
      </label>
      <label>
        Belongs to product card
        <select name="${selectName}" data-parent-product-select required>
          <option value="">Select a product card</option>
          ${products.map((product) => `
            <option value="${escapeAdminHtml(product.slug)}" ${product.slug === selectedSlug ? 'selected' : ''}
              data-search="${escapeAdminHtml(`${product.title} ${product.slug} ${productCategoryNames(product)}`.toLowerCase())}">
              ${escapeAdminHtml(product.title)} — ${escapeAdminHtml(product.slug)} — ${escapeAdminHtml(productCategoryNames(product))}
            </option>
          `).join('')}
        </select>
      </label>
      <div class="admin-parent-product-preview" data-parent-product-preview></div>
    </div>
  `;
}

function bindParentProductPicker(scope) {
  const search = scope.querySelector('[data-parent-product-search]');
  const select = scope.querySelector('[data-parent-product-select]');
  const preview = scope.querySelector('[data-parent-product-preview]');
  if (!select) return;

  const updatePreview = () => {
    const product = effectiveAdminProduct(select.value);
    if (!preview) return;
    preview.innerHTML = product ? `
      <img src="${escapeAdminHtml(product.cutoutImage || '')}" alt="">
      <span><strong>${escapeAdminHtml(product.title)}</strong><br>${escapeAdminHtml(product.slug)}<br>${escapeAdminHtml(productCategoryNames(product))}</span>
    ` : '<span>No parent product selected.</span>';
  };

  search?.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    [...select.options].forEach((option, index) => {
      if (index === 0) return;
      option.hidden = Boolean(query) && !String(option.dataset.search || '').includes(query);
    });
  });
  select.addEventListener('change', updatePreview);
  updatePreview();
}

function findProductImageOwner(path, excludedSlug = '') {
  const imagePath = String(path || '').trim();
  if (!imagePath) return null;
  return effectiveAdminProducts().find((product) => (
    product.slug !== excludedSlug
    && (product.cutoutImage === imagePath || normalizeImageChoices(product.imageChoices).some((choice) => choice.image === imagePath))
  )) || null;
}

async function writeProductImageChoices(slug, choices) {
  const normalized = normalizeImageChoices(choices);
  const customProducts = readCustomProducts();
  const customIndex = customProducts.findIndex((product) => product.slug === slug);
  if (customIndex >= 0) {
    customProducts[customIndex] = { ...customProducts[customIndex], imageChoices: normalized };
    return Boolean(await writeCustomProducts(customProducts));
  }
  const saved = readAdminProducts();
  saved[slug] = { ...(saved[slug] || {}), imageChoices: normalized };
  return Boolean(await writeAdminProducts(saved));
}

async function addImageChoiceToProduct(parentSlug, choice, excludedSlug = '') {
  const parent = effectiveAdminProduct(parentSlug);
  if (!parent) throw new Error('Select an existing parent product card.');
  const owner = findProductImageOwner(choice.image, excludedSlug);
  if (owner) throw new Error(`That image is already assigned to ${owner.title} (${owner.slug}).`);
  if (!await writeProductImageChoices(parentSlug, [...normalizeImageChoices(parent.imageChoices), choice])) {
    throw new Error('Could not save the image choice to Supabase.');
  }
  return parent;
}

async function removeProductImageChoice(parentSlug, imagePath) {
  const parent = effectiveAdminProduct(parentSlug);
  if (!parent) return;
  const choice = normalizeImageChoices(parent.imageChoices).find((item) => item.image === imagePath);
  if (!choice || !window.confirm(`Remove “${choice.label}” from ${parent.title}? The image file will not be deleted.`)) return;
  const choices = normalizeImageChoices(parent.imageChoices).filter((item) => item.image !== imagePath);
  const configuredImagePaths = readImageDraftPaths('configuredImagePaths').filter((path) => path !== imagePath);
  const patch = { configuredImagePaths };
  const customProducts = readCustomProducts();
  const customIndex = customProducts.findIndex((product) => product.slug === parentSlug);
  if (customIndex >= 0) {
    customProducts[customIndex] = { ...customProducts[customIndex], imageChoices: choices };
    patch.customProducts = customProducts;
  } else {
    const products = readAdminProducts();
    products[parentSlug] = { ...(products[parentSlug] || {}), imageChoices: choices };
    patch.products = products;
  }
  if (!await saveProductWorkflowPatch(patch)) return;
  renderAdminProducts();
  renderImageDrafts();
  setStatus('Image choice removed. The physical image file was not changed.');
}

async function renameProductImageChoice(parentSlug, imagePath, label) {
  const parent = effectiveAdminProduct(parentSlug);
  const nextLabel = String(label || '').trim();
  if (!parent || !nextLabel) {
    setStatus('Enter an image-choice label before saving.');
    return;
  }
  const choices = normalizeImageChoices(parent.imageChoices).map((choice) => (
    choice.image === imagePath ? { ...choice, label: nextLabel } : choice
  ));
  if (!await writeProductImageChoices(parentSlug, choices)) return;
  renderAdminProducts();
  setStatus('Image-choice label saved.');
}

async function moveProductImageChoice(sourceSlug, imagePath, targetSlug) {
  const source = effectiveAdminProduct(sourceSlug);
  const target = effectiveAdminProduct(targetSlug);
  const choice = normalizeImageChoices(source?.imageChoices).find((item) => item.image === imagePath);
  if (!source || !target || !choice || sourceSlug === targetSlug) {
    setStatus('Select a different product card for this image choice.');
    return;
  }
  if (findProductImageOwner(imagePath, sourceSlug)) {
    setStatus('That image path is already assigned to another product.');
    return;
  }
  if (!window.confirm(`Move “${choice.label}” from ${source.title} to ${target.title}? The physical image file will be preserved.`)) return;

  const customProducts = readCustomProducts();
  const products = readAdminProducts();
  const setChoices = (slug, choices) => {
    const customIndex = customProducts.findIndex((product) => product.slug === slug);
    if (customIndex >= 0) customProducts[customIndex] = { ...customProducts[customIndex], imageChoices: normalizeImageChoices(choices) };
    else products[slug] = { ...(products[slug] || {}), imageChoices: normalizeImageChoices(choices) };
  };
  setChoices(sourceSlug, normalizeImageChoices(source.imageChoices).filter((item) => item.image !== imagePath));
  setChoices(targetSlug, [...normalizeImageChoices(target.imageChoices), choice]);
  if (!await saveProductWorkflowPatch({ customProducts, products })) return;
  renderAdminProducts();
  setStatus('Image choice moved. The physical image file was not changed.');
}

async function moveCustomProductToExistingProduct(form) {
  const sourceSlug = form.dataset.slug;
  const source = readCustomProducts().find((product) => product.slug === sourceSlug);
  const parentSlug = form.querySelector('[name="moveParentProductSlug"]')?.value || '';
  const label = form.querySelector('[name="moveImageChoiceLabel"]')?.value.trim() || source?.title || 'Alternate image';
  const parent = effectiveAdminProduct(parentSlug);
  if (!source || !parent || parentSlug === sourceSlug) {
    setStatus('Select a different existing product card.');
    return;
  }
  if (!source.cutoutImage) {
    setStatus('That standalone product does not have an image path to move.');
    return;
  }
  if (!window.confirm(`Move ${source.title} into ${parent.title} as an image choice? The physical image file will be preserved.`)) return;

  try {
    const incomingChoices = [
      { label, image: source.cutoutImage },
      ...normalizeImageChoices(source.imageChoices)
    ];
    incomingChoices.forEach((choice) => {
      const owner = findProductImageOwner(choice.image, sourceSlug);
      if (owner) throw new Error(`Image ${choice.image} is already assigned to ${owner.title} (${owner.slug}).`);
    });
    const parentChoices = [...normalizeImageChoices(parent.imageChoices), ...incomingChoices];
    const customProducts = readCustomProducts();
    const parentIndex = customProducts.findIndex((product) => product.slug === parentSlug);
    const remainingProducts = customProducts.filter((product) => product.slug !== sourceSlug);
    const patch = {};
    if (parentIndex >= 0) {
      const remainingParentIndex = remainingProducts.findIndex((product) => product.slug === parentSlug);
      remainingProducts[remainingParentIndex] = { ...remainingProducts[remainingParentIndex], imageChoices: parentChoices };
      patch.customProducts = remainingProducts;
    } else {
      patch.customProducts = remainingProducts;
      const products = readAdminProducts();
      products[parentSlug] = { ...(products[parentSlug] || {}), imageChoices: parentChoices };
      delete products[sourceSlug];
      patch.products = products;
    }
    const archived = readArchivedProducts().filter((slug) => slug !== sourceSlug);
    patch.savedForLaterProducts = archived;
    const history = getAdminLiveValue('productRelationshipHistory', []);
    const entry = { action: 'moved-to-image-choice', sourceSlug, parentSlug, image: source.cutoutImage, date: new Date().toISOString() };
    patch.productRelationshipHistory = [...history, entry];
    if (!await saveProductWorkflowPatch(patch)) return;
    localStorage.setItem('mvpluxProductRelationshipHistory', JSON.stringify(patch.productRelationshipHistory));
    renderAdminProducts();
    renderImageDrafts();
    setStatus('Standalone product moved into the selected product card. The image file was preserved.');
  } catch (error) {
    setStatus(error.message || 'Could not move that product.');
  }
}

function productImageChoicesMarkup(value) {
  const choices = normalizeImageChoices(value.imageChoices);
  const moveTargets = effectiveAdminProducts()
    .filter((product) => product.slug !== value.slug)
    .sort((left, right) => String(left.title || left.slug).localeCompare(String(right.title || right.slug)));
  return `
    <fieldset class="admin-image-choice-manager">
      <legend>Image Choices For Selected Standee</legend>
      ${choices.length ? choices.map((choice) => `
        <div class="admin-image-choice-row">
          <img src="${escapeAdminHtml(choice.image)}" alt="">
          <span><strong>${escapeAdminHtml(choice.label)}</strong><br>${escapeAdminHtml(choice.image)}</span>
          <label>Rename choice<input type="text" value="${escapeAdminHtml(choice.label)}" data-image-choice-label="${escapeAdminHtml(choice.image)}"></label>
          <button type="button" data-rename-image-choice="${escapeAdminHtml(choice.image)}">Save label</button>
          <label>Move choice to
            <select data-move-image-choice-target="${escapeAdminHtml(choice.image)}">
              <option value="">Select product</option>
              ${moveTargets.map((product) => `<option value="${escapeAdminHtml(product.slug)}">${escapeAdminHtml(product.title)} — ${escapeAdminHtml(product.slug)}</option>`).join('')}
            </select>
          </label>
          <button type="button" data-move-image-choice="${escapeAdminHtml(choice.image)}">Move choice</button>
          <button type="button" data-remove-image-choice="${escapeAdminHtml(choice.image)}">Remove image choice</button>
        </div>
      `).join('') : '<p class="admin-note">No alternate image choices assigned.</p>'}
    </fieldset>
  `;
}

function renderAdminProducts() {
  const approvedContainer = document.getElementById('approvedProducts');
  const publishedContainer = document.getElementById('publishedProducts');
  const categoryContainer = document.getElementById('adminProducts');
  const productContainers = [approvedContainer, publishedContainer, categoryContainer].filter(Boolean);
  const saved = readAdminProducts();
  const archived = new Set(readArchivedProducts());
  if (!productContainers.length) return;

  renderSavedProducts();

  const deleted = new Set(readDeletedProducts());
  const availableProducts = allAdminProducts().filter((product) => !archived.has(product.slug) && !deleted.has(product.slug));
  const productMarkup = (products, lifecycleLabel = '') => products.map((product) => {
    const value = { ...product, ...(saved[product.slug] || {}) };
    const lifecycle = product.categoryCard ? '' : lifecycleLabel || productLifecycleState(product, saved, archived).label;
    return `
      <form class="admin-product-card" id="product-${product.slug}" data-slug="${product.slug}">
        <div class="admin-product-heading">
          <div><h3>${product.title}</h3>${lifecycle ? `<p class="admin-note">${escapeAdminHtml(lifecycle)}</p>` : ''}</div>
          <div class="admin-card-actions">
            <button type="submit">Save Product</button>
            <button type="button" data-archive-product="${product.slug}">Save for Later</button>
            ${product.categoryCard ? '' : `<button type="button" data-visibility-toggle="${value.visible === false ? 'show' : 'hide'}">${value.visible === false ? 'Show' : 'Hide'}</button>`}
            ${value.custom === true ? `<button type="button" data-return-to-draft="${product.slug}">Return to Draft</button>` : ''}
            ${product.categoryCard ? '' : `<button type="button" data-delete-product="${product.slug}">Delete Product</button>`}
          </div>
        </div>
        <div class="admin-product-layout">
          <div class="admin-card-preview-wrap">
            ${productPreviewMarkup(value)}
          </div>
          <div class="admin-control-groups">
            <fieldset>
              <legend>Card Text</legend>
              <label>
                Card title
                <input name="title" type="text" value="${value.title || ''}">
              </label>
              ${product.categoryCard ? '' : `
                <label>
                  Product slug
                  <input name="productSlug" type="text" value="${escapeAdminHtml(value.slug || product.slug)}" readonly>
                </label>
              `}
              <label>
                Card description
                <textarea name="description" rows="3">${value.description || ''}</textarea>
              </label>
            </fieldset>
            ${product.categoryCard ? '' : categoryAssignmentMarkup(value)}
            <fieldset>
              <legend>Images</legend>
              <label>
                Standee image path
                <input name="cutoutImage" class="admin-long-path" type="text" value="${value.cutoutImage || ''}" readonly>
              </label>
              <label>
                Upload standee image
                <input name="cutoutUpload" type="file" accept="image/*">
              </label>
              <label>
                Background image path
                <input name="backgroundImage" class="admin-long-path" type="text" value="${value.backgroundImage || ''}" readonly>
              </label>
              <label>
                Upload background image
                <input name="backgroundUpload" type="file" accept="image/*">
              </label>
            </fieldset>
            ${product.categoryCard ? '' : productImageChoicesMarkup(value)}
            ${value.custom === true ? `
              <details class="admin-move-product-panel">
                <summary>Move to existing product</summary>
                ${parentProductPickerMarkup('', value.slug, 'moveParentProductSlug')}
                <label>
                  Image-choice label
                  <input name="moveImageChoiceLabel" type="text" value="${escapeAdminHtml(value.title || '')}" placeholder="Alternate pose">
                </label>
                <button type="button" data-move-to-existing-product>Move to existing product</button>
                <p class="admin-note">This removes only the standalone Admin product relationship. The physical image file is preserved.</p>
              </details>
            ` : ''}
            <fieldset>
              <legend>Size & Price</legend>
              <div class="admin-form-row">
                <label>
                  Original height
                  <input name="originalHeight" type="text" value="${value.originalHeight || ''}" placeholder="6'6, 78, 2, or 24">
                </label>
                <label>
                  Original price
                  <output class="admin-original-price">${formatAdminMoney(calculateAdminOriginalPrice(value.originalHeight))}</output>
                </label>
              </div>
            </fieldset>
            <fieldset>
              <legend>Main Page Placement</legend>
              <div class="admin-form-row admin-placement-row">
                <label>
                  Standee size %
                  <input name="cutoutHeight" type="range" min="30" max="100" step="1" value="${value.cutoutHeight || '63'}">
                </label>
                <label>
                  Left / right %
                  <input name="cutoutLeft" type="range" min="0" max="100" step="1" value="${value.cutoutLeft || '50'}">
                </label>
                <label>
                  Up / down %
                  <input name="cutoutBottom" type="range" min="0" max="60" step="1" value="${value.cutoutBottom || '21'}">
                </label>
              </div>
              <div class="admin-form-row admin-placement-row">
                <label>
                  Logo size %
                  <input name="logoWidth" type="range" min="30" max="100" step="1" value="${value.logoWidth || '82'}">
                </label>
                <label>
                  Logo up / down %
                  <input name="logoTop" type="range" min="-20" max="40" step="1" value="${value.logoTop || '-4'}">
                </label>
                <label>
                  Background position
                  <input name="stageBackgroundPosition" type="text" value="${value.stageBackgroundPosition || ''}" placeholder="center center">
                </label>
              </div>
            </fieldset>
          </div>
        </div>
      </form>
    `;
  }).join('');

  const approvedProducts = availableProducts.filter((product) => !product.categoryCard);
  const waitingProducts = approvedProducts.filter((product) => productLifecycleState(product, saved, archived).key === 'waiting');
  const publishedProducts = approvedProducts.filter((product) => productLifecycleState(product, saved, archived).key === 'published');
  if (approvedContainer) approvedContainer.innerHTML = productMarkup(waitingProducts) || '<p class="admin-note">No products are waiting to publish.</p>';
  if (publishedContainer) publishedContainer.innerHTML = productMarkup(publishedProducts, 'Published') || '<p class="admin-note">No products have been published yet.</p>';
  if (categoryContainer) categoryContainer.innerHTML = productMarkup(availableProducts.filter((product) => product.categoryCard));

  productContainers.forEach((container) => container.querySelectorAll('.admin-product-card').forEach((form) => {
    bindParentProductPicker(form);
    updateAdminOriginalPrice(form);
    form.querySelectorAll('input, textarea').forEach((field) => {
      field.addEventListener('input', () => {
        if (field.name === 'originalHeight') updateAdminOriginalPrice(form);
        if (field.matches('[type="range"], .admin-long-path, [name="stageBackgroundPosition"]')) {
          syncPreviewFromFields(form);
          if (field.matches('[type="range"], [name="stageBackgroundPosition"]')) {
            schedulePlacementSave(form);
          }
        } else if (!field.matches('[type="file"]')) {
          updateProductPreview(form);
        }
      });
    });
    attachPreviewControls(form);

    form.querySelector('[name="cutoutUpload"]')?.addEventListener('change', (event) => {
      handleImageUpload(event.target, form.querySelector('[name="cutoutImage"]'), form);
    });

    form.querySelector('[name="backgroundUpload"]')?.addEventListener('change', (event) => {
      handleImageUpload(event.target, form.querySelector('[name="backgroundImage"]'), form);
    });

    form.querySelector('[data-archive-product]')?.addEventListener('click', (event) => {
      archiveProduct(event.target.dataset.archiveProduct);
    });

    form.querySelector('[data-delete-product]')?.addEventListener('click', (event) => {
      deleteProduct(event.target.dataset.deleteProduct);
    });

    form.querySelector('[data-return-to-draft]')?.addEventListener('click', (event) => {
      returnProductToDraft(event.target.dataset.returnToDraft);
    });

    form.querySelector('[data-visibility-toggle]')?.addEventListener('click', (event) => {
      setProductVisibility(form, event.target.dataset.visibilityToggle === 'show');
    });

    form.querySelector('[data-remove-section]')?.addEventListener('click', () => {
      removeProductFromSelectedSection(form);
    });

    form.querySelectorAll('[data-move-product]').forEach((button) => {
      button.addEventListener('click', () => {
        moveProductInSelectedSection(form, Number(button.dataset.moveProduct));
      });
    });

    form.querySelectorAll('[data-remove-image-choice]').forEach((button) => {
      button.addEventListener('click', () => removeProductImageChoice(form.dataset.slug, button.dataset.removeImageChoice));
    });

    form.querySelectorAll('[data-rename-image-choice]').forEach((button) => {
      button.addEventListener('click', () => {
        const imagePath = button.dataset.renameImageChoice;
        const label = button.closest('.admin-image-choice-row')?.querySelector('[data-image-choice-label]')?.value;
        renameProductImageChoice(form.dataset.slug, imagePath, label);
      });
    });

    form.querySelectorAll('[data-move-image-choice]').forEach((button) => {
      button.addEventListener('click', () => {
        const imagePath = button.dataset.moveImageChoice;
        const target = button.closest('.admin-image-choice-row')?.querySelector('[data-move-image-choice-target]')?.value || '';
        moveProductImageChoice(form.dataset.slug, imagePath, target);
      });
    });

    form.querySelector('[data-move-to-existing-product]')?.addEventListener('click', () => {
      moveCustomProductToExistingProduct(form);
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      saveProductForm(form);
    });
  }));
  renderAdminDiagnostics();
}

function fillPriceSettingsForm() {
  const settings = readPriceSettings();
  const twoFootPrice = document.getElementById('twoFootPrice');
  const threeFootPrice = document.getElementById('threeFootPrice');
  const fullHeight = document.getElementById('fullHeight');
  const fullPrice = document.getElementById('fullPrice');
  const extraInchPrice = document.getElementById('extraInchPrice');

  if (twoFootPrice) twoFootPrice.value = settings.twoFootPrice || '35.00';
  if (threeFootPrice) threeFootPrice.value = settings.threeFootPrice || '50.00';
  if (fullHeight) fullHeight.value = settings.fullHeight || '78';
  if (fullPrice) fullPrice.value = settings.fullPrice || '129.99';
  if (extraInchPrice) extraInchPrice.value = settings.extraInchPrice || '2.00';
}

function setupPriceRules() {
  const form = document.getElementById('priceRulesForm');
  if (!form) return;

  fillPriceSettingsForm();

  const getDraftSettings = () => ({
    twoFootPrice: document.getElementById('twoFootPrice')?.value,
    threeFootPrice: document.getElementById('threeFootPrice')?.value,
    fullHeight: document.getElementById('fullHeight')?.value,
    fullPrice: document.getElementById('fullPrice')?.value,
    extraInchPrice: document.getElementById('extraInchPrice')?.value
  });

  form.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', () => {
      document.querySelectorAll('.admin-product-card').forEach((productForm) => {
        updateAdminOriginalPrice(productForm, getDraftSettings());
      });
    });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const settings = {
      twoFootPrice: document.getElementById('twoFootPrice')?.value.trim() || '35.00',
      threeFootPrice: document.getElementById('threeFootPrice')?.value.trim() || '50.00',
      fullHeight: String(parseAdminHeight(document.getElementById('fullHeight')?.value || '78') || 78),
      fullPrice: document.getElementById('fullPrice')?.value.trim() || '129.99',
      extraInchPrice: document.getElementById('extraInchPrice')?.value.trim() || '2.00'
    };
    writePriceSettings(settings);
    fillPriceSettingsForm();
    document.querySelectorAll('.admin-product-card').forEach((productForm) => updateAdminOriginalPrice(productForm, settings));
    setStatus('Prices saved live.');
  });
}

let adminDiscountCodes = [];

function setCouponStatus(message) {
  const status = document.getElementById('adminCouponStatus');
  if (status) status.textContent = message || '';
}

function couponDateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 16);
}

function clearCouponForm() {
  const form = document.getElementById('couponForm');
  form?.reset();
  if (document.getElementById('couponId')) document.getElementById('couponId').value = '';
  if (document.getElementById('couponActive')) document.getElementById('couponActive').checked = true;
  if (document.getElementById('couponMinimum')) document.getElementById('couponMinimum').value = '0';
}

function fillCouponForm(coupon) {
  const values = {
    couponId: coupon.id,
    couponCode: coupon.code,
    couponDescription: coupon.description,
    couponType: coupon.discount_type,
    couponValue: coupon.discount_value,
    couponStartsAt: couponDateInputValue(coupon.starts_at),
    couponExpiresAt: couponDateInputValue(coupon.expires_at),
    couponTotalLimit: coupon.total_usage_limit,
    couponCustomerLimit: coupon.per_customer_usage_limit,
    couponAudience: coupon.audience,
    couponMinimum: coupon.minimum_order_amount,
    couponProduct: coupon.product_restriction,
    couponCategory: coupon.category_restriction
  };
  Object.entries(values).forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (input) input.value = value ?? '';
  });
  document.getElementById('couponActive').checked = Boolean(coupon.active);
  document.getElementById('couponOfferStacking').checked = Boolean(coupon.allow_offer_stacking);
  document.getElementById('couponForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderDiscountCodes() {
  const list = document.getElementById('adminCouponList');
  if (!list) return;
  list.innerHTML = adminDiscountCodes.length ? adminDiscountCodes.map((coupon) => `
    <article class="admin-commerce-card" data-discount-code="${escapeAdminHtml(coupon.id)}">
      <div class="admin-commerce-card-head"><strong>${escapeAdminHtml(coupon.code)}</strong><span>${coupon.active ? 'active' : 'inactive'}</span></div>
      <p>${escapeAdminHtml(coupon.description || 'No description')}</p>
      <p><strong>Discount:</strong> ${coupon.discount_type === 'fixed' ? adminMoney(coupon.discount_value) : `${Number(coupon.discount_value)}%`} · <strong>Audience:</strong> ${coupon.audience === 'member' ? 'Members only' : 'Public'}</p>
      <p><strong>Dates:</strong> ${coupon.starts_at ? adminDate(coupon.starts_at) : 'Now'} to ${coupon.expires_at ? adminDate(coupon.expires_at) : 'No expiration'}</p>
      <p><strong>Limits:</strong> ${coupon.total_usage_limit || 'Unlimited'} total · ${coupon.per_customer_usage_limit || 'Unlimited'} per customer</p>
      <p><strong>Minimum:</strong> ${adminMoney(coupon.minimum_order_amount)} · <strong>Offer stacking:</strong> ${coupon.allow_offer_stacking ? 'Allowed' : 'Not allowed'}</p>
      ${coupon.product_restriction ? `<p><strong>Product:</strong> ${escapeAdminHtml(coupon.product_restriction)}</p>` : ''}
      ${coupon.category_restriction ? `<p><strong>Category:</strong> ${escapeAdminHtml(coupon.category_restriction)}</p>` : ''}
      <button type="button" data-edit-discount="${escapeAdminHtml(coupon.id)}">Edit</button>
      <button type="button" data-toggle-discount="${escapeAdminHtml(coupon.id)}">${coupon.active ? 'Deactivate' : 'Activate'}</button>
    </article>
  `).join('') : commerceEmptyMarkup('No discount codes yet.');
}

async function loadDiscountCodes() {
  const client = getAdminClient();
  if (!client) return;
  const { data, error } = await client.from('discount_codes').select('*').order('created_at', { ascending: false });
  if (error) {
    setCouponStatus(`Discount codes are unavailable until the database migration is applied. ${error.message || error}`);
    return;
  }
  adminDiscountCodes = data || [];
  renderDiscountCodes();
  setCouponStatus(`Loaded ${adminDiscountCodes.length} discount code${adminDiscountCodes.length === 1 ? '' : 's'}.`);
}

function setupCoupons() {
  const form = document.getElementById('couponForm');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const client = getAdminClient();
    const button = form.querySelector('button[type="submit"]');
    const code = document.getElementById('couponCode')?.value.trim().toUpperCase() || '';
    const discountType = document.getElementById('couponType')?.value;
    const discountValue = Number(document.getElementById('couponValue')?.value);
    if (!client || !button || !code || !Number.isFinite(discountValue) || discountValue <= 0 || (discountType === 'percentage' && discountValue > 100)) {
      setCouponStatus('Enter a code and a valid discount value. Percentage discounts cannot exceed 100.');
      return;
    }
    const nullableNumber = (id) => {
      const value = document.getElementById(id)?.value;
      return value ? Number(value) : null;
    };
    const nullableDate = (id) => {
      const value = document.getElementById(id)?.value;
      return value ? new Date(value).toISOString() : null;
    };
    const coupon = {
      code,
      description: document.getElementById('couponDescription')?.value.trim() || null,
      discount_type: discountType,
      discount_value: Number(discountValue.toFixed(2)),
      active: Boolean(document.getElementById('couponActive')?.checked),
      starts_at: nullableDate('couponStartsAt'),
      expires_at: nullableDate('couponExpiresAt'),
      total_usage_limit: nullableNumber('couponTotalLimit'),
      per_customer_usage_limit: nullableNumber('couponCustomerLimit'),
      audience: document.getElementById('couponAudience')?.value,
      minimum_order_amount: nullableNumber('couponMinimum') || 0,
      product_restriction: document.getElementById('couponProduct')?.value.trim() || null,
      category_restriction: document.getElementById('couponCategory')?.value.trim() || null,
      allow_offer_stacking: Boolean(document.getElementById('couponOfferStacking')?.checked)
    };
    if (coupon.starts_at && coupon.expires_at && new Date(coupon.expires_at) <= new Date(coupon.starts_at)) {
      setCouponStatus('Expiration must be after the start date.');
      return;
    }
    button.disabled = true;
    button.textContent = 'Saving...';
    const id = document.getElementById('couponId')?.value;
    const query = id
      ? client.from('discount_codes').update(coupon).eq('id', id)
      : client.from('discount_codes').insert(coupon);
    const { error } = await query;
    button.disabled = false;
    button.textContent = 'Save Discount Code';
    if (error) {
      setCouponStatus(`Could not save the discount code. ${error.message || error}`);
      return;
    }
    clearCouponForm();
    await loadDiscountCodes();
    setCouponStatus(`Discount code ${code} saved.`);
  });

  document.getElementById('clearCouponForm')?.addEventListener('click', clearCouponForm);
  document.getElementById('adminCouponList')?.addEventListener('click', async (event) => {
    const editButton = event.target.closest?.('[data-edit-discount]');
    if (editButton) {
      const coupon = adminDiscountCodes.find((item) => item.id === editButton.dataset.editDiscount);
      if (coupon) fillCouponForm(coupon);
      return;
    }
    const toggleButton = event.target.closest?.('[data-toggle-discount]');
    if (!toggleButton) return;
    const coupon = adminDiscountCodes.find((item) => item.id === toggleButton.dataset.toggleDiscount);
    if (!coupon) return;
    toggleButton.disabled = true;
    const { error } = await getAdminClient().from('discount_codes').update({ active: !coupon.active }).eq('id', coupon.id);
    if (error) {
      toggleButton.disabled = false;
      setCouponStatus(`Could not update the code. ${error.message || error}`);
      return;
    }
    await loadDiscountCodes();
  });
  loadDiscountCodes();
}

let imageDraftInventory = [];

function readImageDraftEdits() {
  return getAdminLiveValue('imageDrafts', readJsonStorage('mvpluxImageDrafts', {}));
}

function writeImageDraftEdits(drafts) {
  const values = drafts || {};
  return saveAdminSettingsLive({ imageDrafts: values }).then((saved) => {
    if (saved) localStorage.setItem('mvpluxImageDrafts', JSON.stringify(values));
    return saved ? values : null;
  });
}

function readImageDraftPaths(key) {
  return getAdminLiveValue(key, readJsonStorage(`mvplux${key[0].toUpperCase()}${key.slice(1)}`, []));
}

function writeImageDraftPaths(key, paths) {
  const uniquePaths = [...new Set(paths || [])];
  return saveAdminSettingsLive({ [key]: uniquePaths }).then((saved) => {
    if (saved) localStorage.setItem(`mvplux${key[0].toUpperCase()}${key.slice(1)}`, JSON.stringify(uniquePaths));
    return saved ? uniquePaths : null;
  });
}

async function saveProductWorkflowPatch(patch) {
  const saved = await saveAdminSettingsLive(patch);
  if (!saved) return false;
  const storageKeys = {
    products: 'mvpluxAdminProducts',
    customProducts: 'mvpluxAdminCustomProducts',
    savedForLaterProducts: 'mvpluxAdminArchivedProducts',
    deletedProducts: 'mvpluxDeletedProducts',
    imageDrafts: 'mvpluxImageDrafts',
    dismissedImageDrafts: 'mvpluxDismissedImageDrafts',
    configuredImagePaths: 'mvpluxConfiguredImagePaths',
    ignoredImagePaths: 'mvpluxIgnoredImagePaths'
  };
  Object.entries(patch).forEach(([key, value]) => {
    if (storageKeys[key]) localStorage.setItem(storageKeys[key], JSON.stringify(value));
  });
  return true;
}

function imageDraftCategoryMarkup(selectedCategories = []) {
  const selected = new Set(selectedCategories);
  return (window.MVPLUX_PRODUCT_CATEGORIES || []).map((category) => `
    <label>
      <input name="categories" type="checkbox" value="${category.key}" ${selected.has(category.key) ? 'checked' : ''}>
      ${category.label}
    </label>
  `).join('');
}

function collectImageDraftForm(form) {
  const formData = new FormData(form);
  const requestedSlug = String(formData.get('slug') || '').trim();
  return {
    path: form.dataset.imagePath,
    purpose: String(formData.get('imagePurpose') || 'new-product'),
    title: String(formData.get('title') || '').trim(),
    slug: requestedSlug ? makeSlug(requestedSlug) : '',
    description: String(formData.get('description') || '').trim(),
    originalHeight: String(formData.get('originalHeight') || '').trim(),
    backgroundImage: String(formData.get('backgroundImage') || ''),
    categories: formData.getAll('categories'),
    parentProductSlug: String(formData.get('parentProductSlug') || ''),
    imageChoiceLabel: String(formData.get('imageChoiceLabel') || '').trim()
  };
}

async function saveImageDraftForm(form) {
  const drafts = readImageDraftEdits();
  drafts[form.dataset.imagePath] = collectImageDraftForm(form);
  if (!await writeImageDraftEdits(drafts)) return;
  setStatus('Unpublished image draft saved.');
}

async function publishImageDraft(form) {
  const draft = collectImageDraftForm(form);
  if (draft.purpose !== 'new-product') return;
  if (!draft.title || !draft.slug || !draft.originalHeight) {
    setStatus('Add a title, slug, and original height before publishing.');
    return;
  }
  if (allAdminProducts().some((product) => product.slug === draft.slug)) {
    setStatus('That slug already belongs to another product.');
    return;
  }
  const imageOwner = findProductImageOwner(draft.path);
  if (imageOwner) {
    setStatus(`That image is already assigned to ${imageOwner.title} (${imageOwner.slug}).`);
    return;
  }

  const products = readCustomProducts();
  products.push({
    slug: draft.slug,
    custom: true,
    title: draft.title,
    description: draft.description || `Preview ${draft.title} with available sizes and display options.`,
    cutoutImage: draft.path,
    backgroundImage: draft.backgroundImage,
    originalHeight: draft.originalHeight,
    categories: draft.categories,
    visible: draft.categories.length > 0,
    categoryOrder: Object.fromEntries(draft.categories.map((category) => [category, 999])),
    imageChoices: []
  });
  const configuredImagePaths = [...new Set([...readImageDraftPaths('configuredImagePaths'), draft.path])];
  const edits = readImageDraftEdits();
  delete edits[draft.path];
  if (!await saveProductWorkflowPatch({ customProducts: products, configuredImagePaths, imageDrafts: edits })) return;
  renderAdminProducts();
  renderImageDrafts();
  setStatus(draft.categories.length ? 'Product added to Admin. Use Publish Changes to send it to the storefront.' : 'Product saved as an uncategorized Admin record.');
}

async function addDraftImageChoice(form) {
  const draft = collectImageDraftForm(form);
  if (draft.purpose !== 'image-choice' || !draft.parentProductSlug) {
    setStatus('Select the product card this image belongs to.');
    return;
  }
  try {
    const parent = effectiveAdminProduct(draft.parentProductSlug);
    if (!parent) throw new Error('Select an existing parent product card.');
    const owner = findProductImageOwner(draft.path);
    if (owner) throw new Error(`That image is already assigned to ${owner.title} (${owner.slug}).`);
    const imageChoices = [...normalizeImageChoices(parent.imageChoices), {
      label: draft.imageChoiceLabel || 'Alternate image',
      image: draft.path
    }];
    const patch = {};
    const customProducts = readCustomProducts();
    const customIndex = customProducts.findIndex((product) => product.slug === parent.slug);
    if (customIndex >= 0) {
      customProducts[customIndex] = { ...customProducts[customIndex], imageChoices };
      patch.customProducts = customProducts;
    } else {
      const products = readAdminProducts();
      products[parent.slug] = { ...(products[parent.slug] || {}), imageChoices };
      patch.products = products;
    }
    patch.configuredImagePaths = [...new Set([...readImageDraftPaths('configuredImagePaths'), draft.path])];
    const edits = readImageDraftEdits();
    delete edits[draft.path];
    patch.imageDrafts = edits;
    if (!await saveProductWorkflowPatch(patch)) return;
    renderAdminProducts();
    renderImageDrafts();
    setStatus('Image choice added to the selected Admin product. Use Publish Changes to send it to the storefront.');
  } catch (error) {
    setStatus(error.message || 'Could not add that image choice.');
  }
}

async function ignoreImageDraft(path) {
  const drafts = readImageDraftEdits();
  delete drafts[path];
  const ignoredImagePaths = [...new Set([...readImageDraftPaths('ignoredImagePaths'), path])];
  if (!await saveProductWorkflowPatch({ imageDrafts: drafts, ignoredImagePaths })) return;
  renderImageDrafts();
  setStatus('Image marked as non-product inventory. The image file was not changed.');
}

function updateImageDraftPurpose(form) {
  const purpose = form.querySelector('[name="imagePurpose"]')?.value || 'new-product';
  form.querySelectorAll('[data-draft-purpose]').forEach((section) => {
    section.hidden = section.dataset.draftPurpose !== purpose;
  });
  form.querySelectorAll('[data-draft-action]').forEach((button) => {
    button.hidden = button.dataset.draftAction !== purpose;
  });
}

function renderImageDrafts() {
  const container = document.getElementById('adminImageDrafts');
  if (!container) return;
  const edits = readImageDraftEdits();
  const hiddenPaths = new Set([
    ...readImageDraftPaths('dismissedImageDrafts'),
    ...readImageDraftPaths('configuredImagePaths'),
    ...readImageDraftPaths('ignoredImagePaths')
  ]);
  effectiveAdminProducts().forEach((product) => {
    if (product.cutoutImage) hiddenPaths.add(product.cutoutImage);
    normalizeImageChoices(product.imageChoices).forEach((choice) => hiddenPaths.add(choice.image));
  });
  const drafts = imageDraftInventory.filter((draft) => draft?.path && !hiddenPaths.has(draft.path));

  if (!drafts.length) {
    container.innerHTML = '<p class="admin-note">No new unassociated images are waiting for setup.</p>';
    return;
  }

  container.innerHTML = drafts.map((inventoryDraft) => {
    const draft = { ...inventoryDraft, ...(edits[inventoryDraft.path] || {}) };
    const purpose = draft.purpose || 'new-product';
    return `
      <form class="admin-product-card admin-image-draft" data-image-path="${draft.path}">
        <div class="admin-product-heading">
          <h3>${draft.title || 'Unpublished image draft'}</h3>
          <div class="admin-card-actions">
            <button type="button" data-save-image-draft>Save Draft</button>
            <button type="button" data-draft-action="new-product" data-publish-image-draft>Add Product</button>
            <button type="button" data-draft-action="image-choice" data-add-image-choice>Add Image Choice</button>
            <button type="button" data-draft-action="not-product" data-ignore-image>Ignore Image</button>
          </div>
        </div>
        <div class="admin-product-layout">
          <div class="admin-card-preview"><img class="admin-preview-cutout admin-draft-preview" src="${draft.path}" alt="Unpublished image preview"></div>
          <div class="admin-control-groups">
            <label>Image path<input type="text" value="${draft.path}" readonly></label>
            <label>Image purpose
              <select name="imagePurpose">
                <option value="new-product" ${purpose === 'new-product' ? 'selected' : ''}>New product card</option>
                <option value="image-choice" ${purpose === 'image-choice' ? 'selected' : ''}>Image choice for an existing product</option>
                <option value="not-product" ${purpose === 'not-product' ? 'selected' : ''}>Not a product image</option>
              </select>
            </label>
            <div data-draft-purpose="new-product">
              <label>Title<input name="title" type="text" value="${draft.title || ''}"></label>
              <label>Slug<input name="slug" type="text" value="${draft.slug || ''}"></label>
              <label>Description<textarea name="description" rows="3">${draft.description || ''}</textarea></label>
              <label>Original height<input name="originalHeight" type="text" value="${draft.originalHeight || ''}" placeholder="6'6 or 78"></label>
              <label>Background
                <select name="backgroundImage">
                  <option value="images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg">Sci-fi stage</option>
                  <option value="images/FanBackgrounds/top-favorite-stage-gold.png">Gold stage</option>
                  <option value="images/FanBackgrounds/top-favorite-stage-premium.png">Premium stage</option>
                  <option value="images/FrontPageWeb/Herobackgroundparts-backgroundforimages.jpg">Clean stage</option>
                </select>
              </label>
              <fieldset><legend>Category assignments</legend><div class="admin-category-options">${imageDraftCategoryMarkup(draft.categories || [])}</div></fieldset>
            </div>
            <div data-draft-purpose="image-choice">
              ${parentProductPickerMarkup(draft.parentProductSlug || '')}
              <label>Image-choice label (optional)<input name="imageChoiceLabel" type="text" value="${draft.imageChoiceLabel || ''}" placeholder="Light, Dark, Print, Shade 1, Alternate pose"></label>
            </div>
            <div data-draft-purpose="not-product">
              <p class="admin-note">Ignore this repository asset as non-product inventory. The physical image file will not be changed.</p>
            </div>
          </div>
        </div>
      </form>
    `;
  }).join('');

  container.querySelectorAll('.admin-image-draft').forEach((form) => {
    const background = edits[form.dataset.imagePath]?.backgroundImage;
    if (background) form.querySelector('[name="backgroundImage"]').value = background;
    bindParentProductPicker(form);
    updateImageDraftPurpose(form);
    form.querySelector('[name="imagePurpose"]')?.addEventListener('change', () => updateImageDraftPurpose(form));
    form.querySelector('[data-save-image-draft]')?.addEventListener('click', () => saveImageDraftForm(form));
    form.querySelector('[data-publish-image-draft]')?.addEventListener('click', () => publishImageDraft(form));
    form.querySelector('[data-add-image-choice]')?.addEventListener('click', () => addDraftImageChoice(form));
    form.querySelector('[data-ignore-image]')?.addEventListener('click', () => ignoreImageDraft(form.dataset.imagePath));
  });
}

async function loadImageDraftInventory() {
  try {
    const response = await fetch('product-drafts.json', { cache: 'no-store' });
    imageDraftInventory = response.ok ? await response.json() : [];
  } catch (error) {
    imageDraftInventory = [];
  }
  renderImageDrafts();
  renderPublishSummary();
}

document.addEventListener('DOMContentLoaded', async () => {
  clearLegacyAdminBrowserStorage();
  await loadImageDraftInventory();
  const hasAdminAccess = await requireSupabaseAdminAccess();
  setupAdminTestMode();
  if (hasAdminAccess) await loadAdminTestMode();
  await loadAdminLiveSettings().catch(() => {});
  renderImageDrafts();
  await loadPublishedPublishBaseline();
  renderAdminProducts();
  setupPriceRules();
  renderExtraImages();
  renderPublishSummary();
  renderPublishHistory();
  if (window.location.hash.startsWith('#product-')) {
    document.querySelector(window.location.hash)?.scrollIntoView({ block: 'start' });
  }
  setupCoupons();
  if (hasAdminAccess) {
    refreshCommerceAdmin();
  }
  document.addEventListener('click', handleCommerceAdminClick);

  if (window.location.hash === '#create-card') {
    createCustomProduct();
    history.replaceState(null, '', 'admin.html');
  }

  document.getElementById('resetAdminProducts')?.addEventListener('click', () => {
    localStorage.removeItem('mvpluxAdminProducts');
    localStorage.removeItem('mvpluxAdminCustomProducts');
    localStorage.removeItem('mvpluxAdminArchivedProducts');
    updateAdminLiveSettings({ products: {}, customProducts: [], savedForLaterProducts: [] });
    saveAdminSettingsLive({ products: {}, customProducts: [], savedForLaterProducts: [] });
    renderAdminProducts();
    setStatus('Product card saves cleared live.');
  });

  document.getElementById('createAdminProduct')?.addEventListener('click', createCustomProduct);
  document.getElementById('refreshImageDrafts')?.addEventListener('click', loadImageDraftInventory);
  document.getElementById('refreshPublishSummary')?.addEventListener('click', renderPublishSummary);
  document.getElementById('adminPublishImagePaths')?.addEventListener('input', renderPublishSummary);
  document.getElementById('publishAdminChanges')?.addEventListener('click', publishAdminChanges);
  document.getElementById('refreshPublishHistory')?.addEventListener('click', refreshPublishHistory);

  document.getElementById('enableAdminAnywhere')?.addEventListener('click', () => {
    localStorage.setItem('mvpluxAdminAnywhere', 'true');
    setStatus('Page editing is on. Opening the website now.');
    window.location.href = 'index.html#shop';
  });

  document.getElementById('disableAdminAnywhere')?.addEventListener('click', () => {
    localStorage.removeItem('mvpluxAdminSignedIn');
    localStorage.setItem('mvpluxAdminAnywhere', 'false');
    setStatus('Page editing is off.');
  });

  document.getElementById('resetExtraImages')?.addEventListener('click', () => {
    localStorage.removeItem('mvpluxAdminExtraImages');
    updateAdminLiveSettings({ extraImages: {} });
    saveAdminSettingsLive({ extraImages: {} });
    renderExtraImages();
    setStatus('Extra image saves cleared live.');
  });

  document.getElementById('refreshCommerceAdmin')?.addEventListener('click', refreshCommerceAdmin);

  document.getElementById('exportAdminChanges')?.addEventListener('click', downloadAdminChanges);
  document.getElementById('copyAdminChanges')?.addEventListener('click', copyAdminChanges);
  document.getElementById('importAdminChanges')?.addEventListener('click', () => {
    document.getElementById('importAdminChangesFile')?.click();
  });
  document.getElementById('importAdminChangesFile')?.addEventListener('change', (event) => {
    importAdminChangesFromFile(event.target.files?.[0]);
    event.target.value = '';
  });
  renderAdminExportPreview();
});
