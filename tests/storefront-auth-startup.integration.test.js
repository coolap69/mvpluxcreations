import { Window } from 'npm:happy-dom@18.0.1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

Deno.test('sign-in submits immediately and binds only once before storefront startup awaits', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const start = source.indexOf('function bindAuthForms()');
  const end = source.indexOf('\n\nfunction setupAuthState()', start);
  assert(start >= 0 && end > start, 'auth form binder must exist');

  const window = new Window({ url: 'https://mvpluxcreations.com/signin.html' });
  window.document.body.innerHTML = `
    <form id="signinForm">
      <input id="signinEmail" value="ADMIN@EXAMPLE.COM">
      <input id="signinPassword" value="secret">
      <button type="submit">Sign In</button>
    </form>`;
  const calls = [];
  const bindAuthForms = new Function('document', 'signInCustomerWithSupabase', 'signUpCustomerWithSupabase',
    `${source.slice(start, end)}\nreturn bindAuthForms;`
  )(window.document, async (...args) => calls.push(args), async () => {});

  bindAuthForms();
  bindAuthForms();
  window.document.getElementById('signinForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();

  assert(calls.length === 1, 'one submit must make exactly one authentication request');
  assert(calls[0][0] === 'admin@example.com' && calls[0][1] === 'secret', 'the immediate handler must submit normalized credentials');
  assert(window.document.getElementById('signinForm').dataset.authFormBound === 'true', 'form must record idempotent binding');
});

Deno.test('sign-in and sign-up pages request the auth-startup cache version', async () => {
  for (const page of ['signin.html', 'signup.html']) {
    const html = await Deno.readTextFile(new URL(`../${page}`, import.meta.url));
    assert(html.includes('script.js?v=20260822-auth-startup'), `${page} must load the fixed script without a stale cache`);
  }
});
