# DEMO_SCRIPT.md — 90-second video walkthrough

Target: 90 seconds, 1080p screen capture with voiceover. Centerpiece is Maya's cross-org match. The narration leads with the institutional problem, not the cryptography.

## Shot list

### 0:00–0:08 — Cold open
**Visual:** Hero page. Big text: *"Two adoption registries that can't share data — finally connected."*
**Voiceover:**
> "Adoption agencies in different states are legally barred from sharing their members' data. Even when an adoptee in one is the biological child of someone in the other."

### 0:08–0:16 — The architectural failure
**Visual:** Cut to the failure-modes table on /how-it-works.
**Voiceover:**
> "Centralized intermediaries fail like 23andMe. TEEs fail on a single org compromise. ZKPs can't do joint computation. MPC is the only architecture that works."

### 0:16–0:25 — Pick persona Maya
**Visual:** Click Maya's persona card on Landing. Persona detail visible.
**Voiceover:**
> "Meet Maya. She's an adoptee in Oregon. Her biological mother registered with a Texas adoption agency — separately, decades ago. They have never connected."

### 0:25–0:38 — Encrypt + register
**Visual:** Onboarding page. Auto-loaded CSV. Click "Parse + validate". Show encryption preview with ciphertext.
**Voiceover:**
> "Maya's CODIS profile is encrypted in her browser before it leaves her device. The plaintext genome never touches Kindred, the registry, or any Arcium node. What gets stored on-chain is ciphertext — uniformly random bytes."

### 0:38–0:45 — Click register, browse
**Visual:** Click Register. Brief loading. Browse page loads. Show split between "Your registry — Oregon Adoption Registry" and "Federated registries — Texas Adoption Registry"
**Voiceover:**
> "Maya's registry has signed a federation agreement with Texas Adoption Registry. Members of either org can opt in to cross-org matching."

### 0:45–0:55 — Request cross-org match
**Visual:** Click "Request cross-org match" on TAR-002. Reveal page loads in pending state. Click "Simulate recipient consent".
**Voiceover:**
> "Maya requests a match with profile 102 in Texas. The Texas member receives the request. When they consent, the MXE runs the cross_org_match circuit — taking *both* orgs' encrypted buckets as inputs."

### 0:55–1:08 — MXE compute + reveal
**Visual:** "Computing" stage with circuit details. Then KinshipMeter animates 0 → 20.
**Voiceover:**
> "The cluster processes secret-shared profile data. No Arx node ever sees plaintext. The output: a single number — the IBS kinship score — revealed only to Maya and her match."

### 1:08–1:18 — Score interpretation
**Visual:** KinshipMeter shows "20 — Parent–child relationship". Below: "Computed inside Arcium MXE across two organizational boundaries that never decrypted each other's data."
**Voiceover:**
> "Twenty. Parent-child. The Texas registry never saw what the Oregon registry has. Oregon never saw what Texas has. Maya and her bio mother saw a single number."

### 1:18–1:28 — The architectural claim
**Visual:** Federation page. Federation graph showing OAR ↔ TAR.
**Voiceover:**
> "Kindred is the first MPC primitive for cross-organizational genomic matching. Architecturally impossible without joint compute over secret-shared inputs. The federation guarantee is cryptographic — not policy-promised."

### 1:28–1:30 — Tag
**Visual:** Logo + URL: kindred.gudman.xyz / @gudman / built on @ArciumHQ.
**Voiceover:**
> "Kindred. Built for the populations who can't afford to be in 23andMe."

---

## Recording prep

- Use OBS or Loom at 1920×1080 60fps
- Browser zoomed to 110% for text readability on small screens
- Pre-load all persona assets so no fetch delay during recording
- Audio: room-treated mic, target -16 LUFS
- Music bed: low-key ambient pad, drops out during voiceover

## Pacing notes

- Don't rush. 90 seconds is enough to land each beat if every word is needed.
- The cross-org reveal is the climax. Hold on the score animation for the full 1.8s.
- Avoid crypto jargon in voiceover — the visuals show ciphertext, you don't need to say "Rescue cipher".
- Lead with people (Maya, her bio mother). Tech is the supporting cast.

## Deliverable

`kindred-demo-90s.mp4` — H.264, 1080p, AAC audio, ≤30MB. Published: [youtu.be/rBao3EV8PtI](https://youtu.be/rBao3EV8PtI).
