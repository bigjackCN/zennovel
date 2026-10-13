/**
 * Entry point of an exported game. The editor's "Export game" bundles this
 * file (and nothing from React or the editor) into a single index.html,
 * next to the project data:
 *
 *   <div id="game"></div>
 *   <script type="application/json" id="zennovel-project">{…}</script>
 *   <script>…this bundle…</script>
 */
import { normalizeProject } from '@zennovel/core';
import { mountGame } from './game';

function fail(message: string) {
  document.body.textContent = message;
  document.body.style.cssText = 'margin:0;padding:40px;font:16px system-ui;color:#fff;background:#111';
}

function boot() {
  const container = document.getElementById('game');
  const data = document.getElementById('zennovel-project')?.textContent;
  if (!container || !data) return fail('ZenNovel: no game data found in this page.');
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return fail('ZenNovel: the game data in this page is damaged.');
  }
  const result = normalizeProject(raw);
  if (!result.ok) return fail('ZenNovel: this game was made with a newer version of ZenNovel.');
  document.title = result.project.meta.name || document.title;
  mountGame(container, result.project);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
