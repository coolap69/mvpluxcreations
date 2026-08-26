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

Deno.test('sign-in requests the homepage Admin cache version while sign-up keeps immediate binding', async () => {
  const signin = await Deno.readTextFile(new URL('../signin.html', import.meta.url));
  const signup = await Deno.readTextFile(new URL('../signup.html', import.meta.url));
  assert(signin.includes('category-presentation.js?v=20260824-collection-representative') && signin.includes('script.js?v=20260826-fast-live-content'), 'signin.html must load the synchronized storefront architecture without stale cache');
  assert(signup.includes('category-presentation.js?v=20260824-collection-representative') && signup.includes('script.js?v=20260826-fast-live-content'), 'signup.html must retain the synchronized storefront architecture');
});

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

async function renderApprovedHeader(pageFile, storage) {
  const [source, html] = await Promise.all([
    Deno.readTextFile(new URL('../script.js', import.meta.url)),
    Deno.readTextFile(new URL(`../${pageFile}`, import.meta.url))
  ]);
  const window = new Window({ url: `https://mvpluxcreations.com/${pageFile}` });
  window.document.write(html);
  const modeStart = source.indexOf('function addAdminModeButtonIfMissing');
  const modeEnd = source.indexOf('\n\nfunction addAdminDashboardLinkIfMissing', modeStart);
  const dashboardStart = modeEnd + 2;
  const dashboardEnd = source.indexOf('\n\nfunction refreshAdminViewControls', dashboardStart);
  const renderStart = source.indexOf('function renderSharedAuthHeader');
  const renderEnd = source.indexOf('\n\nfunction setupAuthState', renderStart);
  const render = new Function('document', 'localStorage', 'dependencies', `
    const { adminArchitectureViewModesEnabled, updateAdminModeToggleButtons, toggleCurrentPageAdminMode,
      setAdminViewMode, isAdminSignedIn, isCustomerSignedIn, getSignedInName, signOutCurrentUser } = dependencies;
    ${source.slice(modeStart, modeEnd)}
    ${source.slice(dashboardStart, dashboardEnd)}
    ${source.slice(renderStart, renderEnd)}
    return renderSharedAuthHeader;
  `)(window.document, storage, {
    adminArchitectureViewModesEnabled: () => false,
    updateAdminModeToggleButtons: () => {}, toggleCurrentPageAdminMode: () => {}, setAdminViewMode: () => {},
    isAdminSignedIn: () => false,
    isCustomerSignedIn: () => storage.getItem('mvpluxCustomerSignedIn') === 'true',
    getSignedInName: () => storage.getItem('mvpluxSignedInName') || '', signOutCurrentUser: () => {}
  });
  render();
  return window;
}

Deno.test('Home and Custom Order finish with the same approved persisted-session header', async () => {
  for (const page of ['index.html', 'custom-order.html']) {
    const storage = memoryStorage({
      mvpluxCustomerSignedIn: 'true', mvpluxSignedInName: 'Admin', mvpluxIsAdminApproved: 'true'
    });
    const window = await renderApprovedHeader(page, storage);
    const header = window.document.querySelector('.auth-links');
    assert(header.querySelector('[data-admin-dashboard-link]')?.textContent === 'Admin Dashboard', `${page} must show Admin Dashboard`);
    assert(header.querySelector('[data-admin-mode-toggle]')?.textContent === 'Admin Mode', `${page} must show Admin Mode`);
    assert(header.querySelector('[data-auth-signout]')?.textContent === 'Log Out', `${page} must show Log Out`);
    assert(header.querySelector('.sign-up-link').style.display === 'none', `${page} must hide Sign Up after restoration`);
    assert(![...header.querySelectorAll('a,button')].some((item) => item.textContent.trim() === 'Sign In'), `${page} must not visibly retain Sign In`);
  }
});

Deno.test('refreshing Home and Custom Order restores the same approved header from persisted state', async () => {
  const storage = memoryStorage({
    mvpluxCustomerSignedIn: 'true', mvpluxSignedInName: 'Admin', mvpluxIsAdminApproved: 'true'
  });
  const firstHome = await renderApprovedHeader('index.html', storage);
  const customOrder = await renderApprovedHeader('custom-order.html', storage);
  const refreshedHome = await renderApprovedHeader('index.html', storage);
  for (const window of [firstHome, customOrder, refreshedHome]) {
    assert(window.document.querySelector('[data-admin-dashboard-link]'), 'persisted approved session must survive page navigation and refresh');
    assert(window.document.querySelector('[data-auth-signout]'), 'persisted approved session must retain explicit Log Out');
  }
});

