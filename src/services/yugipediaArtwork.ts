// Yugipedia artwork service
//
// Three sequential Yugipedia API calls per card (1 req/sec, cached 30 min):
//
// 1) Wikitext  — parses "| image =" section for set → artwork index mapping
// 2) Gallery   — fetches "Card gallery:CardName" image list (all filenames)
// 3) Imageinfo — resolves EN/NA filenames to real CDN URLs in one batch
//
// Falls back gracefully (empty maps) on any error.

const CACHE_TTL = 30 * 60 * 1000;
const CACHE_KEY = (name: string) => `ygo-data2-${name}`;
let lastFetchAt = 0;

// TCG English region codes used in Yugipedia filenames
const EN_REGIONS = new Set(['EN', 'NA', 'AE']);

export const RARITY_CODE: Record<string, string> = {
  'Common':                                   'C',
  'Rare':                                     'R',
  'Short Print':                              'SP',
  'Super Short Print':                        'SSP',
  'Super Rare':                               'SR',
  'Ultra Rare':                               'UR',
  'Secret Rare':                              'ScR',
  'Ultimate Rare':                            'UtR',
  'Ghost Rare':                               'GhR',
  'Parallel Rare':                            'PR',
  'Gold Rare':                                'GR',
  'Gold Secret Rare':                         'GScR',
  'Prismatic Secret Rare':                    'PScR',
  'Starlight Rare':                           'StR',
  'Platinum Secret Rare':                     'PlScR',
  "Collector's Rare":                         'CR',
  'Quarter Century Secret Rare':              'QCScR',
  'Premium Gold Rare':                        'PGR',
  'Duel Terminal Normal Parallel Rare':       'DTNPR',
  'Duel Terminal Rare Parallel Rare':         'DTRPR',
  'Duel Terminal Super Rare Parallel Rare':   'DTSRPR',
  'Duel Terminal Ultra Rare Parallel Rare':   'DTURPR',
};

export interface GalleryEntry { baseUrl?: string; altUrl?: string }

export interface YugipediaData {
  artMap:     Map<string, number>;
  galleryMap: Map<string, GalleryEntry>;
}

function toCardNorm(n: string) { return n.replace(/[^a-zA-Z0-9]/g, ''); }

async function waitRateLimit(): Promise<void> {
  const ms = 1000 - (Date.now() - lastFetchAt);
  if (ms > 0) await new Promise<void>((r) => setTimeout(r, ms));
  lastFetchAt = Date.now();
}

async function fetchJson(url: string): Promise<unknown> {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'YgoBindr/1.0 (contact: bubly2327@gmail.com)' },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
  return r.json();
}

function parseArtMap(wikitext: string, cardNorm: string): Record<string, number> {
  const map: Record<string, number> = {};
  const re = new RegExp(`(\\d+)(?:\\.\\d+)?;\\s+${cardNorm}-([A-Z0-9]+)-`, 'gm');
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext)) !== null) {
    const idx = parseInt(m[1], 10) - 1;
    if (!(m[2] in map)) map[m[2]] = idx;
  }
  return map;
}

interface RawEntry { base?: string; alt?: string }

function buildRawMap(filenames: string[], cardNorm: string): Record<string, RawEntry> {
  const map: Record<string, RawEntry> = {};
  const pfx = cardNorm + '-';
  for (const f of filenames) {
    if (!f.startsWith(pfx)) continue;
    const parts = f.slice(pfx.length).replace(/\.[^.]+$/, '').split('-');
    // parts[0]=setPrefix  parts[1]=region  parts[2]=rarityCode  parts[3]=edition ...
    if (parts.length < 3) continue;
    if (!/^[A-Z]+$/.test(parts[1])) continue;  // must be a pure-letter region
    // Only store EN/NA/AE — JP, KR, SP, etc. share the same setPrefix|rarityCode key
    // and would silently overwrite the EN entry (gallery lists EN first, then other regions)
    if (!EN_REGIONS.has(parts[1])) continue;
    const key    = `${parts[0]}|${parts[2]}`;
    const isAlt  = parts[parts.length - 1] === 'AA';
    const entry  = map[key] ?? {};
    map[key] = isAlt ? { ...entry, alt: f } : { ...entry, base: f };
  }
  return map;
}

