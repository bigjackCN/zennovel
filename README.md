# ZenNovel

> Write stories, not code. A web-based, low-code visual novel maker for writers.

ZenNovel is a visual novel maker that runs in the browser. It is inspired by Ren'Py, but built for **writers who don't code**: lines, branches and variables are edited with simple forms and cards, with a live preview right next to them.

**Live demo:** https://bigjackcn.github.io/zennovel/ (the editor; a first visit finds 《大裂》 already in "My stories")

**Play the sample story:** https://bigjackcn.github.io/zennovel/play/?story=dalie (《大裂》, an interactive adaptation in Chinese: 44 scenes, four endings, illustrated and scored)

## Features (v0.1)

- 📚 **Multiple projects**: create, open, delete, import and export projects (autosaved in the browser's IndexedDB; a project file contains its images, so it opens anywhere)
- ✍️ **Write like you're writing prose**: press Enter for the next line, Shift+Enter for a line break
- 👥 **Characters, variables and media**: manage them in their own panels; upload backgrounds, character expressions, music and sound effects, see where each one is used before deleting it
- 🔀 **Choices**: each option can jump to a scene, change variables, or only appear under a condition
- 🧮 **Variables and if/else**: pick from dropdowns like "If [Courage] ≥ 1"; combine conditions with "all of / any of", nest if/else blocks
- ↶ **Undo / redo** for every edit (Ctrl+Z / Ctrl+Y, ⌘Z / ⌘⇧Z)
- 🎨 **Custom look**: dialogue box color, opacity, font size, corner radius, typing speed
- ▶️ **Live preview**: the editor preview uses the same player as exported games, with rollback; start from the line you're editing, the scene, or the beginning
- 🩺 **Story check**: finds broken jumps, unreachable scenes, scenes with no ending and variables used the wrong way; click an issue to jump to it
- 🎵 **Music and sound effects**: background music that crossfades between tracks and carries across scenes, one-shot sound effects, per-game volume settings for players; the preview is muted until you turn sound on
- 🗺️ **Story map**: every scene and where it leads, as a flowchart; drag scenes to arrange them, click one to edit it
- 📦 **Export a game**: one self-contained `index.html` (zipped, ready to upload to itch.io as an HTML game) with a title screen, save/load slots, autosave, a history of past lines and an Esc / right-click menu. "▶ Play" opens the same game in a new tab
- 💾 **Backups**: projects are marked when they have changes that haven't been exported; an exported game can be imported back as a project
- 🌐 **English / 中文**: switch the editor language any time; the short sample story and the player's built-in buttons come in both languages
- 🖥️ **Desktop app** (Windows, macOS, Linux): projects are folders on disk (`project.json` + `assets/`), media is copied in as files with no size limit, and a project folder can be opened from anywhere
- 🎮 **Games for every channel**: export for your own website and itch.io (HTML5), and as Windows / Linux programs in two flavours: _standard_ (Electron, looks the same everywhere, Steam-ready with achievements and file saves for Steam Cloud) or _small_ (Tauri, about 10 MB)
- 🏆 **Achievements**: an "Achievement" step unlocks a Steam achievement in Steam builds and shows a notice everywhere else
- 📖 **Two samples to start from**: a short bilingual demo, and 大裂, a longer branching adaptation in Chinese (44 scenes, four endings, 31 backgrounds, 14 characters, original score) that shows variables, conditions, art and music at scale. Both can be played straight from `play/?story=<id>` without opening the editor

## Getting started

Requires Node.js 20+ and pnpm (run `corepack enable` to get it).

```bash
pnpm install
pnpm dev          # open http://localhost:5173
pnpm test         # run tests
pnpm typecheck    # type-check all packages
pnpm build        # build to packages/editor/dist
```

### Desktop app

```bash
pnpm desktop      # build the editor and open it in the desktop app
pnpm desktop:dev  # the same, with the Vite dev server (instant reload)
pnpm desktop:dist # make an installer in packages/desktop/release (for the system you're on)
```

Installers for Windows, macOS and Linux are built by the **Desktop app** workflow (run it from the Actions tab, or push a `desktop-v*` tag to attach them to a release).

When exporting, the desktop app downloads the Electron release that matches its own version for the target system once (from GitHub, or the npmmirror mirror) and keeps it in its cache. The _small_ builds use the prebuilt player from `packages/shell-tauri`: run the **Tauri player** workflow with the tag `shell-tauri-v1` to publish it. Publishing on Steam is described in [docs/STEAM.md](docs/STEAM.md).

## Project structure

```
packages/
  core/      Project format (types), defaults, variable/condition logic, story checker (pure TS, no deps)
  runtime/   Story Engine (no DOM) + web Player, shared by the editor preview and exported games;
             game.ts adds the title screen / menus / saves, standalone.ts is an exported game's entry point
  editor/    React editor
    src/i18n/           UI text (en.ts is the source of truth, zh.ts must match it)
    public/templates/   Templates for new projects (one project.<lang>.json per language, shared assets)
    play/               play/?story=<id>: a sample played as a finished game (src/play.ts)
  desktop/   Electron app: project folders (projects.ts), media import, game export (export.ts, zip.ts),
             and shell/, the program inside every standard desktop game
  shell-tauri/  Rust: the small game player (serves game/ next to the executable in the system web view)
```

### How "Export game" works

`packages/editor/vite.config.ts` has a small plugin: the first time the editor imports `virtual:zennovel-player`, it builds `packages/runtime/src/standalone.ts` (the player only, no React) into one minified script in memory. Export pastes that script, the project JSON and its images (already `data:` URLs) into a single `index.html`, so a game has no other files and works opened straight from disk.

### Design principles

1. **Data-driven**: a project is a single JSON document. The editor only edits data; the runtime only plays it. Anything loaded from outside (an imported file, an older project) goes through `normalizeProject` in core, which repairs or rejects it, so the rest of the code can trust the shape.
2. **Framework-free runtime**: an exported game needs only `runtime` + `project.json` + assets.
3. **Swappable storage**: the editor depends only on the `ProjectStorage` interface. The web build uses browser storage; the desktop app provides folders on disk through `window.zennovelDesktop`.
4. **Human-friendly errors**: writers should see "Option points to a scene that does not exist", never a stack trace.

### Adding a language

1. Add the code to `Locale` in `packages/core/src/types.ts`.
2. Copy `packages/editor/src/i18n/zh.ts` to a new file and translate it. The `Messages` type makes any missing key a compile error.
3. Register it in `messages` and `localeNames` in `packages/editor/src/i18n/index.tsx`.
4. Add the player's strings in `packages/runtime/src/strings.ts`.
5. Optionally add `project.<code>.json` to each template in `packages/editor/public/templates/`.

## Roadmap

- [x] Panels for managing characters, assets and variables (upload your own images)
- [x] Story map: view and edit scene connections as a flowchart
- [x] Undo / redo
- [x] Save / load screens and dialogue history
- [x] Export as a standalone web game (zip, ready for itch.io)
- [x] Music and sound effects
- [ ] 9-slice frame images for the dialogue box
- [x] IndexedDB storage (for large assets)
- [x] Localization (English / Chinese)
- [x] Desktop app, with export to Windows / Linux games (Electron or Tauri) and Steam
- [ ] Windows icon and version info on exported games
- [ ] Video cutscenes, timed waits, sprite movement
- [ ] A status bar for variables (e.g. affection meters)

## License

[MIT](./LICENSE)
