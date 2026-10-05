# ZenNovel

> Write stories, not code. A web-based, low-code visual novel maker for writers.

ZenNovel is a visual novel maker that runs in the browser. It is inspired by Ren'Py, but built for **writers who don't code**: lines, branches and variables are edited with simple forms and cards, with a live preview right next to them.

**Live demo:** https://bigjackcn.github.io/zennovel/

## Features (v0.1)

- 📚 **Multiple projects**: create, open, delete, import and export projects (autosaved in the browser)
- ✍️ **Write like you're writing prose**: press Enter for the next line, Shift+Enter for a line break
- 🔀 **Choices**: each option can jump to a scene, change variables, or only appear under a condition
- 🧮 **Variables and if/else**: pick from dropdowns like "If [Courage] ≥ 1" instead of typing expressions
- 🎨 **Custom look**: dialogue box color, opacity, font size, corner radius, typing speed
- ▶️ **Live preview**: the editor preview uses the same player as exported games, with rollback
- 🩺 **Story check**: finds broken jumps, unreachable scenes and scenes with no ending
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
  runtime/   Story Engine (no DOM) + web Player, shared by the editor preview and exported games
  editor/    React editor
    src/i18n/           UI text (en.ts is the source of truth, zh.ts must match it)
    public/templates/   Templates for new projects (one project.<lang>.json per language, shared assets)
```

### Design principles

1. **Data-driven**: a project is a single JSON document. The editor only edits data; the runtime only plays it.
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

- [ ] Panels for managing characters, assets and variables (upload your own images)
- [ ] Story map: view and edit scene connections as a flowchart
- [ ] Undo / redo
- [ ] Save / load screens and dialogue history
- [ ] Export as a standalone web game (zip, ready for itch.io)
- [ ] Music and sound effects
- [ ] 9-slice frame images for the dialogue box
- [ ] IndexedDB storage (for large assets)
- [x] Localization (English / Chinese)
- [ ] Desktop app (Tauri)

## License

[MIT](./LICENSE)
