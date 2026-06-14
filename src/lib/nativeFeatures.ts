// Native-only capabilities (iOS/Android via Capacitor). Every export is guarded
// and degrades gracefully on the web, so the same bundle runs everywhere.
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

export const isNative = () => Capacitor.isNativePlatform();

// ── One-tap chase (works on web + native via URL schemes) ────────────────────
export function callNumber(phone: string) {
  const n = phone.replace(/[^\d+]/g, "");
  if (n) window.open(`tel:${n}`, "_self");
}
export function smsNumber(phone: string, body = "") {
  const n = phone.replace(/[^\d+]/g, "");
  if (n) window.open(`sms:${n}${body ? `?&body=${encodeURIComponent(body)}` : ""}`, "_self");
}
export function whatsappTo(phone: string, text = "") {
  const n = phone.replace(/[^\d]/g, "");
  if (n) window.open(`https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`, "_blank", "noopener");
}

// ── Local (on-device, scheduled) notifications — no backend needed ───────────
export async function ensureLocalNotifPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== "granted") p = await LocalNotifications.requestPermissions();
    return p.display === "granted";
  } catch { return false; }
}

export interface Reminder { id: number; title: string; body: string; at: Date; }
export async function scheduleReminders(reminders: Reminder[]): Promise<number> {
  if (!isNative() || !reminders.length) return 0;
  if (!(await ensureLocalNotifPermission())) return 0;
  try {
    const future = reminders.filter(r => r.at.getTime() > Date.now());
    if (!future.length) return 0;
    await LocalNotifications.schedule({
      notifications: future.map(r => ({
        id: r.id, title: r.title, body: r.body, schedule: { at: r.at },
        smallIcon: "ic_stat_icon_config_sample", sound: undefined,
      })),
    });
    return future.length;
  } catch { return 0; }
}
export async function cancelReminders(ids: number[]): Promise<void> {
  if (!isNative() || !ids.length) return;
  try { await LocalNotifications.cancel({ notifications: ids.map(id => ({ id })) }); } catch { /* ignore */ }
}

// ── Push notifications (APNs/FCM) ────────────────────────────────────────────
// Registers the device and hands the token to `onToken` so the backend can store
// it. Tapping a push routes via `onOpen(path)`. Inert on web / until configured.
export async function registerPush(opts: { onToken: (token: string) => void; onOpen?: (path: string) => void }): Promise<void> {
  if (!isNative()) return;
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt") perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return;
    await PushNotifications.register();
    await PushNotifications.removeAllListeners();
    PushNotifications.addListener("registration", t => opts.onToken(t.value));
    PushNotifications.addListener("pushNotificationActionPerformed", a => {
      const path = (a.notification?.data as { path?: string } | undefined)?.path;
      if (path && opts.onOpen) opts.onOpen(path);
    });
  } catch { /* ignore */ }
}

// ── Camera capture (for receipt / invoice scan) ──────────────────────────────
// Returns a data URL (base64) or null. Falls back to a file picker on web.
export async function capturePhoto(): Promise<string | null> {
  try {
    const photo = await Camera.getPhoto({
      quality: 70, allowEditing: false, resultType: CameraResultType.DataUrl,
      source: isNative() ? CameraSource.Prompt : CameraSource.Photos, width: 1600, correctOrientation: true,
    });
    return photo.dataUrl ?? null;
  } catch { return null; }
}
