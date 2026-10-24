/**
 * Downloads a handful of Creative Commons / public-domain photos per class from Wikimedia Commons,
 * resizes them to 512px JPEGs in public/img, and writes seed/images.manifest.json.
 * Falls back to synthetic shape images if Commons is unreachable.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const spec = JSON.parse(readFileSync(resolve("seed/images.json"), "utf8")) as { classes: string[]; perClass: number };
const outDir = resolve("public/img");
mkdirSync(outDir, { recursive: true });
const UA = "LabelPay-hackathon/0.1 (hackathon demo; contact via GitHub)";

const QUERIES: Record<string, string> = {
  cat: "domestic cat portrait photo",
  dog: "dog portrait photo",
  bird: "bird perched photo",
  car: "car parked street photo",
  bicycle: "bicycle photo",
  airplane: "airliner in flight photo",
};

async function commonsSearch(q: string, n: number): Promise<string[]> {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `${q} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: String(n * 3),
    prop: "imageinfo",
    iiprop: "url|mime|size",
    iiurlwidth: "640",
    format: "json",
  }).toString();
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`commons ${res.status}`);
  const json = (await res.json()) as { query?: { pages?: Record<string, { imageinfo?: { thumburl?: string; mime?: string; width?: number; height?: number }[] }> } };
  const pages = Object.values(json.query?.pages ?? {});
  return pages
    .map((p) => p.imageinfo?.[0])
    .filter((i): i is NonNullable<typeof i> => !!i && !!i.thumburl && /jpeg|png/.test(i.mime ?? "") && (i.width ?? 0) >= 400)
    .map((i) => i.thumburl!)
    .slice(0, n);
}

async function download(url: string, file: string) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await sharp(buf).resize(512, 512, { fit: "cover" }).jpeg({ quality: 82 }).toFile(file);
}

async function synthetic(cls: string, i: number, file: string) {
  // Fallback: a labeled placeholder so the pipeline still runs end-to-end.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="hsl(${(i * 67) % 360} 40% 85%)"/><text x="256" y="276" font-size="64" text-anchor="middle" font-family="sans-serif" fill="#222">${cls}</text></svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toFile(file);
}

async function main() {
  const manifest: { src: string; gold: string; alt: string }[] = [];
  for (const cls of spec.classes) {
    let urls: string[] = [];
    try {
      urls = await commonsSearch(QUERIES[cls] ?? cls, spec.perClass);
    } catch (e) {
      console.warn(`[${cls}] commons search failed: ${(e as Error).message}`);
    }
    for (let i = 0; i < spec.perClass; i++) {
      const name = `${cls}-${i + 1}.jpg`;
      const file = resolve(outDir, name);
      if (!existsSync(file)) {
        const url = urls[i];
        try {
          if (!url) throw new Error("no url");
          await download(url, file);
          console.log(`ok   ${name} <- ${url}`);
        } catch (e) {
          console.warn(`fallback ${name}: ${(e as Error).message}`);
          await synthetic(cls, i, file);
        }
      }
      manifest.push({ src: `/img/${name}`, gold: cls, alt: `photo ${i + 1}` });
    }
  }
  writeFileSync(resolve("seed/images.manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`manifest: ${manifest.length} images`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
