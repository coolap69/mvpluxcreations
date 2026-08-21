import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENAI_MODEL,
  callGemini,
  callOpenAI,
  callSelectedProvider,
  selectedAiProvider
} from '../supabase/functions/admin-content-assistant/ai-providers.ts';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const env = (values) => (name) => values[name];

Deno.test('Gemini is the default provider and uses the stable free-tier model default', () => {
  assert(selectedAiProvider(env({})) === 'gemini', 'Gemini must be the default provider');
  assert(DEFAULT_GEMINI_MODEL === 'gemini-2.5-flash', 'Gemini default model changed unexpectedly');
  assert(DEFAULT_OPENAI_MODEL === 'gpt-5.6-luna', 'OpenAI default model must remain intact');
});

Deno.test('Gemini sends exactly one provider request and parses structured suggestions', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"title":"Hero Standee","description":"A bold display for celebrations.","funFact":"Add a subject name for a verified fact."}' }] } }] });
  };
  const result = await callSelectedProvider({
    prompt: 'Suggest a title', userId: 'admin-1', env: env({ GEMINI_API_KEY: 'test-only-key' }), fetcher
  });
  assert(calls.length === 1, 'one click-equivalent call must make one AI provider request');
  assert(calls[0].url.includes(`/models/${DEFAULT_GEMINI_MODEL}:generateContent`), 'Gemini model endpoint is incorrect');
  const body = JSON.parse(calls[0].options.body);
  assert(body.contents[0].parts[0].text === 'Suggest a title', 'prompt must reach Gemini');
  assert(body.generationConfig.responseMimeType === 'application/json', 'Gemini must return structured JSON');
  assert(JSON.parse(result).title === 'Hero Standee', 'Gemini response must preserve the frontend response contract');
});

Deno.test('Gemini image understanding fetches one safe image and sends one AI request', async () => {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith('https://mvpluxcreations.com/images/')) {
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'content-type': 'image/png', 'content-length': '4' } });
    }
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"title":"Basketball Standee","description":"A basketball-themed display.","funFact":"More subject information is needed for a verified fact."}' }] } }] });
  };
  await callGemini({
    prompt: 'Use the image', imageUrl: 'https://mvpluxcreations.com/images/example.png', userId: 'admin-1',
    env: env({ GEMINI_API_KEY: 'test-only-key' }), fetcher
  });
  assert(calls.length === 2, 'image understanding should use one image fetch and one AI request');
  assert(calls.filter((call) => call.url.includes('generativelanguage.googleapis.com')).length === 1, 'only one Gemini request is allowed');
  const body = JSON.parse(calls[1].options.body);
  const image = body.contents[0].parts[0].inline_data;
  assert(image.mime_type === 'image/png' && image.data === 'iVBORw==', 'validated image bytes must be sent inline to Gemini');
});

Deno.test('unpublished image failure falls back to one text-only Gemini request', async () => {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith('https://mvpluxcreations.com/images/')) return new Response('Not found', { status: 404 });
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"title":"Text Context Title","description":"Based on the available information.","funFact":"More information is needed for a verified fact."}' }] } }] });
  };
  const result = await callGemini({
    prompt: 'Category context: Music Artists.', imageUrl: 'https://mvpluxcreations.com/images/new-local-image.png', userId: 'admin-1',
    env: env({ GEMINI_API_KEY: 'test-only-key' }), fetcher
  });
  assert(calls.length === 2, 'failed image loading must still make exactly one Gemini request');
  const body = JSON.parse(calls[1].options.body);
  assert(!body.contents[0].parts.some((part) => part.inline_data), 'unreachable images must not be sent as fake image content');
  assert(body.contents[0].parts.some((part) => String(part.text || '').includes('not publicly available')), 'Gemini must be told to avoid guessing visual details');
  assert(JSON.parse(result).title === 'Text Context Title', 'text generation must continue without the image');
});

Deno.test('OpenAI provider and image request remain available', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json({ output_text: '{"title":"OpenAI Title","description":"Description","funFact":"Fact"}' });
  };
  const result = await callSelectedProvider({
    prompt: 'Suggest text', imageUrl: 'https://mvpluxcreations.com/images/example.png', userId: 'admin-1',
    env: env({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'test-only-key' }), fetcher
  });
  assert(calls.length === 1 && calls[0].url === 'https://api.openai.com/v1/responses', 'OpenAI must retain its original Responses API path');
  const body = JSON.parse(calls[0].options.body);
  assert(body.model === DEFAULT_OPENAI_MODEL, 'OpenAI model default must remain intact');
  assert(body.input[0].content.some((part) => part.type === 'input_image'), 'OpenAI image analysis must remain intact');
  assert(JSON.parse(result).title === 'OpenAI Title', 'OpenAI response must preserve the frontend response contract');
});

Deno.test('provider selection and missing secrets fail closed without exposing a key', async () => {
  let invalidProvider = '';
  try { selectedAiProvider(env({ AI_PROVIDER: 'unknown' })); } catch (error) { invalidProvider = error.message; }
  assert(invalidProvider === 'AI provider configuration is invalid.', 'invalid providers must fail clearly');
  let missingSecret = '';
  try {
    await callGemini({ prompt: 'test', userId: 'admin-1', env: env({}), fetcher: () => { throw new Error('must not fetch'); } });
  } catch (error) { missingSecret = error.message; }
  assert(missingSecret === 'AI service is not configured.', 'missing secrets must fail without naming or exposing the secret');
});

Deno.test('function prompt covers all four actions and safe content rules', async () => {
  const source = await Deno.readTextFile(new URL('../supabase/functions/admin-content-assistant/index.ts', import.meta.url));
  for (const action of ['title', 'description', 'funFact', 'improve']) assert(source.includes(`'${action}'`), `missing ${action} action`);
  assert(source.includes('Do not describe the item as official merchandise.'), 'official-merchandise claims must be prohibited');
  assert(source.includes('do not invent a fact'), 'fun facts must not be invented');
  assert(source.includes('preserve the meaning'), 'Improve Existing Text must preserve meaning');
  assert(source.includes('Authoritative identity/context supplied by the Admin'), 'prompt must include the Admin-supplied identity');
  assert(source.includes('Never replace, contradict, or override it based on the image.'), 'image analysis must not override Admin-supplied identity');
  assert(source.includes('Choose an image or enter some product information first.'), 'missing input must return a clear error');
});
