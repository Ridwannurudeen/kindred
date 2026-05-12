/**
 * Arcium client wrapper — encryption + program calls.
 *
 * NOT yet wired into the demo (Onboarding uses a setTimeout stub). The real
 * integration needs @arcium-hq/client + @coral-xyz/anchor + @solana/web3.js
 * installed in app/, plus a wallet adapter shell. Kept here so the encryption
 * shape is in lockstep with tests/kindred.ts and scripts/load-demo-data.ts.
 */

import { RescueCipher, x25519, getMXEPublicKey, createPacker } from "@arcium-hq/client";
import { AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

// StrProfile = Pack<[u8; 40]>. createPacker bundles 40 u8s into the 2 BigInt
// containers Arcis expects (320 bits / 213-bit packing budget → 2 chunks), so
// RescueCipher.encrypt then returns exactly 2 ciphertext blocks matching
// register_profile(ciphertext_0: [u8;32], ciphertext_1: [u8;32]).
const PROFILE_FIELDS = Array.from({ length: 40 }, (_, i) => ({
  name: `alleles[${i}]`,
  type: { Integer: { signed: false, width: 8 } },
}));
const profilePacker = createPacker<{ alleles: number[] }, { alleles: number[] }>(
  PROFILE_FIELDS,
  "StrProfile",
);

export type EncryptedProfile = {
  ciphertext0: Uint8Array; // 32 bytes
  ciphertext1: Uint8Array; // 32 bytes
  pubkey: Uint8Array;       // 32 bytes (x25519 ephemeral)
  nonce: Uint8Array;        // 16 bytes
  privateKey: Uint8Array;   // 32 bytes — KEEP IN BROWSER ONLY
};

/**
 * Encrypt a 40-allele CODIS profile for the Kindred MXE.
 * The plaintext alleles never leave this function.
 */
export async function encryptProfile(
  alleles: number[],
  provider: AnchorProvider,
  programId: PublicKey,
): Promise<EncryptedProfile> {
  if (alleles.length !== 40) {
    throw new Error(`Expected 40 alleles, got ${alleles.length}`);
  }

  // Fetch MXE's public x25519 key
  const mxePubkey = await getMXEPublicKey(provider, programId);
  if (!mxePubkey) {
    throw new Error("MXE public key not yet available — program may not be initialized");
  }

  // Generate ephemeral x25519 keypair for this session
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);

  // ECDH → shared secret
  const sharedSecret = x25519.getSharedSecret(privateKey, mxePubkey);
  const cipher = new RescueCipher(sharedSecret);

  const nonce = randomBytes(16);
  const packed = profilePacker.pack({ alleles });
  if (packed.length !== 2) {
    throw new Error(`expected 2 packed containers, got ${packed.length}`);
  }
  const ciphertexts = cipher.encrypt(packed, nonce);
  const ciphertext0 = Uint8Array.from(ciphertexts[0]);
  const ciphertext1 = Uint8Array.from(ciphertexts[1]);

  return {
    ciphertext0,
    ciphertext1,
    pubkey: publicKey,
    nonce,
    privateKey, // keep — needed if we later want to decrypt MXE outputs to this user
  };
}

/**
 * Decode a revealed kinship score. The score is publicly revealed in the
 * MatchRevealedEvent — no decryption needed since the MXE reveals it as a
 * plain u8 once both parties have consented.
 */
export function decodeKinshipScore(eventScore: number): {
  score: number;
  band: string;
} {
  if (eventScore < 0 || eventScore > 40) {
    throw new Error(`Score out of range: ${eventScore}`);
  }
  // Interpretation matches docs/CIRCUIT_DESIGN.md
  let band = "No detectable kinship";
  if (eventScore >= 38) band = "Identical / duplicate sample";
  else if (eventScore >= 22) band = "Likely full sibling";
  else if (eventScore >= 19) band = "Parent-child";
  else if (eventScore >= 13) band = "Second-degree relative range";
  return { score: eventScore, band };
}

function randomBytes(n: number): Uint8Array {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}
