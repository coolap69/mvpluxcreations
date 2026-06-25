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
    const count = button.querySelector('.fan-vote-count')?.textContent || '';
    button.childNodes[0].textContent = button.textContent.toLowerCase().includes('best')
      ? 'Voted Best Design '
      : 'Voted ';
    if (count && !button.querySelector('.fan-vote-count')) {
      button.insertAdjacentHTML('beforeend', `<span class="fan-vote-count">${count}</span>`);
    }
  }
}

function incrementVoteCount(voteId) {
  document.querySelectorAll(`[data-vote-id="${voteId}"] .fan-vote-count`).forEach((countEl) => {
    const current = parseInt(countEl.textContent, 10);
    if (!Number.isNaN(current)) {
      countEl.textContent = current + 1;
    }
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

function calculateCutoutPrice(inches) {
  if (!inches) return null;

  if (inches < 24) return null;

  if (inches <= 36) {
    return 35.00 + ((inches - 24) * 1.25);
  }

  if (inches > 36 && inches <= 78) {
    return 50.00 + ((inches - 36) * ((129.99 - 50.00) / 42));
  }

  return 129.99 + ((inches - 78) * 2.00);
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
  const originalPrice = parseFloat(builder.dataset.originalPriceOverride || '') || calculateCutoutPrice(originalHeight);
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
  const price = calculateCutoutPrice(inches);

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
  updateCart();
  showInfoSlide(0);
  renderCouponBanner();

  document.querySelectorAll('img').forEach((image) => {
    image.setAttribute('draggable', 'false');
    image.addEventListener('dragstart', (event) => event.preventDefault());
    image.addEventListener('contextmenu', (event) => event.preventDefault());
  });

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
});
