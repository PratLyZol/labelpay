import { generateKeyPairSigner } from "@solana/kit";
import bs58 from "bs58";
async function main() {
  const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const priv = pkcs8.slice(-32);
  const signer = await generateKeyPairSigner(); // only to import address helper lazily
  void signer;
  const { createKeyPairSignerFromPrivateKeyBytes } = await import("@solana/kit");
  const s = await createKeyPairSignerFromPrivateKeyBytes(priv);
  const pubBytes = bs58.decode(s.address);
  const secret64 = new Uint8Array(64);
  secret64.set(priv, 0);
  secret64.set(pubBytes, 32);
  console.log("Treasury address:", s.address);
  console.log("TREASURY_SECRET_KEY=" + bs58.encode(secret64));
  console.log(`Fund it: solana airdrop 1 ${s.address} --url devnet`);
}
main();