export async function getYugipediaData(cardName: string): Promise<YugipediaData> {
  const cacheKey = CACHE_KEY(cardName);
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const c = JSON.parse(raw) as {
        artMap: Record<string, number>;
        galleryMap: Record<string, GalleryEntry>;
        ts: number;
      };
      if (Date.now() - c.ts < CACHE_TTL)
        return { artMap: new Map(Object.entries(c.artMap)), galleryMap: new Map(Object.entries(c.galleryMap)) };
    }
  } catch { /* ignore */ }

  const cardNorm = toCardNorm(cardName);
  const namePrefix = cardNorm + '-';
  const origin = encodeURIComponent(window.location.origin);

  let artMap: Record<string, number> = {};
  let rawMap: Record<string, RawEntry> = {};

  // ── Fetch 1: wikitext → artMap ─────────────────────────────────────────────
  try {
    await waitRateLimit();
    const data = await fetchJson(
      `https://yugipedia.com/api.php?action=query&prop=revisions&rvprop=content` +
      `&titles=${encodeURIComponent(cardName)}&format=json&origin=${origin}`,
    );
    const pages = (data as { query?: { pages?: Record<string, unknown> } })?.query?.pages ?? {};
    const page  = Object.values(pages)[0] as {
      revisions?: Array<{ '*'?: string; slots?: { main?: { '*'?: string } } }>;
    } | undefined;
    const rev   = page?.revisions?.[0];
    const text  = rev?.['*'] ?? rev?.slots?.main?.['*'] ?? '';
    artMap = text ? parseArtMap(text, cardNorm) : {};
    console.log(`[yugipedia] artMap for "${cardName}":`, artMap);
  } catch (e) { console.error('[yugipedia] wikitext fetch failed:', e); }

  // ── Fetch 2: gallery image list → rawMap (filenames only) ──────────────────
  try {
    await waitRateLimit();
    const data = await fetchJson(
      `https://yugipedia.com/api.php?action=query&prop=images&imlimit=500` +
      `&titles=${encodeURIComponent(`Card gallery:${cardName}`)}&format=json&origin=${origin}`,
    );
    const pages     = (data as { query?: { pages?: Record<string, unknown> } })?.query?.pages ?? {};
    const page      = Object.values(pages)[0] as { images?: Array<{ title: string }> } | undefined;
    const filenames = (page?.images ?? []).map((img) => img.title.replace(/^File:/, ''));
    rawMap = buildRawMap(filenames, cardNorm);
    console.log(`[yugipedia] gallery returned ${filenames.length} images, rawMap has ${Object.keys(rawMap).length} entries`);
  } catch (e) { console.error('[yugipedia] gallery fetch failed:', e); }

  // ── Fetch 3: imageinfo for EN/NA files → resolve to CDN URLs ───────────────
  // Collect filenames that belong to TCG English regions only
  const toFetch: string[] = [];
  for (const entry of Object.values(rawMap)) {
    for (const filename of [entry.base, entry.alt]) {
      if (!filename) continue;
      if (!filename.startsWith(namePrefix)) continue;
      const region = filename.slice(namePrefix.length).split('-')[1] ?? '';
      if (EN_REGIONS.has(region)) toFetch.push(filename);
    }
  }
  console.log(`[yugipedia] ${toFetch.length} EN/NA files to imageinfo-resolve`);

  const fileToUrl: Record<string, string> = {};
  for (let i = 0; i < toFetch.length; i += 50) {
    const batch  = toFetch.slice(i, i + 50);
    const titles = batch.map((f) => `File:${f}`).join('|');
    try {
      await waitRateLimit();
      const data = await fetchJson(
        `https://yugipedia.com/api.php?action=query&prop=imageinfo&iiprop=url` +
        `&titles=${encodeURIComponent(titles)}&format=json&origin=${origin}`,
      );
      const pages = (data as { query?: { pages?: Record<string, unknown> } })?.query?.pages ?? {};
      for (const p of Object.values(pages)) {
        const page     = p as { title?: string; imageinfo?: Array<{ url?: string }> };
        const filename = page.title?.replace(/^File:/, '');
        const url      = page.imageinfo?.[0]?.url;
        if (filename && url) fileToUrl[filename] = url;
      }
    } catch (e) { console.error(`[yugipedia] imageinfo batch ${i / 50 + 1} failed:`, e); }
  }
  console.log(`[yugipedia] resolved ${Object.keys(fileToUrl).length} CDN URLs`);

  // ── Build final galleryMap with actual CDN URLs ─────────────────────────────
  const galleryMap: Record<string, GalleryEntry> = {};
  for (const [key, raw] of Object.entries(rawMap)) {
    const entry: GalleryEntry = {};
    if (raw.base && fileToUrl[raw.base]) entry.baseUrl = fileToUrl[raw.base];
    if (raw.alt  && fileToUrl[raw.alt])  entry.altUrl  = fileToUrl[raw.alt];
    if (entry.baseUrl || entry.altUrl) galleryMap[key] = entry;
  }
  console.log(`[yugipedia] galleryMap: ${Object.keys(galleryMap).length} entries with URLs`);

  try {
    localStorage.setItem(cacheKey, JSON.stringify({ artMap, galleryMap, ts: Date.now() }));
  } catch { /* localStorage full */ }

  return {
    artMap:     new Map(Object.entries(artMap)),
    galleryMap: new Map(Object.entries(galleryMap)),
  };
}

// Returns the Yugipedia CDN URL for the rarity-specific card image, or null if unavailable.
// Lookup order:
//   1. Exact setPrefix|rarityCode match (rarity-specific image, e.g. RA05 UR with JP text)
//   2. Any other image from the same set (same artwork, different rarity not yet uploaded)
//   3. null → caller falls back to YGOPRODeck image
export function yugipediaImageUrl(
  galleryMap: Map<string, GalleryEntry>,
  setPrefix:  string,
  rarity:     string,
  artIdx:     number,
): string | null {
  const pickUrl = (entry: GalleryEntry) => {
    const url = artIdx > 0 && entry.altUrl ? entry.altUrl : (entry.baseUrl ?? entry.altUrl);
    return url ?? null;
  };

  // 1. Exact rarity match
  const code = RARITY_CODE[rarity];
  if (code) {
    const entry = galleryMap.get(`${setPrefix}|${code}`);
    if (entry) {
      const url = pickUrl(entry);
      if (url) return url;
    }
  }

  // 2. Any image from the same set (all prints share the same base artwork)
  const setKeyPrefix = `${setPrefix}|`;
  for (const [key, entry] of galleryMap) {
    if (key.startsWith(setKeyPrefix)) {
      const url = pickUrl(entry);
      if (url) return url;
    }
  }

  return null;
}
