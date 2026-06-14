package in.headroom.app;

import android.app.AlertDialog;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import java.io.File;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Block screenshots and screen recording on all financial screens.
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        if (isRooted()) {
            new AlertDialog.Builder(this)
                .setTitle("Security Warning")
                .setMessage(
                    "This device appears to be rooted. Running Headroom on a rooted device " +
                    "exposes your financial data to other apps. We strongly recommend using " +
                    "an unrooted device.")
                .setPositiveButton("I Understand", null)
                .setCancelable(false)
                .show();
        }
    }

    private boolean isRooted() {
        // Test-key build (AOSP dev / custom ROM) — not a production sign
        String tags = Build.TAGS;
        if (tags != null && tags.contains("test-keys")) return true;

        // Common su binary locations used by SuperSU, Magisk, KingRoot, etc.
        String[] suPaths = {
            "/sbin/su", "/system/bin/su", "/system/xbin/su",
            "/data/local/xbin/su", "/data/local/bin/su",
            "/system/sd/xbin/su", "/system/bin/failsafe/su",
            "/system/app/Superuser.apk", "/system/app/SuperSU.apk",
        };
        for (String path : suPaths) {
            if (new File(path).exists()) return true;
        }
        return false;
    }
}
