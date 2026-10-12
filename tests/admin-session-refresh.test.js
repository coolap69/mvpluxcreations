function assert(condition, message = 'assertion failed') {
  if (!condition) throw new Error(message);
}

function assertEquals(actual, expected) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) throw new Error(`expected ${expectedJson}, received ${actualJson}`);
}

const source = await Deno.readTextFile(new URL('../admin.js', import.meta.url));

function sourceRange(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from, `missing source range ${start}`);
  return source.slice(from, to);
}

Deno.test('Admin publisher refreshes one expired session and retries the same protected request', async () => {
  const functionSource = sourceRange('async function callAdminPublisher', '\n\nasync function undeployedLiveSnapshotImages');
  const responses = [
    { ok: false, status: 401, json: async () => ({ code: 'INVALID_ADMIN_SESSION', stage: 'authentication' }) },
    { ok: true, status: 200, json: async () => ({ saved: true }) }
  ];
  const tokens = [];
  const auth = {
    getSession: async () => ({ data: { session: { access_token: 'expired-token' } } }),
    refreshSession: async () => ({ data: { session: { access_token: 'refreshed-token' } } })
  };
  const factory = new Function('getAdminClient', 'window', 'fetch', `${functionSource}; return callAdminPublisher;`);
  const callAdminPublisher = factory(
    () => ({ auth }),
    { MVPLUX_SUPABASE: { url: 'https://example.supabase.co', publishableKey: 'public-key' } },
    async (_url, options) => {
      tokens.push(options.headers.Authorization);
      return responses.shift();
    }
  );

  const result = await callAdminPublisher({ action: 'working-state' });
  assertEquals(tokens, ['Bearer expired-token', 'Bearer refreshed-token']);
  assertEquals(result.saved, true);
});

Deno.test('Admin publisher reports a clear sign-in instruction when refresh cannot restore the session', async () => {
  const functionSource = sourceRange('async function callAdminPublisher', '\n\nasync function undeployedLiveSnapshotImages');
  const auth = {
    getSession: async () => ({ data: { session: { access_token: 'expired-token' } } }),
    refreshSession: async () => ({ data: { session: null } })
  };
  const factory = new Function('getAdminClient', 'window', 'fetch', `${functionSource}; return callAdminPublisher;`);
  const callAdminPublisher = factory(
    () => ({ auth }),
    { MVPLUX_SUPABASE: { url: 'https://example.supabase.co', publishableKey: 'public-key' } },
    async () => ({ ok: false, status: 401, json: async () => ({ code: 'INVALID_ADMIN_SESSION', stage: 'authentication' }) })
  );

  let message = '';
  try {
    await callAdminPublisher({ action: 'working-state' });
  } catch (error) {
    message = error.message;
  }
  assert(message.includes('Sign out, sign in again'));
  assert(message.includes('website was not changed'));
});
