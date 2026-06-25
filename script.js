let cart = [];
let cartTotal = 0;
let infoSlideIndex = 0;

/* ---------------- CART ---------------- */
function addToCart(name, price) {
  cart.push({ name, price });
  cartTotal += price;
  updateCart();
}

function updateCart() {
  const cartCount = document.getElementById('cartCount');
  const cartTotalEl = document.getElementById('cartTotal');
  const cartItems = document.getElementById('cartItems');

  if (!cartCount || !cartTotalEl || !cartItems) return;

  cartCount.textContent = cart.length;
  cartTotalEl.textContent = cartTotal.toFixed(2);
  cartItems.innerHTML = '';

  cart.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'cart-item';
    div.innerHTML = `<strong>${item.name}</strong><br>$${item.price.toFixed(2)}`;
    cartItems.appendChild(div);
  });
}

function toggleCart() {
  const cartPanel = document.getElementById('cartPanel');
  if (cartPanel) cartPanel.classList.toggle('open');
}

/* ---------------- BUY / OFFER MODALS ---------------- */
function openBuyNow(title, price, image) {
  const modalTitle = document.getElementById('modalTitle');
  const modalPrice = document.getElementById('modalPrice');
  const modalImage = document.getElementById('modalImage');
  const buyModal = document.getElementById('buyModal');

  if (modalTitle) modalTitle.textContent = title;
  if (modalPrice) modalPrice.textContent = '$' + price.toFixed(2);
  if (modalImage) modalImage.src = image;
  if (buyModal) buyModal.style.display = 'flex';
}

function openOffer(productName) {
  const offerProduct = document.getElementById('offerProduct');
  const offerModal = document.getElementById('offerModal');

  if (offerProduct) offerProduct.textContent = productName;
  if (offerModal) offerModal.style.display = 'flex';
}

function closeModals() {
  const buyModal = document.getElementById('buyModal');
  const offerModal = document.getElementById('offerModal');

  if (buyModal) buyModal.style.display = 'none';
  if (offerModal) offerModal.style.display = 'none';
}

/* ---------------- PLACEHOLDER ACTIONS ---------------- */
function openCheckout() {
  alert('Checkout payment links will be added here.');
}

function openCustomForm() {
  alert('Custom order form will be added here.');
}

function openFanRequest() {
  alert('Fan request form will be added here.');
}

function scrollFanVotes(direction) {
  const track = document.getElementById('fanVoteTrack');
  if (!track) return;

  const card = track.querySelector('.fan-vote-card');
  const cardWidth = card ? card.offsetWidth + 22 : track.clientWidth;
  track.scrollBy({
    left: direction * cardWidth,
    behavior: 'smooth'
  });
}

function getFanVoteStore() {
  try {
    return JSON.parse(localStorage.getItem('mvpluxFanVotes') || '{}');
  } catch (error) {
    return {};
  }
}

function getCurrentBasePrice() {
  const settings = getAdminPriceSettings();
  return Number(settings.fullPrice) || 129.99;
}

function saveFanVoteStore(votes) {
  localStorage.setItem('mvpluxFanVotes', JSON.stringify(votes));
}

function setFanVoteButtonState(button, voted) {
  if (!button) return;

  button.classList.toggle('voted', voted);
  button.disabled = voted;

  if (voted && !button.dataset.originalText) {
    button.dataset.originalText = button.textContent.trim();
  }

  if (voted) {
    button.textContent = button.dataset.voteLabel === 'best' ? 'Voted Best Design' : 'Voted';
  }
}

function incrementVoteCount(voteId) {
  document.querySelectorAll(`[data-vote-id="${voteId}"] .fan-vote-count`).forEach((countEl) => {
    const current = parseInt(countEl.textContent, 10);
    if (!Number.isNaN(current)) {
      countEl.textContent = current + 1;
    }
  });

  document.querySelectorAll(`[data-vote-id="${voteId}"]`).forEach((button) => {
    const card = button.closest('.fan-vote-card, .fan-list-item');
    const meter = card?.querySelector('.fan-vote-meter');
    const strong = meter?.querySelector('strong');
    const label = meter?.querySelector('span');
    if (!strong || !label) return;

    const current = parseInt(strong.textContent, 10);
    if (Number.isNaN(current)) return;
    const next = Math.min(100, current + 1);
    strong.textContent = `${next}%`;
    label.textContent = `${next} / 100 votes`;
  });
}

function registerFanVote(voteId, button) {
  const votes = getFanVoteStore();

  if (votes[voteId]) {
    setFanVoteButtonState(button, true);
    alert('You already voted for this one.');
    return;
  }

  votes[voteId] = true;
  saveFanVoteStore(votes);
  incrementVoteCount(voteId);

  document.querySelectorAll(`[data-vote-id="${voteId}"]`).forEach((matchingButton) => {
    setFanVoteButtonState(matchingButton, true);
  });

  alert('Vote counted. Thanks for helping choose what comes next.');
}

/* ---------------- PRODUCT FILTER ---------------- */
function filterProducts() {
  const searchInput = document.getElementById('searchInput');
  const categoryFilter = document.getElementById('categoryFilter');
  const products = document.querySelectorAll('.product-card');

  if (!searchInput || !categoryFilter) return;

  const search = searchInput.value.toLowerCase();
  const category = categoryFilter.value;

  products.forEach(product => {
    const name = (product.dataset.name || '').toLowerCase();
    const productCategory = product.dataset.category || '';

    const matchesSearch = name.includes(search);
    const matchesCategory = category === 'all' || productCategory === category;

    product.style.display = matchesSearch && matchesCategory ? 'block' : 'none';
  });
}

/* ---------------- BACKGROUND MODAL ---------------- */
function openBgModal(productName) {
  const bgModal = document.getElementById('bgModal');
  const bgModalTitle = document.getElementById('bgModalTitle');

  if (bgModal) bgModal.classList.add('show');
  if (bgModalTitle) bgModalTitle.textContent = 'Background Options';
}

function closeBgModal() {
  const bgModal = document.getElementById('bgModal');
  if (bgModal) bgModal.classList.remove('show');
}

