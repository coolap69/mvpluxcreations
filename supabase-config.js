window.MVPLUX_SUPABASE = {
  url: 'https://ncbddqxdinvcsoszdsxr.supabase.co',
  publishableKey: 'sb_publishable_Suf4wHqdy3vDF8VVFdPU6A_1yCTxuKT'
};

window.getMvpluxSupabaseClient = function getMvpluxSupabaseClient() {
  if (window.mvpluxSupabaseClient) return window.mvpluxSupabaseClient;
  if (!window.supabase || !window.MVPLUX_SUPABASE?.url || !window.MVPLUX_SUPABASE?.publishableKey) return null;

  window.mvpluxSupabaseClient = window.supabase.createClient(
    window.MVPLUX_SUPABASE.url,
    window.MVPLUX_SUPABASE.publishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  return window.mvpluxSupabaseClient;
};
