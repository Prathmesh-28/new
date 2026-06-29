# Home-screen widget — balance · runway · low-point

The app already shares a live snapshot for the widget (`src/lib/widgetBridge.ts`
writes `hr_widget` to Capacitor storage on every dashboard update). What's left is
the native widget UI, which must be added in Android Studio / Xcode. Paste-ready
code below.

Snapshot JSON written by the app:
```json
{ "balance": 420000, "runwayDays": 68, "lowPoint": 180000, "lowPointDate": "2026-07-25", "updatedAt": "..." }
```

---

## Android (fully completable in Android Studio)

The widget runs in the app's process, so it reads Capacitor's SharedPreferences
directly — no extra bridge needed.

**1. `android/app/src/main/res/layout/widget_headroom.xml`**
```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent" android:layout_height="match_parent"
    android:orientation="vertical" android:padding="16dp" android:background="#0D1117">
    <TextView android:id="@+id/w_label" android:text="CASH BALANCE"
        android:textColor="#5FBE7C" android:textSize="10sp" android:letterSpacing="0.1"
        android:layout_width="wrap_content" android:layout_height="wrap_content"/>
    <TextView android:id="@+id/w_balance" android:text="—"
        android:textColor="#FDFAF0" android:textSize="22sp" android:textStyle="bold"
        android:layout_width="wrap_content" android:layout_height="wrap_content"/>
    <TextView android:id="@+id/w_runway" android:text=""
        android:textColor="#96B83D" android:textSize="12sp" android:layout_marginTop="4dp"
        android:layout_width="wrap_content" android:layout_height="wrap_content"/>
</LinearLayout>
```

**2. `android/app/src/main/res/xml/widget_headroom_info.xml`**
```xml
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="180dp" android:minHeight="60dp"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_headroom"
    android:resizeMode="horizontal|vertical" android:widgetCategory="home_screen" />
```

**3. `android/app/src/main/java/in/headroom/app/HeadroomWidget.kt`**
```kotlin
package `in`.headroom.app
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import org.json.JSONObject

class HeadroomWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        val prefs = ctx.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val raw = prefs.getString("hr_widget", null)
        var balance = "—"; var runway = ""
        if (raw != null) try {
            val j = JSONObject(raw)
            val b = j.optDouble("balance", 0.0)
            balance = if (b >= 1e7) "₹%.1fCr".format(b / 1e7) else if (b >= 1e5) "₹%.1fL".format(b / 1e5) else "₹%.0f".format(b)
            val r = j.optInt("runwayDays", 0)
            runway = if (r >= 999) "Cash-flow positive" else "$r days runway"
        } catch (_: Exception) {}
        for (id in ids) {
            val v = RemoteViews(ctx.packageName, R.layout.widget_headroom)
            v.setTextViewText(R.id.w_balance, balance)
            v.setTextViewText(R.id.w_runway, runway)
            // tap → open the app
            val pi = PendingIntent.getActivity(ctx, 0,
                ctx.packageManager.getLaunchIntentForPackage(ctx.packageName),
                PendingIntent.FLAG_IMMUTABLE)
            v.setOnClickPendingIntent(R.id.w_balance, pi)
            mgr.updateAppWidget(id, v)
        }
    }
}
```

**4. In `android/app/src/main/AndroidManifest.xml`, inside `<application>`:**
```xml
<receiver android:name=".HeadroomWidget" android:exported="false">
    <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
    <meta-data android:name="android.appwidget.provider" android:resource="@xml/widget_headroom_info" />
</receiver>
```

**5.** (Optional, for instant refresh) After `Preferences.set`, force-update from JS via a
tiny plugin, or rely on the 30-min `updatePeriodMillis`. Build in Android Studio → long-press home → Widgets → Headroom.

---

## iOS (needs an Xcode Widget Extension target)

iOS widgets run in a separate process, so data must go through an **App Group**.

**1. App Group**
- Xcode → target **App** → Signing & Capabilities → **+ App Groups** → add `group.in.headroom.app`.
- Repeat on the widget target (step 2).

**2. Add the widget target**
- File → New → Target → **Widget Extension** → name `HeadroomWidget` (uncheck "Include Live Activity").

**3. Mirror the snapshot into the App Group** — add to `ios/App/App/AppDelegate.swift`
inside `applicationDidBecomeActive` / `applicationWillResignActive`:
```swift
if let v = UserDefaults.standard.string(forKey: "CapacitorStorage.hr_widget") {
    UserDefaults(suiteName: "group.in.headroom.app")?.set(v, forKey: "hr_widget")
    if #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
}
```
(import `WidgetKit` at the top.) Capacitor stores the value under the prefixed key
`CapacitorStorage.hr_widget` in standard defaults; this copies it where the widget reads it.

**4. Widget code** — `HeadroomWidget/HeadroomWidget.swift`
```swift
import WidgetKit
import SwiftUI

struct Entry: TimelineEntry { let date: Date; let balance: String; let runway: String }

struct Provider: TimelineProvider {
    func placeholder(in c: Context) -> Entry { Entry(date: Date(), balance: "₹4.2L", runway: "68 days runway") }
    func getSnapshot(in c: Context, completion: @escaping (Entry) -> Void) { completion(read()) }
    func getTimeline(in c: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        completion(Timeline(entries: [read()], policy: .after(Date().addingTimeInterval(1800))))
    }
    func read() -> Entry {
        let d = UserDefaults(suiteName: "group.in.headroom.app")
        guard let raw = d?.string(forKey: "hr_widget"),
              let data = raw.data(using: .utf8),
              let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return Entry(date: Date(), balance: "—", runway: "Open Headroom") }
        let b = (j["balance"] as? Double) ?? 0
        let bal = b >= 1e7 ? String(format: "₹%.1fCr", b/1e7) : b >= 1e5 ? String(format: "₹%.1fL", b/1e5) : String(format: "₹%.0f", b)
        let r = (j["runwayDays"] as? Int) ?? 0
        return Entry(date: Date(), balance: bal, runway: r >= 999 ? "Cash-flow positive" : "\(r) days runway")
    }
}

struct HeadroomWidgetView: View {
    var entry: Entry
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("CASH BALANCE").font(.system(size: 10, weight: .semibold)).foregroundColor(Color(red: 0.37, green: 0.75, blue: 0.49)).kerning(1)
            Text(entry.balance).font(.system(size: 24, weight: .bold)).foregroundColor(.white)
            Text(entry.runway).font(.system(size: 12)).foregroundColor(Color(red: 0.59, green: 0.72, blue: 0.24))
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading).padding(16)
        .background(Color(red: 0.05, green: 0.07, blue: 0.09))
    }
}

@main struct HeadroomWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HeadroomWidget", provider: Provider()) { HeadroomWidgetView(entry: $0) }
            .configurationDisplayName("Headroom").description("Your cash balance & runway at a glance.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}
```

**5.** Build on a device/simulator → long-press home → add the **Headroom** widget.

---

When you're set up, tell me and I'll add a one-line JS→native call to refresh the
widget instantly after each sync (instead of the periodic refresh).
