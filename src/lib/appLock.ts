// App-lock: a 4-6 digit PIN gate for the app, stored hashed in Capacitor
// Preferences (Keychain/Keystore-backed on device, localStorage on web).
// Pure JS - no fragile native plugin. Biometric can layer on later.
import { Preferences } from "@capacitor/preferences";

const KEY = "hr_pin_hash";
const BIO_KEY = "hr_pin_biometric";

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("hr-pin:" + s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function isLockEnabled(): Promise<boolean> {
  try { return !!(await Preferences.get({ key: KEY })).value; } catch { return false; }
}

export async function setPin(pin: string): Promise<void> {
  await Preferences.set({ key: KEY, value: await sha256(pin) });
}

export async function clearPin(): Promise<void> {
  try { await Preferences.remove({ key: KEY }); } catch { /* ignore */ }
}

export async function verifyPin(pin: string): Promise<boolean> {
  try {
    const stored = (await Preferences.get({ key: KEY })).value;
    return !!stored && stored === (await sha256(pin));
  } catch { return false; }
}

// Opt-in biometric unlock flag (PIN remains the fallback).
export async function isBiometricEnabled(): Promise<boolean> {
  try { return (await Preferences.get({ key: BIO_KEY })).value === "1"; } catch { return false; }
}

export async function setBiometricEnabled(on: boolean): Promise<void> {
  try {
    if (on) await Preferences.set({ key: BIO_KEY, value: "1" });
    else await Preferences.remove({ key: BIO_KEY });
  } catch { /* ignore */ }
}
