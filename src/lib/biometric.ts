import { Capacitor } from "@capacitor/core";

// Face ID / Touch ID / fingerprint unlock. Layered on top of the PIN lock: the
// PIN is always the fallback, biometrics are an opt-in fast path on supported
// devices. Everything is dynamically imported + guarded so the web/PWA build is
// untouched (the native module only loads inside the app shell).
//
// NOTE: activates natively only after `npx cap sync ios && npx cap sync android`
// pulls the plugin into the native projects. On web it always reports
// unavailable and the app falls back to PIN.

export async function biometricAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { NativeBiometric } = await import("capacitor-native-biometric");
    const result = await NativeBiometric.isAvailable();
    return !!result.isAvailable;
  } catch {
    return false;
  }
}

/** Prompts the OS biometric dialog. Resolves true on success, false on any
 *  failure or cancel - never throws. */
export async function biometricVerify(reason = "Unlock Headroom"): Promise<boolean> {
  try {
    const { NativeBiometric } = await import("capacitor-native-biometric");
    await NativeBiometric.verifyIdentity({
      reason,
      title: "Unlock Headroom",
      subtitle: "Verify it's you",
      description: "",
    });
    return true; // verifyIdentity resolves only on success
  } catch {
    return false;
  }
}
