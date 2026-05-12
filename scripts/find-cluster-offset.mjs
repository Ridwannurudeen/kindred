import { PublicKey } from "@solana/web3.js";
import fs from "node:fs";

const ARCIUM_ID = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");

const data = JSON.parse(fs.readFileSync(new URL("./clusters.json", import.meta.url), "utf8"));
const known = new Set(data.result.map((a) => a.pubkey));
console.log(`known clusters: ${known.size}`);

const matches = [];
for (let off = 0; off < 5000; off++) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(off);
  const [pk] = PublicKey.findProgramAddressSync([Buffer.from("Cluster"), buf], ARCIUM_ID);
  if (known.has(pk.toBase58())) {
    matches.push([off, pk.toBase58()]);
  }
}
console.log(`matched offsets in [0, 5000]: ${matches.length}`);
for (const [off, pk] of matches.slice(0, 30)) {
  console.log(`  offset=${off}  pubkey=${pk}`);
}