/* ---------------- INFO CAROUSEL ---------------- */
function showInfoSlide(index) {
  const slides = document.querySelectorAll('.info-slide');
  const dots = document.querySelectorAll('.info-dot');

  if (!slides.length) return;

  if (index >= slides.length) {
    infoSlideIndex = 0;
  } else if (index < 0) {
    infoSlideIndex = slides.length - 1;
  } else {
    infoSlideIndex = index;
  }

  slides.forEach(slide => slide.classList.remove('active'));
  dots.forEach(dot => dot.classList.remove('active'));

  slides[infoSlideIndex].classList.add('active');
  if (dots[infoSlideIndex]) dots[infoSlideIndex].classList.add('active');
}

function changeInfoSlide(direction) {
  showInfoSlide(infoSlideIndex + direction);
}

function goInfoSlide(index) {
  showInfoSlide(index);
}

function openInfoPreview(button) {
  const card = button.closest('.info-panel-card');
  const image = card ? card.querySelector('img') : null;
  const modal = document.getElementById('infoPreviewModal');
  const preview = document.getElementById('infoPreviewImage');

  if (!image || !modal || !preview) return;

  preview.src = image.src;
  preview.alt = image.alt || 'MVPLUX information preview';
  modal.classList.add('show');
}

function openInfoPreviewFromKey(event, card) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openInfoPreview(card);
  }
}

function closeInfoPreview(event) {
  const modal = document.getElementById('infoPreviewModal');
  if (!modal) return;

  if (!event || event.target === modal || event.target.classList.contains('info-preview-close')) {
    modal.classList.remove('show');
  }
}

function togglePasswordVisibility(button) {
  const field = button.closest('.password-field');
  const input = field ? field.querySelector('input') : null;
  if (!input) return;

  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  button.textContent = showing ? 'Show' : 'Hide';
  button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
}

function isAdminSignedIn() {
  return localStorage.getItem('mvpluxAdminSignedIn') === 'true';
}

function signOutAdmin() {
  localStorage.removeItem('mvpluxAdminSignedIn');
  localStorage.removeItem('mvpluxAdminAnywhere');
  localStorage.removeItem('mvpluxSignedInName');
  localStorage.removeItem('mvpluxCustomerSignedIn');
  window.location.href = 'index.html';
}

function getSignedInName() {
  return localStorage.getItem('mvpluxSignedInName') || (isAdminSignedIn() ? 'Admin' : '');
}

function setupAuthState() {
  const signinForm = document.getElementById('signinForm');
  const signupForm = document.getElementById('signupForm');
  const adminQuickSignIn = document.getElementById('adminQuickSignIn');
  const signedInNotice = document.getElementById('signedInNotice');

  if (signedInNotice && isAdminSignedIn()) {
    signedInNotice.innerHTML = `You are signed in as <strong>${getSignedInName()}</strong>. <button type="button" class="admin-inline-signout" data-admin-signout>Log Out</button>`;
  }

  adminQuickSignIn?.addEventListener('click', () => {
    localStorage.setItem('mvpluxAdminSignedIn', 'true');
    localStorage.setItem('mvpluxAdminAnywhere', 'true');
    localStorage.setItem('mvpluxSignedInName', 'Admin');
    window.location.href = 'index.html';
  });

  signinForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = document.getElementById('signinEmail')?.value.trim().toLowerCase() || '';
    const password = document.getElementById('signinPassword')?.value.trim() || '';
    const adminLogin = email === 'admin@mvpluxcreations.com' || password.toLowerCase() === 'admin';

    if (adminLogin) {
      localStorage.setItem('mvpluxAdminSignedIn', 'true');
      localStorage.setItem('mvpluxAdminAnywhere', 'true');
      localStorage.setItem('mvpluxSignedInName', 'Admin');
      window.location.href = 'index.html';
      return;
    }

    localStorage.setItem('mvpluxCustomerSignedIn', 'true');
    localStorage.setItem('mvpluxSignedInName', email.split('@')[0] || 'Guest');
    window.location.href = 'index.html';
  });

  signupForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const screenName = document.getElementById('signupScreenName')?.value.trim() || 'Guest';
    localStorage.setItem('mvpluxCustomerSignedIn', 'true');
    localStorage.setItem('mvpluxSignedInName', screenName);
    window.location.href = 'index.html';
  });

  const signedInName = getSignedInName();
  const isSignedIn = Boolean(signedInName || localStorage.getItem('mvpluxCustomerSignedIn') === 'true');

  if (isSignedIn) {
    document.querySelectorAll('.sign-in-link').forEach((link) => {
      link.textContent = signedInName || 'Signed In';
      link.href = isAdminSignedIn() ? 'admin.html' : 'signin.html';
    });

    document.querySelectorAll('.sign-up-link').forEach((link) => {
      link.style.display = 'none';
    });
  }

  if (!isAdminSignedIn()) return;

  document.querySelectorAll('.sign-in-link').forEach((link) => {
    link.textContent = getSignedInName();
    link.href = 'admin.html';
  });

  document.querySelectorAll('.sign-up-link').forEach((link) => {
    link.style.display = 'none';
  });

  document.querySelectorAll('.auth-links').forEach((links) => {
    if (links.querySelector('[data-admin-signout]')) return;
    links.insertAdjacentHTML('beforeend', `<span class="signed-in-name">${getSignedInName()}</span><button type="button" class="admin-inline-signout" data-admin-signout>Log Out</button>`);
  });

  document.querySelectorAll('[data-admin-signout]').forEach((button) => {
    button.addEventListener('click', signOutAdmin);
  });
}

