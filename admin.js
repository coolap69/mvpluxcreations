const adminProducts = [
  {
    slug: 'sports-star-standee',
    title: 'Sports Star Standees',
    description: 'Shop sports-inspired standee styles, then choose different players, sizes, and background options inside the category.',
    originalHeight: 78,
    originalPrice: 129.99,
    cutoutImage: 'images/FrontPageWeb/Sports-Kobe-KB1forprint.png',
    backgroundImage: 'images/FanBackgrounds/top-favorite-stage-scifi.png'
  },
  {
    slug: 'movie-character-standee',
    title: 'Movie Character Standees',
    description: 'Browse movie-style standee categories and see more character looks, poses, and display backgrounds inside.',
    originalHeight: 74,
    originalPrice: '',
    cutoutImage: 'images/FrontPageWeb/MovieCharacters-Endorskeleton-Endordarkinsideshouldercutout.png',
    backgroundImage: 'images/FanBackgrounds/top-favorite-stage-scifi.png'
  },
  {
    slug: 'music-artist-standee',
    title: 'Music Artist Standees',
    description: 'Explore concert-style standee categories with different performers, stage looks, and custom display choices.',
    originalHeight: 69,
    originalPrice: '',
    cutoutImage: 'images/FrontPageWeb/Music-MJackson-MJTR.png',
    backgroundImage: 'images/FanBackgrounds/top-favorite-stage-scifi.png'
  },
  {
    slug: 'faith-celebration-standee',
    title: 'Faith & Celebration Standees',
    description: 'View inspirational and celebration display categories for churches, holidays, events, rooms, and plays.',
    originalHeight: 72,
    originalPrice: '',
    cutoutImage: 'images/FrontPageWeb/Religious-J13D.png',
    backgroundImage: 'images/FanBackgrounds/top-favorite-stage-scifi.png'
  },
  {
    slug: 'fan-request-standee',
    title: 'Fan Request Standees',
    description: 'See fan-inspired ideas, mashups, and custom concepts that can become full-size display pieces.',
    originalHeight: 69,
    originalPrice: '',
    cutoutImage: 'images/FrontPageWeb/Music-MJackson-MJzombie.png',
    backgroundImage: 'images/FanBackgrounds/top-favorite-stage-scifi.png'
  },
  {
    slug: 'dinosaur-party-standee',
    title: 'Dinosaur & Creature Standees',
    description: 'Shop dinosaur and creature-style displays for birthdays, rooms, outdoor setups, and big party moments.',
    originalHeight: 96,
    originalPrice: '',
    cutoutImage: 'images/FrontPageWeb/Dinosaurs-JPRex.png',
    backgroundImage: 'images/FanBackgrounds/top-favorite-stage-scifi.png'
  },
  {
    slug: 'game-fantasy-standee',
    title: 'Game & Fantasy Standees',
    description: 'Browse game-room, fantasy, stream, and themed-event standee categories with custom scene options.',
    originalHeight: 72,
    originalPrice: '',
    cutoutImage: 'images/FrontPageWeb/Herobackgroundparts-hero10E.png',
    backgroundImage: 'images/FanBackgrounds/top-favorite-stage-scifi.png'
  },
  {
    slug: 'custom-photo-standee',
    title: 'Custom Photo Standees',
    description: 'Turn your own photo, family member, athlete, or guest of honor into a custom standee display.',
    originalHeight: 66,
    originalPrice: '',
    cutoutImage: 'images/FrontPageWeb/Herobackgroundparts-hero7T.png',
    backgroundImage: 'images/FanBackgrounds/top-favorite-stage-scifi.png'
  },
  {
    slug: 'small-standee-party-pack',
    title: 'Party Pack Standees',
    description: 'Shop smaller standee packs for tables, birthdays, rooms, gifts, and party displays.',
    originalHeight: 36,
    originalPrice: 50,
    cutoutImage: 'images/FrontPageWeb/Herobackgroundparts-hero8T.png',
    backgroundImage: 'images/FanBackgrounds/top-favorite-stage-scifi.png'
  }
];

function readAdminProducts() {
  try {
    return JSON.parse(localStorage.getItem('mvpluxAdminProducts') || '{}');
  } catch (error) {
    return {};
  }
}

function writeAdminProducts(products) {
  localStorage.setItem('mvpluxAdminProducts', JSON.stringify(products));
}

function readCoupons() {
  try {
    return JSON.parse(localStorage.getItem('mvpluxAdminCoupons') || '[]');
  } catch (error) {
    return [];
  }
}

function setStatus(message) {
  const status = document.getElementById('adminStatus');
  if (status) status.textContent = message;
}

function renderAdminProducts() {
  const container = document.getElementById('adminProducts');
  const saved = readAdminProducts();
  if (!container) return;

  container.innerHTML = adminProducts.map((product) => {
    const value = { ...product, ...(saved[product.slug] || {}) };
    return `
      <form class="admin-product-card" data-slug="${product.slug}">
        <h3>${product.title}</h3>
        <label>
          Card title
          <input name="title" type="text" value="${value.title || ''}">
        </label>
        <label>
          Card description
          <textarea name="description" rows="3">${value.description || ''}</textarea>
        </label>
        <label>
          Standee image path
          <input name="cutoutImage" type="text" value="${value.cutoutImage || ''}">
        </label>
        <label>
          Background image path
          <input name="backgroundImage" type="text" value="${value.backgroundImage || ''}">
        </label>
        <div class="admin-form-row">
          <label>
            Original height
            <input name="originalHeight" type="text" value="${value.originalHeight || ''}" placeholder="6'6 or 78">
          </label>
          <label>
            Original price
            <input name="originalPrice" type="number" min="0" step="0.01" value="${value.originalPrice || ''}" placeholder="Auto">
          </label>
        </div>
        <button type="submit">Save Product</button>
      </form>
    `;
  }).join('');

  container.querySelectorAll('.admin-product-card').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const products = readAdminProducts();
      products[form.dataset.slug] = {
        title: formData.get('title').trim(),
        description: formData.get('description').trim(),
        cutoutImage: formData.get('cutoutImage').trim(),
        backgroundImage: formData.get('backgroundImage').trim(),
        originalHeight: formData.get('originalHeight').trim(),
        originalPrice: formData.get('originalPrice').trim()
      };
      writeAdminProducts(products);
      setStatus('Saved product changes. Go back to Shop to see them.');
    });
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
    localStorage.setItem('mvpluxAdminCoupons', JSON.stringify([{
      code: codeInput.value.trim().toUpperCase(),
      discount: discountInput.value.trim()
    }]));
    setStatus('Saved coupon. It will show at the top of the Shop section.');
  });

  document.getElementById('clearCoupons')?.addEventListener('click', () => {
    localStorage.removeItem('mvpluxAdminCoupons');
    codeInput.value = '';
    discountInput.value = '';
    setStatus('Coupon cleared.');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderAdminProducts();
  setupCoupons();

  document.getElementById('resetAdminProducts')?.addEventListener('click', () => {
    localStorage.removeItem('mvpluxAdminProducts');
    renderAdminProducts();
    setStatus('Product edits reset.');
  });
});
