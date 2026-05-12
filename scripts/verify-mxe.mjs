import { PublicKey } from "@solana/web3.js";

const ARCIUM_ID = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");
const KINDRED = new PublicKey("dxfUyyp55B2fAbgAVF491gRAvz2gqkvqKFMY9SDJH7B");

const [mxe] = PublicKey.findProgramAddressSync(
  [Buffer.from("MXEAccount"), KINDRED.toBuffer()],
  ARCIUM_ID
);
console.log("MXE PDA:", mxe.toBase58());

const r = await fetch("https://api.devnet.solana.com", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "getAccountInfo",
    params: [mxe.toBase58(), { encoding: "base64", dataSlice: { offset: 0, length: 16 } }],
  }),
});
const j = await r.json();
const v = j.result.value;
console.log("exists:", v !== null);
if (v) {
  console.log("  owner:", v.owner);
  console.log("  space:", v.space, "bytes");
  console.log("  lamports:", v.lamports);
  console.log("  discriminator (hex):", Buffer.from(v.data[0], "base64").subarray(0, 8).toString("hex"));
}
