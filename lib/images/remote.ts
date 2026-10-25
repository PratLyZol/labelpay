import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function isPrivateAddress(value: string) {
  const address = value.toLowerCase().replace(/^::ffff:/, "");
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  if (isIP(address) === 6) return address === "::" || address === "::1" || address.startsWith("fc") || address.startsWith("fd") || /^fe[89ab]/.test(address);
  return false;
}

export function parsePublicImageUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("image URL must use http or https");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || (isIP(hostname) > 0 && isPrivateAddress(hostname))) {
    throw new Error("private image hosts are not allowed");
  }
  return url;
}

async function assertPublicHost(url: URL) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname) > 0) {
    if (isPrivateAddress(hostname)) throw new Error("private image hosts are not allowed");
    return;
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("image host resolved to a private address");
}

export async function loadRemoteImageAsDataUrl(source: string) {
  let url = parsePublicImageUrl(source);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    await assertPublicHost(url);
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { Accept: "image/*" } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === MAX_REDIRECTS) throw new Error("too many image redirects");
      url = parsePublicImageUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`image fetch ${response.status}`);
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (!contentType?.startsWith("image/")) throw new Error("URL did not return an image");
    const declaredSize = Number(response.headers.get("content-length") ?? 0);
    if (declaredSize > MAX_IMAGE_BYTES) throw new Error("image is larger than 8 MB");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("image is larger than 8 MB");
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  }
  throw new Error("image fetch failed");
}
