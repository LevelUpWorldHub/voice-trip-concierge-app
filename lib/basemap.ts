/**
 * Keyless raster basemap for the Map tab.
 *
 * CARTO raster tiles at basemaps.cartocdn.com have required an API key
 * since 25 September 2026. Requests without one are PNG stamps that read
 * "API KEY REQUIRED", which is what the live Map tab showed.
 *
 * The OpenStreetMap standard tile server needs no key. Its usage policy
 * allows ordinary interactive viewing (the tiles for the current viewport
 * only) when this exact URL is used, the copyright credit stays visible,
 * and the browser sends a Referer. See
 * https://operations.osmfoundation.org/policies/tiles/
 */
export const BASEMAP = Object.freeze({
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
});

export type BasemapSpec = {
  url: string;
  attribution: string;
  maxZoom: number;
};

const CREDENTIAL = /cartocdn|mapbox|api[_-]?key|access_token|[?&](?:key|apikey|api_key)=/i;

/** Reasons a tile URL or credit line would regress the Map tab. Empty means it passes. */
export function basemapProblems(spec: BasemapSpec): string[] {
  const problems: string[] = [];
  const add = (code: string) => {
    if (!problems.includes(code)) problems.push(code);
  };

  if (!spec.url.startsWith("https://")) add("https");

  const probe = spec.url.replaceAll("{z}", "0").replaceAll("{x}", "0").replaceAll("{y}", "0");
  let parsed: URL | undefined;
  try {
    parsed = new URL(probe);
  } catch {
    add("url");
  }

  if (!parsed || parsed.protocol !== "https:") add("https");
  if (!parsed || parsed.hostname !== "tile.openstreetmap.org") add("host");
  if (parsed && (parsed.search !== "" || parsed.hash !== "")) add("query");
  if (spec.url !== BASEMAP.url) add("template");
  if (spec.url.includes("{s}") || spec.url.includes("{r}")) add("placeholder");
  if (CREDENTIAL.test(spec.url)) add("credential");
  if (!spec.attribution.includes("OpenStreetMap")) add("attribution-name");
  if (!spec.attribution.includes("https://www.openstreetmap.org/copyright")) add("attribution-license");
  if (!spec.attribution.includes("&copy;") && !spec.attribution.includes("©")) add("attribution-mark");
  if (!Number.isInteger(spec.maxZoom) || spec.maxZoom < 1 || spec.maxZoom > 19) add("zoom");

  return problems;
}
