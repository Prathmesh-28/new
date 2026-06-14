import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

// Shares a tiny snapshot for the home-screen widget. Writes to Capacitor's default
// store ("CapacitorStorage"), which the Android AppWidgetProvider reads directly.
// On iOS a small native shim mirrors this into the App Group suite the WidgetKit
// extension reads (see WIDGET_SETUP.md). No-op on web.
//
// NOTE: we deliberately do NOT call Preferences.configure({group}) — that is a
// GLOBAL switch and would relocate the app-lock PIN / all other stored keys.
export const WIDGET_KEY = "hr_widget";

export interface WidgetData {
  balance: number;
  runwayDays: number;       // 999 = cash-flow positive
  lowPoint: number;         // worst forecast cash position over the horizon
  lowPointDate: string | null;
  updatedAt: string;        // ISO
}

export async function updateWidgetData(d: WidgetData): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Preferences.set({ key: WIDGET_KEY, value: JSON.stringify(d) });
  } catch { /* widget data is best-effort */ }
}
