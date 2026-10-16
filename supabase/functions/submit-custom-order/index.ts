const allowedOrigins = new Set([
  'https://mvpluxcreations.com',
  'https://www.mvpluxcreations.com',
  'http://localhost:3000',
  'http://localhost:4173'
]);
const bucket = 'custom-order-references';
const recentRequests = new Map<string, number[]>();
const allowedTypes = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp']
]);

function responseHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://mvpluxcreations.com',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin'
  };
}

function json(request: Request, value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...responseHeaders(request), 'Content-Type': 'application/json' } });
}

function required(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error('The secure order service is not configured.');
  return value;
}

function clean(value: FormDataEntryValue | null, maximum: number) {
  return String(value || '').trim().slice(0, maximum);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] || character);
}

async function sendTransactionalEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim();
  const from = Deno.env.get('CUSTOM_ORDER_FROM_EMAIL')?.trim();
  if (!apiKey || !from) return { configured: false, sent: false };
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to: [to], subject, html })
    });
    return { configured: true, sent: response.ok };
  } catch {
    return { configured: true, sent: false };
  }
}

async function sendCustomOrderNotifications(input: {
  name: string;
  email: string;
  phone: string;
  description: string;
  contactPreference: string;
  desiredHeight: number;
  orderNumber: string;
  referenceCount: number;
  alreadyDiscussed: boolean;
  paymentTotal: number;
  fulfillmentType: 'physical' | 'digital';
}) {
  const adminEmail = Deno.env.get('CUSTOM_ORDER_ADMIN_EMAIL')?.trim();
  const safeOrder = escapeHtml(input.orderNumber);
  const safeName = escapeHtml(input.name);
  const customer = sendTransactionalEmail({
    to: input.email,
    subject: `We received your MVPLUXCREATIONS custom request — ${input.orderNumber}`,
    html: `<h1>Custom Order request received</h1><p>Hi ${safeName},</p><p>Your request was saved securely. Your reference number is <strong>${safeOrder}</strong>.</p><p>Request type: ${input.fulfillmentType === 'digital' ? 'Digital design file — no shipping' : 'Physical standee — free shipping is U.S.-only'}.</p><p>Requested height: ${escapeHtml(input.desiredHeight)} inches.</p><p>${input.alreadyDiscussed ? `Your submitted payment total is $${input.paymentTotal.toFixed(2)} and will be verified by an Admin before production begins.` : 'We will review the details and contact you about the design and quote.'}</p><p>Keep this reference number for your records.</p>`
  });
  const admin = adminEmail && validEmail(adminEmail)
    ? sendTransactionalEmail({
      to: adminEmail,
      subject: `New Custom Order request — ${input.orderNumber}`,
      html: `<h1>New Custom Order request</h1><p><strong>Reference:</strong> ${safeOrder}</p><p><strong>Customer:</strong> ${safeName}<br><strong>Email:</strong> ${escapeHtml(input.email)}<br><strong>Phone:</strong> ${escapeHtml(input.phone || 'Not provided')}<br><strong>Preferred contact:</strong> ${escapeHtml(input.contactPreference)}</p><p><strong>Request type:</strong> ${input.fulfillmentType === 'digital' ? 'Digital design file — no shipping' : 'Physical standee — free shipping is U.S.-only'}<br><strong>Desired height:</strong> ${escapeHtml(input.desiredHeight)} inches<br><strong>Private reference images:</strong> ${escapeHtml(input.referenceCount)}</p><p><strong>Description:</strong><br>${escapeHtml(input.description).replaceAll('\n', '<br>')}</p><p><a href="https://mvpluxcreations.com/admin.html#custom-order-requests">Open the private Custom Order Requests page</a></p>`
    })
    : Promise.resolve({ configured: false, sent: false });
  const [customerResult, adminResult] = await Promise.all([customer, admin]);
  return {
    configured: customerResult.configured && adminResult.configured,
    customer: customerResult.sent,
    admin: adminResult.sent
  };
}

