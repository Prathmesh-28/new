# Shipping the apps

Three ways users get Headroom. **The PWA is already live** (see below). The other
two need your machine + accounts — everything is pre-wired so each is a short job.

## 1. PWA — ✅ LIVE now (free, no store, no accounts)
Already deployed at **headroom-pi.vercel.app**. Users install it:
- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** ⋮ → **Install app** (or the in-app "Install" banner).
Nothing for you to do. Auto-updates on every push.

## 2. Android APK — direct download on your site (free, no Play Store)
Needs a machine with the **Android SDK + JDK 17** (Android Studio installs both).

1. **Generate a signing key once** (keep `headroom-release.jks` safe — losing it
   means you can't update the app):
   ```bash
   keytool -genkeypair -v -keystore android/app/headroom-release.jks \
     -alias headroom -keyalg RSA -keysize 2048 -validity 10000
   ```
2. **Create `android/keystore.properties`** (gitignored) from the example:
   ```
   storeFile=headroom-release.jks
   storePassword=<the store password you set>
   keyAlias=headroom
   keyPassword=<the key password you set>
   ```
3. **Build:**
   ```bash
   npm run build && npx cap sync android
   cd android && ./gradlew assembleRelease
   ```
   → APK at `android/app/build/outputs/apk/release/app-release.apk`.
4. **Distribute:** upload that APK to your site (e.g. `headroom.app/download`). Users
   tap it → "allow install from this source" → installed. Done.
   *(For the Play Store later, use `./gradlew bundleRelease` → `.aab`.)*

The gradle signing config is already wired — it activates automatically once
`keystore.properties` exists, and the build stays valid without it.

## 3. iOS — TestFlight / App Store (needs Apple Developer, $99/yr)
Your Mac already has Xcode + the project builds.

1. Join the **Apple Developer Program** → in App Store Connect create an app with
   bundle id **`in.headroom.app`**.
2. `npm run build && npx cap sync ios && npx cap open ios`.
3. In Xcode: target **App** → Signing & Capabilities → set your **Team** (automatic signing).
4. Top bar: device target **Any iOS Device** → **Product → Archive**.
5. Organizer → **Distribute App** → **TestFlight & App Store** → upload.
6. In App Store Connect → **TestFlight** → add testers (or enable a **public link** for
   up to 10,000 testers — that's your "download" link, no public App Store review needed).
7. For the public App Store, submit for review from the same build.

Bundle id, icons, splash, and permissions are all already set.
