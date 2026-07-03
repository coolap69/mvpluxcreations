let cart = [];
let cartTotal = 0;
let infoSlideIndex = 0;
let currentBuyNowItem = null;
let activeOfferState = null;
const supportEmail = 'support@mvpluxcreations.com';

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
  zelle: {
    label: 'Zelle',
    note: 'Send payment after MVPLUXCREATIONS confirms the order.'
  },
  paypal: {
    label: 'PayPal',
    note: 'PayPal instructions are sent after the order is confirmed.'
  },
  cashapp: {
    label: 'Cash App',
    note: 'Cash App instructions are sent after the order is confirmed.'
  },
  applepay: {
    label: 'Apple Pay',
    note: 'Apple Pay instructions are sent after the order is confirmed.'
  },
  venmo: {
    label: 'Venmo',
    note: 'Venmo instructions are sent after the order is confirmed.'
  },
  crypto: {
    label: 'Crypto Wallet',
    note: 'Crypto wallet details are sent after the order is confirmed.'
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

function addToCart(name, price) {
  ensureCartShell();
  cart.push({ name, price });
  cartTotal += price;
  updateCart();
}

function checkoutAcceptedOffer(name, price) {
  const acceptedItem = {
    name: `${name || 'Selected item'} - Accepted Offer`,
    price: Number(price) || 0,
    image: ''
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
    div.innerHTML = `
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
    cartTotal = Math.max(0, cartTotal - removed.price);
    updateCart();
  }
}

function toggleCart() {
  const cartPanel = document.getElementById('cartPanel');
  if (cartPanel) cartPanel.classList.toggle('open');
}

/* ---------------- BUY / OFFER MODALS ---------------- */
function openBuyNow(title, price, image) {
  ensureCommerceModals();
  const modalTitle = document.getElementById('modalTitle');
  const modalPrice = document.getElementById('modalPrice');
  const modalImage = document.getElementById('modalImage');
  const buyModal = document.getElementById('buyModal');
  currentBuyNowItem = { name: title, price: Number(price) || 0, image: image || '' };

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
  const offerModal = document.getElementById('offerModal');
  const signedInName = getSignedInName();
  activeOfferState = {
    productName,
    askingPrice: Number(offerMeta.askingPrice || offerMeta.price || 0),
    selectedHeight: Number(offerMeta.selectedHeight || 0),
    sizeLabel: offerMeta.sizeLabel || '',
    buyerOffer: null,
    sellerCounter: null,
    buyerCounterUsed: false,
    status: 'open'
  };

  if (offerProduct) offerProduct.textContent = productName;
  updateOfferBoard(productName, signedInName);
  if (offerModal) offerModal.style.display = 'flex';
}

function closeModals() {
  const buyModal = document.getElementById('buyModal');
  const offerModal = document.getElementById('offerModal');
  const checkoutModal = document.getElementById('checkoutModal');

  if (buyModal) buyModal.style.display = 'none';
  if (offerModal) offerModal.style.display = 'none';
  if (checkoutModal) checkoutModal.style.display = 'none';
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

function formValue(form, name) {
  return form?.elements?.[name]?.value?.trim() || '';
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

function paymentMethodButtonMarkup(key, method) {
  return `
    <label class="payment-method-card">
      <input type="radio" name="checkoutPaymentMethod" value="${key}" ${key === 'zelle' ? 'checked' : ''}>
      <span>${method.label}</span>
      <small>${method.note}</small>
    </label>
  `;
}

function checkoutModalMarkup() {
  const paymentMethods = Object.entries(checkoutPaymentMethods)
    .map(([key, method]) => paymentMethodButtonMarkup(key, method))
    .join('');

  return `
    <div id="checkoutModal" class="modal">
      <div class="modal-content checkout-modal-content">
        <button class="close-modal" onclick="closeModals()">x</button>
        <h2>Checkout / Pay</h2>
        <p class="checkout-intro">Choose how you want to pay. MVPLUXCREATIONS will confirm the order details and send payment instructions.</p>
        <p class="checkout-email-note">Your order request is sent to MVPLUXCREATIONS. You will receive payment instructions after the details are confirmed.</p>
        <div id="checkoutAcceptedOfferNotice" class="checkout-accepted-offer-notice"></div>
        <div id="checkoutSuccessNotice" class="checkout-success-notice">
          <strong>Order request sent</strong>
          <span>Thank you. MVPLUXCREATIONS received your request and will confirm the details with payment instructions.</span>
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
          <label class="policy-check">
            <input type="checkbox" required>
            <span>I understand this is a custom-made item, and production starts after payment and design/order details are confirmed.</span>
          </label>
          <button type="submit" class="submit-btn">Submit Order Request</button>
        </form>
        <div class="checkout-policy-box">
          <strong>Returns & disclaimers</strong>
          <p>Custom/life-size standees are made to order. Returns or cancellations are not accepted after production begins unless MVPLUXCREATIONS made an error or the item arrives damaged. Report shipping damage quickly with photos of the package and product.</p>
          <p>Product images may be restored, enhanced, composited, or recreated for print. MVPLUXCREATIONS is not affiliated with any person, brand, team, league, studio, or rights holder unless clearly stated.</p>
          <p>Crypto payments are final once sent. The customer is responsible for using the correct wallet network and confirmed amount.</p>
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
        <p id="offerProduct"></p>
        <div id="offerAccountNotice" class="offer-account-notice"></div>
        <div id="offerMessageBoard" class="offer-message-board"></div>
        <div id="offerSentActions" class="offer-sent-actions">
          <button type="button" class="checkout-btn" onclick="closeModals()">Close</button>
        </div>
        <form id="offerForm" class="checkout-form offer-form" onsubmit="submitOfferRequest(event)">
          <div class="offer-guest-fields">
            <input type="text" name="name" placeholder="Your name">
            <input type="email" name="email" placeholder="Your email">
            <input type="tel" name="phone" placeholder="Phone number">
          </div>
          <input type="text" name="amount" inputmode="decimal" placeholder="$ Offer amount" required>
          <select name="message">
            <option value="">No extra note</option>
            <option value="Please confirm design details before payment.">Confirm design first</option>
            <option value="I need this as soon as possible.">Need it fast</option>
            <option value="I want to discuss payment method.">Discuss payment method</option>
            <option value="I want help choosing the best size.">Help choosing size</option>
          </select>
          <label class="policy-check">
            <input type="checkbox" required>
            <span>I understand I can send one offer. If MVPLUXCREATIONS sends a counteroffer, I can accept it or send one final counteroffer.</span>
          </label>
          <button class="submit-btn" type="submit">Send Offer Request</button>
        </form>
        <div id="sellerCounterTools" class="seller-counter-tools">
          <h3>Seller Counteroffer</h3>
          <input type="text" id="sellerCounterAmount" placeholder="Counteroffer amount">
          <textarea id="sellerCounterMessage" placeholder="Counteroffer message"></textarea>
          <button type="button" class="submit-btn" onclick="sendSellerCounterOffer()">Send Counteroffer</button>
        </div>
        <div id="buyerCounterTools" class="buyer-counter-tools">
          <button type="button" class="checkout-btn" onclick="acceptSellerCounterOffer()">Accept Counteroffer</button>
          <button type="button" class="submit-btn" onclick="showBuyerFinalCounter()">Send Final Counteroffer</button>
          <div id="buyerFinalCounterBox" class="buyer-final-counter-box">
            <input type="text" id="buyerFinalCounterAmount" placeholder="Final counter amount">
            <textarea id="buyerFinalCounterMessage" placeholder="Final counter message"></textarea>
            <button type="button" class="submit-btn" onclick="sendBuyerFinalCounterOffer()">Send Final Counter</button>
          </div>
        </div>
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
}

function updateCheckoutDisplay() {
  const summary = document.getElementById('checkoutOrderSummary');
  const feeSummary = document.getElementById('checkoutFeeSummary');
  const acceptedNotice = document.getElementById('checkoutAcceptedOfferNotice');
  const successNotice = document.getElementById('checkoutSuccessNotice');
  const selectedMethod = document.querySelector('input[name="checkoutPaymentMethod"]:checked')?.value || 'zelle';
  const items = getCheckoutItems();
  const subtotal = getCheckoutSubtotal();
  const totals = calculateCustomerPaidTotal(subtotal, selectedMethod);
  const acceptedOfferItem = items.find((item) => String(item.name || '').includes('Accepted Offer'));

  if (acceptedNotice) {
    acceptedNotice.style.display = acceptedOfferItem ? 'block' : 'none';
    acceptedNotice.innerHTML = acceptedOfferItem
      ? `<strong>Offer accepted</strong><span>Your accepted offer is ready for checkout. Add shipping information and choose how you want to pay.</span>`
      : '';
  }

  if (successNotice && !successNotice.dataset.sent) {
    successNotice.style.display = 'none';
  }

  if (summary) {
    summary.innerHTML = items.length
      ? items.map((item) => `<div><span>${item.name}</span><strong>${formatMoney(Number(item.price) || 0)}</strong></div>`).join('')
      : '<p>No item selected yet.</p>';
  }

  if (feeSummary) {
    feeSummary.innerHTML = `
      <div><span>Item total</span><strong>${formatMoney(totals.subtotal)}</strong></div>
      <div><span>Shipping</span><strong>Free</strong></div>
      <div class="checkout-total-line"><span>Total to pay</span><strong>${formatMoney(totals.total)}</strong></div>
      <p>${totals.method.note}</p>
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

  const methodKey = document.querySelector('input[name="checkoutPaymentMethod"]:checked')?.value || 'zelle';
  const totals = calculateCustomerPaidTotal(getCheckoutSubtotal(), methodKey);
  const user = await getCommerceUser(client);

  const payload = {
    customer_id: user?.id || null,
    customer_name: formValue(form, 'name') || 'Customer',
    customer_email: formValue(form, 'email') || user?.email || '',
    customer_phone: formValue(form, 'phone') || null,
    shipping_address: {
      address1: formValue(form, 'address1'),
      address2: formValue(form, 'address2'),
      city: formValue(form, 'city'),
      state: formValue(form, 'state'),
      zip: formValue(form, 'zip'),
      country: formValue(form, 'country') || 'United States'
    },
    items: items.map((item) => ({
      name: item.name,
      price: Number(item.price) || 0,
      image: item.image || ''
    })),
    payment_method: totals.method.label,
    subtotal: Number(totals.subtotal.toFixed(2)),
    customer_fee: 0,
    total: Number(totals.total.toFixed(2)),
    status: 'new',
    notes: formValue(form, 'notes') || null
  };

  const { error } = await client.from('order_requests').insert(payload);
  submitButton.disabled = false;
  submitButton.textContent = 'Submit Order Request';

  if (error) {
    showSiteMessage(`Could not send the order request yet. Please try again or contact ${supportEmail}. ${error.message || error}`, 'error');
    return;
  }

  const successNotice = document.getElementById('checkoutSuccessNotice');
  if (successNotice) {
    successNotice.dataset.sent = 'true';
    successNotice.style.display = 'grid';
  }
  form.reset();
  cart = [];
  cartTotal = 0;
  currentBuyNowItem = null;
  updateCart();
  updateCheckoutDisplay();
}

function moneyFromText(value) {
  const amount = parseFloat(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(amount) ? amount : 0;
}

function offerMessageMarkup(type, title, body) {
  return `
    <div class="offer-message offer-message-${type}">
      <strong>${title}</strong>
      <p>${body}</p>
    </div>
  `;
}

function updateOfferBoard(productName = activeOfferState?.productName || '', signedInName = getSignedInName()) {
  const notice = document.getElementById('offerAccountNotice');
  const board = document.getElementById('offerMessageBoard');
  const form = document.getElementById('offerForm');
  const guestFields = form?.querySelector('.offer-guest-fields');
  const sellerTools = document.getElementById('sellerCounterTools');
  const buyerTools = document.getElementById('buyerCounterTools');
  const sentActions = document.getElementById('offerSentActions');

  if (notice) {
    notice.textContent = signedInName
      ? `Signed in as ${signedInName}. You can send this offer without filling out contact fields again.`
      : 'Sign in first to skip name and email next time, or fill out the quick offer form below.';
  }

  if (guestFields) {
    guestFields.style.display = signedInName ? 'none' : 'grid';
    guestFields.querySelectorAll('input').forEach((input) => {
      input.required = !signedInName && (input.name === 'name' || input.name === 'email');
    });
  }

  if (board) {
    const messages = [
      offerMessageMarkup('system', productName || 'Selected item', 'Send one offer. MVPLUXCREATIONS can accept it or send one counteroffer.')
    ];
    if (activeOfferState?.buyerOffer) {
      messages.push(offerMessageMarkup('buyer', 'Buyer offer', `${formatMoney(activeOfferState.buyerOffer.amount)}${activeOfferState.buyerOffer.message ? ` - ${activeOfferState.buyerOffer.message}` : ''}`));
    }
    if (activeOfferState?.sellerCounter) {
      messages.push(offerMessageMarkup('seller', 'MVPLUXCREATIONS counteroffer', `${formatMoney(activeOfferState.sellerCounter.amount)}${activeOfferState.sellerCounter.message ? ` - ${activeOfferState.sellerCounter.message}` : ''}`));
    }
    if (activeOfferState?.buyerCounterUsed) {
      messages.push(offerMessageMarkup('buyer', 'Buyer final counteroffer', `${formatMoney(activeOfferState.buyerFinalCounter.amount)}${activeOfferState.buyerFinalCounter.message ? ` - ${activeOfferState.buyerFinalCounter.message}` : ''}`));
    }
    if (activeOfferState?.status === 'accepted') {
      messages.push(offerMessageMarkup('system', 'Offer accepted', 'Continue to checkout when payment details are ready.'));
    }
    if (activeOfferState?.status === 'sent' || activeOfferState?.status === 'pending') {
      messages.push(offerMessageMarkup('system', 'Offer sent', 'Thanks, we received your offer. MVPLUXCREATIONS will review it and reply with an acceptance or counteroffer.'));
    }
    board.innerHTML = messages.join('');
  }

  if (form) form.style.display = activeOfferState?.buyerOffer ? 'none' : 'grid';
  if (sellerTools) sellerTools.style.display = 'none';
  if (buyerTools) buyerTools.style.display = activeOfferState?.sellerCounter && !activeOfferState?.buyerCounterUsed && activeOfferState?.status !== 'accepted' ? 'grid' : 'none';
  if (sentActions) sentActions.style.display = activeOfferState?.status === 'sent' || activeOfferState?.status === 'pending' ? 'flex' : 'none';
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

  activeOfferState = activeOfferState || { productName: document.getElementById('offerProduct')?.textContent || 'Selected item' };
  activeOfferState.buyerOffer = {
    amount,
    message: form.message?.value?.trim() || '',
    name: formValue(form, 'name') || getSignedInName() || 'Customer',
    email: formValue(form, 'email') || user?.email || '',
    phone: formValue(form, 'phone') || 'Not provided'
  };
  const autoAccept = getAutoAcceptResult(amount, activeOfferState.askingPrice, activeOfferState.selectedHeight);
  activeOfferState.autoAccept = autoAccept;
  activeOfferState.status = autoAccept.accepted ? 'accepted' : 'pending';
  updateOfferBoard();

  const offerDetails = [
    activeOfferState.sizeLabel ? `Selected size: ${activeOfferState.sizeLabel}` : '',
    activeOfferState.askingPrice ? `Asking price: ${formatMoney(activeOfferState.askingPrice)}` : '',
    activeOfferState.buyerOffer.phone && activeOfferState.buyerOffer.phone !== 'Not provided' ? `Phone: ${activeOfferState.buyerOffer.phone}` : '',
    activeOfferState.buyerOffer.message ? `Message: ${activeOfferState.buyerOffer.message}` : ''
  ].filter(Boolean).join('\n');

  const { error } = await client.from('offers').insert({
    product_name: activeOfferState.productName || 'Selected item',
    customer_id: user?.id || null,
    customer_name: activeOfferState.buyerOffer.name,
    customer_email: activeOfferState.buyerOffer.email,
    amount: Number(amount.toFixed(2)),
    message: offerDetails || null,
    status: activeOfferState.status
  });

  submitButton.disabled = false;
  submitButton.textContent = 'Send Offer Request';

  if (error) {
    showSiteMessage(`Could not send the offer yet. Please try again or contact ${supportEmail}. ${error.message || error}`, 'error');
    activeOfferState.buyerOffer = null;
    activeOfferState.status = 'draft';
    updateOfferBoard();
    return;
  }

  if (autoAccept.accepted) {
    checkoutAcceptedOffer(activeOfferState.productName, amount);
    return;
  }

  activeOfferState.status = 'sent';
  updateOfferBoard();
}

function sendSellerCounterOffer() {
  const amount = moneyFromText(document.getElementById('sellerCounterAmount')?.value);
  const message = document.getElementById('sellerCounterMessage')?.value?.trim() || '';
  if (!amount) {
    showSiteMessage('Enter a valid counteroffer amount.', 'error');
    return;
  }

  activeOfferState.sellerCounter = { amount, message };
  activeOfferState.status = 'countered';
  updateOfferBoard();
}

function acceptSellerCounterOffer() {
  if (!activeOfferState?.sellerCounter) return;
  activeOfferState.status = 'accepted';
  updateOfferBoard();
  checkoutAcceptedOffer(activeOfferState.productName, activeOfferState.sellerCounter.amount);
}

function showBuyerFinalCounter() {
  const box = document.getElementById('buyerFinalCounterBox');
  if (box) box.style.display = 'grid';
}

function sendBuyerFinalCounterOffer() {
  const amount = moneyFromText(document.getElementById('buyerFinalCounterAmount')?.value);
  const message = document.getElementById('buyerFinalCounterMessage')?.value?.trim() || '';
  if (!amount) {
    showSiteMessage('Enter a valid final counter amount.', 'error');
    return;
  }

  activeOfferState.buyerFinalCounter = { amount, message };
  activeOfferState.buyerCounterUsed = true;
  activeOfferState.status = 'final-counter';
  updateOfferBoard();
}

function openCustomForm() {
  showSiteMessage('Custom standee order form will be added here.');
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
    showSiteMessage('You already voted for this one.');
    return;
  }

  votes[voteId] = true;
  saveFanVoteStore(votes);
  incrementVoteCount(voteId);

  document.querySelectorAll(`[data-vote-id="${voteId}"]`).forEach((matchingButton) => {
    setFanVoteButtonState(matchingButton, true);
  });

  showSiteMessage('Vote counted. Thanks for helping choose what comes next.', 'success');
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

    product.style.display = matchesSearch && matchesCategory ? '' : 'none';
  });
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
  return localStorage.getItem('mvpluxAdminSignedIn') === 'true';
}

function isCustomerSignedIn() {
  return localStorage.getItem('mvpluxCustomerSignedIn') === 'true';
}

function cleanStaleAdminState() {
  if (isAdminSignedIn()) return;

  localStorage.removeItem('mvpluxAdminAnywhere');
  if (!isCustomerSignedIn() && localStorage.getItem('mvpluxSignedInName') === 'Admin') {
    localStorage.removeItem('mvpluxSignedInName');
  }
}

function signOutAdmin() {
  localStorage.removeItem('mvpluxAdminSignedIn');
  localStorage.removeItem('mvpluxAdminAnywhere');
  localStorage.removeItem('mvpluxSignedInName');
  localStorage.removeItem('mvpluxCustomerSignedIn');
  window.location.href = 'index.html';
}

function getSignedInName() {
  if (isAdminSignedIn()) return localStorage.getItem('mvpluxSignedInName') || 'Admin';
  if (isCustomerSignedIn()) return localStorage.getItem('mvpluxSignedInName') || 'Guest';
  return '';
}

function getSupabaseClient() {
  return typeof window.getMvpluxSupabaseClient === 'function' ? window.getMvpluxSupabaseClient() : null;
}

function showSupabaseConnectionAlert(actionLabel = 'connect to Supabase') {
  const projectUrl = window.MVPLUX_SUPABASE?.url || 'your Supabase project URL';
  showSiteMessage(`Could not ${actionLabel} yet. The site tried to reach ${projectUrl}. Please try again or check the Supabase project settings.`, 'error');
}

function isSupabaseNetworkError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('failed to fetch') || message.includes('load failed') || message.includes('network');
}

async function syncSupabaseAuthState() {
  const client = getSupabaseClient();
  if (!client?.auth || isAdminSignedIn()) return;

  try {
    const { data } = await client.auth.getSession();
    const user = data?.session?.user;
    if (!user) return;

    const screenName = user.user_metadata?.screen_name || user.email?.split('@')[0] || 'Guest';
    localStorage.setItem('mvpluxCustomerSignedIn', 'true');
    localStorage.setItem('mvpluxSignedInName', screenName);
  } catch (error) {
    console.warn('Supabase session check failed:', error);
  }
}

async function signInCustomerWithSupabase(email, password) {
  const client = getSupabaseClient();
  if (!client?.auth) return false;

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
    window.location.href = 'index.html';
  } catch (error) {
    console.warn('Supabase sign-in failed:', error);
    showSupabaseConnectionAlert('sign in');
  }
  return true;
}

async function signUpCustomerWithSupabase(screenName, email, password) {
  const client = getSupabaseClient();
  if (!client?.auth) return false;

  try {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
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

function setupAuthState() {
  cleanStaleAdminState();

  const signinForm = document.getElementById('signinForm');
  const signupForm = document.getElementById('signupForm');
  const signedInNotice = document.getElementById('signedInNotice');

  if (signedInNotice && isAdminSignedIn()) {
    signedInNotice.innerHTML = `You are signed in as <strong>${getSignedInName()}</strong>. <button type="button" class="admin-inline-signout" data-admin-signout>Log Out</button>`;
  }

  signinForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('signinEmail')?.value.trim().toLowerCase() || '';
    const password = document.getElementById('signinPassword')?.value.trim() || '';

    if (await signInCustomerWithSupabase(email, password)) return;

    localStorage.setItem('mvpluxCustomerSignedIn', 'true');
    localStorage.setItem('mvpluxSignedInName', email.split('@')[0] || 'Guest');
    window.location.href = 'index.html';
  });

  signupForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const screenName = document.getElementById('signupScreenName')?.value.trim() || 'Guest';
    const email = document.getElementById('signupEmail')?.value.trim().toLowerCase() || '';
    const password = document.getElementById('signupPassword')?.value.trim() || '';

    if (await signUpCustomerWithSupabase(screenName, email, password)) return;

    localStorage.setItem('mvpluxCustomerSignedIn', 'true');
    localStorage.setItem('mvpluxSignedInName', screenName);
    window.location.href = 'index.html';
  });

  const signedInName = getSignedInName();
  const isSignedIn = Boolean(isAdminSignedIn() || isCustomerSignedIn());

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
    links.insertAdjacentHTML('beforeend', `<button type="button" class="admin-inline-signout" data-admin-signout>Log Out</button>`);
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
  const overridePrice = parseFloat(builder?.dataset.originalPriceOverride || '');
  const configuredFullHeight = parseInt(settings.fullHeight || '78', 10) || 78;

  return {
    twoFootPrice: parseFloat(settings.twoFootPrice || '') || 35.00,
    threeFootPrice: parseFloat(settings.threeFootPrice || '') || 50.00,
    fullHeight: configuredFullHeight,
    fullPrice: overridePrice || parseFloat(settings.fullPrice || '') || 129.99,
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
  return 'mvpluxOriginalHeight:' + (builder.dataset.productName || 'product').replace(/\W+/g, '-').toLowerCase();
}

function clearLegacyAdminBrowserStorage() {
  localStorage.removeItem('mvpluxAdminAnywhereLegacy');
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

const standeeCatalog = {
  'kobe-bryant': {
    title: 'Kobe Bryant Standee',
    category: 'Sport Legend Standees',
    image: 'images/SportLegendStandees/Kobe/KB1nobackground.png',
    originalHeight: 78,
    originalPrice: 129.99,
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
    originalPrice: 143.99,
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
    originalPrice: 143.99,
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
    originalPrice: 129.99,
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
    originalPrice: 129.99,
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
    originalPrice: 108.49,
    description: 'A classic horror-host style cutout for spooky rooms, events, and collectors.',
    backgrounds: [
      { name: 'Classic Cutout', image: 'images/MovieCharacterStandees/Elvira/elviranew.png', stage: 'images/FanBackgrounds/top-favorite-stage-premium.png' },
      { name: 'Alternate Cutout', image: 'images/MovieCharacterStandees/Elvira/elviraforother.png', stage: 'images/FanBackgrounds/top-favorite-stage-scifi.png' }
    ],
    facts: ['Original height reference: 5\'7".', 'Great for Halloween displays and movie rooms.', 'Background choices can shift the mood quickly.', 'Smaller custom sizes are available for tables and shelves.']
  },
  'red-jacket-performer': {
    title: 'Red Jacket Performer Standee',
    category: 'Music Artist Standees',
    image: 'images/MusicArtistStandees/MJackson/MJTR.png',
    originalHeight: 69,
    originalPrice: 112.99,
    description: 'A performance-style music standee with concert and premium background options.',
    backgrounds: [
      { name: 'Clean Performer', image: 'images/MusicArtistStandees/MJackson/MJTR.png', stage: 'images/FanBackgrounds/gallery-poster-concert.png' },
      { name: 'Triangle Stage', image: 'images/MusicArtistStandees/MJackson/MJTRTrianglehalf.png', stage: 'images/FanBackgrounds/top-favorite-stage-concert.png' },
      { name: 'White Stage', image: 'images/MusicArtistStandees/MJackson/MJTRTrianglehalfblank.png', stage: 'images/FanBackgrounds/top-favorite-stage-premium.png' }
    ],
    facts: ['Original height reference: 5\'9".', 'Concert backgrounds make this feel like a mini stage.', 'Works well for music rooms and birthday setups.', 'Custom size pricing comes from the entered height.']
  },
  'zombie-dance-look': {
    title: 'Zombie Dance Look Standee',
    category: 'Music Artist Standees',
    image: 'images/MusicArtistStandees/MJackson/MJzombie.png',
    originalHeight: 69,
    originalPrice: 112.99,
    description: 'A dance-inspired music display with spooky performance energy.',
    backgrounds: [
      { name: 'Zombie Look', image: 'images/MusicArtistStandees/MJackson/MJzombie.png', stage: 'images/FanBackgrounds/top-favorite-stage-scifi.png' },
      { name: 'Alternate Zombie', image: 'images/MusicArtistStandees/MJackson/MJzombie1.png', stage: 'images/FanBackgrounds/gallery-poster-concert.png' }
    ],
    facts: ['Original height reference: 5\'9".', 'A strong pick for music and Halloween themes.', 'Choose a darker or concert-style background.', 'The size picker can make mini versions too.']
  },
  'pop-star-look': {
    title: 'Pop Star Look Standee',
    category: 'Music Artist Standees',
    image: 'images/MusicArtistStandees/TS/TSfinal.png',
    originalHeight: 71,
    originalPrice: 117.49,
    description: 'A pop performance display with colorful, pink, and clean background choices.',
    backgrounds: [
      { name: 'Clean Pop Look', image: 'images/MusicArtistStandees/TS/TSfinal.png', stage: 'images/FanBackgrounds/gallery-poster-concert.png' },
      { name: 'Colorful', image: 'images/MusicArtistStandees/TS/TSfinalcolorfulbackground.png', stage: 'images/MusicArtistStandees/TS/TSfinalcolorfulbackground.png' },
      { name: 'Off White', image: 'images/MusicArtistStandees/TS/TSfinaloffwhitebackground.png', stage: 'images/MusicArtistStandees/TS/TSfinaloffwhitebackground.png' },
      { name: 'Pink', image: 'images/MusicArtistStandees/TS/Taylor12pink.png', stage: 'images/MusicArtistStandees/TS/Taylor12pink.png' }
    ],
    facts: ['Original height reference: 5\'11".', 'Colorful backgrounds work well for party photos.', 'Original and custom sizes update live.', 'A clean cutout version is available for simple displays.']
  },
  'celebration-display': {
    title: 'Celebration Display Standee',
    category: 'Faith & Celebration Standees',
    image: 'images/FaithCelebrationStandees/Jesus/J13D.png',
    originalHeight: 72,
    originalPrice: 119.99,
    description: 'A warm celebration display for faith events, holidays, and family gatherings.',
    backgrounds: [
      { name: 'Celebration', image: 'images/FaithCelebrationStandees/Jesus/J13D.png', stage: 'images/FanBackgrounds/top-favorite-stage-gold.png' },
      { name: 'Light', image: 'images/FaithCelebrationStandees/Jesus/J13LN.png', stage: 'images/FanBackgrounds/top-favorite-stage-premium.png' },
      { name: 'Print', image: 'images/FaithCelebrationStandees/Jesus/JesusPrint.png', stage: 'images/FanBackgrounds/gallery-poster-premium.png' }
    ],
    facts: ['Original height reference: 6\'.', 'Good for church events and home displays.', 'Gold and premium backgrounds are available.', 'Custom sizes help fit smaller rooms.']
  },
  't-rex': {
    title: 'T-Rex Standee',
    category: 'Dinosaur & Animal Standees',
    image: 'images/DinosaurCreatureStandees/JPRex.png',
    originalHeight: 72,
    originalPrice: 119.99,
    description: 'A dinosaur or animal-style display with adventure background options.',
    backgrounds: [
      { name: 'T-Rex', image: 'images/DinosaurCreatureStandees/JPRex.png', stage: 'images/FanBackgrounds/gallery-poster-adventure.png' },
      { name: 'Clean T-Rex', image: 'images/FrontPageWeb/Dinosaurs-JPRex-clean.png', stage: 'images/FanBackgrounds/top-favorite-stage-gold.png' },
      { name: 'Dinosaur Group', image: 'images/DinosaurCreatureStandees/JPall.png', stage: 'images/FanBackgrounds/top-favorite-stage-premium.png' }
    ],
    facts: ['Original height reference: 6\'.', 'Popular for birthdays and adventure rooms.', 'Group dinosaur art is available as another option.', 'Custom sizing can make a smaller party version.']
  }
};

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
  return calculateCutoutPrice(parseInt(originalHeight || '78', 10) || 78);
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
  const height = parseInt(originalHeight || '78', 10) || 78;
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
  const height = parseInt(originalHeight || '78', 10) || 78;
  const price = getShowroomOriginalPrice(height);
  const productSlug = getStandeeSlug(slug || productName);
  state.builder.dataset.productName = productName;
  state.builder.dataset.adminSlug = productSlug;
  state.builder.dataset.originalHeight = String(height);
  state.builder.dataset.originalPrice = String(price);
  delete state.builder.dataset.originalPriceOverride;

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

function selectSportsOption(index) {
  const product = sportsStandeeCatalog[selectedSportsStandeeKey];
  const option = product?.options?.[index];
  const mainStage = document.getElementById('sportsMainStage');
  const mainImage = document.getElementById('sportsMainImage');

  if (!product || !option || !mainStage || !mainImage) return;

  mainStage.style.backgroundImage = `url('${getShowroomStageBackground()}')`;
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
  const product = sportsStandeeCatalog[key];
  const optionStrip = document.getElementById('sportsOptionStrip');
  if (!product || !optionStrip) return;

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

  document.querySelectorAll('[data-sports-player]').forEach((card) => {
    card.classList.toggle('active', card.dataset.sportsPlayer === key);
  });

  selectSportsOption(0);
  if (document.body.classList.contains('admin-anywhere-on')) {
    applyInlineAdminEdits();
  }
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
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  selectSportsStandee(selectedSportsStandeeKey, false);
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
  return standeeCatalog[getStandeeSlug(title)] || null;
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

  state.stage.style.backgroundImage = `url('${getGenericCategoryFallbackStage()}')`;
  state.image.src = option.image;
  state.image.alt = `${state.name.textContent} ${option.label} preview`;

  state.optionStrip.querySelectorAll('[data-generic-option-index]').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.genericOptionIndex) === index);
  });
}

function buildGenericCategoryOptions(card, backgroundImages) {
  const product = getKnownStandeeForCard(card);
  if (product?.backgrounds?.length) {
    return [...product.backgrounds]
      .map((background) => ({
        label: background.name,
        image: background.image,
        stage: getGenericCategoryFallbackStage()
      }))
      .sort((a, b) => Number(isNoBackgroundOption(b)) - Number(isNoBackgroundOption(a)));
  }

  const cardImage = card.querySelector('img')?.getAttribute('src') || '';
  const options = [{ label: 'No Background', image: cardImage, stage: getGenericCategoryFallbackStage() }];

  backgroundImages.forEach((image, index) => {
    const src = image.getAttribute('src') || '';
    if (!src || options.some((option) => option.image === src)) return;
    options.push({
      label: getGenericCategoryOptionLabel(index + 1, src),
      image: src,
      stage: getGenericCategoryFallbackStage()
    });
  });

  return options;
}

function setupGenericCategoryShowroom() {
  const page = document.querySelector('.category-page');
  if (!page || document.querySelector('.sports-showroom') || document.querySelector('.generic-showroom')) return;

  const cards = [...page.querySelectorAll('.category-card')];
  if (!cards.length) return;

  const backgroundPanel = [...page.querySelectorAll('.category-panel')].find((panel) => {
    return panel.querySelector('.background-carousel') || /Background Options/i.test(panel.textContent || '');
  });
  const backgroundImages = [...(backgroundPanel?.querySelectorAll('.background-carousel img') || [])];
  if (backgroundPanel) backgroundPanel.remove();

  const firstCard = cards[0];
  const firstTitle = firstCard.querySelector('h3')?.textContent.trim() || 'Standee';
  const firstImage = firstCard.querySelector('img')?.getAttribute('src') || '';

  const showroom = document.createElement('section');
  showroom.className = 'sports-showroom generic-showroom';
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
      <div>
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
    const product = getKnownStandeeForCard(card);
    const options = buildGenericCategoryOptions(card, backgroundImages);
    const originalSize = product?.originalHeight ? `Original: ${formatHeight(product.originalHeight)}` : 'Original size varies';
    const description = product?.description || `Preview ${title} with the available image choices for this category.`;
    state.name.textContent = title;
    if (state.description) state.description.textContent = description;
    state.facts.innerHTML = `
      <span>${originalSize}</span>
      <span>Selected card</span>
      <span>Options: ${options.length} image${options.length === 1 ? '' : 's'}</span>
    `;
    state.builder.dataset.whiteTriangleImage = findWhiteTriangleImage(options);
    if (!state.builder.dataset.whiteTriangleImage) delete state.builder.dataset.whiteTriangleImage;
    updateShowroomPurchase(state, product?.title || title, product?.originalHeight || 78, title);
    renderGenericCategoryOptions(state, options);
    selectGenericCategoryOption(state, options, 0);

    cards.forEach((item) => item.classList.toggle('active', item === card));
    state.optionStrip.querySelectorAll('[data-generic-option-index]').forEach((button) => {
      button.addEventListener('click', () => selectGenericCategoryOption(state, options, Number(button.dataset.genericOptionIndex)));
    });

    if (document.body.classList.contains('admin-anywhere-on')) {
      applyInlineAdminEdits();
    }
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

function getStandeeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getStandeeBySlug(slug) {
  return standeeCatalog[slug] || {
    title: (slug || 'Custom Standee').replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    category: 'MVPLUXCREATIONS Standee',
    image: 'images/FrontPageWeb/Sports-Kobe-KB1forprint.png',
    originalHeight: 78,
    originalPrice: 129.99,
    description: 'Choose the original size, pick your own custom size, and select from available display backgrounds.',
    backgrounds: [
      { name: 'Premium Stage', image: 'images/FrontPageWeb/Sports-Kobe-KB1forprint.png', stage: 'images/FanBackgrounds/top-favorite-stage-premium.png' },
      { name: 'Gold Stage', image: 'images/FrontPageWeb/Sports-Kobe-KB1forprint.png', stage: 'images/FanBackgrounds/top-favorite-stage-gold.png' },
      { name: 'Clean White', image: 'images/FrontPageWeb/Sports-Kobe-KB1forprint.png', stage: 'images/FrontPageWeb/Herobackgroundparts-backgroundforimages.jpg' }
    ],
    facts: ['Original size is used as the starting point for custom pricing.', 'Choose a background when options are offered.', 'Use Buy It Now for fast checkout.', 'Enter a height like 5\'8 or 68 for custom sizing.']
  };
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
  const product = getStandeeBySlug(params.get('item') || 'kobe-bryant');
  const slug = getStandeeSlug(product.title);
  const originalHeight = parseInt(product.originalHeight || '78', 10);
  const originalPrice = Number(product.originalPrice || calculateCutoutPrice(originalHeight) || 129.99);
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
  if (override.originalHeight) {
    const overrideHeight = parseHeightToInches(String(override.originalHeight)) || parseInt(override.originalHeight, 10);
    if (overrideHeight) builder.dataset.originalHeight = String(overrideHeight);
  }
  if (override.originalPrice) builder.dataset.originalPriceOverride = String(override.originalPrice);
}

function updateBuilderOriginalDisplay(builder) {
  const originalHeight = parseInt(builder.dataset.originalHeight || '78', 10);
  const explicitPrice = parseFloat(builder.dataset.originalPriceOverride || '');
  const baseOriginalPrice = explicitPrice || calculateCutoutPrice(originalHeight, builder);
  const originalPrice = addFinishToPrice(baseOriginalPrice, builder);
  const originalLabel = builder.querySelector('input[value="original"]')?.closest('label')?.querySelector('span');
  const customLabel = builder.querySelector('input[value="custom"]')?.closest('label')?.querySelector('span');
  const priceDisplay = builder.querySelector('.live-size-price');
  const originalRadio = builder.querySelector('input[value="original"]');
  const stage = builder.closest('.product-card')?.querySelector('.product-stage-preview');
  const originalChoice = stage?.querySelector('[data-stage-choice="original"]');

  builder.dataset.originalPrice = originalPrice.toFixed(2);

  if (originalLabel) {
    originalLabel.textContent = builder.classList.contains('showroom-size-builder')
      ? `Original ${formatHeight(originalHeight)}`
      : `Original Size - ${formatHeight(originalHeight)} - ${formatMoney(originalPrice)}`;
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
      showSiteMessage("Enter a height like 6'6 or 78.", 'error');
      return;
    }

    builder.dataset.originalHeight = String(inches);
    updateBuilderOriginalDisplay(builder);
    setStageChoice(builder, 'original');
    showSiteMessage('Height changed only on this screen. To make it permanent now, edit the code. Backend saving will come later.');
  });
}

/* ---------------- SITE-WIDE ADMIN MODE ---------------- */
let inlineAdminDraftEdits = null;
let inlineAdminSelectedImage = null;
let inlineAdminUndoStack = [];
let inlineAdminRedoStack = [];
let inlineAdminDirty = false;
let inlineAdminLastToolbarAction = { action: '', time: 0 };
let inlineAdminResizeActive = false;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function readInlineAdminEdits() {
  try {
    return JSON.parse(localStorage.getItem('mvpluxInlineAdminEdits') || '{}');
  } catch (error) {
    return {};
  }
}

function writeInlineAdminEdits(edits) {
  inlineAdminDraftEdits = edits || {};
  localStorage.setItem('mvpluxInlineAdminEdits', JSON.stringify(inlineAdminDraftEdits));
}

function getInlineAdminDraft() {
  if (!inlineAdminDraftEdits) inlineAdminDraftEdits = readInlineAdminEdits();
  return inlineAdminDraftEdits;
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

function inlineAdminKey(element) {
  if (element.dataset.adminEdit) return element.dataset.adminEdit;

  if (element.tagName === 'IMG') {
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

function isCodeControlledShopImage(image) {
  return image?.matches?.('.hero-group');
}

function applyInlineAdminEdits() {
  document.querySelectorAll('img,h1,h2,h3,h4,p,a,button,span,label,strong,li').forEach((element) => {
    if (element.closest('.auth-form')) return;
    if (!element.closest('.admin-anywhere-toolbar')) inlineAdminKey(element);
  });

  const pageEdits = getInlineAdminDraft()[inlineAdminPageKey()] || {};

  Object.entries(pageEdits).forEach(([key, edit]) => {
    const element = document.querySelector(`[data-admin-edit="${key}"]`);
    if (!element) return;
    if (element.closest('.auth-form')) return;
    if (element.tagName === 'IMG' && isCodeControlledShopImage(element)) return;

    if (edit.text && element.tagName !== 'IMG') element.textContent = edit.text;
    if (edit.src && element.tagName === 'IMG') element.src = edit.src;
    if (element.tagName === 'IMG' && !isInlineAdminBackgroundImage(element)) {
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
  writeInlineAdminEdits(edits);
  inlineAdminDirty = false;
  updateInlineAdminToolbarState();
}

function commitInlineAdminEdits() {
  writeInlineAdminEdits(getInlineAdminDraft());
  inlineAdminDirty = false;
  updateInlineAdminToolbarState('Saved in browser');
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

  if (status) status.textContent = message || (inlineAdminDirty ? 'Unsaved preview' : 'Saved in browser');
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

  const state = image._adminImageState || { x: 0, y: 0, scale: 1, rotate: 0 };
  if (!image.style.getPropertyValue('--admin-base-transform')) {
    const baseTransform = image.closest('.category-featured-art, .standee-hero-art')
      ? 'translateX(-50%)'
      : 'translate(0, 0)';
    image.style.setProperty('--admin-base-transform', baseTransform);
  }
  const baseTransform = image.style.getPropertyValue('--admin-base-transform') || 'translate(0, 0)';
  const transform = `${baseTransform} translate(${state.x}px, ${state.y}px) scale(${state.scale}) rotate(${state.rotate}deg)`;
  image.style.setProperty('--admin-x', `${state.x}px`);
  image.style.setProperty('--admin-y', `${state.y}px`);
  image.style.setProperty('--admin-scale', state.scale);
  image.style.setProperty('--admin-rotate', `${state.rotate}deg`);
  image.style.setProperty('transform', transform, 'important');
  image.classList.toggle('admin-image-locked', !!state.locked);
  if (image === inlineAdminSelectedImage) updateInlineAdminResizeHandle();
  updateInlineAdminLockButtons();
}

function selectInlineAdminImage(image) {
  if (inlineAdminSelectedImage && inlineAdminSelectedImage !== image) {
    inlineAdminSelectedImage.classList.remove('admin-image-selected');
  }

  inlineAdminSelectedImage = image;
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

  next.scale = clamp(Number(next.scale || 1), 0.25, 3);
  next.rotate = Number(next.rotate || 0);
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
    x: Number(state.x || 0) + deltaX,
    y: Number(state.y || 0) + deltaY
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
    return JSON.parse(localStorage.getItem('mvpluxInlineHiddenCards') || '{}');
  } catch (error) {
    return {};
  }
}

function writeInlineHiddenCards(cards) {
  localStorage.setItem('mvpluxInlineHiddenCards', JSON.stringify(cards || {}));
  return cards;
}

function getInlineAdminSelectedCard() {
  const image = getActiveInlineAdminImage(false);
  return image?.closest('.fan-vote-card, .fan-gallery-card, .product-card, .category-card');
}

function hideSelectedInlineAdminCard() {
  if (!window.confirm('Save this card for later? Use Bring Back Cards to show it again.')) {
    updateInlineAdminToolbarState('Card kept');
    return;
  }

  const card = getInlineAdminSelectedCard();
  if (!card) {
    updateInlineAdminToolbarState('Select a card image first');
    return;
  }

  const key = card.dataset.adminCardKey || `card-${[...document.querySelectorAll('.fan-vote-card, .fan-gallery-card, .product-card, .category-card')].indexOf(card)}`;
  card.dataset.adminCardKey = key;
  const hidden = readInlineHiddenCards();
  const page = inlineAdminPageKey();
  hidden[page] = hidden[page] || {};
  hidden[page][key] = true;
  writeInlineHiddenCards(hidden);
  card.style.display = 'none';
  inlineAdminSelectedImage = null;
  updateInlineAdminToolbarState('Hidden only until refresh');
}

function restoreInlineHiddenCards() {
  const hidden = readInlineHiddenCards();
  delete hidden[inlineAdminPageKey()];
  writeInlineHiddenCards(hidden);
  document.querySelectorAll('.fan-vote-card, .fan-gallery-card, .product-card, .category-card').forEach((card) => {
    card.style.display = '';
  });
  updateInlineAdminToolbarState('Saved cards shown');
}

function readInlineAdminToolbarPrefs() {
  try {
    return JSON.parse(localStorage.getItem('mvpluxInlineAdminToolbar') || '{}');
  } catch (error) {
    return {};
  }
}

function writeInlineAdminToolbarPrefs(prefs) {
  window.mvpluxInlineToolbarPrefs = { ...(prefs || {}) };
  localStorage.setItem('mvpluxInlineAdminToolbar', JSON.stringify(window.mvpluxInlineToolbarPrefs));
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

  if (prefs.layout === 'free') {
    const width = Math.min(Math.max(Number(prefs.width) || 360, 160), window.innerWidth - 16);
    const height = Math.min(Math.max(Number(prefs.height) || 78, 42), window.innerHeight - 16);
    const x = Math.min(Math.max(Number(prefs.x) || 16, 8), window.innerWidth - 60);
    const y = Math.min(Math.max(Number(prefs.y) || 120, 8), window.innerHeight - 42);
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
  if (layout) layout.textContent = prefs.layout === 'side' ? 'Bottom' : 'Side';
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

  mover?.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = toolbar.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    const move = (moveEvent) => {
      const prefs = readInlineAdminToolbarPrefs();
      prefs.layout = 'free';
      prefs.collapsed = false;
      prefs.x = Math.min(Math.max(moveEvent.clientX - offsetX, 8), window.innerWidth - 60);
      prefs.y = Math.min(Math.max(moveEvent.clientY - offsetY, 8), window.innerHeight - 42);
      prefs.width = rect.width;
      prefs.height = rect.height;
      writeInlineAdminToolbarPrefs(prefs);
      applyInlineAdminToolbarPrefs();
    };

    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
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
  const hidden = readInlineHiddenCards()[inlineAdminPageKey()] || {};
  document.querySelectorAll('.fan-vote-card, .fan-gallery-card, .product-card, .category-card').forEach((card, index) => {
    const key = card.dataset.adminCardKey || `card-${index}`;
    card.dataset.adminCardKey = key;
    if (hidden[key]) card.style.display = 'none';
  });
}

var runInlineAdminToolbarAction = function (action) {
  const now = Date.now();
  if (inlineAdminLastToolbarAction.action === action && now - inlineAdminLastToolbarAction.time < 250) return;
  inlineAdminLastToolbarAction = { action, time: now };

  if (action === 'undo') undoInlineAdminEdit();
  if (action === 'redo') redoInlineAdminEdit();
  if (action === 'save') commitInlineAdminEdits();
  if (action === 'hide-card') hideSelectedInlineAdminCard();
  if (action === 'restore-cards') restoreInlineHiddenCards();
  if (action === 'toggle-toolbar-layout') toggleInlineAdminToolbarLayout();
  if (action === 'toggle-toolbar-size') toggleInlineAdminToolbarSize();
  if (action === 'toggle-toolbar-collapsed') toggleInlineAdminToolbarCollapsed();
  if (action === 'copy-code') copySelectedInlineAdminCode();
  if (action === 'reset-image') resetSelectedInlineAdminImage();
  if (action === 'lock-image') toggleSelectedInlineAdminImageLock();
  if (action === 'unlock-all-images') unlockAllInlineAdminImages();
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
        const maxSide = 1600;
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

function installInlineAdminMode() {
  if (document.body.dataset.inlineAdminReady) return;
  document.body.dataset.inlineAdminReady = 'true';
  document.body.classList.add('admin-anywhere-on');

  document.body.insertAdjacentHTML('beforeend', `
    <div class="admin-anywhere-toolbar">
      <strong>Admin Editing</strong>
      <button type="button" class="admin-toolbar-drag-handle" id="adminToolbarDragHandle" title="Drag admin tools">Move</button>
      <button type="button" class="admin-tool-control admin-toolbar-toggle" data-admin-toolbar-action="toggle-toolbar-layout" id="adminInlineLayout" title="Move tools to side or bottom" onpointerdown="runInlineAdminToolbarAction('toggle-toolbar-layout'); return false;" onclick="runInlineAdminToolbarAction('toggle-toolbar-layout'); return false;">Side</button>
      <button type="button" class="admin-tool-control admin-toolbar-toggle" data-admin-toolbar-action="toggle-toolbar-size" id="adminInlineToolSize" title="Make tools smaller or normal size" onpointerdown="runInlineAdminToolbarAction('toggle-toolbar-size'); return false;" onclick="runInlineAdminToolbarAction('toggle-toolbar-size'); return false;">Small</button>
      <button type="button" class="admin-tool-control admin-toolbar-toggle" data-admin-toolbar-action="toggle-toolbar-collapsed" id="adminInlineHideTools" title="Hide or show admin tools" onpointerdown="runInlineAdminToolbarAction('toggle-toolbar-collapsed'); return false;" onclick="runInlineAdminToolbarAction('toggle-toolbar-collapsed'); return false;">Hide Tools</button>
      <span id="adminInlineStatus">Saved in browser</span>
      <button type="button" class="admin-tool-control" data-admin-toolbar-action="undo" id="adminInlineUndo" title="Undo" onpointerdown="runInlineAdminToolbarAction('undo'); return false;" onclick="runInlineAdminToolbarAction('undo'); return false;">Undo</button>
      <button type="button" class="admin-tool-control" data-admin-toolbar-action="redo" id="adminInlineRedo" title="Redo" onpointerdown="runInlineAdminToolbarAction('redo'); return false;" onclick="runInlineAdminToolbarAction('redo'); return false;">Redo</button>
      <button type="button" class="admin-tool-control" data-admin-toolbar-action="save" id="adminInlineSave" title="Save changes" onpointerdown="runInlineAdminToolbarAction('save'); return false;" onclick="runInlineAdminToolbarAction('save'); return false;">Save</button>
      <button type="button" class="admin-tool-control" data-admin-toolbar-action="copy-code" id="adminInlineCopyCode" title="Copy CSS code for selected image" onpointerdown="runInlineAdminToolbarAction('copy-code'); return false;" onclick="runInlineAdminToolbarAction('copy-code'); return false;">Copy Code</button>
      <button type="button" class="admin-tool-control" data-admin-toolbar-action="restore-cards" id="adminInlineRestoreCards" title="Bring back cards saved for later" onpointerdown="runInlineAdminToolbarAction('restore-cards'); return false;" onclick="runInlineAdminToolbarAction('restore-cards'); return false;">Bring Back Cards</button>
      <span id="adminInlineSelected">Select an image</span>
      <button type="button" class="admin-tool-control" data-admin-image-control data-admin-toolbar-action="center" id="adminInlineCenter" title="Center selected image" onpointerdown="runInlineAdminToolbarAction('center'); return false;" onclick="runInlineAdminToolbarAction('center'); return false;">Center</button>
      <button type="button" class="admin-tool-control" data-admin-image-control data-admin-toolbar-action="reset-image" id="adminInlineResetImage" title="Back to normal" onpointerdown="runInlineAdminToolbarAction('reset-image'); return false;" onclick="runInlineAdminToolbarAction('reset-image'); return false;">Normal</button>
      <button type="button" class="admin-tool-control" data-admin-image-control data-admin-toolbar-action="lock-image" id="adminInlineLockImage" title="Lock selected image in place" onpointerdown="runInlineAdminToolbarAction('lock-image'); return false;" onclick="runInlineAdminToolbarAction('lock-image'); return false;">Lock</button>
      <button type="button" class="admin-tool-control" data-admin-toolbar-action="unlock-all-images" id="adminInlineUnlockAll" title="Unlock all locked images" onpointerdown="runInlineAdminToolbarAction('unlock-all-images'); return false;" onclick="runInlineAdminToolbarAction('unlock-all-images'); return false;">Unlock All</button>
      <button type="button" class="admin-tool-control" data-admin-image-control data-admin-toolbar-action="size-down" id="adminInlineSizeDown" title="Smaller" onpointerdown="runInlineAdminToolbarAction('size-down'); return false;" onclick="runInlineAdminToolbarAction('size-down'); return false;">Size -</button>
      <button type="button" class="admin-tool-control" data-admin-image-control data-admin-toolbar-action="size-up" id="adminInlineSizeUp" title="Bigger" onpointerdown="runInlineAdminToolbarAction('size-up'); return false;" onclick="runInlineAdminToolbarAction('size-up'); return false;">Size +</button>
      <button type="button" class="admin-tool-control" data-admin-image-control data-admin-toolbar-action="rotate-left" id="adminInlineRotateLeft" title="Rotate left" onpointerdown="runInlineAdminToolbarAction('rotate-left'); return false;" onclick="runInlineAdminToolbarAction('rotate-left'); return false;">Rotate -</button>
      <button type="button" class="admin-tool-control" data-admin-image-control data-admin-toolbar-action="rotate-right" id="adminInlineRotateRight" title="Rotate right" onpointerdown="runInlineAdminToolbarAction('rotate-right'); return false;" onclick="runInlineAdminToolbarAction('rotate-right'); return false;">Rotate +</button>
      <a href="admin.html#create-card">Add Card</a>
      <a href="admin.html">Admin Page</a>
      <button type="button" class="admin-tool-control admin-tool-danger" data-admin-toolbar-action="hide-card" id="adminInlineHideCard" title="Save selected card for later" onpointerdown="runInlineAdminToolbarAction('hide-card'); return false;" onclick="runInlineAdminToolbarAction('hide-card'); return false;">Save for Later</button>
      <button type="button" class="admin-tool-control" data-admin-toolbar-action="sign-out" id="adminAnywhereOff" onpointerdown="runInlineAdminToolbarAction('sign-out'); return false;" onclick="runInlineAdminToolbarAction('sign-out'); return false;">Log Out</button>
      <button type="button" class="admin-toolbar-resize-handle" id="adminToolbarResizeHandle" title="Resize admin tools" aria-label="Resize admin tools"></button>
    </div>
  `);
  bindInlineAdminToolbarControls();
  bindInlineAdminToolbarDragResize();
  applyInlineAdminToolbarPrefs();

  applyInlineHiddenCards();

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

  document.querySelectorAll('h1,h2,h3,h4,p,a,button,span,label,strong,li').forEach((element) => {
    if (element.closest('.admin-anywhere-toolbar, .cart-panel, .auth-form, script, style, .password-field')) return;
    if (element.closest('.fan-vote-meter, .fan-carousel-dots, .stage-option-boxes')) return;
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
    if (isCodeControlledShopImage(image)) {
      image.classList.remove('admin-transformable-image', 'admin-editable-image', 'admin-image-selected');
      image.style.removeProperty('--admin-x');
      image.style.removeProperty('--admin-y');
      image.style.removeProperty('--admin-scale');
      image.style.removeProperty('--admin-rotate');
      image.style.removeProperty('--admin-base-transform');
      image.style.removeProperty('transform');
      image.style.removeProperty('left');
      image.style.removeProperty('bottom');
      image.style.removeProperty('height');
      image.style.removeProperty('width');
      image.style.removeProperty('top');
      return;
    }
    if (!image.closest('.hero-stage')) {
      image.loading = 'lazy';
      image.decoding = 'async';
    }
    inlineAdminKey(image);
    const computedTransform = getComputedStyle(image).transform;
    image.style.setProperty('--admin-base-transform', computedTransform && computedTransform !== 'none' ? computedTransform : 'translate(0, 0)');
    image.classList.add('admin-editable-image');
    if (!isInlineAdminBackgroundImage(image)) image.classList.add('admin-transformable-image');
    const saved = readInlineAdminEdits()[inlineAdminPageKey()]?.[inlineAdminKey(image)] || {};
    image._adminImageState = {
      x: Number(saved.x || 0),
      y: Number(saved.y || 0),
      scale: Number(saved.scale || 1),
      rotate: Number(saved.rotate || 0),
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
  window.addEventListener('scroll', updateInlineAdminLockButtons, { passive: true });
  window.addEventListener('resize', updateInlineAdminResizeHandle);
  window.addEventListener('resize', updateInlineAdminLockButtons);
  updateInlineAdminToolbarState();
}

function getSelectedProduct(button) {
  const card = button.closest('.product-card, .showroom-purchase-card, .standee-purchase-panel, .category-featured-info');
  const builder = card?.querySelector('.size-builder');

  if (!builder) {
    const productName = card?.querySelector('.product-title-link, h1, h2, .generic-selected-name, #sportsSelectedName')?.textContent || 'Custom Standee';
    return { card, builder: null, productName, price: 50.00, valid: true };
  }

  const priceEl = builder.querySelector('.live-size-price');
  const baseProductName = builder.dataset.productName || 'Custom Standee';
  const customRadio = builder.querySelector('input[value="custom"]');
  const isCustom = Boolean(customRadio?.checked);
  const customHeight = parseHeightToInches(builder.querySelector('.custom-height-input')?.value || '');
  const originalHeight = parseHeightToInches(builder.dataset.originalHeight || '') || parseInt(builder.dataset.originalHeight || '0', 10);
  const selectedHeight = isCustom ? customHeight : originalHeight;
  const sizeLabel = selectedHeight ? formatHeight(selectedHeight) : (isCustom ? 'Custom Size' : 'Original Size');
  const productName = `${baseProductName} - ${sizeLabel} - ${getFinishLabel(builder)}`;
  const rawPrice = priceEl ? priceEl.textContent.replace('$', '').trim() : '';
  const price = parseFloat(rawPrice);

  // If no valid price or zero price, do NOT allow purchase
  if (!price || price <= 0) {
    return { card, builder, productName, price: 0, selectedHeight, sizeLabel, valid: false };
  }

  return { card, builder, productName, price, selectedHeight, sizeLabel, valid: true };
}

function addSelectedToCart(button) {
  const selected = getSelectedProduct(button);

  if (!selected.valid) {
    showSiteMessage('Please enter a valid custom height before adding this item to cart.', 'error');
    return;
  }

  addToCart(selected.productName, selected.price);
}

function buySelectedNow(button) {
  const selected = getSelectedProduct(button);

  if (!selected.valid) {
    showSiteMessage('Please enter a valid custom height before buying this item.', 'error');
    return;
  }

  const img = selected.card?.querySelector('.product-cutout, #sportsMainImage, .generic-main-image, .standee-main-cutout')?.src || document.querySelector('.standee-main-cutout')?.src || '';
  openBuyNow(selected.productName, selected.price, img);
}

function openSelectedOffer(button) {
  const selected = getSelectedProduct(button);
  if (!selected.valid) {
    showSiteMessage('Please enter a valid custom height before making an offer.', 'error');
    return;
  }
  openOffer(selected.productName || 'Selected Standee', {
    askingPrice: selected.price,
    selectedHeight: selected.selectedHeight,
    sizeLabel: selected.sizeLabel
  });
}

/* ---------------- PAGE INIT ---------------- */
document.addEventListener('DOMContentLoaded', function () {
  clearLegacyAdminBrowserStorage();
  syncSupabaseAuthState().catch(() => {});
  setupAuthState();
  updateCart();
  showInfoSlide(0);
  renderCouponBanner();
  bindProductCarouselDragGuard();

  document.querySelectorAll('img').forEach((image) => {
    image.setAttribute('draggable', 'false');
    image.addEventListener('dragstart', (event) => event.preventDefault());
    image.addEventListener('contextmenu', (event) => event.preventDefault());
  });

  document.addEventListener('change', (event) => {
    if (event.target.closest?.('input[name="checkoutPaymentMethod"]')) {
      updateCheckoutDisplay();
    }
  });

  applyAdminExtraImages();
  applyInlineAdminEdits();
  renderAdminManagedCards();
  renderStandeeDetailPage();
  setupGenericCategoryShowroom();
  initSportsShowroom();
  bindSportsShowroomClicks();
  bindCategoryStandeeCards();

  ensureStageOptionBoxes();
  ensureFinishChoices();
  bindUniversalSizeBuilderEvents();

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

    updateBuilderOriginalDisplay(builder);
  });

  applyInlineAdminEdits();

  const isAuthPage = Boolean(document.querySelector('.auth-page'));
  if (!isAuthPage && isAdminSignedIn()) {
    installInlineAdminMode();
  }
});
