import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    // Overlay shown while iOS takes a task-switcher snapshot so financial data
    // never appears in the app-switcher thumbnail.
    private var privacyOverlay: UIView?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        if isJailbroken() {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                guard let root = UIApplication.shared.windows.first?.rootViewController else { return }
                let alert = UIAlertController(
                    title: "Security Warning",
                    message: "This device appears to be jailbroken. Running Headroom on a jailbroken device exposes your financial data to other apps. We strongly recommend using an unmodified device.",
                    preferredStyle: .alert
                )
                alert.addAction(UIAlertAction(title: "I Understand", style: .default))
                root.present(alert, animated: true)
            }
        }
        return true
    }

    // ── App-switcher privacy ──────────────────────────────────────────────────

    func applicationWillResignActive(_ application: UIApplication) {
        guard privacyOverlay == nil,
              let window = UIApplication.shared.windows.first else { return }
        let overlay = UIView(frame: window.bounds)
        overlay.backgroundColor = UIColor(red: 13/255, green: 17/255, blue: 23/255, alpha: 1)
        let logo = UIImageView(image: UIImage(named: "AppIcon"))
        logo.contentMode = .scaleAspectFit
        logo.frame = CGRect(x: 0, y: 0, width: 80, height: 80)
        logo.center = overlay.center
        overlay.addSubview(logo)
        window.addSubview(overlay)
        privacyOverlay = overlay
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        privacyOverlay?.removeFromSuperview()
        privacyOverlay = nil
    }

    func applicationDidEnterBackground(_ application: UIApplication) {}

    func applicationWillEnterForeground(_ application: UIApplication) {}

    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // ── Jailbreak detection ───────────────────────────────────────────────────
    private func isJailbroken() -> Bool {
        #if targetEnvironment(simulator)
        return false
        #else
        let paths = [
            "/Applications/Cydia.app",
            "/Library/MobileSubstrate/MobileSubstrate.dylib",
            "/bin/bash", "/usr/sbin/sshd", "/etc/apt",
            "/private/var/lib/apt/", "/usr/bin/ssh",
        ]
        if paths.contains(where: { FileManager.default.fileExists(atPath: $0) }) { return true }
        // Sandbox-escape probe: jailbroken devices can write outside the sandbox.
        let probe = "/private/jailbreak_probe"
        do {
            try "x".write(toFile: probe, atomically: true, encoding: .utf8)
            try FileManager.default.removeItem(atPath: probe)
            return true
        } catch {}
        return false
        #endif
    }
}
