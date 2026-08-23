(function initializeCustomOrderPage() {
  const MAX_FILES = 5;
  const MAX_FILE_BYTES = 6_000_000;
  const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

  function status(message, state = '') {
    const output = document.getElementById('customOrderStatus');
    if (!output) return;
    output.textContent = message;
    output.dataset.state = state;
  }

  function desiredHeight(form) {
    return window.MVPLUX_PRICING.parseHeight(new FormData(form).get('desiredHeight'));
  }

  function updatePrice(form) {
    const height = desiredHeight(form);
    const output = document.getElementById('customOrderPrice');
    if (!output) return;
    const price = height ? window.MVPLUX_PRICING.calculateHeightPrice(height, window.mvpluxPublishedAdminSettings?.priceSettings || {}) : null;
    output.textContent = Number.isFinite(price) ? `${formatMoney(price)} at ${formatHeight(height)}` : 'Enter a valid size (24–120 inches)';
  }

  function validateFiles(files) {
    if (!files.length) return 'Choose at least one reference image.';
    if (files.length > MAX_FILES) return `Choose no more than ${MAX_FILES} reference images.`;
    const invalid = files.find((file) => !ALLOWED_TYPES.has(file.type) || !file.size || file.size > MAX_FILE_BYTES);
    return invalid ? `${invalid.name || 'One image'} must be PNG, JPG, or WebP and no larger than 6 MB.` : '';
  }

  async function submitCustomOrder(form) {
    const files = [...form.elements.referenceImages.files];
    const fileError = validateFiles(files);
    const height = desiredHeight(form);
    if (fileError) throw new Error(fileError);
    if (!height || height < 24 || height > 120) throw new Error('Enter a desired height between 24 and 120 inches.');

    const client = window.getMvpluxSupabaseClient?.();
    const session = client ? (await client.auth.getSession()).data?.session : null;
    const payload = new FormData(form);
    payload.set('desiredHeight', String(height));
    const project = window.MVPLUX_SUPABASE;
    if (!project?.url || !project?.publishableKey) throw new Error('The secure order service is not available.');
    const response = await fetch(`${project.url}/functions/v1/submit-custom-order`, {
      method: 'POST',
      headers: {
        apikey: project.publishableKey,
        Authorization: `Bearer ${session?.access_token || project.publishableKey}`
      },
      body: payload
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'The custom order request could not be sent.');
    return result;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('customOrderForm');
    if (!form) return;
    form.elements.desiredHeight.addEventListener('input', () => updatePrice(form));
    form.elements.referenceImages.addEventListener('change', () => {
      const error = validateFiles([...form.elements.referenceImages.files]);
      status(error || `${form.elements.referenceImages.files.length} reference image${form.elements.referenceImages.files.length === 1 ? '' : 's'} selected.`, error ? 'error' : 'ready');
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = document.getElementById('customOrderSubmit');
      button.disabled = true;
      button.textContent = 'Uploading references…';
      status('Uploading your private reference images and creating the request…', 'saving');
      try {
        const result = await submitCustomOrder(form);
        status(`Request received. Your reference number is ${result.orderNumber}.`, 'success');
        form.reset();
        updatePrice(form);
      } catch (error) {
        status(error?.message || 'The custom order request could not be sent.', 'error');
      } finally {
        button.disabled = false;
        button.textContent = 'Send Custom Order Request';
      }
    });
    updatePrice(form);
  });
})();
