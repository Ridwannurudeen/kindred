/**
 * Kindred — end-to-end tests
 *
 * Coverage:
 *  1. Init all 4 comp_defs
 *  2. Create two orgs (Oregon Adoption Registry + Texas Adoption Registry)
 *  3. Sign federation agreement between them
 *  4. Register Maya (OAR-001) in OAR via register_profile_v2 MXE
 *  5. Register Maya's bio mother (TAR-002) in TAR
 *  6. Maya requests cross-org match
 *  7. Bio mother consents → cross_org_match_v2 MXE runs
 *  8. Verify revealed score is in parent-child range [20, 26]
 *
 * Runs against a deployed devnet program with circuits already uploaded.
 * If comp_defs are already initialized (e.g. by scripts/init-comp-defs.ts),
 * the first test logs "already initialized" and continues.
 *
 * Single-keypair model: `owner` plays both Maya and the bio mother. Profile PDAs
 * differ because they're seeded by (org, payer) and the orgs differ. Each Profile
 * still has user == owner, which satisfies the request/consent authorization
 * constraints on both sides.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { Kindred } from "../target/types/kindred";
import { randomBytes } from "crypto";
import {
  awaitComputationFinalization,
  getArciumEnv,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgramId,
  getArciumProgram,
  RescueCipher,
  deserializeLE,
  getMXEPublicKey,
  getMXEAccAddress,
  getMempoolAccAddress,
  getCompDefAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getClusterAccAddress,
  getLookupTableAddress,
  createPacker,
  x25519,
} from "@arcium-hq/client";
import * as fs from "fs";
import * as os from "os";
import { expect } from "chai";

const CIRCUITS = [
  "init_org_registry_v2",
  "register_profile_v2",
  "intra_org_match_v2",
  "cross_org_match_v2",
];

// StrProfile = Pack<[u8; 40]> on the circuit side. createPacker turns 40 u8s into
// the 2 BigInt containers Arcis expects (40*8 = 320 bits, 213-bit packing budget per
// container → 2 chunks), so RescueCipher.encrypt then returns exactly 2 ciphertext
// blocks matching register_profile_v2(ciphertext_0: [u8;32], ciphertext_1: [u8;32]).
const PROFILE_FIELDS = Array.from({ length: 40 }, (_, i) => ({
  name: `alleles[${i}]`,
  type: { Integer: { signed: false, width: 8 } },
}));

type ProfilePlain = { alleles: number[] };
const profilePacker = createPacker<ProfilePlain, ProfilePlain>(
  PROFILE_FIELDS,
  "StrProfile",
);

type ProfileRecord = {
  id: string;
  org: string;
  alleles: number[];
  notes: string;
};
const PROFILES: ProfileRecord[] = (
  JSON.parse(
    fs.readFileSync("data/synthetic-profiles/profiles.json", "utf-8"),
  ) as { profiles: ProfileRecord[] }
).profiles;

const findProfile = (id: string): ProfileRecord => {
  const p = PROFILES.find((x) => x.id === id);
  if (!p)
    throw new Error(
      `profile ${id} not in data/synthetic-profiles/profiles.json`,
    );
  return p;
};

describe("Kindred", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Kindred as Program<Kindred>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const arciumProgram = getArciumProgram(provider);

  type Event = anchor.IdlEvents<(typeof program)["idl"]>;
  const awaitEvent = async <E extends keyof Event>(
    eventName: E,
  ): Promise<Event[E]> => {
    let listenerId: number;
    const event = await new Promise<Event[E]>((res) => {
      listenerId = program.addEventListener(eventName, (event) => res(event));
    });
    await program.removeEventListener(listenerId);
    return event;
  };

  const arciumEnv = getArciumEnv();
  const clusterAccount = getClusterAccAddress(arciumEnv.arciumClusterOffset);

  const owner = readKpJson(
    process.env.ANCHOR_WALLET ?? `${os.homedir()}/.config/solana/id.json`,
  );

  // Cached across tests
  let mxePubkey: Uint8Array;

  it("Initializes all 4 computation definitions", async () => {
    for (const circuit of CIRCUITS) {
      console.log(`Initializing comp def for: ${circuit}`);
      const sig = await initCompDef(circuit, owner);
      console.log(`  → ${sig}`);
    }

    const fetched = await getMXEPublicKey(provider, program.programId);
    if (!fetched)
      throw new Error("MXE public key not available — is the cluster set?");
    mxePubkey = fetched;
  });

  it("Creates two adoption registries", async () => {
    await createOrg(
      orgIdFromName("Oregon Adoption Registry"),
      "Oregon Adoption Registry",
    );
    await createOrg(
      orgIdFromName("Texas Adoption Registry"),
      "Texas Adoption Registry",
    );
  });

  it("Signs federation agreement between OAR and TAR", async () => {
    const orgA = derivePda("org", orgIdFromName("Oregon Adoption Registry"));
    const orgB = derivePda("org", orgIdFromName("Texas Adoption Registry"));
    const agreement = derivePda("fed", orgA.toBuffer(), orgB.toBuffer());

    // Single-keypair demo: owner signs as both admin_a and admin_b.
    const sig = await program.methods
      .setFederationAgreement(
        new anchor.BN(Math.floor(Date.now() / 1000) + 86400 * 365),
      )
      .accountsPartial({
        adminA: owner.publicKey,
        adminB: owner.publicKey,
        orgA,
        orgB,
        agreement,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc({ commitment: "confirmed" });

    console.log("Federation agreement signed:", sig);
  });

  it("Registers Maya in OAR (encrypted profile via register_profile_v2 MXE)", async () => {
    const maya = findProfile("OAR-001");
    await registerProfile(maya);
  });

  it("Registers Maya's bio mother in TAR", async () => {
    const bioMother = findProfile("TAR-002");
    await registerProfile(bioMother);
  });

  it("Cross-org match: Maya ↔ TAR-002 reveals parent-child score", async () => {
    const orgOar = derivePda("org", orgIdFromName("Oregon Adoption Registry"));
    const orgTar = derivePda("org", orgIdFromName("Texas Adoption Registry"));
    const mayaProfile = derivePda(
      "profile",
      orgOar.toBuffer(),
      owner.publicKey.toBuffer(),
    );
    const bioMotherProfile = derivePda(
      "profile",
      orgTar.toBuffer(),
      owner.publicKey.toBuffer(),
    );
    const matchRequest = derivePda(
      "match_req",
      mayaProfile.toBuffer(),
      bioMotherProfile.toBuffer(),
    );
    const agreement = derivePda("fed", orgOar.toBuffer(), orgTar.toBuffer());

    // 1. Maya requests cross-org match.
    const reqSig = await program.methods
      .requestCrossMatch()
      .accountsPartial({
        payer: owner.publicKey,
        requesterProfile: mayaProfile,
        targetProfile: bioMotherProfile,
        federationAgreement: agreement,
        matchRequest,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc({ commitment: "confirmed" });
    console.log("request_cross_match:", reqSig);

    // 2. Bio mother consents → queues cross_org_match_v2 MXE.
    const computationOffset = new anchor.BN(randomBytes(8), "hex");
    const orgOarBucket = derivePda(
      "org_bucket",
      orgIdFromName("Oregon Adoption Registry"),
    );
    const orgTarBucket = derivePda(
      "org_bucket",
      orgIdFromName("Texas Adoption Registry"),
    );

    const consentEvent = awaitEvent("matchRevealedEvent");

    const consentSig = await program.methods
      .consentCrossMatch(computationOffset)
      .accountsPartial({
        payer: owner.publicKey,
        targetProfile: bioMotherProfile,
        requesterProfile: mayaProfile,
        matchRequest,
        federationAgreement: agreement,
        orgABucket: orgOarBucket,
        orgBBucket: orgTarBucket,
        clusterAccount,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
        executingPool: getExecutingPoolAccAddress(
          arciumEnv.arciumClusterOffset,
        ),
        computationAccount: getComputationAccAddress(
          arciumEnv.arciumClusterOffset,
          computationOffset,
        ),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("cross_org_match_v2")).readUInt32LE(),
        ),
      })
      .signers([owner])
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("consent_cross_match:", consentSig);

    await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      "confirmed",
    );

    const event = await consentEvent;
    const score = (event as { score: number }).score;
    console.log(`  → MatchRevealedEvent score=${score}`);

    // Parent-child IBS envelope from data/synthetic-profiles/relationships.json.
    // Idealized parent-child is 20 (always shares one allele per locus by inheritance)
    // but the non-inherited allele can coincidentally match the parent's other allele,
    // pushing the realistic range to 20–26. Maya/TAR-002 ground truth is 21.
    expect(score).to.be.at.least(20);
    expect(score).to.be.at.most(26);
    expect((event as { isCrossOrg: boolean }).isCrossOrg).to.equal(true);
  });

  // === helpers ===

  async function createOrg(orgId: Buffer, name: string): Promise<void> {
    const computationOffset = new anchor.BN(randomBytes(8), "hex");
    const orgPda = derivePda("org", orgId);
    const orgBucketPda = derivePda("org_bucket", orgId);

    try {
      await program.methods
        .createOrg(computationOffset, Array.from(orgId), name)
        .accountsPartial({
          payer: owner.publicKey,
          org: orgPda,
          orgBucket: orgBucketPda,
          clusterAccount,
          mxeAccount: getMXEAccAddress(program.programId),
          mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
          executingPool: getExecutingPoolAccAddress(
            arciumEnv.arciumClusterOffset,
          ),
          computationAccount: getComputationAccAddress(
            arciumEnv.arciumClusterOffset,
            computationOffset,
          ),
          compDefAccount: getCompDefAccAddress(
            program.programId,
            Buffer.from(
              getCompDefAccOffset("init_org_registry_v2"),
            ).readUInt32LE(),
          ),
        })
        .signers([owner])
        .rpc({ skipPreflight: true, commitment: "confirmed" });
    } catch (e: any) {
      if (String(e).includes("already in use")) {
        console.log(`  ${name}: already exists, skipping`);
        return;
      }
      throw e;
    }

    // Wait for init_org_registry_callback to write the empty bucket; subsequent
    // register_profile_v2 calls depend on the bucket existing with a known nonce.
    await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      "confirmed",
    );
    console.log(`  ${name}: created`);
  }

  async function registerProfile(p: ProfileRecord): Promise<void> {
    const orgIdBuf = orgIdFromName(p.org);
    const orgPda = derivePda("org", orgIdBuf);
    const orgBucketPda = derivePda("org_bucket", orgIdBuf);

    // Encrypt the 40-byte STR profile to 2 Rescue ciphertext blocks.
    const priv = x25519.utils.randomSecretKey();
    const pub = x25519.getPublicKey(priv);
    const shared = x25519.getSharedSecret(priv, mxePubkey);
    const cipher = new RescueCipher(shared);
    const nonce = randomBytes(16);
    const packed = profilePacker.pack({ alleles: p.alleles });
    if (packed.length !== 2) {
      throw new Error(`expected 2 packed containers, got ${packed.length}`);
    }
    const ciphertext = cipher.encrypt(packed, nonce);
    const c0 = Buffer.from(ciphertext[0]);
    const c1 = Buffer.from(ciphertext[1]);

    const computationOffset = new anchor.BN(randomBytes(8), "hex");

    await program.methods
      .registerProfile(
        computationOffset,
        Array.from(c0),
        Array.from(c1),
        Array.from(pub),
        new anchor.BN(deserializeLE(nonce).toString()),
        true, // opt_in_intra
        true, // opt_in_cross
      )
      .accountsPartial({
        payer: owner.publicKey,
        org: orgPda,
        orgBucket: orgBucketPda,
        clusterAccount,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
        executingPool: getExecutingPoolAccAddress(
          arciumEnv.arciumClusterOffset,
        ),
        computationAccount: getComputationAccAddress(
          arciumEnv.arciumClusterOffset,
          computationOffset,
        ),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("register_profile_v2")).readUInt32LE(),
        ),
      })
      .signers([owner])
      .rpc({ skipPreflight: true, commitment: "confirmed" });

    // register_profile_callback writes the new bucket state and increments member_count.
    // Subsequent matches read from this updated state, so serialize on finalization.
    await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      "confirmed",
    );
    console.log(`  ${p.id} registered in ${p.org}`);
  }

  async function initCompDef(
    circuit: string,
    signer: anchor.web3.Keypair,
  ): Promise<string> {
    const baseSeed = getArciumAccountBaseSeed("ComputationDefinitionAccount");
    const offset = getCompDefAccOffset(circuit);
    const compDefPda = PublicKey.findProgramAddressSync(
      [baseSeed, program.programId.toBuffer(), offset],
      getArciumProgramId(),
    )[0];

    const mxeAccount = getMXEAccAddress(program.programId);
    const mxeAcc = await arciumProgram.account.mxeAccount.fetch(mxeAccount);
    const lutAddress = getLookupTableAddress(
      program.programId,
      mxeAcc.lutOffsetSlot,
    );

    const existing = await provider.connection.getAccountInfo(compDefPda);
    let sig = "(already initialized)";
    if (!existing) {
      const methodName =
        `init${snakeToPascal(circuit)}CompDef` as keyof typeof program.methods;
      sig = await (program.methods as any)
        [methodName]()
        .accounts({
          compDefAccount: compDefPda,
          payer: signer.publicKey,
          mxeAccount,
          addressLookupTable: lutAddress,
        })
        .signers([signer])
        .rpc({ commitment: "confirmed" });

      // Off-chain mode: lib.rs's init_*_comp_def writes CircuitSource::OffChain with
      // the VPS URL and the compile-time circuit_hash!. No on-chain uploadCircuit
      // needed — Arx nodes fetch + verify the .arcis from kindred.gudman.xyz/circuits.
    }
    return sig;
  }

  function derivePda(
    seed: string,
    ...keys: (Buffer | Uint8Array)[]
  ): PublicKey {
    const seeds: (Buffer | Uint8Array)[] = [Buffer.from(seed)];
    for (const k of keys) seeds.push(k);
    return PublicKey.findProgramAddressSync(seeds, program.programId)[0];
  }
});

function readKpJson(path: string): anchor.web3.Keypair {
  const file = fs.readFileSync(path);
  return anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(file.toString())),
  );
}

function orgIdFromName(name: string): Buffer {
  // Deterministic 32-byte ID derived from name (synthetic — real orgs use multisig pubkeys).
  // Must match scripts/load-demo-data.ts so test runs and demo data share the same PDAs.
  const buf = Buffer.alloc(32);
  Buffer.from(name).copy(buf);
  return buf;
}

function snakeToPascal(s: string): string {
  return s
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}
