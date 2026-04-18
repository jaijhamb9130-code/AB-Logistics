/**
 * Native (iOS / Android) refresh-token store.
 * Uses expo-secure-store (iOS Keychain / Android Keystore) per D-13 + T-01-18.
 * Access tokens are NEVER persisted — they live only in AuthContext memory.
 */

import * as SecureStore from 'expo-secure-store';

const REFRESH_KEY = 'ab_refresh_token';

export const tokenStorage = {
  async getRefresh(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_KEY);
  },
  async setRefresh(token: string): Promise<void> {
    await SecureStore.setItemAsync(REFRESH_KEY, token);
  },
  async clearRefresh(): Promise<void> {
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};
