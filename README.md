<p align="center">
  <img src="logos/digitceed-ai-icon.png" width="120" alt="Digitceed AI">
</p>

# Digitceed AI

A local AI studio for the desktop: chat, image and video generation and a coding agent in one app, running on your own machine.

Digitceed AI is a **modified version of [Locally Uncensored](https://github.com/PurpleDoubleD/locally-uncensored)** by PurpleDoubleD, based on its source as of 2026-11-09 (commit `3dff4291`, version 3.0.10). It is licensed under **AGPL-3.0-only**, like the original. What was changed is listed in [NOTICE.md](NOTICE.md). The original project's README is kept as [README.upstream.md](README.upstream.md); it describes the features, the supported models and the hardware needs, which are the same here.

## What is different from the original

- Name, logo and icons are Digitceed AI.
- It installs next to the original without sharing anything: its own app identifier, data folders, keychain entry and link scheme (`digitceedai://`).
- The built-in updater is off. The original updater would replace this build with the original app. To update, install a newer Digitceed AI installer over the old one.
- LU Cloud, the paid hosted service of LU Labs, is hidden by default. It can be turned on in Settings, General ("Cloud features in Local mode"). It remains a service of LU Labs, not of Digitceed.

## Build the Windows installer

The repository has one workflow, [Build Digitceed AI (Windows installer)](.github/workflows/build-windows.yml):

1. Open the repository on GitHub, tab **Actions**.
2. Pick **Build Digitceed AI (Windows installer)** and press **Run workflow**.
3. When the run is done, download **Digitceed-AI-windows-installer** under **Artifacts** on the run page.

The first run builds the bundled llama.cpp engine and the app from source and takes about an hour. The installer is not code signed, so Windows SmartScreen shows a warning the first time it is started.

To build on your own machine instead (Node 22, Rust, the Vulkan SDK and the Visual Studio C++ build tools are needed):

```
npm ci
bash scripts/build-llama.sh x86_64-pc-windows-msvc
npx tauri build --bundles nsis
```

## Not covered by this fork

- The phone apps (Android, iPhone): their sources are in the tree but still carry the original name and identifiers.
- Linux and macOS packages: the name and icons are changed there too, but only the Windows build has a workflow.
- The original project's test suite: some of its tests check for the original name and have not been adapted.

## License

AGPL-3.0-only, see [LICENSE](LICENSE). If you give this program to someone else, or let people use it over a network, the AGPL requires that you offer them the source of exactly that version, under the same license.