/* ---------------- PREMIUM SIZE BUILDER ---------------- */
function parseHeightToInches(value) {
  if (!value) return null;

  const raw = value.trim().toLowerCase();

  const feetInchesMatch = raw.match(/^(\d+)\s*'\s*(\d+)?$/);
  if (feetInchesMatch) {
    const feet = parseInt(feetInchesMatch[1], 10);
    const inches = parseInt(feetInchesMatch[2] || '0', 10);
    return feet * 12 + inches;
  }

  if (/^\d+$/.test(raw)) {
    const number = parseInt(raw, 10);

    if (number >= 2 && number <= 8) {
      return number * 12;
    }

    if (number >= 24) {
      return number;
    }

    return null;
  }

  return null;
}

function getAdminPriceSettings() {
  try {
    return JSON.parse(localStorage.getItem('mvpluxAdminPriceSettings') || '{}');
  } catch (error) {
    return {};
  }
}

function getPriceSettingsForBuilder(builder = null) {
  const settings = getAdminPriceSettings();
  const builderHeight = parseInt(builder?.dataset.originalHeight || '', 10);
  const overridePrice = parseFloat(builder?.dataset.originalPriceOverride || '');

  return {
    twoFootPrice: parseFloat(settings.twoFootPrice || '') || 35.00,
    threeFootPrice: parseFloat(settings.threeFootPrice || '') || 50.00,
    fullHeight: builderHeight || parseInt(settings.fullHeight || '78', 10) || 78,
    fullPrice: overridePrice || parseFloat(settings.fullPrice || '') || parseFloat(builder?.dataset.originalPrice || '') || 129.99,
    extraInchPrice: parseFloat(settings.extraInchPrice || '') || 2.00
  };
}

function calculateCutoutPrice(inches, builder = null) {
  if (!inches) return null;

  if (inches < 24) return null;

  const settings = getPriceSettingsForBuilder(builder);

  if (inches <= 36) {
    return settings.twoFootPrice + ((inches - 24) * ((settings.threeFootPrice - settings.twoFootPrice) / 12));
  }

  if (inches > 36 && inches <= settings.fullHeight) {
    const span = Math.max(1, settings.fullHeight - 36);
    return settings.threeFootPrice + ((inches - 36) * ((settings.fullPrice - settings.threeFootPrice) / span));
  }

  return settings.fullPrice + ((inches - settings.fullHeight) * settings.extraInchPrice);
}

function formatHeight(inches) {
  const feet = Math.floor(inches / 12);
  const remainder = inches % 12;
  return remainder ? `${feet}'${remainder}"` : `${feet}'`;
}

function formatMoney(price) {
  return '$' + price.toFixed(2);
}

function getProductAdminKey(builder) {
  return 'mvpluxOriginalHeight:' + (builder.dataset.productName || 'product').replace(/\W+/g, '-').toLowerCase();
}

function getProductSlug(productName) {
  return (productName || 'product').replace(/\W+/g, '-').toLowerCase();
}

function getAdminProducts() {
  try {
    return JSON.parse(localStorage.getItem('mvpluxAdminProducts') || '{}');
  } catch (error) {
    return {};
  }
}

function getAdminCoupons() {
  try {
    return JSON.parse(localStorage.getItem('mvpluxAdminCoupons') || '[]');
  } catch (error) {
    return [];
  }
}

function getAdminCustomProducts() {
  try {
    return JSON.parse(localStorage.getItem('mvpluxAdminCustomProducts') || '[]');
  } catch (error) {
    return [];
  }
}

function getAdminArchivedProducts() {
  try {
    return JSON.parse(localStorage.getItem('mvpluxAdminArchivedProducts') || '[]');
  } catch (error) {
    return [];
  }
}

function getAdminExtraImages() {
  try {
    return JSON.parse(localStorage.getItem('mvpluxAdminExtraImages') || '{}');
  } catch (error) {
    return {};
  }
}

function applyAdminExtraImages() {
  const images = getAdminExtraImages();
  document.querySelectorAll('[data-admin-image]').forEach((image) => {
    const value = images[image.dataset.adminImage];
    if (value) image.src = value;
  });
}

function productCardMarkup(product) {
  const slug = product.slug || getProductSlug(product.title);
  const radioName = `${slug.replace(/-/g, '')}SizeMode`;
  const originalHeight = product.originalHeight || 78;
  const originalPrice = product.originalPrice || calculateCutoutPrice(parseHeightToInches(String(originalHeight)) || originalHeight);

  return `
    <div class="product-card" data-category="custom" data-name="${product.title || 'Custom card'}">
      <a href="${product.href || '#shop'}" class="product-image-link">
        <div class="product-stage-preview" style="background-image: url('${product.backgroundImage || 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'}');">
          <img class="product-stage-bg" src="${product.backgroundImage || 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg'}" alt="">
          <img class="product-stage-logo" src="images/FrontPageWeb/Herobackgroundparts-logowords.png" alt="">
          <img class="product-cutout" src="${product.cutoutImage || 'images/FrontPageWeb/Sports-Kobe-KB1forprint.png'}" alt="">
        </div>
      </a>
      <h3><a href="${product.href || '#shop'}" class="product-title-link">${product.title || 'Custom Standee'}</a></h3>
      <p class="product-description">${product.description || 'Custom product card.'}</p>
      <div class="size-builder" data-product-name="${product.title || 'Custom Standee'}" data-admin-slug="${slug}" data-original-price="${originalPrice}" data-original-height="${originalHeight}">
        <div class="size-option active">
          <label>
            <input type="radio" name="${radioName}" value="original" checked>
            <span>Original Size - ${formatHeight(parseHeightToInches(String(originalHeight)) || originalHeight)} - ${formatMoney(Number(originalPrice))}</span>
          </label>
        </div>
        <div class="size-option">
          <label>
            <input type="radio" name="${radioName}" value="custom">
            <span>Custom Size</span>
          </label>
          <div class="custom-size-box">
            <input class="custom-height-input" type="text" placeholder="Type height: 5'8 or 68">
          </div>
        </div>
        <p class="live-price-line">Price: <span class="live-size-price">${formatMoney(Number(originalPrice))}</span></p>
      </div>
      <div class="button-row">
        <button onclick="addSelectedToCart(this)">Add to Cart</button>
        <button onclick="buySelectedNow(this)">Buy Now</button>
        <button class="offer-btn" onclick="openOffer('${product.title || 'Custom Standee'}')">Make Offer</button>
      </div>
    </div>
  `;
}

function renderAdminManagedCards() {
  const grid = document.querySelector('#shop .product-grid');
  if (!grid) return;

  const archived = new Set(getAdminArchivedProducts());
  document.querySelectorAll('#shop .size-builder').forEach((builder) => {
    const card = builder.closest('.product-card');
    const slug = builder.dataset.adminSlug || getProductSlug(builder.dataset.productName || '');
    if (archived.has(slug)) {
      card.style.display = 'none';
    }
  });

  getAdminCustomProducts().filter((product) => !archived.has(product.slug)).forEach((product) => {
    if (grid.querySelector(`[data-admin-slug="${product.slug}"]`)) return;
    grid.insertAdjacentHTML('beforeend', productCardMarkup(product));
  });
}

function applyAdminProductOverrides(builder) {
  const card = builder.closest('.product-card');
  const productName = builder.dataset.productName || card?.querySelector('.product-title-link')?.textContent || '';
  const override = getAdminProducts()[builder.dataset.adminSlug || getProductSlug(productName)];
  if (!override || !card) return;

  const titleLink = card.querySelector('.product-title-link');
  const description = card.querySelector('.product-description');
  const cutout = card.querySelector('.product-cutout');
  const stage = card.querySelector('.product-stage-preview');
  const logo = card.querySelector('.product-stage-logo');

  if (override.title && titleLink) titleLink.textContent = override.title;
  if (override.description && description) description.textContent = override.description;
  if (override.cutoutImage && cutout) cutout.src = override.cutoutImage;
  if (override.backgroundImage && stage) {
    stage.style.backgroundImage = `url("${override.backgroundImage}")`;
  }
  if (override.stageBackgroundPosition && stage) stage.style.backgroundPosition = override.stageBackgroundPosition;
  if (override.cutoutHeight && cutout) cutout.style.height = `${override.cutoutHeight}%`;
  if (override.cutoutLeft && cutout) cutout.style.left = `${override.cutoutLeft}%`;
  if (override.cutoutBottom && cutout) cutout.style.bottom = `${override.cutoutBottom}%`;
  if (override.logoWidth && logo) logo.style.width = `${override.logoWidth}%`;
  if (override.logoTop && logo) logo.style.top = `${override.logoTop}%`;
  if (override.originalHeight) {
    const overrideHeight = parseHeightToInches(String(override.originalHeight)) || parseInt(override.originalHeight, 10);
    if (overrideHeight) builder.dataset.originalHeight = String(overrideHeight);
  }
  if (override.originalPrice) builder.dataset.originalPriceOverride = String(override.originalPrice);
}

function updateBuilderOriginalDisplay(builder) {
  const originalHeight = parseInt(builder.dataset.originalHeight || '78', 10);
  const explicitPrice = parseFloat(builder.dataset.originalPriceOverride || '');
  const originalPrice = explicitPrice || calculateCutoutPrice(originalHeight, builder);
  const originalLabel = builder.querySelector('input[value="original"]')?.closest('label')?.querySelector('span');
  const customLabel = builder.querySelector('input[value="custom"]')?.closest('label')?.querySelector('span');
  const priceDisplay = builder.querySelector('.live-size-price');
  const originalRadio = builder.querySelector('input[value="original"]');
  const stage = builder.closest('.product-card')?.querySelector('.product-stage-preview');
  const originalChoice = stage?.querySelector('[data-stage-choice="original"]');

  builder.dataset.originalPrice = originalPrice.toFixed(2);

  if (originalLabel) {
    originalLabel.textContent = `Original Size - ${formatHeight(originalHeight)} - ${formatMoney(originalPrice)}`;
  }

  if (customLabel && !customLabel.dataset.customPrice) {
    customLabel.textContent = 'Custom Size';
  }

  if (priceDisplay && originalRadio?.checked) {
    priceDisplay.textContent = formatMoney(originalPrice);
  }

  if (originalChoice) {
    originalChoice.textContent = `Original ${formatHeight(originalHeight)}`;
  }
}

function setStageChoice(builder, choice) {
  const card = builder.closest('.product-card');
  const stage = card?.querySelector('.product-stage-preview');
  stage?.querySelectorAll('[data-stage-choice]').forEach((button) => {
    button.classList.toggle('active', button.dataset.stageChoice === choice);
  });
}

function selectSizeMode(builder, mode) {
  const radio = builder.querySelector(`input[value="${mode}"]`);
  const priceDisplay = builder.querySelector('.live-size-price');
  const customInput = builder.querySelector('.custom-height-input');

  if (!radio) return;

  radio.checked = true;
  builder.classList.toggle('custom-active', mode === 'custom');
  setStageChoice(builder, mode);

  if (mode === 'custom') {
    if (priceDisplay) priceDisplay.textContent = 'Enter a height';
    builder.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (customInput) customInput.focus();
    return;
  }

  updateBuilderOriginalDisplay(builder);
}

function updateCustomPrice(builder) {
  const customInput = builder.querySelector('.custom-height-input');
  const priceDisplay = builder.querySelector('.live-size-price');
  const customLabel = builder.querySelector('input[value="custom"]')?.closest('label')?.querySelector('span');
  const inches = parseHeightToInches(customInput?.value || '');
  const price = calculateCutoutPrice(inches, builder);

  if (!price) {
    if (priceDisplay) priceDisplay.textContent = 'Enter a valid height';
    if (customLabel) {
      customLabel.textContent = 'Custom Size';
      delete customLabel.dataset.customPrice;
    }
    return;
  }

  if (priceDisplay) priceDisplay.textContent = formatMoney(price);
  if (customLabel) {
    customLabel.textContent = `Custom Size - ${formatMoney(price)}`;
    customLabel.dataset.customPrice = 'true';
  }
}

function toggleAdminSizeEditor() {
  document.body.classList.toggle('show-size-admin');
}

function renderCouponBanner() {
  const coupons = getAdminCoupons().filter((coupon) => coupon.code && coupon.discount);
  const shop = document.getElementById('shop');
  if (!shop || !coupons.length || document.querySelector('.coupon-banner')) return;

  const coupon = coupons[0];
  shop.insertAdjacentHTML('afterbegin', `
    <div class="coupon-banner">
      Use code <strong>${coupon.code}</strong> for ${coupon.discount}% off eligible orders.
    </div>
  `);
}

function installSizeAdmin(builder) {
  if (builder.querySelector('.admin-size-tools')) return;

  builder.insertAdjacentHTML('beforeend', `
    <div class="admin-size-tools">
      <label>
        Admin original height
        <input class="admin-original-height-input" type="text" placeholder="Example: 6'6 or 78">
      </label>
      <button type="button" class="admin-save-size">Save height</button>
    </div>
  `);

  const input = builder.querySelector('.admin-original-height-input');
  const saveButton = builder.querySelector('.admin-save-size');
  if (input) input.value = formatHeight(parseInt(builder.dataset.originalHeight || '78', 10));

  saveButton?.addEventListener('click', () => {
    const inches = parseHeightToInches(input?.value || '');
    if (!inches) {
      alert("Enter a height like 6'6 or 78.");
      return;
    }

    builder.dataset.originalHeight = String(inches);
    localStorage.setItem(getProductAdminKey(builder), String(inches));
    updateBuilderOriginalDisplay(builder);
    setStageChoice(builder, 'original');
  });
}

/* ---------------- SITE-WIDE ADMIN MODE ---------------- */
let inlineAdminDraftEdits = null;
let inlineAdminSelectedImage = null;
let inlineAdminUndoStack = [];
let inlineAdminRedoStack = [];
let inlineAdminDirty = false;
let inlineAdminLastToolbarAction = { action: '', time: 0 };

function readInlineAdminEdits() {
  try {
    return JSON.parse(localStorage.getItem('mvpluxInlineAdminEdits') || '{}');
  } catch (error) {
    return {};
  }
}

function writeInlineAdminEdits(edits) {
  localStorage.setItem('mvpluxInlineAdminEdits', JSON.stringify(edits));
}

function getInlineAdminDraft() {
  if (!inlineAdminDraftEdits) inlineAdminDraftEdits = readInlineAdminEdits();
  return inlineAdminDraftEdits;
}

function inlineAdminPageKey() {
  const file = window.location.pathname.split('/').pop() || 'index.html';
  return file.toLowerCase();
}

function inlineAdminKey(element) {
  if (element.dataset.adminEdit) return element.dataset.adminEdit;

  const selector = element.tagName === 'IMG'
    ? 'img'
    : 'h1,h2,h3,h4,p,a,button,span,label,strong,li';
  const siblings = [...document.querySelectorAll(selector)];
  const index = siblings.indexOf(element);
  element.dataset.adminEdit = `${element.tagName.toLowerCase()}-${Math.max(0, index)}`;
  return element.dataset.adminEdit;
}

function applyInlineAdminEdits() {
  document.querySelectorAll('img,h1,h2,h3,h4,p,a,button,span,label,strong,li').forEach((element) => {
    if (!element.closest('.admin-anywhere-toolbar')) inlineAdminKey(element);
  });

  const pageEdits = getInlineAdminDraft()[inlineAdminPageKey()] || {};

  Object.entries(pageEdits).forEach(([key, edit]) => {
    const element = document.querySelector(`[data-admin-edit="${key}"]`);
    if (!element) return;

    if (edit.text && element.tagName !== 'IMG') element.textContent = edit.text;
    if (edit.src && element.tagName === 'IMG') element.src = edit.src;
    if (element.tagName === 'IMG') {
      element.style.setProperty('--admin-x', `${edit.x || 0}px`);
      element.style.setProperty('--admin-y', `${edit.y || 0}px`);
      element.style.setProperty('--admin-scale', edit.scale || 1);
      element.style.setProperty('--admin-rotate', `${edit.rotate || 0}deg`);
      element.classList.add('admin-transformable-image');
    }
  });
}

function saveInlineAdminEdit(element, patch) {
  const edits = getInlineAdminDraft();
  const page = inlineAdminPageKey();
  const key = inlineAdminKey(element);
  edits[page] = edits[page] || {};
  edits[page][key] = { ...(edits[page][key] || {}), ...patch };
  inlineAdminDirty = true;
  updateInlineAdminToolbarState();
}

function commitInlineAdminEdits() {
  writeInlineAdminEdits(getInlineAdminDraft());
  inlineAdminDirty = false;
  updateInlineAdminToolbarState('Saved');
}

function getInlineAdminSnapshot(element) {
  if (!element) return null;
  const key = inlineAdminKey(element);

  if (element.tagName === 'IMG') {
    const state = element._adminImageState || {};
    return {
      key,
      tag: 'IMG',
      src: element.getAttribute('src') || '',
      x: Number(state.x || 0),
      y: Number(state.y || 0),
      scale: Number(state.scale || 1),
      rotate: Number(state.rotate || 0)
    };
  }

  return {
    key,
    tag: element.tagName,
    text: element.textContent
  };
}

function applyInlineAdminSnapshot(snapshot) {
  if (!snapshot) return;
  const element = document.querySelector(`[data-admin-edit="${snapshot.key}"]`);
  if (!element) return;

  if (snapshot.tag === 'IMG') {
    element.src = snapshot.src;
    element._adminImageState = {
      x: Number(snapshot.x || 0),
      y: Number(snapshot.y || 0),
      scale: Number(snapshot.scale || 1),
      rotate: Number(snapshot.rotate || 0)
    };
    renderInlineAdminImageState(element);
    saveInlineAdminEdit(element, {
      src: snapshot.src,
      x: element._adminImageState.x,
      y: element._adminImageState.y,
      scale: element._adminImageState.scale,
      rotate: element._adminImageState.rotate
    });
    selectInlineAdminImage(element);
    return;
  }

  element.textContent = snapshot.text || '';
  saveInlineAdminEdit(element, { text: element.textContent.trim() });
}

function snapshotsMatch(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function pushInlineAdminHistory(before, after) {
  if (!before || !after || snapshotsMatch(before, after)) return;
  inlineAdminUndoStack.push({ before, after });
  inlineAdminRedoStack = [];
  updateInlineAdminToolbarState();
}

function undoInlineAdminEdit() {
  const entry = inlineAdminUndoStack.pop();
  if (!entry) return;
  applyInlineAdminSnapshot(entry.before);
  inlineAdminRedoStack.push(entry);
  updateInlineAdminToolbarState('Undone');
}

function redoInlineAdminEdit() {
  const entry = inlineAdminRedoStack.pop();
  if (!entry) return;
  applyInlineAdminSnapshot(entry.after);
  inlineAdminUndoStack.push(entry);
  updateInlineAdminToolbarState('Redone');
}

function updateInlineAdminToolbarState(message = '') {
  const status = document.getElementById('adminInlineStatus');
  const undo = document.getElementById('adminInlineUndo');
  const redo = document.getElementById('adminInlineRedo');
  const selected = document.getElementById('adminInlineSelected');
  const imageControls = document.querySelectorAll('[data-admin-image-control]');
  const activeImage = inlineAdminSelectedImage || document.querySelector('.admin-image-selected');

  if (status) status.textContent = message || (inlineAdminDirty ? 'Unsaved changes' : 'Saved');
  if (undo) undo.disabled = !inlineAdminUndoStack.length;
  if (redo) redo.disabled = !inlineAdminRedoStack.length;
  if (selected) selected.textContent = activeImage ? 'Image selected' : 'Select an image';
  imageControls.forEach((control) => {
    control.disabled = false;
  });
  updateInlineAdminResizeHandle();
}

function renderInlineAdminImageState(image) {
  const state = image._adminImageState || { x: 0, y: 0, scale: 1, rotate: 0 };
  image.style.setProperty('--admin-x', `${state.x}px`);
  image.style.setProperty('--admin-y', `${state.y}px`);
  image.style.setProperty('--admin-scale', state.scale);
  image.style.setProperty('--admin-rotate', `${state.rotate}deg`);
  if (image === inlineAdminSelectedImage) updateInlineAdminResizeHandle();
}

function selectInlineAdminImage(image) {
  if (inlineAdminSelectedImage && inlineAdminSelectedImage !== image) {
    inlineAdminSelectedImage.classList.remove('admin-image-selected');
  }

  inlineAdminSelectedImage = image;
  image?.classList.add('admin-image-selected');
  updateInlineAdminToolbarState();
  updateInlineAdminResizeHandle();
}

function getInlineAdminResizeHandle() {
  let handle = document.getElementById('adminImageResizeHandle');
  if (handle) return handle;

  handle = document.createElement('button');
  handle.id = 'adminImageResizeHandle';
  handle.type = 'button';
  handle.title = 'Drag to resize proportionally';
  handle.setAttribute('aria-label', 'Resize selected image proportionally');
  document.body.appendChild(handle);

  handle.addEventListener('pointerdown', (event) => {
    const image = getActiveInlineAdminImage();
    if (!image) return;

    event.preventDefault();
    event.stopPropagation();
    handle.setPointerCapture?.(event.pointerId);

    const before = getInlineAdminSnapshot(image);
    const rect = image.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startScale = Number(image._adminImageState?.scale || 1);
    const baseSize = Math.max(80, Math.max(rect.width, rect.height));

    const move = (moveEvent) => {
      const delta = Math.max(moveEvent.clientX - startX, moveEvent.clientY - startY);
      image._adminImageState.scale = clamp(startScale + (delta / baseSize), 0.25, 3);
      renderInlineAdminImageState(image);
      saveInlineAdminEdit(image, {
        src: image.getAttribute('src') || '',
        ...image._adminImageState
      });
    };

    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      pushInlineAdminHistory(before, getInlineAdminSnapshot(image));
      updateInlineAdminResizeHandle();
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  });

  return handle;
}

function updateInlineAdminResizeHandle() {
  const handle = document.getElementById('adminImageResizeHandle') || (inlineAdminSelectedImage ? getInlineAdminResizeHandle() : null);
  if (!handle) return;

  const image = inlineAdminSelectedImage || document.querySelector('.admin-image-selected');
  if (!image || !document.body.classList.contains('admin-anywhere-on')) {
    handle.style.display = 'none';
    return;
  }

  const rect = image.getBoundingClientRect();
  handle.style.display = 'block';
  handle.style.left = `${rect.right - 9}px`;
  handle.style.top = `${rect.bottom - 9}px`;
}

function getActiveInlineAdminImage(showMessage = true) {
  const image = inlineAdminSelectedImage || document.querySelector('.admin-image-selected');
  if (!image) {
    if (showMessage) updateInlineAdminToolbarState('Select an image first');
    return null;
  }

  if (!image._adminImageState) {
    const styles = getComputedStyle(image);
    image._adminImageState = {
      x: parseFloat(styles.getPropertyValue('--admin-x')) || 0,
      y: parseFloat(styles.getPropertyValue('--admin-y')) || 0,
      scale: parseFloat(styles.getPropertyValue('--admin-scale')) || 1,
      rotate: parseFloat(styles.getPropertyValue('--admin-rotate')) || 0
    };
  }

  if (inlineAdminSelectedImage !== image) selectInlineAdminImage(image);
  return image;
}

function changeSelectedInlineAdminImage(patch) {
  const image = getActiveInlineAdminImage();
  if (!image) return;

  const before = getInlineAdminSnapshot(image);
  const state = image._adminImageState || { x: 0, y: 0, scale: 1, rotate: 0 };
  const next = {
    ...state,
    ...patch
  };

  next.scale = clamp(Number(next.scale || 1), 0.25, 3);
  next.rotate = Number(next.rotate || 0);
  image._adminImageState = next;
  renderInlineAdminImageState(image);
  saveInlineAdminEdit(image, {
    src: image.getAttribute('src') || '',
    x: next.x,
    y: next.y,
    scale: next.scale,
    rotate: next.rotate
  });
  pushInlineAdminHistory(before, getInlineAdminSnapshot(image));
}

var runInlineAdminToolbarAction = function (action) {
  const now = Date.now();
  if (inlineAdminLastToolbarAction.action === action && now - inlineAdminLastToolbarAction.time < 120) return;
  inlineAdminLastToolbarAction = { action, time: now };

  if (action === 'undo') undoInlineAdminEdit();
  if (action === 'redo') redoInlineAdminEdit();
  if (action === 'save') commitInlineAdminEdits();
  if (action === 'center') {
    changeSelectedInlineAdminImage({ x: 0, y: 0 });
  }
  if (action === 'size-down') {
    const image = getActiveInlineAdminImage();
    const scale = Number(image?._adminImageState?.scale || 1);
    changeSelectedInlineAdminImage({ scale: scale - 0.05 });
  }
  if (action === 'size-up') {
    const image = getActiveInlineAdminImage();
    const scale = Number(image?._adminImageState?.scale || 1);
    changeSelectedInlineAdminImage({ scale: scale + 0.05 });
  }
  if (action === 'rotate-left') {
    const image = getActiveInlineAdminImage();
    const rotate = Number(image?._adminImageState?.rotate || 0);
    changeSelectedInlineAdminImage({ rotate: rotate - 5 });
  }
  if (action === 'rotate-right') {
    const image = getActiveInlineAdminImage();
    const rotate = Number(image?._adminImageState?.rotate || 0);
    changeSelectedInlineAdminImage({ rotate: rotate + 5 });
  }
  if (action === 'sign-out') signOutAdmin();
};

window.runInlineAdminToolbarAction = runInlineAdminToolbarAction;
globalThis.runInlineAdminToolbarAction = runInlineAdminToolbarAction;

function fileToSmallDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('error', reject);
    reader.addEventListener('load', () => resolve(reader.result));
    reader.readAsDataURL(file);
  });
}