Deno.test('session synchronization renders the shared header immediately after admin_profiles authorization', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const start = source.indexOf('async function syncSupabaseAuthState');
  const end = source.indexOf('\n\nasync function signInCustomerWithSupabase', start);
  const syncSource = source.slice(start, end);
  const authorization = syncSource.indexOf('await checkCurrentUserAdminAccess');
  const headerRender = syncSource.indexOf('setupAuthState()', authorization);
  assert(authorization >= 0 && headerRender > authorization, 'session restoration must render the shared header immediately after authorization');
});

Deno.test('successful approved sign-in authorizes the session and returns to the normal homepage', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const start = source.indexOf('async function signInCustomerWithSupabase');
  const end = source.indexOf('\n\nasync function signUpCustomerWithSupabase', start);
  assert(start >= 0 && end > start, 'sign-in function must exist');
  const storage = new Map();
  const navigation = { href: 'signin.html' };
  const calls = [];
  const signIn = new Function('dependencies', `
    const { getSupabaseClient, showSupabaseConnectionAlert, isSupabaseNetworkError, showSiteMessage,
      checkCurrentUserAdminAccess, localStorage, window, console } = dependencies;
    ${source.slice(start, end)}
    return signInCustomerWithSupabase;
  `)({
    getSupabaseClient: () => ({ auth: { signInWithPassword: async (credentials) => {
      calls.push(['supabase', credentials]);
      return { data: { user: { id: 'admin-1', user_metadata: { screen_name: 'Admin' } } }, error: null };
    } } }),
    showSupabaseConnectionAlert: () => calls.push(['connection-error']),
    isSupabaseNetworkError: () => false,
    showSiteMessage: (...args) => calls.push(['message', ...args]),
    checkCurrentUserAdminAccess: async (options) => { calls.push(['authorize', options]); return true; },
    localStorage: { setItem: (key, value) => storage.set(key, value) },
    window: { location: navigation }, console
  });

  await signIn('admin@example.com', 'secret');
  assert(calls[0][0] === 'supabase' && calls[1][0] === 'authorize', 'Supabase login must precede Admin authorization');
  assert(calls[1][1].showMessages === false, 'authorization must use explicit sign-in feedback');
  assert(storage.get('mvpluxCustomerSignedIn') === 'true' && storage.get('mvpluxSignedInName') === 'Admin', 'successful Supabase session must update local signed-in state');
  assert(navigation.href === '/', 'approved Admin must return to the normal homepage');
});

Deno.test('successful unapproved sign-in stays signed in and shows a visible Admin authorization error', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const start = source.indexOf('async function signInCustomerWithSupabase');
  const end = source.indexOf('\n\nasync function signUpCustomerWithSupabase', start);
  const messages = [];
  const storage = new Map();
  const navigation = { href: 'signin.html' };
  const signIn = new Function('dependencies', `
    const { getSupabaseClient, showSupabaseConnectionAlert, isSupabaseNetworkError, showSiteMessage,
      checkCurrentUserAdminAccess, localStorage, window, console } = dependencies;
    ${source.slice(start, end)}
    return signInCustomerWithSupabase;
  `)({
    getSupabaseClient: () => ({ auth: { signInWithPassword: async () => ({
      data: { user: { id: 'customer-1', user_metadata: {} } }, error: null
    }) } }),
    showSupabaseConnectionAlert: () => {}, isSupabaseNetworkError: () => false,
    showSiteMessage: (...args) => messages.push(args), checkCurrentUserAdminAccess: async () => false,
    localStorage: { setItem: (key, value) => storage.set(key, value) }, window: { location: navigation }, console
  });

  await signIn('customer@example.com', 'secret');
  assert(storage.get('mvpluxCustomerSignedIn') === 'true', 'a valid Supabase session must remain signed in');
  assert(navigation.href === 'signin.html', 'unapproved account must not enter Admin or silently navigate away');
  assert(messages.some(([text, type]) => text.includes('not approved for Admin access') && type === 'error'), 'authorization failure must be visibly explained');
});

Deno.test('Admin authorization verifies the persisted session against admin_profiles', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const start = source.indexOf('async function checkCurrentUserAdminAccess');
  const end = source.indexOf('\n\nfunction addAdminModeButtonIfMissing', start);
  const storage = new Map();
  const queries = [];
  const profileQuery = {
    select(column) { queries.push(['select', column]); return this; },
    eq(column, value) { queries.push(['eq', column, value]); return this; },
    async maybeSingle() { return { data: { user_id: 'admin-1' }, error: null }; }
  };
  const authorize = new Function('dependencies', `
    const { getSupabaseClient, showSiteMessage, localStorage, logAdminInitializationException, console } = dependencies;
    ${source.slice(start, end)}
    return checkCurrentUserAdminAccess;
  `)({
    getSupabaseClient: () => ({
      auth: { getSession: async () => ({ data: { session: { user: { id: 'admin-1', email: 'admin@example.com' } } } }) },
      from: (table) => { queries.push(['from', table]); return profileQuery; }
    }),
    showSiteMessage: () => {}, localStorage: {
      setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key)
    }, logAdminInitializationException: () => {}, console
  });

  assert(await authorize({ showMessages: false }) === true, 'persisted approved session must authorize');
  assert(queries.some(([operation, table]) => operation === 'from' && table === 'admin_profiles'), 'authorization must query admin_profiles');
  assert(queries.some(([operation, column, value]) => operation === 'eq' && column === 'user_id' && value === 'admin-1'), 'authorization must match the signed-in user ID');
  assert(storage.get('mvpluxIsAdminApproved') === 'true', 'approved session must set the Admin approval state');
});

