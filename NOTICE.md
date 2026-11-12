# Notice of modification

Digitceed AI is a modified version of **Locally Uncensored**, Copyright (c) 2026 PurpleDoubleD, licensed under the GNU Affero General Public License v3.0 only (see [LICENSE](LICENSE)).

- Original source: https://github.com/PurpleDoubleD/locally-uncensored
- Based on: commit `3dff4291f8ad5a86078679e23c7a0a2cd2adf9b3` of 2026-11-09 (version 3.0.10)
- Modified by: Digitceed (https://digitceed.com)
- Date of modification: 2026-11-12

The modifications are released under the same license, AGPL-3.0-only.

## What was changed

**Name**

- "Locally Uncensored" and the short name "LU" became "Digitceed AI" in the desktop app: window title, installer, interface texts, messages of the Rust backend, the bundled Python helpers and the texts sent to models.
- The names "LU Cloud" and "LU Labs" were kept: they name the hosted service of the original maker and its company.
- Internal names were kept on purpose: the crate and package name `locally-uncensored`, storage keys, the `x-locally-uncensored` request header, the engine file `lu-llama-server` and the protocol words the engine and the phone app exchange with the desktop (`"app": "LU"`, `LU norm`, `LU: unsupported model`).

**Identity on disk**

- App identifier: `com.purpledoubled.locally-uncensored` became `com.digitceed.ai`.
- Data folders: `lu-labs` became `digitceed-ai`, `locally-uncensored` became `digitceed-ai-config`, `Locally Uncensored` became `Digitceed AI` (`src-tauri/src/app_identity.rs`, `src/lib/app-identity.ts`).
- Keychain service: `com.digitceed.ai.providerkeys`.
- Link scheme: `locallyuncensored://` became `digitceedai://`.
- Outgoing `User-Agent`: `DigitceedAI/<version>`.

**Logo**

- New app icon, in-app mark, favicons and Windows installer art (`src-tauri/icons`, `public`, `logos`). The original logo files were removed.

**Updater**

- The update check is switched off (`UPDATES_ENABLED` in `src/stores/updateStore.ts`) and the update address in `src-tauri/tauri.conf.json` points nowhere. Settings shows the version and a note instead of the update controls.

**Cloud**

- "Cloud features in Local mode" is off by default (`src/lib/constants.ts`), and the Cloud switch in the header shows only when that setting is on (`src/components/layout/Header.tsx`).

**Installer**

- The step in `src-tauri/windows/installer-hooks.nsh` that removed an installed copy under an earlier product name was taken out, so this installer never touches an installed copy of the original app.

**Repository**

- The original project's GitHub workflows (release, signing, announcements, CI) were removed and replaced by one workflow that builds an unsigned Windows installer.
- `README.md` is new; the original is kept as `README.upstream.md`.

Not changed: the phone apps, the website under `docs/`, the release scripts under `scripts/` and the changelog.
