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

  function orderMode(form) {
    return new FormData(form).get('orderMode') === 'discussed' ? 'discussed' : 'new';
  }

  function validateFiles(files, { required = true } = {}) {
    if (!files.length) return required ? 'Choose at least one reference image.' : '';
    if (files.length > MAX_FILES) return `Choose no more than ${MAX_FILES} reference images.`;
    const invalid = files.find((file) => !ALLOWED_TYPES.has(file.type) || !file.size || file.size > MAX_FILE_BYTES);
    return invalid ? `${invalid.name || 'One image'} must be PNG, JPG, or WebP and no larger than 6 MB.` : '';
  }

  async function submitCustomOrder(form) {
    const files = [...form.elements.referenceImages.files];
    const discussed = orderMode(form) === 'discussed';
    const fileError = validateFiles(files, { required: !discussed });
    const height = desiredHeight(form);
    if (fileError) throw new Error(fileError);
    if (!height || height < 24 || height > 120) throw new Error('Enter a desired height between 24 and 120 inches.');
    if (discussed) {
      const agreedPrice = Number(form.elements.agreedPrice.value);
      const tipAmount = Number(form.elements.tipAmount.value || 0);
      if (!Number.isFinite(agreedPrice) || agreedPrice < 1 || agreedPrice > 20000) throw new Error('Enter the complete price agreed with MVPLUXCREATIONS.');
      if (!Number.isFinite(tipAmount) || tipAmount < 0 || tipAmount > 5000) throw new Error('Enter a valid optional extra amount.');
      if (!form.elements.agreedPriceConfirmed.checked) throw new Error('Confirm that you entered the complete agreed price.');
    }

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

  function updateMode(form) {
    const discussed = orderMode(form) === 'discussed';
    const paymentFields = form.querySelector('[data-discussed-payment]');
    const imageHelp = form.querySelector('[data-custom-image-help]');
    form.elements.referenceImages.required = !discussed;
    form.elements.agreedPrice.required = discussed;
    form.elements.agreedPriceConfirmed.required = discussed;
    if (paymentFields) paymentFields.hidden = !discussed;
    if (imageHelp) imageHelp.textContent = discussed
      ? 'Optional when MVPLUXCREATIONS already has your references. PNG, JPG, or WebP; up to 5 images, 6 MB each.'
      : 'Required for a new request. PNG, JPG, or WebP; up to 5 images, 6 MB each.';
    const button = document.getElementById('customOrderSubmit');
    if (button) button.textContent = discussed ? 'Submit Request & Continue to Payment' : 'Send Custom Order Request';
    updatePaymentTotal(form);
  }

  function updatePaymentTotal(form) {
    const output = document.getElementById('customOrderPaymentTotal');
    if (!output) return;
    const agreed = Math.max(0, Number(form.elements.agreedPrice.value) || 0);
    const tip = Math.max(0, Number(form.elements.tipAmount.value) || 0);
    output.textContent = formatMoney(agreed + tip);
  }

  function showPaymentActions(result) {
    const panel = document.getElementById('customOrderPaymentActions');
    const reference = document.getElementById('customOrderPaymentReference');
    if (!panel || !result?.paymentRequired) return;
    panel.hidden = false;
    panel.dataset.orderNumber = result.orderNumber;
    panel.dataset.paymentTotal = String(result.paymentTotal || 0);
    if (reference) reference.textContent = `${result.orderNumber} · Total ${formatMoney(result.paymentTotal)}`;
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function renderPaymentMethods() {
    const mount = document.querySelector('[data-custom-order-payment-methods]');
    if (!mount) return;
    const methods = window.getMvpluxCheckoutPaymentMethods?.() || {};
    mount.innerHTML = Object.entries(methods)
      .filter(([, method]) => method.active)
      .map(([key, method]) => `<button type="button" data-custom-payment-method="${key.replace(/[^a-z0-9_-]/gi, '')}">${String(method.buttonLabel || method.label || key).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))}</button>`)
      .join('');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('customOrderForm');
    if (!form) return;
    form.elements.desiredHeight.addEventListener('input', () => updatePrice(form));
    form.querySelectorAll('[name="orderMode"]').forEach((input) => input.addEventListener('change', () => updateMode(form)));
    form.elements.agreedPrice.addEventListener('input', () => updatePaymentTotal(form));
    form.elements.tipAmount.addEventListener('input', () => updatePaymentTotal(form));
    form.elements.referenceImages.addEventListener('change', () => {
      const error = validateFiles([...form.elements.referenceImages.files], { required: orderMode(form) !== 'discussed' });
      status(error || `${form.elements.referenceImages.files.length} reference image${form.elements.referenceImages.files.length === 1 ? '' : 's'} selected.`, error ? 'error' : 'ready');
    });
    renderPaymentMethods();
    window.addEventListener('mvplux:published-settings-ready', renderPaymentMethods);
    document.querySelector('[data-custom-order-payment-methods]')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-custom-payment-method]');
      if (!button) return;
      const panel = document.getElementById('customOrderPaymentActions');
      window.openMvpluxCustomOrderPayment?.({
        method: button.dataset.customPaymentMethod,
        orderNumber: panel?.dataset.orderNumber || '',
        total: Number(panel?.dataset.paymentTotal || 0)
      });
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = document.getElementById('customOrderSubmit');
      const discussed = orderMode(form) === 'discussed';
      button.disabled = true;
      button.textContent = 'Uploading references…';
      status(filesForStatus(form, discussed), 'saving');
      try {
        const result = await submitCustomOrder(form);
        status(result.paymentRequired
          ? `Request received. ${result.orderNumber} is waiting for payment and Admin verification.`
          : `Request received. Your reference number is ${result.orderNumber}.`, 'success');
        showPaymentActions(result);
        form.reset();
        updatePrice(form);
        updateMode(form);
      } catch (error) {
        status(error?.message || 'The custom order request could not be sent.', 'error');
      } finally {
        button.disabled = false;
        button.textContent = orderMode(form) === 'discussed' ? 'Submit Request & Continue to Payment' : 'Send Custom Order Request';
      }
    });
    updatePrice(form);
    updateMode(form);
  });

  function filesForStatus(form, discussed) {
    const count = form.elements.referenceImages.files.length;
    if (!count && discussed) return 'Creating your request and preparing payment instructions…';
    return 'Uploading your private reference images and creating the request…';
  }
})();
