let cart = [];
let cartTotal = 0;
let infoSlideIndex = 0;
let currentBuyNowItem = null;
let activeOfferState = null;
const adminStateUtilsPromise = import('./admin-state-utils.js');
const storefrontAdminTabId = crypto.randomUUID?.()
  || `admin-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const supportEmail = 'support@mvpluxcreations.com';
let currentCheckoutPaymentMethod = 'zelle';
let currentCheckoutOrderNumber = '';
let currentCheckoutOrderId = '';
let currentCheckoutOfferId = '';
let checkoutDiscountState = null;
let checkoutReceiptState = null;
let storefrontTestMode = { enabled: false, customerType: 'guest' };
let currentCheckoutIsTest = false;

function showSiteMessage(message, type = 'info') {
  let messageBox = document.getElementById('siteMessageBox');
  if (!messageBox) {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="siteMessageBox" class="site-message-box" role="status" aria-live="polite">
        <p></p>
        <button type="button" aria-label="Close message" onclick="this.closest('.site-message-box').classList.remove('show')">x</button>
      </div>
    `);
    messageBox = document.getElementById('siteMessageBox');
  }

  messageBox.className = `site-message-box site-message-${type}`;
  messageBox.querySelector('p').textContent = message;
  messageBox.classList.add('show');

  window.clearTimeout(showSiteMessage.hideTimer);
  showSiteMessage.hideTimer = window.setTimeout(() => {
    messageBox.classList.remove('show');
  }, type === 'error' ? 9000 : 5200);
}

const checkoutPaymentMethods = {
  // ADMIN: Edit payment details here. Stripe / Apple Pay / Google Pay can be added later.
  zelle: {
    label: 'Zelle',
    buttonLabel: 'Zelle Instructions',
    note: 'Preferred - No Processing Fee',
    phone: '(508) 463-5910',
    active: true,
    preferred: true
  },
  paypal: {
    label: 'PayPal',
    buttonLabel: 'Pay with PayPal',
    note: 'Accepted for convenience. Opens PayPal in a secure new tab.',
    payUrl: 'https://paypal.me/louispazos',
    qrImage: '',
    active: true
  },
  venmo: {
    label: 'Venmo',
    buttonLabel: 'Pay with Venmo',
    note: 'Accepted for convenience. Opens Venmo in a secure new tab.',
    payUrl: 'https://venmo.com/u/Lap27',
    qrImage: '',
    active: true
  },
  cashapp: {
    label: 'Cash App',
    buttonLabel: 'Pay with Cash App',
    note: 'Accepted for convenience. Opens Cash App in a secure new tab.',
    payUrl: 'https://cash.app/$Watawonderfulworld',
    qrImage: '',
    active: true
  },
  stripe: {
    label: 'Card / Apple Pay / Google Pay',
    buttonLabel: 'Card Pay Later',
    note: 'Placeholder for Stripe, Apple Pay, and Google Pay later.',
    payUrl: '#STRIPE_APPLE_GOOGLE_PAY_LATER',
    qrImage: '',
    active: false
  }
};

/* ---------------- CART ---------------- */
function ensureCartShell() {
  if (!document.querySelector('.cart-button')) {
    const header = document.querySelector('.top-nav') || document.body;
    header.insertAdjacentHTML('beforeend', `
      <button class="cart-button" onclick="toggleCart()" aria-label="Open cart">
        <span class="cart-icon">🛒</span>
        <span id="cartCount" class="cart-count">0</span>
      </button>
    `);
  }

  if (!document.getElementById('cartPanel')) {
    document.body.insertAdjacentHTML('afterbegin', `
      <aside id="cartPanel" class="cart-panel">
        <button class="close-cart" onclick="toggleCart()">x</button>
        <h2>Your Cart</h2>
        <div id="cartItems"></div>
        <p class="cart-total">Total: $<span id="cartTotal">0.00</span></p>
        <p class="cart-free-shipping">Shipping: Free</p>
        <button class="checkout-btn" onclick="openCheckout()">Checkout / Pay</button>
      </aside>
    `);
  }
}

function isLikelyBackgroundImage(src = '') {
  const value = String(src || '').toLowerCase();
  return value.includes('fanbackgrounds')
    || value.includes('background')
    || value.includes('stage-')
    || value.includes('gallery-poster')
    || value.includes('herobackgroundparts-background');
}

function imageSrcValue(image) {
  return image?.currentSrc || image?.src || image?.getAttribute?.('src') || '';
}

function getDisplayImageFrom(root) {
  if (!root) return '';
  const activeOptionImage = root.querySelector?.('.category-option-strip button.active img, .sports-option-strip button.active img');
  const activeOptionSrc = imageSrcValue(activeOptionImage);
  if (activeOptionSrc && !isLikelyBackgroundImage(activeOptionSrc)) return activeOptionSrc;

  const images = [...(root.querySelectorAll?.([
    '#sportsMainImage',
    '.generic-main-image',
    '.standee-main-cutout',
    '.product-cutout',
    '.fan-card-cutout',
    '.fan-gallery-cutout'
  ].join(',')) || [])];
  const realImage = images.find((image) => {
    const src = imageSrcValue(image);
    return src && !isLikelyBackgroundImage(src);
  }) || images[0];
  return imageSrcValue(realImage);
}

function getSelectedProductImage(selected) {
  const showroom = selected?.card?.closest?.('.sports-showroom, .generic-showroom, .standee-detail-page, .standee-detail-hero');
  const showroomImage = getDisplayImageFrom(showroom);
  if (showroomImage) return showroomImage;

  const cardImage = getDisplayImageFrom(selected?.card);
  if (cardImage) return cardImage;

  const siblingShowroom = selected?.card?.parentElement?.querySelector?.('#sportsMainImage, .generic-main-image, .standee-main-cutout, .product-cutout');
  if (siblingShowroom) return siblingShowroom.currentSrc || siblingShowroom.src || siblingShowroom.getAttribute('src') || '';

  return getDisplayImageFrom(document.querySelector('.sports-showroom, .generic-showroom, .standee-detail-page')) || '';
}

function checkoutItemDetails(details = {}) {
  const settings = getPriceSettingsForBuilder();
  return {
    selectedHeight: Number(details.selectedHeight) || settings.fullHeight,
    finishExtra: Number(details.finishExtra) || 0,
    productSlug: String(details.productSlug || '').trim()
  };
}

function addToCart(name, price, image = '', details = {}) {
  ensureCartShell();
  resetCheckoutSubmissionState();
  cart.push({ name, price, image: image || '', ...checkoutItemDetails(details) });
  cartTotal += price;
  updateCart();
}

function resetCheckoutSubmissionState() {
  currentCheckoutOrderNumber = '';
  currentCheckoutOrderId = '';
  currentCheckoutOfferId = '';
  checkoutDiscountState = null;
  checkoutReceiptState = null;
  currentCheckoutIsTest = false;
  const successNotice = document.getElementById('checkoutSuccessNotice');
  const orderNumberEl = document.getElementById('checkoutOrderNumber');
  if (successNotice) {
    delete successNotice.dataset.sent;
    successNotice.style.display = 'none';
  }
  if (orderNumberEl) orderNumberEl.textContent = '';
}

function checkoutAcceptedOffer(name, price, isTest = false) {
  resetCheckoutSubmissionState();
  currentCheckoutIsTest = Boolean(isTest);
  currentCheckoutOfferId = activeOfferState?.id || '';
  const acceptedItem = {
    name: `${name || 'Selected item'} - Accepted Offer`,
    price: Number(price) || 0,
    image: activeOfferState?.thumbnailPath || ''
  };

  ensureCartShell();
  cart = [acceptedItem];
  cartTotal = acceptedItem.price;
  currentBuyNowItem = null;
  updateCart();
  const offerModal = document.getElementById('offerModal');
  const buyModal = document.getElementById('buyModal');
  if (offerModal) offerModal.style.display = 'none';
  if (buyModal) buyModal.style.display = 'none';
  openCheckout();
}

function updateCart() {
  ensureCartShell();
  const cartCount = document.getElementById('cartCount');
  const cartTotalEl = document.getElementById('cartTotal');
  const cartItems = document.getElementById('cartItems');

  if (!cartCount || !cartTotalEl || !cartItems) return;

  cartCount.textContent = cart.length;
  cartTotalEl.textContent = cartTotal.toFixed(2);
  cartItems.innerHTML = '';

  cart.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'cart-item';
    const imageMarkup = item.image
      ? `<img class="cart-item-thumb" src="${item.image}" alt="${item.name} preview">`
      : '<div class="cart-item-thumb cart-item-thumb-empty" aria-hidden="true">MV</div>';
    div.innerHTML = `
      ${imageMarkup}
      <div class="cart-item-info">
        <strong>${item.name}</strong>
        <span>$${item.price.toFixed(2)}</span>
      </div>
      <button class="cart-remove-btn" type="button" onclick="removeFromCart(${index})" aria-label="Remove ${item.name} from cart">x</button>
    `;
    cartItems.appendChild(div);
  });
}

function removeFromCart(index) {
  const removed = cart.splice(index, 1)[0];
  if (removed) {
    checkoutDiscountState = null;
    cartTotal = Math.max(0, cartTotal - removed.price);
    updateCart();
  }
}

function toggleCart() {
  const cartPanel = document.getElementById('cartPanel');
  if (cartPanel) cartPanel.classList.toggle('open');
}

/* ---------------- BUY / OFFER MODALS ---------------- */
function openBuyNow(title, price, image, details = {}) {
  ensureCommerceModals();
  resetCheckoutSubmissionState();
  const modalTitle = document.getElementById('modalTitle');
  const modalPrice = document.getElementById('modalPrice');
  const modalImage = document.getElementById('modalImage');
  const buyModal = document.getElementById('buyModal');
  currentBuyNowItem = { name: title, price: Number(price) || 0, image: image || '', ...checkoutItemDetails(details) };

  if (modalTitle) modalTitle.textContent = title;
  if (modalPrice) modalPrice.textContent = '$' + price.toFixed(2);
  if (modalImage) modalImage.src = image;
  if (buyModal) buyModal.style.display = 'flex';
}

function getAutoAcceptRule(heightInches) {
  const height = Number(heightInches) || 0;
  if (height >= 60 && height < 72) {
    return {
      discountPercent: 10,
      minimumMultiplier: 0.9,
      label: "5 ft to 5'11 auto-accept limit"
    };
  }
  if (height >= 72 && height <= 96) {
    return {
      discountPercent: 15,
      minimumMultiplier: 0.85,
      label: '6 ft to 8 ft auto-accept limit'
    };
  }
  return null;
}

function getAutoAcceptResult(offerAmount, askingPrice, heightInches) {
  const rule = getAutoAcceptRule(heightInches);
  const asking = Number(askingPrice) || 0;
  const offer = Number(offerAmount) || 0;
  if (!rule || !asking || !offer) {
    return {
      accepted: false,
      rule,
      minimumOffer: 0
    };
  }

  const minimumOffer = Math.floor(asking * rule.minimumMultiplier);
  return {
    accepted: offer >= minimumOffer,
    rule,
    minimumOffer
  };
}

function openOffer(productName, offerMeta = {}) {
  ensureCommerceModals();
  const offerProduct = document.getElementById('offerProduct');
  const offerDesign = document.getElementById('offerDesign');
  const offerDescription = document.getElementById('offerDescription');
  const offerSelectedSize = document.getElementById('offerSelectedSize');
  const offerOriginalHeight = document.getElementById('offerOriginalHeight');
  const offerBackground = document.getElementById('offerBackground');
  const offerSizeStatus = document.getElementById('offerSizeStatus');
  const offerAskingPrice = document.getElementById('offerAskingPrice');
  const offerThumbnail = document.getElementById('offerThumbnail');
  const offerModal = document.getElementById('offerModal');
  const signedInName = getSignedInName();
  activeOfferState = {
    productName,
    askingPrice: Number(offerMeta.askingPrice || offerMeta.price || 0),
    selectedHeight: Number(offerMeta.selectedHeight || 0),
    sizeLabel: offerMeta.sizeLabel || '',
    designLabel: offerMeta.designLabel || 'Primary image',
    description: offerMeta.description || '',
    originalHeight: Number(offerMeta.originalHeight || 0),
    backgroundLabel: offerMeta.backgroundLabel || 'Standard display',
    sizeStatus: offerMeta.sizeStatus || '',
    thumbnailPath: offerMeta.thumbnailPath || '',
    imageOptions: Array.isArray(offerMeta.imageOptions) ? offerMeta.imageOptions : [],
    selectedImageIndex: Number(offerMeta.selectedImageIndex || 0),
    finishOptions: Array.isArray(offerMeta.finishOptions) ? offerMeta.finishOptions : [],
    selectedFinishIndex: Number(offerMeta.selectedFinishIndex || 0),
    supportsCustomSize: Boolean(offerMeta.supportsCustomSize),
    sourceBuilder: offerMeta.sourceBuilder || null,
    memberUser: null,
    buyerOffer: null,
    sellerCounter: null,
    buyerCounterUsed: false,
    status: 'open'
  };

  if (offerProduct) offerProduct.textContent = productName;
  const guestProduct = document.getElementById('guestOfferProduct');
  const guestOriginalSize = document.getElementById('guestOfferOriginalSize');
  const guestAskingPrice = document.getElementById('guestOfferAskingPrice');
  if (guestProduct) guestProduct.textContent = productName;
  if (guestOriginalSize) guestOriginalSize.textContent = activeOfferState.originalHeight ? formatHeight(activeOfferState.originalHeight) : activeOfferState.sizeLabel || 'Original size';
  if (guestAskingPrice) guestAskingPrice.textContent = activeOfferState.askingPrice ? formatMoney(activeOfferState.askingPrice) : 'Shown price';
  if (offerDesign) offerDesign.textContent = activeOfferState.designLabel;
  if (offerDescription) offerDescription.textContent = activeOfferState.description || 'Custom standee made to the selected size and design.';
  if (offerSelectedSize) offerSelectedSize.textContent = activeOfferState.sizeLabel || 'Selected size';
  if (offerOriginalHeight) offerOriginalHeight.textContent = activeOfferState.originalHeight ? formatHeight(activeOfferState.originalHeight) : 'Not specified';
  if (offerBackground) offerBackground.textContent = activeOfferState.backgroundLabel;
  if (offerSizeStatus) offerSizeStatus.textContent = activeOfferState.sizeStatus || 'Original size selected';
  if (offerAskingPrice) offerAskingPrice.textContent = activeOfferState.askingPrice ? formatMoney(activeOfferState.askingPrice) : 'Shown price';
  if (offerThumbnail) {
    offerThumbnail.src = activeOfferState.thumbnailPath;
    offerThumbnail.alt = `${activeOfferState.designLabel} preview`;
  }
  const offerSubmitButton = document.querySelector('#offerForm button[type="submit"]');
  if (offerSubmitButton) offerSubmitButton.disabled = false;
  updateOfferBoard(productName, signedInName);
  if (offerModal) offerModal.style.display = 'flex';
  loadLatestMemberOffer(productName);
}

function closeModals() {
  const buyModal = document.getElementById('buyModal');
  const offerModal = document.getElementById('offerModal');
  const checkoutModal = document.getElementById('checkoutModal');
  const paymentOptionModal = document.getElementById('paymentOptionModal');

  if (buyModal) buyModal.style.display = 'none';
  if (offerModal) offerModal.style.display = 'none';
  if (checkoutModal) checkoutModal.style.display = 'none';
  if (paymentOptionModal) paymentOptionModal.style.display = 'none';
}

/* ---------------- CHECKOUT / PAYMENT ---------------- */
function calculateCustomerPaidTotal(subtotal, methodKey) {
  const method = checkoutPaymentMethods[methodKey] || checkoutPaymentMethods.zelle;
  const amount = Number(subtotal) || 0;
  return {
    subtotal: amount,
    fee: 0,
    total: amount,
    method
  };
}

function getCheckoutItems() {
  if (cart.length) return cart;
  if (currentBuyNowItem?.price) return [currentBuyNowItem];
  return [];
}

function getCheckoutSubtotal() {
  return getCheckoutItems().reduce((sum, item) => sum + (Number(item.price) || 0), 0);
}

function getCurrentCheckoutCategory() {
  const page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const category = (window.MVPLUX_PRODUCT_CATEGORIES || []).find((item) => {
    const pages = item.pages || (item.page ? [item.page] : []);
    return pages.some((candidate) => String(candidate).toLowerCase() === page);
  });
  return category?.key || '';
}

function formValue(form, name) {
  return form?.elements?.[name]?.value?.trim() || '';
}

function createOrderNumber() {
  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('');
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MVP-${stamp}-${random}`;
}

function getCommerceClient() {
  const client = window.getMvpluxSupabaseClient?.();
  if (!client) {
    showSiteMessage(`The order system is still loading. Please try again in a moment or contact ${supportEmail}.`, 'error');
    return null;
  }
  return client;
}

async function getCommerceUser(client) {
  if (!client?.auth?.getSession) return null;
  const { data } = await client.auth.getSession();
  return data?.session?.user || null;
}

function renderStorefrontTestMode() {
  let warning = document.getElementById('storefrontTestModeWarning');
  if (!storefrontTestMode.enabled) {
    warning?.remove();
    document.body.classList.remove('storefront-test-mode');
    return;
  }
  if (!warning) {
    document.body.insertAdjacentHTML('afterbegin', '<div id="storefrontTestModeWarning" class="admin-test-mode-warning storefront-test-warning">TEST MODE — No real payment will be requested, sent, captured, or recorded.</div>');
    warning = document.getElementById('storefrontTestModeWarning');
  }
  document.body.classList.add('storefront-test-mode');
}

async function loadStorefrontTestMode() {
  const client = window.getMvpluxSupabaseClient?.();
  if (!client?.auth) return;
  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData?.session?.user) return;
  const { data, error } = await client.rpc('get_admin_test_mode');
  if (error || !data?.enabled) return;
  storefrontTestMode = {
    enabled: true,
    customerType: data.customer_type === 'member' ? 'member' : 'guest'
  };
  renderStorefrontTestMode();
}

function checkoutIsNegotiatedOffer() {
  return getCheckoutItems().some((item) => String(item.name || '').includes('Accepted Offer'));
}

function checkoutIsTestRecord() {
  return currentCheckoutIsTest || storefrontTestMode.enabled;
}

async function applyCheckoutDiscount() {
  const input = document.getElementById('checkoutDiscountCode');
  const status = document.getElementById('checkoutDiscountStatus');
  const code = input?.value.trim().toUpperCase() || '';
  if (!code) {
    checkoutDiscountState = null;
    if (status) status.textContent = 'Enter a discount code.';
    updateCheckoutDisplay();
    return;
  }
  const client = getCommerceClient();
  if (!client) return;
  const button = document.getElementById('applyCheckoutDiscount');
  if (button) button.disabled = true;
  if (status) status.textContent = 'Checking code...';
  const items = getCheckoutItems();
  const { data, error } = await client.rpc('validate_discount_code', {
    p_code: code,
    p_original_amount: Number(getCheckoutSubtotal().toFixed(2)),
    p_customer_email: document.querySelector('#checkoutModal [name="email"]')?.value?.trim() || null,
    p_product_names: items.map((item) => item.name || ''),
    p_categories: items.map((item) => item.category || getCurrentCheckoutCategory()).filter(Boolean),
    p_is_negotiated_offer: checkoutIsNegotiatedOffer()
  });
  if (button) button.disabled = false;
  if (error || !data?.valid) {
    checkoutDiscountState = null;
    if (status) status.textContent = error?.message || data?.message || 'This discount code is not valid.';
    updateCheckoutDisplay();
    return;
  }
  checkoutDiscountState = {
    code: data.code,
    amount: Number(data.discount_amount) || 0,
    final: Number(data.final_amount) || 0
  };
  if (input) input.value = data.code;
  if (status) status.textContent = `${data.code} applied.`;
  updateCheckoutDisplay();
}

function paymentMethodButtonMarkup(key, method) {
  const disabled = method.active ? '' : ' disabled';
  return `
    <button type="button" class="payment-method-card ${key === currentCheckoutPaymentMethod ? 'active' : ''}" data-payment-method="${key}" onclick="selectCheckoutPaymentMethod('${key}')"${disabled}>
      <span>${method.label}${method.preferred ? ' <b>Preferred</b>' : ''}</span>
      <small>${method.note}</small>
      <em>${method.active ? 'Open payment instructions' : 'Coming later'}</em>
    </button>
  `;
}

function paymentActionButtonsMarkup() {
  return Object.entries(checkoutPaymentMethods)
    .filter(([, method]) => method.active)
    .map(([key, method]) => `<button type="button" class="payment-action-btn" onclick="openPaymentOption('${key}')">${method.buttonLabel || method.label}</button>`)
    .join('');
}

function paymentModalMarkup() {
  return `
    <div id="paymentOptionModal" class="modal">
      <div class="modal-content payment-option-modal-content">
        <button class="close-modal" onclick="closePaymentOption()">x</button>
        <h2 id="paymentOptionTitle">Payment Option</h2>
        <p id="paymentOptionIntro"></p>
        <div id="paymentOptionQr" class="payment-option-qr"></div>
        <div class="payment-order-note">
          <strong>Payment note</strong>
          <span id="paymentOrderNoteText">Please include your order number in the payment note. Your order will be processed after payment is confirmed.</span>
        </div>
        <button id="paymentOptionLink" type="button" class="submit-btn">Open Secure Payment Page</button>
        <p id="paymentOptionDisclaimer" class="payment-option-disclaimer">Zelle is preferred because there are no processing fees. PayPal, Venmo, and Cash App are accepted for convenience.</p>
      </div>
    </div>
  `;
}

function selectCheckoutPaymentMethod(key) {
  const method = checkoutPaymentMethods[key];
  if (!method) return;
  if (!method.active) {
    showSiteMessage(`${method.label} can be added later.`, 'info');
    return;
  }

  currentCheckoutPaymentMethod = key;
  document.querySelectorAll('.payment-method-card').forEach((button) => {
    button.classList.toggle('active', button.dataset.paymentMethod === key);
  });
  updateCheckoutDisplay();
  openPaymentOption(key);
}

function closePaymentOption() {
  const modal = document.getElementById('paymentOptionModal');
  if (modal) modal.style.display = 'none';
}

function isPlaceholderPaymentLink(url) {
  return !url || url.startsWith('#');
}

async function copyZellePhoneNumber() {
  const phone = checkoutPaymentMethods.zelle.phone;
  try {
    await navigator.clipboard.writeText(phone);
    showSiteMessage('Zelle phone number copied.', 'success');
  } catch (error) {
    showSiteMessage(`Zelle phone number: ${phone}`, 'info');
  }
}

async function markPaymentCompleted() {
  const orderNumber = currentCheckoutOrderNumber || 'your order number';
  if (currentCheckoutOfferId) {
    const client = getCommerceClient();
    if (!client) return;
    const { error } = await client.rpc('submit_offer_payment', { p_offer_id: currentCheckoutOfferId });
    if (error) {
      showSiteMessage(`Could not submit the payment confirmation. ${error.message || error}`, 'error');
      return;
    }
    if (activeOfferState?.id === currentCheckoutOfferId) activeOfferState.status = 'payment_submitted';
    showSiteMessage(checkoutIsTestRecord()
      ? 'TEST payment submitted. No real money was sent. Awaiting Admin confirmation.'
      : 'Payment submitted. MVPLUXCREATIONS will confirm it before the order is created.', 'success');
    closePaymentOption();
    updateOfferBoard();
    return;
  }
  if (checkoutIsTestRecord()) {
    const client = getCommerceClient();
    if (!client || !currentCheckoutOrderId) {
      showSiteMessage('Submit the test order before simulating payment.', 'error');
      return;
    }
    const { error } = await client.rpc('update_test_order_status', {
      p_order_id: currentCheckoutOrderId,
      p_status: 'payment_submitted'
    });
    if (error) {
      showSiteMessage(`Could not record the test payment step. ${error.message || error}`, 'error');
      return;
    }
    showSiteMessage(`TEST payment submitted for ${orderNumber}. No payment destination was opened and no real money was recorded.`, 'success');
    closePaymentOption();
    return;
  }
  showSiteMessage(`Thank you. Payment marked as completed for ${orderNumber}. MVPLUXCREATIONS will confirm it soon.`, 'success');
}

function openPaymentOption(key = currentCheckoutPaymentMethod) {
  ensureCommerceModals();
  const method = checkoutPaymentMethods[key] || checkoutPaymentMethods.zelle;
  if (!method.active) {
    showSiteMessage(`${method.label} can be added later.`, 'info');
    return;
  }

  currentCheckoutPaymentMethod = key;
  const modal = document.getElementById('paymentOptionModal');
  const title = document.getElementById('paymentOptionTitle');
  const intro = document.getElementById('paymentOptionIntro');
  const qr = document.getElementById('paymentOptionQr');
  const note = document.getElementById('paymentOrderNoteText');
  const link = document.getElementById('paymentOptionLink');
  const disclaimer = document.getElementById('paymentOptionDisclaimer');
  const orderNumber = currentCheckoutOrderNumber || '';

  if (checkoutIsTestRecord()) {
    if (title) title.textContent = 'TEST Payment Simulation';
    if (intro) intro.textContent = 'No real payment information or payment destination will be used.';
    if (qr) qr.innerHTML = '<strong>TEST</strong><span>This simulates opening payment instructions.</span>';
    if (note) note.textContent = orderNumber ? `Simulated payment for ${orderNumber}.` : 'Submit the test order first.';
    if (link) {
      link.textContent = 'Simulate Payment Submitted';
      link.disabled = !(currentCheckoutOfferId || currentCheckoutOrderId);
      link.onclick = markPaymentCompleted;
    }
    if (disclaimer) disclaimer.hidden = true;
    if (modal) modal.style.display = 'flex';
    if (currentCheckoutOrderId) {
      const testClient = window.getMvpluxSupabaseClient?.();
      if (testClient) {
        testClient.rpc('record_test_order_event', {
          p_order_id: currentCheckoutOrderId,
          p_event_type: 'payment_instructions_opened'
        }).then(({ error }) => {
          if (error) showSiteMessage(`Could not record the test payment step. ${error.message || error}`, 'error');
        });
      }
    }
    return;
  }

  if (disclaimer) disclaimer.hidden = false;

  if (title) title.textContent = method.label;
  if (intro) intro.textContent = method.note;
  if (qr) {
    qr.innerHTML = method.phone
      ? `<strong>${method.phone}</strong><span>Use this phone number for Zelle.</span>`
      : method.qrImage
      ? `<img src="${method.qrImage}" alt="${method.label} QR code placeholder"><span>QR code placeholder</span>`
      : '<span>You may be redirected to complete payment securely.</span>';
  }
  if (note) {
    note.textContent = orderNumber
      ? `Please include order number ${orderNumber} in the payment note. Your order will be processed after payment is confirmed.`
      : 'Please include your order number in the payment note. Submit the order request first if you do not have one yet.';
  }
  if (link) {
    link.textContent = method.phone ? 'Copy Zelle Phone Number' : `Open ${method.label}`;
    link.disabled = !method.phone && isPlaceholderPaymentLink(method.payUrl);
    link.onclick = () => {
      if (method.phone) {
        copyZellePhoneNumber();
        return;
      }
      if (isPlaceholderPaymentLink(method.payUrl)) {
        showSiteMessage(`${method.label} payment link is a placeholder for now.`, 'info');
        return;
      }
      window.open(method.payUrl, '_blank', 'noopener,noreferrer');
    };
  }

  if (modal) modal.style.display = 'flex';
}

function checkoutModalMarkup() {
  const paymentMethods = Object.entries(checkoutPaymentMethods)
    .filter(([, method]) => method.active)
    .map(([key, method]) => paymentMethodButtonMarkup(key, method))
    .join('');
  const paymentActions = paymentActionButtonsMarkup();

  return `
    <div id="checkoutModal" class="modal">
      <div class="modal-content checkout-modal-content">
        <button class="close-modal" onclick="closeModals()">x</button>
        <h2>Checkout / Pay</h2>
        <div class="checkout-test-mode-note" data-checkout-test-warning hidden>TEST MODE — No real payment will be requested, sent, captured, or recorded.</div>
        <p class="checkout-intro">Choose how you want to pay. Zelle is preferred because there are no processing fees. PayPal, Venmo, and Cash App are accepted for convenience.</p>
        <p class="checkout-email-note">Please include your order number in the payment note. Your order will be processed after payment is confirmed.</p>
        <div id="checkoutAcceptedOfferNotice" class="checkout-accepted-offer-notice"></div>
        <div id="checkoutSuccessNotice" class="checkout-success-notice">
          <strong id="checkoutSuccessTitle">Order request sent</strong>
          <span id="checkoutSuccessMessage">Thank you. MVPLUXCREATIONS received your request. Use one of the payment options below and include your order number in the payment note.</span>
          <div id="checkoutOrderNumber" class="checkout-order-number"></div>
          <div class="payment-action-row">${paymentActions}</div>
          <button type="button" class="payment-completed-btn" onclick="markPaymentCompleted()">I've Completed Payment</button>
          <button type="button" class="checkout-btn" onclick="closeModals()">Close</button>
        </div>
        <div id="checkoutOrderSummary" class="checkout-order-summary"></div>
        <div class="payment-method-grid">${paymentMethods}</div>
        <div id="checkoutFeeSummary" class="checkout-fee-summary"></div>
        <form class="checkout-form" onsubmit="submitCheckoutRequest(event)">
          <input type="text" name="name" autocomplete="name" placeholder="Your name" required>
          <input type="email" name="email" autocomplete="email" placeholder="Your email" required>
          <input type="tel" name="phone" autocomplete="tel" placeholder="Phone number">
          <fieldset class="checkout-address-fields">
            <legend>Shipping address</legend>
            <input type="text" name="address1" autocomplete="shipping address-line1" placeholder="Street address" required>
            <input type="text" name="address2" autocomplete="shipping address-line2" placeholder="Apt, suite, unit (optional)">
            <div class="checkout-address-row">
              <input type="text" name="city" autocomplete="shipping address-level2" placeholder="City" required>
              <input type="text" name="state" autocomplete="shipping address-level1" placeholder="State" required>
              <input type="text" name="zip" autocomplete="shipping postal-code" placeholder="ZIP" required>
            </div>
            <input type="text" name="country" autocomplete="shipping country-name" placeholder="Country" value="United States">
          </fieldset>
          <textarea name="notes" placeholder="Order notes: size, deadline, special request"></textarea>
          <div class="checkout-discount-entry">
            <label for="checkoutDiscountCode">Discount code</label>
            <div><input id="checkoutDiscountCode" name="discountCode" type="text" autocomplete="off" placeholder="Enter code"><button id="applyCheckoutDiscount" type="button" onclick="applyCheckoutDiscount()">Apply</button></div>
            <p id="checkoutDiscountStatus" aria-live="polite"></p>
          </div>
          <label class="policy-check">
            <input type="checkbox" required>
            <span>I understand this is a custom-made item. Production starts after payment and design/order details are confirmed, and returns/cancellations are not accepted after production begins unless the item arrives damaged or MVPLUXCREATIONS made an error.</span>
          </label>
          <button type="submit" class="submit-btn">Submit Order Request</button>
        </form>
        <div class="checkout-policy-box">
          <strong>Returns & disclaimers</strong>
          <p>Custom/life-size standees are made to order. Returns or cancellations are not accepted after production begins unless MVPLUXCREATIONS made an error or the item arrives damaged. Report shipping damage quickly with photos of the package and product.</p>
          <p>Product images may be restored, enhanced, composited, or recreated for print. MVPLUXCREATIONS is not affiliated with any person, brand, team, league, studio, or rights holder unless clearly stated.</p>
          <p>Payment is confirmed manually. Keep your payment receipt until MVPLUXCREATIONS confirms the order.</p>
        </div>
      </div>
    </div>
  `;
}

function offerModalMarkup() {
  return `
    <div id="offerModal" class="modal">
      <div class="modal-content checkout-modal-content">
        <button class="close-modal" onclick="closeModals()">x</button>
        <h2>Make an Offer</h2>
        <p id="offerIntro">Enter the price you would like to offer. You can also add an optional comment.</p>
        <div class="offer-summary-layout">
          <div id="memberOfferThumbnailWrap" class="member-offer-thumbnail">
            <img id="offerThumbnail" src="" alt="Selected design preview">
          </div>
          <div id="guestOfferSummary" class="guest-offer-summary">
            <h3 id="guestOfferProduct"></h3>
            <p>Original size: <strong id="guestOfferOriginalSize"></strong></p>
            <p>Asking price: <strong id="guestOfferAskingPrice"></strong></p>
          </div>
          <dl id="memberOfferSummary" class="offer-summary" hidden>
            <div><dt>Product</dt><dd id="offerProduct"></dd></div>
            <div><dt>Design</dt><dd id="offerDesign"></dd></div>
            <div><dt>Description</dt><dd id="offerDescription"></dd></div>
            <div><dt>Selected size</dt><dd id="offerSelectedSize"></dd></div>
            <div><dt>Original height</dt><dd id="offerOriginalHeight"></dd></div>
            <div><dt>Background/display</dt><dd id="offerBackground"></dd></div>
            <div class="offer-size-status-row"><dt>Size selection</dt><dd id="offerSizeStatus"></dd></div>
            <div><dt>Normal/asking price</dt><dd id="offerAskingPrice"></dd></div>
          </dl>
        </div>
        <p id="offerMembershipNote" class="offer-membership-note"></p>
        <p id="guestOfferAccountLink" class="offer-membership-note">Want more sizes, backgrounds, and counteroffer options? <a href="signup.html">Create an account</a>.</p>
        <div id="memberOfferConfigurator" class="member-offer-configurator" hidden>
          <section>
            <h3>Size</h3>
            <div id="memberOfferSizeOptions" class="member-offer-size-options"></div>
          </section>
          <section id="memberOfferImageSection">
            <h3>Design / Background</h3>
            <div id="memberOfferImageOptions" class="member-offer-image-options"></div>
          </section>
          <section id="memberOfferFinishSection">
            <h3>Display Option</h3>
            <div id="memberOfferFinishOptions" class="member-offer-size-options"></div>
          </section>
        </div>
        <div id="offerMessageBoard" class="offer-message-board"></div>
        <a id="offerHistoryLink" class="offer-history-link" href="account.html#active-offers" hidden>View Offer History</a>
        <div id="offerSentActions" class="offer-sent-actions">
          <button type="button" class="checkout-btn" onclick="closeModals()">Close</button>
        </div>
        <form id="offerForm" class="checkout-form offer-form" onsubmit="submitOfferRequest(event)">
          <div class="offer-guest-fields">
            <label>Name<input type="text" name="name" autocomplete="name" placeholder="Your name"></label>
            <label>Email<input type="email" name="email" autocomplete="email" placeholder="Your email"></label>
          </div>
          <label>Offer amount
            <input type="text" name="amount" inputmode="decimal" placeholder="$ Offer amount" required>
          </label>
          <label>Comment (optional)
            <textarea name="comment" placeholder="Add a comment if you would like"></textarea>
          </label>
          <button class="submit-btn" type="submit">Send Offer</button>
        </form>
        <div id="buyerCounterTools" class="buyer-counter-tools">
          <button type="button" class="checkout-btn" onclick="acceptSellerCounterOffer()">Accept Counteroffer</button>
          <button type="button" class="checkout-btn" onclick="declineSellerCounterOffer()">Decline Counteroffer</button>
          <button type="button" class="submit-btn" onclick="showBuyerFinalCounter()">Send Another Counteroffer</button>
          <div id="buyerFinalCounterBox" class="buyer-final-counter-box">
            <input type="text" id="buyerFinalCounterAmount" placeholder="Your counteroffer amount">
            <textarea id="buyerFinalCounterMessage" placeholder="Comment (optional)"></textarea>
            <button type="button" class="submit-btn" onclick="sendBuyerFinalCounterOffer()">Send Counteroffer</button>
          </div>
        </div>
        <button id="continueOfferPayment" type="button" class="submit-btn" onclick="continueAcceptedOfferPayment()" hidden>Continue to Payment</button>
      </div>
    </div>
  `;
}

function buyModalMarkup() {
  return `
    <div id="buyModal" class="modal">
      <div class="modal-content">
        <button class="close-modal" onclick="closeModals()">x</button>
        <img id="modalImage" src="" alt="Product preview">
        <h2 id="modalTitle">Standee</h2>
        <p id="modalPrice">$0.00</p>
        <button class="checkout-btn" onclick="openCheckout()">Continue to Checkout</button>
      </div>
    </div>
  `;
}

function ensureCommerceModals() {
  if (!document.getElementById('buyModal')) {
    document.body.insertAdjacentHTML('beforeend', buyModalMarkup());
  }
  if (!document.getElementById('checkoutModal')) {
    document.body.insertAdjacentHTML('beforeend', checkoutModalMarkup());
  }
  if (!document.getElementById('offerModal')) {
    document.body.insertAdjacentHTML('beforeend', offerModalMarkup());
  }
  if (!document.getElementById('paymentOptionModal')) {
    document.body.insertAdjacentHTML('beforeend', paymentModalMarkup());
  }
}

function updateCheckoutDisplay() {
  const summary = document.getElementById('checkoutOrderSummary');
  const feeSummary = document.getElementById('checkoutFeeSummary');
  const acceptedNotice = document.getElementById('checkoutAcceptedOfferNotice');
  const successNotice = document.getElementById('checkoutSuccessNotice');
  const successMessage = document.getElementById('checkoutSuccessMessage');
  const successTitle = document.getElementById('checkoutSuccessTitle');
  const selectedMethod = currentCheckoutPaymentMethod || 'zelle';
  const items = getCheckoutItems();
  const receipt = successNotice?.dataset.sent ? checkoutReceiptState : null;
  const subtotal = receipt?.originalAmount ?? getCheckoutSubtotal();
  const totals = calculateCustomerPaidTotal(subtotal, selectedMethod);
  const displayedDiscount = receipt?.discount || checkoutDiscountState;
  const discountAmount = Math.min(totals.subtotal, Math.max(0, Number(displayedDiscount?.amount) || 0));
  const finalTotal = receipt?.finalAmount ?? Math.max(0, totals.total - discountAmount);
  const acceptedOfferItem = items.find((item) => String(item.name || '').includes('Accepted Offer'));
  const testWarning = document.querySelector('[data-checkout-test-warning]');
  if (testWarning) testWarning.hidden = !checkoutIsTestRecord();

  if (acceptedNotice) {
    acceptedNotice.style.display = acceptedOfferItem ? 'block' : 'none';
    acceptedNotice.innerHTML = acceptedOfferItem
      ? checkoutIsTestRecord()
        ? '<strong>TEST offer accepted</strong><span>Continue through the simulation only. Do not send money.</span>'
        : '<strong>Offer accepted</strong><span>Your offer has been accepted. Complete payment to confirm your order.</span>'
      : '';
  }

  if (successNotice && !successNotice.dataset.sent) {
    successNotice.style.display = 'none';
  }
  if (successMessage) {
    successMessage.textContent = currentCheckoutOfferId
      ? checkoutIsTestRecord()
        ? 'Test payment details saved. Use only the simulated payment controls.'
        : 'Your accepted offer is ready. Choose a payment method, then report the payment for Admin confirmation.'
      : checkoutIsTestRecord()
        ? 'Test order received. Do not send money; use only the simulated payment controls.'
        : 'Thank you. MVPLUXCREATIONS received your request. Use one of the payment options below and include your order number in the payment note.';
  }
  if (successTitle) successTitle.textContent = currentCheckoutOfferId ? 'Offer accepted' : 'Order request sent';

  if (summary) {
    summary.innerHTML = items.length
      ? items.map((item) => `<div><span>${item.name}</span><strong>${formatMoney(Number(item.price) || 0)}</strong></div>`).join('')
      : '<p>No item selected yet.</p>';
  }

  if (feeSummary) {
    feeSummary.innerHTML = `
      <div><span>Original price</span><strong>${formatMoney(totals.subtotal)}</strong></div>
      ${displayedDiscount ? `<div><span>Discount code: ${escapeOfferText(displayedDiscount.code)}</span><strong>-${formatMoney(discountAmount)}</strong></div>` : ''}
      <div><span>Shipping</span><strong>Free</strong></div>
      <div class="checkout-total-line"><span>Final price</span><strong>${formatMoney(finalTotal)}</strong></div>
      <p>${checkoutIsTestRecord() ? 'TEST MODE — no real payment will be requested.' : totals.method.note}</p>
    `;
  }
}

function openCheckout() {
  ensureCommerceModals();
  const checkoutModal = document.getElementById('checkoutModal');
  updateCheckoutDisplay();
  if (checkoutModal) checkoutModal.style.display = 'flex';
}

async function submitCheckoutRequest(event) {
  event.preventDefault();
  updateCheckoutDisplay();
  const form = event.currentTarget;
  const items = getCheckoutItems();
  if (!items.length) {
    showSiteMessage('Please choose an item before sending an order request.', 'error');
    return;
  }

  const client = getCommerceClient();
  if (!client) return;

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = 'Sending...';

  const methodKey = currentCheckoutPaymentMethod || 'zelle';
  const totals = calculateCustomerPaidTotal(getCheckoutSubtotal(), methodKey);
  const user = await getCommerceUser(client);
  const orderNumber = createOrderNumber();
  const customerNotes = formValue(form, 'notes');

  const shippingAddress = {
      address1: formValue(form, 'address1'),
      address2: formValue(form, 'address2'),
      city: formValue(form, 'city'),
      state: formValue(form, 'state'),
      zip: formValue(form, 'zip'),
      country: formValue(form, 'country') || 'United States'
  };
  const orderItems = items.map((item) => ({
      name: item.name,
      price: Number(item.price) || 0,
      image: item.image || '',
      category: item.category || getCurrentCheckoutCategory(),
      product_slug: item.productSlug || '',
      selected_height: Number(item.selectedHeight) || getPriceSettingsForBuilder().fullHeight,
      finish_extra: Number(item.finishExtra) || 0
    }));

  const commonNotes = [`Order number: ${orderNumber}`, customerNotes ? `Customer notes: ${customerNotes}` : ''].filter(Boolean).join('\n');
  let data;
  let error;
  if (currentCheckoutOfferId) {
    const response = await client.rpc('prepare_offer_payment', {
      p_offer_id: currentCheckoutOfferId,
      p_customer_name: formValue(form, 'name') || user?.user_metadata?.screen_name || 'Customer',
      p_customer_email: formValue(form, 'email') || user?.email || '',
      p_customer_phone: formValue(form, 'phone') || null,
      p_shipping_address: shippingAddress,
      p_items: orderItems,
      p_payment_method: totals.method.label,
      p_notes: commonNotes
    });
    data = response.data;
    error = response.error;
  } else {
    const response = await client.rpc('submit_order_request', {
      p_customer_name: formValue(form, 'name') || user?.user_metadata?.screen_name || 'Customer',
      p_customer_email: formValue(form, 'email') || user?.email || '',
      p_customer_phone: formValue(form, 'phone') || null,
      p_shipping_address: shippingAddress,
      p_items: orderItems,
      p_payment_method: totals.method.label,
      p_original_amount: Number(totals.subtotal.toFixed(2)),
      p_notes: commonNotes,
      p_discount_code: formValue(form, 'discountCode') || null,
      p_is_negotiated_offer: false,
      p_is_test: checkoutIsTestRecord()
    });
    data = response.data;
    error = response.error;
  }
  submitButton.disabled = false;
  submitButton.textContent = 'Submit Order Request';

  if (error) {
    showSiteMessage(`Could not send the order request yet. Please try again or contact ${supportEmail}. ${error.message || error}`, 'error');
    return;
  }

  const successNotice = document.getElementById('checkoutSuccessNotice');
  const orderNumberEl = document.getElementById('checkoutOrderNumber');
  currentCheckoutOrderNumber = orderNumber;
  currentCheckoutOrderId = data?.order_id || '';
  checkoutReceiptState = {
    originalAmount: Number(data?.original_amount ?? totals.subtotal),
    discount: data?.discount_code ? { code: data.discount_code, amount: Number(data.discount_amount) || 0 } : null,
    finalAmount: Number(data?.final_amount ?? totals.total)
  };
  if (successNotice) {
    successNotice.dataset.sent = 'true';
    successNotice.style.display = 'grid';
  }
  if (orderNumberEl) {
    orderNumberEl.textContent = checkoutIsTestRecord()
      ? `TEST order number: ${orderNumber}. No real payment should be sent.`
      : `Order number: ${orderNumber}. Include this in the payment note.`;
  }
  form.reset();
  cart = [];
  cartTotal = 0;
  currentBuyNowItem = null;
  checkoutDiscountState = data?.discount_code ? {
    code: data.discount_code,
    amount: Number(data.discount_amount) || 0,
    final: Number(data.final_amount) || 0
  } : null;
  updateCart();
  updateCheckoutDisplay();
}

function moneyFromText(value) {
  const amount = parseFloat(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(amount) ? amount : 0;
}

function commentFromOfferDetails(message) {
  const commentLine = String(message || '').split('\n').find((line) => line.startsWith('Message:'));
  return commentLine ? commentLine.slice('Message:'.length).trim() : '';
}

function escapeOfferText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function offerMessageMarkup(type, title, body) {
  return `
    <div class="offer-message offer-message-${type}">
      <strong>${escapeOfferText(title)}</strong>
      <p>${escapeOfferText(body)}</p>
    </div>
  `;
}

function updateOfferSummaryDisplay() {
  if (!activeOfferState) return;
  const values = {
    offerDesign: activeOfferState.designLabel,
    offerSelectedSize: activeOfferState.sizeLabel,
    offerBackground: activeOfferState.backgroundLabel,
    offerSizeStatus: activeOfferState.sizeStatus,
    offerAskingPrice: activeOfferState.askingPrice ? formatMoney(activeOfferState.askingPrice) : 'Enter a valid size'
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value || 'Not specified';
  });
  const thumbnail = document.getElementById('offerThumbnail');
  if (thumbnail && activeOfferState.thumbnailPath) {
    thumbnail.src = activeOfferState.thumbnailPath;
    thumbnail.alt = `${activeOfferState.designLabel || 'Selected design'} preview`;
  }
}

function selectedMemberFinishOption() {
  return activeOfferState?.finishOptions?.[activeOfferState.selectedFinishIndex] || {
    label: 'Back Stand Included',
    extra: 0
  };
}

function refreshMemberOfferPrice() {
  if (!activeOfferState?.memberUser) return;
  const height = Number(activeOfferState.selectedHeight) || 0;
  const basePrice = calculateCutoutPrice(height, activeOfferState.sourceBuilder);
  const finish = selectedMemberFinishOption();
  activeOfferState.askingPrice = basePrice ? basePrice + Number(finish.extra || 0) : 0;
  activeOfferState.backgroundLabel = [activeOfferState.designLabel, finish.label]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' · ');
  activeOfferState.validSelection = Boolean(height && activeOfferState.askingPrice);
  updateOfferSummaryDisplay();
  const sendButton = document.querySelector('#offerForm button[type="submit"]');
  if (sendButton) sendButton.disabled = !activeOfferState.validSelection;
}

function selectMemberOfferSize(mode) {
  if (!activeOfferState?.memberUser) return;
  const originalButton = document.querySelector('[data-member-offer-size="original"]');
  const customButton = document.querySelector('[data-member-offer-size="custom"]');
  const customBox = document.getElementById('memberOfferCustomSizeBox');
  originalButton?.classList.toggle('active', mode === 'original');
  customButton?.classList.toggle('active', mode === 'custom');
  if (customBox) customBox.hidden = mode !== 'custom';

  if (mode === 'custom') {
    activeOfferState.sizeStatus = 'Custom size selected';
    updateMemberOfferCustomSize(document.getElementById('memberOfferCustomHeight')?.value || '');
    document.getElementById('memberOfferCustomHeight')?.focus();
    return;
  }
  activeOfferState.selectedHeight = activeOfferState.originalHeight;
  activeOfferState.sizeLabel = formatHeight(activeOfferState.originalHeight);
  activeOfferState.sizeStatus = 'Original size selected';
  refreshMemberOfferPrice();
}

function updateMemberOfferCustomSize(value) {
  if (!activeOfferState?.memberUser) return;
  const height = parseHeightToInches(value);
  activeOfferState.selectedHeight = height;
  activeOfferState.sizeLabel = height ? formatHeight(height) : 'Enter a valid custom size';
  activeOfferState.sizeStatus = 'Custom size selected';
  refreshMemberOfferPrice();
}

function selectMemberOfferImage(index) {
  if (!activeOfferState?.memberUser) return;
  const option = activeOfferState.imageOptions?.[index];
  if (!option) return;
  activeOfferState.selectedImageIndex = index;
  activeOfferState.designLabel = option.label;
  activeOfferState.thumbnailPath = option.image;
  document.querySelectorAll('[data-member-offer-image]').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.memberOfferImage) === index);
  });
  refreshMemberOfferPrice();
}

function selectMemberOfferFinish(index) {
  if (!activeOfferState?.memberUser || !activeOfferState.finishOptions?.[index]) return;
  activeOfferState.selectedFinishIndex = index;
  document.querySelectorAll('[data-member-offer-finish]').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.memberOfferFinish) === index);
  });
  refreshMemberOfferPrice();
}

function renderMemberOfferConfigurator() {
  if (!activeOfferState?.memberUser) return;
  const configurator = document.getElementById('memberOfferConfigurator');
  const sizeOptions = document.getElementById('memberOfferSizeOptions');
  const imageOptions = document.getElementById('memberOfferImageOptions');
  const finishOptions = document.getElementById('memberOfferFinishOptions');
  const imageSection = document.getElementById('memberOfferImageSection');
  const finishSection = document.getElementById('memberOfferFinishSection');
  if (!configurator || !sizeOptions || !imageOptions || !finishOptions) return;

  sizeOptions.innerHTML = `
    <button type="button" class="${activeOfferState.sizeStatus !== 'Custom size selected' ? 'active' : ''}" data-member-offer-size="original" onclick="selectMemberOfferSize('original')">Original ${escapeOfferText(formatHeight(activeOfferState.originalHeight))}</button>
    ${activeOfferState.supportsCustomSize ? `<button type="button" class="${activeOfferState.sizeStatus === 'Custom size selected' ? 'active' : ''}" data-member-offer-size="custom" onclick="selectMemberOfferSize('custom')">Custom Size</button>` : ''}
    ${activeOfferState.supportsCustomSize ? `<div id="memberOfferCustomSizeBox" class="member-offer-custom-size" ${activeOfferState.sizeStatus === 'Custom size selected' ? '' : 'hidden'}><input id="memberOfferCustomHeight" type="text" value="${activeOfferState.sizeStatus === 'Custom size selected' ? escapeOfferText(activeOfferState.sizeLabel) : ''}" placeholder="Type height: 5'8 or 68" oninput="updateMemberOfferCustomSize(this.value)"></div>` : ''}
  `;

  imageOptions.innerHTML = activeOfferState.imageOptions.map((option, index) => `
    <button type="button" class="${index === activeOfferState.selectedImageIndex ? 'active' : ''}" data-member-offer-image="${index}" onclick="selectMemberOfferImage(${index})">
      <img src="${escapeOfferText(option.image)}" alt="">
      <span>${escapeOfferText(option.label)}</span>
    </button>
  `).join('');
  imageSection.hidden = activeOfferState.imageOptions.length <= 1;

  finishOptions.innerHTML = activeOfferState.finishOptions.map((option, index) => `
    <button type="button" class="${index === activeOfferState.selectedFinishIndex ? 'active' : ''}" data-member-offer-finish="${index}" onclick="selectMemberOfferFinish(${index})">${escapeOfferText(option.label)}</button>
  `).join('');
  finishSection.hidden = activeOfferState.finishOptions.length <= 1;
  configurator.hidden = false;
  refreshMemberOfferPrice();
}

function offerExistingStateMarkup() {
  if (!activeOfferState?.buyerOffer) return '';
  const statusLabels = {
    pending: 'Pending review',
    sent: 'Pending review',
    countered: 'Admin sent a counteroffer',
    buyer_countered: 'Your counteroffer is awaiting Admin’s final decision',
    accepted: 'Accepted — awaiting payment',
    accepted_awaiting_payment: 'Accepted — awaiting payment',
    payment_submitted: 'Payment submitted — awaiting confirmation',
    paid: 'Completed / paid',
    archived: 'Archived',
    declined: 'Declined'
  };
  return `
    <div class="offer-existing-state">
      <div><span>Original asking price</span><strong>${escapeOfferText(activeOfferState.originalAskingPrice ? formatMoney(activeOfferState.originalAskingPrice) : formatMoney(activeOfferState.askingPrice))}</strong></div>
      <div><span>Your original offer</span><strong>${escapeOfferText(formatMoney(activeOfferState.buyerOffer.amount))}</strong></div>
      ${activeOfferState.buyerOffer.message ? `<div><span>Your message</span><strong>${escapeOfferText(activeOfferState.buyerOffer.message)}</strong></div>` : ''}
      ${activeOfferState.sellerCounter ? `<div><span>Admin counteroffer</span><strong>${escapeOfferText(formatMoney(activeOfferState.sellerCounter.amount))}</strong></div>` : ''}
      ${activeOfferState.sellerCounter?.message ? `<div><span>Admin message</span><strong>${escapeOfferText(activeOfferState.sellerCounter.message)}</strong></div>` : ''}
      ${activeOfferState.buyerFinalCounter ? `<div><span>Your latest counteroffer</span><strong>${escapeOfferText(formatMoney(activeOfferState.buyerFinalCounter.amount))}</strong></div>` : ''}
      <div><span>Status</span><strong>${escapeOfferText(statusLabels[activeOfferState.status] || activeOfferState.status || 'Pending review')}</strong></div>
      <div><span>Last updated</span><strong>${escapeOfferText(activeOfferState.lastUpdated ? new Date(activeOfferState.lastUpdated).toLocaleString() : 'Not recorded')}</strong></div>
    </div>
  `;
}

function updateOfferBoard(productName = activeOfferState?.productName || '', signedInName = getSignedInName()) {
  const membershipNote = document.getElementById('offerMembershipNote');
  const board = document.getElementById('offerMessageBoard');
  const form = document.getElementById('offerForm');
  const guestFields = form?.querySelector('.offer-guest-fields');
  const buyerTools = document.getElementById('buyerCounterTools');
  const sentActions = document.getElementById('offerSentActions');
  const configurator = document.getElementById('memberOfferConfigurator');
  const thumbnailWrap = document.getElementById('memberOfferThumbnailWrap');
  const intro = document.getElementById('offerIntro');
  const historyLink = document.getElementById('offerHistoryLink');
  const continuePayment = document.getElementById('continueOfferPayment');
  const summaryLayout = document.querySelector('.offer-summary-layout');
  const isMember = Boolean(activeOfferState?.memberUser);

  if (membershipNote) {
    membershipNote.textContent = isMember
      ? 'Signed-in members can receive and send counteroffers.'
      : 'No account is required to submit an offer.';
  }
  if (intro) {
    intro.textContent = isMember
      ? 'Choose your size and display option, then enter the price you would like to offer.'
      : 'Enter the price you would like to offer. You can also add an optional comment.';
  }
  if (thumbnailWrap) thumbnailWrap.hidden = false;
  summaryLayout?.classList.toggle('member-mode', isMember);
  const guestSummary = document.getElementById('guestOfferSummary');
  const memberSummary = document.getElementById('memberOfferSummary');
  const accountLink = document.getElementById('guestOfferAccountLink');
  if (guestSummary) guestSummary.hidden = isMember;
  if (memberSummary) memberSummary.hidden = !isMember;
  if (accountLink) accountLink.hidden = isMember;

  if (guestFields) {
    guestFields.style.display = isMember ? 'none' : 'grid';
    guestFields.querySelectorAll('input').forEach((input) => {
      input.required = !isMember && ['name', 'email'].includes(input.name);
    });
  }

  if (board) {
    const messages = [];
    if (activeOfferState?.buyerOffer && isMember) {
      messages.push(offerExistingStateMarkup());
    } else if (activeOfferState?.buyerOffer) {
      messages.push(offerMessageMarkup('buyer', 'Buyer offer', `${formatMoney(activeOfferState.buyerOffer.amount)}${activeOfferState.buyerOffer.message ? ` - ${activeOfferState.buyerOffer.message}` : ''}`));
      if (activeOfferState.status === 'sent' || activeOfferState.status === 'pending') {
        messages.push(offerMessageMarkup('system', 'Offer sent', 'Thanks, we received your offer. MVPLUXCREATIONS will review it.'));
      }
    }
    board.innerHTML = messages.join('');
    board.style.display = messages.length ? 'grid' : 'none';
  }

  if (form) form.style.display = activeOfferState?.buyerOffer ? 'none' : 'grid';
  if (configurator) configurator.hidden = !isMember || Boolean(activeOfferState?.buyerOffer);
  if (buyerTools) buyerTools.style.display = isMember && activeOfferState?.sellerCounter && activeOfferState?.status === 'countered' ? 'grid' : 'none';
  if (sentActions) sentActions.style.display = activeOfferState?.status === 'sent' || activeOfferState?.status === 'pending' ? 'flex' : 'none';
  if (historyLink) historyLink.hidden = !isMember || !activeOfferState?.buyerOffer;
  if (continuePayment) continuePayment.hidden = !isMember || !['accepted', 'accepted_awaiting_payment'].includes(activeOfferState?.status);
}

async function submitOfferRequest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const amount = moneyFromText(form.amount?.value);
  if (!amount) {
    showSiteMessage('Please enter a valid offer amount.', 'error');
    return;
  }

  const client = getCommerceClient();
  if (!client) return;

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = 'Sending...';
  const user = await getCommerceUser(client);

  if (user) {
    if (!activeOfferState?.validSelection) {
      submitButton.disabled = false;
      submitButton.textContent = 'Send Offer';
      showSiteMessage('Choose a valid available size before sending your offer.', 'error');
      return;
    }
    let existingOffer;
    try {
      existingOffer = await findMemberOfferForSelection(
        client,
        user.id,
        activeOfferState.productName,
        activeOfferState.sizeLabel,
        activeOfferState.designLabel,
        activeOfferState.backgroundLabel
      );
    } catch (error) {
      submitButton.disabled = false;
      submitButton.textContent = 'Send Offer';
      showSiteMessage(`Could not verify your current offers. ${error.message || error}`, 'error');
      return;
    }
    if (existingOffer && ['pending', 'countered', 'buyer_countered', 'accepted', 'accepted_awaiting_payment', 'payment_submitted'].includes(existingOffer.status)) {
      submitButton.disabled = false;
      submitButton.textContent = 'Send Offer';
      applyExistingMemberOffer(existingOffer);
      showSiteMessage('You already have an active offer for this product and size.', 'error');
      return;
    }
  }

  activeOfferState = activeOfferState || { productName: document.getElementById('offerProduct')?.textContent || 'Selected item' };
  activeOfferState.buyerOffer = {
    amount,
    message: form.comment?.value?.trim() || '',
    name: user?.user_metadata?.screen_name || formValue(form, 'name') || getSignedInName() || 'Customer',
    email: formValue(form, 'email') || user?.email || ''
  };
  activeOfferState.status = 'pending';
  updateOfferBoard();

  const offerDetails = [
    activeOfferState.designLabel ? `Design: ${activeOfferState.designLabel}` : '',
    activeOfferState.thumbnailPath ? `Image: ${activeOfferState.thumbnailPath}` : '',
    activeOfferState.description ? `Description: ${activeOfferState.description}` : '',
    activeOfferState.sizeLabel ? `Selected size: ${activeOfferState.sizeLabel}` : '',
    activeOfferState.originalHeight ? `Original height: ${formatHeight(activeOfferState.originalHeight)}` : '',
    activeOfferState.backgroundLabel ? `Background: ${activeOfferState.backgroundLabel}` : '',
    activeOfferState.sizeStatus ? `Size status: ${activeOfferState.sizeStatus}` : '',
    activeOfferState.askingPrice ? `Asking price: ${formatMoney(activeOfferState.askingPrice)}` : '',
    activeOfferState.buyerOffer.message ? `Message: ${activeOfferState.buyerOffer.message}` : ''
  ].filter(Boolean).join('\n');

  const payload = {
    product_name: activeOfferState.productName || 'Selected item',
    customer_id: user?.id || null,
    customer_name: activeOfferState.buyerOffer.name,
    customer_email: activeOfferState.buyerOffer.email,
    amount: Number(amount.toFixed(2)),
    message: offerDetails || null,
    status: 'pending'
  };
  let data;
  let error;
  if (storefrontTestMode.enabled) {
    const response = await client.rpc('submit_test_offer', {
      p_product_name: payload.product_name,
      p_customer_name: payload.customer_name,
      p_customer_email: payload.customer_email,
      p_amount: payload.amount,
      p_message: payload.message
    });
    data = response.data;
    error = response.error;
  } else {
    const insertQuery = client.from('offers').insert(payload);
    const response = user
      ? await insertQuery.select('id, status, seller_counter_amount, seller_counter_message, buyer_final_amount, buyer_final_message').single()
      : await insertQuery;
    data = response.data;
    error = response.error;
  }

  submitButton.disabled = false;
  submitButton.textContent = 'Send Offer';

  if (error) {
    showSiteMessage(`Could not send the offer yet. Please try again or contact ${supportEmail}. ${error.message || error}`, 'error');
    activeOfferState.buyerOffer = null;
    activeOfferState.status = 'draft';
    updateOfferBoard();
    return;
  }

  if (data?.id) activeOfferState.id = data.id;
  activeOfferState.isTest = Boolean(data?.is_test || storefrontTestMode.enabled);
  activeOfferState.status = 'sent';
  updateOfferBoard();
}

async function loadLatestMemberOffer(productName) {
  const client = window.getMvpluxSupabaseClient?.();
  const user = await getCommerceUser(client);
  if (!client || !activeOfferState || activeOfferState.productName !== productName) return;
  if (!user) {
    configureGuestOfferDefaults();
    updateOfferBoard(productName, false);
    return;
  }
  activeOfferState.memberUser = user;
  renderMemberOfferConfigurator();
  updateOfferBoard(productName, true);
  const { data, error } = await client
    .from('offers')
    .select('*')
    .eq('customer_id', user.id)
    .eq('product_name', productName)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error || !activeOfferState || activeOfferState.productName !== productName) return;
  const activeStatuses = new Set(['pending', 'countered', 'buyer_countered', 'accepted', 'accepted_awaiting_payment', 'payment_submitted']);
  const existing = (data || []).find((offer) => {
    if (!activeStatuses.has(offer.status)) return false;
    const details = offerDetailsFromMessage(offer.message);
    return (!details['selected size'] || details['selected size'] === activeOfferState.sizeLabel)
      && (!details.design || details.design === activeOfferState.designLabel)
      && (!details.background || details.background === activeOfferState.backgroundLabel);
  });
  if (existing) applyExistingMemberOffer(existing);
}

function configureGuestOfferDefaults() {
  if (!activeOfferState) return;
  const originalHeight = Number(activeOfferState.originalHeight) || Number(activeOfferState.selectedHeight) || 0;
  if (originalHeight) {
    activeOfferState.selectedHeight = originalHeight;
    activeOfferState.sizeLabel = formatHeight(originalHeight);
    activeOfferState.sizeStatus = 'Original size selected';
    const originalPrice = calculateCutoutPrice(originalHeight, activeOfferState.sourceBuilder);
    if (originalPrice) activeOfferState.askingPrice = originalPrice;
  }
  activeOfferState.backgroundLabel = activeOfferState.backgroundLabel || selectedMemberFinishOption().label || 'Standard display';
  activeOfferState.validSelection = Boolean(activeOfferState.sizeLabel && activeOfferState.askingPrice);
  const guestOriginalSize = document.getElementById('guestOfferOriginalSize');
  const guestAskingPrice = document.getElementById('guestOfferAskingPrice');
  if (guestOriginalSize) guestOriginalSize.textContent = activeOfferState.sizeLabel || 'Original size';
  if (guestAskingPrice) guestAskingPrice.textContent = activeOfferState.askingPrice ? formatMoney(activeOfferState.askingPrice) : 'Shown price';
  updateOfferSummaryDisplay();
}

function offerDetailsFromMessage(message) {
  const details = {};
  String(message || '').split('\n').forEach((line) => {
    const separator = line.indexOf(':');
    if (separator < 0) return;
    details[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
  });
  return details;
}

async function findMemberOfferForSelection(client, userId, productName, sizeLabel, designLabel, backgroundLabel) {
  const { data, error } = await client
    .from('offers')
    .select('*')
    .eq('customer_id', userId)
    .eq('product_name', productName)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  const activeStatuses = new Set(['pending', 'countered', 'buyer_countered', 'accepted', 'accepted_awaiting_payment', 'payment_submitted']);
  return (data || []).find((offer) => {
    if (!activeStatuses.has(offer.status)) return false;
    const details = offerDetailsFromMessage(offer.message);
    return details['selected size'] === sizeLabel
      && (!details.design || details.design === (designLabel || ''))
      && (!details.background || details.background === (backgroundLabel || ''));
  }) || null;
}

function applyExistingMemberOffer(offer) {
  if (!activeOfferState || !offer) return;
  const details = offerDetailsFromMessage(offer.message);
  activeOfferState.id = offer.id;
  activeOfferState.buyerOffer = { amount: Number(offer.amount), message: details.message || '' };
  activeOfferState.sellerCounter = offer.seller_counter_amount
    ? { amount: Number(offer.seller_counter_amount), message: offer.seller_counter_message || '' }
    : null;
  activeOfferState.buyerFinalCounter = offer.buyer_final_amount
    ? { amount: Number(offer.buyer_final_amount), message: offer.buyer_final_message || '' }
    : null;
  activeOfferState.status = offer.status || 'pending';
  activeOfferState.isTest = Boolean(offer.is_test);
  activeOfferState.lastUpdated = offer.updated_at || offer.created_at;
  activeOfferState.originalAskingPrice = moneyFromText(details['asking price']) || activeOfferState.askingPrice;
  activeOfferState.designLabel = details.design || activeOfferState.designLabel;
  activeOfferState.description = details.description || activeOfferState.description;
  activeOfferState.sizeLabel = details['selected size'] || activeOfferState.sizeLabel;
  activeOfferState.originalHeight = parseHeightToInches(details['original height']) || activeOfferState.originalHeight;
  activeOfferState.backgroundLabel = details.background || activeOfferState.backgroundLabel;
  activeOfferState.thumbnailPath = details.image || activeOfferState.thumbnailPath;
  updateOfferSummaryDisplay();
  updateOfferBoard(activeOfferState.productName, true);
}

function continueAcceptedOfferPayment() {
  if (!activeOfferState || !['accepted', 'accepted_awaiting_payment'].includes(activeOfferState.status)) return;
  const acceptedAmount = activeOfferState.buyerFinalCounter?.amount
    || activeOfferState.sellerCounter?.amount
    || activeOfferState.buyerOffer?.amount;
  checkoutAcceptedOffer(activeOfferState.productName, acceptedAmount, activeOfferState.isTest);
}

async function resumeAcceptedOfferFromUrl() {
  const offerId = new URLSearchParams(window.location.search).get('resumeOffer');
  if (!offerId || !/^[0-9a-f-]{36}$/i.test(offerId)) return;
  const client = getCommerceClient();
  const user = await getCommerceUser(client);
  if (!client || !user) {
    window.location.assign('signin.html');
    return;
  }
  const { data: offer, error } = await client.from('offers').select('*').eq('id', offerId).maybeSingle();
  if (error || !offer) {
    showSiteMessage(error?.message || 'The accepted offer could not be loaded.', 'error');
    return;
  }
  if (!['accepted', 'accepted_awaiting_payment'].includes(offer.status)) return;
  const details = offerDetailsFromMessage(offer.message);
  activeOfferState = {
    id: offer.id,
    productName: offer.product_name,
    thumbnailPath: details.image || '',
    sizeLabel: details['selected size'] || details['original height'] || 'Original size',
    backgroundLabel: details.background || 'Standard display',
    buyerOffer: { amount: Number(offer.amount), message: details.message || '' },
    sellerCounter: offer.seller_counter_amount ? { amount: Number(offer.seller_counter_amount), message: offer.seller_counter_message || '' } : null,
    buyerFinalCounter: offer.buyer_final_amount ? { amount: Number(offer.buyer_final_amount), message: offer.buyer_final_message || '' } : null,
    status: offer.status,
    isTest: Boolean(offer.is_test),
    memberUser: user
  };
  continueAcceptedOfferPayment();
}

async function respondToSellerCounter(action, amount = null, message = '') {
  const client = getCommerceClient();
  if (!client || !activeOfferState?.id) {
    showSiteMessage('This member offer cannot be updated yet. Please reopen the offer and try again.', 'error');
    return false;
  }
  const { error } = await client.rpc('respond_to_member_offer', {
    p_offer_id: activeOfferState.id,
    p_action: action,
    p_amount: amount,
    p_message: message || null
  });
  if (error) {
    showSiteMessage(`Could not update the offer. ${error.message || error}`, 'error');
    return false;
  }
  activeOfferState.status = action === 'counter' ? 'buyer_countered' : action === 'accept' ? 'accepted_awaiting_payment' : 'declined';
  if (action === 'counter') activeOfferState.buyerFinalCounter = { amount, message };
  updateOfferBoard();
  return true;
}

async function acceptSellerCounterOffer() {
  if (!activeOfferState?.sellerCounter) return;
  await respondToSellerCounter('accept');
}

async function declineSellerCounterOffer() {
  if (!activeOfferState?.sellerCounter) return;
  await respondToSellerCounter('decline');
}

function showBuyerFinalCounter() {
  const box = document.getElementById('buyerFinalCounterBox');
  if (box) box.style.display = 'grid';
}

async function sendBuyerFinalCounterOffer() {
  const amount = moneyFromText(document.getElementById('buyerFinalCounterAmount')?.value);
  const message = document.getElementById('buyerFinalCounterMessage')?.value?.trim() || '';
  if (!amount) {
    showSiteMessage('Enter a valid final counter amount.', 'error');
    return;
  }

  if (await respondToSellerCounter('counter', amount, message)) {
    const box = document.getElementById('buyerFinalCounterBox');
    if (box) box.style.display = 'none';
  }
}

function openCustomForm() {
  window.location.href = 'custom-order.html';
}

function openFanRequest() {
  showSiteMessage('Fan request form will be added here.');
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

function getFanCardOptionsHref(card) {
  if (!card) return '';
  if (card.dataset.optionsHref) return card.dataset.optionsHref;

  if (card.classList.contains('wanted-card-1')) return 'sports-legends.html#selected-standee';
  if (card.classList.contains('wanted-card-2')) return 'movie-inspired.html#selected-standee';
  if (card.classList.contains('wanted-card-3')) return 'music-artists.html#selected-standee';
  if (card.classList.contains('wanted-card-4')) return 'dinosaur-cutouts.html#selected-standee';
  if (card.classList.contains('wanted-card-5')) return 'fan-inspired.html#selected-standee';

  const label = card.querySelector('.fan-gallery-label, h4')?.textContent?.toLowerCase() || '';
  if (label.includes('golden') || label.includes('hero')) return 'religious-cutouts.html#selected-standee';
  if (label.includes('dinosaur')) return 'dinosaur-cutouts.html#selected-standee';
  if (label.includes('vip') || label.includes('spotlight')) return 'music-artists.html#selected-standee';
  return 'fan-inspired.html#selected-standee';
}

function getFanCardTitle(card, fallback = 'Selected Standee') {
  return card?.querySelector?.('h4, .fan-gallery-label')?.textContent?.trim() || fallback;
}

function openFanCardOptions(source) {
  const card = source?.closest?.('.fan-vote-card, .fan-gallery-card');
  const href = getFanCardOptionsHref(card);
  if (href) window.location.href = href;
}

function bindFanCardCommerce() {
  if (document.body.dataset.fanCardCommerceReady) return;
  document.body.dataset.fanCardCommerceReady = 'true';

  document.addEventListener('click', (event) => {
    if (document.body.classList.contains('admin-anywhere-on')) return;

    const cartButton = event.target.closest?.('[data-wanted-cart], .fan-gallery-cart');
    if (cartButton) {
      const card = cartButton.closest('.fan-vote-card, .fan-gallery-card');
      event.preventDefault();
      event.stopImmediatePropagation();
      addToCart(cartButton.dataset.wantedCart || getFanCardTitle(card), getCurrentBasePrice(), getDisplayImageFrom(card));
      return;
    }

    if (event.target.closest?.('.fan-vote-action, .fan-gallery-vote, .fan-carousel-btn')) return;
    const card = event.target.closest?.('.fan-vote-card, .fan-gallery-card');
    if (!card) return;
    if (event.target.closest?.('button') && !event.target.closest?.('.fan-card-actions button:first-child')) return;
    if (!event.target.closest?.('.fan-card-stage, .fan-gallery-stage, .fan-card-actions button:first-child, .fan-gallery-card')) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    openFanCardOptions(card);
  }, true);
}

function getFanVoteStore() {
  try {
    return JSON.parse(localStorage.getItem('mvpluxFanVotes') || '{}');
  } catch (error) {
    return {};
  }
}

function getVoteDateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

const FAN_VOTE_WAIT_DAYS = 2;
const FAN_VOTE_WAIT_MS = FAN_VOTE_WAIT_DAYS * 24 * 60 * 60 * 1000;

function getVoteRecordTime(voteRecord) {
  if (!voteRecord || voteRecord === true) return 0;
  if (voteRecord.timestamp) return Number(voteRecord.timestamp) || 0;
  if (voteRecord.date) return new Date(`${voteRecord.date}T00:00:00`).getTime() || 0;
  return 0;
}

function getGuestVoteId() {
  let guestId = localStorage.getItem('mvpluxGuestVoteId');
  if (!guestId) {
    guestId = `guest-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    localStorage.setItem('mvpluxGuestVoteId', guestId);
  }
  return guestId;
}

function hasActiveFanVoteCooldown(voteRecord) {
  if (voteRecord === true) return false;
  const lastVoteTime = getVoteRecordTime(voteRecord);
  if (!lastVoteTime) return false;
  return Date.now() - lastVoteTime < FAN_VOTE_WAIT_MS;
}

function getCurrentBasePrice() {
  const settings = getPriceSettingsForBuilder();
  return calculateCutoutPrice(settings.fullHeight);
}

function saveFanVoteStore(votes) {
  localStorage.setItem('mvpluxFanVotes', JSON.stringify(votes));
}

function setFanVoteButtonState(button, voted) {
  if (!button) return;

  if (!button.dataset.originalHtml) {
    button.dataset.originalHtml = button.innerHTML;
  }

  button.classList.toggle('voted', voted);
  button.disabled = voted;

  if (voted) {
    button.textContent = 'Voted';
  } else {
    button.innerHTML = button.dataset.originalHtml;
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

async function logFanVote(voteId) {
  const client = window.getMvpluxSupabaseClient?.();
  if (!client) return;

  try {
    const { data } = await client.auth.getSession();
    const user = data?.session?.user;
    await client.from('fan_votes').insert({
      vote_id: voteId,
      customer_id: user?.id || null,
      guest_id: user?.id ? null : getGuestVoteId()
    });
  } catch (error) {
    console.warn('Fan vote log failed:', error);
  }
}

async function registerFanVote(voteId, button) {
  const votes = getFanVoteStore();

  if (hasActiveFanVoteCooldown(votes[voteId])) {
    setFanVoteButtonState(button, true);
    showSiteMessage('You already voted for this one. You can vote again after 2 days.');
    return;
  }

  votes[voteId] = {
    date: getVoteDateKey(),
    timestamp: Date.now(),
    guestId: getGuestVoteId()
  };
  saveFanVoteStore(votes);
  incrementVoteCount(voteId);
  logFanVote(voteId);

  document.querySelectorAll(`[data-vote-id="${voteId}"]`).forEach((matchingButton) => {
    setFanVoteButtonState(matchingButton, true);
  });

  showSiteMessage('Vote counted. Thanks for helping choose what comes next. You can vote again after 2 days.', 'success');
}

/* ---------------- PRODUCT FILTER ---------------- */
function filterProducts() {
  const searchInput = document.getElementById('searchInput');
  const categoryFilter = document.getElementById('categoryFilter');
  const products = [...document.querySelectorAll('.product-card')]
    .filter((product) => !product.closest('#homepageCategoryGrid'));

  if (!searchInput || !categoryFilter) return;

  const search = searchInput.value.toLowerCase();
  const category = categoryFilter.value;
  const directMatches = renderSearchResults(search);
  const showingDirectMatches = Boolean(search.trim() && directMatches.length);

  products.forEach(product => {
    const searchableText = [
      product.dataset.name || '',
      product.dataset.category || '',
      product.querySelector('.product-title-link')?.textContent || '',
      product.querySelector('.product-description')?.textContent || '',
      product.textContent || ''
    ].join(' ').toLowerCase();
    const productCategory = product.dataset.category || '';

    const matchesSearch = !search || searchableText.includes(search);
    const matchesCategory = category === 'all' || productCategory === category;

    product.style.display = !showingDirectMatches && matchesSearch && matchesCategory ? '' : 'none';
  });
}

function getDirectSearchItems() {
  const generalItems = typeof standeeCatalog === 'object' ? Object.entries(standeeCatalog).map(([slug, product]) => ({
    slug,
    name: product.name || product.title || slug,
    category: product.sport || product.category || 'Standee',
    description: product.description || '',
    image: product.options?.[0]?.image || product.image || '',
    url: `standee.html?item=${encodeURIComponent(slug)}`
  })) : [];

  const sportsItems = typeof sportsStandeeCatalog === 'object' ? Object.entries(sportsStandeeCatalog).map(([slug, product]) => ({
    slug,
    name: product.name || slug,
    category: product.sport || 'Sport Legend Standee',
    description: product.description || '',
    image: product.options?.[0]?.image || '',
    url: `sports-legends.html?player=${encodeURIComponent(slug)}`
  })) : [];

  const seen = new Set();
  return [...sportsItems, ...generalItems].filter((item) => {
    const key = `${item.name}|${item.category}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderSearchResults(search) {
  const results = document.getElementById('searchResults');
  if (!results) return [];

  const term = String(search || '').trim().toLowerCase();
  if (!term) {
    results.innerHTML = '';
    results.hidden = true;
    return [];
  }

  const matches = getDirectSearchItems()
    .filter((item) => `${item.name} ${item.category} ${item.description}`.toLowerCase().includes(term))
    .slice(0, 8);

  if (!matches.length) {
    results.innerHTML = '<p>No exact person yet. Try another name or a category.</p>';
    results.hidden = false;
    return [];
  }

  results.innerHTML = `
    <div class="search-result-heading">Direct matches</div>
    <div class="search-result-grid">
      ${matches.map((item) => `
        <a class="search-result-card" href="${item.url}">
          ${item.image ? `<img src="${item.image}" alt="${item.name}">` : ''}
          <span>
            <strong>${item.name}</strong>
            <small>${item.category}</small>
          </span>
        </a>
      `).join('')}
    </div>
  `;
  results.hidden = false;
  return matches;
}

function bindProductCarouselDragGuard() {
  document.querySelectorAll('.product-carousel-row').forEach((row) => {
    if (row.dataset.dragGuardReady) return;
    row.dataset.dragGuardReady = 'true';

    let startX = 0;
    let startY = 0;
    let dragged = false;

    row.addEventListener('pointerdown', (event) => {
      startX = event.clientX;
      startY = event.clientY;
      dragged = false;
    });

    row.addEventListener('pointermove', (event) => {
      if (Math.abs(event.clientX - startX) > 8 || Math.abs(event.clientY - startY) > 8) {
        dragged = true;
      }
    });

    row.addEventListener('click', (event) => {
      if (!dragged) return;
      const link = event.target.closest('a');
      if (!link) return;
      event.preventDefault();
      event.stopPropagation();
      dragged = false;
    }, true);
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
  button.textContent = showing ? '👁' : '🙈';
  button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
}

function isAdminSignedIn() {
  return false;
}

const ADMIN_VIEW_MODE_KEY = 'mvpluxAdminViewModeV2';

function adminArchitectureViewModesEnabled() {
  return window.mvpluxLiveAdminSettings?.adminArchitectureV2?.enabled === true;
}

function getAdminViewMode() {
  if (!adminArchitectureViewModesEnabled()) {
    return localStorage.getItem('mvpluxAdminAnywhere') === 'true' ? 'edit' : 'published';
  }
  const stored = localStorage.getItem(ADMIN_VIEW_MODE_KEY);
  if (['edit', 'preview', 'published'].includes(stored)) return stored;
  return localStorage.getItem('mvpluxAdminAnywhere') === 'true' ? 'edit' : 'preview';
}

function applyRequestedAdminViewMode() {
  if (localStorage.getItem('mvpluxIsAdminApproved') !== 'true') return;
  const requested = new URLSearchParams(window.location.search).get('adminView');
  if (!['edit', 'preview', 'published'].includes(requested)) return;
  localStorage.setItem(ADMIN_VIEW_MODE_KEY, requested);
  if (requested === 'edit') localStorage.setItem('mvpluxAdminAnywhere', 'true');
  else localStorage.removeItem('mvpluxAdminAnywhere');
}

function isInlineAdminEditingEnabled() {
  return getAdminViewMode() === 'edit';
}

function isPrivateAdminPreviewEnabled() {
  return adminArchitectureViewModesEnabled()
    && localStorage.getItem('mvpluxIsAdminApproved') === 'true'
    && getAdminViewMode() === 'preview';
}

function shouldUsePrivateAdminState() {
  return isInlineAdminEditingEnabled() || isPrivateAdminPreviewEnabled();
}

function getInlineAdminLabel() {
  return localStorage.getItem('mvpluxSignedInName') || 'Admin';
}

function isCustomerSignedIn() {
  return localStorage.getItem('mvpluxCustomerSignedIn') === 'true';
}

function cleanStaleAdminState() {
  localStorage.removeItem('mvpluxAdminSignedIn');
  if (!localStorage.getItem('mvpluxIsAdminApproved')) {
    localStorage.removeItem('mvpluxAdminAnywhere');
  }
  if (!isCustomerSignedIn() && localStorage.getItem('mvpluxSignedInName') === 'Admin') {
    localStorage.removeItem('mvpluxSignedInName');
  }
}

async function signOutCurrentUser() {
  const client = getSupabaseClient();
  if (client?.auth) {
    try {
      await client.auth.signOut();
    } catch (error) {
      console.warn('Supabase sign-out failed:', error);
    }
  }

  localStorage.removeItem('mvpluxAdminSignedIn');
  localStorage.removeItem('mvpluxAdminAnywhere');
  localStorage.removeItem('mvpluxIsAdminApproved');
  localStorage.removeItem('mvpluxSignedInName');
  localStorage.removeItem('mvpluxCustomerSignedIn');
  window.location.href = 'index.html';
}

function signOutAdmin() {
  signOutCurrentUser();
}

function getSignedInName() {
  if (isCustomerSignedIn()) return localStorage.getItem('mvpluxSignedInName') || 'Guest';
  return '';
}

function getSupabaseClient() {
  return typeof window.getMvpluxSupabaseClient === 'function' ? window.getMvpluxSupabaseClient() : null;
}

async function canCurrentUserUseAdminMode() {
  return checkCurrentUserAdminAccess({ showMessages: true });
}

function logAdminInitializationException(section, error) {
  const stack = String(error?.stack || '');
  const location = stack.match(/((?:https?:\/\/|file:\/\/|\/)[^\s():]+):(\d+):(\d+)/);
  console.error('[ADMIN] Initialization exception', {
    section,
    file: location?.[1] || 'unknown',
    line: location ? Number(location[2]) : 'unknown',
    column: location ? Number(location[3]) : 'unknown',
    type: error?.name || error?.constructor?.name || typeof error,
    message: error?.message || String(error),
    stack
  });
}

async function checkCurrentUserAdminAccess(options = {}) {
  console.log('[ADMIN] Authorization started');
  try {
    const showMessages = options.showMessages !== false;
    const client = getSupabaseClient();
    if (!client?.auth) {
      if (showMessages) showSiteMessage('Admin mode is still loading. Try again in a moment.', 'error');
      return false;
    }

    const { data: sessionData } = await client.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) {
      localStorage.removeItem('mvpluxIsAdminApproved');
      localStorage.removeItem('mvpluxAdminAnywhere');
      if (showMessages) showSiteMessage('Please sign in first, then turn on Admin Mode.', 'error');
      return false;
    }

    const { data, error } = await client
      .from('admin_profiles')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !data) {
      localStorage.removeItem('mvpluxIsAdminApproved');
      localStorage.removeItem('mvpluxAdminAnywhere');
      if (showMessages) showSiteMessage('This signed-in account is not approved for Admin Mode yet.', 'error');
      return false;
    }

    const adminLabel = user.user_metadata?.screen_name || user.email || 'Admin';
    localStorage.setItem('mvpluxIsAdminApproved', 'true');
    localStorage.setItem('mvpluxSignedInName', adminLabel);
    console.log('[ADMIN] Authorization passed');
    return true;
  } catch (error) {
    logAdminInitializationException('Authorization', error);
    throw error;
  }
}

function addAdminModeButtonIfMissing() {
  document.querySelectorAll('.auth-links').forEach((links) => {
    if (links.querySelector('[data-admin-mode-toggle], [data-admin-view-controls]')) return;
    const signout = links.querySelector('[data-auth-signout]');
    const buttonHtml = adminArchitectureViewModesEnabled()
      ? `<span class="admin-view-controls" data-admin-view-controls aria-label="Admin view mode">
          <button type="button" class="admin-header-link" data-admin-view-mode="edit">Edit</button>
          <button type="button" class="admin-header-link" data-admin-view-mode="preview">Preview Changes</button>
          <button type="button" class="admin-header-link" data-admin-view-mode="published">Published View</button>
        </span>`
      : '<button type="button" class="admin-header-link" data-admin-mode-toggle>Admin Mode</button>';
    if (signout) {
      signout.insertAdjacentHTML('beforebegin', buttonHtml);
    } else {
      links.insertAdjacentHTML('beforeend', buttonHtml);
    }
  });

  document.querySelectorAll('[data-admin-mode-toggle]').forEach((button) => {
    if (button.dataset.adminToggleReady) return;
    button.dataset.adminToggleReady = 'true';
    updateAdminModeToggleButtons();
    button.addEventListener('click', () => toggleCurrentPageAdminMode(button));
  });
  document.querySelectorAll('[data-admin-view-mode]').forEach((button) => {
    if (button.dataset.adminViewReady) return;
    button.dataset.adminViewReady = 'true';
    button.addEventListener('click', () => setAdminViewMode(button.dataset.adminViewMode));
  });
  updateAdminModeToggleButtons();
}

function addAdminDashboardLinkIfMissing() {
  document.querySelectorAll('.auth-links').forEach((links) => {
    if (links.querySelector('[data-admin-dashboard-link]')) return;
    const signout = links.querySelector('[data-auth-signout]');
    const linkHtml = '<a class="admin-header-link" data-admin-dashboard-link href="/admin.html">Admin Dashboard</a>';
    if (signout) signout.insertAdjacentHTML('beforebegin', linkHtml);
    else links.insertAdjacentHTML('beforeend', linkHtml);
  });
}

function refreshAdminViewControls() {
  document.querySelectorAll('[data-admin-mode-toggle], [data-admin-view-controls]').forEach((control) => control.remove());
  addAdminModeButtonIfMissing();
  renderAdminViewModeLabel();
}

async function revealAdminControlsIfApproved() {
  if (!isCustomerSignedIn()) return;
  const canUseAdmin = await checkCurrentUserAdminAccess({ showMessages: false });
  if (!canUseAdmin) {
    document.querySelectorAll('[data-admin-mode-toggle]').forEach((button) => button.remove());
    document.querySelectorAll('[data-admin-dashboard-link]').forEach((link) => link.remove());
    return;
  }
  addAdminDashboardLinkIfMissing();
  addAdminModeButtonIfMissing();
}

async function turnOnCurrentPageAdminMode(button) {
  const originalText = button?.textContent || 'Admin Mode';
  if (button) {
    button.disabled = true;
    button.textContent = 'Checking...';
  }

  const canUseAdmin = await canCurrentUserUseAdminMode();
  if (button) {
    button.disabled = false;
    button.textContent = originalText;
  }
  if (!canUseAdmin) return;

  localStorage.setItem('mvpluxAdminAnywhere', 'true');
  installInlineAdminMode();
  updateAdminModeToggleButtons();
  showSiteMessage('Admin Mode is on. You can edit this page now.', 'success');
}

function updateAdminModeToggleButtons() {
  const enabled = isInlineAdminEditingEnabled();
  document.querySelectorAll('[data-admin-mode-toggle]').forEach((button) => {
    button.textContent = enabled ? 'Admin Off' : 'Admin Mode';
    button.classList.toggle('admin-mode-toggle-off', enabled);
  });
  const mode = getAdminViewMode();
  document.querySelectorAll('[data-admin-view-mode]').forEach((button) => {
    const active = button.dataset.adminViewMode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

async function setAdminViewMode(mode) {
  if (!['edit', 'preview', 'published'].includes(mode)) return;
  if (!await flushInlineOwnedFieldSaves() || !await flushInlineOwnedDisplaySaves()) {
    showSiteMessage('View unchanged because a product or category edit could not be saved.', 'error');
    return;
  }
  if (isInlineAdminEditingEnabled() && inlineAdminHasUnsavedLocalChanges) {
    updateInlineAdminToolbarState('Saving before changing view…');
    if (!await commitInlineAdminEdits()) {
      showSiteMessage('View unchanged because an Admin edit could not be saved.', 'error');
      return;
    }
  }
  localStorage.setItem(ADMIN_VIEW_MODE_KEY, mode);
  if (mode === 'edit') localStorage.setItem('mvpluxAdminAnywhere', 'true');
  else localStorage.removeItem('mvpluxAdminAnywhere');
  window.location.reload();
}

function renderAdminViewModeLabel() {
  document.querySelector('[data-admin-view-label]')?.remove();
  if (!adminArchitectureViewModesEnabled() || localStorage.getItem('mvpluxIsAdminApproved') !== 'true') return;
  const mode = getAdminViewMode();
  const labels = {
    edit: 'Edit Mode — private changes auto-save',
    preview: 'Previewing Unpublished Changes',
    published: 'Viewing Published Version'
  };
  document.body.insertAdjacentHTML('beforeend', `<div class="admin-view-mode-label" data-admin-view-label data-mode="${mode}">${labels[mode]}</div>`);
}

async function toggleCurrentPageAdminMode(button) {
  if (isInlineAdminEditingEnabled()) {
    turnOffInlineAdminMode();
    return;
  }

  await turnOnCurrentPageAdminMode(button);
}

function showSupabaseConnectionAlert(actionLabel = 'connect to Supabase') {
  const projectUrl = window.MVPLUX_SUPABASE?.url || 'your Supabase project URL';
  showSiteMessage(`Could not ${actionLabel} yet. The site tried to reach ${projectUrl}. Please try again or check the Supabase project settings.`, 'error');
}

function getAuthRedirectUrl() {
  const allowedOrigins = new Set([
    'https://mvpluxcreations.com',
    'http://localhost:3000'
  ]);
  const origin = allowedOrigins.has(window.location.origin)
    ? window.location.origin
    : 'https://mvpluxcreations.com';

  return `${origin}/signin.html`;
}

function isSupabaseNetworkError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('failed to fetch') || message.includes('load failed') || message.includes('network');
}

async function syncSupabaseAuthState() {
  const client = getSupabaseClient();
  if (!client?.auth) return;

  try {
    const { data } = await client.auth.getSession();
    const user = data?.session?.user;
    if (!user) {
      localStorage.removeItem('mvpluxCustomerSignedIn');
      localStorage.removeItem('mvpluxSignedInName');
      localStorage.removeItem('mvpluxAdminSignedIn');
      localStorage.removeItem('mvpluxIsAdminApproved');
      localStorage.removeItem('mvpluxAdminAnywhere');
      setupAuthState();
      return;
    }

    const screenName = user.user_metadata?.screen_name || user.email?.split('@')[0] || 'Guest';
    localStorage.setItem('mvpluxCustomerSignedIn', 'true');
    localStorage.setItem('mvpluxSignedInName', screenName);
    await checkCurrentUserAdminAccess({ showMessages: false });
    setupAuthState();
  } catch (error) {
    console.warn('Supabase session check failed:', error);
  }
}

async function signInCustomerWithSupabase(email, password) {
  const client = getSupabaseClient();
  if (!client?.auth) {
    showSupabaseConnectionAlert('sign in');
    return true;
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      if (isSupabaseNetworkError(error)) {
        showSupabaseConnectionAlert('sign in');
        return true;
      }
      showSiteMessage(error.message || 'Could not sign in. Please check your email and password.', 'error');
      return true;
    }

    const user = data?.user;
    const screenName = user?.user_metadata?.screen_name || email.split('@')[0] || 'Guest';
    localStorage.setItem('mvpluxCustomerSignedIn', 'true');
    localStorage.setItem('mvpluxSignedInName', screenName);
    const canUseAdmin = await checkCurrentUserAdminAccess({ showMessages: false });
    if (!canUseAdmin) {
      showSiteMessage('Sign-in succeeded, but this account is not approved for Admin access.', 'error');
      return true;
    }
    window.location.href = '/';
  } catch (error) {
    console.warn('Supabase sign-in failed:', error);
    showSupabaseConnectionAlert('sign in');
  }
  return true;
}

async function signUpCustomerWithSupabase(screenName, email, password) {
  const client = getSupabaseClient();
  if (!client?.auth) {
    showSupabaseConnectionAlert('create the account');
    return true;
  }

  try {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
        data: {
          screen_name: screenName
        }
      }
    });

    if (error) {
      if (isSupabaseNetworkError(error)) {
        showSupabaseConnectionAlert('create the account');
        return true;
      }
      showSiteMessage(error.message || 'Could not create the account.', 'error');
      return true;
    }

    const pendingConfirmation = !data?.session;
    localStorage.setItem('mvpluxCustomerSignedIn', 'true');
    localStorage.setItem('mvpluxSignedInName', screenName);
    showSiteMessage(pendingConfirmation ? 'Account created. Please check your email if Supabase asks you to confirm it.' : 'Account created.', 'success');
    window.setTimeout(() => {
      window.location.href = 'index.html';
    }, 800);
  } catch (error) {
    console.warn('Supabase sign-up failed:', error);
    showSupabaseConnectionAlert('create the account');
  }
  return true;
}

function bindAuthForms() {
  const signinForm = document.getElementById('signinForm');
  const signupForm = document.getElementById('signupForm');
  if (signinForm && !signinForm.dataset.authFormBound) {
    signinForm.dataset.authFormBound = 'true';
    signinForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = document.getElementById('signinEmail')?.value.trim().toLowerCase() || '';
      const password = document.getElementById('signinPassword')?.value.trim() || '';

      await signInCustomerWithSupabase(email, password);
    });
  }

  if (signupForm && !signupForm.dataset.authFormBound) {
    signupForm.dataset.authFormBound = 'true';
    signupForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const screenName = document.getElementById('signupScreenName')?.value.trim() || 'Guest';
      const email = document.getElementById('signupEmail')?.value.trim().toLowerCase() || '';
      const password = document.getElementById('signupPassword')?.value.trim() || '';

      await signUpCustomerWithSupabase(screenName, email, password);
    });
  }
}

function renderSharedAuthHeader() {
  const signedInNotice = document.getElementById('signedInNotice');
  const signedInName = getSignedInName();
  const isSignedIn = Boolean(isAdminSignedIn() || isCustomerSignedIn());

  if (!isSignedIn) {
    document.querySelectorAll('.sign-in-link').forEach((link) => {
      link.textContent = 'Sign In';
      link.setAttribute('href', 'signin.html');
      link.removeAttribute('aria-current');
    });
    document.querySelectorAll('.sign-up-link').forEach((link) => {
      link.style.display = '';
    });
    document.querySelectorAll('[data-auth-signout], [data-admin-signout], [data-admin-dashboard-link], [data-admin-mode-toggle], [data-admin-view-controls]').forEach((control) => control.remove());
    return;
  }

  if (signedInNotice && isAdminSignedIn()) {
    signedInNotice.innerHTML = `You are signed in as <strong>${signedInName}</strong>. <button type="button" class="admin-inline-signout" data-admin-signout>Log Out</button>`;
  }

  if (isSignedIn) {
    document.querySelectorAll('.sign-in-link').forEach((link) => {
      link.textContent = signedInName || 'Signed In';
      link.setAttribute('href', 'account.html');
      link.setAttribute('aria-current', 'true');
      link.removeAttribute('role');
    });

    document.querySelectorAll('.sign-up-link').forEach((link) => {
      link.style.display = 'none';
    });

    document.querySelectorAll('.auth-links').forEach((links) => {
      if (links.querySelector('[data-auth-signout]')) return;
      links.insertAdjacentHTML('beforeend', `<button type="button" class="admin-inline-signout" data-auth-signout>Log Out</button>`);
    });

    if (localStorage.getItem('mvpluxIsAdminApproved') === 'true') {
      addAdminDashboardLinkIfMissing();
      addAdminModeButtonIfMissing();
    } else {
      document.querySelectorAll('[data-admin-dashboard-link], [data-admin-mode-toggle], [data-admin-view-controls]').forEach((control) => control.remove());
    }
  }

  document.querySelectorAll('[data-auth-signout], [data-admin-signout]').forEach((button) => {
    if (button.dataset.authSignoutReady) return;
    button.dataset.authSignoutReady = 'true';
    button.addEventListener('click', signOutCurrentUser);
  });
}

function setupAuthState() {
  cleanStaleAdminState();
  bindAuthForms();
  renderSharedAuthHeader();
}

/* ---------------- PREMIUM SIZE BUILDER ---------------- */
function parseHeightToInches(value) {
  return window.MVPLUX_PRICING.parseHeight(value);
}

function getAdminPriceSettings() {
  try {
    if (shouldUsePrivateAdminState() && window.mvpluxLiveAdminSettings?.priceSettings) {
      return window.mvpluxLiveAdminSettings.priceSettings;
    }
    return window.mvpluxPublishedAdminSettings?.priceSettings || {};
  } catch (error) {
    return {};
  }
}

function getPriceSettingsForBuilder(builder = null) {
  return window.MVPLUX_PRICING.normalizePriceSettings(getAdminPriceSettings());
}

function calculateCutoutPrice(inches, builder = null) {
  const override = Number(builder?.dataset.originalPriceOverride);
  const originalHeight = Number(builder?.dataset.originalHeight);
  if (Number.isFinite(override) && override >= 0 && Number(inches) === originalHeight) return override;
  return window.MVPLUX_PRICING.calculateHeightPrice(inches, getPriceSettingsForBuilder(builder));
}

function resolveSellableProductHeight(value, builder = null) {
  return window.MVPLUX_PRICING.resolveMerchandiseHeight(value, getPriceSettingsForBuilder(builder));
}

const finishChoices = [
  {
    value: 'back-stand-included',
    label: 'Back Stand Included',
    extra: 0,
    description: "Standard standee backing is included. Exact support placement may be printer's choice."
  },
  {
    value: 'white-triangle',
    label: 'White Triangle',
    extra: 0,
    requiresWhiteTriangle: true,
    description: 'Switches to the white-triangle image when this item has one.'
  },
  {
    value: 'garden-stakes',
    label: 'Garden Stakes',
    extra: 0,
    warning: true,
    description: 'Stakes instead of the back stand. Best for yard/garden use.'
  },
  {
    value: 'cutout-only',
    label: 'Cutout Only',
    extra: 0,
    warning: true,
    description: 'No back stand. Made for taping, pasting, or mounting yourself.'
  }
];

function getAvailableFinishChoices(builder) {
  const hasWhiteTriangle = Boolean(builder?.dataset.whiteTriangleImage);
  return finishChoices.filter((choice) => !choice.requiresWhiteTriangle || hasWhiteTriangle);
}

function finishChoiceMarkup(radioNamePrefix = 'finishChoice', builder = null) {
  const choices = getAvailableFinishChoices(builder);
  return `
    <div class="finish-builder" aria-label="Finish and support choices">
      <h4>Finish / Support Choice</h4>
      <p class="finish-note">Back stand is included by default. Extra/replacement back stands are separate orders and shipping is not free for back-stand-only orders.</p>
      <div class="finish-choice-grid">
        ${choices.map((choice, index) => `
          <label class="finish-choice ${index === 0 ? 'active' : ''}">
            <input type="radio" name="${radioNamePrefix}FinishChoice" value="${choice.value}" data-finish-extra="${choice.extra}" data-finish-warning="${choice.warning ? 'true' : ''}" ${index === 0 ? 'checked' : ''}>
            <span>${choice.label}${choice.extra ? ` +${formatMoney(choice.extra)}` : ''}</span>
            <small>${choice.description}</small>
          </label>
        `).join('')}
      </div>
    </div>
  `;
}

function getFinishExtra(builder) {
  const selected = builder?.querySelector('.finish-choice input:checked');
  return parseFloat(selected?.dataset.finishExtra || '0') || 0;
}

function getFinishLabel(builder) {
  return builder?.querySelector('.finish-choice input:checked')?.closest('.finish-choice')?.querySelector('span')?.textContent || 'Back Stand Included';
}

function addFinishToPrice(price, builder) {
  return (Number(price) || 0) + getFinishExtra(builder);
}

function applyFinishSelection(builder, selectedInput) {
  if (!builder || !selectedInput) return;

  if (selectedInput.dataset.finishWarning === 'true') {
    showSiteMessage('Back stand will not be included with this choice. The standee will be prepared/cut for the finish you selected.');
  }

  if (selectedInput.value === 'white-triangle' && builder.dataset.whiteTriangleImage) {
    const showroom = builder.closest('.sports-showroom, .generic-showroom, .standee-detail-page');
    const image = showroom?.querySelector('#sportsMainImage, .generic-main-image, .standee-main-cutout');
    if (image) image.src = builder.dataset.whiteTriangleImage;
  }
}

function ensureFinishChoices(root = document) {
  const builders = root.matches?.('.size-builder')
    ? [root]
    : [...(root.querySelectorAll?.('.size-builder') || [])];

  builders.forEach((builder) => {
    if (builder.querySelector('.finish-builder')) return;
    const slug = builder.dataset.adminSlug || getProductSlug(builder.dataset.productName || 'product');
    const priceLine = builder.querySelector('.live-price-line');
    if (priceLine) {
      priceLine.insertAdjacentHTML('beforebegin', finishChoiceMarkup(slug, builder));
    } else {
      builder.insertAdjacentHTML('beforeend', finishChoiceMarkup(slug, builder));
    }
  });
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
  ensureProductAdminSlugs(builder?.closest?.('.product-card') || document);
  return 'mvpluxOriginalHeight:' + (builder?.dataset.adminSlug || getProductSlug(builder?.dataset.productName || 'product'));
}

function clearLegacyAdminBrowserStorage() {
  localStorage.removeItem('mvpluxAdminAnywhereLegacy');
  localStorage.removeItem('mvpluxInlineHiddenCards');
}

function getProductSlug(productName) {
  return (productName || 'product').replace(/\W+/g, '-').toLowerCase();
}

function ensureProductAdminSlugs(root = document) {
  root.querySelectorAll?.('.size-builder').forEach((builder) => {
    if (builder.dataset.adminSlug) return;
    const card = builder.closest('.product-card');
    const productName = builder.dataset.productName
      || card?.querySelector('.product-title-link, h3, h2, h1')?.textContent
      || 'product';
    builder.dataset.adminSlug = getProductSlug(productName);
  });
}

window.mvpluxPublishedAdminSettings = null;
window.mvpluxLiveAdminStateLoaded = false;
let storefrontAdminPotentiallyStale = false;
let storefrontPendingConflict = null;
const storefrontAdminSaveChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('mvplux-admin-saves-v1') : null;
const STOREFRONT_CATEGORY_CARD_MAP = {
  'sport-legend-standee': 'sports',
  'movie-character-standee': 'movie-characters',
  'people-public-figure-standee': 'people-public-figures',
  'music-artist-standee': 'music-artists',
  'faith-celebration-standee': 'faith-celebration',
  'holiday-standee': 'holiday',
  'fan-request-standee': 'fan-requests',
  'dinosaur-party-standee': 'dinosaur-animal',
  'game-fantasy-standee': 'video-game-fantasy',
  'custom-photo-standee': 'custom-photo',
  'small-standee-party-pack': 'small-party-packs'
};
const STOREFRONT_CATEGORY_PAGE_MAP = {
  'sport-legend-standee': 'sports-legends.html',
  'movie-character-standee': 'movie-inspired.html',
  'people-public-figure-standee': 'people-public-figures.html',
  'music-artist-standee': 'music-artists.html',
  'faith-celebration-standee': 'religious-cutouts.html',
  'holiday-standee': 'holiday-cutouts.html',
  'fan-request-standee': 'fan-inspired.html',
  'dinosaur-party-standee': 'dinosaur-cutouts.html',
  'game-fantasy-standee': 'videogame-cutouts.html',
  'custom-photo-standee': 'custom-photo-cutouts.html',
  'small-standee-party-pack': 'small-cutout-party-packs.html'
};

function announceStorefrontAdminSave(scope, revision, keys = []) {
  const message = { source: storefrontAdminTabId, scope, revision, keys, savedAt: new Date().toISOString() };
  storefrontAdminSaveChannel?.postMessage(message);
  try { localStorage.setItem('mvpluxAdminSaveNotice', JSON.stringify(message)); } catch (_error) { /* Best-effort notification. */ }
}

function receiveStorefrontAdminSaveNotice(message) {
  if (!message || message.source === storefrontAdminTabId) return;
  storefrontAdminPotentiallyStale = true;
  updateInlineAdminToolbarState('Another Admin tab saved newer changes. Refreshing before next save.');
}

storefrontAdminSaveChannel?.addEventListener('message', (event) => receiveStorefrontAdminSaveNotice(event.data));
window.addEventListener('storage', (event) => {
  if (event.key !== 'mvpluxAdminSaveNotice' || !event.newValue) return;
  try { receiveStorefrontAdminSaveNotice(JSON.parse(event.newValue)); } catch (_error) { /* Ignore invalid notices. */ }
});

function sanitizeProductImageChoices(choices = []) {
  const seen = new Set();
  return (Array.isArray(choices) ? choices : []).flatMap((choice) => {
    const image = typeof choice?.image === 'string' ? choice.image.trim() : '';
    const stage = typeof choice?.stage === 'string' ? choice.stage.trim() : '';
    const identity = `${image}\u0000${stage}`;
    if (!image || seen.has(identity)) return [];
    seen.add(identity);
    const role = typeof choice?.role === 'string' ? choice.role.trim() : '';
    return [{
      label: typeof choice?.label === 'string' && choice.label.trim() ? choice.label.trim() : 'Alternate image',
      image,
      ...(stage ? { stage } : {}),
      ...(role ? { role } : {})
    }];
  });
}

function sanitizePublishedProduct(slug, value) {
  if (!slug || !value || typeof value !== 'object' || Array.isArray(value)) return null;
  const product = { slug };
  if (typeof value.title === 'string' && value.title.trim()) product.title = value.title;
  if (typeof value.description === 'string') product.description = value.description;
  if (typeof value.funFact === 'string') product.funFact = value.funFact;
  if (typeof value.cutoutImage === 'string' && value.cutoutImage.trim()) product.cutoutImage = value.cutoutImage;
  if (typeof value.backgroundImage === 'string' && value.backgroundImage.trim()) product.backgroundImage = value.backgroundImage;
  if (Array.isArray(value.imageChoices)) product.imageChoices = sanitizeProductImageChoices(value.imageChoices);
  if ((typeof value.originalHeight === 'string' || typeof value.originalHeight === 'number') && String(value.originalHeight).trim()) {
    product.originalHeight = value.originalHeight;
  }
  if (Number.isFinite(Number(value.priceOverride)) && value.priceOverride !== '' && value.priceOverride !== null) product.priceOverride = Number(value.priceOverride);
  if (Number.isFinite(Number(value.productOrder))) product.productOrder = Number(value.productOrder);
  if (value.displayOverrides && typeof value.displayOverrides === 'object' && !Array.isArray(value.displayOverrides)) {
    product.displayOverrides = structuredClone(value.displayOverrides);
  }
  ['cutoutHeight', 'cutoutLeft', 'cutoutBottom', 'logoWidth', 'logoTop', 'stageBackgroundPosition'].forEach((field) => {
    if ((typeof value[field] === 'string' || typeof value[field] === 'number') && String(value[field]).trim()) {
      product[field] = value[field];
    }
  });
  if (typeof value.visible === 'boolean') product.visible = value.visible;
  if (value.custom === true) product.custom = true;
  if (Array.isArray(value.categories)) {
    product.categories = [...new Set(value.categories.filter((category) => typeof category === 'string' && category))];
  }
  if (value.categoryOrder && typeof value.categoryOrder === 'object' && !Array.isArray(value.categoryOrder)) {
    product.categoryOrder = Object.fromEntries(
      Object.entries(value.categoryOrder).filter(([category, order]) => category && Number.isFinite(Number(order)))
    );
  }
  return product;
}

function validatePublishedAdminSettings(value) {
  const snapshot = value?.snapshot;
  if (!snapshot || snapshot.version !== 1 || !snapshot.products || typeof snapshot.products !== 'object' || Array.isArray(snapshot.products)) {
    return null;
  }

  const products = {};
  Object.entries(snapshot.products).forEach(([slug, product]) => {
    const sanitized = sanitizePublishedProduct(slug, product);
    if (sanitized) products[slug] = sanitized;
  });
  const categoryDisplayCards = {};
  Object.entries(snapshot.categoryDisplayCards || {}).forEach(([slug, product]) => {
    const sanitized = sanitizePublishedProduct(slug, product);
    if (sanitized) categoryDisplayCards[slug] = sanitized;
  });

  const homepageCategoryOrder = Array.isArray(snapshot.homepageCategoryOrder)
    ? snapshot.homepageCategoryOrder
      .filter(Array.isArray)
      .map((row) => row.filter((slug) => typeof slug === 'string' && slug))
    : [];

  const pageVisualStates = {};
  Object.entries(snapshot.pageVisualStates || {}).forEach(([pageKey, states]) => {
    if (!pageKey || !states || typeof states !== 'object' || Array.isArray(states)) return;
    const sanitizedStates = {};
    Object.entries(states).forEach(([elementKey, state]) => {
      if (!elementKey || !state || typeof state !== 'object' || Array.isArray(state)) return;
      sanitizedStates[elementKey] = normalizeImageVisualState(state);
    });
    if (Object.keys(sanitizedStates).length) pageVisualStates[pageKey.toLowerCase()] = sanitizedStates;
  });

  const categories = {};
  Object.entries(snapshot.categories || {}).forEach(([key, category]) => {
    if (!key || !category || typeof category !== 'object' || Array.isArray(category)) return;
    categories[key] = structuredClone(category);
  });
  const pageContent = {};
  Object.entries(snapshot.pageContent || {}).forEach(([pageKey, entries]) => {
    if (!pageKey || !entries || typeof entries !== 'object' || Array.isArray(entries)) return;
    pageContent[pageKey.toLowerCase()] = Object.fromEntries(Object.entries(entries).flatMap(([elementKey, entry]) => {
      if (!elementKey || !entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const sanitized = {};
      if (typeof entry.text === 'string') sanitized.text = entry.text;
      if (typeof entry.src === 'string' && /^images\/[A-Za-z0-9_./ '\-]+\.(?:png|jpe?g|webp|gif)$/i.test(entry.src) && !entry.src.includes('..')) sanitized.src = entry.src;
      if (entry.visible === false) sanitized.visible = false;
      return Object.keys(sanitized).length ? [[elementKey, sanitized]] : [];
    }));
  });

  return {
    version: 1,
    schemaVersion: Number(snapshot.schemaVersion) || 1,
    priceSettings: window.MVPLUX_PRICING.normalizePriceSettings(snapshot.priceSettings || {}),
    products,
    categoryDisplayCards,
    deletedProducts: Array.isArray(snapshot.deletedProducts)
      ? [...new Set(snapshot.deletedProducts.filter((slug) => typeof slug === 'string' && slug))]
      : [],
    deletedCategories: Array.isArray(snapshot.deletedCategories)
      ? [...new Set(snapshot.deletedCategories.filter((key) => typeof key === 'string' && key))]
      : [],
    ignoredImagePaths: Array.isArray(snapshot.ignoredImagePaths)
      ? [...new Set(snapshot.ignoredImagePaths.filter((path) => typeof path === 'string' && path))]
      : [],
    extraImages: snapshot.extraImages && typeof snapshot.extraImages === 'object' && !Array.isArray(snapshot.extraImages)
      ? Object.fromEntries(Object.entries(snapshot.extraImages).filter(([key, path]) => (
        typeof key === 'string' && key && typeof path === 'string' && /^images\/[A-Za-z0-9_./ '\-]+\.(?:png|jpe?g|webp|gif)$/i.test(path)
        && !path.includes('..') && !path.includes('\\')
      )))
      : {},
    homepageCategoryOrder,
    categories,
    categorySettings: snapshot.categorySettings && typeof snapshot.categorySettings === 'object' ? structuredClone(snapshot.categorySettings) : {},
    globalDisplaySettings: snapshot.globalDisplaySettings && typeof snapshot.globalDisplaySettings === 'object' ? structuredClone(snapshot.globalDisplaySettings) : {},
    pageContent,
    pageVisualStates
  };
}

async function loadPublishedAdminSettings() {
  window.mvpluxPublishedAdminSettings = null;
  try {
    const response = await fetch('published-admin-settings.json', { cache: 'no-store' });
    if (!response.ok) return null;
    const snapshot = validatePublishedAdminSettings(await response.json());
    if (!snapshot) return null;
    window.mvpluxPublishedAdminSettings = snapshot;
    return snapshot;
  } catch (error) {
    window.mvpluxPublishedAdminSettings = null;
    return null;
  }
}

function getPublishedProducts() {
  return {
    ...(window.mvpluxPublishedAdminSettings?.categoryDisplayCards || {}),
    ...(window.mvpluxPublishedAdminSettings?.products || {})
  };
}

function getAdminProducts() {
  try {
    const publishedProducts = getPublishedProducts();
    if (!shouldUsePrivateAdminState()) return { ...publishedProducts };
    const liveProducts = window.mvpluxLiveAdminSettings?.products || {};
    const liveCategoryCards = Object.fromEntries(Object.entries(window.mvpluxLiveAdminSettings?.categories || {}).map(([categoryKey, category]) => {
      const slug = Object.entries(STOREFRONT_CATEGORY_CARD_MAP).find(([, key]) => key === categoryKey)?.[0]
        || `${categoryKey}-category-card`;
      return [slug, {
        slug,
        title: category.title || category.card?.title,
        description: category.description || category.card?.description,
        cutoutImage: category.card?.image || '',
        backgroundImage: category.card?.backgroundImage || '',
        visible: category.visible !== false && category.homepageVisible !== false,
        productOrder: category.order,
        categoryCard: true
      }];
    }));
    const emergencyBackup = window.mvpluxLiveAdminStateLoaded
      ? {}
      : JSON.parse(localStorage.getItem('mvpluxAdminProducts') || '{}');

    const productSlugs = new Set([
      ...Object.keys(publishedProducts),
      ...Object.keys(liveProducts),
      ...Object.keys(liveCategoryCards),
      ...Object.keys(emergencyBackup)
    ]);

    return Object.fromEntries(
      [...productSlugs].map((slug) => [
        slug,
        {
          ...(publishedProducts[slug] || {}),
          ...(liveProducts[slug] || {}),
          ...(liveCategoryCards[slug] || {}),
          ...(emergencyBackup[slug] || {})
        }
      ])
    );
  } catch (error) {
    return {};
  }
}

function compatibilityMasterCategories() {
  const published = window.mvpluxPublishedAdminSettings || {};
  const deleted = new Set(published.deletedCategories || []);
  const categories = {};
  (window.MVPLUX_PRODUCT_CATEGORIES || []).forEach((definition, index) => {
    if (!definition?.key || deleted.has(definition.key)) return;
    categories[definition.key] = {
      key: definition.key,
      title: definition.label || definition.key,
      description: '',
      page: definition.page || definition.pages?.[0] || '',
      visible: definition.visible !== false,
      homepageVisible: definition.homepageVisible !== false,
      order: index,
      card: { title: definition.label || definition.key, description: '', image: '', backgroundImage: '', visible: true, order: index },
      displaySettings: {}
    };
  });
  Object.entries(published.categoryDisplayCards || {}).forEach(([slug, card], index) => {
    const key = STOREFRONT_CATEGORY_CARD_MAP[slug] || slug.replace(/-category-card$/, '');
    if (!key || deleted.has(key)) return;
    const current = categories[key] || { key, title: card.title || key, description: '', page: STOREFRONT_CATEGORY_PAGE_MAP[slug] || '', visible: true, homepageVisible: true, order: index, displaySettings: {} };
    categories[key] = {
      ...current,
      title: card.title || current.title,
      card: {
        title: card.title || current.title,
        description: card.description || current.description || '',
        image: card.cutoutImage || '',
        backgroundImage: card.backgroundImage || '',
        visible: card.visible !== false,
        order: Number.isFinite(Number(card.productOrder)) ? Number(card.productOrder) : current.order
      }
    };
  });
  Object.entries(published.categories || {}).forEach(([key, category]) => {
    if (deleted.has(key)) return;
    const compatibility = categories[key] || {};
    const normalized = structuredClone(category);
    categories[key] = {
      ...compatibility,
      ...normalized,
      key,
      card: { ...(compatibility.card || {}), ...(normalized.card || {}) },
      displaySettings: { ...(compatibility.displaySettings || {}), ...(normalized.displaySettings || {}) }
    };
  });
  return categories;
}

function getAdminCategories() {
  const published = compatibilityMasterCategories();
  if (!shouldUsePrivateAdminState()) return published;
  const deleted = new Set(window.mvpluxLiveAdminSettings?.deletedCategories || window.mvpluxPublishedAdminSettings?.deletedCategories || []);
  const privateCategories = window.mvpluxLiveAdminSettings?.categories || {};
  return Object.fromEntries(Object.entries({ ...published, ...privateCategories }).filter(([key]) => !deleted.has(key)));
}

function getAdminGlobalDisplaySettings() {
  if (shouldUsePrivateAdminState()) return window.mvpluxLiveAdminSettings?.globalDisplaySettings || {};
  return window.mvpluxPublishedAdminSettings?.globalDisplaySettings || {};
}

function getEffectiveCategoryPresentation(categoryKey, mode = shouldUsePrivateAdminState() ? 'draft' : 'published') {
  const categories = mode === 'published' ? compatibilityMasterCategories() : getAdminCategories();
  const category = categories[categoryKey] || { key: categoryKey, card: {}, displaySettings: {} };
  const globalDisplaySettings = mode === 'published'
    ? window.mvpluxPublishedAdminSettings?.globalDisplaySettings || {}
    : window.mvpluxLiveAdminSettings?.globalDisplaySettings || window.mvpluxPublishedAdminSettings?.globalDisplaySettings || {};
  return window.MVPLUX_CATEGORY_PRESENTATION.resolveCategoryPresentation(category, {
    mode,
    globalDisplaySettings,
    defaultBackground: getShowroomStageBackground()
  });
}

function resolveStorefrontProductDisplay(product = {}) {
  const categoryKey = getCurrentProductCategory()
    || (Array.isArray(product.categories) ? product.categories[0] : '');
  const category = getAdminCategories()[categoryKey] || {};
  return {
    backgroundPosition: 'center center',
    ...getAdminGlobalDisplaySettings(),
    ...(category.displaySettings || {}),
    ...(product.displayOverrides || {})
  };
}

function getAdminCustomProducts() {
  try {
    if (!shouldUsePrivateAdminState()) {
      return Object.values(getPublishedProducts()).filter((product) => product.custom === true);
    }
    if (window.mvpluxLiveAdminStateLoaded) return window.mvpluxLiveAdminSettings?.customProducts || [];
    return JSON.parse(localStorage.getItem('mvpluxAdminCustomProducts') || '[]');
  } catch (error) {
    return [];
  }
}

function getAdminDeletedProducts() {
  try {
    if (!shouldUsePrivateAdminState()) return window.mvpluxPublishedAdminSettings?.deletedProducts || [];
    if (window.mvpluxLiveAdminStateLoaded) return window.mvpluxLiveAdminSettings?.deletedProducts || [];
    return JSON.parse(localStorage.getItem('mvpluxDeletedProducts') || '[]');
  } catch (error) {
    return [];
  }
}

function getManagedProductCatalog() {
  const overrides = getAdminProducts();
  const defaults = window.MVPLUX_PRODUCT_CATALOG || [];
  const customProducts = getAdminCustomProducts();
  const deleted = new Set(getAdminDeletedProducts());
  const bySlug = new Map();

  [...defaults, ...customProducts].forEach((product) => {
    const slug = product?.slug;
    if (!slug || deleted.has(slug)) return;
    const merged = { ...product, ...(overrides[slug] || {}) };
    const deletedCategories = new Set(shouldUsePrivateAdminState()
      ? window.mvpluxLiveAdminSettings?.deletedCategories || []
      : window.mvpluxPublishedAdminSettings?.deletedCategories || []);
    merged.categories = Array.isArray(merged.categories) ? [...new Set(merged.categories)].filter((key) => !deletedCategories.has(key)) : [];
    merged.imageChoices = sanitizeProductImageChoices(merged.imageChoices)
      .filter((choice) => choice.image !== merged.cutoutImage);
    merged.categoryOrder = merged.categoryOrder && typeof merged.categoryOrder === 'object'
      ? { ...merged.categoryOrder }
      : {};
    bySlug.set(slug, merged);
  });

  return [...bySlug.values()];
}

function getManagedProductBySlug(slug) {
  return getManagedProductCatalog().find((product) => product.slug === slug) || null;
}

function getAdminArchivedProducts() {
  try {
    if (!shouldUsePrivateAdminState()) {
      return Object.values(getPublishedProducts()).filter((product) => product.visible === false).map((product) => product.slug);
    }
    if (window.mvpluxLiveAdminStateLoaded) return window.mvpluxLiveAdminSettings?.savedForLaterProducts || [];
    return JSON.parse(localStorage.getItem('mvpluxAdminArchivedProducts') || '[]');
  } catch (error) {
    return [];
  }
}

function getAdminExtraImages() {
  try {
    if (!shouldUsePrivateAdminState()) return window.mvpluxPublishedAdminSettings?.extraImages || {};
    if (window.mvpluxLiveAdminStateLoaded) return window.mvpluxLiveAdminSettings?.extraImages || {};
    return JSON.parse(localStorage.getItem('mvpluxAdminExtraImages') || '{}');
  } catch (error) {
    return {};
  }
}

async function loadLiveAdminSettings() {
  const client = getSupabaseClient();
  if (!client?.from) {
    window.mvpluxLiveAdminSettings = null;
    window.mvpluxLiveAdminStateLoaded = false;
    return null;
  }

  const { data, error } = await client
    .from('site_edits')
    .select('edits, revision')
    .eq('page_key', 'admin-global')
    .maybeSingle();

  if (error) {
    window.mvpluxLiveAdminSettings = null;
    window.mvpluxLiveAdminStateLoaded = false;
    return null;
  }

  window.mvpluxLiveAdminSettings = data?.edits || {};
  window.mvpluxLiveAdminRevision = Number(data?.revision) || 0;
  window.mvpluxLiveAdminStateLoaded = true;
  storefrontAdminPotentiallyStale = false;
  return window.mvpluxLiveAdminSettings;
}

let liveAdminSaveQueue = Promise.resolve(true);

async function fetchAuthoritativeStorefrontAdminGlobal() {
  const client = getSupabaseClient();
  if (!client?.from || !client?.auth) throw new Error('Supabase is not ready.');
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData?.session?.user) throw new Error('Sign in as admin to save live.');
  const { data, error } = await client
    .from('site_edits')
    .select('edits, revision')
    .eq('page_key', 'admin-global')
    .maybeSingle();
  if (error) throw error;
  return { edits: data?.edits || {}, revision: Number(data?.revision) || 0 };
}

function showStorefrontAdminConflict(details, retry, keepLatest = null, cancel = null) {
  storefrontPendingConflict = { details, retry, keepLatest, cancel };
  let panel = document.getElementById('adminInlineConflictActions');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'adminInlineConflictActions';
    panel.className = 'admin-inline-conflict-actions';
    panel.innerHTML = `
      <strong>Conflict — review required</strong>
      <span data-inline-conflict-fields></span>
      <button type="button" data-inline-conflict-latest>Keep latest server values</button>
      <button type="button" data-inline-conflict-reapply>Reapply my changed fields</button>
      <button type="button" data-inline-conflict-cancel>Cancel and review</button>
    `;
    (document.querySelector('.admin-anywhere-toolbar') || document.body).appendChild(panel);
    panel.querySelector('[data-inline-conflict-latest]')?.addEventListener('click', async () => {
      const pending = storefrontPendingConflict;
      if (pending?.keepLatest) await pending.keepLatest();
      storefrontPendingConflict = null;
      window.location.reload();
    });
    panel.querySelector('[data-inline-conflict-reapply]')?.addEventListener('click', async () => {
      const pending = storefrontPendingConflict;
      if (!pending?.retry) return;
      panel.querySelectorAll('button').forEach((button) => { button.disabled = true; });
      await pending.retry();
    });
    panel.querySelector('[data-inline-conflict-cancel]')?.addEventListener('click', async () => {
      const pending = storefrontPendingConflict;
      if (pending?.cancel) await pending.cancel();
      storefrontPendingConflict = null;
      panel.hidden = true;
      updateInlineAdminToolbarState('Conflict — local changes remain unsaved for review');
    });
  }
  const fields = details.conflictingFields || details.conflictingKeys || [];
  const remote = details.remoteFields || details.remoteKeys || fields;
  const local = details.localFields || details.localKeys || fields;
  panel.querySelector('[data-inline-conflict-fields]').textContent = `Changed remotely: ${remote.join(', ') || 'unknown'}. Waiting locally: ${local.join(', ') || 'unknown'}. Overlap: ${fields.join(', ') || 'none'}.`;
  panel.querySelectorAll('button').forEach((button) => { button.disabled = false; });
  const reapplyButton = panel.querySelector('[data-inline-conflict-reapply]');
  if (reapplyButton) reapplyButton.disabled = typeof retry !== 'function';
  panel.hidden = false;
  updateInlineAdminToolbarState('Conflict — review required');
}

async function saveStorefrontProductPatch(slug, patch, baseRecord, force = false) {
  if (!slug || !Object.keys(patch || {}).length) return false;
  if (patch.approvalStatus === undefined) {
    patch = { ...patch, draftStatus: patch.draftStatus || 'ready', approvalStatus: 'draft', updatedAt: patch.updatedAt || new Date().toISOString() };
  }
  updateInlineAdminToolbarState('Saving');
  try {
    const latest = await fetchAuthoritativeStorefrontAdminGlobal();
    const defaults = getPublishedProducts()[slug]
      || (window.MVPLUX_PRODUCT_CATALOG || []).find((product) => product.slug === slug)
      || (latest.edits.customProducts || []).find((product) => product.slug === slug)
      || {};
    const latestRecord = { ...defaults, ...(latest.edits.products?.[slug] || {}) };
    const utils = await adminStateUtilsPromise;
    const analysis = utils.analyzeRecordPatch(baseRecord || {}, latestRecord, patch);
    window.mvpluxLiveAdminSettings = latest.edits;
    window.mvpluxLiveAdminRevision = latest.revision;
    window.mvpluxLiveAdminStateLoaded = true;
    storefrontAdminPotentiallyStale = false;
    if (!force && !analysis.canRebase) {
      showStorefrontAdminConflict(analysis, () => saveStorefrontProductPatch(slug, patch, latestRecord, true));
      return false;
    }
    const products = utils.applyRecordPatch(latest.edits.products || {}, slug, patch);
    const { data, error } = await getSupabaseClient().rpc('save_site_edits', {
      p_page_key: 'admin-global',
      p_edits: { products },
      p_expected_revision: latest.revision,
      p_replace: false
    });
    if (error) {
      if (String(error.code || '') === '40001' || String(error.message || '').includes('Admin state changed')) {
        const refreshed = await fetchAuthoritativeStorefrontAdminGlobal();
        const refreshedRecord = { ...defaults, ...(refreshed.edits.products?.[slug] || {}) };
        const conflict = utils.analyzeRecordPatch(latestRecord, refreshedRecord, patch);
        window.mvpluxLiveAdminSettings = refreshed.edits;
        window.mvpluxLiveAdminRevision = refreshed.revision;
        showStorefrontAdminConflict(conflict, () => saveStorefrontProductPatch(slug, patch, refreshedRecord, true));
        return false;
      }
      throw error;
    }
    window.mvpluxLiveAdminSettings = data?.edits || { ...latest.edits, products };
    window.mvpluxLiveAdminRevision = Number(data?.revision) || latest.revision + 1;
    localStorage.setItem('mvpluxAdminProducts', JSON.stringify(window.mvpluxLiveAdminSettings.products || products));
    announceStorefrontAdminSave('admin-global', window.mvpluxLiveAdminRevision, [`products:${slug}`]);
    document.getElementById('adminInlineConflictActions')?.setAttribute('hidden', '');
    storefrontPendingConflict = null;
    updateInlineAdminToolbarState('Saved Privately');
    return true;
  } catch (error) {
    updateInlineAdminToolbarState(`Error — not saved: ${error?.message || error}`);
    return false;
  }
}

async function saveStorefrontCategoryPatch(categoryKey, section, patch, baseCategory, force = false) {
  if (!categoryKey || !Object.keys(patch || {}).length) return false;
  updateInlineAdminToolbarState('Saving…');
  try {
    const latest = await fetchAuthoritativeStorefrontAdminGlobal();
    const latestCategory = latest.edits.categories?.[categoryKey] || {};
    const utils = await adminStateUtilsPromise;
    const baseSection = section ? baseCategory?.[section] || {} : baseCategory || {};
    const latestSection = section ? latestCategory?.[section] || {} : latestCategory;
    const analysis = utils.analyzeRecordPatch(baseSection, latestSection, patch);
    window.mvpluxLiveAdminSettings = latest.edits;
    window.mvpluxLiveAdminRevision = latest.revision;
    window.mvpluxLiveAdminStateLoaded = true;
    storefrontAdminPotentiallyStale = false;
    if (!force && !analysis.canRebase) {
      showStorefrontAdminConflict(analysis, () => saveStorefrontCategoryPatch(categoryKey, section, patch, latestCategory, true));
      return false;
    }
    const approvalStatus = patch.approvalStatus || 'draft';
    const category = section
      ? { ...latestCategory, [section]: { ...latestSection, ...patch }, updatedAt: new Date().toISOString(), draftStatus: 'ready', approvalStatus }
      : { ...latestCategory, ...patch, updatedAt: new Date().toISOString(), draftStatus: 'ready', approvalStatus };
    const categories = { ...(latest.edits.categories || {}), [categoryKey]: category };
    const { data, error } = await getSupabaseClient().rpc('save_site_edits', {
      p_page_key: 'admin-global',
      p_edits: { categories },
      p_expected_revision: latest.revision,
      p_replace: false
    });
    if (error) throw error;
    window.mvpluxLiveAdminSettings = data?.edits || { ...latest.edits, categories };
    window.mvpluxLiveAdminRevision = Number(data?.revision) || latest.revision + 1;
    announceStorefrontAdminSave('admin-global', window.mvpluxLiveAdminRevision, [`categories:${categoryKey}:${section || 'root'}`]);
    updateInlineAdminToolbarState('Saved Privately');
    return true;
  } catch (error) {
    if (String(error?.code || '') === '40001' || String(error?.message || '').includes('Admin state changed')) {
      showStorefrontAdminConflict({ conflictingFields: [`categories:${categoryKey}:${section || 'root'}`] }, null);
    } else {
      updateInlineAdminToolbarState(`Error — not saved: ${error?.message || error}`);
    }
    return false;
  }
}

async function saveStorefrontProductPatches(recordPatches, baseRecords = {}) {
  const entries = Object.entries(recordPatches || {}).filter(([, patch]) => Object.keys(patch || {}).length);
  if (!entries.length) return true;
  updateInlineAdminToolbarState('Saving');
  try {
    const latest = await fetchAuthoritativeStorefrontAdminGlobal();
    const utils = await adminStateUtilsPromise;
    let products = { ...(latest.edits.products || {}) };
    const conflicts = [];
    entries.forEach(([slug, patch]) => {
      const defaults = getPublishedProducts()[slug]
        || (window.MVPLUX_PRODUCT_CATALOG || []).find((product) => product.slug === slug)
        || (latest.edits.customProducts || []).find((product) => product.slug === slug)
        || {};
      const latestRecord = { ...defaults, ...(products[slug] || {}) };
      const analysis = utils.analyzeRecordPatch(baseRecords[slug] || latestRecord, latestRecord, patch);
      if (!analysis.canRebase) conflicts.push(`${slug}: ${analysis.conflictingFields.join(', ')}`);
      products = utils.applyRecordPatch(products, slug, patch);
    });
    window.mvpluxLiveAdminSettings = latest.edits;
    window.mvpluxLiveAdminRevision = latest.revision;
    window.mvpluxLiveAdminStateLoaded = true;
    storefrontAdminPotentiallyStale = false;
    if (conflicts.length) {
      showStorefrontAdminConflict({ conflictingFields: conflicts }, null);
      return false;
    }
    const { data, error } = await getSupabaseClient().rpc('save_site_edits', {
      p_page_key: 'admin-global',
      p_edits: { products },
      p_expected_revision: latest.revision,
      p_replace: false
    });
    if (error) throw error;
    window.mvpluxLiveAdminSettings = data?.edits || { ...latest.edits, products };
    window.mvpluxLiveAdminRevision = Number(data?.revision) || latest.revision + 1;
    localStorage.setItem('mvpluxAdminProducts', JSON.stringify(window.mvpluxLiveAdminSettings.products || products));
    announceStorefrontAdminSave('admin-global', window.mvpluxLiveAdminRevision, entries.map(([slug]) => `products:${slug}`));
    updateInlineAdminToolbarState('Saved Privately');
    return true;
  } catch (error) {
    if (String(error?.code || '') === '40001' || String(error?.message || '').includes('Admin state changed')) {
      try {
        const refreshed = await fetchAuthoritativeStorefrontAdminGlobal();
        window.mvpluxLiveAdminSettings = refreshed.edits;
        window.mvpluxLiveAdminRevision = refreshed.revision;
      } catch (_reloadError) { /* Keep the original conflict as the reported failure. */ }
      showStorefrontAdminConflict({ conflictingFields: entries.map(([slug]) => `products:${slug}`) }, null);
      return false;
    }
    updateInlineAdminToolbarState(`Error — not saved: ${error?.message || error}`);
    return false;
  }
}

async function saveStorefrontListMembershipPatch(collectionKey, entry, present, baseValues, storageKey) {
  updateInlineAdminToolbarState('Saving');
  try {
    const latest = await fetchAuthoritativeStorefrontAdminGlobal();
    const utils = await adminStateUtilsPromise;
    const latestValues = Array.isArray(latest.edits?.[collectionKey]) ? latest.edits[collectionKey] : [];
    const analysis = utils.analyzeMembershipPatch(baseValues || [], latestValues, entry, present);
    window.mvpluxLiveAdminSettings = latest.edits;
    window.mvpluxLiveAdminRevision = latest.revision;
    window.mvpluxLiveAdminStateLoaded = true;
    storefrontAdminPotentiallyStale = false;
    if (!analysis.canRebase) {
      showStorefrontAdminConflict({ conflictingFields: [`${collectionKey}:${entry}`] }, null);
      return false;
    }
    const values = utils.applyMembershipPatch(latestValues, entry, present);
    const { data, error } = await getSupabaseClient().rpc('save_site_edits', {
      p_page_key: 'admin-global',
      p_edits: { [collectionKey]: values },
      p_expected_revision: latest.revision,
      p_replace: false
    });
    if (error) throw error;
    window.mvpluxLiveAdminSettings = { ...latest.edits, [collectionKey]: values, ...(data?.edits || {}) };
    window.mvpluxLiveAdminRevision = Number(data?.revision) || latest.revision + 1;
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(window.mvpluxLiveAdminSettings[collectionKey] || values));
    announceStorefrontAdminSave('admin-global', window.mvpluxLiveAdminRevision, [`${collectionKey}:${entry}`]);
    updateInlineAdminToolbarState('Saved Privately');
    return true;
  } catch (error) {
    if (String(error?.code || '') === '40001' || String(error?.message || '').includes('Admin state changed')) {
      try {
        const refreshed = await fetchAuthoritativeStorefrontAdminGlobal();
        window.mvpluxLiveAdminSettings = refreshed.edits;
        window.mvpluxLiveAdminRevision = refreshed.revision;
      } catch (_reloadError) { /* Preserve the original conflict. */ }
      showStorefrontAdminConflict({ conflictingFields: [`${collectionKey}:${entry}`] }, null);
      return false;
    }
    updateInlineAdminToolbarState(`Error — not saved: ${error?.message || error}`);
    return false;
  }
}

function saveLiveAdminSettings(patch) {
  const baseSettings = structuredClone(window.mvpluxLiveAdminSettings || {});
  const save = async () => {
    try {
      const latest = await fetchAuthoritativeStorefrontAdminGlobal();
      const utils = await adminStateUtilsPromise;
      const conflictingKeys = Object.keys(patch || {}).filter((key) => (
        !utils.valuesEqual(baseSettings[key], latest.edits[key])
        && !utils.valuesEqual(patch[key], latest.edits[key])
      ));
      window.mvpluxLiveAdminSettings = latest.edits;
      window.mvpluxLiveAdminRevision = latest.revision;
      window.mvpluxLiveAdminStateLoaded = true;
      storefrontAdminPotentiallyStale = false;
      if (conflictingKeys.length) {
        showStorefrontAdminConflict({ conflictingFields: conflictingKeys }, null);
        return false;
      }
      const { data, error } = await getSupabaseClient().rpc('save_site_edits', {
        p_page_key: 'admin-global',
        p_edits: patch || {},
        p_expected_revision: latest.revision,
        p_replace: false
      });
      if (error) throw error;
      window.mvpluxLiveAdminSettings = data?.edits || { ...latest.edits, ...(patch || {}) };
      window.mvpluxLiveAdminRevision = Number(data?.revision) || (latest.revision + 1);
      announceStorefrontAdminSave('admin-global', window.mvpluxLiveAdminRevision, Object.keys(patch || {}));
      updateInlineAdminToolbarState('Saved Privately');
      return true;
    } catch (error) {
      if (String(error?.code || '') === '40001' || String(error?.message || '').includes('Admin state changed')) {
        try {
          const refreshed = await fetchAuthoritativeStorefrontAdminGlobal();
          window.mvpluxLiveAdminSettings = refreshed.edits;
          window.mvpluxLiveAdminRevision = refreshed.revision;
        } catch (_reloadError) { /* Keep the original conflict as the reported failure. */ }
        showStorefrontAdminConflict({ conflictingFields: Object.keys(patch || {}) }, null);
      }
      updateInlineAdminToolbarState(`Error — not saved: ${error?.message || error}`);
      return false;
    }
  };
  const result = liveAdminSaveQueue.then(save, save);
  liveAdminSaveQueue = result.then(() => true, () => true);
  return result;
}

const standeeCatalog = {
  'kobe-bryant': {
    title: 'Kobe Bryant Standee',
    category: 'Sport Legend Standees',
    image: 'images/SportLegendStandees/Kobe/KB1nobackground.png',
    originalHeight: 78,
    description: 'A court-ready life-size sports display with optional printed background styles.',
    backgrounds: [
      { name: 'No Background', image: 'images/SportLegendStandees/Kobe/KB1nobackground.png', stage: 'images/FrontPageWeb/Herobackgroundparts-backgroundforimages.jpg' },
      { name: 'Yellow Court', image: 'images/SportLegendStandees/Kobe/KB1yellowcourtbackground.png', stage: 'images/SportLegendStandees/Kobe/KB1yellowcourtbackground.png' },
      { name: 'Big Court', image: 'images/SportLegendStandees/Kobe/KB1bigcourtbackground.png', stage: 'images/SportLegendStandees/Kobe/KB1bigcourtbackground.png' },
      { name: 'Small Court', image: 'images/SportLegendStandees/Kobe/KB1smallcourtbackground.png', stage: 'images/SportLegendStandees/Kobe/KB1smallcourtbackground.png' }
    ],
    facts: ['Original height reference: 6\'6".', 'Great for sports rooms, parties, and themed displays.', 'Purple and gold background options are available.', 'Custom sizes use the original height to calculate pricing.']
  },
  'basketball-center': {
    title: 'Basketball Center Standee',
    category: 'Sport Legend Standees',
    image: 'images/SportLegendStandees/Shaq/shaqNEW.png',
    originalHeight: 85,
    description: 'A larger-than-life basketball display sized from a 7-foot-plus original reference.',
    backgrounds: [
      { name: 'No Background', image: 'images/SportLegendStandees/Shaq/shaqNEW.png', stage: 'images/FrontPageWeb/Herobackgroundparts-backgroundforimages.jpg' },
      { name: 'Light/Dark Court', image: 'images/SportLegendStandees/Shaq/shaqlightdarkbackground.png', stage: 'images/SportLegendStandees/Shaq/shaqlightdarkbackground.png' },
      { name: 'Darker Look', image: 'images/SportLegendStandees/Shaq/shaqDarker.png', stage: 'images/FanBackgrounds/top-favorite-stage-premium.png' }
    ],
    facts: ['Original height reference: 7\'1".', 'Oversize displays price from the extra-inch calculator.', 'Best for sports bars, fan rooms, and entrance displays.', 'Choose a printed background or keep the cutout clean.']
  },
  'alternate-sports-pose': {
    title: 'Alternate Sports Pose Standee',
    category: 'Sport Legend Standees',
    image: 'images/SportLegendStandees/Shaq/shaqDarker.png',
    originalHeight: 85,
    description: 'A bold alternate pose for fans who want a darker showcase style.',
    backgrounds: [
      { name: 'Darker Look', image: 'images/SportLegendStandees/Shaq/shaqDarker.png', stage: 'images/FanBackgrounds/top-favorite-stage-premium.png' },
      { name: 'Light/Dark Court', image: 'images/SportLegendStandees/Shaq/shaqlightdarkbackground.png', stage: 'images/SportLegendStandees/Shaq/shaqlightdarkbackground.png' }
    ],
    facts: ['Original height reference: 7\'1".', 'Custom sizes are available from 2 feet and up.', 'A dramatic background makes the pose feel more collectible.', 'Useful for wall-side or corner displays.']
  },
  'endoskeleton-dark': {
    title: 'Endoskeleton Dark Standee',
    category: 'Movie Character Standees',
    image: 'images/MovieCharacterStandees/Endorskeleton/Endordarkinsideshouldercutout.png',
    originalHeight: 78,
    description: 'A sci-fi inspired display with darker background options.',
    backgrounds: [
      { name: 'Dark Shoulder', image: 'images/MovieCharacterStandees/Endorskeleton/Endordarkinsideshouldercutout.png', stage: 'images/FanBackgrounds/top-favorite-stage-scifi.png' },
      { name: 'No Background', image: 'images/MovieCharacterStandees/Endorskeleton/Endornobackground.png', stage: 'images/FanBackgrounds/top-favorite-stage-premium.png' },
      { name: 'White Shoulder', image: 'images/MovieCharacterStandees/Endorskeleton/Endorwhiteinsideshouldercutout.png', stage: 'images/FanBackgrounds/top-favorite-stage-gold.png' }
    ],
    facts: ['Original height reference: 6\'6".', 'Sci-fi stage options work well for theater rooms.', 'Choose clean or printed versions.', 'Custom sizing follows the same live price calculator.']
  },
  'endoskeleton-white': {
    title: 'Endoskeleton White Standee',
    category: 'Movie Character Standees',
    image: 'images/MovieCharacterStandees/Endorskeleton/Endorwhiteinsideshouldercutout.png',
    originalHeight: 78,
    description: 'A brighter sci-fi display option with clean contrast.',
    backgrounds: [
      { name: 'White Shoulder', image: 'images/MovieCharacterStandees/Endorskeleton/Endorwhiteinsideshouldercutout.png', stage: 'images/FanBackgrounds/top-favorite-stage-gold.png' },
      { name: 'Dark Shoulder', image: 'images/MovieCharacterStandees/Endorskeleton/Endordarkinsideshouldercutout.png', stage: 'images/FanBackgrounds/top-favorite-stage-scifi.png' }
    ],
    facts: ['Original height reference: 6\'6".', 'White-backed art helps details stand out.', 'Good for bright rooms and event spaces.', 'Pick original size or enter a custom height.']
  },
  'classic-horror-host': {
    title: 'Classic Horror Host Standee',
    category: 'Movie Character Standees',
    image: 'images/MovieCharacterStandees/Elvira/elviranew.png',
    originalHeight: 67,
    description: 'A classic horror-host style cutout for spooky rooms, events, and collectors.',
    backgrounds: [
      { name: 'Classic Cutout', image: 'images/MovieCharacterStandees/Elvira/elviranew.png', stage: 'images/FanBackgrounds/top-favorite-stage-premium.png' },
      { name: 'Alternate Cutout', image: 'images/MovieCharacterStandees/Elvira1/elviraforother.png', stage: 'images/FanBackgrounds/top-favorite-stage-scifi.png' }
    ],
    facts: ['Original height reference: 5\'7".', 'Great for Halloween displays and movie rooms.', 'Background choices can shift the mood quickly.', 'Smaller custom sizes are available for tables and shelves.']
  },
  'red-jacket-performer': {
    title: 'Red Jacket Performer Standee',
    category: 'Music Artist Standees',
    image: 'images/MusicArtistStandees/MichaelJackson/MJacksonTriller/MJTR/MJTR.png',
    originalHeight: 69,
    description: 'A performance-style music standee with concert and premium background options.',
    backgrounds: [
      { name: 'Clean Performer', image: 'images/MusicArtistStandees/MichaelJackson/MJacksonTriller/MJTR/MJTR.png', stage: 'images/FanBackgrounds/gallery-poster-concert.png' },
      { name: 'Triangle Stage', image: 'images/MusicArtistStandees/MichaelJackson/MJacksonTriller/MJTR/MJTRTrianglehalf.png', stage: 'images/FanBackgrounds/top-favorite-stage-concert.png' },
      { name: 'White Stage', image: 'images/MusicArtistStandees/MichaelJackson/MJacksonTriller/MJTR/MJTRTrianglehalfblank.png', stage: 'images/FanBackgrounds/top-favorite-stage-premium.png' }
    ],
    facts: ['Original height reference: 5\'9".', 'Concert backgrounds make this feel like a mini stage.', 'Works well for music rooms and birthday setups.', 'Custom size pricing comes from the entered height.']
  },
  'zombie-dance-look': {
    title: 'Zombie Dance Look Standee',
    category: 'Music Artist Standees',
    image: 'images/MusicArtistStandees/MichaelJackson/MJacksonTriller/MJTR2/MJzombie.png',
    originalHeight: 69,
    description: 'A dance-inspired music display with spooky performance energy.',
    backgrounds: [
      { name: 'Zombie Look', image: 'images/MusicArtistStandees/MichaelJackson/MJacksonTriller/MJTR2/MJzombie.png', stage: 'images/FanBackgrounds/top-favorite-stage-scifi.png' },
      { name: 'Alternate Zombie', image: 'images/MusicArtistStandees/MichaelJackson/MJacksonTriller/MJTR1/MJzombie1.png', stage: 'images/FanBackgrounds/gallery-poster-concert.png' }
    ],
    facts: ['Original height reference: 5\'9".', 'A strong pick for music and Halloween themes.', 'Choose a darker or concert-style background.', 'The size picker can make mini versions too.']
  },
  'pop-star-look': {
    title: 'Pop Star Look Standee',
    category: 'Music Artist Standees',
    image: 'images/MusicArtistStandees/TaylorSwift/TSfinal.png',
    originalHeight: 71,
    description: 'A pop performance display with colorful, pink, and clean background choices.',
    backgrounds: [
      { name: 'Clean Pop Look', image: 'images/MusicArtistStandees/TaylorSwift/TSfinal.png', stage: 'images/FanBackgrounds/gallery-poster-concert.png' },
      { name: 'Colorful', image: 'images/MusicArtistStandees/TaylorSwift/TSfinalcolorfulbackground.png', stage: 'images/MusicArtistStandees/TaylorSwift/TSfinalcolorfulbackground.png' },
      { name: 'Off White', image: 'images/MusicArtistStandees/TaylorSwift/TSfinaloffwhitebackground.png', stage: 'images/MusicArtistStandees/TaylorSwift/TSfinaloffwhitebackground.png' },
      { name: 'Pink', image: 'images/MusicArtistStandees/TaylorSwift/Taylor12pink.png', stage: 'images/MusicArtistStandees/TaylorSwift/Taylor12pink.png' }
    ],
    facts: ['Original height reference: 5\'11".', 'Colorful backgrounds work well for party photos.', 'Original and custom sizes update live.', 'A clean cutout version is available for simple displays.']
  },
  'celebration-display': {
    title: 'Celebration Display Standee',
    category: 'Faith & Celebration Standees',
    image: 'images/FaithCelebrationStandees/Jesus1/J13D.png',
    originalHeight: 72,
    description: 'A warm celebration display for faith events, holidays, and family gatherings.',
    backgrounds: [
      { name: 'Celebration', image: 'images/FaithCelebrationStandees/Jesus1/J13D.png', stage: 'images/FanBackgrounds/top-favorite-stage-gold.png' },
      { name: 'Light', image: 'images/FaithCelebrationStandees/Jesus1/J13LN.png', stage: 'images/FanBackgrounds/top-favorite-stage-premium.png' },
      { name: 'Print', image: 'images/FaithCelebrationStandees/Jesus3/JesusPrint.png', stage: 'images/FanBackgrounds/gallery-poster-premium.png' }
    ],
    facts: ['Original height reference: 6\'.', 'Good for church events and home displays.', 'Gold and premium backgrounds are available.', 'Custom sizes help fit smaller rooms.']
  },
  't-rex': {
    title: 'T-Rex Standee',
    category: 'Dinosaur & Animal Standees',
    image: 'images/DinosaurCreatureStandees/JPRex.png',
    originalHeight: 72,
    description: 'A dinosaur or animal-style display with adventure background options.',
    backgrounds: [
      { name: 'T-Rex', image: 'images/DinosaurCreatureStandees/JPRex.png', stage: 'images/FanBackgrounds/gallery-poster-adventure.png' },
      { name: 'Clean T-Rex', image: 'images/FrontPageWeb/Dinosaurs-JPRex-clean.png', stage: 'images/FanBackgrounds/top-favorite-stage-gold.png' },
      { name: 'Dinosaur Group', image: 'images/DinosaurCreatureStandees/JPall.png', stage: 'images/FanBackgrounds/top-favorite-stage-premium.png' }
    ],
    facts: ['Original height reference: 6\'.', 'Popular for birthdays and adventure rooms.', 'Group dinosaur art is available as another option.', 'Custom sizing can make a smaller party version.']
  }
};

Object.entries(standeeCatalog).forEach(([slug, product]) => {
  product.slug = slug;
});

const sportsStandeeCatalog = {
  'kobe-bryant': {
    name: 'Kobe Bryant',
    sport: 'Basketball Standee',
    description: 'Original clean cutout with optional printed court background versions.',
    originalHeight: 78,
    displayFit: { imageHeight: '80%', imageBottom: '13%' },
    facts: ['Original size: 6\'6"', 'Basketball', 'Options: 4 images'],
    options: [
      { label: 'No Background', image: 'images/SportLegendStandees/Kobe/KB1nobackground.png' },
      { label: 'Yellow Court', image: 'images/SportLegendStandees/Kobe/KB1yellowcourtbackground.png' },
      { label: 'Big Court', image: 'images/SportLegendStandees/Kobe/KB1bigcourtbackground.png' },
      { label: 'Small Court', image: 'images/SportLegendStandees/Kobe/KB1smallcourtbackground.png' }
    ]
  },
  shaq: {
    name: 'Shaquille O\'Neal',
    sport: 'Basketball Standee',
    description: 'Large basketball standee with clean and court-style display choices.',
    originalHeight: 85,
    displayFit: { imageHeight: '88%', imageBottom: '5%' },
    facts: ['Original size: 7\'1"', 'Basketball', 'Options: 3 images'],
    options: [
      { label: 'No Background', image: 'images/SportLegendStandees/Shaq/shaqNEW.png' },
      { label: 'Light/Dark Court', image: 'images/SportLegendStandees/Shaq/shaqlightdarkbackground.png' },
      { label: 'Darker Style', image: 'images/SportLegendStandees/Shaq/shaqDarker.png' }
    ]
  },
  'michael-jordan': {
    name: 'Michael Jordan',
    sport: 'Basketball Standee',
    description: 'Jump pose standee with clean, crowd, and light crowd image choices.',
    originalHeight: 78,
    displayFit: { imageHeight: '86%', imageBottom: '5%' },
    facts: ['Original size: 6\'6"', 'Basketball', 'Options: 3 images'],
    options: [
      { label: 'No Background', image: 'images/SportLegendStandees/MJordan/MJLAYUP1/Jordanemptybackground.png' },
      { label: 'Crowd', image: 'images/SportLegendStandees/MJordan/MJLAYUP1/Jordanregularcrowd.png' },
      { label: 'Light Crowd', image: 'images/SportLegendStandees/MJordan/MJLAYUP1/Jordanregularlightcrowd.png' }
    ]
  },
  'michael-jordan-layup': {
    name: 'Michael Jordan Layup',
    sport: 'Basketball Standee',
    description: 'Second Jordan image set with blue, white, light, and image-background choices.',
    originalHeight: 78,
    displayFit: { imageHeight: '86%', imageBottom: '5%' },
    facts: ['Original size: 6\'6"', 'Basketball', 'Options: 4 images'],
    options: [
      { label: 'No Background', image: 'images/SportLegendStandees/MJordan/MJLAYUP/Jordantofixlblueightlowres.png' },
      { label: 'Image Background', image: 'images/SportLegendStandees/MJordan/MJLAYUP/Jordanonimagebackground.png' },
      { label: 'Light Background', image: 'images/SportLegendStandees/MJordan/MJLAYUP/Jordanonlightbackground.png' },
      { label: 'White Background', image: 'images/SportLegendStandees/MJordan/MJLAYUP/Jordanonwhitebackground.png' }
    ]
  },
  'lionel-messi': {
    name: 'Lionel Messi',
    sport: 'Soccer Standee',
    description: 'Soccer standee set with no-background, grass, and white image choices.',
    originalHeight: 67,
    displayFit: { imageHeight: '94%' },
    facts: ['Original size: 5\'7"', 'Soccer', 'Options: 3 images'],
    options: [
      { label: 'No Background', image: 'images/SportLegendStandees/Messi/Messi2nobackground.png' },
      { label: 'Grass', image: 'images/SportLegendStandees/Messi/Messi2Grass.png' },
      { label: 'White', image: 'images/SportLegendStandees/Messi/Messi2white.png' }
    ]
  },
  'lionel-messi-classic': {
    name: 'Lionel Messi Classic',
    sport: 'Soccer Standee',
    description: 'Second Messi image set with clean, grass, smaller grass, and white choices.',
    originalHeight: 67,
    displayFit: { imageHeight: '94%' },
    facts: ['Original size: 5\'7"', 'Soccer', 'Options: 4 images'],
    options: [
      { label: 'No Background', image: 'images/SportLegendStandees/Messi/Messinnone.png' },
      { label: 'Grass', image: 'images/SportLegendStandees/Messi/MessiGrass.png' },
      { label: 'Smaller Grass', image: 'images/SportLegendStandees/Messi/MessiGrasssmaller.png' },
      { label: 'White', image: 'images/SportLegendStandees/Messi/Messiwhite.png' }
    ]
  },
  'tom-brady': {
    name: 'Tom Brady',
    sport: 'Football Standee',
    description: 'Football standee with no-background, green background, and white background choices.',
    originalHeight: 76,
    displayFit: { imageHeight: '88%', imageBottom: '5%' },
    facts: ['Original size: 6\'4"', 'Football', 'Options: 3 images'],
    options: [
      { label: 'No Background', image: 'images/SportLegendStandees/TomBrady/TB12Nobackground.png' },
      { label: 'Green Background', image: 'images/SportLegendStandees/TomBrady/TB12Greenbackground.png' },
      { label: 'White Background', image: 'images/SportLegendStandees/TomBrady/TB12Whitebackground.png' }
    ]
  }
};

let selectedSportsStandeeKey = 'kobe-bryant';

function getShowroomStageBackground() {
  return 'images/FrontPageWeb/Herobackgroundparts-backgroundforimages.jpg';
}

function getShowroomOriginalPrice(originalHeight) {
  return calculateCutoutPrice(resolveSellableProductHeight(originalHeight));
}

function findWhiteTriangleImage(options = []) {
  const match = options.find((option) => {
    const value = `${option?.label || option?.name || ''} ${option?.image || ''}`.toLowerCase();
    return value.includes('triangle') && value.includes('white');
  }) || options.find((option) => {
    const value = `${option?.label || option?.name || ''} ${option?.image || ''}`.toLowerCase();
    return value.includes('triangle');
  });

  return match?.image || '';
}

function showroomPurchaseMarkup(productName = 'Selected Standee', originalHeight = 78, slug = '') {
  const height = resolveSellableProductHeight(originalHeight);
  const price = getShowroomOriginalPrice(height);
  const radioName = `${getStandeeSlug(slug || productName) || 'selected'}ShowroomSizeMode`;
  return `
    <div class="showroom-size-builder size-builder" data-product-name="${productName}" data-admin-slug="${getStandeeSlug(slug || productName)}" data-original-price="${price}" data-original-height="${height}">
      <div class="showroom-size-buttons">
        <label class="showroom-size-button active">
          <input type="radio" name="${radioName}" value="original" checked>
          <span>Original ${formatHeight(height)}</span>
        </label>
        <label class="showroom-size-button">
          <input type="radio" name="${radioName}" value="custom">
          <span>Custom Size</span>
        </label>
      </div>
      <div class="custom-size-box">
        <input class="custom-height-input" type="text" placeholder="Type height: 5'8 or 68">
      </div>
      <p class="live-price-line">Price: <span class="live-size-price">${formatMoney(price)}</span></p>
    </div>
    <div class="showroom-action-row standee-action-row">
      <button type="button" onclick="buySelectedNow(this)">Buy Now</button>
      <button type="button" onclick="addSelectedToCart(this)" aria-label="Add to cart" title="Add to cart">🛒</button>
      <button type="button" class="offer-btn" onclick="openSelectedOffer(this)">Offer Now</button>
    </div>
  `;
}

function updateShowroomPurchase(state, productName, originalHeight, slug) {
  if (!state?.builder) return;
  const height = resolveSellableProductHeight(originalHeight, state.builder);
  const price = getShowroomOriginalPrice(height);
  const productSlug = getStandeeSlug(slug || productName);
  state.builder.dataset.productName = productName;
  state.builder.dataset.adminSlug = productSlug;
  state.builder.dataset.originalHeight = String(height);
  state.builder.dataset.originalPrice = String(price);
  const priceOverride = getAdminProducts()[productSlug]?.priceOverride;
  if (priceOverride !== undefined && priceOverride !== null && priceOverride !== '') {
    state.builder.dataset.originalPriceOverride = String(priceOverride);
  } else {
    delete state.builder.dataset.originalPriceOverride;
  }

  const radios = state.builder.querySelectorAll('.showroom-size-buttons input[type="radio"]');
  radios.forEach((radio) => {
    radio.name = `${productSlug || 'selected'}ShowroomSizeMode`;
    radio.checked = radio.value === 'original';
    radio.closest('.showroom-size-button')?.classList.toggle('active', radio.value === 'original');
  });
  state.builder.classList.remove('custom-active');
  const input = state.builder.querySelector('.custom-height-input');
  if (input) input.value = '';
  const customLabel = state.builder.querySelector('input[value="custom"]')?.closest('label')?.querySelector('span');
  if (customLabel) {
    customLabel.textContent = 'Custom Size';
    delete customLabel.dataset.customPrice;
  }
  const finishInputs = state.builder.querySelectorAll('.finish-choice input');
  finishInputs.forEach((input, index) => {
    input.checked = index === 0;
    input.closest('.finish-choice')?.classList.toggle('active', index === 0);
  });
  state.builder.querySelector('.finish-builder')?.remove();
  ensureFinishChoices(state.builder);
  updateBuilderOriginalDisplay(state.builder);
}

function initializeSellableProductPricing(root = document) {
  root.querySelectorAll?.('.size-builder').forEach((builder) => {
    if (builder.closest('[data-homepage-category-fallback][hidden]')) return;
    applyAdminProductOverrides(builder);
    const height = resolveSellableProductHeight(builder.dataset.originalHeight, builder);
    builder.dataset.originalHeight = String(height);
    updateBuilderOriginalDisplay(builder);
  });
}

function refreshCategoryShowroomPricing() {
  document.querySelectorAll('.sports-showroom .size-builder, .generic-showroom .size-builder').forEach((builder) => {
    applyAdminProductOverrides(builder);
    refreshBuilderPrice(builder);
  });
}

function selectSportsOption(index) {
  const product = sportsStandeeCatalog[selectedSportsStandeeKey];
  const option = product?.options?.[index];
  const mainStage = document.getElementById('sportsMainStage');
  const mainImage = document.getElementById('sportsMainImage');

  if (!product || !option || !mainStage || !mainImage) return;

  mainStage.style.backgroundImage = `url('${option.stage || product.backgroundImage || getShowroomStageBackground()}')`;
  mainStage.style.setProperty('--showroom-image-height', product.displayFit?.imageHeight || '80%');
  mainImage.src = option.image;
  mainImage.alt = `${product.name} ${option.label} standee preview`;
  mainImage.onload = () => {
    const isWideImage = mainImage.naturalWidth / Math.max(mainImage.naturalHeight, 1) > 0.62;
    mainStage.classList.toggle('wide-standee-image', isWideImage);
  };
  if (mainImage.complete) mainImage.onload();

  document.querySelectorAll('#sportsOptionStrip button').forEach((button, buttonIndex) => {
    button.classList.toggle('active', buttonIndex === index);
  });
}

function selectSportsStandee(key, shouldScroll = true) {
  const managed = getManagedProductBySlug(key);
  const catalogProduct = sportsStandeeCatalog[key];
  const managedChoices = sanitizeProductImageChoices(managed?.imageChoices)
    .filter((choice) => choice.image !== managed?.cutoutImage);
  const product = catalogProduct ? {
    ...catalogProduct,
    name: managed?.title || catalogProduct.name,
    description: managed?.description || catalogProduct.description,
    originalHeight: managed?.originalHeight || catalogProduct.originalHeight,
    backgroundImage: managed?.backgroundImage || catalogProduct.backgroundImage,
    options: sanitizeProductImageChoices([
      ...catalogProduct.options.map((option, index) => (
        index === 0 && managed?.cutoutImage ? { ...option, image: managed.cutoutImage } : option
      )),
      ...managedChoices
    ])
  } : (managed ? {
    name: managed.title,
    sport: 'Sports Standee',
    description: managed.description,
    originalHeight: managed.originalHeight,
    backgroundImage: managed.backgroundImage,
    displayFit: {},
    facts: [
      `Original size: ${formatHeight(managed.originalHeight || 78)}`,
      'Sports',
      managedChoices.length ? `Options: ${managedChoices.length + 1} images` : 'Primary image'
    ],
    options: [{ label: 'Main image', image: managed.cutoutImage }, ...managedChoices]
  } : null);
  const optionStrip = document.getElementById('sportsOptionStrip');
  if (!product || !optionStrip) return;

  sportsStandeeCatalog[key] = product;
  selectedSportsStandeeKey = key;

  const sport = document.getElementById('sportsSelectedSport');
  const name = document.getElementById('sportsSelectedName');
  const description = document.getElementById('sportsSelectedDescription');
  const facts = document.getElementById('sportsSelectedFacts');
  const builder = document.getElementById('sportsSizeBuilder');

  if (sport) sport.textContent = product.sport;
  if (name) name.textContent = product.name;
  if (description) description.textContent = product.description;
  if (facts) facts.innerHTML = product.facts.map((fact) => `<span>${fact}</span>`).join('');
  if (builder) {
    builder.dataset.whiteTriangleImage = findWhiteTriangleImage(product.options);
    if (!builder.dataset.whiteTriangleImage) delete builder.dataset.whiteTriangleImage;
    updateShowroomPurchase({ builder }, product.name, product.originalHeight, key);
  }

  optionStrip.innerHTML = product.options.map((option, index) => `
    <button type="button" class="${index === 0 ? 'active' : ''}" onclick="selectSportsOption(${index})">
      <img src="${option.image}" alt="${product.name} ${option.label} option">
      <span>${option.label}</span>
    </button>
  `).join('');
  const sportsChoiceSection = optionStrip.closest('.sports-choice-section') || optionStrip.parentElement;
  if (sportsChoiceSection) sportsChoiceSection.hidden = product.options.length <= 1;

  document.querySelectorAll('[data-sports-player]').forEach((card) => {
    card.classList.toggle('active', card.dataset.sportsPlayer === key);
  });

  selectSportsOption(0);
  applyInlineAdminEdits();
  updateCategoryGroupCurrentProduct(key);
  if (shouldScroll) document.querySelector('.sports-showroom')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bindSportsShowroomClicks() {
  if (!document.querySelector('.sports-showroom') || document.body.dataset.sportsShowroomClicksReady) return;
  document.body.dataset.sportsShowroomClicksReady = 'true';

  document.addEventListener('click', (event) => {
    if (event.target.closest?.('.admin-anywhere-toolbar')) return;
    const sportJump = event.target.closest?.('[data-sport-jump]');
    if (sportJump) {
      event.preventDefault();
      const section = document.getElementById(sportJump.dataset.sportJump);
      selectSportsStandee(sportJump.dataset.sportsPlayer, false);
      if (section) {
        const headerHeight = document.querySelector('.top-nav')?.getBoundingClientRect().height || 0;
        const top = section.getBoundingClientRect().top + window.scrollY - headerHeight - 16;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
      return;
    }
    const playerCard = event.target.closest?.('[data-sports-player]');
    if (playerCard && !playerCard.matches('[data-sport-jump]') && !event.target.closest?.('button')) {
      event.preventDefault();
      selectSportsStandee(playerCard.dataset.sportsPlayer);
    }
  });
}

function initSportsShowroom() {
  if (!document.getElementById('sportsOptionStrip')) return;
  const showroom = document.querySelector('.sports-showroom');
  if (showroom && !showroom.id) showroom.id = 'selected-standee';
  const params = new URLSearchParams(window.location.search);
  const player = params.get('player');
  const startingKey = sportsStandeeCatalog[player] ? player : selectedSportsStandeeKey;
  selectSportsStandee(startingKey, false);
}

function initializeCategoryShowroomExperience() {
  renderManagedCategoryPageProducts();
  setupDynamicCategoryPage();
  setupGenericCategoryShowroom();
  initSportsShowroom();
  refreshCategoryShowroomPricing();
}

function getGenericCategoryFallbackStage() {
  return getShowroomStageBackground();
}

function getGenericCategoryOptionLabel(index, src) {
  if (index === 0) return 'No Background';
  const file = String(src || '').split('/').pop()?.replace(/\.[^.]+$/, '') || `Option ${index + 1}`;
  return file
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isNoBackgroundOption(option) {
  const value = `${option?.label || option?.name || ''} ${option?.image || ''}`.toLowerCase();
  return /no\s*background|nobackground|\bnone\b|\bclean\b/.test(value);
}

function getKnownStandeeForCard(card) {
  const title = card.querySelector('h3')?.textContent.trim() || '';
  const slug = card.dataset.productId || getStandeeSlug(title);
  const managed = getManagedProductBySlug(slug);
  const detailed = standeeCatalog[slug];
  return detailed ? {
    ...detailed,
    ...managed,
    backgrounds: detailed.backgrounds,
    imageChoices: sanitizeProductImageChoices(managed?.imageChoices),
    slug
  } : managed;
}

function getCurrentProductCategory() {
  const requested = new URLSearchParams(window.location.search).get('category');
  if (requested && getAdminCategories()[requested]) return requested;
  const file = window.location.pathname.split('/').pop() || 'index.html';
  return (window.MVPLUX_PRODUCT_CATEGORIES || []).find((category) => (
    category.page === file || category.pages?.includes(file)
  ))?.key || Object.values(getAdminCategories()).find((category) => String(category.page || '').split('?')[0] === file)?.key || '';
}

function setupDynamicCategoryPage() {
  if (!document.body.matches('[data-dynamic-category-page]')) return;
  const category = getAdminCategories()[getCurrentProductCategory()];
  if (!category) return;
  if (category.visible === false) {
    const page = document.querySelector('.category-page');
    if (page) page.innerHTML = '<section class="category-hero"><h1>Category unavailable</h1><p>This collection is not currently available.</p></section>';
    document.title = 'Category Unavailable | MVPLUXCREATIONS';
    return;
  }
  const heading = document.querySelector('.category-hero h1');
  const intro = document.querySelector('.category-hero p');
  const page = document.querySelector('.category-page');
  if (page) page.dataset.adminCategoryKey = category.key;
  if (heading) heading.dataset.adminCategoryField = 'title';
  if (intro) intro.dataset.adminCategoryField = 'description';
  if (heading) heading.textContent = category.title || category.key;
  if (intro) intro.textContent = category.description || 'Choose a standee and preview the available display options.';
  document.title = `${category.title || category.key} | MVPLUXCREATIONS`;
}

function homepageCategoryRecords(categories = getAdminCategories()) {
  return Object.values(categories || {})
    .filter((category) => category && !category.parentKey && category.visible !== false && category.homepageVisible !== false)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0) || String(left.title || left.key).localeCompare(String(right.title || right.key)));
}

function renderNormalizedHomepageCategoryCards() {
  if (inlineAdminPageKey() !== 'index.html') return;
  const grid = document.getElementById('homepageCategoryGrid');
  if (!grid) return;
  const fallback = document.querySelector('[data-homepage-category-fallback]');
  const categories = homepageCategoryRecords();
  grid.replaceChildren();
  if (!categories.length) {
    grid.hidden = true;
    if (fallback) fallback.hidden = false;
    return false;
  }
  try {
    categories.forEach((category) => {
      const presentation = getEffectiveCategoryPresentation(category.key);
      const layout = window.MVPLUX_CATEGORY_PRESENTATION.resolveCategoryCardLayout(presentation);
      const slug = Object.entries(STOREFRONT_CATEGORY_CARD_MAP).find(([, key]) => key === category.key)?.[0]
        || `${category.key}-category-card`;
      const page = presentation.page || `category.html?category=${encodeURIComponent(category.key)}`;
      grid.insertAdjacentHTML('beforeend', `
        <article class="product-card admin-master-category-card" data-admin-category-key="${escapeHtml(category.key)}" data-admin-slug="${escapeHtml(slug)}" data-category="${escapeHtml(category.key)}" data-name="${escapeHtml(`${presentation.title} ${presentation.description}`)}">
          <a href="${escapeHtml(page)}" class="product-image-link"><div class="product-stage-preview admin-category-storefront-stage"><span class="category-background-layer" style="background-image:url('${escapeHtml(presentation.background)}');background-position:${escapeHtml(layout.backgroundPosition)};transform:scale(${layout.backgroundScale})" aria-hidden="true"></span>${presentation.image ? `<img class="product-cutout" src="${escapeHtml(presentation.image)}" alt="${escapeHtml(presentation.title)}" style="height:${layout.imageSizePercent}%;left:${layout.imageLeftPercent}%;bottom:${layout.imageBottomPercent}%">` : ''}</div></a>
          <h3 data-admin-category-field="title" style="transform:${layout.titleTransform};text-align:${layout.titleAlign}"><a href="${escapeHtml(page)}" class="product-title-link" style="text-align:inherit;font-size:${layout.titleFontSizePx}px">${escapeHtml(presentation.title)}</a></h3>
          <p class="product-description" data-admin-category-field="description" style="transform:${layout.descriptionTransform};text-align:${layout.descriptionAlign};font-size:${layout.descriptionFontSizePx}px">${escapeHtml(presentation.description)}</p>
          <a class="button-link" href="${escapeHtml(page)}">View Collection</a>
        </article>`);
    });
    grid.hidden = false;
    if (fallback) fallback.hidden = true;
    return true;
  } catch (error) {
    grid.replaceChildren();
    grid.hidden = true;
    if (fallback) fallback.hidden = false;
    console.error('Normalized homepage Category rendering failed; showing the emergency fallback.', error);
    return false;
  }
}

function managedCategoryCardMarkup(product) {
  return `
    <article class="category-card" data-product-id="${product.slug}" data-admin-card-key="${product.slug}">
      <img src="${product.cutoutImage}" alt="${product.title} standee">
      <h3>${product.title}</h3>
      <button type="button">Select Standee</button>
    </article>
  `;
}

function visibleCategoryChildGroups(masterKey) {
  return Object.values(getAdminCategories())
    .filter((category) => category?.parentKey === masterKey && category.visible !== false)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0)
      || String(left.title || left.key).localeCompare(String(right.title || right.key)));
}

function categoryGroupHref(groupKey = '') {
  const url = new URL(window.location.href);
  if (groupKey) url.searchParams.set('group', groupKey);
  else url.searchParams.delete('group');
  return `${url.pathname}${url.search}${url.hash}`;
}

function categoryGroupState(masterKey) {
  const children = visibleCategoryChildGroups(masterKey);
  const requestedKey = new URLSearchParams(window.location.search).get('group') || '';
  const activeChild = children.find((category) => category.key === requestedKey) || null;
  const requestedCategory = requestedKey ? getAdminCategories()[requestedKey] : null;
  const hiddenRequestedChild = Boolean(requestedCategory?.parentKey === masterKey && requestedCategory.visible === false);
  const invalidRequestedGroup = Boolean(requestedKey && !activeChild && !hiddenRequestedChild);
  return {
    children,
    requestedKey: invalidRequestedGroup ? '' : requestedKey,
    activeChild,
    unavailable: hiddenRequestedChild,
    invalidRequestedGroup
  };
}

function renderCategoryGroupNavigation(page, masterKey, state) {
  let nav = page.querySelector('[data-category-group-nav]');
  const legacySportsNavigation = masterKey === 'sports' ? page.querySelector('.sport-type-carousel') : null;
  if (!state.children.length && !state.requestedKey) {
    nav?.remove();
    if (legacySportsNavigation) legacySportsNavigation.hidden = false;
    return;
  }
  if (legacySportsNavigation) legacySportsNavigation.hidden = state.children.length > 0;
  if (!nav) {
    nav = document.createElement('nav');
    nav.className = 'category-group-nav';
    nav.dataset.categoryGroupNav = masterKey;
    nav.setAttribute('aria-label', 'Child Groups');
    const hero = page.querySelector('.category-hero');
    if (hero) hero.insertAdjacentElement('afterend', nav);
    else page.prepend(nav);
  }
  nav.innerHTML = [
    `<a href="${escapeHtml(categoryGroupHref())}" data-category-group-link="" class="${state.requestedKey ? '' : 'active'}">All</a>`,
    ...state.children.map((child) => `<a href="${escapeHtml(categoryGroupHref(child.key))}" data-category-group-link="${escapeHtml(child.key)}" class="${state.activeChild?.key === child.key ? 'active' : ''}">${escapeHtml(child.title || child.key)}</a>`)
  ].join('');
}

function productsForCategoryGroup(products, masterKey, childKey = '') {
  const unique = new Map();
  products.forEach((product) => {
    const assignments = new Set(Array.isArray(product?.categories) ? product.categories : []);
    if (!product?.slug || product.visible === false || !assignments.has(masterKey) || (childKey && !assignments.has(childKey))) return;
    if (!unique.has(product.slug)) unique.set(product.slug, product);
  });
  return [...unique.values()];
}

function orderedCategoryProducts(products, orderKey) {
  return [...products].sort((left, right) => {
    const leftOrder = Number(left.categoryOrder?.[orderKey]);
    const rightOrder = Number(right.categoryOrder?.[orderKey]);
    return (Number.isFinite(leftOrder) ? leftOrder : Number.MAX_SAFE_INTEGER)
      - (Number.isFinite(rightOrder) ? rightOrder : Number.MAX_SAFE_INTEGER)
      || String(left.title || left.slug).localeCompare(String(right.title || right.slug));
  });
}

function rotateCategoryDiscovery(products, offset = 0) {
  if (products.length < 2) return [...products];
  const start = ((Number(offset) || 0) % products.length + products.length) % products.length;
  return [...products.slice(start), ...products.slice(0, start)];
}

function categoryDiscoveryRotation(masterKey, childKey, length) {
  if (length < 2) return 0;
  const dailyKey = `${masterKey}:${childKey}:${new Date().toISOString().slice(0, 10)}`;
  return [...dailyKey].reduce((total, character) => total + character.charCodeAt(0), 0) % length;
}

function categoryGroupDiscovery(masterKey, childKey, currentSlug = '', products = getManagedProductCatalog(), categories = getAdminCategories(), limit = 4, rotation = null) {
  const child = categories[childKey];
  if (!childKey || child?.parentKey !== masterKey || child.visible === false) return { primary: [], secondary: [] };
  const primary = orderedCategoryProducts(productsForCategoryGroup(products, masterKey, childKey), childKey)
    .filter((product) => product.slug !== currentSlug);
  const used = new Set([currentSlug, ...primary.map((product) => product.slug)]);
  const visibleSiblingKeys = new Set(Object.values(categories)
    .filter((category) => category?.parentKey === masterKey && category.key !== childKey && category.visible !== false)
    .map((category) => category.key));
  const candidates = orderedCategoryProducts(productsForCategoryGroup(products, masterKey), masterKey)
    .filter((product) => product?.slug && !used.has(product.slug));
  const siblingProducts = candidates.filter((product) => (product.categories || []).some((key) => visibleSiblingKeys.has(key)));
  const ungroupedProducts = candidates.filter((product) => !(product.categories || []).some((key) => visibleSiblingKeys.has(key)));
  const offset = rotation === null ? categoryDiscoveryRotation(masterKey, childKey, Math.max(siblingProducts.length, ungroupedProducts.length)) : rotation;
  const secondary = [
    ...rotateCategoryDiscovery(siblingProducts, offset),
    ...rotateCategoryDiscovery(ungroupedProducts, offset)
  ].slice(0, Math.max(0, limit));
  return { primary, secondary };
}

function categoryCollectionTitle(value, prefix = 'More') {
  const title = String(value || 'Standees').trim();
  return `${prefix} ${/standees$/i.test(title) ? title : `${title} Standees`}`;
}

function categoryDiscoveryCardMarkup(product) {
  return `<a class="standee-related-card" href="standee.html?item=${encodeURIComponent(product.slug)}" data-related-product-slug="${escapeHtml(product.slug)}">
    <img src="${escapeHtml(product.cutoutImage || product.image || '')}" alt="${escapeHtml(product.title || product.slug)}">
    <strong>${escapeHtml(product.title || product.slug)}</strong>
    <span>View Product</span>
  </a>`;
}

function renderCategoryGroupDiscovery(page, masterKey, state, currentSlug) {
  page.querySelector('[data-category-group-discovery]')?.remove();
  const panel = masterKey === 'sports' ? page.querySelector('.sports-roster-panel') : page.querySelector('.category-panel');
  const heading = panel?.querySelector('h2');
  if (!state.activeChild) {
    if (heading?.dataset.defaultCategoryHeading) heading.textContent = heading.dataset.defaultCategoryHeading;
    return;
  }
  if (heading) {
    heading.dataset.defaultCategoryHeading ||= heading.textContent || 'Available Standees';
    heading.textContent = categoryCollectionTitle(state.activeChild.title || state.activeChild.key);
  }
  const discovery = categoryGroupDiscovery(masterKey, state.activeChild.key, currentSlug, getManagedProductCatalog(), getAdminCategories());
  if (!discovery.secondary.length || !panel) return;
  panel.insertAdjacentHTML('afterend', `<section class="category-panel category-group-discovery" data-category-group-discovery>
    <h2>${escapeHtml(categoryCollectionTitle(getAdminCategories()[masterKey]?.title || masterKey, 'Explore More'))}</h2>
    <div class="standee-related-grid">${discovery.secondary.map(categoryDiscoveryCardMarkup).join('')}</div>
  </section>`);
}

function updateCategoryGroupCurrentProduct(currentSlug) {
  const masterKey = getCurrentProductCategory();
  const state = masterKey ? categoryGroupState(masterKey) : null;
  if (!state?.activeChild) return;
  const page = document.querySelector('.category-page');
  const grid = masterKey === 'sports' ? page?.querySelector('.sports-player-grid') : page?.querySelector('.category-panel .category-grid');
  grid?.querySelectorAll('[data-product-id]').forEach((card) => {
    card.hidden = card.dataset.productId === currentSlug;
  });
}

function bindCategoryGroupNavigation() {
  if (document.documentElement.dataset.categoryGroupNavigationBound) return;
  document.documentElement.dataset.categoryGroupNavigationBound = 'true';
  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-category-group-link]');
    if (!link) return;
    event.preventDefault();
    window.history.pushState({}, '', link.href);
    renderManagedCategoryPageProducts();
  });
  window.addEventListener('popstate', () => renderManagedCategoryPageProducts());
}

function renderManagedCategoryPageProducts() {
  const category = getCurrentProductCategory();
  const page = document.querySelector('.category-page');
  if (!category || !page) return;
  if (getAdminCategories()[category]?.visible === false) {
    page.innerHTML = '<section class="category-hero"><h1>Category unavailable</h1><p>This collection is not currently available.</p></section>';
    return;
  }

  const groupState = categoryGroupState(category);
  renderCategoryGroupNavigation(page, category, groupState);
  bindCategoryGroupNavigation();

  const orderKey = groupState.activeChild?.key || category;
  const products = orderedCategoryProducts(productsForCategoryGroup(getManagedProductCatalog(), category, groupState.activeChild?.key || ''), orderKey);
  const currentBuilderSlug = page.querySelector('.showroom-size-builder')?.dataset.adminSlug || '';
  const currentSlug = products.some((product) => product.slug === currentBuilderSlug) ? currentBuilderSlug : products[0]?.slug || '';
  if (groupState.unavailable) renderCategoryGroupDiscovery(page, category, { ...groupState, activeChild: null }, '');

  if (category === 'sports') {
    const grid = page.querySelector('.sports-player-grid');
    if (!grid) return;
    if (groupState.unavailable) {
      grid.innerHTML = '<p class="category-group-unavailable">This Child Group is not available.</p>';
      return;
    }
    grid.innerHTML = products.map((product) => `
      <article class="category-card sports-player-card" data-sports-player="${product.slug}" data-product-id="${product.slug}" data-admin-card-key="${product.slug}">
        <img src="${product.cutoutImage}" alt="${product.title} standee">
        <h3>${product.title}</h3>
        <button type="button" onclick="selectSportsStandee('${product.slug}')">Select Standee</button>
      </article>
    `).join('');
    grid.querySelector('.sports-player-card')?.classList.add('active');
    renderCategoryGroupDiscovery(page, category, groupState, currentSlug);
    if (groupState.activeChild && currentSlug) {
      selectSportsStandee(currentSlug, false);
      updateCategoryGroupCurrentProduct(currentSlug);
    }
    return;
  }

  const grid = page.querySelector('.category-panel .category-grid');
  if (!grid) return;
  if (groupState.unavailable) {
    grid.innerHTML = '<p class="category-group-unavailable">This Child Group is not available.</p>';
    return;
  }
  grid.innerHTML = products.map(managedCategoryCardMarkup).join('');
  renderCategoryGroupDiscovery(page, category, groupState, currentSlug);
  if (document.querySelector('.generic-showroom')) setupGenericCategoryShowroom({ rebuild: true, selectedSlug: currentSlug });
}

function renderGenericCategoryOptions(state, options) {
  state.optionStrip.innerHTML = options.map((option, index) => `
    <button type="button" class="${index === 0 ? 'active' : ''}" data-generic-option-index="${index}">
      <img src="${option.image}" alt="${option.label}">
      <span>${option.label}</span>
    </button>
  `).join('');
}

function selectGenericCategoryOption(state, options, index) {
  const option = options[index];
  if (!option) return;

  state.stage.style.backgroundImage = `url('${option.stage || getGenericCategoryFallbackStage()}')`;
  state.image.src = option.image;
  state.image.alt = `${state.name.textContent} ${option.label} preview`;

  state.optionStrip.querySelectorAll('[data-generic-option-index]').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.genericOptionIndex) === index);
  });
}

function buildGenericCategoryOptions(card, backgroundImages) {
  const product = getKnownStandeeForCard(card);
  const imageChoices = sanitizeProductImageChoices(product?.imageChoices)
    .filter((choice) => choice.image !== product?.cutoutImage);
  if (product?.cutoutImage && imageChoices.length) {
    const primaryChoice = product.backgrounds?.find((choice) => choice.image === product.cutoutImage);
    const primaryLabel = primaryChoice?.name || 'Main image';
    return [
      { label: primaryLabel, image: product.cutoutImage, stage: primaryChoice?.stage || product.backgroundImage || getGenericCategoryFallbackStage() },
      ...imageChoices.map((choice) => ({
        ...choice,
        stage: choice.stage || product.backgroundImage || getGenericCategoryFallbackStage()
      }))
    ];
  }
  if (product?.backgrounds?.length) {
    return [...product.backgrounds]
      .map((background) => ({
        label: background.name,
        image: background.image,
        stage: product.backgroundImage || background.stage || getGenericCategoryFallbackStage()
      }))
      .sort((a, b) => Number(isNoBackgroundOption(b)) - Number(isNoBackgroundOption(a)));
  }

  const cardImage = card.querySelector('img')?.getAttribute('src') || '';
  return [{
    label: 'No Background',
    image: cardImage,
    stage: product?.backgroundImage || getGenericCategoryFallbackStage()
  }];
}

function setupGenericCategoryShowroom({ rebuild = false, selectedSlug = '' } = {}) {
  const page = document.querySelector('.category-page');
  const existing = document.querySelector('.generic-showroom');
  if (!page || (document.querySelector('.sports-showroom') && !existing) || (existing && !rebuild)) return;

  let storedBackgroundImages = [];
  if (existing) {
    try {
      storedBackgroundImages = JSON.parse(existing.dataset.categoryBackgroundImages || '[]');
    } catch (error) {
      storedBackgroundImages = [];
    }
    existing.remove();
  }

  const cards = [...page.querySelectorAll('.category-card')];
  if (!cards.length) return;

  const backgroundPanel = [...page.querySelectorAll('.category-panel')].find((panel) => {
    return panel.querySelector('.background-carousel') || /Background Options/i.test(panel.textContent || '');
  });
  const backgroundImages = backgroundPanel
    ? [...backgroundPanel.querySelectorAll('.background-carousel img')]
    : storedBackgroundImages.map((src) => ({ getAttribute: (name) => name === 'src' ? src : '' }));
  if (backgroundPanel) backgroundPanel.remove();

  const firstCard = cards.find((card) => card.dataset.productId === selectedSlug) || cards[0];
  const firstTitle = firstCard.querySelector('h3')?.textContent.trim() || 'Standee';
  const firstImage = firstCard.querySelector('img')?.getAttribute('src') || '';

  const showroom = document.createElement('section');
  showroom.id = 'selected-standee';
  showroom.className = 'sports-showroom generic-showroom';
  showroom.dataset.categoryBackgroundImages = JSON.stringify(backgroundImages.map((image) => image.getAttribute('src') || '').filter(Boolean));
  showroom.setAttribute('aria-label', 'Selected category standee');
  showroom.innerHTML = `
    <div class="category-featured-art generic-main-stage" style="background-image: url('${getGenericCategoryFallbackStage()}');">
      <img class="generic-main-image product-cutout" src="${firstImage}" alt="${firstTitle} preview">
    </div>
    <div class="category-featured-info generic-selected-panel showroom-purchase-card">
      <span class="category-kicker">Selected Standee</span>
      <h2 class="generic-selected-name">${firstTitle}</h2>
      <p class="generic-selected-description">Pick any card below, then choose the image option you want to preview.</p>
      <div class="category-fact-grid generic-selected-facts">
        <span>Original size varies</span>
        <span>Preview choices below</span>
        <span>Options update by card</span>
      </div>
      <div class="generic-choice-section">
        <h3 class="sports-choice-title">Image Choices For Selected Standee</h3>
        <div class="category-option-strip sports-option-strip generic-option-strip" aria-label="Selected standee image choices"></div>
      </div>
      ${showroomPurchaseMarkup(firstTitle, 78, firstTitle)}
    </div>
  `;

  page.querySelector('.category-hero')?.insertAdjacentElement('afterend', showroom);

  const state = {
    stage: showroom.querySelector('.generic-main-stage'),
    image: showroom.querySelector('.generic-main-image'),
    name: showroom.querySelector('.generic-selected-name'),
    description: showroom.querySelector('.generic-selected-description'),
    optionStrip: showroom.querySelector('.generic-option-strip'),
    facts: showroom.querySelector('.generic-selected-facts'),
    builder: showroom.querySelector('.showroom-size-builder')
  };

  const selectCard = (card) => {
    const title = card.querySelector('h3')?.textContent.trim() || 'Standee';
    const productId = card.dataset.productId || title;
    const product = getKnownStandeeForCard(card);
    const options = buildGenericCategoryOptions(card, backgroundImages);
    const originalSize = product?.originalHeight ? `Original: ${formatHeight(product.originalHeight)}` : 'Original size varies';
    const description = product?.description || `Preview ${title} with the available image choices for this category.`;
    state.name.textContent = title;
    if (state.description) state.description.textContent = description;
    state.facts.innerHTML = `
      <span>${originalSize}</span>
      <span>Selected card</span>
      <span>${options.length > 1 ? `Options: ${options.length} images` : 'Primary image'}</span>
    `;
    state.builder.dataset.whiteTriangleImage = findWhiteTriangleImage(options);
    if (!state.builder.dataset.whiteTriangleImage) delete state.builder.dataset.whiteTriangleImage;
    updateShowroomPurchase(state, product?.title || title, product?.originalHeight || 78, product?.slug || productId);
    renderGenericCategoryOptions(state, options);
    const choiceSection = state.optionStrip.closest('.generic-choice-section');
    if (choiceSection) choiceSection.hidden = options.length <= 1;
    selectGenericCategoryOption(state, options, 0);

    cards.forEach((item) => item.classList.toggle('active', item === card));
    state.optionStrip.querySelectorAll('[data-generic-option-index]').forEach((button) => {
      button.addEventListener('click', () => selectGenericCategoryOption(state, options, Number(button.dataset.genericOptionIndex)));
    });

    applyInlineAdminEdits();
    updateCategoryGroupCurrentProduct(product?.slug || getStandeeSlug(productId));
  };

  cards.forEach((card, index) => {
    card.classList.add('sports-player-card');
    if (index === 0) card.classList.add('active');
    card.querySelector('button')?.addEventListener('click', (event) => {
      event.preventDefault();
      selectCard(card);
      showroom.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    card.querySelector('img')?.addEventListener('click', (event) => {
      event.preventDefault();
      selectCard(card);
      showroom.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  selectCard(firstCard);
}

function normalizeFrontPageCategoryLinks() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  if (path !== 'index.html' && path !== '') return;
  document.querySelectorAll('.product-image-link[href], .product-title-link[href]').forEach((link) => {
    const href = link.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.includes('#selected-standee')) return;
    if (/\.html(?:$|\?)/.test(href)) {
      link.setAttribute('href', `${href}#selected-standee`);
    }
  });
}

function scrollToSelectedStandeeHash() {
  if (window.location.hash !== '#selected-standee') return;
  window.setTimeout(() => {
    document.getElementById('selected-standee')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 160);
}

function getStandeeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getStandeeBySlug(slug) {
  const managed = getManagedProductBySlug(slug);
  const detailed = standeeCatalog[slug];
  if (managed || detailed) {
    const product = { ...(managed || {}), ...(detailed || {}), slug };
    product.title = managed?.title || detailed?.title || slug;
    product.description = managed?.description || detailed?.description || '';
    product.originalHeight = managed?.originalHeight || detailed?.originalHeight || 78;
    product.image = managed?.cutoutImage || detailed?.image;
    product.category = (managed?.categories || [])
      .map((key) => (window.MVPLUX_PRODUCT_CATEGORIES || []).find((category) => category.key === key)?.label)
      .filter(Boolean)
      .join(' / ') || detailed?.category || 'MVPLUXCREATIONS Standee';
    const managedChoices = sanitizeProductImageChoices(managed?.imageChoices)
      .filter((choice) => choice.image !== product.image);
    product.backgrounds = managedChoices.length
      ? [
          { name: 'Main image', image: product.image, stage: managed?.backgroundImage || getShowroomStageBackground() },
          ...managedChoices.map((choice) => ({
            name: choice.label,
            image: choice.image,
            stage: choice.stage || managed?.backgroundImage || getShowroomStageBackground()
          }))
        ]
      : detailed?.backgrounds?.length
        ? detailed.backgrounds
        : [{ name: 'Selected Background', image: product.image, stage: managed?.backgroundImage || getShowroomStageBackground() }];
    product.facts = detailed?.facts || ['Original size sets the starting price.', 'Custom sizes are available.'];
    return product;
  }

  return {
    slug,
    title: (slug || 'Custom Standee').replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    category: 'MVPLUXCREATIONS Standee',
    image: 'images/FrontPageWeb/Sports-Kobe-KB1forprint.png',
    originalHeight: 78,
    description: 'Choose the original size, pick your own custom size, and select from available display backgrounds.',
    backgrounds: [
      { name: 'Premium Stage', image: 'images/FrontPageWeb/Sports-Kobe-KB1forprint.png', stage: 'images/FanBackgrounds/top-favorite-stage-premium.png' },
      { name: 'Gold Stage', image: 'images/FrontPageWeb/Sports-Kobe-KB1forprint.png', stage: 'images/FanBackgrounds/top-favorite-stage-gold.png' },
      { name: 'Clean White', image: 'images/FrontPageWeb/Sports-Kobe-KB1forprint.png', stage: 'images/FrontPageWeb/Herobackgroundparts-backgroundforimages.jpg' }
    ],
    facts: ['Original size is used as the starting point for custom pricing.', 'Choose a background when options are offered.', 'Use Buy It Now for fast checkout.', 'Enter a height like 5\'8 or 68 for custom sizing.']
  };
}

function relatedProductGroups(product, products = getManagedProductCatalog(), categories = getAdminCategories(), limit = 4) {
  const currentSlug = String(product?.slug || '');
  const assignments = [...new Set(Array.isArray(product?.categories) ? product.categories : [])];
  const child = assignments.map((key) => categories[key]).find((category) => category?.parentKey && category.visible !== false) || null;
  const masterKey = child?.parentKey || assignments.find((key) => categories[key] && !categories[key].parentKey) || '';
  if (!masterKey) return [];
  const groups = [];
  if (child) {
    const discovery = categoryGroupDiscovery(masterKey, child.key, currentSlug, products, categories, limit);
    const sameChild = discovery.primary.slice(0, limit);
    if (sameChild.length) groups.push({ title: categoryCollectionTitle(child.title || child.key), products: sameChild });
    if (discovery.secondary.length) groups.push({ title: categoryCollectionTitle(categories[masterKey]?.title || masterKey, 'Explore More'), products: discovery.secondary });
    return groups;
  }
  const sameMaster = orderedCategoryProducts(productsForCategoryGroup(products, masterKey), masterKey)
    .filter((item) => item?.slug && item.slug !== currentSlug);
  const rotated = rotateCategoryDiscovery(sameMaster, categoryDiscoveryRotation(masterKey, '', sameMaster.length)).slice(0, limit);
  if (rotated.length) groups.push({ title: categoryCollectionTitle(categories[masterKey]?.title || masterKey, 'Explore More'), products: rotated });
  return groups;
}

function relatedProductDiscoveryMarkup(product) {
  const groups = relatedProductGroups(product);
  if (!groups.length) return '';
  return `<section class="standee-related-products" aria-label="Related products">
    ${groups.map((group) => `<div><h2>${escapeHtml(group.title)}</h2><div class="standee-related-grid">${group.products.map((related) => `
      <a class="standee-related-card" href="standee.html?item=${encodeURIComponent(related.slug)}">
        <img src="${escapeHtml(related.cutoutImage || related.image || '')}" alt="${escapeHtml(related.title || related.slug)}">
        <strong>${escapeHtml(related.title || related.slug)}</strong>
        <span>View Product</span>
      </a>`).join('')}</div></div>`).join('')}
  </section>`;
}

function setStandeeBackground(index) {
  const root = document.getElementById('standeeDetailRoot');
  const selected = window.currentStandeeProduct?.backgrounds?.[index];
  if (!root || !selected) return;

  const hero = root.querySelector('.standee-hero-art');
  const image = root.querySelector('.standee-main-cutout');
  if (hero) {
    const stage = selected.stage && selected.stage !== selected.image
      ? selected.stage
      : getShowroomStageBackground();
    hero.style.backgroundImage = `url("${stage}")`;
  }
  if (image) {
    image.src = selected.image;
    image.alt = selected.name;
  }

  root.querySelectorAll('[data-standee-bg-index]').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.standeeBgIndex) === index);
  });
}

function renderStandeeDetailPage() {
  const root = document.getElementById('standeeDetailRoot');
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const requestedSlug = params.get('item') || 'kobe-bryant';
  const product = getStandeeBySlug(requestedSlug);
  const slug = product.slug || requestedSlug;
  const originalHeight = resolveSellableProductHeight(product.originalHeight);
  const originalPrice = calculateCutoutPrice(originalHeight);
  window.currentStandeeProduct = product;
  document.title = `${product.title} | MVPLUXCREATIONS`;

  const backgroundButtons = product.backgrounds.map((background, index) => `
    <button type="button" class="${index === 0 ? 'active' : ''}" data-standee-bg-index="${index}" onclick="setStandeeBackground(${index})">
      <img src="${background.image}" alt="">
      <span>${background.name}</span>
    </button>
  `).join('');

  const factItems = [...product.facts, ...product.facts].map((fact) => `<span>${fact}</span>`).join('');
  const firstBackground = product.backgrounds[0];
  const firstStage = firstBackground?.stage && firstBackground.stage !== firstBackground.image
    ? firstBackground.stage
    : getShowroomStageBackground();
  const whiteTriangleImage = findWhiteTriangleImage(product.backgrounds);

  root.innerHTML = `
    <section class="standee-detail-hero">
      <div class="standee-hero-art" style="background-image: url('${firstStage}');">
        <img class="standee-main-cutout product-cutout" src="${product.image}" alt="${product.title}">
      </div>
      <div class="standee-purchase-panel product-card">
        <a class="standee-back-link" href="javascript:history.back()">Back to category</a>
        <span class="category-kicker">${product.category}</span>
        <h1>${product.title}</h1>
        <p>${product.description}</p>
        <div class="category-fact-grid">
          <span>Original: ${formatHeight(originalHeight)}</span>
          <span>Starting: ${formatMoney(originalPrice)}</span>
          <span>Custom sizes available</span>
        </div>
        <div class="size-builder" data-product-name="${product.title}" data-admin-slug="${slug}" data-original-price="${originalPrice}" data-original-height="${originalHeight}" ${whiteTriangleImage ? `data-white-triangle-image="${whiteTriangleImage}"` : ''}>
          <div class="size-option active">
            <label>
              <input type="radio" name="${slug}SizeMode" value="original" checked>
              <span>Original Size - ${formatHeight(originalHeight)} - ${formatMoney(originalPrice)}</span>
            </label>
          </div>
          <div class="size-option">
            <label>
              <input type="radio" name="${slug}SizeMode" value="custom">
              <span>Custom Size</span>
            </label>
            <div class="custom-size-box">
              <input class="custom-height-input" type="text" placeholder="Type height: 5'8 or 68">
            </div>
          </div>
          <p class="live-price-line">Price: <span class="live-size-price">${formatMoney(originalPrice)}</span></p>
        </div>
        <div class="standee-action-row">
          <button type="button" onclick="buySelectedNow(this)">Buy It Now</button>
          <button type="button" onclick="selectSizeMode(getSizeBuilderFromElement(this), 'custom')">Pick Your Own Size</button>
          <button type="button" onclick="addSelectedToCart(this)" aria-label="Add to cart" title="Add to cart">🛒</button>
        </div>
      </div>
    </section>
    <section class="standee-detail-section">
      <h2>Background Choices</h2>
      <div class="standee-background-picker">${backgroundButtons}</div>
    </section>
    <section class="standee-facts-strip" aria-label="Cool facts">
      <div class="standee-facts-track">${factItems}</div>
    </section>
    ${relatedProductDiscoveryMarkup(product)}
  `;

  bindUniversalSizeBuilderEvents();
  updateBuilderOriginalDisplay(root.querySelector('.size-builder'));
}

function bindCategoryStandeeCards() {
  if (document.querySelector('.category-page')) return;

  document.querySelectorAll('.category-card').forEach((card) => {
    if (card.dataset.sportsPlayer) return;
    const title = card.querySelector('h3')?.textContent || '';
    const slug = getStandeeSlug(title);
    const button = card.querySelector('button');
    if (!button || button.dataset.standeeLinked) return;
    button.dataset.standeeLinked = 'true';
    button.addEventListener('click', () => {
      window.location.href = `standee.html?item=${encodeURIComponent(slug)}`;
    });
  });
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
  const originalHeight = resolveSellableProductHeight(product.originalHeight);
  const originalPrice = calculateCutoutPrice(originalHeight);

  return `
    <div class="product-card" data-category="custom" data-name="${product.title || 'Custom card'}" data-admin-card-key="${slug}">
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
        <button onclick="addSelectedToCart(this)" aria-label="Add to cart" title="Add to cart">🛒</button>
        <button onclick="buySelectedNow(this)">Buy Now</button>
        <button class="offer-btn" onclick="openSelectedOffer(this)">Make Offer</button>
      </div>
    </div>
  `;
}

function renderAdminManagedCards() {
  const grid = document.querySelector('#shop .product-grid');
  if (!grid) return;

  const archived = new Set(getAdminArchivedProducts());
  const deleted = new Set(getAdminDeletedProducts());
  document.querySelectorAll('#shop .size-builder').forEach((builder) => {
    const card = builder.closest('.product-card');
    const slug = builder.dataset.adminSlug || getProductSlug(builder.dataset.productName || '');
    if (archived.has(slug) || deleted.has(slug)) {
      card.style.display = 'none';
    }
  });

  getAdminCustomProducts().filter((product) => product.visible !== false && !archived.has(product.slug)).forEach((product) => {
    if (grid.querySelector(`[data-admin-slug="${product.slug}"]`)) return;
    grid.insertAdjacentHTML('beforeend', productCardMarkup(product));
  });
}

function applyAdminProductOverrides(builder) {
  ensureProductAdminSlugs(builder.closest('.product-card') || document);
  const card = builder.closest('.product-card');
  const productName = builder.dataset.productName || card?.querySelector('.product-title-link')?.textContent || '';
  const override = getAdminProducts()[builder.dataset.adminSlug || getProductSlug(productName)];
  if (!override || !card) return;

  const titleLink = card.querySelector('.product-title-link');
  const description = card.querySelector('.product-description');
  const cutout = card.querySelector('.product-cutout');
  const stage = card.querySelector('.product-stage-preview');
  const stageImage = card.querySelector('.product-stage-bg');
  const logo = card.querySelector('.product-stage-logo');
  const display = resolveStorefrontProductDisplay(override);

  if (override.title && titleLink) titleLink.textContent = override.title;
  if (override.description && description) description.textContent = override.description;
  if (override.cutoutImage && cutout) {
    cutout.src = override.cutoutImage;
    cutout.dataset.adminFallbackSrc = override.cutoutImage;
  }
  const resolvedBackground = override.backgroundImage || display.backgroundImage;
  if (resolvedBackground && stage) {
    stage.style.backgroundImage = `url("${resolvedBackground}")`;
    if (stageImage) {
      stageImage.src = resolvedBackground;
      stageImage.dataset.adminFallbackSrc = resolvedBackground;
    }
  }
  if ((display.backgroundPosition || override.stageBackgroundPosition) && stage) {
    stage.style.backgroundPosition = display.backgroundPosition || override.stageBackgroundPosition;
  }
  if (stage) {
    const standeeSize = display.standeeSizePercent ?? override.cutoutHeight;
    const standeeLeft = display.standeeLeftPercent ?? override.cutoutLeft;
    const standeeVertical = display.standeeVerticalPercent ?? override.cutoutBottom;
    const logoSize = display.logoSizePercent ?? override.logoWidth;
    const logoVertical = display.logoVerticalPercent ?? override.logoTop;
    if (String(standeeSize ?? '').trim()) stage.style.setProperty('--category-cutout-height', `${safeAdminImageNumber(standeeSize, 78, 30, 140)}%`);
    if (String(standeeLeft ?? '').trim()) stage.style.setProperty('--category-cutout-x', `${safeAdminImageNumber(standeeLeft, 50, -50, 150)}%`);
    if (String(standeeVertical ?? '').trim()) stage.style.setProperty('--category-cutout-bottom', `${safeAdminImageNumber(standeeVertical, 22, -50, 100)}%`);
    if (String(logoSize ?? '').trim()) stage.style.setProperty('--category-logo-width', `${safeAdminImageNumber(logoSize, 82, 10, 150)}%`);
    if (String(logoVertical ?? '').trim()) stage.style.setProperty('--category-logo-top', `${safeAdminImageNumber(logoVertical, -4, -50, 100)}%`);
  }
  if (override.originalHeight) {
    const overrideHeight = parseHeightToInches(String(override.originalHeight)) || parseInt(override.originalHeight, 10);
    if (overrideHeight) builder.dataset.originalHeight = String(overrideHeight);
  }
  if (override.priceOverride !== undefined && override.priceOverride !== null && override.priceOverride !== '') {
    builder.dataset.originalPriceOverride = String(override.priceOverride);
  } else {
    delete builder.dataset.originalPriceOverride;
  }
}

function updateBuilderOriginalDisplay(builder) {
  const originalHeight = parseInt(builder.dataset.originalHeight || '78', 10);
  const baseOriginalPrice = calculateCutoutPrice(originalHeight, builder);
  const originalPrice = addFinishToPrice(baseOriginalPrice, builder);
  const originalLabel = getBuilderOriginalLabel(builder);
  const customLabel = builder.querySelector('input[value="custom"]')?.closest('label')?.querySelector('span');
  const priceDisplay = builder.querySelector('.live-size-price');
  const originalRadio = builder.querySelector('input[value="original"]');
  const stage = builder.closest('.product-card')?.querySelector('.product-stage-preview');
  const originalChoice = stage?.querySelector('[data-stage-choice="original"]');

  builder.dataset.originalPrice = originalPrice.toFixed(2);

  if (originalLabel) {
    originalLabel.textContent = `Original ${formatHeight(originalHeight)}`;
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

function getBuilderOriginalLabel(builder) {
  return builder?.querySelector('input[value="original"]')?.closest('label')?.querySelector('span') || null;
}

function extractHeightFromText(value = '') {
  const text = String(value || '').trim();
  const feetMatch = text.match(/(\d+)\s*'\s*(\d{1,2})?\s*"?/);
  if (feetMatch) {
    const feet = parseInt(feetMatch[1], 10);
    const inches = parseInt(feetMatch[2] || '0', 10);
    if (feet >= 1 && inches >= 0 && inches < 12) return feet * 12 + inches;
  }

  const inchMatch = text.match(/\b([2-9]\d|1[0-1]\d|120)\b/);
  if (inchMatch) return parseInt(inchMatch[1], 10);

  return null;
}

async function saveAdminProductHeightFromBuilder(builder, inches) {
  if (!builder || !inches) return;

  ensureProductAdminSlugs(builder.closest('.product-card') || document);
  const slug = builder.dataset.adminSlug || getProductSlug(builder.dataset.productName || 'product');
  const baseRecord = getManagedProductBySlug(slug) || {};
  return saveStorefrontProductPatch(slug, { originalHeight: String(inches) }, baseRecord);
}

async function saveAdminProductImageFromElement(image) {
  if (!image) return false;
  const owned = inlineAdminOwnedField(image);
  if (newStorefrontAdminArchitectureEnabled() && owned) {
    return persistInlineOwnedField(image, owned, image.getAttribute('src') || image.src || '');
  }
  const card = image.closest?.('.product-card');
  const builder = card?.querySelector?.('.size-builder');
  if (!builder || !image.classList.contains('product-cutout')) return false;
  ensureProductAdminSlugs(card);
  const slug = getBuilderAdminSlug(builder);
  const baseRecord = getManagedProductBySlug(slug) || {};
  return saveStorefrontProductPatch(slug, {
    cutoutImage: image.getAttribute('src') || image.src || ''
  }, baseRecord);
}

function getBuilderAdminSlug(builder) {
  ensureProductAdminSlugs(builder?.closest?.('.product-card') || document);
  return builder?.dataset.adminSlug || getProductSlug(builder?.dataset.productName || 'product');
}

function setBuilderOriginalHeight(builder, inches) {
  if (!builder || !inches) return false;

  const originalRadio = builder.querySelector('input[value="original"]');
  const customRadio = builder.querySelector('input[value="custom"]');
  if (originalRadio) originalRadio.checked = true;
  if (customRadio) customRadio.checked = false;
  builder.classList.remove('custom-active');
  builder.querySelectorAll('.showroom-size-button').forEach((button) => {
    const input = button.querySelector('input[type="radio"]');
    button.classList.toggle('active', input?.value === 'original');
  });
  builder.querySelectorAll('.size-option').forEach((button) => {
    const input = button.querySelector('input[type="radio"]');
    button.classList.toggle('active', input?.value === 'original');
  });
  builder.dataset.originalHeight = String(inches);
  delete builder.dataset.originalPriceOverride;
  setStageChoice(builder, 'original');
  updateBuilderOriginalDisplay(builder);
  return true;
}

function syncMatchingOriginalHeights(sourceBuilder, inches) {
  const slug = getBuilderAdminSlug(sourceBuilder);
  if (!slug || !inches) return;
  document.querySelectorAll('.size-builder').forEach((builder) => {
    if (builder === sourceBuilder) return;
    if (getBuilderAdminSlug(builder) !== slug) return;
    setBuilderOriginalHeight(builder, inches);
  });
}

function saveOriginalHeightPageEdit(builder, inches) {
  if (!builder || !inches) return;

  const edits = getInlineAdminDraft();
  const page = inlineAdminPageKey();
  const key = `product-height-${getBuilderAdminSlug(builder)}`;
  markInlineAdminElementDirty(page, key);
  edits[page] = edits[page] || {};
  edits[page][key] = { type: 'originalHeight', slug: getBuilderAdminSlug(builder), originalHeight: String(inches) };
  writeInlineAdminEdits(edits);
  inlineAdminDirty = true;
  inlineAdminHasUnsavedLocalChanges = true;
  updateInlineAdminToolbarState('Auto-saving...');
  scheduleInlineAdminAutoSave();
}

function syncOriginalSizeForBuilder(builder, textValue) {
  if (!builder) return false;

  const inches = extractHeightFromText(textValue || '');
  if (!inches) return false;

  setBuilderOriginalHeight(builder, inches);
  syncMatchingOriginalHeights(builder, inches);
  saveAdminProductHeightFromBuilder(builder, inches);
  if (!newStorefrontAdminArchitectureEnabled()) saveOriginalHeightPageEdit(builder, inches);
  return true;
}

function getOriginalStageChoice(element) {
  return element?.closest?.('[data-stage-choice="original"]') || null;
}

function getBuilderForOriginalStageChoice(element) {
  const choice = getOriginalStageChoice(element);
  const card = choice?.closest?.('.product-card, .showroom-purchase-card, .standee-purchase-panel, .category-featured-info');
  return card?.querySelector?.('.size-builder') || null;
}

function syncOriginalSizeFromEditedText(element, textOverride = null) {
  const stageBuilder = getBuilderForOriginalStageChoice(element);
  if (stageBuilder) {
    const choice = getOriginalStageChoice(element);
    return syncOriginalSizeForBuilder(stageBuilder, textOverride ?? choice?.textContent ?? element.textContent ?? '');
  }

  const builder = element?.closest?.('.size-builder');
  if (!builder) return false;

  const originalLabel = getBuilderOriginalLabel(builder);
  if (!originalLabel || (originalLabel !== element && !originalLabel.contains(element))) return false;

  return syncOriginalSizeForBuilder(builder, textOverride ?? element.textContent ?? originalLabel.textContent ?? '');
}

function applyOriginalSizeFromEditedText(element, textOverride = null) {
  const stageBuilder = getBuilderForOriginalStageChoice(element);
  if (stageBuilder) {
    const choice = getOriginalStageChoice(element);
    const inches = extractHeightFromText(textOverride ?? choice?.textContent ?? element.textContent ?? '');
    return inches ? setBuilderOriginalHeight(stageBuilder, inches) : false;
  }

  const builder = element?.closest?.('.size-builder');
  if (!builder) return false;

  const originalLabel = getBuilderOriginalLabel(builder);
  if (!originalLabel || (originalLabel !== element && !originalLabel.contains(element))) return false;

  const inches = extractHeightFromText(textOverride ?? element.textContent ?? originalLabel.textContent ?? '');
  return inches ? setBuilderOriginalHeight(builder, inches) : false;
}

function isLockedStageChoiceAdminText(element) {
  const stageChoice = element?.closest?.('[data-stage-choice]');
  if (!stageChoice) return false;
  return stageChoice.dataset.stageChoice !== 'original';
}

function isLockedSizeBuilderAdminText(element) {
  const builder = element?.closest?.('.size-builder');
  if (!builder) return false;
  const originalLabel = getBuilderOriginalLabel(builder);
  return element !== originalLabel;
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
  builder.querySelectorAll('.showroom-size-button').forEach((button) => {
    const input = button.querySelector('input[type="radio"]');
    button.classList.toggle('active', input?.value === mode);
  });
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
  const priceWithFinish = addFinishToPrice(price, builder);

  if (!price) {
    if (priceDisplay) priceDisplay.textContent = 'Enter a valid height';
    if (customLabel) {
      customLabel.textContent = 'Custom Size';
      delete customLabel.dataset.customPrice;
    }
    return;
  }

  if (priceDisplay) priceDisplay.textContent = formatMoney(priceWithFinish);
  if (customLabel) {
    customLabel.textContent = builder.classList.contains('showroom-size-builder')
      ? 'Custom Size'
      : `Custom Size - ${formatMoney(priceWithFinish)}`;
    customLabel.dataset.customPrice = 'true';
  }
}

function refreshBuilderPrice(builder) {
  if (!builder) return;
  if (builder.querySelector('input[value="custom"]')?.checked) {
    updateCustomPrice(builder);
  } else {
    updateBuilderOriginalDisplay(builder);
  }
}

function getSizeBuilderFromElement(element) {
  const card = element?.closest?.('.product-card, .showroom-purchase-card, .standee-purchase-panel, .category-featured-info');
  return element?.closest?.('.size-builder') || card?.querySelector('.size-builder') || null;
}

function ensureStageOptionBoxes(root = document) {
  root.querySelectorAll?.('.product-stage-preview')?.forEach((stage) => {
    if (stage.querySelector('.stage-option-boxes')) return;

    stage.insertAdjacentHTML('beforeend', `
      <div class="stage-option-boxes">
        <span class="active" data-stage-choice="original" role="button" tabindex="0">Original 6'6</span>
        <span data-stage-choice="custom" role="button" tabindex="0">Custom Size</span>
      </div>
    `);
  });
}

function bindUniversalSizeBuilderEvents() {
  if (document.body.dataset.sizeBuilderEventsReady) return;
  document.body.dataset.sizeBuilderEventsReady = 'true';

  document.addEventListener('change', (event) => {
    const radio = event.target.closest?.('.size-builder input[type="radio"]');
    if (!radio) return;
    if (radio.closest('.finish-choice')) {
      const builder = getSizeBuilderFromElement(radio);
      builder?.querySelectorAll('.finish-choice').forEach((choice) => {
        choice.classList.toggle('active', choice.contains(radio) && radio.checked);
      });
      if (builder?.querySelector('input[value="custom"]')?.checked) {
        updateCustomPrice(builder);
      } else if (builder) {
        updateBuilderOriginalDisplay(builder);
      }
      applyFinishSelection(builder, radio);
      return;
    }
    const builder = getSizeBuilderFromElement(radio);
    if (builder) selectSizeMode(builder, radio.value);
  });

  document.addEventListener('input', (event) => {
    const input = event.target.closest?.('.custom-height-input');
    if (!input) return;
    const builder = getSizeBuilderFromElement(input);
    if (builder) updateCustomPrice(builder);
  });

  document.addEventListener('click', (event) => {
    const choiceButton = event.target.closest?.('[data-stage-choice]');
    if (!choiceButton) return;
    const builder = getSizeBuilderFromElement(choiceButton);
    if (!builder) return;
    event.preventDefault();
    event.stopPropagation();
    selectSizeMode(builder, choiceButton.dataset.stageChoice);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const choiceButton = event.target.closest?.('[data-stage-choice]');
    if (!choiceButton) return;
    const builder = getSizeBuilderFromElement(choiceButton);
    if (!builder) return;
    event.preventDefault();
    selectSizeMode(builder, choiceButton.dataset.stageChoice);
  });
}

function toggleAdminSizeEditor() {
  document.body.classList.toggle('show-size-admin');
}

function installSizeAdmin(builder) {
  if (builder.querySelector('.admin-size-tools')) return;

  builder.insertAdjacentHTML('beforeend', `
    <div class="admin-size-tools">
      <label>
        Admin original height
        <input class="admin-original-height-input" type="text" placeholder="Example: 6'6 or 78">
      </label>
    </div>
  `);

  const input = builder.querySelector('.admin-original-height-input');
  if (input) input.value = formatHeight(parseInt(builder.dataset.originalHeight || '78', 10));

  input?.addEventListener('input', async () => {
    const inches = parseHeightToInches(input?.value || '');
    if (!inches) return;

    setBuilderOriginalHeight(builder, inches);
    saveAdminProductHeightFromBuilder(builder, inches);
    saveOriginalHeightPageEdit(builder, inches);
  });
}

/* ---------------- SITE-WIDE ADMIN MODE ---------------- */
let inlineAdminDraftEdits = null;
let inlineAdminSelectedImage = null;
let inlineAdminSelectedRecordElement = null;
let inlineAdminUndoStack = [];
let inlineAdminRedoStack = [];
let inlineAdminDirty = false;
let inlineAdminHasUnsavedLocalChanges = false;
let inlineAdminLastToolbarAction = { action: '', time: 0 };
let inlineAdminResizeActive = false;
let inlineAdminLiveEdits = null;
let inlineAdminLiveRevisions = {};
let inlineAdminBasePageEdits = {};
let inlineAdminDirtyKeys = {};
let inlineAdminDirtyVersions = {};
let inlineAdminConflictDrafts = {};
let inlineAdminSaveQueue = Promise.resolve(true);
let inlineAdminAutoSaveTimer = null;

const INLINE_ADMIN_DRAFT_KEY = 'mvpluxInlineAdminDraftV2';
const INLINE_ADMIN_DRAFT_META_KEY = 'mvpluxInlineAdminDraftMetaV1';
const INLINE_ADMIN_RECOVERY_KEY = 'mvpluxInlineAdminRecoveryV1';
const INLINE_HIDDEN_CARDS_KEY = 'mvpluxInlineHiddenCardsV2';
const HOMEPAGE_CATEGORY_ORDER_EDIT_KEY = 'homepage-category-card-order';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function readInlineAdminEdits() {
  if (inlineAdminDraftEdits) return inlineAdminDraftEdits;
  try {
    const edits = JSON.parse(localStorage.getItem(INLINE_ADMIN_DRAFT_KEY) || '{}');
    const metadata = JSON.parse(localStorage.getItem(INLINE_ADMIN_DRAFT_META_KEY) || '{}');
    const page = inlineAdminPageKey();
    const pageMetadata = metadata?.[page];
    if (pageMetadata?.status !== 'unsaved' || pageMetadata?.sessionId !== storefrontAdminTabId) return {};
    inlineAdminDirtyKeys[page] = new Set(pageMetadata.dirtyKeys || Object.keys(edits?.[page] || {}));
    inlineAdminBasePageEdits[page] = pageMetadata.baseEdits || {};
    return edits;
  } catch (error) {
    return {};
  }
}

function writeInlineAdminEdits(edits) {
  inlineAdminDraftEdits = edits || {};
  try {
    localStorage.setItem(INLINE_ADMIN_DRAFT_KEY, JSON.stringify(inlineAdminDraftEdits));
    const page = inlineAdminPageKey();
    const existingMetadata = JSON.parse(localStorage.getItem(INLINE_ADMIN_DRAFT_META_KEY) || '{}');
    if (inlineAdminDirtyKeys[page]?.size) {
      existingMetadata[page] = {
        status: 'unsaved',
        sessionId: storefrontAdminTabId,
        baseRevision: Number(inlineAdminLiveRevisions[page]) || 0,
        dirtyKeys: [...inlineAdminDirtyKeys[page]],
        baseEdits: inlineAdminBasePageEdits[page] || {},
        updatedAt: new Date().toISOString()
      };
    } else {
      delete existingMetadata[page];
    }
    localStorage.setItem(INLINE_ADMIN_DRAFT_META_KEY, JSON.stringify(existingMetadata));
  } catch (error) {
    console.warn('Could not write admin draft backup:', error);
  }
}

function markInlineAdminElementDirty(page, key) {
  inlineAdminDirtyKeys[page] = inlineAdminDirtyKeys[page] || new Set();
  inlineAdminDirtyVersions[page] = inlineAdminDirtyVersions[page] || new Map();
  if (!inlineAdminDirtyKeys[page].size) {
    inlineAdminBasePageEdits[page] = structuredClone(getInlineAdminLivePageEdits());
  }
  inlineAdminDirtyVersions[page].set(key, (inlineAdminDirtyVersions[page].get(key) || 0) + 1);
  inlineAdminDirtyKeys[page].add(key);
}

function discardInlineAdminPageDraft(page, latestEdits = {}) {
  delete inlineAdminConflictDrafts[page];
  inlineAdminDirtyKeys[page] = new Set();
  inlineAdminDirtyVersions[page] = new Map();
  inlineAdminBasePageEdits[page] = structuredClone(latestEdits || {});
  const stored = getInlineAdminDraft();
  delete stored[page];
  writeInlineAdminEdits(stored);
}

function stageInlineAdminPageConflict(page, changes, latestEdits, analysis) {
  inlineAdminConflictDrafts[page] = structuredClone(changes || {});
  const activeDrafts = getInlineAdminDraft();
  delete activeDrafts[page];
  applyInlineAdminEdits();
  showStorefrontAdminConflict(analysis, async () => {
    activeDrafts[page] = structuredClone(inlineAdminConflictDrafts[page] || {});
    inlineAdminBasePageEdits[page] = structuredClone(latestEdits || {});
    delete inlineAdminConflictDrafts[page];
    writeInlineAdminEdits(activeDrafts);
    applyInlineAdminEdits();
    return saveInlineAdminEditsLive();
  }, async () => discardInlineAdminPageDraft(page, latestEdits), async () => {
    activeDrafts[page] = structuredClone(inlineAdminConflictDrafts[page] || {});
    writeInlineAdminEdits(activeDrafts);
    applyInlineAdminEdits();
  });
}

function getInlineAdminDraft() {
  if (!inlineAdminDraftEdits) inlineAdminDraftEdits = readInlineAdminEdits();
  return inlineAdminDraftEdits;
}

function getInlineAdminLivePageEdits() {
  if (!inlineAdminLiveEdits) return {};
  return inlineAdminLiveEdits[inlineAdminPageKey()] || {};
}

function newStorefrontAdminArchitectureEnabled() {
  return Boolean(window.mvpluxLiveAdminSettings && (
    window.mvpluxLiveAdminSettings.adminArchitectureV2?.enabled === true
    ||
    (window.mvpluxLiveAdminSettings.products && typeof window.mvpluxLiveAdminSettings.products === 'object')
    || (window.mvpluxLiveAdminSettings.categories && typeof window.mvpluxLiveAdminSettings.categories === 'object')
  )) || Boolean(window.mvpluxPublishedAdminSettings?.categories
    && Object.keys(window.mvpluxPublishedAdminSettings.categories).length);
}

function withoutProductOwnedPageValues(pageEdits = {}) {
  if (!newStorefrontAdminArchitectureEnabled()) return { ...(pageEdits || {}) };
  const filtered = {};
  Object.entries(pageEdits || {}).forEach(([key, edit]) => {
    const productText = /^product-.+-(?:title-link|title-heading|description|original-choice|original-size-label)$/i.test(key);
    const productHeight = /^product-height-.+/i.test(key);
    if (productText || productHeight) return;
    const escapedKey = globalThis.CSS?.escape?.(key) || String(key).replace(/["\\]/g, '\\$&');
    const element = document.querySelector(`[data-admin-edit="${escapedKey}"]`);
    const owned = inlineAdminOwnedField(element);
    if (owned?.type === 'category-card') {
      if (!edit || typeof edit !== 'object') return;
      const { text: _text, src: _src, originalHeight: _height, x: _x, y: _y, scale: _scale,
        rotate: _rotate, locked: _locked, ...pageOnlyState } = edit;
      if (Object.keys(pageOnlyState).length) filtered[key] = pageOnlyState;
      return;
    }
    const productImage = /^product-.+-(?:product-cutout|product-stage-bg)$/i.test(key);
    if (productImage && edit && typeof edit === 'object') {
      const { src: _src, text: _text, originalHeight: _height, ...pageOnlyState } = edit;
      if (Object.keys(pageOnlyState).length) filtered[key] = pageOnlyState;
      return;
    }
    filtered[key] = edit;
  });
  return filtered;
}

function getInlineAdminPageEdits() {
  const publishedContent = window.mvpluxPublishedAdminSettings?.pageContent?.[inlineAdminPageKey()] || {};
  const publishedVisuals = window.mvpluxPublishedAdminSettings?.pageVisualStates?.[inlineAdminPageKey()] || {};
  const publishedPageEdits = { ...publishedContent };
  Object.entries(publishedVisuals).forEach(([key, visual]) => {
    publishedPageEdits[key] = { ...(publishedPageEdits[key] || {}), ...visual };
  });
  const livePageEdits = getInlineAdminLivePageEdits();

  if (!shouldUsePrivateAdminState()) {
    return withoutProductOwnedPageValues(publishedPageEdits);
  }

  if (isPrivateAdminPreviewEnabled()) {
    return withoutProductOwnedPageValues({ ...publishedPageEdits, ...livePageEdits });
  }
  const draftPageEdits = getInlineAdminDraft()[inlineAdminPageKey()] || {};
  return withoutProductOwnedPageValues({ ...publishedPageEdits, ...livePageEdits, ...draftPageEdits });
}

function inlineAdminPageKey() {
  const file = window.location.pathname.split('/').pop() || 'index.html';
  return file.toLowerCase();
}

function inlineAdminStableSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function getProductCardTextAdminKey(element) {
  if (!element || element.tagName === 'IMG') return '';
  const card = element.closest?.('.product-card');
  const builder = card?.querySelector?.('.size-builder');
  const productSlug = builder?.dataset.adminSlug || '';
  if (!card || !productSlug) return '';

  if (element.matches('.product-title-link')) return `product-${inlineAdminStableSlug(productSlug)}-title-link`;
  if (element.matches('h3') && element.querySelector('.product-title-link')) return `product-${inlineAdminStableSlug(productSlug)}-title-heading`;
  if (element.matches('.product-description')) return `product-${inlineAdminStableSlug(productSlug)}-description`;
  if (element.closest('[data-stage-choice="original"]')) return `product-${inlineAdminStableSlug(productSlug)}-original-choice`;
  if (element.closest('.size-builder')) {
    const originalLabel = getBuilderOriginalLabel(builder);
    if (originalLabel && (element === originalLabel || originalLabel.contains(element))) {
      return `product-${inlineAdminStableSlug(productSlug)}-original-size-label`;
    }
    return '';
  }
  return '';
}

function inlineAdminProductSlugForElement(element) {
  const context = element?.closest?.('.product-card, .sports-showroom, .generic-showroom, .standee-detail-page, .showroom-purchase-card, .standee-purchase-panel');
  const builder = element?.closest?.('.size-builder') || context?.querySelector?.('.size-builder');
  if (builder?.dataset.adminSlug) return builder.dataset.adminSlug;
  if (context?.dataset.adminSlug) return context.dataset.adminSlug;
  if (element?.id === 'sportsMainImage' || element?.closest?.('.sports-showroom')) return selectedSportsStandeeKey || '';
  return '';
}

function inlineAdminOwnedField(element) {
  if (!newStorefrontAdminArchitectureEnabled() || !element) return null;
  const categoryHost = element.closest?.('[data-admin-category-key]');
  const explicitCategoryField = element.dataset?.adminCategoryField
    || element.closest?.('[data-admin-category-field]')?.dataset.adminCategoryField;
  if (categoryHost?.dataset.adminCategoryKey && ['title', 'description'].includes(explicitCategoryField)) {
    return { type: 'category-card', categoryKey: categoryHost.dataset.adminCategoryKey, field: explicitCategoryField, section: '' };
  }
  const slug = inlineAdminProductSlugForElement(element);
  if (!slug) return null;
  const categoryKey = element.closest?.('[data-admin-category-key]')?.dataset.adminCategoryKey || STOREFRONT_CATEGORY_CARD_MAP[slug];
  let field = '';
  if (element.matches?.('.product-title-link') || (element.matches?.('h3') && element.querySelector?.('.product-title-link'))) field = 'title';
  else if (element.matches?.('.product-description')) field = 'description';
  else if (element.matches?.('[data-product-fun-fact], .product-fun-fact')) field = 'funFact';
  else if (element.matches?.('.product-cutout, .standee-main-cutout, .generic-main-image, #sportsMainImage')) field = 'cutoutImage';
  else if (element.matches?.('.product-stage-bg')) field = 'backgroundImage';
  if (!field) return null;
  return categoryKey
    ? { type: 'category-card', categoryKey, slug, field: field === 'cutoutImage' ? 'image' : field, section: ['title', 'description'].includes(field) ? '' : 'card' }
    : { type: 'product', slug, field };
}

const inlineOwnedFieldTimers = new Map();
const inlineOwnedDisplayTimers = new Map();

async function persistInlineOwnedField(element, owned, value) {
  if (!owned) return false;
  if (owned.type === 'category-card') {
    const base = window.mvpluxLiveAdminSettings?.categories?.[owned.categoryKey] || {};
    return saveStorefrontCategoryPatch(owned.categoryKey, owned.section || '', { [owned.field]: value }, base);
  }
  const base = getManagedProductBySlug(owned.slug) || {};
  return saveStorefrontProductPatch(owned.slug, { [owned.field]: value, updatedAt: new Date().toISOString(), draftStatus: 'ready', approvalStatus: 'draft' }, base);
}

function scheduleInlineOwnedFieldSave(element, owned, value, delay = 650) {
  const key = `${owned.type}:${owned.categoryKey || owned.slug}:${owned.field}`;
  window.clearTimeout(inlineOwnedFieldTimers.get(key));
  element.dataset.adminOwnedDirty = 'true';
  inlineAdminHasUnsavedLocalChanges = true;
  updateInlineAdminToolbarState('Unsaved changes');
  const timer = window.setTimeout(async () => {
    inlineOwnedFieldTimers.delete(key);
    const saved = await persistInlineOwnedField(element, owned, value);
    if (saved) delete element.dataset.adminOwnedDirty;
    inlineAdminHasUnsavedLocalChanges = inlineOwnedFieldTimers.size > 0 || Boolean(inlineAdminDirtyKeys[inlineAdminPageKey()]?.size);
    if (saved && !inlineAdminHasUnsavedLocalChanges) updateInlineAdminToolbarState('Saved Privately');
  }, delay);
  inlineOwnedFieldTimers.set(key, timer);
}

async function flushInlineOwnedFieldSaves() {
  if (!inlineOwnedFieldTimers.size) return true;
  const pendingElements = [...document.querySelectorAll('[data-admin-owned-dirty="true"]')];
  inlineOwnedFieldTimers.forEach((timer) => window.clearTimeout(timer));
  inlineOwnedFieldTimers.clear();
  for (const element of pendingElements) {
    const owned = inlineAdminOwnedField(element);
    if (!owned) continue;
    const value = element.tagName === 'IMG' ? element.getAttribute('src') || '' : element.textContent.trim();
    if (!await persistInlineOwnedField(element, owned, value)) return false;
    delete element.dataset.adminOwnedDirty;
  }
  inlineAdminHasUnsavedLocalChanges = Boolean(inlineAdminDirtyKeys[inlineAdminPageKey()]?.size);
  return true;
}

function scheduleInlineOwnedDisplaySave(image, state, delay = 450) {
  if (!newStorefrontAdminArchitectureEnabled()) return false;
  const owned = inlineAdminOwnedField(image);
  if (!owned || owned.type !== 'product') return false;
  const key = `display:${owned.slug}`;
  window.clearTimeout(inlineOwnedDisplayTimers.get(key));
  image.dataset.adminOwnedDisplayDirty = 'true';
  inlineAdminHasUnsavedLocalChanges = true;
  updateInlineAdminToolbarState('Unsaved changes');
  inlineOwnedDisplayTimers.set(key, window.setTimeout(async () => {
    inlineOwnedDisplayTimers.delete(key);
    const base = getManagedProductBySlug(owned.slug) || {};
    const displayOverrides = {
      ...(base.displayOverrides || {}),
      imageTransform: {
        x: Number(state.x) || 0,
        y: Number(state.y) || 0,
        scale: Number(state.scale) || 1,
        rotate: Number(state.rotate) || 0
      }
    };
    const saved = await saveStorefrontProductPatch(owned.slug, {
      displayOverrides,
      updatedAt: new Date().toISOString(),
      draftStatus: 'ready',
      approvalStatus: 'draft'
    }, base);
    if (saved) delete image.dataset.adminOwnedDisplayDirty;
    inlineAdminHasUnsavedLocalChanges = inlineOwnedFieldTimers.size > 0
      || inlineOwnedDisplayTimers.size > 0
      || Boolean(inlineAdminDirtyKeys[inlineAdminPageKey()]?.size);
  }, delay));
  return true;
}

async function flushInlineOwnedDisplaySaves() {
  if (!inlineOwnedDisplayTimers.size) return true;
  const pending = [...document.querySelectorAll('img[data-admin-owned-display-dirty="true"]')];
  inlineOwnedDisplayTimers.forEach((timer) => window.clearTimeout(timer));
  inlineOwnedDisplayTimers.clear();
  for (const image of pending) {
    const state = image._adminImageState || {};
    const owned = inlineAdminOwnedField(image);
    if (!owned || owned.type !== 'product') continue;
    const base = getManagedProductBySlug(owned.slug) || {};
    if (!await saveStorefrontProductPatch(owned.slug, {
      displayOverrides: {
        ...(base.displayOverrides || {}),
        imageTransform: {
          x: Number(state.x) || 0,
          y: Number(state.y) || 0,
          scale: Number(state.scale) || 1,
          rotate: Number(state.rotate) || 0
        }
      },
      updatedAt: new Date().toISOString(),
      draftStatus: 'ready',
      approvalStatus: 'draft'
    }, base)) return false;
    delete image.dataset.adminOwnedDisplayDirty;
  }
  return true;
}

function inlineAdminKey(element) {
  if (element.dataset.adminEdit) return element.dataset.adminEdit;

  const productTextKey = getProductCardTextAdminKey(element);
  if (productTextKey) {
    element.dataset.adminEdit = productTextKey;
    return element.dataset.adminEdit;
  }

  if (element.tagName === 'IMG') {
    const builder = element.closest('.product-card')?.querySelector('.size-builder');
    const productSlug = builder?.dataset.adminSlug || '';
    const roleClass = ['product-cutout', 'product-stage-bg', 'product-stage-logo']
      .find((className) => element.classList.contains(className));
    if (productSlug && roleClass) {
      element.dataset.adminEdit = `product-${inlineAdminStableSlug(productSlug)}-${inlineAdminStableSlug(roleClass)}`;
      return element.dataset.adminEdit;
    }

    const namedImage = element.dataset.adminImage;
    if (namedImage) {
      element.dataset.adminEdit = `img-${inlineAdminStableSlug(namedImage)}`;
      return element.dataset.adminEdit;
    }

    const originalSrc = element.dataset.adminOriginalSrc || element.getAttribute('src') || '';
    if (originalSrc && !originalSrc.startsWith('data:')) {
      element.dataset.adminOriginalSrc = originalSrc;
      element.dataset.adminEdit = `img-src-${inlineAdminStableSlug(originalSrc)}`;
      return element.dataset.adminEdit;
    }
  }

  const selector = element.tagName === 'IMG'
    ? 'img'
    : 'h1,h2,h3,h4,p,a,button,span,label,strong,li';
  const siblings = [...document.querySelectorAll(selector)];
  const index = siblings.indexOf(element);
  element.dataset.adminEdit = `${element.tagName.toLowerCase()}-${Math.max(0, index)}`;
  return element.dataset.adminEdit;
}

function isInlineAdminBackgroundImage(image) {
  return image?.matches?.('.hero-bg, .fan-card-bg, .fan-gallery-bg, .product-stage-bg, .background-carousel img');
}

function rememberInlineAdminImageFallbacks(root = document) {
  root.querySelectorAll?.('img')?.forEach((image) => {
    if (!image.dataset.adminFallbackSrc) {
      image.dataset.adminFallbackSrc = image.getAttribute('src') || '';
    }
    if (image.dataset.adminFallbackReady) return;
    image.dataset.adminFallbackReady = 'true';
    image.addEventListener('error', () => {
      const fallback = image.dataset.adminFallbackSrc;
      if (!fallback || image.getAttribute('src') === fallback) return;
      image.src = fallback;
      saveInlineAdminEdit(image, {
        src: fallback,
        ...(image._adminImageState || { x: 0, y: 0, scale: 1, rotate: 0, locked: false })
      });
      updateInlineAdminToolbarState('Image restored from fallback');
    });
  });
}

async function loadInlineAdminLiveEdits() {
  const client = getSupabaseClient();
  if (!client?.from) {
    inlineAdminLiveEdits = {};
    return {};
  }

  const page = inlineAdminPageKey();
  const { data, error } = await client
    .from('site_edits')
    .select('page_key, edits, revision')
    .eq('page_key', page)
    .maybeSingle();

  if (error) {
    inlineAdminLiveEdits = inlineAdminLiveEdits || {};
    return inlineAdminLiveEdits;
  }

  inlineAdminLiveEdits = inlineAdminLiveEdits || {};
  inlineAdminLiveEdits[page] = data?.edits || {};
  inlineAdminLiveRevisions[page] = Number(data?.revision) || 0;
  if (!inlineAdminDirtyKeys[page]?.size) {
    inlineAdminBasePageEdits[page] = structuredClone(data?.edits || {});
  } else {
    const dirtyChanges = Object.fromEntries(
      [...inlineAdminDirtyKeys[page]]
        .filter((key) => Object.prototype.hasOwnProperty.call(inlineAdminDraftEdits?.[page] || {}, key))
        .map((key) => [key, inlineAdminDraftEdits[page][key]])
    );
    const utils = await adminStateUtilsPromise;
    const analysis = utils.analyzeElementPatch(inlineAdminBasePageEdits[page] || {}, data?.edits || {}, dirtyChanges);
    if (!analysis.canRebase) {
      stageInlineAdminPageConflict(page, dirtyChanges, data?.edits || {}, analysis);
    }
  }
  return inlineAdminLiveEdits;
}

function saveInlineAdminEditsLive() {
  const page = inlineAdminPageKey();
  const dirtyKeys = [...(inlineAdminDirtyKeys[page] || [])];
  const savedVersions = new Map(dirtyKeys.map((key) => [key, inlineAdminDirtyVersions[page]?.get(key) || 0]));
  const draftPage = getInlineAdminDraft()[page] || {};
  const changes = Object.fromEntries(dirtyKeys.filter((key) => key in draftPage).map((key) => [key, structuredClone(draftPage[key])]));
  const save = async () => {
    const client = getSupabaseClient();
    if (!client?.from || !client?.auth) {
      updateInlineAdminToolbarState('Live save unavailable');
      return false;
    }
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData?.session?.user) {
      updateInlineAdminToolbarState('Sign in as admin to save live');
      return false;
    }
    if (!dirtyKeys.length) return true;
    const { data: latestRow, error: loadError } = await client
      .from('site_edits')
      .select('edits, revision')
      .eq('page_key', page)
      .maybeSingle();
    if (loadError) {
      updateInlineAdminToolbarState(`Error — not saved: ${loadError.message || loadError}`);
      return false;
    }
    const latestEdits = latestRow?.edits || {};
    const expectedRevision = Number(latestRow?.revision) || 0;
    const utils = await adminStateUtilsPromise;
    const analysis = utils.analyzeElementPatch(inlineAdminBasePageEdits[page] || {}, latestEdits, changes);
    inlineAdminLiveEdits = inlineAdminLiveEdits || {};
    inlineAdminLiveEdits[page] = latestEdits;
    inlineAdminLiveRevisions[page] = expectedRevision;
    if (!analysis.canRebase) {
      stageInlineAdminPageConflict(page, changes, latestEdits, analysis);
      return false;
    }
    const { data, error } = await client.rpc('save_site_edits', {
      p_page_key: page,
      p_edits: changes,
      p_expected_revision: expectedRevision,
      p_replace: false
    });
    if (error) {
      console.warn('Live admin save failed:', error);
      if (String(error.code || '') === '40001' || String(error.message || '').includes('Admin state changed')) {
        const { data: refreshedRow } = await client.from('site_edits').select('edits, revision').eq('page_key', page).maybeSingle();
        const refreshedEdits = refreshedRow?.edits || {};
        const conflict = utils.analyzeElementPatch(latestEdits, refreshedEdits, changes);
        inlineAdminLiveEdits[page] = refreshedEdits;
        inlineAdminLiveRevisions[page] = Number(refreshedRow?.revision) || expectedRevision;
        stageInlineAdminPageConflict(page, changes, refreshedEdits, conflict);
        return false;
      }
      updateInlineAdminToolbarState(getLiveAdminSaveErrorMessage(error));
      return false;
    }
    inlineAdminLiveEdits[page] = data?.edits || analysis.mergedEdits;
    inlineAdminLiveRevisions[page] = Number(data?.revision) || (expectedRevision + 1);
    inlineAdminBasePageEdits[page] = structuredClone(inlineAdminLiveEdits[page]);
    const drafts = getInlineAdminDraft();
    try {
      const recovery = JSON.parse(localStorage.getItem(INLINE_ADMIN_RECOVERY_KEY) || '{}');
      recovery[page] = { edits: changes, savedAt: new Date().toISOString(), revision: inlineAdminLiveRevisions[page] };
      localStorage.setItem(INLINE_ADMIN_RECOVERY_KEY, JSON.stringify(recovery));
    } catch (_error) { /* Recovery history is best-effort. */ }
    dirtyKeys.forEach((key) => {
      if ((inlineAdminDirtyVersions[page]?.get(key) || 0) !== savedVersions.get(key)) return;
      inlineAdminDirtyKeys[page]?.delete(key);
      delete drafts[page]?.[key];
    });
    if (!Object.keys(drafts[page] || {}).length) delete drafts[page];
    writeInlineAdminEdits(drafts);
    inlineAdminHasUnsavedLocalChanges = Boolean(inlineAdminDirtyKeys[page]?.size);
    storefrontPendingConflict = null;
    document.getElementById('adminInlineConflictActions')?.setAttribute('hidden', '');
    announceStorefrontAdminSave(page, inlineAdminLiveRevisions[page], dirtyKeys);
    updateInlineAdminToolbarState(inlineAdminHasUnsavedLocalChanges ? 'Unsaved changes remain' : 'Saved Privately');
    return true;
  };
  const result = inlineAdminSaveQueue.then(save, save);
  inlineAdminSaveQueue = result.then(() => true, () => true);
  return result;
}

function getLiveAdminSaveErrorMessage(error) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || error || '').toLowerCase();

  if (code === '40001' || message.includes('admin state changed')) {
    return 'Live save conflict: reload before editing again';
  }

  if (code === '42P01' || message.includes('site_edits') || message.includes('does not exist')) {
    return 'Live save failed: run admin SQL';
  }

  if (code === '42501' || message.includes('row-level security') || message.includes('permission denied')) {
    return 'Live save failed: admin access missing';
  }

  if (message.includes('payload') || message.includes('too large') || message.includes('request entity')) {
    return 'Live save failed: image too large';
  }

  return 'Live save failed';
}

function applyInlineAdminEdits() {
  document.querySelectorAll('img,h1,h2,h3,h4,p,a,button,span,label,strong,li').forEach((element) => {
    if (element.closest('.auth-form')) return;
    if (!element.closest('.admin-anywhere-toolbar')) inlineAdminKey(element);
  });

  const pageEdits = getInlineAdminPageEdits();

  Object.entries(pageEdits).forEach(([key, edit]) => {
    if (edit?.type === 'homepageCategoryOrder') return;

    if (edit?.type === 'originalHeight') {
      const builder = [...document.querySelectorAll('.size-builder')].find((item) => getBuilderAdminSlug(item) === edit.slug);
      const inches = parseHeightToInches(String(edit.originalHeight || '')) || parseInt(edit.originalHeight || '0', 10);
      if (builder && inches) setBuilderOriginalHeight(builder, inches);
      return;
    }

    const element = document.querySelector(`[data-admin-edit="${key}"]`);
    if (!element) return;
    if (element.closest('.auth-form')) return;
    if (element.matches('.product-image-link')) return;
    if (element.tagName !== 'IMG' && element.closest('[data-stage-choice]')) {
      if (applyOriginalSizeFromEditedText(element, edit.text || '')) return;
      if (isLockedStageChoiceAdminText(element)) return;
    }
    if (element.tagName !== 'IMG' && element.closest('.size-builder')) {
      const builder = element.closest('.size-builder');
      if (edit.text && String(edit.text).toLowerCase().includes('original') && applyOriginalSizeFromEditedText(element, edit.text)) return;
      if (applyOriginalSizeFromEditedText(element, edit.text || '')) return;
      if (isLockedSizeBuilderAdminText(element)) return;
    }

    if (edit.text && element.tagName !== 'IMG') element.textContent = edit.text;
    if (edit.src && element.tagName === 'IMG') {
      if (!element.dataset.adminFallbackSrc) element.dataset.adminFallbackSrc = element.getAttribute('src') || '';
      const safeSrc = cleanInlineAdminImageSrc(edit.src);
      if (safeSrc) element.src = safeSrc;
    }
    if (element.tagName === 'IMG' && !isInlineAdminBackgroundImage(element)) {
      applyImageVisualState(element, edit);
    }
  });
}

function cleanInlineAdminImageSrc(src) {
  const value = String(src || '').trim();
  if (!value || value === 'undefined' || value === 'null' || value === '#') return '';
  if (value.startsWith('data:image') && value.length < 200) return '';
  return value;
}

function safeAdminImageNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeImageVisualState(state = {}) {
  return {
    x: safeAdminImageNumber(state.x, 0, -140, 140),
    y: safeAdminImageNumber(state.y, 0, -140, 140),
    scale: safeAdminImageNumber(state.scale, 1, 0.45, 2.1),
    rotate: safeAdminImageNumber(state.rotate, 0, -28, 28),
    locked: !!state.locked
  };
}

function applyImageVisualState(image, state = {}) {
  if (!image || isInlineAdminBackgroundImage(image)) return;
  const normalized = normalizeImageVisualState(state);
  ensureInlineAdminImageBaseTransform(image);
  image._adminImageState = normalized;
  image.style.setProperty('--admin-x', `${normalized.x}px`);
  image.style.setProperty('--admin-y', `${normalized.y}px`);
  image.style.setProperty('--admin-scale', normalized.scale);
  image.style.setProperty('--admin-rotate', `${normalized.rotate}deg`);
  image.classList.add('admin-transformable-image');
  image.classList.toggle('admin-image-locked', normalized.locked && isInlineAdminEditingEnabled());
}

function ensureInlineAdminImageBaseTransform(image) {
  if (!image || image.style.getPropertyValue('--admin-base-transform')) return;
  if (image.matches('.hero-group')) {
    image.style.setProperty('--admin-base-transform', 'translate(0, 0)');
    return;
  }
  const computedTransform = getComputedStyle(image).transform;
  image.style.setProperty('--admin-base-transform', computedTransform && computedTransform !== 'none' ? computedTransform : 'translate(0, 0)');
}

function saveInlineAdminEdit(element, patch) {
  const edits = getInlineAdminDraft();
  const page = inlineAdminPageKey();
  const key = inlineAdminKey(element);
  let pagePatch = { ...(patch || {}) };
  const owned = inlineAdminOwnedField(element);
  if (owned) {
    const attemptedCategoryDisplayEdit = element.tagName === 'IMG' && owned.type === 'category-card'
      && ['x', 'y', 'scale', 'rotate'].some((field) => pagePatch[field] !== undefined);
    if (element.tagName === 'IMG' && owned.type === 'product'
      && ['x', 'y', 'scale', 'rotate'].some((field) => pagePatch[field] !== undefined)) {
      scheduleInlineOwnedDisplaySave(element, pagePatch);
    }
    delete pagePatch.text;
    delete pagePatch.src;
    delete pagePatch.originalHeight;
    if (element.tagName === 'IMG') {
      delete pagePatch.x;
      delete pagePatch.y;
      delete pagePatch.scale;
      delete pagePatch.rotate;
    }
    delete pagePatch.locked;
    if (!Object.keys(pagePatch).length) {
      if (attemptedCategoryDisplayEdit) updateInlineAdminToolbarState('Open Edit selected item to save Category placement');
      return;
    }
  }
  pagePatch.approvalStatus = 'draft';
  pagePatch.updatedAt = new Date().toISOString();
  markInlineAdminElementDirty(page, key);
  edits[page] = edits[page] || {};
  edits[page][key] = { ...(edits[page][key] || {}), ...pagePatch };
  writeInlineAdminEdits(edits);
  inlineAdminDirty = true;
  inlineAdminHasUnsavedLocalChanges = true;
  updateInlineAdminToolbarState('Auto-saving...');
  scheduleInlineAdminAutoSave();
}

function scheduleInlineAdminAutoSave(delay = 650) {
  window.clearTimeout(inlineAdminAutoSaveTimer);
  inlineAdminAutoSaveTimer = window.setTimeout(() => {
    commitInlineAdminEdits();
  }, delay);
}

async function commitInlineAdminEdits() {
  writeInlineAdminEdits(getInlineAdminDraft());
  updateInlineAdminToolbarState('Saving live...');
  const saved = await saveInlineAdminEditsLive();
  if (saved) {
    inlineAdminDirty = Boolean(inlineAdminDirtyKeys[inlineAdminPageKey()]?.size);
    updateInlineAdminToolbarState(inlineAdminDirty ? 'Unsaved changes remain' : 'Saved Privately');
  }
  return saved;
}

function clearCurrentPageBrowserAdminEdits() {
  const edits = getInlineAdminDraft();
  const page = inlineAdminPageKey();
  delete edits[page];
  inlineAdminDirtyKeys[page] = new Set();
  inlineAdminDirtyVersions[page] = new Map();
  delete inlineAdminConflictDrafts[page];
  writeInlineAdminEdits(edits);
  inlineAdminDirty = false;
  inlineAdminHasUnsavedLocalChanges = false;
  showSiteMessage('Admin edits cleared for this page. Reloading clean view.', 'success');
  window.setTimeout(() => window.location.reload(), 450);
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
      rotate: Number(state.rotate || 0),
      locked: !!state.locked
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
      rotate: Number(snapshot.rotate || 0),
      locked: !!snapshot.locked
    };
    renderInlineAdminImageState(element);
    saveInlineAdminEdit(element, {
      src: snapshot.src,
      x: element._adminImageState.x,
      y: element._adminImageState.y,
      scale: element._adminImageState.scale,
      rotate: element._adminImageState.rotate,
      locked: !!element._adminImageState.locked
    });
    selectInlineAdminImage(element);
    return;
  }

  element.textContent = snapshot.text || '';
  const owned = inlineAdminOwnedField(element);
  if (owned) scheduleInlineOwnedFieldSave(element, owned, element.textContent.trim(), 0);
  else saveInlineAdminEdit(element, { text: element.textContent.trim() });
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

  if (status) status.textContent = message || (inlineAdminDirty ? 'Auto-saving...' : 'Auto-save is on');
  if (undo) undo.classList.toggle('disabled', !inlineAdminUndoStack.length);
  if (redo) redo.classList.toggle('disabled', !inlineAdminRedoStack.length);
  if (undo) undo.disabled = !inlineAdminUndoStack.length;
  if (redo) redo.disabled = !inlineAdminRedoStack.length;
  if (selected) {
    selected.textContent = activeImage
      ? (activeImage._adminImageState?.locked ? 'Image locked' : 'Image selected')
      : 'Select an image';
  }
  imageControls.forEach((control) => {
    control.classList.remove('disabled');
  });
  updateInlineAdminResizeHandle();
  updateInlineAdminLockButtons();
}

function renderInlineAdminImageState(image) {
  if (isInlineAdminBackgroundImage(image)) {
    image.style.removeProperty('--admin-x');
    image.style.removeProperty('--admin-y');
    image.style.removeProperty('--admin-scale');
    image.style.removeProperty('--admin-rotate');
    image.style.removeProperty('transform');
    image.classList.remove('admin-transformable-image');
    if (image === inlineAdminSelectedImage) updateInlineAdminResizeHandle();
    return;
  }

  applyImageVisualState(image, image._adminImageState);
  if (image === inlineAdminSelectedImage) updateInlineAdminResizeHandle();
  updateInlineAdminLockButtons();
}

function selectInlineAdminImage(image) {
  if (inlineAdminSelectedImage && inlineAdminSelectedImage !== image) {
    inlineAdminSelectedImage.classList.remove('admin-image-selected');
  }

  inlineAdminSelectedImage = image;
  inlineAdminSelectedRecordElement = image;
  image?.classList.add('admin-image-selected');
  const label = isInlineAdminBackgroundImage(image)
    ? 'Background selected'
    : image?._adminImageState?.locked
      ? 'Image locked'
    : 'Image selected';
  updateInlineAdminToolbarState(label);
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

  const startResize = (event) => {
    const image = getActiveInlineAdminImage();
    if (!image || inlineAdminResizeActive) return;

    event.preventDefault();
    event.stopPropagation();
    inlineAdminResizeActive = true;
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
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', stop);
      inlineAdminResizeActive = false;
      pushInlineAdminHistory(before, getInlineAdminSnapshot(image));
      updateInlineAdminResizeHandle();
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
  };

  handle.addEventListener('pointerdown', startResize);
  handle.addEventListener('mousedown', startResize);

  return handle;
}

function getInlineAdminLockButton(image) {
  if (!image || isInlineAdminBackgroundImage(image)) return null;
  const key = inlineAdminKey(image);
  const existing = document.querySelector(`.admin-image-lock-button[data-admin-lock-for="${key}"]`);
  if (existing) {
    image._adminLockButton = existing;
    return existing;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'admin-image-lock-button';
  button.dataset.adminLockFor = key;
  button.title = 'Lock or unlock this image';
  button.setAttribute('aria-label', 'Lock or unlock selected image');
  document.body.appendChild(button);
  image._adminLockButton = button;

  const toggle = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    toggleSelectedInlineAdminImageLock(image);
  };

  button.addEventListener('pointerdown', toggle);
  button.addEventListener('click', toggle);
  return button;
}

function updateInlineAdminLockButtons() {
  if (!document.body.classList.contains('admin-anywhere-on')) return;

  document.querySelectorAll('img.admin-editable-image').forEach((image) => {
    if (isInlineAdminBackgroundImage(image)) return;
    const locked = !!image._adminImageState?.locked;
    const selected = image === inlineAdminSelectedImage || image.classList.contains('admin-image-selected');
    const button = image._adminLockButton || (locked || selected ? getInlineAdminLockButton(image) : null);
    if (!button) return;

    if (!locked && !selected) {
      button.style.display = 'none';
      return;
    }

    const rect = image.getBoundingClientRect();
    button.textContent = locked ? 'Unlock' : 'Lock here';
    button.classList.toggle('is-locked', locked);
    button.style.display = 'inline-flex';
    button.style.left = `${rect.right + 8}px`;
    button.style.top = `${Math.max(8, rect.top + rect.height / 2 - 15)}px`;
  });
}

function updateInlineAdminResizeHandle() {
  const handle = document.getElementById('adminImageResizeHandle') || (inlineAdminSelectedImage ? getInlineAdminResizeHandle() : null);
  if (!handle) return;

  const image = inlineAdminSelectedImage || document.querySelector('.admin-image-selected');
  if (!image || image._adminImageState?.locked || isInlineAdminBackgroundImage(image) || !document.body.classList.contains('admin-anywhere-on')) {
    handle.style.display = 'none';
    return;
  }

  const rect = image.getBoundingClientRect();
  handle.style.display = 'block';
  handle.style.left = `${rect.right - 12}px`;
  handle.style.top = `${rect.bottom - 12}px`;
}

function getActiveInlineAdminImage(showMessage = true) {
  const selectedInPage = document.querySelector('img.admin-image-selected');
  const image = selectedInPage || (inlineAdminSelectedImage?.isConnected ? inlineAdminSelectedImage : null);
  if (!image) {
    if (showMessage) updateInlineAdminToolbarState('Select an image first');
    return null;
  }

  inlineAdminSelectedImage = image;
  if (!image._adminImageState) {
    const styles = getComputedStyle(image);
    image._adminImageState = {
      x: parseFloat(styles.getPropertyValue('--admin-x')) || 0,
      y: parseFloat(styles.getPropertyValue('--admin-y')) || 0,
      scale: parseFloat(styles.getPropertyValue('--admin-scale')) || 1,
      rotate: parseFloat(styles.getPropertyValue('--admin-rotate')) || 0,
      locked: image.classList.contains('admin-image-locked')
    };
  }

  return image;
}

function changeSelectedInlineAdminImage(patch) {
  const image = getActiveInlineAdminImage();
  if (!image) return;
  if (image._adminImageState?.locked) {
    updateInlineAdminToolbarState('Image locked');
    return;
  }
  if (isInlineAdminBackgroundImage(image)) {
    updateInlineAdminToolbarState('Backgrounds stay full size');
    return;
  }

  const before = getInlineAdminSnapshot(image);
  const state = image._adminImageState || { x: 0, y: 0, scale: 1, rotate: 0 };
  const next = {
    ...state,
    ...patch
  };

  next.x = safeAdminImageNumber(next.x, 0, -140, 140);
  next.y = safeAdminImageNumber(next.y, 0, -140, 140);
  next.scale = safeAdminImageNumber(next.scale, 1, 0.45, 2.1);
  next.rotate = safeAdminImageNumber(next.rotate, 0, -28, 28);
  image._adminImageState = next;
  renderInlineAdminImageState(image);
  saveInlineAdminEdit(image, {
    src: image.getAttribute('src') || '',
    x: next.x,
    y: next.y,
    scale: next.scale,
    rotate: next.rotate,
    locked: !!next.locked
  });
  pushInlineAdminHistory(before, getInlineAdminSnapshot(image));
}

function getInlineAdminImageFrame(image) {
  return image.closest(
    '.fan-card-stage, .fan-gallery-stage, .product-stage-preview, .category-featured-art, .category-option-strip, .category-card, .hero-stage'
  ) || image.parentElement;
}

function centerSelectedInlineAdminImage() {
  const image = getActiveInlineAdminImage();
  if (!image) return;
  if (image._adminImageState?.locked) {
    updateInlineAdminToolbarState('Image locked');
    return;
  }
  if (isInlineAdminBackgroundImage(image)) {
    updateInlineAdminToolbarState('Backgrounds already fill the box');
    return;
  }

  const frame = getInlineAdminImageFrame(image);
  if (!frame) {
    updateInlineAdminToolbarState('No box found');
    return;
  }

  const before = getInlineAdminSnapshot(image);
  const imageRect = image.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  const deltaX = (frameRect.left + frameRect.width / 2) - (imageRect.left + imageRect.width / 2);
  const deltaY = (frameRect.top + frameRect.height / 2) - (imageRect.top + imageRect.height / 2);
  const state = image._adminImageState || { x: 0, y: 0, scale: 1, rotate: 0 };
  const next = {
    ...state,
    x: safeAdminImageNumber(Number(state.x || 0) + deltaX, 0, -140, 140),
    y: safeAdminImageNumber(Number(state.y || 0) + deltaY, 0, -140, 140),
    scale: safeAdminImageNumber(state.scale, 1, 0.45, 2.1),
    rotate: safeAdminImageNumber(state.rotate, 0, -28, 28)
  };

  image._adminImageState = next;
  renderInlineAdminImageState(image);
  saveInlineAdminEdit(image, {
    src: image.getAttribute('src') || '',
    x: next.x,
    y: next.y,
    scale: next.scale,
    rotate: next.rotate,
    locked: !!next.locked
  });
  pushInlineAdminHistory(before, getInlineAdminSnapshot(image));
  updateInlineAdminToolbarState('Centered in box');
}

function nudgeSelectedInlineAdminImage(dx, dy) {
  const image = getActiveInlineAdminImage(false);
  if (!image || image._adminImageState?.locked || isInlineAdminBackgroundImage(image)) return;

  const state = image._adminImageState || { x: 0, y: 0, scale: 1, rotate: 0 };
  changeSelectedInlineAdminImage({
    x: Number(state.x || 0) + dx,
    y: Number(state.y || 0) + dy
  });
}

function resetSelectedInlineAdminImage() {
  const image = getActiveInlineAdminImage();
  if (!image) return;

  changeSelectedInlineAdminImage({
    x: 0,
    y: 0,
    scale: 1,
    rotate: 0
  });
  updateInlineAdminToolbarState('Back to normal');
}

function toggleSelectedInlineAdminImageLock(targetImage = null) {
  const image = targetImage || getActiveInlineAdminImage();
  if (!image || isInlineAdminBackgroundImage(image)) return;

  if (!image._adminImageState) {
    image._adminImageState = { x: 0, y: 0, scale: 1, rotate: 0, locked: false };
  }

  image._adminImageState.locked = !image._adminImageState.locked;
  image.classList.toggle('admin-image-locked', image._adminImageState.locked);
  saveInlineAdminEdit(image, {
    src: image.getAttribute('src') || '',
    ...image._adminImageState
  });
  updateInlineAdminToolbarState(image._adminImageState.locked ? 'Image locked' : 'Image unlocked');
  updateInlineAdminResizeHandle();
  updateInlineAdminLockButtons();
}

function unlockAllInlineAdminImages() {
  let count = 0;

  document.querySelectorAll('img.admin-editable-image.admin-image-locked').forEach((image) => {
    if (!image._adminImageState) return;
    image._adminImageState.locked = false;
    image.classList.remove('admin-image-locked');
    saveInlineAdminEdit(image, {
      src: image.getAttribute('src') || '',
      ...image._adminImageState
    });
    count += 1;
  });

  updateInlineAdminToolbarState(count ? 'All images unlocked' : 'No locked images');
  updateInlineAdminResizeHandle();
  updateInlineAdminLockButtons();
}

function readInlineHiddenCards() {
  try {
    return JSON.parse(localStorage.getItem(INLINE_HIDDEN_CARDS_KEY) || '{}');
  } catch (error) {
    return {};
  }
}

function writeInlineHiddenCards(cards) {
  try {
    localStorage.setItem(INLINE_HIDDEN_CARDS_KEY, JSON.stringify(cards || {}));
  } catch (error) {
    console.warn('Could not save hidden cards:', error);
  }
  return cards || {};
}

function getCardAdminKey(card) {
  if (!card) return '';
  if (card.dataset.adminCardKey) return card.dataset.adminCardKey;
  const builder = card.querySelector?.('.size-builder');
  ensureProductAdminSlugs(card);
  const builderSlug = builder?.dataset.adminSlug;
  const title = card.querySelector?.('.product-title-link, h3, h4, .fan-gallery-label')?.textContent || '';
  const key = builderSlug || getProductSlug(title) || `card-${[...document.querySelectorAll('.fan-vote-card, .fan-gallery-card, .product-card, .category-card')].indexOf(card)}`;
  card.dataset.adminCardKey = key;
  return key;
}

function getCardProductAdminSlug(card) {
  const builder = card?.querySelector?.('.size-builder');
  if (!builder) return '';
  return getBuilderAdminSlug(builder);
}

function inlineAdminCardVisibilityKey(card) {
  return `card-visibility-${inlineAdminStableSlug(getCardAdminKey(card))}`;
}

function isCardHiddenByAdmin(card) {
  const productSlug = getCardProductAdminSlug(card);
  const archivedProducts = productSlug ? getAdminArchivedProducts() : [];
  const visibilityEdit = getInlineAdminPageEdits()[inlineAdminCardVisibilityKey(card)];
  return Boolean(
    (!productSlug && visibilityEdit?.type === 'cardVisibility' && visibilityEdit.hidden === true) ||
    (productSlug && archivedProducts.includes(productSlug))
  );
}

async function setInlineAdminCardHidden(card, hiddenValue) {
  const key = getCardAdminKey(card);
  if (!key) return;
  const categoryKey = String(card.dataset.adminCategoryKey || '').trim();
  if (categoryKey) {
    const base = window.mvpluxLiveAdminSettings?.categories?.[categoryKey]
      || getAdminCategories()[categoryKey]
      || {};
    const saved = await saveStorefrontCategoryPatch(categoryKey, '', {
      homepageVisible: !hiddenValue
    }, base);
    if (!saved) return false;
    card.classList.toggle('admin-card-hidden-preview', Boolean(hiddenValue));
    updateInlineAdminToolbarState(hiddenValue ? 'Saved Privately — hidden from Homepage' : 'Saved Privately — shown on Homepage');
    return true;
  }
  const hidden = readInlineHiddenCards();
  const page = inlineAdminPageKey();
  hidden[page] = hidden[page] || {};
  if (hiddenValue) {
    hidden[page][key] = true;
  } else {
    delete hidden[page][key];
  }
  const productSlug = getCardProductAdminSlug(card);
  if (productSlug) {
    const archived = getAdminArchivedProducts();
    if (!await saveStorefrontListMembershipPatch(
      'savedForLaterProducts', productSlug, Boolean(hiddenValue), archived, 'mvpluxAdminArchivedProducts'
    )) return false;
  } else {
    const edits = getInlineAdminDraft();
    const visibilityKey = inlineAdminCardVisibilityKey(card);
    markInlineAdminElementDirty(page, visibilityKey);
    edits[page] = edits[page] || {};
    edits[page][visibilityKey] = { type: 'cardVisibility', hidden: Boolean(hiddenValue) };
    writeInlineAdminEdits(edits);
    inlineAdminDirty = true;
    inlineAdminHasUnsavedLocalChanges = true;
    scheduleInlineAdminAutoSave();
  }

  writeInlineHiddenCards(hidden);
  applyInlineHiddenCards();
  updateInlineAdminToolbarState(hiddenValue ? 'Card hidden from buyers' : 'Card visible again');
  return true;
}

async function deleteInlineAdminCard(card) {
  if (!card) return;
  const customSlug = card.querySelector?.('.size-builder')?.dataset.adminSlug;
  const customProducts = getAdminCustomProducts();
  const customIndex = customProducts.findIndex((product) => product.slug === customSlug);
  if (customIndex >= 0) {
    if (!window.confirm('Delete this display-card record? Its physical image file will not be deleted.')) return;
    const nextProducts = customProducts.filter((product) => product.slug !== customSlug);
    if (!await saveLiveAdminSettings({ customProducts: nextProducts })) return;
    localStorage.setItem('mvpluxAdminCustomProducts', JSON.stringify(nextProducts));
    card.remove();
    updateInlineAdminToolbarState('Custom card deleted');
    return;
  }

  const slug = getCardProductAdminSlug(card) || card.dataset.productId || getCardAdminKey(card);
  if (!slug || !window.confirm('Delete this card record? Its physical image file will not be deleted.')) return;
  const deletedProducts = [...new Set([...getAdminDeletedProducts(), slug])];
  if (!await saveLiveAdminSettings({ deletedProducts })) return;
  localStorage.setItem('mvpluxDeletedProducts', JSON.stringify(deletedProducts));
  card.remove();
  updateInlineAdminToolbarState('Card record deleted; image file retained');
}

function getInlineAdminSelectedCard() {
  const image = getActiveInlineAdminImage(false);
  return image?.closest('.fan-vote-card, .fan-gallery-card, .product-card, .category-card');
}

function hideSelectedInlineAdminCard() {
  const card = getInlineAdminSelectedCard();
  if (!card) {
    updateInlineAdminToolbarState('Select a card image first');
    return;
  }

  setInlineAdminCardHidden(card, true);
  inlineAdminSelectedImage = null;
}

async function restoreInlineHiddenCards() {
  const hidden = readInlineHiddenCards();
  delete hidden[inlineAdminPageKey()];
  if (!await saveLiveAdminSettings({ savedForLaterProducts: [] })) return;
  localStorage.setItem('mvpluxAdminArchivedProducts', JSON.stringify([]));
  writeInlineHiddenCards(hidden);
  const page = inlineAdminPageKey();
  const edits = getInlineAdminDraft();
  document.querySelectorAll('.fan-vote-card, .fan-gallery-card, .product-card, .category-card').forEach((card) => {
    if (getCardProductAdminSlug(card)) return;
    const visibilityKey = inlineAdminCardVisibilityKey(card);
    markInlineAdminElementDirty(page, visibilityKey);
    edits[page] = edits[page] || {};
    edits[page][visibilityKey] = { type: 'cardVisibility', hidden: false };
  });
  writeInlineAdminEdits(edits);
  scheduleInlineAdminAutoSave();
  document.querySelectorAll('.fan-vote-card, .fan-gallery-card, .product-card, .category-card').forEach((card) => {
    card.hidden = false;
    card.style.display = '';
  });
  updateInlineAdminToolbarState('Saved cards shown');
}

function readInlineAdminToolbarPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem('mvpluxInlineAdminToolbar') || '{}');
    return { collapsed: true, ...saved };
  } catch (error) {
    return { collapsed: true };
  }
}

function writeInlineAdminToolbarPrefs(prefs) {
  window.mvpluxInlineToolbarPrefs = { ...(prefs || {}) };
  localStorage.setItem('mvpluxInlineAdminToolbar', JSON.stringify(window.mvpluxInlineToolbarPrefs));
}

function forceAdminToolbarHiddenForThisUpdate() {
  const version = '20260705-hidden-admin-tools';
  if (localStorage.getItem('mvpluxToolbarHiddenVersion') === version) return;
  const prefs = readInlineAdminToolbarPrefs();
  prefs.collapsed = true;
  writeInlineAdminToolbarPrefs(prefs);
  localStorage.setItem('mvpluxToolbarHiddenVersion', version);
}

function applyInlineAdminToolbarPrefs() {
  const toolbar = document.querySelector('.admin-anywhere-toolbar');
  if (!toolbar) return;

  const prefs = readInlineAdminToolbarPrefs();
  ['left', 'right', 'top', 'bottom', 'width', 'height', 'maxHeight', 'transform'].forEach((prop) => {
    toolbar.style.removeProperty(prop);
  });

  toolbar.classList.toggle('admin-toolbar-side', prefs.layout === 'side');
  toolbar.classList.toggle('admin-toolbar-free', prefs.layout === 'free');
  toolbar.classList.toggle('admin-toolbar-small', prefs.size === 'small');
  toolbar.classList.toggle('admin-toolbar-collapsed', prefs.collapsed === true);
  const hideButton = document.getElementById('adminInlineHideTools');
  if (hideButton) hideButton.textContent = prefs.collapsed === true ? 'Tools' : 'Hide';

  if (prefs.layout === 'free') {
    const width = Math.min(Math.max(Number(prefs.width) || 360, 160), window.innerWidth - 16);
    const height = Math.min(Math.max(Number(prefs.height) || 78, 42), window.innerHeight - 16);
    const x = Math.min(Math.max(Number(prefs.x) || 16, 8), Math.max(8, window.innerWidth - width - 8));
    const y = Math.min(Math.max(Number(prefs.y) || 120, 8), Math.max(8, window.innerHeight - height - 8));
    toolbar.style.setProperty('left', `${x}px`, 'important');
    toolbar.style.setProperty('top', `${y}px`, 'important');
    toolbar.style.setProperty('right', 'auto', 'important');
    toolbar.style.setProperty('bottom', 'auto', 'important');
    toolbar.style.setProperty('width', `${width}px`, 'important');
    toolbar.style.setProperty('height', `${height}px`, 'important');
    toolbar.style.setProperty('transform', 'none', 'important');
  } else if (prefs.width && prefs.layout === 'side') {
    toolbar.style.setProperty('width', `${Math.min(Math.max(Number(prefs.width), 140), 360)}px`, 'important');
  }

  const layout = document.getElementById('adminInlineLayout');
  const size = document.getElementById('adminInlineToolSize');
  const hide = document.getElementById('adminInlineHideTools');
  if (layout) layout.textContent = prefs.layout === 'side' ? 'Bottom' : 'Side Dock';
  if (size) size.textContent = prefs.size === 'small' ? 'Normal' : 'Small';
  if (hide) hide.textContent = prefs.collapsed === true ? 'Show Tools' : 'Hide Tools';
}

function toggleInlineAdminToolbarLayout() {
  const prefs = readInlineAdminToolbarPrefs();
  prefs.layout = prefs.layout === 'side' ? 'bottom' : 'side';
  delete prefs.x;
  delete prefs.y;
  delete prefs.height;
  writeInlineAdminToolbarPrefs(prefs);
  applyInlineAdminToolbarPrefs();
}

function toggleInlineAdminToolbarSize() {
  const prefs = readInlineAdminToolbarPrefs();
  prefs.size = prefs.size === 'small' ? 'normal' : 'small';
  writeInlineAdminToolbarPrefs(prefs);
  applyInlineAdminToolbarPrefs();
}

function toggleInlineAdminToolbarCollapsed() {
  const prefs = readInlineAdminToolbarPrefs();
  prefs.collapsed = prefs.collapsed !== true;
  writeInlineAdminToolbarPrefs(prefs);
  applyInlineAdminToolbarPrefs();
}

function getInlineAdminCssSelector(image) {
  if (!image) return '';

  if (image.classList.contains('hero-logo-words')) return '.hero-logo-words';
  if (image.classList.contains('hero-middle')) return '.hero-middle';
  if (image.classList.contains('hero-left')) return '.hero-left';
  if (image.classList.contains('hero-right')) return '.hero-right';
  if (image.classList.contains('hero-bg')) return '.hero-bg';

  const productCard = image.closest('#shop .product-card');
  if (productCard) {
    const cardIndex = [...document.querySelectorAll('#shop .product-grid .product-card')].indexOf(productCard) + 1;
    const imageClass = image.classList.contains('product-stage-logo') ? 'product-stage-logo' : 'product-cutout';
    return `#shop .product-grid .product-card:nth-child(${cardIndex}) .${imageClass}`;
  }

  const categoryCard = image.closest('.category-card');
  if (categoryCard) {
    const cardIndex = [...document.querySelectorAll('.category-card')].indexOf(categoryCard) + 1;
    return `.category-card:nth-of-type(${cardIndex}) img`;
  }

  const editableKey = image.dataset.adminEdit || inlineAdminKey(image);
  return `[data-admin-edit="${editableKey}"]`;
}

function getInlineAdminBaseTransform(image) {
  if (!image) return '';
  if (
    image.classList.contains('product-cutout') ||
    image.classList.contains('product-stage-logo') ||
    image.classList.contains('hero-logo-words')
  ) {
    return 'translateX(-50%) ';
  }
  return '';
}

function copySelectedInlineAdminCode() {
  const image = getActiveInlineAdminImage();
  if (!image || isInlineAdminBackgroundImage(image)) {
    updateInlineAdminToolbarState('Select a movable image');
    return;
  }

  const state = image._adminImageState || { x: 0, y: 0, scale: 1, rotate: 0 };
  const selector = getInlineAdminCssSelector(image);
  const code = `${selector} {
  transform: ${getInlineAdminBaseTransform(image)}translate(${Math.round(state.x || 0)}px, ${Math.round(state.y || 0)}px) scale(${Number(state.scale || 1).toFixed(3)}) rotate(${Math.round(state.rotate || 0)}deg) !important;
}`;

  const copied = navigator.clipboard?.writeText(code);
  if (copied) {
    copied.then(
      () => updateInlineAdminToolbarState('Code copied'),
      () => updateInlineAdminToolbarState(code)
    );
  } else {
    updateInlineAdminToolbarState(code);
  }
}

function bindInlineAdminToolbarDragResize() {
  const toolbar = document.querySelector('.admin-anywhere-toolbar');
  const mover = document.getElementById('adminToolbarDragHandle');
  const resizer = document.getElementById('adminToolbarResizeHandle');
  if (!toolbar || toolbar.dataset.dragResizeReady) return;
  toolbar.dataset.dragResizeReady = 'true';

  const startToolbarDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = toolbar.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    const move = (moveEvent) => {
      const prefs = readInlineAdminToolbarPrefs();
      prefs.layout = 'free';
      prefs.collapsed = false;
      const width = Math.min(Math.max(rect.width, 160), window.innerWidth - 16);
      const height = Math.min(Math.max(rect.height, 42), window.innerHeight - 16);
      prefs.x = Math.min(Math.max(moveEvent.clientX - offsetX, 8), Math.max(8, window.innerWidth - width - 8));
      prefs.y = Math.min(Math.max(moveEvent.clientY - offsetY, 8), Math.max(8, window.innerHeight - height - 8));
      prefs.width = width;
      prefs.height = height;
      writeInlineAdminToolbarPrefs(prefs);
      applyInlineAdminToolbarPrefs();
    };

    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  };

  const isToolbarDragSurface = (target) => {
    if (!target || target.closest?.('button, a, input, textarea, select, #adminToolbarResizeHandle')) return false;
    if (target === toolbar) return true;
    return Boolean(target.closest?.('.admin-toolbar-group'));
  };

  mover?.addEventListener('pointerdown', (event) => {
    startToolbarDrag(event);
  });

  toolbar.addEventListener('pointerdown', (event) => {
    if (!isToolbarDragSurface(event.target)) return;
    startToolbarDrag(event);
  });

  mover?.addEventListener('dblclick', (event) => {
    event.preventDefault();
    const prefs = readInlineAdminToolbarPrefs();
    prefs.layout = 'bottom';
    delete prefs.x;
    delete prefs.y;
    delete prefs.width;
    delete prefs.height;
    writeInlineAdminToolbarPrefs(prefs);
    applyInlineAdminToolbarPrefs();
  });

  resizer?.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = toolbar.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;

    const resize = (moveEvent) => {
      const prefs = readInlineAdminToolbarPrefs();
      prefs.layout = prefs.layout === 'side' ? 'side' : 'free';
      prefs.collapsed = false;
      if (prefs.layout === 'free') {
        prefs.x = rect.left;
        prefs.y = rect.top;
        prefs.height = Math.min(Math.max(rect.height + (moveEvent.clientY - startY), 42), window.innerHeight - 16);
      }
      prefs.width = Math.min(Math.max(rect.width + (moveEvent.clientX - startX), 140), window.innerWidth - 16);
      writeInlineAdminToolbarPrefs(prefs);
      applyInlineAdminToolbarPrefs();
    };

    const stop = () => {
      window.removeEventListener('pointermove', resize);
      window.removeEventListener('pointerup', stop);
    };

    window.addEventListener('pointermove', resize);
    window.addEventListener('pointerup', stop, { once: true });
  });
}

function applyInlineHiddenCards() {
  document.querySelectorAll('.fan-vote-card, .fan-gallery-card, .product-card, .category-card').forEach((card, index) => {
    if (card.closest('#homepageCategoryGrid')) return;
    getCardAdminKey(card);
    const hidden = isCardHiddenByAdmin(card);
    card.classList.toggle('admin-card-hidden-preview', hidden);
    if (document.body.classList.contains('admin-anywhere-on')) {
      card.hidden = false;
      card.style.display = '';
    } else if (hidden) {
      card.hidden = true;
    } else {
      card.hidden = false;
      card.style.display = '';
    }
  });
}

function getHomepageCategoryRows() {
  return [...document.querySelectorAll('#shop .featured-category-row .product-carousel-row')];
}

function getHomepageCategoryCardOrder() {
  if (!isInlineAdminEditingEnabled()) {
    return window.mvpluxPublishedAdminSettings?.homepageCategoryOrder || [];
  }
  const edit = getInlineAdminPageEdits()[HOMEPAGE_CATEGORY_ORDER_EDIT_KEY];
  return edit?.type === 'homepageCategoryOrder' && Array.isArray(edit.rows) ? edit.rows : [];
}

function applyHomepageCategoryCardOrder() {
  const rows = getHomepageCategoryRows();
  const savedRows = getHomepageCategoryCardOrder();
  if (!rows.length || !savedRows.length) return;

  const cardsByKey = new Map();
  rows.forEach((row) => {
    row.querySelectorAll(':scope > .product-card').forEach((card) => {
      cardsByKey.set(getCardAdminKey(card), card);
    });
  });

  savedRows.forEach((keys, rowIndex) => {
    const row = rows[rowIndex];
    if (!row || !Array.isArray(keys)) return;
    keys.forEach((key) => {
      const card = cardsByKey.get(key);
      if (card) row.append(card);
    });
  });
}

function saveHomepageCategoryCardOrder() {
  const rows = getHomepageCategoryRows();
  if (!rows.length) return;

  const edits = getInlineAdminDraft();
  const page = inlineAdminPageKey();
  markInlineAdminElementDirty(page, HOMEPAGE_CATEGORY_ORDER_EDIT_KEY);
  edits[page] = edits[page] || {};
  edits[page][HOMEPAGE_CATEGORY_ORDER_EDIT_KEY] = {
    type: 'homepageCategoryOrder',
    rows: rows.map((row) => [...row.querySelectorAll(':scope > .product-card')].map(getCardAdminKey))
  };
  writeInlineAdminEdits(edits);
  inlineAdminDirty = true;
  inlineAdminHasUnsavedLocalChanges = true;
  updateInlineAdminToolbarState('Auto-saving card order...');
  scheduleInlineAdminAutoSave();
}

function moveHomepageCategoryCard(card, direction) {
  const row = card?.closest('#shop .product-carousel-row');
  const rows = getHomepageCategoryRows();
  const rowIndex = rows.indexOf(row);
  if (!card || !row || rowIndex < 0) return false;

  const rowCards = [...row.querySelectorAll(':scope > .product-card')];
  const cardIndex = rowCards.indexOf(card);

  if (direction === 'left' && cardIndex > 0) {
    row.insertBefore(card, rowCards[cardIndex - 1]);
  } else if (direction === 'right' && cardIndex >= 0 && cardIndex < rowCards.length - 1) {
    row.insertBefore(rowCards[cardIndex + 1], card);
  } else if (direction === 'up' && rowIndex > 0) {
    rows[rowIndex - 1].append(card);
  } else if (direction === 'down' && rowIndex < rows.length - 1) {
    rows[rowIndex + 1].append(card);
  } else {
    return false;
  }

  saveHomepageCategoryCardOrder();
  updateInlineAdminToolbarState(`Card moved ${direction}`);
  return true;
}

async function saveManagedProductPatch(slug, patch) {
  const baseRecord = getManagedProductBySlug(slug) || {};
  return saveStorefrontProductPatch(slug, patch, baseRecord);
}

async function removeManagedProductFromCurrentSection(card) {
  const slug = card?.dataset.productId;
  const category = getCurrentProductCategory();
  const product = getManagedProductBySlug(slug);
  if (!slug || !category || !product) return;
  if (!await saveManagedProductPatch(slug, { categories: product.categories.filter((key) => key !== category) })) return;
  card.remove();
  updateInlineAdminToolbarState('Removed from this section; product retained');
}

async function moveManagedProductInCurrentSection(card, offset) {
  const slug = card?.dataset.productId;
  const category = getCurrentProductCategory();
  const products = getManagedProductCatalog()
    .filter((product) => product.visible !== false && product.categories.includes(category))
    .sort((a, b) => (Number(a.categoryOrder?.[category]) || 0) - (Number(b.categoryOrder?.[category]) || 0));
  const index = products.findIndex((product) => product.slug === slug);
  const target = products[index + offset];
  if (index < 0 || !target) return;
  const current = products[index];
  const currentOrder = Number(current.categoryOrder?.[category]) || index;
  const targetOrder = Number(target.categoryOrder?.[category]) || index + offset;
  if (!await saveStorefrontProductPatches({
    [current.slug]: { categoryOrder: { ...(current.categoryOrder || {}), [category]: targetOrder } },
    [target.slug]: { categoryOrder: { ...(target.categoryOrder || {}), [category]: currentOrder } }
  }, {
    [current.slug]: current,
    [target.slug]: target
  })) {
    updateInlineAdminToolbarState('Section order was not saved');
    return;
  }
  const grid = card.parentElement;
  const renderedCards = new Map(
    [...(grid?.querySelectorAll?.(':scope > .category-card[data-product-id]') || [])]
      .map((item) => [item.dataset.productId, item])
  );
  const reorderedProducts = [...products];
  [reorderedProducts[index], reorderedProducts[index + offset]] = [reorderedProducts[index + offset], reorderedProducts[index]];
  if (grid) reorderedProducts.forEach((product) => {
    const productCard = renderedCards.get(product.slug);
    if (productCard) grid.append(productCard);
  });
  updateInlineAdminToolbarState('Section order saved');
}

async function deleteManagedProduct(card) {
  const slug = card?.dataset.productId;
  if (!slug || !window.confirm('Delete this product record? Its image file will not be deleted.')) return;
  const customProducts = getAdminCustomProducts();
  if (customProducts.some((product) => product.slug === slug)) {
    const nextProducts = customProducts.filter((product) => product.slug !== slug);
    if (!await saveLiveAdminSettings({ customProducts: nextProducts })) return;
    localStorage.setItem('mvpluxAdminCustomProducts', JSON.stringify(nextProducts));
    card.remove();
    updateInlineAdminToolbarState('Product deleted; image file retained');
    return;
  }
  const deletedProducts = [...new Set([...getAdminDeletedProducts(), slug])];
  if (!await saveLiveAdminSettings({ deletedProducts })) return;
  localStorage.setItem('mvpluxDeletedProducts', JSON.stringify(deletedProducts));
  card.remove();
  updateInlineAdminToolbarState('Product deleted; image file retained');
}

function ensureInlineAdminCardControls() {
  if (!document.body.classList.contains('admin-anywhere-on')) return;
  document.querySelectorAll('#shop .product-card, .category-page .category-card').forEach((card) => {
    if (card.querySelector(':scope > .admin-card-controls')) {
      const hideButton = card.querySelector(':scope > .admin-card-controls [data-admin-card-action="hide-toggle"]');
      if (hideButton) hideButton.textContent = isCardHiddenByAdmin(card) ? 'Unhide' : 'Hide';
      return;
    }
    const controls = document.createElement('div');
    controls.className = 'admin-card-controls';
    const managedProductSlug = card.matches('.category-page .category-card[data-product-id]') ? card.dataset.productId : '';
    const homepageDisplayCard = Boolean(card.closest('#shop .featured-category-row'));
    controls.innerHTML = `
      ${managedProductSlug ? `
        <button type="button" data-admin-card-action="remove-section" title="Remove from this category">Remove</button>
        <button type="button" data-admin-card-action="move-product-left" title="Move left">←</button>
        <button type="button" data-admin-card-action="move-product-right" title="Move right">→</button>
        <button type="button" data-admin-card-action="move-product-up" title="Move up">↑</button>
        <button type="button" data-admin-card-action="move-product-down" title="Move down">↓</button>
        <details class="admin-card-more"><summary>More</summary><div>
          <a href="admin.html#product-${managedProductSlug}">Edit Product</a>
          <button type="button" data-admin-card-action="delete-product">Delete Product</button>
        </div></details>
      ` : `
        <button type="button" data-admin-card-action="hide-toggle">Hide</button>
        ${homepageDisplayCard ? '<button type="button" data-admin-card-action="remove-display" title="Remove from homepage display">Remove</button>' : ''}
      `}
      ${homepageDisplayCard ? `
        <button type="button" data-admin-card-action="move-left" title="Move left">←</button>
        <button type="button" data-admin-card-action="move-right" title="Move right">→</button>
        <button type="button" data-admin-card-action="move-up" title="Move up">↑</button>
        <button type="button" data-admin-card-action="move-down" title="Move down">↓</button>
        <details class="admin-card-more"><summary>More</summary><div>
          <a href="admin.html#product-${getCardAdminKey(card)}">Edit Card</a>
          <button type="button" data-admin-card-action="delete-card">Delete Record</button>
        </div></details>
      ` : ''}
    `;
    controls.addEventListener('click', async (event) => {
      event.stopPropagation();
      const actionControl = event.target.closest('[data-admin-card-action]');
      if (!actionControl) return;
      event.preventDefault();
      const action = actionControl.dataset.adminCardAction;
      if (action === 'hide-toggle') {
        setInlineAdminCardHidden(card, !isCardHiddenByAdmin(card));
        ensureInlineAdminCardControls();
      }
      if (action === 'delete-card') {
        deleteInlineAdminCard(card);
        ensureInlineAdminCardControls();
      }
      if (action === 'remove-display') {
        if (window.confirm('Remove this card from the homepage display? The record and physical image file will be preserved.')) {
          setInlineAdminCardHidden(card, true);
          ensureInlineAdminCardControls();
        }
      }
      if (action?.startsWith('move-')) {
        if (action.startsWith('move-product-')) {
          const direction = action.slice('move-product-'.length);
          const columnCount = Math.max(1, getComputedStyle(card.parentElement).gridTemplateColumns.split(' ').length);
          const offset = direction === 'left' ? -1
            : direction === 'right' ? 1
              : direction === 'up' ? -columnCount
                : columnCount;
          await moveManagedProductInCurrentSection(card, offset);
        } else {
          moveHomepageCategoryCard(card, action.slice(5));
        }
      }
      if (action === 'remove-section') removeManagedProductFromCurrentSection(card);
      if (action === 'delete-product') deleteManagedProduct(card);
    });
    card.prepend(controls);
    const hideButton = controls.querySelector('[data-admin-card-action="hide-toggle"]');
    if (hideButton) hideButton.textContent = isCardHiddenByAdmin(card) ? 'Unhide' : 'Hide';
  });
}

function inlineRecordContext(element = inlineAdminSelectedRecordElement || inlineAdminSelectedImage) {
  const owned = inlineAdminOwnedField(element);
  if (owned) return owned;
  const card = element?.closest?.('.product-card, .category-card');
  const builder = card?.querySelector?.('.size-builder');
  const slug = builder?.dataset.adminSlug || card?.dataset.productId || '';
  if (!slug) return null;
  const categoryKey = card?.dataset.adminCategoryKey || STOREFRONT_CATEGORY_CARD_MAP[slug];
  return categoryKey ? { type: 'category-card', categoryKey, slug } : { type: 'product', slug };
}

function inlineImageChoiceLines(choices = []) {
  return (Array.isArray(choices) ? choices : [])
    .map((choice) => `${choice.label || 'Alternate image'} | ${choice.image || ''}`)
    .join('\n');
}

function parseInlineImageChoiceLines(value = '') {
  const seen = new Set();
  return String(value).split(/\r?\n/).flatMap((line) => {
    const [labelPart, ...pathParts] = line.split('|');
    const image = pathParts.join('|').trim();
    if (!image || !image.startsWith('images/') || image.includes('..') || seen.has(image)) return [];
    seen.add(image);
    return [{ label: labelPart.trim() || 'Alternate image', image }];
  });
}

function ensureInlineRecordEditor() {
  let panel = document.getElementById('adminInlineRecordEditor');
  if (panel) return panel;
  panel = document.createElement('aside');
  panel.id = 'adminInlineRecordEditor';
  panel.className = 'admin-inline-record-editor';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="admin-inline-record-heading">
      <strong data-inline-record-title>Edit selected item</strong>
      <button type="button" data-inline-record-close aria-label="Close">×</button>
    </div>
    <form data-inline-record-form></form>
    <p data-inline-record-status aria-live="polite"></p>
  `;
  document.body.appendChild(panel);
  panel.querySelector('[data-inline-record-close]')?.addEventListener('click', () => { panel.hidden = true; });
  panel.querySelector('[data-inline-record-form]')?.addEventListener('submit', saveInlineRecordEditor);
  panel.querySelector('[data-inline-record-form]')?.addEventListener('click', async (event) => {
    const reset = event.target.closest('[data-inline-reset-product-display]');
    const archive = event.target.closest('[data-inline-archive-product]');
    const previewCategory = event.target.closest('[data-inline-preview-category]');
    const applyCategory = event.target.closest('[data-inline-apply-category]');
    const clearCategoryOverrides = event.target.closest('[data-inline-clear-category-overrides]');
    const resetSelectedOverrides = event.target.closest('[data-inline-reset-selected-overrides]');
    const resetCategory = event.target.closest('[data-inline-reset-category]');
    if (!reset && !archive && !previewCategory && !applyCategory && !clearCategoryOverrides && !resetSelectedOverrides && !resetCategory) return;
    event.preventDefault();
    if (previewCategory) {
      const status = panel.querySelector('[data-inline-record-status]');
      status.textContent = 'Preview uses these values in this panel. Save privately to apply them across this Admin preview.';
      return;
    }
    if (applyCategory || clearCategoryOverrides || resetSelectedOverrides || resetCategory) {
      const status = panel.querySelector('[data-inline-record-status]');
      status.textContent = 'Saving…';
      const saved = await saveInlineCategoryDisplayAction(panel, {
        clearAll: Boolean(clearCategoryOverrides),
        resetSelected: Boolean(resetSelectedOverrides),
        resetCategory: Boolean(resetCategory)
      });
      status.textContent = saved ? 'Saved privately — customers cannot see this yet.' : 'Not saved.';
      if (saved) openInlineRecordEditor(inlineAdminSelectedRecordElement || inlineAdminSelectedImage);
      return;
    }
    const slug = panel.dataset.recordKey;
    const base = panel._baseRecord || getManagedProductBySlug(slug) || {};
    if (reset) {
      if (!window.confirm('Reset this product so it uses its category display settings?')) return;
      const saved = await saveStorefrontProductPatch(slug, { displayOverrides: {}, updatedAt: new Date().toISOString() }, base);
      if (saved) openInlineRecordEditor(inlineAdminSelectedRecordElement || inlineAdminSelectedImage);
    }
    if (archive) {
      if (!window.confirm('Archive this product? Its record and physical images will be preserved.')) return;
      const saved = await saveStorefrontProductPatch(slug, {
        visible: false,
        draftStatus: 'archived',
        updatedAt: new Date().toISOString()
      }, base);
      if (saved) panel.hidden = true;
    }
  });
  return panel;
}

function inlineProductEditorMarkup(product = {}) {
  const categoryOptions = Object.values(getAdminCategories()).map((category) => {
    const key = String(category.key || '');
    return `<label><input type="checkbox" name="categories" value="${escapeHtml(key)}" ${(product.categories || []).includes(key) ? 'checked' : ''}> ${escapeHtml(category.title || key)}</label>`;
  }).join('');
  const display = product.displayOverrides || {};
  return `
    <details open><summary>Product information</summary>
      <label>Title<input name="title" value="${escapeHtml(product.title || '')}"></label>
      <label>Description<textarea name="description">${escapeHtml(product.description || '')}</textarea></label>
      <label>Fun fact<textarea name="funFact">${escapeHtml(product.funFact || '')}</textarea></label>
      <label>Original height<input name="originalHeight" value="${escapeHtml(String(product.originalHeight || ''))}"></label>
      <label>Price override<input name="priceOverride" type="number" min="0" step="0.01" value="${escapeHtml(String(product.priceOverride ?? ''))}"></label>
    </details>
    <details><summary>Images</summary>
      <label>Main image<input name="cutoutImage" value="${escapeHtml(product.cutoutImage || '')}"></label>
      <label>Background<input name="backgroundImage" value="${escapeHtml(product.backgroundImage || '')}"></label>
      <label>Image choices <small>One per line: Label | images/path.png</small><textarea name="imageChoices">${escapeHtml(inlineImageChoiceLines(product.imageChoices))}</textarea></label>
    </details>
    <details><summary>Categories</summary><div class="admin-inline-category-options">${categoryOptions || '<small>No categories loaded.</small>'}</div></details>
    <details><summary>Display</summary>
      <p class="admin-note">Leave fields blank to use category settings.</p>
      <label>Background position<input name="backgroundPosition" value="${escapeHtml(display.backgroundPosition || '')}"></label>
      <label>Standee size %<input name="standeeSizePercent" type="number" value="${escapeHtml(String(display.standeeSizePercent ?? ''))}"></label>
      <label>Left / right %<input name="standeeLeftPercent" type="number" value="${escapeHtml(String(display.standeeLeftPercent ?? ''))}"></label>
      <label>Up / down %<input name="standeeVerticalPercent" type="number" value="${escapeHtml(String(display.standeeVerticalPercent ?? ''))}"></label>
      <button type="button" data-inline-reset-product-display>Reset Product to Category Settings</button>
    </details>
    <details><summary>Visibility and order</summary>
      <label><input name="visible" type="checkbox" ${product.visible !== false ? 'checked' : ''}> Visible</label>
      <label>Exact product order<input name="productOrder" type="number" value="${escapeHtml(String(product.productOrder ?? ''))}"></label>
      <button type="button" data-inline-archive-product>Archive</button>
    </details>
    <button type="submit">Save Product Privately</button>
  `;
}

function inlineCategoryEditorMarkup(category = {}) {
  const card = category.card || {};
  const presentation = getEffectiveCategoryPresentation(category.key);
  const display = presentation.display;
  const products = Object.values(getAdminProducts()).filter((product) => (product.categories || []).includes(category.key));
  const overrideProducts = products.filter((product) => Object.keys(product.displayOverrides || {}).length);
  return `
    <details open><summary>Category information</summary>
      <label>Title<input name="title" value="${escapeHtml(category.title || '')}"></label>
      <label>Description<textarea name="description">${escapeHtml(category.description || '')}</textarea></label>
      <label>Fun fact<textarea name="funFact">${escapeHtml(category.funFact || '')}</textarea></label>
      <label>Page<input name="page" value="${escapeHtml(category.page || '')}"></label>
      <label><input name="visible" type="checkbox" ${category.visible !== false ? 'checked' : ''}> Visible</label>
      <label><input name="homepageVisible" type="checkbox" ${category.homepageVisible !== false && !category.parentKey ? 'checked' : ''} ${category.parentKey ? 'disabled' : ''}> ${category.parentKey ? 'Child Groups stay off the Homepage' : 'Show on Homepage'}</label>
      <label>Order<input name="order" type="number" value="${escapeHtml(String(category.order ?? 0))}"></label>
    </details>
    <details open><summary>Category card</summary>
      <p class="admin-note">The homepage card uses the authoritative Category title and description above.</p>
      <label>Card image<input name="cardImage" value="${escapeHtml(card.image || '')}"></label>
      <label>Card background<input name="cardBackgroundImage" value="${escapeHtml(card.backgroundImage || '')}"></label>
    </details>
    <details open><summary>Category-wide display settings</summary>
      <p class="admin-note">These are the same normalized Category display settings used by Dashboard preview and the published storefront.</p>
      <label>Background position<input name="displayBackgroundPosition" value="${escapeHtml(display.backgroundPosition || 'center bottom')}"></label>
      <label>Background zoom %<input name="displayBackgroundSizePercent" type="number" min="50" max="300" value="${escapeHtml(String(display.backgroundSizePercent ?? 100))}"></label>
      <label>Category image size %<input name="displayStandeeSizePercent" type="number" min="10" max="250" value="${escapeHtml(String(display.standeeSizePercent))}"></label>
      <label>Image left / right %<input name="displayStandeeLeftPercent" type="number" min="-50" max="50" value="${escapeHtml(String(display.standeeLeftPercent))}"></label>
      <label>Image up / down %<input name="displayStandeeVerticalPercent" type="number" min="-50" max="50" value="${escapeHtml(String(display.standeeVerticalPercent))}"></label>
      <label>Title size %<input name="displayTitleSizePercent" type="number" min="70" max="180" value="${escapeHtml(String(display.titleSizePercent))}"></label>
      <label>Title left / right %<input name="displayTitleLeftPercent" type="number" min="-50" max="50" value="${escapeHtml(String(display.titleLeftPercent))}"></label>
      <label>Title up / down %<input name="displayTitleVerticalPercent" type="number" min="-50" max="50" value="${escapeHtml(String(display.titleVerticalPercent))}"></label>
      <label>Title alignment<select name="displayTitleAlign">${['left', 'center', 'right'].map((value) => `<option value="${value}" ${display.titleAlign === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
      <label>Description size %<input name="displayDescriptionSizePercent" type="number" min="70" max="180" value="${escapeHtml(String(display.descriptionSizePercent))}"></label>
      <label>Description left / right %<input name="displayDescriptionLeftPercent" type="number" min="-50" max="50" value="${escapeHtml(String(display.descriptionLeftPercent))}"></label>
      <label>Description up / down %<input name="displayDescriptionVerticalPercent" type="number" min="-50" max="50" value="${escapeHtml(String(display.descriptionVerticalPercent))}"></label>
      <label>Description alignment<select name="displayDescriptionAlign">${['left', 'center', 'right'].map((value) => `<option value="${value}" ${display.descriptionAlign === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
      <p>${products.length} products total; ${overrideProducts.length} have individual overrides.</p>
      <div class="admin-inline-category-products">${overrideProducts.map((product) => `<label><input type="checkbox" name="resetOverrideSlugs" value="${escapeHtml(product.slug)}"> ${escapeHtml(product.title || product.slug)}</label>`).join('') || '<small>No products have overrides.</small>'}</div>
      <button type="button" data-inline-preview-category>Preview Category Changes</button>
      <button type="button" data-inline-apply-category>Apply to Entire Category</button>
      <button type="button" data-inline-clear-category-overrides>Update Defaults and Clear All Individual Overrides</button>
      <button type="button" data-inline-reset-selected-overrides>Reset Selected Products to Category Settings</button>
      <button type="button" data-inline-reset-category>Reset Category to Global Defaults</button>
    </details>
    <button type="submit">Save Category Privately</button>
  `;
}

function categoryDisplaySettingsFromForm(form) {
  const data = new FormData(form);
  const settings = {
    backgroundPosition: String(data.get('displayBackgroundPosition') || 'center bottom').trim() || 'center bottom'
  };
  const fields = ['backgroundSizePercent', 'standeeSizePercent', 'standeeLeftPercent', 'standeeVerticalPercent', 'titleSizePercent', 'titleLeftPercent', 'titleVerticalPercent', 'descriptionSizePercent', 'descriptionLeftPercent', 'descriptionVerticalPercent'];
  fields.forEach((field) => {
    const formName = `display${field.charAt(0).toUpperCase()}${field.slice(1)}`;
    const value = String(data.get(formName) || '').trim();
    if (value !== '' && Number.isFinite(Number(value))) settings[field] = Number(value);
  });
  settings.titleAlign = ['left', 'center', 'right'].includes(String(data.get('displayTitleAlign'))) ? String(data.get('displayTitleAlign')) : 'center';
  settings.descriptionAlign = ['left', 'center', 'right'].includes(String(data.get('displayDescriptionAlign'))) ? String(data.get('displayDescriptionAlign')) : 'center';
  return settings;
}

async function saveInlineCategoryDisplayAction(panel, { clearAll = false, resetSelected = false, resetCategory = false } = {}) {
  const categoryKey = panel.dataset.recordKey;
  const baseCategory = panel._baseRecord || {};
  const products = Object.values(getAdminProducts()).filter((product) => (product.categories || []).includes(categoryKey));
  const overrideProducts = products.filter((product) => Object.keys(product.displayOverrides || {}).length);
  let settings = resetCategory ? { backgroundPosition: 'center bottom' } : categoryDisplaySettingsFromForm(panel.querySelector('form'));
  if (resetCategory && !window.confirm('Reset this category to the global display defaults?')) return false;
  if (clearAll && !window.confirm(`Update the category defaults and clear individual overrides for ${overrideProducts.length} product(s)?`)) return false;
  if (!clearAll && !resetSelected && !resetCategory && !window.confirm(`Save category defaults for ${products.length} product(s)? ${overrideProducts.length} individual override(s) will remain unchanged.`)) return false;
  const savedCategory = await saveStorefrontCategoryPatch(categoryKey, 'displaySettings', settings, baseCategory);
  if (!savedCategory) return false;
  const slugs = clearAll
    ? overrideProducts.map((product) => product.slug)
    : resetSelected
      ? new FormData(panel.querySelector('form')).getAll('resetOverrideSlugs')
      : [];
  if (slugs.length) {
    const patches = Object.fromEntries(slugs.map((slug) => [slug, { displayOverrides: {}, updatedAt: new Date().toISOString() }]));
    const bases = Object.fromEntries(slugs.map((slug) => [slug, getManagedProductBySlug(slug) || {}]));
    if (!await saveStorefrontProductPatches(patches, bases)) return false;
  }
  return true;
}

function changedInlineFields(base, candidate, fields) {
  return Object.fromEntries(fields.flatMap((field) => JSON.stringify(base?.[field]) === JSON.stringify(candidate?.[field]) ? [] : [[field, candidate[field]]]));
}

async function saveInlineRecordEditor(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const panel = form.closest('#adminInlineRecordEditor');
  const status = panel.querySelector('[data-inline-record-status]');
  const data = new FormData(form);
  const base = panel._baseRecord || {};
  status.textContent = 'Saving…';
  if (panel.dataset.recordType === 'category-card') {
    const candidate = {
      title: String(data.get('title') || '').trim(),
      description: String(data.get('description') || '').trim(),
      funFact: String(data.get('funFact') || '').trim(),
      page: String(data.get('page') || '').trim(),
      visible: data.has('visible'),
      homepageVisible: base.parentKey ? false : data.has('homepageVisible'),
      order: Number(data.get('order') || 0)
    };
    const cardCandidate = {
      image: String(data.get('cardImage') || '').trim(),
      backgroundImage: String(data.get('cardBackgroundImage') || '').trim()
    };
    const displayCandidate = categoryDisplaySettingsFromForm(form);
    const rootPatch = changedInlineFields(base, candidate, ['title', 'description', 'funFact', 'page', 'visible', 'homepageVisible', 'order']);
    const cardPatch = changedInlineFields(base.card || {}, cardCandidate, ['image', 'backgroundImage']);
    const displayPatch = JSON.stringify(base.displaySettings || {}) === JSON.stringify(displayCandidate) ? {} : displayCandidate;
    let saved = true;
    if (Object.keys(rootPatch).length) saved = await saveStorefrontCategoryPatch(panel.dataset.recordKey, '', rootPatch, base);
    if (saved && Object.keys(cardPatch).length) {
      const refreshed = window.mvpluxLiveAdminSettings?.categories?.[panel.dataset.recordKey] || base;
      saved = await saveStorefrontCategoryPatch(panel.dataset.recordKey, 'card', cardPatch, refreshed);
    }
    if (saved && Object.keys(displayPatch).length) {
      const refreshed = window.mvpluxLiveAdminSettings?.categories?.[panel.dataset.recordKey] || base;
      saved = await saveStorefrontCategoryPatch(panel.dataset.recordKey, 'displaySettings', displayPatch, refreshed);
    }
    status.textContent = saved ? 'Saved privately — customers cannot see this yet.' : 'Save failed — your changes remain in this panel.';
    if (saved) panel._baseRecord = structuredClone(window.mvpluxLiveAdminSettings?.categories?.[panel.dataset.recordKey] || { ...base, ...rootPatch, card: { ...(base.card || {}), ...cardPatch } });
    return;
  }

  const displayOverrides = { ...(base.displayOverrides || {}) };
  ['backgroundPosition', 'standeeSizePercent', 'standeeLeftPercent', 'standeeVerticalPercent'].forEach((field) => {
    const value = String(data.get(field) || '').trim();
    if (!value) delete displayOverrides[field];
    else displayOverrides[field] = field === 'backgroundPosition' ? value : Number(value);
  });
  const candidate = {
    title: String(data.get('title') || '').trim(),
    description: String(data.get('description') || '').trim(),
    funFact: String(data.get('funFact') || '').trim(),
    originalHeight: String(resolveSellableProductHeight(data.get('originalHeight'))),
    priceOverride: String(data.get('priceOverride') || '').trim() === '' ? null : Number(data.get('priceOverride')),
    cutoutImage: String(data.get('cutoutImage') || '').trim(),
    backgroundImage: String(data.get('backgroundImage') || '').trim(),
    imageChoices: parseInlineImageChoiceLines(data.get('imageChoices')),
    categories: data.getAll('categories'),
    visible: data.has('visible'),
    productOrder: String(data.get('productOrder') || '').trim() === '' ? null : Number(data.get('productOrder')),
    displayOverrides
  };
  const fields = ['title', 'description', 'funFact', 'originalHeight', 'priceOverride', 'cutoutImage', 'backgroundImage', 'imageChoices', 'categories', 'visible', 'productOrder', 'displayOverrides'];
  const patch = changedInlineFields(base, candidate, fields);
  if (!Object.keys(patch).length) {
    status.textContent = 'No changes to save.';
    return;
  }
  patch.updatedAt = new Date().toISOString();
  patch.draftStatus = 'ready';
  patch.approvalStatus = 'draft';
  const saved = await saveStorefrontProductPatch(panel.dataset.recordKey, patch, base);
  status.textContent = saved ? 'Saved privately — customers cannot see this yet.' : 'Save failed — your changes remain in this panel.';
  if (saved) panel._baseRecord = structuredClone({ ...base, ...patch });
}

function openInlineRecordEditor(element = inlineAdminSelectedRecordElement || inlineAdminSelectedImage) {
  const context = inlineRecordContext(element);
  if (!context) {
    updateInlineAdminToolbarState('Select a product or category card first');
    return;
  }
  const panel = ensureInlineRecordEditor();
  const form = panel.querySelector('[data-inline-record-form]');
  const status = panel.querySelector('[data-inline-record-status]');
  status.textContent = '';
  panel.dataset.recordType = context.type;
  panel.dataset.recordKey = context.categoryKey || context.slug;
  if (context.type === 'category-card') {
    const category = structuredClone(getAdminCategories()[context.categoryKey] || {});
    panel._baseRecord = category;
    panel.querySelector('[data-inline-record-title]').textContent = `Edit category: ${category.title || context.categoryKey}`;
    form.innerHTML = inlineCategoryEditorMarkup(category);
  } else {
    const product = structuredClone(getManagedProductBySlug(context.slug) || {});
    panel._baseRecord = product;
    panel.querySelector('[data-inline-record-title]').textContent = `Edit product: ${product.title || context.slug}`;
    form.innerHTML = inlineProductEditorMarkup(product);
  }
  panel.hidden = false;
}

async function markSelectedInlineAdminReady() {
  const element = inlineAdminSelectedRecordElement || inlineAdminSelectedImage;
  if (!element) {
    updateInlineAdminToolbarState('Select the edited item first');
    return false;
  }
  updateInlineAdminToolbarState('Saving…');
  if (!await flushInlineOwnedFieldSaves() || !await flushInlineOwnedDisplaySaves() || !await saveInlineAdminEditsLive()) return false;
  const context = inlineRecordContext(element);
  if (context?.type === 'product') {
    const base = getManagedProductBySlug(context.slug) || {};
    const saved = await saveStorefrontProductPatch(context.slug, {
      approvalStatus: 'approved', draftStatus: 'ready', updatedAt: new Date().toISOString()
    }, base);
    if (saved) updateInlineAdminToolbarState('Ready to publish');
    return saved;
  }
  if (context?.type === 'category-card') {
    const base = window.mvpluxLiveAdminSettings?.categories?.[context.categoryKey] || {};
    const saved = await saveStorefrontCategoryPatch(context.categoryKey, '', {
      approvalStatus: 'approved', draftStatus: 'ready'
    }, base);
    if (saved) updateInlineAdminToolbarState('Ready to publish');
    return saved;
  }
  const client = getSupabaseClient();
  const page = inlineAdminPageKey();
  const key = inlineAdminKey(element);
  const { data: row, error: loadError } = await client.from('site_edits').select('edits, revision').eq('page_key', page).maybeSingle();
  if (loadError) {
    updateInlineAdminToolbarState(`Error — not saved: ${loadError.message || loadError}`);
    return false;
  }
  const latest = row?.edits?.[key];
  if (!latest) {
    updateInlineAdminToolbarState('Save this page edit before marking it Ready');
    return false;
  }
  const { data, error } = await client.rpc('save_site_edits', {
    p_page_key: page,
    p_edits: { [key]: { ...latest, approvalStatus: 'approved', updatedAt: new Date().toISOString() } },
    p_expected_revision: Number(row?.revision) || 0,
    p_replace: false
  });
  if (error) {
    updateInlineAdminToolbarState(`Error — not saved: ${error.message || error}`);
    return false;
  }
  inlineAdminLiveEdits[page] = data?.edits || { ...(row?.edits || {}), [key]: { ...latest, approvalStatus: 'approved' } };
  inlineAdminLiveRevisions[page] = Number(data?.revision) || Number(row?.revision || 0) + 1;
  announceStorefrontAdminSave(page, inlineAdminLiveRevisions[page], [key]);
  updateInlineAdminToolbarState('Ready to publish');
  return true;
}

var runInlineAdminToolbarAction = function (action) {
  const now = Date.now();
  if (inlineAdminLastToolbarAction.action === action && now - inlineAdminLastToolbarAction.time < 250) return;
  inlineAdminLastToolbarAction = { action, time: now };

  if (action === 'undo') undoInlineAdminEdit();
  if (action === 'redo') redoInlineAdminEdit();
  if (action === 'toggle-toolbar-layout') toggleInlineAdminToolbarLayout();
  if (action === 'toggle-toolbar-size') toggleInlineAdminToolbarSize();
  if (action === 'toggle-toolbar-collapsed') toggleInlineAdminToolbarCollapsed();
  if (action === 'copy-code') copySelectedInlineAdminCode();
  if (action === 'reset-image') resetSelectedInlineAdminImage();
  if (action === 'lock-image') toggleSelectedInlineAdminImageLock();
  if (action === 'unlock-all-images') unlockAllInlineAdminImages();
  if (action === 'edit-selected-record') openInlineRecordEditor();
  if (action === 'mark-selected-ready') void markSelectedInlineAdminReady();
  if (action === 'center') {
    centerSelectedInlineAdminImage();
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
  if (action === 'admin-off') turnOffInlineAdminMode();
  if (action === 'sign-out') signOutAdmin();
};

window.runInlineAdminToolbarAction = runInlineAdminToolbarAction;
globalThis.runInlineAdminToolbarAction = runInlineAdminToolbarAction;

function handleInlineAdminToolbarPress(event) {
  if (!document.body.classList.contains('admin-anywhere-on')) return;
  const control = event.target.closest?.('[data-admin-toolbar-action]');
  if (!control) return;
  if (control.classList.contains('disabled')) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  runInlineAdminToolbarAction(control.dataset.adminToolbarAction);
}

function bindInlineAdminToolbarControls() {
  document.querySelectorAll('.admin-anywhere-toolbar [data-admin-toolbar-action]').forEach((control) => {
    if (control.dataset.adminToolbarReady) return;
    control.dataset.adminToolbarReady = 'true';

    const activate = (event) => {
      if (control.classList.contains('disabled')) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      runInlineAdminToolbarAction(control.dataset.adminToolbarAction);
    };

    control.addEventListener('pointerdown', activate);
    control.addEventListener('click', activate);
  });
}

function handleInlineAdminToolbarKey(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  handleInlineAdminToolbarPress(event);
}

function handleInlineAdminImageSelect(event) {
  if (!document.body.classList.contains('admin-anywhere-on')) return;
  if (event.target.closest?.('.admin-anywhere-toolbar, #adminImageResizeHandle')) return;
  const image = event.target.closest?.('img.admin-editable-image');
  if (!image) return;

  selectInlineAdminImage(image);
}

function fileToSmallDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('error', reject);
    reader.addEventListener('load', () => {
      const image = new Image();
      image.addEventListener('error', () => resolve(reader.result));
      image.addEventListener('load', () => {
        let maxSide = 720;
        let quality = 0.76;
        let dataUrl = reader.result;

        for (let attempt = 0; attempt < 5; attempt += 1) {
          const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const context = canvas.getContext('2d');
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);

          dataUrl = canvas.toDataURL('image/webp', quality);
          if (!dataUrl.startsWith('data:image/webp')) {
            dataUrl = canvas.toDataURL('image/png');
          }
          if (dataUrl.length < 700000 || maxSide <= 420) break;
          maxSide = Math.round(maxSide * 0.82);
          quality = Math.max(0.56, quality - 0.06);
        }

        resolve(dataUrl);
      });
      image.src = reader.result;
    });
    reader.readAsDataURL(file);
  });
}

async function replaceInlineAdminImage(image) {
  if (!image) {
    updateInlineAdminToolbarState('Select an image first');
    return;
  }
  if (image._adminImageState?.locked) {
    updateInlineAdminToolbarState('Image locked');
    return;
  }

  if (newStorefrontAdminArchitectureEnabled()) {
    const current = image.getAttribute('src') || '';
    const path = window.prompt('Enter an existing repository image path beginning with images/', current)?.trim();
    if (!path) return;
    if (!/^images\/[A-Za-z0-9_./ '\-]+\.(?:png|jpe?g|webp|gif)$/i.test(path) || path.includes('..') || path.includes('\\')) {
      updateInlineAdminToolbarState('Error — use a safe repository image path beginning with images/');
      return;
    }
    const before = getInlineAdminSnapshot(image);
    image.src = path;
    const owned = inlineAdminOwnedField(image);
    if (owned) {
      const saved = await saveAdminProductImageFromElement(image);
      if (!saved) {
        image.src = current;
        updateInlineAdminToolbarState('Error — image assignment was not saved');
        return;
      }
      saveInlineAdminEdit(image, { ...(image._adminImageState || {}) });
    } else {
      saveInlineAdminEdit(image, { src: path, ...(image._adminImageState || {}) });
    }
    pushInlineAdminHistory(before, getInlineAdminSnapshot(image));
    updateInlineAdminToolbarState('Saved Privately');
    return;
  }

  selectInlineAdminImage(image);
  const before = getInlineAdminSnapshot(image);
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  document.body.appendChild(input);

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;

    image.src = await fileToSmallDataUrl(file);
    image._adminImageState = { x: 0, y: 0, scale: 1, rotate: 0, locked: false };
    renderInlineAdminImageState(image);
    saveInlineAdminEdit(image, { src: image.src, ...image._adminImageState });
    saveAdminProductImageFromElement(image);
    pushInlineAdminHistory(before, getInlineAdminSnapshot(image));
    updateInlineAdminToolbarState('Image replaced');
  }, { once: true });

  input.addEventListener('cancel', () => input.remove(), { once: true });
  input.click();
}

function replaceSelectedInlineAdminImage() {
  replaceInlineAdminImage(getActiveInlineAdminImage());
}

function turnOffInlineAdminMode() {
  if (adminArchitectureViewModesEnabled()) {
    setAdminViewMode('preview');
    return;
  }
  localStorage.removeItem('mvpluxAdminAnywhere');
  showSiteMessage('Admin Mode is off. Reloading normal view.', 'success');
  window.setTimeout(() => window.location.reload(), 450);
}

function installInlineAdminMode() {
  console.log('[ADMIN] installInlineAdminMode entered');
  if (document.body.dataset.inlineAdminReady) return;
  try {
    document.body.dataset.inlineAdminReady = 'true';
    document.body.classList.add('admin-anywhere-on');

    document.body.insertAdjacentHTML('beforeend', `
    <div class="admin-mode-badge" role="status">
      <strong>ADMIN PREVIEW — UNPUBLISHED CHANGES</strong>
      <span>${getInlineAdminLabel()}</span>
    </div>
    <div class="admin-anywhere-toolbar">
      <div class="admin-toolbar-group admin-toolbar-main">
        <button type="button" class="admin-toolbar-drag-handle" id="adminToolbarDragHandle" title="Drag admin tools">Move</button>
        <button type="button" class="admin-tool-control admin-toolbar-toggle" data-admin-toolbar-action="toggle-toolbar-layout" id="adminInlineLayout" title="Move tools to side or bottom" onpointerdown="runInlineAdminToolbarAction('toggle-toolbar-layout'); return false;" onclick="runInlineAdminToolbarAction('toggle-toolbar-layout'); return false;">Side</button>
        <button type="button" class="admin-tool-control admin-toolbar-toggle" data-admin-toolbar-action="toggle-toolbar-size" id="adminInlineToolSize" title="Make tools smaller or normal size" onpointerdown="runInlineAdminToolbarAction('toggle-toolbar-size'); return false;" onclick="runInlineAdminToolbarAction('toggle-toolbar-size'); return false;">Small</button>
        <button type="button" class="admin-tool-control admin-toolbar-toggle" data-admin-toolbar-action="toggle-toolbar-collapsed" id="adminInlineHideTools" title="Hide or show admin tools" onpointerdown="runInlineAdminToolbarAction('toggle-toolbar-collapsed'); return false;" onclick="runInlineAdminToolbarAction('toggle-toolbar-collapsed'); return false;">Hide</button>
      </div>
      <div class="admin-toolbar-group admin-toolbar-status">
        <span id="adminInlineStatus">Auto-save is on</span>
      </div>
      <div class="admin-toolbar-group admin-toolbar-image">
        <span id="adminInlineSelected">Select an image</span>
        <button type="button" class="admin-tool-control" data-admin-image-control data-admin-toolbar-action="center" id="adminInlineCenter" title="Center selected image" onpointerdown="runInlineAdminToolbarAction('center'); return false;" onclick="runInlineAdminToolbarAction('center'); return false;">Center</button>
        <button type="button" class="admin-tool-control" data-admin-image-control data-admin-toolbar-action="reset-image" id="adminInlineResetImage" title="Back to normal" onpointerdown="runInlineAdminToolbarAction('reset-image'); return false;" onclick="runInlineAdminToolbarAction('reset-image'); return false;">Normal</button>
        <button type="button" class="admin-tool-control" data-admin-image-control data-admin-toolbar-action="lock-image" id="adminInlineLockImage" title="Lock selected image in place" onpointerdown="runInlineAdminToolbarAction('lock-image'); return false;" onclick="runInlineAdminToolbarAction('lock-image'); return false;">Lock</button>
        <button type="button" class="admin-tool-control" data-admin-toolbar-action="unlock-all-images" id="adminInlineUnlockAll" title="Unlock all locked images" onpointerdown="runInlineAdminToolbarAction('unlock-all-images'); return false;" onclick="runInlineAdminToolbarAction('unlock-all-images'); return false;">Unlock</button>
        <button type="button" class="admin-tool-control" data-admin-image-control data-admin-toolbar-action="size-down" id="adminInlineSizeDown" title="Smaller" onpointerdown="runInlineAdminToolbarAction('size-down'); return false;" onclick="runInlineAdminToolbarAction('size-down'); return false;">Size -</button>
        <button type="button" class="admin-tool-control" data-admin-image-control data-admin-toolbar-action="size-up" id="adminInlineSizeUp" title="Bigger" onpointerdown="runInlineAdminToolbarAction('size-up'); return false;" onclick="runInlineAdminToolbarAction('size-up'); return false;">Size +</button>
        <button type="button" class="admin-tool-control" data-admin-image-control data-admin-toolbar-action="rotate-left" id="adminInlineRotateLeft" title="Rotate left" onpointerdown="runInlineAdminToolbarAction('rotate-left'); return false;" onclick="runInlineAdminToolbarAction('rotate-left'); return false;">Rotate -</button>
        <button type="button" class="admin-tool-control" data-admin-image-control data-admin-toolbar-action="rotate-right" id="adminInlineRotateRight" title="Rotate right" onpointerdown="runInlineAdminToolbarAction('rotate-right'); return false;" onclick="runInlineAdminToolbarAction('rotate-right'); return false;">Rotate +</button>
      </div>
      <div class="admin-toolbar-group admin-toolbar-page">
        ${newStorefrontAdminArchitectureEnabled() ? '<button type="button" class="admin-tool-control" data-admin-toolbar-action="edit-selected-record" title="Edit the selected product or category">Edit Product</button>' : ''}
        <a href="admin.html#products" title="Open Products to preview, save a draft, or publish">Products</a>
        <a href="admin.html#create-card">Add Card</a>
        <a href="admin.html#dashboard">Open Admin Dashboard</a>
        <details class="admin-toolbar-more"><summary>More</summary><div>
          <button type="button" class="admin-tool-control" data-admin-toolbar-action="copy-code" id="adminInlineCopyCode" title="Copy CSS code for selected image" onpointerdown="runInlineAdminToolbarAction('copy-code'); return false;" onclick="runInlineAdminToolbarAction('copy-code'); return false;">Copy CSS</button>
        </div></details>
      </div>
      <button type="button" class="admin-toolbar-resize-handle" id="adminToolbarResizeHandle" title="Resize admin tools" aria-label="Resize admin tools"></button>
    </div>
    `);
    bindInlineAdminToolbarControls();
    bindInlineAdminToolbarDragResize();
    console.log('[ADMIN] Toolbar created');
  } catch (error) {
    logAdminInitializationException('Toolbar creation', error);
    throw error;
  }

  try {
    forceAdminToolbarHiddenForThisUpdate();
    applyInlineAdminToolbarPrefs();
    console.log('[ADMIN] Toolbar preferences loaded');
  } catch (error) {
    logAdminInitializationException('Toolbar preferences', error);
    throw error;
  }

  try {
    applyInlineHiddenCards();
    ensureInlineAdminCardControls();
    console.log('[ADMIN] Hidden cards processed');
  } catch (error) {
    logAdminInitializationException('Hidden cards', error);
    throw error;
  }

  try {
    document.addEventListener('pointerdown', handleInlineAdminToolbarPress, true);
    document.addEventListener('pointerup', handleInlineAdminToolbarPress, true);
    document.addEventListener('mousedown', handleInlineAdminToolbarPress, true);
    document.addEventListener('mouseup', handleInlineAdminToolbarPress, true);
    document.addEventListener('click', handleInlineAdminToolbarPress, true);
    document.addEventListener('keydown', handleInlineAdminToolbarKey, true);
    document.addEventListener('click', handleInlineAdminImageSelect, true);

    window.addEventListener('keydown', (event) => {
      if (!document.body.classList.contains('admin-anywhere-on')) return;
      const key = event.key.toLowerCase();
      const active = document.activeElement;
      const typing = active?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active?.tagName);

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

      if (!typing && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
        const step = event.altKey ? 1 : 2;
        event.preventDefault();
        if (key === 'arrowleft') nudgeSelectedInlineAdminImage(-step, 0);
        if (key === 'arrowright') nudgeSelectedInlineAdminImage(step, 0);
        if (key === 'arrowup') nudgeSelectedInlineAdminImage(0, -step);
        if (key === 'arrowdown') nudgeSelectedInlineAdminImage(0, step);
      }
    });
  } catch (error) {
    logAdminInitializationException('Inline control listeners', error);
    throw error;
  }

  try {
    document.querySelectorAll('.admin-card-controls[contenteditable], .admin-card-controls [contenteditable]').forEach((control) => {
      control.removeAttribute('contenteditable');
      control.classList.remove('admin-editable-text');
    });
    document.querySelectorAll('h1,h2,h3,h4,p,a,button,span,label,strong,li').forEach((element) => {
      if (element.closest('.admin-anywhere-toolbar, .admin-card-controls, .cart-panel, .auth-form, script, style, .password-field')) return;
      if (element.closest('.fan-vote-meter, .fan-carousel-dots')) return;
      if (element.matches('.product-image-link')) return;
      if (isLockedStageChoiceAdminText(element)) return;
      if (isLockedSizeBuilderAdminText(element)) return;
      inlineAdminKey(element);
      element.contentEditable = 'true';
      element.spellcheck = false;
      element.classList.add('admin-editable-text');
      element.addEventListener('focus', () => {
        inlineAdminSelectedRecordElement = element;
        element._adminBeforeSnapshot = getInlineAdminSnapshot(element);
      });
      element.addEventListener('click', (event) => {
        if (element.closest('.admin-card-controls')) return;
        if (element.closest('.top-nav')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);
      element.addEventListener('input', () => {
        if (syncOriginalSizeFromEditedText(element)) return;
        const owned = inlineAdminOwnedField(element);
        if (owned) {
          scheduleInlineOwnedFieldSave(element, owned, element.textContent.trim());
          return;
        }
        saveInlineAdminEdit(element, { text: element.textContent.trim() });
      });
      element.addEventListener('blur', async () => {
        syncOriginalSizeFromEditedText(element);
        if (element.dataset.adminOwnedDirty === 'true') await flushInlineOwnedFieldSaves();
        pushInlineAdminHistory(element._adminBeforeSnapshot, getInlineAdminSnapshot(element));
        delete element._adminBeforeSnapshot;
      });
    });
    console.log('[ADMIN] Text initialization complete');
  } catch (error) {
    logAdminInitializationException('Text initialization', error);
    throw error;
  }

  try {
    console.log('[ADMIN] Image loop entered');
    const totalImages = document.querySelectorAll('img').length;
    let pointerListenersAttached = 0;
    document.querySelectorAll('img').forEach((image) => {
      if (image.closest('.admin-anywhere-toolbar')) return;
      if (!image.closest('.hero-stage')) {
        image.loading = 'lazy';
        image.decoding = 'async';
      }
      inlineAdminKey(image);
      ensureInlineAdminImageBaseTransform(image);
      image.classList.add('admin-editable-image');
      if (!isInlineAdminBackgroundImage(image)) image.classList.add('admin-transformable-image');
      const owned = inlineAdminOwnedField(image);
      const productDisplay = owned?.type === 'product'
        ? getManagedProductBySlug(owned.slug)?.displayOverrides?.imageTransform
        : null;
      const saved = productDisplay || getInlineAdminPageEdits()[inlineAdminKey(image)] || {};
      image._adminImageState = {
        x: safeAdminImageNumber(saved.x, 0, -140, 140),
        y: safeAdminImageNumber(saved.y, 0, -140, 140),
        scale: safeAdminImageNumber(saved.scale, 1, 0.45, 2.1),
        rotate: safeAdminImageNumber(saved.rotate, 0, -28, 28),
        locked: !!saved.locked
      };
      renderInlineAdminImageState(image);

      image.addEventListener('pointerdown', (event) => {
      if (event.target?.id === 'adminImageResizeHandle') return;
      if (image._adminImageState?.locked) return;
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
        image._adminImageState.x = safeAdminImageNumber(baseX + moveEvent.clientX - startX, 0, -140, 140);
        image._adminImageState.y = safeAdminImageNumber(baseY + moveEvent.clientY - startY, 0, -140, 140);
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
      pointerListenersAttached += 1;

      image.addEventListener('dblclick', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        replaceInlineAdminImage(image);
      });
    });
    console.log('[ADMIN] Pointer listener attached (count total images)', {
      totalImages,
      pointerListenersAttached
    });
  } catch (error) {
    logAdminInitializationException('Image initialization', error);
    throw error;
  }

  try {
    window.addEventListener('scroll', updateInlineAdminResizeHandle, { passive: true });
    window.addEventListener('scroll', updateInlineAdminLockButtons, { passive: true });
    window.addEventListener('resize', updateInlineAdminResizeHandle);
    window.addEventListener('resize', updateInlineAdminLockButtons);
    updateInlineAdminToolbarState();
    console.log('[ADMIN] installInlineAdminMode completed');
  } catch (error) {
    logAdminInitializationException('Inline Admin completion', error);
    throw error;
  }
}

function getSelectedProduct(button) {
  const card = button.closest('.product-card, .showroom-purchase-card, .standee-purchase-panel, .category-featured-info');
  const builder = card?.querySelector('.size-builder');
  const pageContext = card?.closest('.standee-detail-page')
    || card?.closest('.sports-showroom, .generic-showroom')
    || card;
  const activeChoice = pageContext?.querySelector('.standee-background-picker button.active, .category-option-strip button.active, .sports-option-strip button.active');
  const choiceLabel = activeChoice?.querySelector('span')?.textContent?.trim() || '';
  const mainImage = pageContext?.querySelector('#sportsMainImage, .generic-main-image, .standee-main-cutout, .product-cutout');
  const thumbnailPath = mainImage?.getAttribute('src') || '';
  const imageLabel = mainImage?.getAttribute('alt')?.replace(/\s+preview$/i, '').trim() || '';
  const imageOptions = [...(pageContext?.querySelectorAll('.standee-background-picker button, .category-option-strip button, .sports-option-strip button') || [])]
    .map((option) => ({
      label: option.querySelector('span')?.textContent?.trim() || option.querySelector('img')?.alt || 'Image option',
      image: option.querySelector('img')?.getAttribute('src') || '',
      active: option.classList.contains('active')
    }))
    .filter((option) => option.image);
  if (!imageOptions.length && thumbnailPath) {
    imageOptions.push({ label: choiceLabel || imageLabel || 'Primary image', image: thumbnailPath, active: true });
  }
  const selectedImageIndex = Math.max(0, imageOptions.findIndex((option) => option.active || option.image === thumbnailPath));
  const description = card?.querySelector('.product-description, #sportsSelectedDescription, .generic-selected-description')?.textContent?.trim()
    || pageContext?.querySelector('#sportsSelectedDescription, .generic-selected-description, .standee-purchase-panel > p')?.textContent?.trim()
    || '';

  if (!builder) {
    const baseProductName = card?.querySelector('.product-title-link, h1, h2, .generic-selected-name, #sportsSelectedName')?.textContent?.trim() || 'Custom Standee';
    return {
      card,
      builder: null,
      productName: baseProductName,
      baseProductName,
      price: getCurrentBasePrice(),
      designLabel: choiceLabel || imageLabel || 'Primary image',
      backgroundLabel: choiceLabel || 'Standard display',
      description,
      thumbnailPath,
      imageOptions,
      selectedImageIndex,
      finishOptions: [],
      selectedFinishIndex: 0,
      supportsCustomSize: false,
      sizeStatus: 'Selected product configuration',
      valid: true
    };
  }

  const baseProductName = builder.dataset.productName || 'Custom Standee';
  const customRadio = builder.querySelector('input[value="custom"]');
  const isCustom = Boolean(customRadio?.checked);
  const customHeight = parseHeightToInches(builder.querySelector('.custom-height-input')?.value || '');
  const originalHeight = parseHeightToInches(builder.dataset.originalHeight || '') || parseInt(builder.dataset.originalHeight || '0', 10);
  const selectedHeight = isCustom ? customHeight : originalHeight;
  const sizeLabel = selectedHeight ? formatHeight(selectedHeight) : (isCustom ? 'Custom Size' : 'Original Size');
  const finishLabel = getFinishLabel(builder);
  const finishOptions = [...builder.querySelectorAll('.finish-choice input')].map((input) => ({
    label: input.closest('.finish-choice')?.querySelector('span')?.textContent?.trim() || input.value,
    value: input.value,
    extra: Number(input.dataset.finishExtra || 0),
    selected: input.checked
  }));
  if (!finishOptions.length) finishOptions.push({ label: finishLabel, value: 'current', extra: getFinishExtra(builder), selected: true });
  const selectedFinishIndex = Math.max(0, finishOptions.findIndex((option) => option.selected));
  const productName = `${baseProductName} - ${sizeLabel} - ${finishLabel}`;
  const basePrice = calculateCutoutPrice(selectedHeight, builder);
  const price = addFinishToPrice(basePrice, builder);

  refreshBuilderPrice(builder);

  // If no valid price or zero price, do NOT allow purchase
  if (!price || price <= 0) {
    return { card, builder, productName, baseProductName, price: 0, selectedHeight, originalHeight, sizeLabel, valid: false };
  }

  return {
    card,
    builder,
    productName,
    baseProductName,
    price,
    selectedHeight,
    originalHeight,
    sizeLabel,
    designLabel: choiceLabel || imageLabel || 'Primary image',
    backgroundLabel: choiceLabel || finishLabel || 'Standard display',
    description,
    thumbnailPath,
    imageOptions,
    selectedImageIndex,
    finishOptions,
    selectedFinishIndex,
    supportsCustomSize: Boolean(customRadio),
    sizeStatus: isCustom ? 'Custom size selected' : 'Original size selected',
    valid: true
  };
}

function addSelectedToCart(button) {
  const selected = getSelectedProduct(button);

  if (!selected.valid) {
    showSiteMessage('Please enter a valid custom height before adding this item to cart.', 'error');
    return;
  }

  addToCart(selected.productName, selected.price, getSelectedProductImage(selected), {
    selectedHeight: selected.selectedHeight,
    finishExtra: getFinishExtra(selected.builder),
    productSlug: selected.builder?.dataset.adminSlug || ''
  });
}

function buySelectedNow(button) {
  const selected = getSelectedProduct(button);

  if (!selected.valid) {
    showSiteMessage('Please enter a valid custom height before buying this item.', 'error');
    return;
  }

  const img = getSelectedProductImage(selected);
  openBuyNow(selected.productName, selected.price, img, {
    selectedHeight: selected.selectedHeight,
    finishExtra: getFinishExtra(selected.builder),
    productSlug: selected.builder?.dataset.adminSlug || ''
  });
}

function openSelectedOffer(button) {
  const selected = getSelectedProduct(button);
  if (!selected.valid) {
    showSiteMessage('Please enter a valid custom height before making an offer.', 'error');
    return;
  }
  openOffer(selected.baseProductName || selected.productName || 'Selected Standee', {
    askingPrice: selected.price,
    selectedHeight: selected.selectedHeight,
    sizeLabel: selected.sizeLabel,
    originalHeight: selected.originalHeight,
    designLabel: selected.designLabel,
    backgroundLabel: selected.backgroundLabel,
    description: selected.description,
    sizeStatus: selected.sizeStatus,
    thumbnailPath: selected.thumbnailPath,
    imageOptions: selected.imageOptions,
    selectedImageIndex: selected.selectedImageIndex,
    finishOptions: selected.finishOptions,
    selectedFinishIndex: selected.selectedFinishIndex,
    supportsCustomSize: selected.supportsCustomSize,
    sourceBuilder: selected.builder
  });
}

function pulseBuyerActionArea(target) {
  if (!target) return;
  target.classList.remove('buyer-action-pulse');
  void target.offsetWidth;
  target.classList.add('buyer-action-pulse');
  window.setTimeout(() => target.classList.remove('buyer-action-pulse'), 1300);
}

function scrollBuyerToPurchaseArea(image) {
  if (!image || document.body.classList.contains('admin-anywhere-on')) return false;
  if (image.closest('a[href]')) return false;
  if (image.closest('.admin-anywhere-toolbar, button, input, textarea, select, label')) return false;

  const sportsCard = image.closest('[data-sports-player]');
  if (sportsCard && typeof selectSportsStandee === 'function') {
    selectSportsStandee(sportsCard.dataset.sportsPlayer);
    return true;
  }

  const categoryCard = image.closest('.category-page .category-card');
  const categorySelectButton = categoryCard?.querySelector('button');
  if (categoryCard && categorySelectButton) {
    categorySelectButton.click();
    return true;
  }

  const showroom = image.closest('.sports-showroom, .generic-showroom, .standee-detail-hero');
  const showroomActionArea = showroom?.querySelector('.showroom-purchase-card, .standee-purchase-panel, .category-featured-info, .standee-action-row, .button-row');
  if (showroomActionArea) {
    showroomActionArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    pulseBuyerActionArea(showroomActionArea);
    return true;
  }

  const productCard = image.closest('.product-card');
  const productActionArea = productCard?.querySelector('.button-row, .standee-action-row, .size-builder');
  if (productActionArea) {
    productActionArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    pulseBuyerActionArea(productActionArea);
    return true;
  }

  const fanCard = image.closest('.fan-vote-card, .fan-gallery-card');
  const fanActionArea = fanCard?.querySelector('.fan-card-actions, .fan-card-footer, button');
  if (fanActionArea) {
    fanActionArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    pulseBuyerActionArea(fanActionArea);
    return true;
  }

  return false;
}

function bindBuyerImagePurchaseJumps() {
  if (document.body.dataset.buyerImagePurchaseJumpsReady) return;
  document.body.dataset.buyerImagePurchaseJumpsReady = 'true';

  document.addEventListener('click', (event) => {
    const image = event.target.closest?.('img');
    if (!image) return;
    if (!image.matches('.product-cutout, .standee-main-cutout, .generic-main-image, #sportsMainImage, .fan-card-cutout, .fan-card-bg, .category-card img')) return;
    if (scrollBuyerToPurchaseArea(image)) event.preventDefault();
  });
}

/* ---------------- PAGE INIT ---------------- */
document.addEventListener('DOMContentLoaded', async function () {
  console.log('[ADMIN] DOMContentLoaded');
  try {
  // Authentication forms must work immediately, without waiting for unrelated storefront data.
  bindAuthForms();
  // Start persisted-session restoration immediately. Published storefront data still renders
  // before we wait for optional Admin authorization, but a slow snapshot request can no longer
  // prevent an already signed-in Admin session from being recognized.
  const authStatePromise = syncSupabaseAuthState().catch((error) => {
    console.warn('Supabase session restoration failed:', error);
  });
  // Published customer content must render before any optional auth/Admin request.
  await loadPublishedAdminSettings();
  renderNormalizedHomepageCategoryCards();
  // Category shopping must initialize as soon as published products and pricing are available.
  initializeCategoryShowroomExperience();
  initializeSellableProductPricing();
  await authStatePromise;
  applyRequestedAdminViewMode();
  await loadStorefrontTestMode().catch(() => {});
  setupAuthState();
  updateCart();
  showInfoSlide(0);
  normalizeFrontPageCategoryLinks();
  await loadLiveAdminSettings().catch(() => {});
  if (localStorage.getItem('mvpluxIsAdminApproved') === 'true') refreshAdminViewControls();
  renderAdminViewModeLabel();
  bindProductCarouselDragGuard();
  bindBuyerImagePurchaseJumps();
  bindFanCardCommerce();
  await loadInlineAdminLiveEdits().catch(() => {});

  document.querySelectorAll('img').forEach((image) => {
    image.setAttribute('draggable', 'false');
    image.addEventListener('dragstart', (event) => event.preventDefault());
    image.addEventListener('contextmenu', (event) => event.preventDefault());
  });
  rememberInlineAdminImageFallbacks();
  ensureProductAdminSlugs();

  document.addEventListener('change', (event) => {
    if (event.target.closest?.('input[name="checkoutPaymentMethod"]')) {
      updateCheckoutDisplay();
    }
  });

  applyAdminExtraImages();
  applyInlineAdminEdits();

    window.addEventListener('beforeunload', (event) => {
      if (!inlineAdminHasUnsavedLocalChanges) return;
      event.preventDefault();
      event.returnValue = '';
    });
  renderAdminManagedCards();
  applyHomepageCategoryCardOrder();
  applyInlineHiddenCards();
  renderNormalizedHomepageCategoryCards();
  renderStandeeDetailPage();
  if (shouldUsePrivateAdminState()) initializeCategoryShowroomExperience();
  else refreshCategoryShowroomPricing();
  ensureProductAdminSlugs();
  scrollToSelectedStandeeHash();
  bindSportsShowroomClicks();
  bindCategoryStandeeCards();
  await resumeAcceptedOfferFromUrl().catch((error) => showSiteMessage(error?.message || 'Could not resume the accepted offer.', 'error'));

  ensureStageOptionBoxes();
  ensureFinishChoices();
  bindUniversalSizeBuilderEvents();

  const fanVotes = getFanVoteStore();
  document.querySelectorAll('[data-vote-id]').forEach((button) => {
    setFanVoteButtonState(button, hasActiveFanVoteCooldown(fanVotes[button.dataset.voteId]));
  });

  window.addEventListener('click', function (e) {
    const bgModal = document.getElementById('bgModal');
    if (bgModal && e.target === bgModal) closeBgModal();
  });

  document.querySelectorAll('.size-builder').forEach((builder) => {
    applyAdminProductOverrides(builder);

    updateBuilderOriginalDisplay(builder);
  });

  applyInlineAdminEdits();

    const isAuthPage = Boolean(document.querySelector('.auth-page'));
    if (!isAuthPage && isInlineAdminEditingEnabled()) {
      checkCurrentUserAdminAccess({ showMessages: false })
        .then((canUseAdmin) => {
          if (canUseAdmin) {
            installInlineAdminMode();
            updateAdminModeToggleButtons();
          }
        })
        .catch((error) => {
          logAdminInitializationException('Admin mode restoration', error);
          localStorage.removeItem('mvpluxAdminAnywhere');
        });
    }
  } catch (error) {
    logAdminInitializationException('DOMContentLoaded', error);
    throw error;
  }
});
