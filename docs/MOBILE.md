# Headroom — iOS & Android apps

The native apps are the **same React app** wrapped in [Capacitor](https://capacitorjs.com).
There is no second codebase: every feature, screen, and fix in `src/` ships to web,
iOS, and Android from one build. The native projects live in `ios/` and `android/`.

| | |
|---|---|
| App name | **Headroom** |
| App ID / bundle id | `in.headroom.app` |
| Web bundle | `dist/` (built by `npm run build`) |
| iOS project | `ios/App/App.xcworkspace` |
| Android project | `android/` |

## Prerequisites

**iOS** (macOS only)
- Xcode 16+ (full app, not just Command Line Tools) — `xcode-select --install` is *not* enough
- CocoaPods (`sudo gem install cocoapods` or `brew install cocoapods`)

**Android**
- Android Studio (Ladybug+) with the Android SDK
- JDK 21 (bundled with recent Android Studio, or `brew install openjdk@21`)

## Build & run

The bundle is rebuilt and synced into the native projects for you by the npm scripts:

```bash
# iOS — builds the web app, syncs, and opens Xcode
npm run mobile:ios
#   then press ▶ Run in Xcode (pick a simulator or a connected device)

# Android — builds the web app, syncs, and opens Android Studio
npm run mobile:android
#   then press ▶ Run in Android Studio

# Build + sync both platforms without opening an IDE
npm run mobile:sync
```

> First iOS open: Xcode will run `pod install` automatically. If it doesn't,
> run `cd ios/App && pod install` once (needs full Xcode).

### Live reload against your laptop (fast dev loop)

Run the Vite dev server and point the app at your machine's LAN IP so changes
hot-reload on the device/simulator:

```bash
npm run dev                                   # in one terminal
CAP_SERVER_URL=http://<your-lan-ip>:5173 npm run mobile:dev:ios     # or :android
```

## How the wiring works

- **`capacitor.config.ts`** — app id/name, dark splash + status bar (`#0D1117`),
  and `CapacitorHttp` (native networking, so API calls aren't blocked by WebView CORS).
- **`src/lib/native.ts`** (`initNative`, called from `src/main.tsx`) — sets the
  status bar, hides the splash after first paint, and maps the Android hardware
  back button to router history. It **no-ops in the browser**, so web/Vercel
  builds are unaffected.
- **`src/lib/apiBase.ts`** — on web the API base stays `""` (same-origin; Vercel
  rewrites `/api` + `/auth` to the backend). On device there is no proxy, so it
  uses `VITE_API_URL`, falling back to the production backend
  (`https://headroom-backend.onrender.com`). A `localhost` value is ignored on
  device (it would point at the phone itself).
- **Safe areas** — `index.html` sets `viewport-fit=cover`; `src/index.css` adds
  notch/home-indicator insets scoped to `html.capacitor-native` only.

## App icons & splash screen

A source logo isn't checked in yet. Once you have a 1024×1024 `icon.png` and a
`splash.png` (put them in `resources/`), generate every density with:

```bash
npm i -D @capacitor/assets
npx capacitor-assets generate --iconBackgroundColor '#0D1117' --splashBackgroundColor '#0D1117'
```

## Releasing

- **iOS** — set your Team in Xcode → *Signing & Capabilities*, then
  *Product → Archive* → upload to App Store Connect / TestFlight.
- **Android** — *Build → Generate Signed Bundle/APK* (AAB) in Android Studio,
  then upload to the Play Console.

## After changing the web app

Any time you change `src/`, re-sync the native projects:

```bash
npm run mobile:sync     # build + cap sync (both platforms)
```
