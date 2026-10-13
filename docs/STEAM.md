# Publishing on Steam

ZenNovel can't do the Steamworks paperwork for you (store page, fee, review),
but it gives you builds that are ready to upload.

## 1. Export

In the desktop app: **Export game** → tick **Windows · Standard** (and
**Linux · Standard** if you want a native Steam Deck / Linux build) → tick
**Prepare for Steam** and enter your **App ID** → **Export…**

The export folder then has `windows-x64/` and `linux-x64/`. Each is a
complete game: upload the folder's contents as a depot. They contain:

| File                                       | What it is                                            |
| ------------------------------------------ | ----------------------------------------------------- |
| `<Game>.exe` / `<Game>`                    | the game                                              |
| `resources/app/game/`                      | your story, pictures and music                        |
| `resources/app/steam.json`                 | your App ID, so the game connects to Steam            |
| `resources/app/node_modules/steamworks.js` | the Steam API                                         |
| `steam_appid.txt`                          | only for testing outside Steam; harmless in a release |

Without **Prepare for Steam** the builds don't talk to Steam at all (fine for
itch.io and your own site).

## 2. Achievements

Add an **Achievement** step where the player earns it (e.g. at an ending).
Enter the achievement's **API name** exactly as in Steamworks →
Stats & Achievements (letters, digits and `_`, e.g. `ENDING_TRUE`), and the
name players should see.

- In a Steam build, Steam unlocks it and shows its own pop-up.
- Everywhere else (web, itch.io, builds without Steam) players see a small
  "Achievement unlocked" notice instead.

## 3. Steam Cloud

Saves are ordinary files, one per slot:

| System             | Folder                    |
| ------------------ | ------------------------- |
| Windows            | `%APPDATA%\<Game>\saves\` |
| Linux / Steam Deck | `~/.config/<Game>/saves/` |

`<Game>` is the game's name as in ZenNovel. In Steamworks → Steam Cloud →
**Auto-Cloud**, add one root per system:

- Windows: root `WinAppDataRoaming`, subdirectory `<Game>/saves`, pattern `*.json`
- Linux: root `LinuxHome`, subdirectory `.config/<Game>/saves`, pattern `*.json`

No code is needed: Steam syncs the folder before and after each session.

## 4. Steam Deck

The Linux build runs natively. The standard build turns off Chromium's
sandbox on Linux, which the Steam Linux Runtime doesn't allow. The Windows
build also runs through Proton.

## Notes

- Exported Windows programs still carry Electron's icon; a custom icon is on
  the roadmap.
- The Steam overlay (Shift+Tab) is switched on by steamworks.js. Test it in
  your game before release.
