import type { Locale } from '@zennovel/core';

/** The sample stories shipped in public/templates/<id>/. */
export const sampleIds = ['demo', 'dalie'] as const;
export type SampleId = (typeof sampleIds)[number];

export const isSampleId = (id: string | null): id is SampleId => sampleIds.includes(id as SampleId);

/**
 * Languages each sample ships in (one project.<locale>.json per language).
 * A sample written in only one language opens in that language whatever the UI language is.
 */
const sampleLocales: Record<SampleId, readonly [Locale, ...Locale[]]> = {
  demo: ['en', 'zh'],
  dalie: ['zh'],
};

/** The project file to load for a sample: the UI language if the sample has it, else its first language. */
export function sampleFileLocale(id: SampleId, locale: Locale): Locale {
  const available = sampleLocales[id];
  return available.includes(locale) ? locale : available[0];
}

/** Absolute URL of a sample's project file (its assets sit next to it). */
export function sampleUrl(id: SampleId, locale: Locale): URL {
  return new URL(
    `${import.meta.env.BASE_URL}templates/${id}/project.${sampleFileLocale(id, locale)}.json`,
    window.location.href,
  );
}

/** Link to the page that plays a sample straight away, without the editor. */
export const playUrl = (id: SampleId) => `${import.meta.env.BASE_URL}play/?story=${id}`;
