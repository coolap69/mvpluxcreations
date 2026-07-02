window.MVPLUX_SUPABASE = {
  url: 'https://cjyksvfvwbjvybmerteww.supabase.co',
  publishableKey: 'sb_publishable_jRAC4couf-0aXjuQ3xdYhg_YxqdMOXe'
};

window.getMvpluxSupabaseClient = function getMvpluxSupabaseClient() {
  if (window.mvpluxSupabaseClient) return window.mvpluxSupabaseClient;
  if (!window.supabase || !window.MVPLUX_SUPABASE?.url || !window.MVPLUX_SUPABASE?.publishableKey) return null;

  window.mvpluxSupabaseClient = window.supabase.createClient(
    window.MVPLUX_SUPABASE.url,
    window.MVPLUX_SUPABASE.publishableKey
  );

  return window.mvpluxSupabaseClient;
};