Deno.test('homepage refresh restores Admin approval before auth synchronization completes', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const start = source.indexOf('async function syncSupabaseAuthState');
  const end = source.indexOf('\n\nasync function signInCustomerWithSupabase', start);
  const storage = new Map();
  let authorizationFinished = false;
  let headerRendered = false;
  const sync = new Function('dependencies', `
    const { getSupabaseClient, localStorage, checkCurrentUserAdminAccess, setupAuthState, console } = dependencies;
    ${source.slice(start, end)}
    return syncSupabaseAuthState;
  `)({
    getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: { user: {
      id: 'admin-1', email: 'admin@example.com', user_metadata: { screen_name: 'Admin' }
    } } } }) } }),
    localStorage: { setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    checkCurrentUserAdminAccess: async () => { await Promise.resolve(); authorizationFinished = true; return true; },
    setupAuthState: () => { headerRendered = true; },
    console
  });

  await sync();
  assert(authorizationFinished, 'homepage session restoration must await the admin_profiles authorization result');
  assert(headerRendered, 'homepage session restoration must immediately render the authorized header');
  assert(storage.get('mvpluxCustomerSignedIn') === 'true', 'homepage refresh must retain the persisted signed-in presentation');
});

Deno.test('admin.html restores the persisted Supabase session and repeats authorization after refresh', async () => {
  const source = await Deno.readTextFile(new URL('../admin.js', import.meta.url));
  const start = source.indexOf('async function requireSupabaseAdminAccess');
  const end = source.indexOf('\n\nfunction renderAdminTestMode', start);
  const storage = new Map();
  const navigation = { href: 'admin.html' };
  const profileQuery = {
    select() { return this; }, eq() { return this; },
    async maybeSingle() { return { data: { user_id: 'admin-1' }, error: null }; }
  };
  const requireAccess = new Function('dependencies', `
    const { getAdminClient, setCommerceStatus, setAdminSignedInAs, localStorage, window,
      logAdminInitializationException, console } = dependencies;
    ${source.slice(start, end)}
    return requireSupabaseAdminAccess;
  `)({
    getAdminClient: () => ({
      auth: { getSession: async () => ({ data: { session: { user: {
        id: 'admin-1', email: 'admin@example.com', user_metadata: { screen_name: 'Admin' }
      } } } }) }, from: () => profileQuery
    }),
    setCommerceStatus: () => {}, setAdminSignedInAs: () => {},
    localStorage: { setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    window: { location: navigation }, logAdminInitializationException: () => {}, console
  });

  assert(await requireAccess() === true, 'Admin refresh must recognize the persisted approved session');
  assert(navigation.href === 'admin.html', 'recognized Admin session must not redirect back to sign-in');
  assert(storage.get('mvpluxCustomerSignedIn') === 'true' && storage.get('mvpluxSignedInName') === 'Admin', 'Admin refresh must restore local signed-in presentation state');
});

Deno.test('approved homepage session exposes Admin Dashboard and normal navigation never signs out', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const adminHtml = await Deno.readTextFile(new URL('../admin.html', import.meta.url));
  const addLink = source.slice(source.indexOf('function addAdminDashboardLinkIfMissing'), source.indexOf('function refreshAdminViewControls'));
  const signOut = source.slice(source.indexOf('async function signOutCurrentUser'), source.indexOf('function signOutAdmin'));
  assert(addLink.includes('href="/admin.html">Admin Dashboard</a>'), 'approved header must expose the explicit Admin Dashboard link');
  assert(adminHtml.includes('href="index.html#home">Home</a>') && adminHtml.includes('href="index.html#shop" class="sign-up-link">Back to Site</a>'), 'Admin Home and Back to Site must remain plain navigation links');
  assert(!adminHtml.includes('signOutCurrentUser') && !adminHtml.includes('auth.signOut'), 'Admin navigation markup must not sign out');
  assert(signOut.includes('await client.auth.signOut()'), 'the explicit logout function must remain the one Supabase sign-out path');
  assert(signOut.includes("localStorage.removeItem('mvpluxIsAdminApproved')"), 'explicit logout must clear the cached approval presentation');
  assert((source.match(/\.auth\.signOut\(/g) || []).length === 1, 'no normal navigation path may call Supabase signOut');
});
