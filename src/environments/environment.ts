export const environment = {
  production: false,
  supabaseUrl: (import.meta as any).env?.VITE_SUPABASE_URL || 'https://placeholder.supabase.co',
  supabaseAnonKey: (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key',
};
