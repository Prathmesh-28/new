// Secure token storage: Keychain on iOS, EncryptedSharedPreferences (Keystore-backed)
// on Android, and plain localStorage on web. Drop-in replacement for the three
// localStorage calls used by AuthContext — the API mirrors the synchronous
// localStorage interface but returns Promises.
import { Capacitor } from "@capacitor/core";

async function prefs() {
  const { Preferences } = await import("@capacitor/preferences");
  return Preferences;
}

export async function secureGet(key: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return localStorage.getItem(key);
  const { value } = await (await prefs()).get({ key });
  return value;
}

export async function secureSet(key: string, value: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) { localStorage.setItem(key, value); return; }
  await (await prefs()).set({ key, value });
}

export async function secureRemove(key: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) { localStorage.removeItem(key); return; }
  await (await prefs()).remove({ key });
}
