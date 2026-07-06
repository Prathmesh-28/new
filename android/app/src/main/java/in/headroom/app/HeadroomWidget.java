package in.headroom.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import org.json.JSONException;
import org.json.JSONObject;

// Home-screen widget: balance + runway, read straight from the Capacitor Preferences
// SharedPreferences file the web app already writes to (src/lib/widgetBridge.ts).
// Verified against the real plugin source (@capacitor/preferences PreferencesConfiguration
// .java / Preferences.java): default group "CapacitorStorage", no key prefix — so this
// reads exactly what Preferences.set({ key: "hr_widget", ... }) wrote, no extra bridge.
public class HeadroomWidget extends AppWidgetProvider {
    private static final String PREFS_GROUP = "CapacitorStorage";
    private static final String WIDGET_KEY = "hr_widget";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS_GROUP, Context.MODE_PRIVATE);
        String raw = prefs.getString(WIDGET_KEY, null);
        String balance = "—";
        String runway = "";
        if (raw != null) {
            try {
                JSONObject j = new JSONObject(raw);
                double b = j.optDouble("balance", 0.0);
                if (b >= 1e7) balance = String.format("₹%.1fCr", b / 1e7);
                else if (b >= 1e5) balance = String.format("₹%.1fL", b / 1e5);
                else balance = String.format("₹%.0f", b);
                int r = j.optInt("runwayDays", 0);
                runway = r >= 999 ? "Cash-flow positive" : r + " days runway";
            } catch (JSONException ignored) {
                // Malformed/missing snapshot — fall back to the placeholder dashes above.
            }
        }
        for (int id : ids) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_headroom);
            v.setTextViewText(R.id.w_balance, balance);
            v.setTextViewText(R.id.w_runway, runway);
            // Tap the widget → open the app.
            PendingIntent pi = PendingIntent.getActivity(
                ctx, 0, ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName()),
                PendingIntent.FLAG_IMMUTABLE
            );
            v.setOnClickPendingIntent(R.id.w_balance, pi);
            mgr.updateAppWidget(id, v);
        }
    }
}
