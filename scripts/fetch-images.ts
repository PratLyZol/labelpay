/** Download the manually reviewed Wikimedia Commons image set. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const spec = JSON.parse(readFileSync(resolve("seed/images.json"), "utf8")) as { classes: string[]; perClass: number };
const sources = JSON.parse(readFileSync(resolve("seed/images.sources.json"), "utf8")) as Record<string, string[]>;
const outputDirectory = resolve("public/img");
const userAgent = "LabelPay-hackathon/0.1 (hackathon demo; contact via GitHub)";
mkdirSync(outputDirectory, { recursive: true });

function downloadUrl(source: string) {
  const marker = "/wiki/File:";
  const position = new URL(source).pathname.indexOf(marker);
  if (position < 0) throw new Error(`Invalid Commons source: ${source}`);
  const filename = decodeURIComponent(new URL(source).pathname.slice(position + marker.length));
  return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(filename)}?width=960`;
}

async function download(source: string) {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(downloadUrl(source), { headers: { "User-Agent": userAgent } });
      if (!response.ok) throw new Error(`download failed (${response.status})`);
      const input = Buffer.from(await response.arrayBuffer());
      return await sharp(input).resize(512, 512, { fit: "cover" }).jpeg({ quality: 84 }).toBuffer();
    } catch (error) {
      lastError = error as Error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 1500));
    }
  }
  throw lastError;
}

async function main() {
  for (const label of spec.classes) {
    if (sources[label]?.length !== spec.perClass) {
      throw new Error(`${label} must have exactly ${spec.perClass} reviewed sources`);
    }
  }

  // Download everything before replacing the current dataset.
  const verified = new Map<string, { image: Buffer; source: string }[]>();
  for (const label of spec.classes) {
    const images: { image: Buffer; source: string }[] = [];
    for (const [index, source] of sources[label].entries()) {
      images.push({ image: await download(source), source });
      console.log(`downloaded ${label} ${index + 1}/${spec.perClass}`);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
    verified.set(label, images);
  }

  const manifest: { src: string; gold: string; alt: string; source: string }[] = [];
  for (const label of spec.classes) {
    for (const [index, candidate] of verified.get(label)!.entries()) {
      const filename = `v2-${label}-${index + 1}.jpg`;
      writeFileSync(resolve(outputDirectory, filename), candidate.image);
      manifest.push({ src: `/img/${filename}`, gold: label, alt: `${label} photo`, source: candidate.source });
    }
  }
  writeFileSync(resolve("seed/images.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifest: ${manifest.length} manually reviewed images`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
