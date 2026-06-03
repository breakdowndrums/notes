import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js/dist/index.cjs';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const isWeb = Platform.OS === 'web';
const canUseBrowserStorage = !isWeb || typeof window !== 'undefined';
const noOpStorage = {
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
};

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder', {
  auth: {
    storage: canUseBrowserStorage ? AsyncStorage : noOpStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: isWeb && typeof window !== 'undefined',
  },
});
