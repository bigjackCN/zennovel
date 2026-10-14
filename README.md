# ZenNovel

Write stories, not code. A visual novel maker for writers.

**[Website](https://bigjackcn.github.io/zennovel/)** · **[Download](https://github.com/bigjackCN/zennovel/releases/latest)** · **[Play The Great Rift (大裂) in your browser](https://bigjackcn.github.io/zennovel/play/?story=dalie&lang=en)**

## Features

- Write line by line in cards; choices, variables and branches are picked from menus
- Live preview that plays exactly like the finished game
- Backgrounds, characters, music and sound effects
- Export for the web and itch.io, Windows and Linux, and Steam (achievements, cloud saves)
- Each story is a plain folder: `project.json` + `assets/`
- English and Chinese

## Develop

Requires Node.js 20+ and pnpm.

```bash
pnpm install
pnpm desktop      # run the desktop app
pnpm dev          # or run the editor in the browser (http://localhost:5173)
pnpm test
```

| Package                | What it is                                              |
| ---------------------- | ------------------------------------------------------- |
| `packages/core`        | Project format and story checker                        |
| `packages/runtime`     | Story engine and game player                            |
| `packages/editor`      | The editor (React)                                      |
| `packages/desktop`     | Desktop app (Electron): project folders, game export    |
| `packages/shell-tauri` | The small game player for "Small" exports (Rust, Tauri) |
| `site/`                | The website                                             |

Releases: push a `desktop-v*` tag to build the installers, and `shell-tauri-v1` to publish the small player. Publishing a game on Steam: [docs/STEAM.md](docs/STEAM.md).

## License

[MIT](./LICENSE)
