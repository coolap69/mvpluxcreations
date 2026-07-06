const adminProducts = [
  {
    slug: 'sport-legend-standee',
    title: 'Sport Legend Standees',
    description: 'Shop sports-inspired standee styles, then choose different players, sizes, and background options inside the category.',
    originalHeight: 78,
    originalPrice: 129.99,
    cutoutImage: 'images/FrontPageWeb/Sports-Kobe-KB1forprint.png',
    backgroundImage: 'images/FanBackgrounds/top-favorite-stage-gold.png'
  },
  {
    slug: 'movie-character-standee',
    title: 'Movie Character Standees',
    description: 'Browse movie-style standee categories and see more character looks, poses, and display backgrounds inside.',
    originalHeight: 74,
    originalPrice: '',
    cutoutImage: 'images/MovieCharacterStandees/Endorskeleton/Endornobackground.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'people-public-figure-standee',
    title: 'People & Public Figure Standees',
    description: 'Plan actor, creator, historical figure, public speaker, or lookalike-style display ideas.',
    originalHeight: 78,
    originalPrice: 129.99,
    cutoutImage: 'images/FrontPageWeb/Music-TS-TSfinal.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'music-artist-standee',
    title: 'Music Artist Standees',
    description: 'Explore concert-style standee categories with different performers, stage looks, and custom display choices.',
    originalHeight: 69,
    originalPrice: '',
    cutoutImage: 'images/FrontPageWeb/Music-MJackson-MJTR.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'faith-celebration-standee',
    title: 'Faith & Celebration Standees',
    description: 'View inspirational and celebration display categories for churches, holidays, events, rooms, and plays.',
    originalHeight: 72,
    originalPrice: '',
    cutoutImage: 'images/FrontPageWeb/Religious-J13D.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'holiday-standee',
    title: 'Holiday Standees',
    description: 'Seasonal displays for Christmas, Halloween, Easter, Valentine events, parties, and storefronts.',
    originalHeight: 78,
    originalPrice: '',
    cutoutImage: 'images/FrontPageWeb/Herobackgroundparts-hero8T.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'fan-request-standee',
    title: 'Fan Request Standees',
    description: 'See fan-inspired ideas, mashups, and custom concepts that can become full-size display pieces.',
    originalHeight: 69,
    originalPrice: '',
    cutoutImage: 'images/FrontPageWeb/Music-MJackson-MJzombie.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'dinosaur-party-standee',
    title: 'Dinosaur & Creature Standees',
    description: 'Shop dinosaur and creature-style displays for birthdays, rooms, outdoor setups, and big party moments.',
    originalHeight: 96,
    originalPrice: '',
    cutoutImage: 'images/FrontPageWeb/Dinosaurs-JPRex.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'game-fantasy-standee',
    title: 'Game & Fantasy Standees',
    description: 'Browse game-room, fantasy, stream, and themed-event standee categories with custom scene options.',
    originalHeight: 72,
    originalPrice: '',
    cutoutImage: 'images/FrontPageWeb/Herobackgroundparts-hero10E.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'custom-photo-standee',
    title: 'Custom Photo Standees',
    description: 'Turn your own photo, family member, athlete, or guest of honor into a custom standee display.',
    originalHeight: 66,
    originalPrice: '',
    cutoutImage: 'images/FrontPageWeb/Herobackgroundparts-hero7T.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  },
  {
    slug: 'small-standee-party-pack',
    title: 'Party Pack Standees',
    description: 'Shop smaller standee packs for tables, birthdays, rooms, gifts, and party displays.',
    originalHeight: 36,
    originalPrice: 50,
    cutoutImage: 'images/FrontPageWeb/Herobackgroundparts-hero8T.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  }
];

function clearLegacyAdminBrowserStorage() {
  localStorage.removeItem('mvpluxAdminAnywhereLegacy');
}

let adminLiveSettings = null;

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
    .select('edits')
    .eq('page_key', 'admin-global')
    .maybeSingle();

  if (error) return null;
  adminLiveSettings = data?.edits || {};
  return adminLiveSettings;
}

async function saveAdminSettingsLive(patch) {
  const client = getAdminClient();
  if (!client?.from || !client?.auth) {
    setStatus('Saved backup in this browser. Supabase is not ready for live save.');
    return false;
  }

  const { data: sessionData } = await client.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) {
    setStatus('Saved backup in this browser. Sign in as admin to save live.');
    return false;
  }

  const nextSettings = updateAdminLiveSettings(patch);
  const { error } = await client
    .from('site_edits')
    .upsert({
      page_key: 'admin-global',
      edits: nextSettings,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    }, { onConflict: 'page_key' });

  if (error) {
    setStatus('Saved backup in this browser. Run the live admin SQL if live save fails.');
    return false;
  }

  return true;
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

function readAdminProducts() {
  return getAdminLiveValue('products', readJsonStorage('mvpluxAdminProducts', {}));
}

function writeAdminProducts(products) {
  localStorage.setItem('mvpluxAdminProducts', JSON.stringify(products || {}));
  updateAdminLiveSettings({ products: products || {} });
  saveAdminSettingsLive({ products: products || {} });
  return products;
}

function readCustomProducts() {
  return getAdminLiveValue('customProducts', readJsonStorage('mvpluxAdminCustomProducts', []));
}

function writeCustomProducts(products) {
  localStorage.setItem('mvpluxAdminCustomProducts', JSON.stringify(products || []));
  updateAdminLiveSettings({ customProducts: products || [] });
  saveAdminSettingsLive({ customProducts: products || [] });
  return products;
}

function readArchivedProducts() {
  return getAdminLiveValue('savedForLaterProducts', readJsonStorage('mvpluxAdminArchivedProducts', []));
}

function writeArchivedProducts(slugs) {
  localStorage.setItem('mvpluxAdminArchivedProducts', JSON.stringify(slugs || []));
  updateAdminLiveSettings({ savedForLaterProducts: slugs || [] });
  saveAdminSettingsLive({ savedForLaterProducts: slugs || [] });
  return slugs;
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
    note: 'These edits are saved live when Supabase is available. Browser storage is only a backup.',
    products: readAdminProducts(),
    customProducts: readCustomProducts(),
    savedForLaterProducts: readArchivedProducts(),
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

function applyAdminExport(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid export');

  writeAdminProducts(data.products || {});
  writeCustomProducts(data.customProducts || []);
  writeArchivedProducts(data.savedForLaterProducts || []);
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
  return `
    <article class="admin-commerce-card ${sentToProduction ? 'is-production-sent' : 'needs-production'}">
      <div class="admin-commerce-card-head">
        <strong>${order.customer_name || 'Customer'}</strong>
        <span>${order.status || 'new'}</span>
      </div>
      <p>${adminListItems(order.items)}</p>
      <p><strong>Total:</strong> ${adminMoney(order.total)} · <strong>Pay:</strong> ${order.payment_method || 'Not chosen'}</p>
      <p><strong>Email:</strong> ${order.customer_email || 'Not provided'} · <strong>Phone:</strong> ${order.customer_phone || 'Not provided'}</p>
      <p><strong>Ship:</strong> ${adminAddressText(order.shipping_address)}</p>
      ${order.notes ? `<p><strong>Notes:</strong> ${order.notes}</p>` : ''}
      <small>${adminDate(order.created_at)}</small>
      <button class="admin-production-toggle ${sentToProduction ? 'is-sent' : ''}" type="button" data-toggle-production="${sentToProduction ? 'new' : 'sent_to_production'}" data-id="${order.id}">
        ${sentToProduction ? 'Production Sent' : 'Needs Production'}
      </button>
      <button class="admin-commerce-delete" type="button" data-delete-commerce="order" data-id="${order.id}">Delete Test Order</button>
    </article>
  `;
}

function offerCardMarkup(offer) {
  return `
    <article class="admin-commerce-card">
      <div class="admin-commerce-card-head">
        <strong>${offer.customer_name || 'Customer'}</strong>
        <span>${offer.status || 'pending'}</span>
      </div>
      <p>${offer.product_name || 'Selected item'}</p>
      <p><strong>Offer:</strong> ${adminMoney(offer.amount)}</p>
      <p><strong>Email:</strong> ${offer.customer_email || 'Not provided'}</p>
      ${offer.message ? `<p><strong>Details:</strong> ${String(offer.message).replace(/\n/g, ' | ')}</p>` : ''}
      <small>${adminDate(offer.created_at)}</small>
      <button class="admin-commerce-delete" type="button" data-delete-commerce="offer" data-id="${offer.id}">Delete Test Offer</button>
    </article>
  `;
}

async function deleteCommerceRecord(button) {
  const client = window.getMvpluxSupabaseClient?.();
  const type = button?.dataset?.deleteCommerce;
  const id = button?.dataset?.id;
  const table = type === 'order' ? 'order_requests' : type === 'offer' ? 'offers' : '';

  if (!client || !table || !id) return;

  const label = type === 'order' ? 'test order' : 'test offer';
  if (button.dataset.confirmDelete !== 'true') {
    button.dataset.confirmDelete = 'true';
    button.textContent = 'Click Again To Delete';
    setCommerceStatus(`Ready to delete this ${label}. Click the same delete button one more time to confirm.`);
    setTimeout(() => {
      if (button.dataset.confirmDelete === 'true') {
        button.dataset.confirmDelete = 'false';
        button.textContent = type === 'order' ? 'Delete Test Order' : 'Delete Test Offer';
      }
    }, 6000);
    return;
  }

  button.disabled = true;
  button.textContent = 'Deleting...';

  const { error } = await client.from(table).delete().eq('id', id);
  if (error) {
    button.disabled = false;
    button.textContent = type === 'order' ? 'Delete Test Order' : 'Delete Test Offer';
    setCommerceStatus('Could not delete yet. Run the admin delete SQL in Supabase, then try again.');
    return;
  }

  setCommerceStatus(`Deleted ${label}.`);
  refreshCommerceAdmin();
}

function handleCommerceAdminClick(event) {
  const productionButton = event.target.closest?.('[data-toggle-production]');
  if (productionButton) {
    toggleOrderProductionStatus(productionButton);
    return;
  }

  const button = event.target.closest?.('[data-delete-commerce]');
  if (!button) return;
  deleteCommerceRecord(button);
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

  ordersList.innerHTML = ordersResponse.data?.length
    ? ordersResponse.data.map(orderCardMarkup).join('')
    : commerceEmptyMarkup('No orders yet.');

  offersList.innerHTML = offersResponse.data?.length
    ? offersResponse.data.map(offerCardMarkup).join('')
    : commerceEmptyMarkup('No offers yet.');

  setCommerceStatus(`Loaded ${ordersResponse.data?.length || 0} orders and ${offersResponse.data?.length || 0} offers.`);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseAdminHeight(value) {
  if (!value) return null;
  const raw = String(value).trim().toLowerCase();
  const feetMatch = raw.match(/^(\d+)\s*'\s*(\d+)?$/);
  if (feetMatch) {
    return (parseInt(feetMatch[1], 10) * 12) + parseInt(feetMatch[2] || '0', 10);
  }
  if (/^\d+$/.test(raw)) {
    const number = parseInt(raw, 10);
    if (number >= 2 && number <= 8) return number * 12;
    if (number >= 24) return number;
  }
  return null;
}

function allAdminProducts() {
  return [...adminProducts, ...readCustomProducts()];
}

function makeSlug(title) {
  return (title || 'custom-card').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom-card';
}

function createCustomProduct() {
  const title = document.getElementById('newProductTitle')?.value.trim() || 'Custom Standee';
  const products = readCustomProducts();
  const slug = makeSlug(title);
  if (products.some((product) => product.slug === slug) || adminProducts.some((product) => product.slug === slug)) {
    setStatus('A card with that name already exists.');
    return;
  }

  products.push({
    slug,
    custom: true,
    title,
    description: 'New custom standee card.',
    originalHeight: 72,
    originalPrice: 129.99,
    cutoutImage: 'images/FrontPageWeb/Sports-Kobe-KB1forprint.png',
    backgroundImage: 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'
  });
  writeCustomProducts(products);
  renderAdminProducts();
  setStatus('Card created and saved live.');
}

function archiveProduct(slug) {
  const archived = new Set(readArchivedProducts());
  archived.add(slug);
  writeArchivedProducts([...archived]);
  renderAdminProducts();
  setStatus('Card saved for later live.');
}

function restoreProduct(slug) {
  writeArchivedProducts(readArchivedProducts().filter((item) => item !== slug));
  renderAdminProducts();
  setStatus('Card restored.');
}

function deleteCustomProduct(slug) {
  if (!window.confirm('Delete this custom card?')) return;
  writeCustomProducts(readCustomProducts().filter((product) => product.slug !== slug));
  const products = readAdminProducts();
  delete products[slug];
  writeAdminProducts(products);
  renderAdminProducts();
  setStatus('Custom card deleted and saved live.');
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
  const current = allAdminProducts().find((product) => product.slug === form.dataset.slug);
  return {
    custom: Boolean(current?.custom),
    title: formData.get('title').trim(),
    description: formData.get('description').trim(),
    cutoutImage: formData.get('cutoutImage').trim(),
    backgroundImage: formData.get('backgroundImage').trim(),
    originalHeight: formData.get('originalHeight').trim(),
    originalPrice: formData.get('originalPrice').trim(),
    cutoutHeight: formData.get('cutoutHeight').trim(),
    cutoutLeft: formData.get('cutoutLeft').trim(),
    cutoutBottom: formData.get('cutoutBottom').trim(),
    logoWidth: formData.get('logoWidth').trim(),
    logoTop: formData.get('logoTop').trim(),
    stageBackgroundPosition: formData.get('stageBackgroundPosition').trim()
  };
}

function saveProductForm(form, message = 'Saved product changes live. Go back to Shop to see them.') {
  const products = readAdminProducts();
  products[form.dataset.slug] = collectProductFormData(form);
  writeAdminProducts(products);
  renderAdminExportPreview();
  setStatus(message);
  return false;
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
    saveProductForm(form, 'Image changed and saved live.');
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

function renderAdminProducts() {
  const container = document.getElementById('adminProducts');
  const saved = readAdminProducts();
  const archived = new Set(readArchivedProducts());
  if (!container) return;

  renderSavedProducts();

  container.innerHTML = allAdminProducts().filter((product) => !archived.has(product.slug)).map((product) => {
    const value = { ...product, ...(saved[product.slug] || {}) };
    return `
      <form class="admin-product-card" data-slug="${product.slug}">
        <div class="admin-product-heading">
          <h3>${product.title}</h3>
          <div class="admin-card-actions">
            <button type="submit">Save Product</button>
            <button type="button" data-archive-product="${product.slug}">Save for Later</button>
            ${product.custom ? `<button type="button" data-delete-product="${product.slug}">Delete</button>` : ''}
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
              <label>
                Card description
                <textarea name="description" rows="3">${value.description || ''}</textarea>
              </label>
            </fieldset>
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
            <fieldset>
              <legend>Size & Price</legend>
              <div class="admin-form-row">
                <label>
                  Original height
                  <input name="originalHeight" type="text" value="${value.originalHeight || ''}" placeholder="6'6, 78, 2, or 24">
                </label>
                <label>
                  Original price
                  <input name="originalPrice" type="number" min="0" step="0.01" value="${value.originalPrice || ''}" placeholder="Auto">
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

  container.querySelectorAll('.admin-product-card').forEach((form) => {
    form.querySelectorAll('input, textarea').forEach((field) => {
      field.addEventListener('input', () => {
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
      deleteCustomProduct(event.target.dataset.deleteProduct);
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      saveProductForm(form);
    });
  });
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
    setStatus('Prices saved live.');
  });
}

function setupCoupons() {
  const form = document.getElementById('couponForm');
  const codeInput = document.getElementById('couponCode');
  const discountInput = document.getElementById('couponDiscount');
  const saved = readCoupons()[0];

  if (saved) {
    codeInput.value = saved.code || '';
    discountInput.value = saved.discount || '';
  }

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const coupon = {
      code: codeInput?.value.trim() || '',
      discount: discountInput?.value.trim() || ''
    };
    writeCoupons(coupon.code && coupon.discount ? [coupon] : []);
    setStatus('Coupon saved live.');
  });

  document.getElementById('clearCoupons')?.addEventListener('click', () => {
    codeInput.value = '';
    discountInput.value = '';
    writeCoupons([]);
    setStatus('Coupon cleared live.');
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  clearLegacyAdminBrowserStorage();
  const hasAdminAccess = await requireSupabaseAdminAccess();
  await loadAdminLiveSettings().catch(() => {});
  renderAdminProducts();
  setupPriceRules();
  renderExtraImages();
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
