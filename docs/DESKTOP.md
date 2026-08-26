# DraftPredict Desktop (`apps/desktop`)

The Electron shell. It bundles the DraftPredict server, the web UI, a tray
icon and a compact champ-select overlay into a single application that you
launch once and forget about while you play.

- **One process.** The Fastify server from `@draftpredict/server` runs *inside*
  the Electron main process (`createApp` is exported for exactly this). There
  is no child process to supervise, no port handshake, and the League Client
  events are available in-process for the champ-select behaviour.
- **The renderer is a normal web client.** It talks to
  `http://127.0.0.1:<port>` over HTTP/WebSocket like the browser build does.
  The only extra thing it gets is a small, fixed `window.draftpredict` bridge.
- **The League Client integration is read-only.** See
  [What the app does and does not do with the League Client](#what-the-app-does-and-does-not-do-with-the-league-client).

---

## Running it in development

```bash
# once: build the workspace packages the shell depends on
npm run build -w @draftpredict/core -w @draftpredict/data \
              -w @draftpredict/riot -w @draftpredict/lcu -w @draftpredict/server

# terminal 1 — the Vite dev server for the UI
npm run dev:web            # http://localhost:5173

# terminal 2 — the Electron shell (loads the Vite server, hot reload included)
npm run desktop            # = npm run dev -w @draftpredict/desktop
```

`npm run dev -w @draftpredict/desktop` compiles `src/` and then starts Electron
with `DRAFTPREDICT_DEV=1` (`scripts/dev.mjs` sets it, so the command behaves
the same in cmd.exe, PowerShell and a POSIX shell).

To run the shell against the **bundled** UI instead of Vite:

```bash
npm run build -w @draftpredict/web
npm run start -w @draftpredict/desktop     # no DRAFTPREDICT_DEV, loads http://127.0.0.1:4700
```

If `apps/web/dist` does not exist, the window shows a short "interface non
compilée" page instead of a bare API 404.

### Environment variables

| Variable | Effect |
| --- | --- |
| `DRAFTPREDICT_DEV=1` | Load `http://localhost:5173`, keep the menu bar and the devtools. |
| `DRAFTPREDICT_DEV_URL` | Override that dev URL. |
| `DRAFTPREDICT_PORT` | Port for the embedded server (otherwise the one in `~/.draftpredict/config.json`, default 4700). |
| `DRAFTPREDICT_WEB_ROOT` | Serve the UI from this directory. |
| `DRAFTPREDICT_UPDATE_FEED` | `https://` auto-update feed. **Unset by default — no update check happens at all.** |
| `LOG_LEVEL` | Fastify/pino level; the shell defaults to `warn`. |

### Where the files live

| Path | Owner | Contents |
| --- | --- | --- |
| `~/.draftpredict/config.json` (0600) | server | Riot API key, region, rank, risk level… |
| `<userData>/preferences.json` | shell | tray/window preferences (booleans only) |
| `<userData>/window-state.json` | shell | remembered window and overlay geometry |

`<userData>` is `%APPDATA%/DraftPredict` on Windows,
`~/Library/Application Support/DraftPredict` on macOS and
`~/.config/DraftPredict` on Linux. The shell never writes the Riot API key —
it never sees it; the key stays server-side and is redacted from every response
and log.

---

## What the window does

- **Main window** — 1280×860, minimum 1024×700, dark (`#0b0f19`) background so
  there is no white flash before the UI paints, menu bar hidden outside
  development.
- **Single instance.** A second launch does not start a second server: it wakes
  the window that already exists (`requestSingleInstanceLock` +
  `second-instance`).
- **Closing hides to the tray** (preference `minimizeToTray`, on by default).
  The app keeps watching the League Client while you play. "Quitter" in the
  tray menu is what actually exits.
- **Graceful shutdown.** `before-quit` is deferred until the Fastify server has
  closed its sockets (5 s ceiling, then a hard exit).

### Tray menu

```
Client League : <état>          (disabled status line)
─────────────────────────────
Afficher / Masquer
Aperçu compact (overlay)        ☑
─────────────────────────────
Démarrer avec le client League  ☐
Afficher automatiquement en champ select   ☑
Utiliser l'aperçu compact en champ select  ☐
─────────────────────────────
Quitter
```

- **Démarrer avec le client League** registers the app as a login item
  (`app.setLoginItemSettings`, hidden, `--hidden` — the app then starts straight into the tray without stealing focus). Electron only implements
  login items on **Windows and macOS**; on Linux the preference is remembered
  but does nothing — add the `.desktop` entry to `~/.config/autostart`
  yourself. It is also a no-op for an unpackaged dev run, so a development
  session cannot silently register itself at login.
- **Afficher automatiquement en champ select** brings the window (or the
  overlay, if the third option is on) to the front **once per champ select**,
  never on every pick — the server already debounces the client's update bursts
  and the shell will not fight you for focus.

### Compact overlay

A small frameless always-on-top window (340×420 by default, resizable, drag it
by its header) that shows just the win probability and the five best
suggestions. Toggle it from the tray or from the UI
(`window.draftpredict.overlay.control("toggle")`).

It is a **self-contained page** shipped with the shell
(`apps/desktop/static/overlay.html`); it subscribes to the server's documented
`/ws` protocol (`lcu`, `champselect` topics) directly, so it works even with
the main window closed, and it shows the "données de démonstration hors-ligne"
provenance warning when the dataset is the bundled fixture.

Its window level is `screen-saver` and it is marked visible on all workspaces
and over full screen. **Caveat, not a bug:** no Electron window can draw on top
of a game running in *exclusive* fullscreen. Run League in borderless /
windowed mode if you want the overlay on the same screen — otherwise put it on
a second monitor.

---

## The renderer bridge (`window.draftpredict`)

`contextIsolation: true`, `nodeIntegration: false`, `webviewTag: false`,
permission requests denied, `window.open` denied, navigation restricted to the
embedded server (and the Vite dev server in development). `sandbox` is `false`
for one reason only: Electron loads ES-module preload scripts only in
unsandboxed preloads. The preload itself imports nothing but `electron`,
exposes no generic `invoke(channel, …)` escape hatch and has no filesystem
access — `apps/desktop/src/__tests__/preload.channels.test.ts` enforces all
three.

```ts
window.draftpredict?: {
    getAppInfo(): Promise<AppInfo>;              // versions, platform, serverUrl, dev, overlay
    openExternal(url): Promise<boolean>;         // https:// only, no credentials — else false
    window.control(action): Promise<void>;       // minimize | maximize | toggle-maximize | hide | close
    overlay.control(action): Promise<OverlayState>;   // show | hide | toggle | state
    overlay.onChange(cb): () => void;
    preferences.get() / .set(patch) / .onChange(cb);
    updates.status() / .check() / .onChange(cb);
}
```

The bridge is **optional**: the same UI runs in a plain browser, so feature
detect (`if (window.draftpredict)`) instead of assuming Electron. The types
live in `apps/desktop/src/bridge.ts`; the global `Window` augmentation is
opt-in via `/// <reference path=".../renderer.d.ts" />`.

Every external link must go through `openExternal`, which refuses anything that
is not a credential-free `https://` URL (`http:`, `file:`, `javascript:`,
`data:`, `ms-settings:`, … are all rejected) and then hands it to the OS
browser.

### Auto-updates

`updates.status()` reports `disabled` unless `DRAFTPREDICT_UPDATE_FEED` names
an `https://` feed **and** the app is packaged **and** the platform is Windows
or macOS. There is no default feed: the shell does not contact an update server
nobody configured. Linux AppImage users update through whatever they installed
the AppImage with. Error messages have URLs stripped before they reach the UI,
so a signed feed URL cannot leak into a log or a toast.

---

## Packaging

> **Not built here.** The development container cannot download Electron's
> prebuilt binaries and holds no signing identity, so `electron-builder` was
> never executed against this configuration. `electron-builder.yml` is written
> to be correct; the first real run on a developer machine is what will prove
> it.

```bash
npm run build -w @draftpredict/web          # the UI bundle (copied to resources/web)
npm run build -w @draftpredict/desktop      # tsc + dist/preload.mjs

npm run package:win   -w @draftpredict/desktop   # nsis installer + portable .exe (x64)
npm run package:mac   -w @draftpredict/desktop   # dmg, arm64 and x64
npm run package:linux -w @draftpredict/desktop   # AppImage (x64)
```

Artifacts land in `apps/desktop/release/`:

| Target | Artifact |
| --- | --- |
| Windows NSIS | `DraftPredict-<version>-win-x64-nsis.exe` (per-user, choosable install dir) |
| Windows portable | `DraftPredict-<version>-win-x64-portable.exe` |
| macOS | `DraftPredict-<version>-mac-arm64.dmg`, `…-mac-x64.dmg` |
| Linux | `DraftPredict-<version>-linux-x64.AppImage` |

Notes on the configuration:

- **asar is enabled.** The bundled Data Dragon snapshot
  (`node_modules/@draftpredict/data/assets/**`) is unpacked because it is read
  with plain `fs` calls, and the web bundle is shipped as `extraResources` to
  `resources/web` so Fastify serves ordinary files rather than archive members.
  `resolveWebRoot()` in `src/server.ts` looks there first.
- **Icons.** `apps/desktop/build/icon.png` is a generated 512×512
  **placeholder**; electron-builder derives the `.ico`/`.icns` from it. Replace
  it with the final artwork before shipping. The tray and window icons are
  embedded as base64 in `src/icons.ts` — a tray icon that fails to load from
  disk is an invisible tray entry, which is a miserable bug to diagnose.
- **Signing.** No certificate is referenced. Unsigned Windows builds show a
  SmartScreen prompt and unsigned macOS builds require a right-click → Open (or
  a notarized build with `CSC_LINK`/`APPLE_ID` set in the environment).
- **Workspace dependencies.** `@draftpredict/*` are npm-workspace symlinks in
  the repo-root `node_modules`; electron-builder follows them and copies the
  real files. Build every dependency (`npm run build`) before packaging — only
  `dist/` is shipped, never `src/`.
- `publish: null` — no release channel is configured yet.

---

## What the app does and does not do with the League Client

DraftPredict is a **read-only companion**. This section is deliberately precise
because it is what decides whether the app is acceptable under Riot's Terms of
Service.

### It does

- **Read the League Client's local API (LCU) on `127.0.0.1`**, authenticated
  with the credentials the client itself writes to its `lockfile` on your own
  machine. It reads exactly: the gameflow phase, the current champ-select
  session (picks, bans, hovers, timer, assigned positions) and your summoner
  identity (name, level, puuid) to prefill the account view.
- **Compute statistics locally** from that read-only snapshot and show them —
  win probability, suggestions, ban suggestions, builds.
- **Bring a window to the front** when champ select starts, if you enabled that
  preference. That is the extent of its "automation": it moves *its own*
  window, never anything belonging to the game.
- **Talk to the Riot Games public API** (only if you configure a key), from the
  server process, with a rate limiter that honours the published limits.

### It does not

- **No writes to the League Client.** Not a single `POST`, `PATCH` or `DELETE`
  to the LCU. It cannot pick, ban, hover, ready-up, dodge, accept a queue,
  swap a role, apply a rune page or write an item set.
- **No input injection, no automation of the game.** No synthetic keyboard or
  mouse events, no window scripting of the client, no macros. It never reads
  or writes the game's memory and never attaches to the game process.
- **No overlay drawn inside the game.** The compact overlay is an ordinary
  always-on-top OS window next to the client; it does not hook, inject into or
  render inside League of Legends, and it shows nothing you could not see on
  your own screen.
- **No live-game advantage.** All data comes from champ select and from public
  post-game/aggregate statistics. Nothing is read from a game in progress
  beyond what Riot's own public spectator endpoint exposes.
- **No telemetry, no account credentials.** The shell sends nothing anywhere by
  default: the server is bound to `127.0.0.1`, there is no analytics call, no
  crash reporter and no update feed unless you configure one. Your Riot
  password is never requested (the LCU lockfile is the only credential
  involved, and it is local and rotated by the client itself).
- **No third-party data unless you allow it.** Dataset downloads are opt-in via
  the `allowRemoteDataset` setting; otherwise DraftPredict runs entirely on the
  bundled snapshot and the offline demo dataset (clearly labelled as such in
  the UI).

If the League Client is not running, is not readable, or the integration is
switched off, the app degrades to a plain manual draft board — the watcher
never throws and a client-side failure can never take the server down.

---

## Verified / not verified

Written and checked in a container **without a working Electron runtime** (the
binaries cannot be downloaded there), so, honestly:

- **Verified**: the whole package typechecks (`tsc -b`), lints, the preload
  compiles to a self-contained `dist/preload.mjs`, and the embedded server was
  started in-process with plain Node — `/api/health` answers, a draft analysis
  returns, the configured-port collision falls back to an ephemeral port and
  `close()` shuts everything down. Unit tests cover the URL policy, the
  preferences store and the preload/bridge channel parity.
- **Not verified**: anything that needs Electron itself to run — window
  creation, the tray menu, the overlay rendering, the login-item registration —
  and every `electron-builder` output. Those need a first pass on a real
  developer machine per OS.
