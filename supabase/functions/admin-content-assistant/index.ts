import { callSelectedProvider } from './ai-providers.ts';

const allowedOrigins = new Set([
  'https://mvpluxcreations.com',
  'https://www.mvpluxcreations.com',
  'http://localhost:3000',
  'http://localhost:4173'
]);

const recentRequests = new Map<string, number[]>();

function headers(request: Request) {
  const origin = request.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://mvpluxcreations.com',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin'
  };
}

function json(request: Request, value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...headers(request), 'Content-Type': 'application/json' } });
}

function required(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Server configuration is missing ${name}.`);
  return value;
}

async function requireAdmin(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw new Error('Admin sign-in is required.');
  const url = required('SUPABASE_URL');
  const key = required('SUPABASE_ANON_KEY');
  const userResponse = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: authorization, apikey: key } });
  const user = await userResponse.json().catch(() => ({}));
  if (!userResponse.ok || !user?.id) throw new Error('Admin session is invalid or expired.');
  const adminResponse = await fetch(`${url}/rest/v1/admin_profiles?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`, {
    headers: { Authorization: authorization, apikey: key }
  });
  const admins = await adminResponse.json().catch(() => []);
  if (!adminResponse.ok || !Array.isArray(admins) || !admins.length) throw new Error('Admin access is required.');
  const now = Date.now();
  const active = (recentRequests.get(user.id) || []).filter((time) => now - time < 60_000);
  if (active.length >= 10) throw new Error('AI suggestion limit reached. Wait one minute and try again.');
  recentRequests.set(user.id, [...active, now]);
  return user.id as string;
}

function cleanText(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed.' }, 405);
  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 20_000) return json(request, { error: 'The AI request is too large.' }, 413);
    const userId = await requireAdmin(request);
    const rawBody = await request.text();
    if (rawBody.length > 20_000) return json(request, { error: 'The AI request is too large.' }, 413);
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (_error) {
      return json(request, { error: 'The AI request could not be read.' }, 400);
    }
    const action = cleanText(body?.action, 30);
    if (!['title', 'description', 'funFact', 'improve'].includes(action)) return json(request, { error: 'Unsupported suggestion action.' }, 400);
    const imagePath = cleanText(body?.imagePath, 500);
    if (imagePath && (!/^images\/[A-Za-z0-9_./ '\-]+\.(?:png|jpe?g|webp|gif)$/i.test(imagePath) || imagePath.includes('..'))) {
      return json(request, { error: 'The selected image path is invalid.' }, 400);
    }
    const context = body?.context && typeof body.context === 'object' ? body.context : {};
    const identity = cleanText(body?.identity, 200);
    const category = cleanText(body?.category, 300);
    const currentTitle = cleanText(context.title, 160);
    const currentDescription = cleanText(context.description, 800);
    const currentFunFact = cleanText(context.funFact, 400);
    if (!identity && !imagePath && !category && !currentTitle && !currentDescription && !currentFunFact) {
      return json(request, { error: 'Choose an image or enter some product information first.' }, 400);
    }
    const prompt = [
      'Create concise customer-facing content for a custom cardboard standee store.',
      'Return only valid JSON with keys title, description, and funFact.',
      `Requested action: ${action}.`,
      `Authoritative identity/context supplied by the Admin: ${identity || 'not supplied'}.`,
      `Category context: ${category || 'not selected'}.`,
      `Current title: ${currentTitle || 'blank'}.`,
      `Current description: ${currentDescription || 'blank'}.`,
      `Current fun fact: ${currentFunFact || 'blank'}.`,
      'For title requests, provide a concise customer-friendly title.',
      'For description requests, describe only details supported by the supplied context or visible image.',
      'For fun facts, do not invent a fact. If the subject cannot be identified reliably, explain briefly that more information is needed.',
      'For improve requests, preserve the meaning and useful details of the existing text.',
      'When the Admin supplies identity/context, treat it as authoritative. Never replace, contradict, or override it based on the image.',
      'Use the selected image only for additional visible details that are consistent with the Admin-supplied identity/context.',
      'Do not make claims about licensing, availability, materials, price, or exact identity that are not provided.',
      'Do not describe the item as official merchandise.',
      'Keep title under 70 characters, description under 300 characters, and fun fact under 180 characters.'
    ].join('\n');
    const origin = (Deno.env.get('PUBLIC_SITE_ORIGIN') || 'https://mvpluxcreations.com').replace(/\/$/, '');
    const imageUrl = imagePath ? `${origin}/${imagePath.split('/').map(encodeURIComponent).join('/')}` : '';
    const raw = (await callSelectedProvider({ prompt, imageUrl, userId })).replace(/^```json\s*|\s*```$/g, '').trim();
    const suggestion = JSON.parse(raw);
    return json(request, {
      title: cleanText(suggestion.title, 70),
      description: cleanText(suggestion.description, 300),
      funFact: cleanText(suggestion.funFact, 180)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /sign-in|session/i.test(message) ? 401 : /access/i.test(message) ? 403 : /limit/i.test(message) ? 429 : /not configured|configuration/i.test(message) ? 503 : 500;
    const safeMessage = /API[_ -]?KEY|Bearer |token/i.test(message) ? 'AI service configuration failed.' : message;
    return json(request, { error: safeMessage }, status);
  }
});
