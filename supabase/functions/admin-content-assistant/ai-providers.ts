export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const DEFAULT_OPENAI_MODEL = 'gpt-5.6-luna';

type FetchLike = typeof fetch;
type EnvReader = (name: string) => string | undefined;

export type ProviderRequest = {
  prompt: string;
  imageUrl?: string;
  userId: string;
  env?: EnvReader;
  fetcher?: FetchLike;
};

function envValue(env: EnvReader, name: string) {
  return String(env(name) || '').trim();
}

function configuredSecret(env: EnvReader, name: string) {
  const value = envValue(env, name);
  if (!value) throw new Error('AI service is not configured.');
  return value;
}

function configuredModel(env: EnvReader, name: string, fallback: string) {
  const model = envValue(env, name) || fallback;
  if (!/^[A-Za-z0-9._-]+$/.test(model)) throw new Error('AI model configuration is invalid.');
  return model;
}

function timeoutSignal(milliseconds: number) {
  return AbortSignal.timeout(milliseconds);
}

function openAIResponseText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === 'string') return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output as Array<Record<string, unknown>>) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content as Array<Record<string, unknown>>) {
      if (typeof part.text === 'string') return part.text;
    }
  }
  return '';
}

function geminiResponseText(payload: Record<string, unknown>) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  for (const candidate of candidates as Array<Record<string, unknown>>) {
    const content = candidate.content && typeof candidate.content === 'object' ? candidate.content as Record<string, unknown> : {};
    const parts = Array.isArray(content.parts) ? content.parts : [];
    for (const part of parts as Array<Record<string, unknown>>) {
      if (typeof part.text === 'string') return part.text;
    }
  }
  return '';
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function fetchGeminiImage(imageUrl: string, fetcher: FetchLike) {
  const response = await fetcher(imageUrl, { signal: timeoutSignal(15_000), redirect: 'follow' });
  if (!response.ok) throw new Error('The selected image could not be loaded for AI review.');
  const mimeType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) {
    throw new Error('The selected file is not a supported image for AI review.');
  }
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > 6_000_000) throw new Error('The selected image is too large for AI review.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 6_000_000) throw new Error('The selected image is empty or too large for AI review.');
  return { mimeType, data: bytesToBase64(bytes) };
}

export function selectedAiProvider(env: EnvReader = Deno.env.get.bind(Deno.env)) {
  const provider = envValue(env, 'AI_PROVIDER').toLowerCase() || 'gemini';
  if (!['gemini', 'openai'].includes(provider)) throw new Error('AI provider configuration is invalid.');
  return provider as 'gemini' | 'openai';
}

export async function callOpenAI({ prompt, imageUrl = '', userId, env = Deno.env.get.bind(Deno.env), fetcher = fetch }: ProviderRequest) {
  const content: Array<Record<string, unknown>> = [{ type: 'input_text', text: prompt }];
  if (imageUrl) content.push({ type: 'input_image', image_url: imageUrl, detail: 'low' });
  const response = await fetcher('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${configuredSecret(env, 'OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: configuredModel(env, 'OPENAI_MODEL', DEFAULT_OPENAI_MODEL),
      input: [{ role: 'user', content }],
      max_output_tokens: 500,
      safety_identifier: `mvplux-admin-${userId}`
    }),
    signal: timeoutSignal(40_000)
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    if (response.status === 429) throw new Error('The AI provider is busy or its request limit was reached. Try again shortly.');
    throw new Error(`OpenAI could not complete the suggestion (HTTP ${response.status}).`);
  }
  const text = openAIResponseText(payload).trim();
  if (!text) throw new Error('OpenAI returned an empty suggestion.');
  return text;
}

export async function callGemini({ prompt, imageUrl = '', env = Deno.env.get.bind(Deno.env), fetcher = fetch }: ProviderRequest) {
  const model = configuredModel(env, 'GEMINI_MODEL', DEFAULT_GEMINI_MODEL);
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (imageUrl) {
    try {
      const image = await fetchGeminiImage(imageUrl, fetcher);
      parts.unshift({ inline_data: { mime_type: image.mimeType, data: image.data } });
    } catch (_error) {
      parts.push({ text: 'The selected image was not publicly available. Base the suggestion only on the supplied category and text, and do not guess visual details.' });
    }
  }
  const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': configuredSecret(env, 'GEMINI_API_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING' },
            description: { type: 'STRING' },
            funFact: { type: 'STRING' }
          },
          required: ['title', 'description', 'funFact']
        },
        maxOutputTokens: 500
      }
    }),
    signal: timeoutSignal(40_000)
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    if (response.status === 429) throw new Error('The AI provider is busy or its request limit was reached. Try again shortly.');
    throw new Error(`Gemini could not complete the suggestion (HTTP ${response.status}).`);
  }
  const text = geminiResponseText(payload).trim();
  if (!text) throw new Error('Gemini returned an empty suggestion.');
  return text;
}

export async function callSelectedProvider(request: ProviderRequest) {
  const env = request.env || Deno.env.get.bind(Deno.env);
  return selectedAiProvider(env) === 'openai'
    ? callOpenAI({ ...request, env })
    : callGemini({ ...request, env });
}
