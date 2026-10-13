# ZenNovel

> Write stories, not code. A web-based, low-code visual novel maker for writers.

ZenNovel is a visual novel maker that runs in the browser. It is inspired by Ren'Py, but built for **writers who don't code**: lines, branches and variables are edited with simple forms and cards, with a live preview right next to them.

**Live demo:** https://bigjackcn.github.io/zennovel/

## Features (v0.1)

- 📚 **Multiple projects**: create, open, delete, import and export projects (autosaved in the browser's IndexedDB; a project file contains its images, so it opens anywhere)
- ✍️ **Write like you're writing prose**: press Enter for the next line, Shift+Enter for a line break
- 👥 **Characters, variables and images**: manage them in their own panels; upload backgrounds and character expressions, see where each one is used before deleting it
- 🔀 **Choices**: each option can jump to a scene, change variables, or only appear under a condition
- 🧮 **Variables and if/else**: pick from dropdowns like "If [Courage] ≥ 1"; combine conditions with "all of / any of", nest if/else blocks
- ↶ **Undo / redo** for every edit (Ctrl+Z / Ctrl+Y, ⌘Z / ⌘⇧Z)
- 🎨 **Custom look**: dialogue box color, opacity, font size, corner radius, typing speed
- ▶️ **Live preview**: the editor preview uses the same player as exported games, with rollback; start from the line you're editing, the scene, or the beginning
- 🩺 **Story check**: finds broken jumps, unreachable scenes, scenes with no ending and variables used the wrong way; click an issue to jump to it
- 🗺️ **Story map**: every scene and where it leads, as a flowchart; drag scenes to arrange them, click one to edit it
- 📦 **Export a game**: one self-contained `index.html` (zipped, ready to upload to itch.io as an HTML game) with a title screen, save/load slots, autosave, a history of past lines and an Esc / right-click menu. "▶ Play" opens the same game in a new tab
- 💾 **Backups**: projects are marked when they have changes that haven't been exported; an exported game can be imported back as a project
- 🌐 **English / 中文**: switch the editor language any time; the sample story and the player's built-in buttons come in both languages

## Getting started

Requires Node.js 20+ and pnpm (run `corepack enable` to get it).

```bash
pnpm install
pnpm dev          # open http://localhost:5173
pnpm test         # run tests
pnpm typecheck    # type-check all packages
pnpm build        # build to packages/editor/dist
```

## Project structure

```
packages/
  core/      Project format (types), defaults, variable/condition logic, story checker (pure TS, no deps)
  runtime/   Story Engine (no DOM) + web Player, shared by the editor preview and exported games;
             game.ts adds the title screen / menus / saves, standalone.ts is an exported game's entry point
  editor/    React editor
    src/i18n/           UI text (en.ts is the source of truth, zh.ts must match it)
    public/templates/   Templates for new projects (one project.<lang>.json per language, shared assets)
```

### How "Export game" works

`packages/editor/vite.config.ts` has a small plugin: the first time the editor imports `virtual:zennovel-player`, it builds `packages/runtime/src/standalone.ts` (the player only, no React) into one minified script in memory. Export pastes that script, the project JSON and its images (already `data:` URLs) into a single `index.html`, so a game has no other files and works opened straight from disk.

### Design principles

1. **Data-driven**: a project is a single JSON document. The editor only edits data; the runtime only plays it. Anything loaded from outside (an imported file, an older project) goes through `normalizeProject` in core, which repairs or rejects it, so the rest of the code can trust the shape.
2. **Framework-free runtime**: an exported game needs only `runtime` + `project.json` + assets.
3. **Swappable storage**: the editor depends only on the `ProjectStorage` interface. The web build uses browser storage; a future desktop build (Tauri / Electron) just provides another implementation.
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
- [ ] Music and sound effects
- [ ] 9-slice frame images for the dialogue box
- [x] IndexedDB storage (for large assets)
- [x] Localization (English / Chinese)
- [ ] Desktop app (Tauri)

## License

[MIT](./LICENSE)
