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

  // If they type 4, 5, 6, 7, or 8, treat it as feet
  if (number >= 4 && number <= 8) {
    return number * 12;
  }

  // If they type 48 or more, treat it as inches
  if (number >= 48) {
    return number;
  }

  return null;
}

  return null;
}

function calculateCutoutPrice(inches) {
  if (!inches) return null;

  if (inches < 48) return 80.99;
  if (inches >= 96) return 159.99;

  if (inches >= 48 && inches <= 59) {
    return 80.99 + ((inches - 48) * 1.00);
  }

  if (inches >= 60 && inches <= 71) {
    return 94.99 + ((inches - 60) * 1.50);
  }

  if (inches >= 72 && inches <= 95) {
    return 114.99 + ((inches - 72) * 2.00);
  }

  return 94.99;
}

function getSelectedProduct(button) {
  const card = button.closest('.product-card');
  const builder = card.querySelector('.size-builder');

  if (!builder) {
    const productName = card.querySelector('.product-title-link')?.textContent || 'Custom Cutout';
    return { card, builder: null, productName, price: 80.99, valid: true };
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

  window.addEventListener('click', function (e) {
    const bgModal = document.getElementById('bgModal');
    if (bgModal && e.target === bgModal) closeBgModal();
  });

  document.querySelectorAll('.size-builder').forEach((builder) => {
    const originalPrice = parseFloat(builder.dataset.originalPrice || '119.99');
    const priceDisplay = builder.querySelector('.live-size-price');
    const customInput = builder.querySelector('.custom-height-input');
    const radios = builder.querySelectorAll('input[type="radio"]');

    radios.forEach((radio) => {
      radio.addEventListener('change', function () {
        if (this.value === 'custom') {
        priceDisplay.textContent = 'Enter a height';
        if (customInput) customInput.focus();
    }
      });
    });

    if (customInput) {
      customInput.addEventListener('input', function () {
        const inches = parseHeightToInches(this.value);
        const price = calculateCutoutPrice(inches);

        if (!price) {
        priceDisplay.textContent = 'Enter a valid height';
        return;
    }

        priceDisplay.textContent = '$' + price.toFixed(2);
      });
    }
  });
});