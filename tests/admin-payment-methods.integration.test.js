const assert = (condition, message) => { if (!condition) throw new Error(message); };

const storefrontSource = await Deno.readTextFile(new URL('../script.js', import.meta.url));
const adminSource = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
const adminHtml = await Deno.readTextFile(new URL('../admin.html', import.meta.url));
const customOrderHtml = await Deno.readTextFile(new URL('../custom-order.html', import.meta.url));
const customOrderSource = await Deno.readTextFile(new URL('../custom-order.js', import.meta.url));

function sourceRange(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert(start >= 0 && end > start, `missing source range ${startToken}`);
  return source.slice(start, end);
}

Deno.test('manual payment methods use published live settings while cards remain a future disabled integration', () => {
  const code = sourceRange(storefrontSource, 'const defaultCheckoutPaymentMethods', '/* ---------------- CART ---------------- */');
  const window = {};
  const settings = {
    paymentMethods: {
      invoice: {
        label: 'Secure Invoice', buttonLabel: 'Open Invoice', payUrl: 'https://payments.example.test/invoice',
        instructions: 'Use your order number.', active: true, preferred: true, order: 1
      },
      stripe: { label: 'Card', payUrl: 'https://unsafe-card-form.example.test', active: true, order: 2 }
    }
  };
  const runtime = new Function('window', 'structuredClone', 'getAdminGlobalDisplaySettings', `${code}; return { checkoutPaymentMethods, resolvedCheckoutPaymentMethod };`)(
    window, structuredClone, () => settings
  );
  const methods = runtime.checkoutPaymentMethods();
  assert(methods.invoice.active && methods.invoice.payUrl === 'https://payments.example.test/invoice', 'published manual method must become available without a code deployment');
  assert(methods.stripe.active === false && methods.stripe.futureCardIntegration === true, 'card payments must remain disabled until a secure processor is implemented');
  assert(runtime.resolvedCheckoutPaymentMethod('missing').key === 'invoice', 'checkout must fall back to the enabled preferred manual method');
});

Deno.test('unsafe payment links are not exposed and manual instructions remain supported', () => {
  const code = sourceRange(storefrontSource, 'const defaultCheckoutPaymentMethods', '/* ---------------- CART ---------------- */');
  const window = {};
  const runtime = new Function('window', 'structuredClone', 'getAdminGlobalDisplaySettings', `${code}; return checkoutPaymentMethods;`)(
    window, structuredClone, () => ({ paymentMethods: { invoice: { label: 'Invoice', payUrl: 'javascript:alert(1)', instructions: 'Contact orders.', active: true } } })
  );
  const method = runtime().invoice;
  assert(method.payUrl === '', 'non-HTTPS payment links must be discarded');
  assert(method.instructions === 'Contact orders.' && method.active, 'a manual method may provide instructions without collecting payment credentials');
});

Deno.test('Admin payment editor uses the existing draft and Fast Live publication paths', () => {
  assert(adminHtml.includes('id="admin-payment-methods"') && adminHtml.includes('Customer Payment Methods'), 'Settings must expose the payment-method editor');
  assert(adminHtml.includes('id="adminPaymentMethodsPreview"') && adminSource.includes('renderAdminPaymentMethodsPreview'), 'Admin must show an immediate customer-facing preview while payment settings are edited');
  assert(adminHtml.includes('Credit/debit cards, Apple Pay, and Google Pay are future integrations'), 'Admin must clearly identify cards as future work');
  const save = sourceRange(adminSource, 'async function saveAdminPaymentMethods', 'function setupAdminPaymentMethods');
  assert(save.includes("collectionKey: 'globalDisplaySettings'") && save.includes("entryKey: 'paymentMethods'"), 'manual payment settings must reuse the existing normalized global settings record');
  assert(save.includes("saveLiveChangeIds(['paymentMethods:all']"), 'Save Live must use the existing authoritative Fast Live controller');
  assert(adminSource.includes("id: 'paymentMethods:all'") && adminSource.includes("type: 'payment-methods'"), 'payment settings must participate in Save All Live Changes');
  assert(adminSource.includes("if (item.type === 'payment-methods')") && adminSource.includes('paymentMethods: structuredClone'), 'the selected live snapshot must carry only the saved payment settings into the public snapshot');
});

Deno.test('custom orders render the same active payment methods instead of a second hard-coded list', () => {
  assert(customOrderHtml.includes('data-custom-order-payment-methods') && !customOrderHtml.includes('data-custom-payment-method="paypal"'), 'Custom Orders must provide one dynamic payment mount rather than duplicate hard-coded options');
  assert(customOrderSource.includes('window.getMvpluxCheckoutPaymentMethods?.()') && customOrderSource.includes("mvplux:published-settings-ready"), 'Custom Orders must render the same published payment settings used by checkout');
  assert(storefrontSource.includes('window.getMvpluxCheckoutPaymentMethods'), 'storefront must expose one read-only payment-method resolver to related customer workflows');
});
