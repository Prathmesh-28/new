# Push Notifications — one-time setup

The code is done (device registers on launch, backend stores tokens, the morning
digest sends a push, Settings → Push has a **Send test** button). To make pushes
actually deliver, do the steps below once. Until then push is inert — nothing breaks.

## 1. Create a free Firebase project
1. https://console.firebase.google.com → **Add project** (e.g. "Headroom").
2. Project settings → **Cloud Messaging**.

## 2. Server key (Render)
- Copy the **Cloud Messaging API (legacy) → Server key** (enable legacy API if prompted).
- Render → `headroom-api` → Environment → set **`FCM_SERVER_KEY`** = that key → save (redeploys).
- Now `/api/push/test` and the digest will deliver to registered devices.

## 3. Android
1. Firebase → Add app → **Android**, package name **`in.headroom.app`**.
2. Download **`google-services.json`** → drop it in **`android/app/google-services.json`**.
   (The gradle is already wired to pick it up only when present.)
3. `npx cap sync android` → build. Done — FCM works.

## 4. iOS (needs a paid Apple Developer account for APNs)
1. Firebase → Add app → **iOS**, bundle id **`in.headroom.app`** → download
   **`GoogleService-Info.plist`** → add it to `ios/App/App/` (drag into Xcode, "Copy if needed").
2. In Xcode → target **App** → **Signing & Capabilities** → **＋ Capability → Push Notifications**.
   (An `App.entitlements` with `aps-environment` is already in the repo; the capability links it.)
3. Apple Developer → Keys → create an **APNs Auth Key (.p8)** → upload it in
   Firebase → Cloud Messaging → **APNs Authentication Key** (with Key ID + Team ID).
4. `npx cap sync ios` → build on a real device (push doesn't fire on the simulator).

## Test
Settings → **Push Notifications → Send test**. You'll get a toast: sent to N devices,
"no devices yet" (open the app on a phone + allow notifications first), or
"not enabled" (set `FCM_SERVER_KEY`).

> Note: iOS routes APNs through FCM, so iOS devices also need the Firebase iOS SDK to
> return an FCM token. If you prefer pure APNs (no Firebase on iOS), tell me and I'll
> switch `backend/src/lib/push.js` to send via the APNs HTTP/2 API with your .p8 key.
