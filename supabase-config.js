window.MVPLUX_SUPABASE = {
  url: 'https://yykooepksomyeqzyhp.supabase.co',
  publishableKey: 'sb_publishable_lsEpRbLA7xRdQvRgIObNbA_pyqnz3Yw'
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
