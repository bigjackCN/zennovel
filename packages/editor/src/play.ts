/**
 * The "play" page (play/?story=dalie): a sample story as a finished game,
 * straight from the site, without opening the editor. Assets load from the
 * sample's folder rather than being embedded.
 */
import { normalizeProject, type Locale } from '@zennovel/core';
import { mountGame } from '@zennovel/runtime';
import { isSampleId, sampleUrl } from './state/samples';

const params = new URLSearchParams(window.location.search);
const lang = params.get('lang');
const locale: Locale = lang === 'en' || lang === 'zh' ? lang : navigator.language.startsWith('zh') ? 'zh' : 'en';
const container = document.getElementById('game')!;

function message(text: string) {
  container.replaceChildren();
  const box = document.createElement('div');
  box.className = 'play-message';
  const p = document.createElement('p');
  p.textContent = text + ' ';
  const back = document.createElement('a');
  back.href = import.meta.env.BASE_URL;
  back.textContent = locale === 'zh' ? '回到 ZenNovel' : 'Back to ZenNovel';
  p.append(back);
  box.append(p);
  container.append(box);
}

async function boot() {
  const id = params.get('story') ?? 'dalie';
  if (!isSampleId(id))
    return message(locale === 'zh' ? `没有叫「${id}」的示例故事。` : `There is no sample story called "${id}".`);
  const url = sampleUrl(id, locale);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = normalizeProject(await res.json());
    if (!result.ok) throw new Error(result.error.code);
    document.title = result.project.meta.name || document.title;
    document.documentElement.lang = result.project.meta.locale === 'zh' ? 'zh-CN' : 'en';
    mountGame(container, result.project, { assetBase: url.href });
  } catch (e) {
    message(
      (locale === 'zh' ? '故事加载失败：' : 'The story could not be loaded: ') +
        (e instanceof Error ? e.message : String(e)),
    );
  }
}

void boot();
