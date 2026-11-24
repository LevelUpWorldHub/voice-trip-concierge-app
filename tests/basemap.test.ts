import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BASEMAP, basemapProblems, type BasemapSpec } from "@/lib/basemap";

function spec(overrides: Partial<BasemapSpec> = {}): BasemapSpec {
  return { url: BASEMAP.url, attribution: BASEMAP.attribution, maxZoom: BASEMAP.maxZoom, ...overrides };
}

describe("basemap policy", () => {
  it("ships the keyless OpenStreetMap standard tiles and the required credit", () => {
    expect(basemapProblems(BASEMAP)).toEqual([]);
    expect(BASEMAP.url).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(BASEMAP.attribution).toContain("https://www.openstreetmap.org/copyright");
    expect(BASEMAP.attribution).toContain("OpenStreetMap");
    expect(BASEMAP.maxZoom).toBe(19);
    expect(Object.isFrozen(BASEMAP)).toBe(true);
  });

  it("rejects the CARTO raster URL that now stamps API KEY REQUIRED", () => {
    const problems = basemapProblems(
      spec({
        url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      }),
    );
    expect(problems).toEqual(expect.arrayContaining(["host", "template", "credential", "placeholder", "attribution-license"]));
    expect(problems).not.toContain("attribution-name");
  });

  it.each([
    ["http tile URL", { url: "http://tile.openstreetmap.org/{z}/{x}/{y}.png" }, ["https", "template"]],
    ["subdomain host the policy says may be withdrawn", { url: "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png" }, ["host", "template"]],
    ["retina suffix", { url: "https://tile.openstreetmap.org/{z}/{x}/{y}{r}.png" }, ["template", "placeholder"]],
    ["subdomain template", { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" }, ["host", "template", "placeholder"]],
    ["key query on the OSM host", { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png?key=secret" }, ["query", "template", "credential"]],
    ["api_key query", { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png?api_key=secret" }, ["query", "template", "credential"]],
    ["access token query", { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png?access_token=secret" }, ["query", "template", "credential"]],
    ["mapbox style URL", { url: "https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}?access_token=pk.demo" }, ["host", "template", "credential", "query"]],
    ["empty URL", { url: "" }, ["https", "url", "host", "template"]],
    ["zoom past the OSM tile set", { maxZoom: 20 }, ["zoom"]],
    ["zero zoom", { maxZoom: 0 }, ["zoom"]],
    ["fractional zoom", { maxZoom: 12.5 }, ["zoom"]],
    ["credit with no license link", { attribution: "&copy; OpenStreetMap contributors" }, ["attribution-license"]],
    ["credit with no copyright mark", { attribution: 'OpenStreetMap <a href="https://www.openstreetmap.org/copyright">license</a>' }, ["attribution-mark"]],
    ["CARTO-only credit", { attribution: "&copy; CARTO" }, ["attribution-name", "attribution-license"]],
    ["blank credit", { attribution: "   " }, ["attribution-name", "attribution-license", "attribution-mark"]],
  ] as const)("rejects %s", (_name, overrides, expected) => {
    expect(basemapProblems(spec(overrides))).toEqual(expect.arrayContaining([...expected]));
  });

  it("keeps the Map tab on the shared spec and out of keyed tile URLs", () => {
    const source = readFileSync("components/map-canvas.tsx", "utf8");
    expect(source).toContain("BASEMAP.url");
    expect(source).toContain("BASEMAP.attribution");
    expect(source).toContain("BASEMAP.maxZoom");
    expect(source).not.toMatch(/https?:\/\/[^"'`\s]+\{z\}/);
    expect(source).not.toMatch(/cartocdn|api[_-]?key|access_token|[?&]key=/i);

    const roots = ["components", "lib", "app"];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        if (!/\.(tsx?|jsx?)$/.test(file)) continue;
        const text = readFileSync(file, "utf8");
        if (/cartocdn|basemaps\.carto/i.test(text) && !file.endsWith("lib/basemap.ts")) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
    expect(readFileSync("lib/basemap.ts", "utf8")).not.toMatch(/[?&](?:key|api_key|access_token)=['"]?[A-Za-z0-9]/);
  });
});

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(path));
    else found.push(path);
  }
  return found;
}
