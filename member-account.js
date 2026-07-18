function memberAccountClient() {
  return window.getMvpluxSupabaseClient?.() || null;
}

function memberEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function memberMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : 'Not recorded';
}

function memberDate(value) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function memberOfferDetails(message) {
  const details = {};
  String(message || '').split('\n').forEach((line) => {
    const separator = line.indexOf(':');
    if (separator < 0) return;
    details[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
  });
  return details;
}

function memberTimelineMarkup(history, offer) {
  const events = history.length ? history : [{
    event_type: 'customer_offer',
    sender_type: offer.customer_id ? 'member' : 'guest',
    amount: offer.amount,
    message: memberOfferDetails(offer.message).message || '',
    created_at: offer.created_at
  }];
  return `
    <ol class="member-offer-timeline">
      ${events.map((event) => `
        <li>
          <strong>${memberEscape(String(event.event_type || event.message_type || 'update').replace(/_/g, ' '))}</strong>
          <span>${memberEscape(event.sender_type || 'system')} · ${memberDate(event.created_at)}</span>
          ${event.amount != null ? `<b>${memberMoney(event.amount)}</b>` : ''}
          ${event.message ? `<p>${memberEscape(event.message)}</p>` : ''}
        </li>
      `).join('')}
    </ol>
  `;
}

function memberOfferMarkup(offer, history) {
  const details = memberOfferDetails(offer.message);
  const status = String(offer.status || 'pending');
  const awaitingResponse = status === 'countered';
  const awaitingPayment = ['accepted', 'accepted_awaiting_payment'].includes(status);
  const paymentSubmitted = status === 'payment_submitted';
  const statusLabels = {
    pending: 'Pending review',
    countered: 'Admin counteroffer — your response is needed',
    buyer_countered: 'Your counteroffer is awaiting Admin’s final decision',
    accepted: 'Accepted / awaiting payment',
    accepted_awaiting_payment: 'Accepted / awaiting payment',
    payment_submitted: 'Payment submitted / awaiting confirmation',
    paid: 'Completed / paid',
    declined: 'Declined',
    archived: 'Archived'
  };
  return `
    <article class="member-offer-card" data-member-offer="${memberEscape(offer.id)}">
      <div class="member-offer-head">
        <h3>${memberEscape(offer.product_name || 'Selected standee')}</h3>
        <span>${offer.is_test ? '<b class="test-record-badge">TEST</b> ' : ''}${memberEscape(statusLabels[status] || status.replace(/_/g, ' '))}</span>
      </div>
      <dl class="member-offer-details">
        <div><dt>Design</dt><dd>${memberEscape(details.design || 'Not recorded')}</dd></div>
        <div><dt>Description</dt><dd>${memberEscape(details.description || 'Not recorded')}</dd></div>
        <div><dt>Selected size</dt><dd>${memberEscape(details['selected size'] || 'Not recorded')}</dd></div>
        <div><dt>Original height</dt><dd>${memberEscape(details['original height'] || 'Not recorded')}</dd></div>
        <div><dt>Background/display</dt><dd>${memberEscape(details.background || 'Not recorded')}</dd></div>
        <div><dt>Asking price</dt><dd>${memberEscape(details['asking price'] || 'Not recorded')}</dd></div>
        <div><dt>Your original offer</dt><dd>${memberMoney(offer.amount)}</dd></div>
        <div><dt>Admin counteroffer</dt><dd>${memberMoney(offer.seller_counter_amount)}</dd></div>
        <div><dt>Your latest counteroffer</dt><dd>${memberMoney(offer.buyer_final_amount)}</dd></div>
        <div><dt>Created</dt><dd>${memberDate(offer.created_at)}</dd></div>
        <div><dt>Last updated</dt><dd>${memberDate(offer.updated_at || offer.created_at)}</dd></div>
      </dl>
      ${awaitingPayment ? `
        <div class="member-accepted-offer">
          ${details.image ? `<img src="${memberEscape(details.image)}" alt="${memberEscape(offer.product_name || 'Selected product')} preview">` : ''}
          <div>
            <strong>Offer accepted</strong>
            <p>Your offer has been accepted. Complete payment to confirm your order.</p>
            <p>${memberEscape(offer.product_name || 'Selected product')} · ${memberEscape(details['selected size'] || 'Original size')} · ${memberMoney(offer.buyer_final_amount || offer.seller_counter_amount || offer.amount)}</p>
            <a class="checkout-btn" href="index.html?resumeOffer=${encodeURIComponent(offer.id)}">Continue to Payment</a>
          </div>
        </div>
      ` : ''}
      ${paymentSubmitted ? '<p class="member-payment-status"><strong>Payment submitted — awaiting Admin confirmation.</strong></p>' : ''}
      ${awaitingResponse ? `
        <div class="member-offer-actions">
          <button type="button" data-member-offer-action="accept">Accept Counteroffer</button>
          <button type="button" data-member-offer-action="decline">Decline</button>
          <button type="button" data-member-offer-action="show-counter">Send Another Counteroffer</button>
        </div>
        <div class="member-counter-form" hidden>
          <label>Counteroffer amount<input type="text" inputmode="decimal" data-member-counter-amount></label>
          <label>Comment (optional)<textarea data-member-counter-message></textarea></label>
          <button type="button" data-member-offer-action="counter">Send Counteroffer</button>
        </div>
      ` : ''}
      <h4>Offer Messages & History</h4>
      ${memberTimelineMarkup(history, offer)}
    </article>
  `;
}

async function loadMemberAccount() {
  const client = memberAccountClient();
  const status = document.getElementById('memberAccountStatus');
  const content = document.getElementById('memberAccountContent');
  if (!client?.auth) {
    status.innerHTML = 'Account service unavailable. <a href="signin.html">Return to Sign In</a>.';
    return;
  }

  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  const user = sessionData?.session?.user;
  if (sessionError || !user) {
    status.innerHTML = 'Sign in to view your private account. <a href="signin.html">Sign In</a>';
    return;
  }

  const testModeResponse = await client.rpc('get_admin_test_mode');
  if (!testModeResponse.error && testModeResponse.data?.enabled && !document.getElementById('memberTestModeWarning')) {
    document.body.insertAdjacentHTML('afterbegin', '<div id="memberTestModeWarning" class="admin-test-mode-warning storefront-test-warning">TEST MODE — No real payment will be requested, sent, captured, or recorded.</div>');
  }

  const [offersResponse, ordersResponse, discountsResponse] = await Promise.all([
    client.from('offers').select('*').order('created_at', { ascending: false }),
    client.from('order_requests').select('*').order('created_at', { ascending: false }),
    client.rpc('list_eligible_discounts')
  ]);
  if (offersResponse.error || ordersResponse.error) {
    status.textContent = offersResponse.error?.message || ordersResponse.error?.message || 'Could not load your account.';
    return;
  }

  const offers = offersResponse.data || [];
  let history = [];
  let historyError = null;
  if (offers.length) {
    const response = await client
      .from('offer_messages')
      .select('*')
      .in('offer_id', offers.map((offer) => offer.id))
      .order('created_at', { ascending: true });
    history = response.data || [];
    historyError = response.error;
  }

  const historyByOffer = new Map();
  history.forEach((event) => {
    if (!historyByOffer.has(event.offer_id)) historyByOffer.set(event.offer_id, []);
    historyByOffer.get(event.offer_id).push(event);
  });

  const activeStatuses = new Set(['pending', 'countered', 'buyer_countered', 'accepted', 'accepted_awaiting_payment', 'payment_pending', 'payment_submitted']);
  const activeOffers = offers.filter((offer) => activeStatuses.has(String(offer.status || 'pending')));
  const pastOffers = offers.filter((offer) => !activeStatuses.has(String(offer.status || 'pending')));
  document.getElementById('memberActiveOffersList').innerHTML = activeOffers.length
    ? activeOffers.map((offer) => memberOfferMarkup(offer, historyByOffer.get(offer.id) || [])).join('')
    : '<p>No active offers.</p>';
  document.getElementById('memberPastOffersList').innerHTML = pastOffers.length
    ? pastOffers.map((offer) => memberOfferMarkup(offer, historyByOffer.get(offer.id) || [])).join('')
    : '<p>No past offers.</p>';
  document.getElementById('memberOrdersList').innerHTML = ordersResponse.data?.length
    ? ordersResponse.data.map((order) => `<article class="member-order-card"><strong>${order.is_test ? '<b class="test-record-badge">TEST</b> ' : ''}${memberEscape(order.status || 'new')}</strong><span>${memberMoney(order.total)} · ${memberDate(order.created_at)}</span></article>`).join('')
    : '<p>No orders yet.</p>';
  const discountList = document.getElementById('memberDiscountsList');
  if (discountList) {
    discountList.innerHTML = discountsResponse.error
      ? '<p>Discounts become available after the secure discount-code database migration is applied.</p>'
      : discountsResponse.data?.length
      ? discountsResponse.data.map((discount) => `<article class="member-order-card"><strong>${memberEscape(discount.code)}</strong><span>${memberEscape(discount.description || '')} · ${discount.discount_type === 'fixed' ? memberMoney(discount.discount_value) : `${Number(discount.discount_value)}%`} off</span></article>`).join('')
      : '<p>No member discounts are currently available.</p>';
  }
  document.getElementById('memberProfileSummary').textContent = user.user_metadata?.screen_name
    ? `${user.user_metadata.screen_name} · ${user.email || ''}`
    : user.email || 'Signed-in member';
  status.textContent = historyError
    ? 'Account loaded. Offer history becomes available after the offer-history database migration is applied.'
    : 'Your private account is up to date.';
  content.hidden = false;
}

async function handleMemberOfferAction(event) {
  const button = event.target.closest?.('[data-member-offer-action]');
  const card = button?.closest?.('[data-member-offer]');
  if (!button || !card) return;
  const action = button.dataset.memberOfferAction;
  if (action === 'show-counter') {
    const form = card.querySelector('.member-counter-form');
    if (form) form.hidden = !form.hidden;
    return;
  }

  let amount = null;
  let message = '';
  if (action === 'counter') {
    amount = Number(String(card.querySelector('[data-member-counter-amount]')?.value || '').replace(/[^0-9.]/g, ''));
    message = card.querySelector('[data-member-counter-message]')?.value?.trim() || '';
    if (!Number.isFinite(amount) || amount <= 0) {
      document.getElementById('memberAccountStatus').textContent = 'Enter a valid counteroffer amount.';
      return;
    }
  } else if (!window.confirm(`${action === 'accept' ? 'Accept' : 'Decline'} this counteroffer?`)) {
    return;
  }

  button.disabled = true;
  const client = memberAccountClient();
  const { error } = await client.rpc('respond_to_member_offer', {
    p_offer_id: card.dataset.memberOffer,
    p_action: action,
    p_amount: amount,
    p_message: message || null
  });
  if (error) {
    button.disabled = false;
    document.getElementById('memberAccountStatus').textContent = error.message || 'Could not update the offer.';
    return;
  }
  await loadMemberAccount();
}

async function signOutMemberAccount() {
  const client = memberAccountClient();
  await client?.auth?.signOut();
  window.location.assign('signin.html');
}

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', handleMemberOfferAction);
  document.getElementById('accountSignOut')?.addEventListener('click', signOutMemberAccount);
  loadMemberAccount();
});
