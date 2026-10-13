import type { Project } from '@zennovel/core';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * One self-contained HTML page that plays the project: the game player
 * script, the project data and (as data: URLs) its images. Works opened
 * straight from disk or uploaded to itch.io.
 */
export function buildGameHtml(project: Project, playerScript: string): string {
  // `<` is escaped so story text like "</script>" can't end the data block early.
  const data = JSON.stringify(project).replace(/</g, '\\u003c');
  const script = playerScript.replace(/<\/script/gi, '<\\/script');
  const lang = project.meta.locale === 'zh' ? 'zh-CN' : 'en';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="ZenNovel">
<title>${escapeHtml(project.meta.name || 'ZenNovel')}</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#game{position:fixed;inset:0}</style>
</head>
<body>
<div id="game"></div>
<script type="application/json" id="zennovel-project">${data}</script>
<script>${script}</script>
</body>
</html>
`;
}

/** The project JSON inside an exported game page, or null if this isn't one. */
export function projectJsonFromGameHtml(html: string): string | null {
  return /<script type="application\/json" id="zennovel-project">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? null;
}

/** A file name that works on Windows, macOS and Linux. */
export function safeFileName(name: string, fallback = 'zennovel-game'): string {
  const cleaned = Array.from(name, (c) => (c.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(c) ? ' ' : c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  return cleaned.slice(0, 80) || fallback;
}
