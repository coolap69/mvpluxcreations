window.MVPLUX_SUPABASE = {
  url: 'https://ncbddqxdinvcsoszdsxr.supabase.co',
  publishableKey: 'sb_publishable_Suf4wHqdy3vDF8VVFdPU6A_1yCTxuKT'
};

(function installMvpluxSupabaseActivityMonitor() {
  if (window.mvpluxSupabaseActivityMonitorInstalled || typeof window.fetch !== 'function') return;
  window.mvpluxSupabaseActivityMonitorInstalled = true;
  window.mvpluxSupabaseActivityLog = window.mvpluxSupabaseActivityLog || [];
  const originalFetch = window.fetch.bind(window);
  const projectOrigin = new URL(window.MVPLUX_SUPABASE.url).origin;
  let requestSequence = 0;
  let hideTimer = 0;

  function monitorIsVisibleToCurrentUser() {
    try {
      return /(?:^|\/)admin\.html$/i.test(window.location.pathname)
        || window.localStorage.getItem('mvpluxIsAdminApproved') === 'true';
    } catch (_error) {
      return /(?:^|\/)admin\.html$/i.test(window.location.pathname);
    }
  }

  function requestDetails(input, init = {}) {
    const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
    let url;
    try { url = new URL(rawUrl, window.location.href); } catch (_error) { return null; }
    if (url.origin !== projectOrigin) return null;
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    const parts = url.pathname.split('/').filter(Boolean);
    const rpcIndex = parts.indexOf('rpc');
    const functionIndex = parts.indexOf('functions');
    let operation = rpcIndex >= 0 ? parts[rpcIndex + 1] : parts.at(-1) || 'Supabase';
    if (functionIndex >= 0 && parts[functionIndex + 1] === 'v1') operation = parts[functionIndex + 2] || operation;
    let action = '';
    if (typeof init.body === 'string' && init.body.length < 100000) {
      try { action = String(JSON.parse(init.body)?.action || ''); } catch (_error) { /* Non-JSON body. */ }
    }
    const readOperation = method === 'GET' || method === 'HEAD'
      || /^(?:get|list|validate)_/i.test(operation)
      || ['image-inventory', 'deployment-status'].includes(action);
    const authOperation = parts[0] === 'auth';
    return {
      method,
      operation: action ? `${operation} · ${action}` : operation,
      kind: authOperation ? 'AUTH' : (readOperation ? 'READ' : 'WRITE')
    };
  }

  function ensureMonitorElement() {
    if (!monitorIsVisibleToCurrentUser() || !document.body) return null;
    let monitor = document.getElementById('mvpluxSupabaseActivity');
    if (monitor) return monitor;
    const style = document.createElement('style');
    style.id = 'mvpluxSupabaseActivityStyle';
    style.textContent = `#mvpluxSupabaseActivity{position:fixed;right:14px;bottom:14px;z-index:2147483647;max-width:min(430px,calc(100vw - 28px));padding:11px 13px;border:1px solid #d8ad32;border-radius:10px;background:#090909;color:#fff;font:600 13px/1.35 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.55)}#mvpluxSupabaseActivity[hidden]{display:none}#mvpluxSupabaseActivity[data-state="success"]{border-color:#4fc67a}#mvpluxSupabaseActivity[data-state="failed"]{border-color:#ef6464}#mvpluxSupabaseActivity strong{display:block;color:#f3ca52;margin-bottom:3px}#mvpluxSupabaseActivity small{display:block;color:#ccc;font-weight:500;overflow-wrap:anywhere}`;
    document.head?.append(style);
    monitor = document.createElement('div');
    monitor.id = 'mvpluxSupabaseActivity';
    monitor.hidden = true;
    monitor.setAttribute('role', 'status');
    monitor.setAttribute('aria-live', 'polite');
    monitor.innerHTML = '<strong></strong><small></small>';
    document.body.append(monitor);
    return monitor;
  }

  function reportActivity(entry) {
    window.mvpluxSupabaseActivityLog.push(entry);
    if (window.mvpluxSupabaseActivityLog.length > 50) window.mvpluxSupabaseActivityLog.shift();
    window.dispatchEvent(new CustomEvent('mvplux:supabase-activity', { detail: entry }));
    const monitor = ensureMonitorElement();
    if (!monitor) return;
    window.clearTimeout(hideTimer);
    monitor.hidden = false;
    monitor.dataset.state = entry.state;
    monitor.querySelector('strong').textContent = entry.state === 'sending'
      ? `SUPABASE ${entry.kind} — SENDING…`
      : entry.state === 'success'
        ? `SUPABASE ${entry.kind} — WORKED`
        : `SUPABASE ${entry.kind} — FAILED`;
    monitor.querySelector('small').textContent = `${entry.operation} · request ${entry.id}${entry.status ? ` · HTTP ${entry.status}` : ''}`;
    if (entry.state === 'success') hideTimer = window.setTimeout(() => { monitor.hidden = true; }, 6500);
  }

  window.fetch = async function monitoredMvpluxFetch(input, init) {
    const details = requestDetails(input, init);
    if (!details) return originalFetch(input, init);
    const id = ++requestSequence;
    reportActivity({ ...details, id, state: 'sending', timestamp: Date.now() });
    try {
      const response = await originalFetch(input, init);
      reportActivity({ ...details, id, state: response.ok ? 'success' : 'failed', status: response.status, timestamp: Date.now() });
      return response;
    } catch (error) {
      reportActivity({ ...details, id, state: 'failed', status: 0, timestamp: Date.now() });
      throw error;
    }
  };
})();

window.getMvpluxSupabaseClient = function getMvpluxSupabaseClient() {
  if (window.mvpluxSupabaseClient) return window.mvpluxSupabaseClient;
  if (!window.supabase || !window.MVPLUX_SUPABASE?.url || !window.MVPLUX_SUPABASE?.publishableKey) return null;

  window.mvpluxSupabaseClient = window.supabase.createClient(
    window.MVPLUX_SUPABASE.url,
    window.MVPLUX_SUPABASE.publishableKey
  );

  return window.mvpluxSupabaseClient;
};
