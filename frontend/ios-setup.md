# iOS Setup with Capacitor

This document explains how to build the Book Reader AI app as a native iOS app using Capacitor.

## How it works

The iOS app is a thin native shell that loads the live Vercel deployment at
`https://book-reader-ai.vercel.app`. No static export is required. An internet
connection is needed to use the app.

## Prerequisites

- macOS with **Xcode 14+** installed (from the Mac App Store)
- **CocoaPods** installed: `sudo gem install cocoapods`
- Node.js 18+ and npm

## One-time platform setup

Run once to add the iOS platform (requires Xcode to be installed):

```bash
cd frontend
npx cap add ios
```

This creates the `ios/` directory with the Xcode project.

## Building and running

Sync Capacitor config and open Xcode:

```bash
npm run ios
# equivalent to: cap sync ios && cap open ios
```

In Xcode:
1. Select your target device or simulator from the toolbar.
2. Press the Run button (or `Cmd+R`).

To sync config/plugins without opening Xcode:

```bash
npm run cap:sync
```

## App icon and splash screen

Install the assets plugin:

```bash
npm install @capacitor/assets --save-dev
```

Place your source images in `assets/`:
- `assets/icon.png` — 1024x1024 px, no transparency
- `assets/splash.png` — 2732x2732 px

Generate all sizes:

```bash
npx capacitor-assets generate
```

Then re-sync: `npm run cap:sync`.

## Notes

- The `webDir` in `capacitor.config.ts` is set to `out` (Next.js static export
  output), but it is not used because `server.url` is configured to point at the
  live Vercel deployment.
- To switch to a fully offline/static build in the future, remove `server.url`
  from `capacitor.config.ts`, add `output: 'export'` to `next.config.js`, run
  `npm run build`, and then `npm run cap:sync`.