function installInlineAdminMode() {
  if (document.body.dataset.inlineAdminReady) return;
  document.body.dataset.inlineAdminReady = 'true';
  document.body.classList.add('admin-anywhere-on');

  document.body.insertAdjacentHTML('beforeend', `
    <div class="admin-anywhere-toolbar">
      <strong>Admin Editing</strong>
      <span id="adminInlineStatus">Saved</span>
      <button type="button" data-admin-toolbar-action="undo" id="adminInlineUndo" title="Undo" onclick="runInlineAdminToolbarAction('undo')" onmousedown="runInlineAdminToolbarAction('undo')" onpointerdown="runInlineAdminToolbarAction('undo')">Undo</button>
      <button type="button" data-admin-toolbar-action="redo" id="adminInlineRedo" title="Redo" onclick="runInlineAdminToolbarAction('redo')" onmousedown="runInlineAdminToolbarAction('redo')" onpointerdown="runInlineAdminToolbarAction('redo')">Redo</button>
      <button type="button" data-admin-toolbar-action="save" id="adminInlineSave" title="Save changes" onclick="runInlineAdminToolbarAction('save')" onmousedown="runInlineAdminToolbarAction('save')" onpointerdown="runInlineAdminToolbarAction('save')">Save</button>
      <span id="adminInlineSelected">Select an image</span>
      <button type="button" data-admin-image-control data-admin-toolbar-action="center" id="adminInlineCenter" title="Center selected image" onclick="runInlineAdminToolbarAction('center')" onmousedown="runInlineAdminToolbarAction('center')" onpointerdown="runInlineAdminToolbarAction('center')">Center</button>
      <button type="button" data-admin-image-control data-admin-toolbar-action="size-down" id="adminInlineSizeDown" title="Smaller" onclick="runInlineAdminToolbarAction('size-down')" onmousedown="runInlineAdminToolbarAction('size-down')" onpointerdown="runInlineAdminToolbarAction('size-down')">Size -</button>
      <button type="button" data-admin-image-control data-admin-toolbar-action="size-up" id="adminInlineSizeUp" title="Bigger" onclick="runInlineAdminToolbarAction('size-up')" onmousedown="runInlineAdminToolbarAction('size-up')" onpointerdown="runInlineAdminToolbarAction('size-up')">Size +</button>
      <button type="button" data-admin-image-control data-admin-toolbar-action="rotate-left" id="adminInlineRotateLeft" title="Rotate left" onclick="runInlineAdminToolbarAction('rotate-left')" onmousedown="runInlineAdminToolbarAction('rotate-left')" onpointerdown="runInlineAdminToolbarAction('rotate-left')">Rotate -</button>
      <button type="button" data-admin-image-control data-admin-toolbar-action="rotate-right" id="adminInlineRotateRight" title="Rotate right" onclick="runInlineAdminToolbarAction('rotate-right')" onmousedown="runInlineAdminToolbarAction('rotate-right')" onpointerdown="runInlineAdminToolbarAction('rotate-right')">Rotate +</button>
      <a href="admin.html">Admin Page</a>
      <button type="button" data-admin-toolbar-action="sign-out" id="adminAnywhereOff" onclick="runInlineAdminToolbarAction('sign-out')" onmousedown="runInlineAdminToolbarAction('sign-out')" onpointerdown="runInlineAdminToolbarAction('sign-out')">Log Out</button>
    </div>
  `);

  document.getElementById('adminAnywhereOff')?.addEventListener('click', () => {
    signOutAdmin();
  });

  document.querySelectorAll('[data-admin-toolbar-action]').forEach((button) => {
    const runToolbarAction = (event) => {
      event.preventDefault();
      event.stopPropagation();
      runInlineAdminToolbarAction(button.dataset.adminToolbarAction);
    };

    button.addEventListener('click', runToolbarAction);
    button.addEventListener('pointerdown', runToolbarAction);
    button.addEventListener('mousedown', runToolbarAction);
  });

  window.addEventListener('keydown', (event) => {
    if (!document.body.classList.contains('admin-anywhere-on')) return;
    const key = event.key.toLowerCase();

    if ((event.metaKey || event.ctrlKey) && key === 's') {
      event.preventDefault();
      commitInlineAdminEdits();
    }

    if ((event.metaKey || event.ctrlKey) && key === 'z' && !event.shiftKey) {
      event.preventDefault();
      undoInlineAdminEdit();
    }

    if ((event.metaKey || event.ctrlKey) && (key === 'y' || (key === 'z' && event.shiftKey))) {
      event.preventDefault();
      redoInlineAdminEdit();
    }
  });

  document.querySelectorAll('h1,h2,h3,h4,p,a,button,span,label,strong,li').forEach((element) => {
    if (element.closest('.admin-anywhere-toolbar, .cart-panel, script, style, .password-field')) return;
    inlineAdminKey(element);
    element.contentEditable = 'true';
    element.spellcheck = false;
    element.classList.add('admin-editable-text');
    element.addEventListener('focus', () => {
      element._adminBeforeSnapshot = getInlineAdminSnapshot(element);
    });
    element.addEventListener('click', (event) => {
      if (element.closest('.top-nav')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    element.addEventListener('input', () => saveInlineAdminEdit(element, { text: element.textContent.trim() }));
    element.addEventListener('blur', () => {
      pushInlineAdminHistory(element._adminBeforeSnapshot, getInlineAdminSnapshot(element));
      delete element._adminBeforeSnapshot;
    });
  });

  document.querySelectorAll('img').forEach((image) => {
    if (image.closest('.admin-anywhere-toolbar')) return;
    inlineAdminKey(image);
    image.classList.add('admin-editable-image', 'admin-transformable-image');
    const saved = readInlineAdminEdits()[inlineAdminPageKey()]?.[inlineAdminKey(image)] || {};
    image._adminImageState = {
      x: Number(saved.x || 0),
      y: Number(saved.y || 0),
      scale: Number(saved.scale || 1),
      rotate: Number(saved.rotate || 0)
    };
    renderInlineAdminImageState(image);

    image.addEventListener('pointerdown', (event) => {
      if (event.target?.id === 'adminImageResizeHandle') return;
      if (event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      selectInlineAdminImage(image);
      const before = getInlineAdminSnapshot(image);
      const startX = event.clientX;
      const startY = event.clientY;
      const baseX = image._adminImageState.x;
      const baseY = image._adminImageState.y;

      const move = (moveEvent) => {
        image._adminImageState.x = baseX + moveEvent.clientX - startX;
        image._adminImageState.y = baseY + moveEvent.clientY - startY;
        renderInlineAdminImageState(image);
        saveInlineAdminEdit(image, {
          src: image.getAttribute('src') || '',
          ...image._adminImageState
        });
      };
      const stop = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', stop);
        pushInlineAdminHistory(before, getInlineAdminSnapshot(image));
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', stop);
    });

    image.addEventListener('wheel', (event) => {
      event.preventDefault();
      selectInlineAdminImage(image);
      const before = getInlineAdminSnapshot(image);
      if (event.shiftKey) {
        image._adminImageState.rotate += event.deltaY < 0 ? -3 : 3;
      } else {
        image._adminImageState.scale = clamp(image._adminImageState.scale + (event.deltaY < 0 ? 0.04 : -0.04), 0.25, 3);
      }
      renderInlineAdminImageState(image);
      saveInlineAdminEdit(image, {
        src: image.getAttribute('src') || '',
        ...image._adminImageState
      });
      pushInlineAdminHistory(before, getInlineAdminSnapshot(image));
    });

    image.addEventListener('dblclick', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectInlineAdminImage(image);
      const before = getInlineAdminSnapshot(image);
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        image.src = await fileToSmallDataUrl(file);
        saveInlineAdminEdit(image, { src: image.src, ...image._adminImageState });
        pushInlineAdminHistory(before, getInlineAdminSnapshot(image));
      });
      input.click();
    });
  });

  window.addEventListener('scroll', updateInlineAdminResizeHandle, { passive: true });
  window.addEventListener('resize', updateInlineAdminResizeHandle);
  updateInlineAdminToolbarState();
}

function getSelectedProduct(button) {
  const card = button.closest('.product-card');
  const builder = card.querySelector('.size-builder');

  if (!builder) {
    const productName = card.querySelector('.product-title-link')?.textContent || 'Custom Cutout';
    return { card, builder: null, productName, price: 50.00, valid: true };
  }

  const priceEl = builder.querySelector('.live-size-price');
  const productName = builder.dataset.productName || 'Custom Cutout';
  const rawPrice = priceEl ? priceEl.textContent.replace('$', '').trim() : '';
  const price = parseFloat(rawPrice);

  // If no valid price or zero price, do NOT allow purchase
  if (!price || price <= 0) {
    return { card, builder, productName, price: 0, valid: false };
  }

  return { card, builder, productName, price, valid: true };
}

function addSelectedToCart(button) {
  const selected = getSelectedProduct(button);

  if (!selected.valid) {
    alert('Please enter a valid custom height before adding this item to cart.');
    return;
  }

  addToCart(selected.productName, selected.price);
}

function buySelectedNow(button) {
  const selected = getSelectedProduct(button);

  if (!selected.valid) {
    alert('Please enter a valid custom height before buying this item.');
    return;
  }

  const img = selected.card.querySelector('.product-cutout')?.src || '';
  openBuyNow(selected.productName, selected.price, img);
}

/* ---------------- PAGE INIT ---------------- */
document.addEventListener('DOMContentLoaded', function () {
  setupAuthState();
  updateCart();
  showInfoSlide(0);
  renderCouponBanner();

  document.querySelectorAll('img').forEach((image) => {
    image.setAttribute('draggable', 'false');
    image.addEventListener('dragstart', (event) => event.preventDefault());
    image.addEventListener('contextmenu', (event) => event.preventDefault());
  });

  applyAdminExtraImages();
  applyInlineAdminEdits();
  renderAdminManagedCards();

  document.querySelectorAll('.product-stage-preview').forEach((stage) => {
    if (stage.querySelector('.stage-option-boxes')) return;

    stage.insertAdjacentHTML('beforeend', `
      <div class="stage-option-boxes">
        <span class="active" data-stage-choice="original" role="button" tabindex="0">Original 6'6</span>
        <span data-stage-choice="custom" role="button" tabindex="0">Custom Size</span>
      </div>
    `);
  });

  const shopTools = document.querySelector('#shop .shop-tools');
  if (shopTools && !document.getElementById('adminSizeToggle')) {
    shopTools.insertAdjacentHTML('beforeend', '<button id="adminSizeToggle" class="admin-size-toggle" type="button">Admin Edit Sizes</button>');
    document.getElementById('adminSizeToggle')?.addEventListener('click', toggleAdminSizeEditor);
  }

  const fanVotes = getFanVoteStore();
  document.querySelectorAll('[data-vote-id]').forEach((button) => {
    setFanVoteButtonState(button, Boolean(fanVotes[button.dataset.voteId]));
  });

  window.addEventListener('click', function (e) {
    const bgModal = document.getElementById('bgModal');
    if (bgModal && e.target === bgModal) closeBgModal();
  });

  document.querySelectorAll('.size-builder').forEach((builder) => {
    applyAdminProductOverrides(builder);

    const savedOriginalHeight = localStorage.getItem(getProductAdminKey(builder));
    if (savedOriginalHeight) builder.dataset.originalHeight = savedOriginalHeight;

    const priceDisplay = builder.querySelector('.live-size-price');
    const customInput = builder.querySelector('.custom-height-input');
    const radios = builder.querySelectorAll('input[type="radio"]');
    const card = builder.closest('.product-card');
    const stage = card?.querySelector('.product-stage-preview');

    installSizeAdmin(builder);
    updateBuilderOriginalDisplay(builder);

    radios.forEach((radio) => {
      radio.addEventListener('change', function () {
        if (this.value === 'custom') {
          selectSizeMode(builder, 'custom');
          return;
        }

        selectSizeMode(builder, 'original');
      });
    });

    if (customInput) {
      customInput.addEventListener('input', function () {
        updateCustomPrice(builder);
      });
    }

    stage?.querySelectorAll('[data-stage-choice]').forEach((choiceButton) => {
      const choose = (event) => {
        event.preventDefault();
        event.stopPropagation();
        selectSizeMode(builder, choiceButton.dataset.stageChoice);
      };

      choiceButton.addEventListener('click', choose);
      choiceButton.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') choose(event);
      });
    });
  });

  applyInlineAdminEdits();

  const isAuthPage = Boolean(document.querySelector('.auth-page'));
  if (!isAuthPage && (isAdminSignedIn() || localStorage.getItem('mvpluxAdminAnywhere') === 'true')) {
    installInlineAdminMode();
  }
});
