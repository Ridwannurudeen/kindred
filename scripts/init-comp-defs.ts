/**
 * Initializes the 4 computation definitions on the deployed Kindred MXE.
 *
 * Off-chain mode: each comp_def stores only { source: URL, hash: SHA-256 }
 * (see programs/kindred/src/lib.rs init_*_comp_def handlers). The .arcis
 * bytes themselves are hosted on the VPS — upload them via
 * scripts/upload-circuits-to-vps.sh BEFORE running this script so the
 * URL is live when the first computation queues.
 *
 * Cost: ~0.02 SOL total vs ~64 SOL for on-chain upload.
 *
 * Run from the project root:
 *   ANCHOR_WALLET=$HOME/.config/solana/id.json \
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   node scripts/init-comp-defs.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  getArciumAccountBaseSeed,
  getArciumProgramId,
  getCompDefAccOffset,
  getMXEAccAddress,
  getLookupTableAddress,
  getArciumProgram,
} from "@arcium-hq/client";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";

const CIRCUITS = [
  "init_org_registry",
  "register_profile",
  "intra_org_match",
  "cross_org_match",
];

function snakeToPascal(s: string): string {
  return s
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

function readKpJson(path: string): anchor.web3.Keypair {
  return anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(path).toString())),
  );
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync("target/idl/kindred.json").toString());
  const program = new anchor.Program(idl, provider);
  const arciumProgram = getArciumProgram(provider);

  const walletPath =
    process.env.ANCHOR_WALLET ?? `${os.homedir()}/.config/solana/id.json`;
  const owner = readKpJson(walletPath);
  console.log(`Program: ${program.programId.toBase58()}`);
  console.log(`Wallet:  ${owner.publicKey.toBase58()}`);

  const mxeAccount = getMXEAccAddress(program.programId);
  const mxeAcc = await arciumProgram.account.mxeAccount.fetch(mxeAccount);
  const lutAddress = getLookupTableAddress(
    program.programId,
    mxeAcc.lutOffsetSlot,
  );

  console.log(`MXE:     ${mxeAccount.toBase58()}`);
  console.log(`LUT:     ${lutAddress.toBase58()}\n`);

  for (const circuit of CIRCUITS) {
    console.log(`=== ${circuit} ===`);

    const baseSeed = getArciumAccountBaseSeed("ComputationDefinitionAccount");
    const offset = getCompDefAccOffset(circuit);
    const [compDefPda] = PublicKey.findProgramAddressSync(
      [baseSeed, program.programId.toBuffer(), offset],
      getArciumProgramId(),
    );
    console.log(`  comp_def: ${compDefPda.toBase58()}`);

    // Skip if already initialized (idempotent retry)
    const existing = await provider.connection.getAccountInfo(compDefPda);
    if (existing) {
      console.log(
        `  already initialized (${existing.data.length} bytes), skipping init`,
      );
    } else {
      const methodName = `init${snakeToPascal(circuit)}CompDef`;
      const sig = await (program.methods as any)
        [methodName]()
        .accounts({
          compDefAccount: compDefPda,
          payer: owner.publicKey,
          mxeAccount,
          addressLookupTable: lutAddress,
        })
        .signers([owner])
        .rpc({ commitment: "confirmed" });
      console.log(`  init tx: ${sig}`);
    }

    const rawCircuit = fs.readFileSync(`build/${circuit}.arcis`);
    const localHash = crypto
      .createHash("sha256")
      .update(rawCircuit)
      .digest("hex");
    console.log(
      `  local ${rawCircuit.length} bytes  sha256=${localHash}  (must match on-chain comp_def.circuit_source.hash)\n`,
    );
  }

  console.log(
    "All 4 comp defs initialized. .arcis bytes are served from the VPS — run scripts/upload-circuits-to-vps.sh if you haven't.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
