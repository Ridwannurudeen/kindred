# X (Twitter) thread — Kindred launch

Target length: 8–10 tweets. Lead with the institutional framing, not crypto jargon. Posted from @gudman.

---

**1/**
Two adoption agencies, in two states, both holding genetic profiles of their members. Both legally barred from sharing.

An adoptee in one state may have a biological parent in the other. Today, no path connects them.

We built that path. It does not require anyone to trust anyone.

---

**2/**
This is Kindred — the first MPC primitive for cross-organizational genomic matching.

Multiple registries hold their own encrypted member buckets. Two orgs can sign a federation agreement. After that, their members can match — with neither org ever seeing the other's data.

---

**3/**
Why MPC, specifically?

• Centralized intermediary → same architectural failure as the 23andMe Oct 2023 breach (7M users, Ashkenazi profiles specifically targeted)
• TEE federation → one org's enclave compromise leaks all federated orgs
• ZKP → proves statements but no joint-input compute primitive
• MPC → joint computation without joint data access

It is the only architecture that actually works for federation.

---

**4/**
The end users are populations who currently cannot safely use centralized DNA services:

• Adoptees in sealed-records states (~7M Americans)
• Donor-conceived people whose anonymity contracts get broken every time someone uploads to 23andMe
• Refugee families fleeing surveillance regimes
• Diaspora communities under hostile-state surveillance

For them, federation is not a feature. It's the difference between participating and being shut out.

---

**5/**
Built on @ArciumHQ on @solana. The MXE (Multi-Party eXecution Environment) is what makes joint compute possible without anyone seeing joint inputs.

Each org owns an Enc<Mxe, ProfileBucket> on-chain. Members register via an MPC circuit that updates the bucket without ever decrypting it.

---

**6/**
Cross-org match: the MXE takes BOTH orgs' encrypted buckets as input, runs IBS scoring across MPC-secret-shared profile data, and reveals only the final score (a single u8) — and only after both users consent.

Profiles never get reconstructed in plaintext. Anywhere. Ever.

---

**7/**
The matching algorithm: IBS (Identity-by-State) over 20 expanded CODIS STR loci. Branchless circuit, ~3.4B ACUs for the cross-org variant.

Honest scope: 20 STRs distinguish parent-child + full siblings reliably. Beyond 2nd-degree relatives, we don't claim it.

We claim what's true.

---

**8/**
The architectural claim is the entire submission:

"Kindred is the first MPC primitive for cross-organizational genomic matching. Architecturally impossible without joint compute over secret-shared inputs. The federation guarantee is cryptographic, not policy-promised."

---

**9/**
For the @ArciumHQ Road to Genesis, DNA Matching track.

Code: github.com/.../kindred (open source, MIT)
Demo: kindred.gudman.xyz
Writeup: [link to blog post]

If you work for an adoption registry, refugee-tracing network, donor-conceived advocacy org, or diaspora-heritage organization — get in touch. Federation infrastructure is what's missing.

---

**10/**
Built for the populations who can't afford to be in 23andMe.
