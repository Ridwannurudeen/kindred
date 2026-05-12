use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    pub const NUM_LOCI: usize = 20;
    pub const PROFILE_LEN: usize = 40; // 20 loci × 2 alleles
    pub const BUCKET_SIZE: usize = 4;
    pub const TOTAL_ALLELES: usize = 160; // BUCKET_SIZE * PROFILE_LEN
    pub const COUNT_INDEX: usize = 160; // last byte stores member count
    pub const BUCKET_BYTES: usize = 161;

    // Whole bucket: 160 allele bytes + 1 count byte = 161 bytes packed
    type StrProfile = Pack<[u8; 40]>;
    type ProfileBucket = Pack<[u8; 161]>;

    fn ibs_locus(a1: u8, a2: u8, b1: u8, b2: u8) -> u8 {
        let any_share = ((a1 == b1) || (a1 == b2) || (a2 == b1) || (a2 == b2)) as u8;
        let geno_match = (((a1 == b1) && (a2 == b2)) || ((a1 == b2) && (a2 == b1))) as u8;
        any_share + geno_match
    }

    fn ibs_total(alleles: &[u8; 161], a_offset: usize, b_offset: usize) -> u8 {
        let mut score: u8 = 0;
        for i in 0..NUM_LOCI {
            let a1 = alleles[a_offset + 2 * i];
            let a2 = alleles[a_offset + 2 * i + 1];
            let b1 = alleles[b_offset + 2 * i];
            let b2 = alleles[b_offset + 2 * i + 1];
            score += ibs_locus(a1, a2, b1, b2);
        }
        score
    }

    fn ibs_total_cross(
        alleles_a: &[u8; 161],
        alleles_b: &[u8; 161],
        a_offset: usize,
        b_offset: usize,
    ) -> u8 {
        let mut score: u8 = 0;
        for i in 0..NUM_LOCI {
            let a1 = alleles_a[a_offset + 2 * i];
            let a2 = alleles_a[a_offset + 2 * i + 1];
            let b1 = alleles_b[b_offset + 2 * i];
            let b2 = alleles_b[b_offset + 2 * i + 1];
            score += ibs_locus(a1, a2, b1, b2);
        }
        score
    }

    #[instruction]
    pub fn init_org_registry() -> Enc<Mxe, ProfileBucket> {
        let bucket: [u8; 161] = [0u8; 161];
        Mxe::get().from_arcis(Pack::new(bucket))
    }

    #[instruction]
    pub fn register_profile(
        profile_ctxt: Enc<Shared, StrProfile>,
        registry_ctxt: Enc<Mxe, ProfileBucket>,
    ) -> Enc<Mxe, ProfileBucket> {
        let new_alleles: [u8; 40] = profile_ctxt.to_arcis().unpack();
        let mut all: [u8; 161] = registry_ctxt.to_arcis().unpack();
        let count = all[COUNT_INDEX];

        // Constant-time write: scan all slots, write only at slot == count
        for slot in 0..BUCKET_SIZE {
            let is_target = (slot as u8) == count;
            let base = slot * PROFILE_LEN;
            for j in 0..PROFILE_LEN {
                let new_val = new_alleles[j];
                let old_val = all[base + j];
                all[base + j] = if is_target { new_val } else { old_val };
            }
        }

        let can_add = count < (BUCKET_SIZE as u8);
        all[COUNT_INDEX] = if can_add { count + 1 } else { count };

        registry_ctxt.owner.from_arcis(Pack::new(all))
    }

    #[instruction]
    pub fn intra_org_match(
        a_idx: u8,
        b_idx: u8,
        registry_ctxt: Enc<Mxe, ProfileBucket>,
    ) -> u8 {
        let alleles: [u8; 161] = registry_ctxt.to_arcis().unpack();
        let a_offset = (a_idx as usize) * PROFILE_LEN;
        let b_offset = (b_idx as usize) * PROFILE_LEN;
        let score = ibs_total(&alleles, a_offset, b_offset);
        score.reveal()
    }

    #[instruction]
    pub fn cross_org_match(
        a_idx: u8,
        b_idx: u8,
        registry_a_ctxt: Enc<Mxe, ProfileBucket>,
        registry_b_ctxt: Enc<Mxe, ProfileBucket>,
    ) -> u8 {
        let alleles_a: [u8; 161] = registry_a_ctxt.to_arcis().unpack();
        let alleles_b: [u8; 161] = registry_b_ctxt.to_arcis().unpack();
        let a_offset = (a_idx as usize) * PROFILE_LEN;
        let b_offset = (b_idx as usize) * PROFILE_LEN;
        let score = ibs_total_cross(&alleles_a, &alleles_b, a_offset, b_offset);
        score.reveal()
    }
}