async function sendCustomOrderFailureAlert(input: {
  name: string;
  email: string;
  phone: string;
  description: string;
  desiredHeight: number;
  error: string;
}) {
  const adminEmail = Deno.env.get('CUSTOM_ORDER_ADMIN_EMAIL')?.trim();
  if (!adminEmail || !validEmail(adminEmail)) return false;
  const result = await sendTransactionalEmail({
    to: adminEmail,
    subject: 'Custom Order submission failed — customer follow-up needed',
    html: `<h1>Custom Order submission was not saved</h1><p>The customer saw a failure notice. This is an alert, not a saved order.</p><p><strong>Customer:</strong> ${escapeHtml(input.name)}<br><strong>Email:</strong> ${escapeHtml(input.email)}<br><strong>Phone:</strong> ${escapeHtml(input.phone || 'Not provided')}<br><strong>Desired height:</strong> ${escapeHtml(input.desiredHeight)} inches</p><p><strong>Description:</strong><br>${escapeHtml(input.description).replaceAll('\n', '<br>')}</p><p><strong>Failure:</strong> ${escapeHtml(input.error)}</p>`
  });
  return result.sent;
}

function requestKey(request: Request, email: string) {
  return `${request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'}:${email.toLowerCase()}`;
}

function rateLimit(key: string) {
  const now = Date.now();
  const active = (recentRequests.get(key) || []).filter((time) => now - time < 60 * 60 * 1000);
  if (active.length >= 5) throw new Error('Too many custom-order requests. Please wait before trying again.');
  recentRequests.set(key, [...active, now]);
}

async function uploadReference(file: File, path: string, url: string, serviceKey: string) {
  const response = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': file.type,
      'x-upsert': 'false'
    },
    body: file
  });
  if (!response.ok) throw new Error('A reference image could not be stored securely.');
}

async function removeReferences(paths: string[], url: string, serviceKey: string) {
  if (!paths.length) return;
  await fetch(`${url}/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: paths })
  }).catch(() => {});
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: responseHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed.' }, 405);
  const origin = request.headers.get('origin') || '';
  if (!allowedOrigins.has(origin)) return json(request, { error: 'This website origin is not allowed.' }, 403);

  const uploaded: string[] = [];
  let storageUrl = '';
  let storageServiceKey = '';
  let failureContext: Parameters<typeof sendCustomOrderFailureAlert>[0] | null = null;
  try {
    const declaredSize = Number(request.headers.get('content-length') || 0);
    if (declaredSize > 31_000_000) return json(request, { error: 'The custom-order request is too large.' }, 413);
    const form = await request.formData();
    const name = clean(form.get('name'), 120);
    const submittedEmail = clean(form.get('email'), 200).toLowerCase();
    const phone = clean(form.get('phone'), 40);
    const description = clean(form.get('description'), 3000);
    const contactPreference = clean(form.get('contactPreference'), 20) || 'email';
    const fulfillmentType = clean(form.get('fulfillmentType'), 20) === 'digital' ? 'digital' : 'physical';
    const desiredHeight = Number(clean(form.get('desiredHeight'), 6));
    const orderMode = clean(form.get('orderMode'), 20) === 'discussed' ? 'discussed' : 'new';
    const alreadyDiscussed = orderMode === 'discussed';
    const agreedPrice = alreadyDiscussed ? Number(clean(form.get('agreedPrice'), 20)) : 0;
    const tipAmount = alreadyDiscussed ? Number(clean(form.get('tipAmount'), 20) || 0) : 0;
    const agreedPriceConfirmed = clean(form.get('agreedPriceConfirmed'), 10) === 'on';
    const files = form.getAll('referenceImages').filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (!name || !validEmail(submittedEmail) || !description) return json(request, { error: 'Name, a valid email, and a design description are required.' }, 400);
    if (!Number.isFinite(desiredHeight) || desiredHeight < 24 || desiredHeight > 120) return json(request, { error: 'Desired height must be between 24 and 120 inches.' }, 400);
    if ((!alreadyDiscussed && !files.length) || files.length > 5) return json(request, { error: 'Choose between one and five reference images for a new request.' }, 400);
    if (alreadyDiscussed && (!Number.isFinite(agreedPrice) || agreedPrice < 1 || agreedPrice > 20000)) return json(request, { error: 'Enter the complete price agreed with MVPLUXCREATIONS.' }, 400);
    if (alreadyDiscussed && (!Number.isFinite(tipAmount) || tipAmount < 0 || tipAmount > 5000)) return json(request, { error: 'Enter a valid optional extra amount.' }, 400);
    if (alreadyDiscussed && !agreedPriceConfirmed) return json(request, { error: 'Confirm that the complete agreed price was entered.' }, 400);
    for (const file of files) {
      if (!allowedTypes.has(file.type) || file.size > 6_000_000) return json(request, { error: 'Each reference must be PNG, JPG, or WebP and no larger than 6 MB.' }, 400);
    }
    const url = required('SUPABASE_URL').replace(/\/$/, '');
    const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.toLowerCase().startsWith('bearer ')) return json(request, { error: 'Sign in to submit a Custom Order request.' }, 401);
    const userResponse = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: authorization }
    });
    const user = userResponse.ok ? await userResponse.json() : null;
    const email = String(user?.email || '').trim().toLowerCase();
    if (!user?.id || !validEmail(email)) return json(request, { error: 'Your account session expired. Sign in again before submitting.' }, 401);
    rateLimit(requestKey(request, email));
    failureContext = { name, email, phone, description, desiredHeight, error: '' };
    storageUrl = url;
    storageServiceKey = serviceKey;
    const requestId = crypto.randomUUID();
    const orderNumber = `CUSTOM-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${requestId.slice(0, 8).toUpperCase()}`;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const path = `${new Date().getUTCFullYear()}/${requestId}/${String(index + 1).padStart(2, '0')}.${allowedTypes.get(file.type)}`;
      await uploadReference(file, path, url, serviceKey);
      uploaded.push(path);
    }

    const paymentTotal = alreadyDiscussed ? Number((agreedPrice + tipAmount).toFixed(2)) : 0;
    const item = {
      type: 'custom-order',
      name: alreadyDiscussed ? 'Pre-Discussed Custom Standee Order' : 'Custom Standee Design Request',
      product_slug: 'custom-order',
      selected_height: desiredHeight,
      price: paymentTotal,
      description,
      contact_preference: contactPreference,
      reference_images: uploaded,
      already_discussed: alreadyDiscussed,
      agreed_price: agreedPrice,
      optional_tip: tipAmount,
      payment_status: alreadyDiscussed ? 'awaiting_manual_verification' : 'quote_required',
      underpayment_fee_notice: alreadyDiscussed ? 20 : 0,
      fulfillment_type: fulfillmentType,
      requires_shipping: fulfillmentType === 'physical'
    };
    const insert = await fetch(`${url}/rest/v1/order_requests`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        customer_id: user.id,
        customer_name: name,
        customer_email: email,
        customer_phone: phone || null,
        items: [item],
        payment_method: alreadyDiscussed ? 'Customer chooses after request — manual verification required' : 'Quote required',
        original_amount: agreedPrice,
        subtotal: agreedPrice,
        customer_fee: 0,
        total: paymentTotal,
        status: 'new',
        notes: `Order number: ${orderNumber}\nFulfillment: ${fulfillmentType === 'digital' ? 'Digital design file — no shipping' : 'Physical standee — free shipping is U.S.-only'}\nCustom order mode: ${alreadyDiscussed ? 'Design and price already discussed' : 'New quote requested'}\nCustom design description: ${description}\nDesired height: ${desiredHeight} inches\nPreferred contact: ${contactPreference}${alreadyDiscussed ? `\nAgreed price: $${agreedPrice.toFixed(2)}\nOptional extra / tip: $${tipAmount.toFixed(2)}\nExpected payment total: $${paymentTotal.toFixed(2)}\nPayment must be manually verified before production. Underpayment does not begin production and may require an additional $20 processing fee.` : ''}`
      })
    });
    if (!insert.ok) {
      throw new Error('The request could not be recorded. No reference images were retained.');
    }
    const notifications = await sendCustomOrderNotifications({
      name,
      email,
      phone,
      description,
      contactPreference,
      desiredHeight,
      orderNumber,
      referenceCount: uploaded.length,
      alreadyDiscussed,
      paymentTotal,
      fulfillmentType
    });
    return json(request, {
      orderNumber,
      paymentRequired: alreadyDiscussed,
      agreedPrice,
      tipAmount,
      paymentTotal,
      notifications
    }, 201);
  } catch (error) {
    if (uploaded.length && storageUrl && storageServiceKey) await removeReferences(uploaded, storageUrl, storageServiceKey);
    const message = error instanceof Error ? error.message : 'The custom-order request could not be sent.';
    if (failureContext) {
      failureContext.error = message;
      await sendCustomOrderFailureAlert(failureContext);
    }
    const status = /too many/i.test(message) ? 429 : /not configured/i.test(message) ? 503 : 500;
    return json(request, { error: message }, status);
  }
});
