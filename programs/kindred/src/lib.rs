use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::{CallbackAccount, CircuitSource, OffChainCircuitSource};
use arcium_macros::circuit_hash;

const CIRCUIT_HOST: &str = "https://kindred.gudman.xyz/circuits";

const COMP_DEF_OFFSET_INIT_ORG_REGISTRY: u32 = comp_def_offset("init_org_registry_v2");
const COMP_DEF_OFFSET_REGISTER_PROFILE: u32 = comp_def_offset("register_profile_v2");
const COMP_DEF_OFFSET_INTRA_ORG_MATCH: u32 = comp_def_offset("intra_org_match_v2");
const COMP_DEF_OFFSET_CROSS_ORG_MATCH: u32 = comp_def_offset("cross_org_match_v2");

declare_id!("dxfUyyp55B2fAbgAVF491gRAvz2gqkvqKFMY9SDJH7B");

// BUCKET_SIZE = 4 in encrypted-ixs/src/lib.rs → 161-byte plaintext bucket.
// BN254 BaseField CAPACITY (253 bits) − STATISTICAL_SECURITY_FACTOR (40) = 213 bits/container.
// 161 bytes × 8 bits = 1288 bits ÷ 213 bits/container → 7 containers.
const BUCKET_CT_CHUNKS: usize = 7; // Pack<[u8; 161]> packs to 7 BaseField chunks
const BUCKET_CT_LEN: u32 = 32 * BUCKET_CT_CHUNKS as u32; // 224 bytes
const ENC_DATA_OFFSET: u32 = 8 + 1 + 32 + 16; // discriminator + bump + org_id + nonce

// Match state machine
pub const STATE_PENDING: u8 = 0;
pub const STATE_CONSENTED: u8 = 1;
pub const STATE_COMPUTING: u8 = 2;
pub const STATE_REVEALED: u8 = 3;
pub const STATE_REJECTED: u8 = 4;
pub const STATE_EXPIRED: u8 = 5;

#[arcium_program]
pub mod kindred {
    use super::*;

    // ===== Comp def initialization (one-time) =====

    pub fn init_init_org_registry_comp_def(
        ctx: Context<InitInitOrgRegistryCompDef>,
    ) -> Result<()> {
        init_comp_def(
            ctx.accounts,
            Some(CircuitSource::OffChain(OffChainCircuitSource {
                source: format!("{}/init_org_registry_v2.arcis", CIRCUIT_HOST),
                hash: circuit_hash!("init_org_registry_v2"),
            })),
            None,
        )?;
        Ok(())
    }

    pub fn init_register_profile_comp_def(
        ctx: Context<InitRegisterProfileCompDef>,
    ) -> Result<()> {
        init_comp_def(
            ctx.accounts,
            Some(CircuitSource::OffChain(OffChainCircuitSource {
                source: format!("{}/register_profile_v2.arcis", CIRCUIT_HOST),
                hash: circuit_hash!("register_profile_v2"),
            })),
            None,
        )?;
        Ok(())
    }

    pub fn init_intra_org_match_comp_def(
        ctx: Context<InitIntraOrgMatchCompDef>,
    ) -> Result<()> {
        init_comp_def(
            ctx.accounts,
            Some(CircuitSource::OffChain(OffChainCircuitSource {
                source: format!("{}/intra_org_match_v2.arcis", CIRCUIT_HOST),
                hash: circuit_hash!("intra_org_match_v2"),
            })),
            None,
        )?;
        Ok(())
    }

    pub fn init_cross_org_match_comp_def(
        ctx: Context<InitCrossOrgMatchCompDef>,
    ) -> Result<()> {
        init_comp_def(
            ctx.accounts,
            Some(CircuitSource::OffChain(OffChainCircuitSource {
                source: format!("{}/cross_org_match_v2.arcis", CIRCUIT_HOST),
                hash: circuit_hash!("cross_org_match_v2"),
            })),
            None,
        )?;
        Ok(())
    }

    // ===== Org lifecycle =====

    pub fn create_org(
        ctx: Context<CreateOrg>,
        computation_offset: u64,
        org_id: [u8; 32],
        name: String,
    ) -> Result<()> {
        require!(name.len() <= 64, ErrorCode::NameTooLong);

        let org = &mut ctx.accounts.org;
        org.bump = ctx.bumps.org;
        org.org_id = org_id;
        org.admin = ctx.accounts.payer.key();
        org.name = name;
        org.member_count = 0;
        org.created_at = Clock::get()?.unix_timestamp;

        let bucket = &mut ctx.accounts.org_bucket;
        bucket.bump = ctx.bumps.org_bucket;
        bucket.org_id = org_id;
        bucket.nonce = 0;
        bucket.ciphertexts = [[0u8; 32]; BUCKET_CT_CHUNKS];

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let args = ArgBuilder::new().build();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![InitOrgRegistryV2Callback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[CallbackAccount {
                    pubkey: ctx.accounts.org_bucket.key(),
                    is_writable: true,
                }],
            )?],
            1,
            0,
        )?;

        emit!(OrgCreatedEvent {
            org_id,
            admin: ctx.accounts.payer.key(),
        });
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "init_org_registry_v2")]
    pub fn init_org_registry_v2_callback(
        ctx: Context<InitOrgRegistryV2Callback>,
        output: SignedComputationOutputs<InitOrgRegistryV2Output>,
    ) -> Result<()> {
        let o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(InitOrgRegistryV2Output { field_0 }) => field_0,
            Err(_) => return Err(ErrorCode::AbortedComputation.into()),
        };

        ctx.accounts.org_bucket.nonce = o.nonce;
        ctx.accounts.org_bucket.ciphertexts = o.ciphertexts;
        Ok(())
    }

    // ===== Federation =====

    pub fn set_federation_agreement(
        ctx: Context<SetFederationAgreement>,
        expires_at: i64,
    ) -> Result<()> {
        let agreement = &mut ctx.accounts.agreement;
        agreement.bump = ctx.bumps.agreement;
        agreement.org_a = ctx.accounts.org_a.key();
        agreement.org_b = ctx.accounts.org_b.key();
        agreement.active = true;
        agreement.created_at = Clock::get()?.unix_timestamp;
        agreement.expires_at = expires_at;

        emit!(FederationAgreementSignedEvent {
            org_a: ctx.accounts.org_a.key(),
            org_b: ctx.accounts.org_b.key(),
            expires_at,
        });
        Ok(())
    }

    pub fn revoke_federation(ctx: Context<RevokeFederation>) -> Result<()> {
        let agreement = &mut ctx.accounts.agreement;
        require!(agreement.active, ErrorCode::FederationAlreadyInactive);

        agreement.active = false;

        emit!(FederationRevokedEvent {
            org_a: agreement.org_a,
            org_b: agreement.org_b,
            revoked_by: ctx.accounts.admin.key(),
        });
        Ok(())
    }

    // ===== Profile registration =====

    pub fn register_profile(
        ctx: Context<RegisterProfile>,
        computation_offset: u64,
        ciphertext_0: [u8; 32],
        ciphertext_1: [u8; 32],
        user_pubkey: [u8; 32],
        user_nonce: u128,
        opt_in_intra: bool,
        opt_in_cross: bool,
    ) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        profile.bump = ctx.bumps.profile;
        profile.org = ctx.accounts.org.key();
        profile.user = ctx.accounts.payer.key();
        profile.slot = ctx.accounts.org.member_count;
        profile.opt_in_intra = opt_in_intra;
        profile.opt_in_cross = opt_in_cross;
        profile.created_at = Clock::get()?.unix_timestamp;
        profile.deactivated = false;

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let args = ArgBuilder::new()
            .x25519_pubkey(user_pubkey)
            .plaintext_u128(user_nonce)
            .encrypted_u8(ciphertext_0)
            .encrypted_u8(ciphertext_1)
            .plaintext_u128(ctx.accounts.org_bucket.nonce)
            .account(
                ctx.accounts.org_bucket.key(),
                ENC_DATA_OFFSET,
                BUCKET_CT_LEN,
            )
            .build();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![RegisterProfileV2Callback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[
                    CallbackAccount {
                        pubkey: ctx.accounts.org_bucket.key(),
                        is_writable: true,
                    },
                    CallbackAccount {
                        pubkey: ctx.accounts.org.key(),
                        is_writable: true,
                    },
                ],
            )?],
            1,
            0,
        )?;

        Ok(())
    }

    #[arcium_callback(encrypted_ix = "register_profile_v2")]
    pub fn register_profile_v2_callback(
        ctx: Context<RegisterProfileV2Callback>,
        output: SignedComputationOutputs<RegisterProfileV2Output>,
    ) -> Result<()> {
        let o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(RegisterProfileV2Output { field_0 }) => field_0,
            Err(_) => return Err(ErrorCode::AbortedComputation.into()),
        };

        ctx.accounts.org_bucket.nonce = o.nonce;
        ctx.accounts.org_bucket.ciphertexts = o.ciphertexts;
        ctx.accounts.org.member_count += 1;

        emit!(ProfileRegisteredEvent {
            org: ctx.accounts.org.key(),
            slot: ctx.accounts.org.member_count - 1,
        });
        Ok(())
    }

    // ===== Match requests =====

    pub fn request_intra_match(ctx: Context<RequestIntraMatch>) -> Result<()> {
        let req = &mut ctx.accounts.match_request;
        req.bump = ctx.bumps.match_request;
        req.requester = ctx.accounts.requester_profile.key();
        req.target = ctx.accounts.target_profile.key();
        req.state = STATE_PENDING;
        req.score = 0;
        req.is_cross_org = false;
        req.created_at = Clock::get()?.unix_timestamp;
        req.expires_at = req.created_at + 86400; // 24h

        emit!(MatchRequestedEvent {
            requester: req.requester,
            target: req.target,
            is_cross_org: false,
        });
        Ok(())
    }

    pub fn request_cross_match(ctx: Context<RequestCrossMatch>) -> Result<()> {
        require!(
            ctx.accounts.federation_agreement.active,
            ErrorCode::FederationNotEstablished
        );
        require!(
            ctx.accounts.requester_profile.opt_in_cross,
            ErrorCode::NotOptedIntoCrossMatch
        );
        require!(
            ctx.accounts.target_profile.opt_in_cross,
            ErrorCode::NotOptedIntoCrossMatch
        );

        let req = &mut ctx.accounts.match_request;
        req.bump = ctx.bumps.match_request;
        req.requester = ctx.accounts.requester_profile.key();
        req.target = ctx.accounts.target_profile.key();
        req.state = STATE_PENDING;
        req.score = 0;
        req.is_cross_org = true;
        req.created_at = Clock::get()?.unix_timestamp;
        req.expires_at = req.created_at + 86400;

        emit!(MatchRequestedEvent {
            requester: req.requester,
            target: req.target,
            is_cross_org: true,
        });
        Ok(())
    }

    // ===== Consent (queues MXE match) =====

    pub fn consent_intra_match(
        ctx: Context<ConsentIntraMatch>,
        computation_offset: u64,
    ) -> Result<()> {
        let req = &mut ctx.accounts.match_request;
        require!(req.state == STATE_PENDING, ErrorCode::NotPending);
        require!(!req.is_cross_org, ErrorCode::WrongMatchMode);

        req.state = STATE_COMPUTING;

        emit!(MatchConsentedEvent {
            requester: req.requester,
            target: req.target,
            is_cross_org: false,
        });

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let a_idx = ctx.accounts.requester_profile.slot;
        let b_idx = ctx.accounts.target_profile.slot;

        let args = ArgBuilder::new()
            .plaintext_u8(a_idx)
            .plaintext_u8(b_idx)
            .plaintext_u128(ctx.accounts.org_bucket.nonce)
            .account(
                ctx.accounts.org_bucket.key(),
                ENC_DATA_OFFSET,
                BUCKET_CT_LEN,
            )
            .build();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![IntraOrgMatchV2Callback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[CallbackAccount {
                    pubkey: ctx.accounts.match_request.key(),
                    is_writable: true,
                }],
            )?],
            1,
            0,
        )?;

        Ok(())
    }

    #[arcium_callback(encrypted_ix = "intra_org_match_v2")]
    pub fn intra_org_match_v2_callback(
        ctx: Context<IntraOrgMatchV2Callback>,
        output: SignedComputationOutputs<IntraOrgMatchV2Output>,
    ) -> Result<()> {
        let score = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(IntraOrgMatchV2Output { field_0 }) => field_0,
            Err(_) => return Err(ErrorCode::AbortedComputation.into()),
        };

        ctx.accounts.match_request.score = score;
        ctx.accounts.match_request.state = STATE_REVEALED;

        emit!(MatchRevealedEvent {
            requester: ctx.accounts.match_request.requester,
            target: ctx.accounts.match_request.target,
            score,
            is_cross_org: false,
        });
        Ok(())
    }

    pub fn consent_cross_match(
        ctx: Context<ConsentCrossMatch>,
        computation_offset: u64,
    ) -> Result<()> {
        let req = &mut ctx.accounts.match_request;
        require!(req.state == STATE_PENDING, ErrorCode::NotPending);
        require!(req.is_cross_org, ErrorCode::WrongMatchMode);
        require!(
            ctx.accounts.federation_agreement.active,
            ErrorCode::FederationNotEstablished
        );

        req.state = STATE_COMPUTING;

        emit!(MatchConsentedEvent {
            requester: req.requester,
            target: req.target,
            is_cross_org: true,
        });

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let a_idx = ctx.accounts.requester_profile.slot;
        let b_idx = ctx.accounts.target_profile.slot;

        let args = ArgBuilder::new()
            .plaintext_u8(a_idx)
            .plaintext_u8(b_idx)
            .plaintext_u128(ctx.accounts.org_a_bucket.nonce)
            .account(
                ctx.accounts.org_a_bucket.key(),
                ENC_DATA_OFFSET,
                BUCKET_CT_LEN,
            )
            .plaintext_u128(ctx.accounts.org_b_bucket.nonce)
            .account(
                ctx.accounts.org_b_bucket.key(),
                ENC_DATA_OFFSET,
                BUCKET_CT_LEN,
            )
            .build();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![CrossOrgMatchV2Callback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[CallbackAccount {
                    pubkey: ctx.accounts.match_request.key(),
                    is_writable: true,
                }],
            )?],
            1,
            0,
        )?;

        Ok(())
    }

    #[arcium_callback(encrypted_ix = "cross_org_match_v2")]
    pub fn cross_org_match_v2_callback(
        ctx: Context<CrossOrgMatchV2Callback>,
        output: SignedComputationOutputs<CrossOrgMatchV2Output>,
    ) -> Result<()> {
        let score = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(CrossOrgMatchV2Output { field_0 }) => field_0,
            Err(_) => return Err(ErrorCode::AbortedComputation.into()),
        };

        ctx.accounts.match_request.score = score;
        ctx.accounts.match_request.state = STATE_REVEALED;

        emit!(MatchRevealedEvent {
            requester: ctx.accounts.match_request.requester,
            target: ctx.accounts.match_request.target,
            score,
            is_cross_org: true,
        });
        Ok(())
    }

    // ===== Reject (target declines a pending request) =====

    pub fn reject_match(ctx: Context<RejectMatch>) -> Result<()> {
        let req = &mut ctx.accounts.match_request;
        require!(req.state == STATE_PENDING, ErrorCode::NotPending);

        req.state = STATE_REJECTED;

        emit!(MatchRejectedEvent {
            requester: req.requester,
            target: req.target,
            is_cross_org: req.is_cross_org,
        });
        Ok(())
    }
}

// =============================================================================
// State accounts
// =============================================================================

#[account]
#[derive(InitSpace)]
pub struct Org {
    pub bump: u8,
    pub org_id: [u8; 32],
    pub admin: Pubkey,
    #[max_len(64)]
    pub name: String,
    pub member_count: u8,
    pub created_at: i64,
}

#[account]
pub struct OrgBucket {
    pub bump: u8,
    pub org_id: [u8; 32],
    pub nonce: u128,
    pub ciphertexts: [[u8; 32]; BUCKET_CT_CHUNKS],
}

impl OrgBucket {
    pub const SIZE: usize = 1 + 32 + 16 + (32 * BUCKET_CT_CHUNKS);
}

#[account]
#[derive(InitSpace)]
pub struct Profile {
    pub bump: u8,
    pub org: Pubkey,
    pub user: Pubkey,
    pub slot: u8,
    pub opt_in_intra: bool,
    pub opt_in_cross: bool,
    pub deactivated: bool,
    pub created_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct FederationAgreement {
    pub bump: u8,
    pub org_a: Pubkey,
    pub org_b: Pubkey,
    pub active: bool,
    pub created_at: i64,
    pub expires_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct MatchRequest {
    pub bump: u8,
    pub requester: Pubkey,
    pub target: Pubkey,
    pub state: u8,
    pub score: u8,
    pub is_cross_org: bool,
    pub created_at: i64,
    pub expires_at: i64,
}

// =============================================================================
// Account contexts
// =============================================================================

#[init_computation_definition_accounts("init_org_registry_v2", payer)]
#[derive(Accounts)]
pub struct InitInitOrgRegistryCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("register_profile_v2", payer)]
#[derive(Accounts)]
pub struct InitRegisterProfileCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("intra_org_match_v2", payer)]
#[derive(Accounts)]
pub struct InitIntraOrgMatchCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("cross_org_match_v2", payer)]
#[derive(Accounts)]
pub struct InitCrossOrgMatchCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[queue_computation_accounts("init_org_registry_v2", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, org_id: [u8; 32])]
pub struct CreateOrg<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: mempool_account, checked by arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: executing_pool, checked by arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: computation_account, checked by arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_INIT_ORG_REGISTRY))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        init,
        payer = payer,
        space = 8 + Org::INIT_SPACE,
        seeds = [b"org", org_id.as_ref()],
        bump,
    )]
    pub org: Box<Account<'info, Org>>,
    #[account(
        init,
        payer = payer,
        space = 8 + OrgBucket::SIZE,
        seeds = [b"org_bucket", org_id.as_ref()],
        bump,
    )]
    pub org_bucket: Box<Account<'info, OrgBucket>>,
}

#[callback_accounts("init_org_registry_v2")]
#[derive(Accounts)]
pub struct InitOrgRegistryV2Callback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_INIT_ORG_REGISTRY))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account, checked by arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint.
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub org_bucket: Account<'info, OrgBucket>,
}

#[derive(Accounts)]
pub struct SetFederationAgreement<'info> {
    #[account(mut)]
    pub admin_a: Signer<'info>,
    pub admin_b: Signer<'info>,
    #[account(constraint = org_a.admin == admin_a.key() @ ErrorCode::NotAuthorized)]
    pub org_a: Box<Account<'info, Org>>,
    #[account(constraint = org_b.admin == admin_b.key() @ ErrorCode::NotAuthorized)]
    pub org_b: Box<Account<'info, Org>>,
    #[account(
        init,
        payer = admin_a,
        space = 8 + FederationAgreement::INIT_SPACE,
        seeds = [b"fed", org_a.key().as_ref(), org_b.key().as_ref()],
        bump,
    )]
    pub agreement: Account<'info, FederationAgreement>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeFederation<'info> {
    pub admin: Signer<'info>,
    pub org_a: Box<Account<'info, Org>>,
    pub org_b: Box<Account<'info, Org>>,
    #[account(
        mut,
        seeds = [b"fed", org_a.key().as_ref(), org_b.key().as_ref()],
        bump = agreement.bump,
        constraint = (org_a.admin == admin.key() || org_b.admin == admin.key()) @ ErrorCode::NotAuthorized,
    )]
    pub agreement: Account<'info, FederationAgreement>,
}

#[derive(Accounts)]
pub struct RejectMatch<'info> {
    pub payer: Signer<'info>,
    #[account(constraint = target_profile.user == payer.key() @ ErrorCode::NotAuthorized)]
    pub target_profile: Box<Account<'info, Profile>>,
    #[account(
        mut,
        constraint = match_request.target == target_profile.key() @ ErrorCode::NotAuthorized,
    )]
    pub match_request: Box<Account<'info, MatchRequest>>,
}

#[queue_computation_accounts("register_profile_v2", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct RegisterProfile<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: mempool_account, checked by arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: executing_pool, checked by arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: computation_account, checked by arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_REGISTER_PROFILE))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
    #[account(mut)]
    pub org: Box<Account<'info, Org>>,
    #[account(
        mut,
        seeds = [b"org_bucket", org.org_id.as_ref()],
        bump = org_bucket.bump,
    )]
    pub org_bucket: Box<Account<'info, OrgBucket>>,
    #[account(
        init,
        payer = payer,
        space = 8 + Profile::INIT_SPACE,
        seeds = [b"profile", org.key().as_ref(), payer.key().as_ref()],
        bump,
    )]
    pub profile: Box<Account<'info, Profile>>,
}

#[callback_accounts("register_profile_v2")]
#[derive(Accounts)]
pub struct RegisterProfileV2Callback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_REGISTER_PROFILE))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account, checked by arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint.
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub org_bucket: Account<'info, OrgBucket>,
    #[account(mut)]
    pub org: Account<'info, Org>,
}

#[derive(Accounts)]
pub struct RequestIntraMatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(constraint = requester_profile.user == payer.key() @ ErrorCode::NotAuthorized)]
    pub requester_profile: Box<Account<'info, Profile>>,
    #[account(constraint = target_profile.org == requester_profile.org @ ErrorCode::WrongMatchMode)]
    pub target_profile: Box<Account<'info, Profile>>,
    #[account(
        init,
        payer = payer,
        space = 8 + MatchRequest::INIT_SPACE,
        seeds = [b"match_req", requester_profile.key().as_ref(), target_profile.key().as_ref()],
        bump,
    )]
    pub match_request: Box<Account<'info, MatchRequest>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RequestCrossMatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(constraint = requester_profile.user == payer.key() @ ErrorCode::NotAuthorized)]
    pub requester_profile: Box<Account<'info, Profile>>,
    #[account(constraint = target_profile.org != requester_profile.org @ ErrorCode::WrongMatchMode)]
    pub target_profile: Box<Account<'info, Profile>>,
    #[account(constraint = federation_agreement.active @ ErrorCode::FederationNotEstablished)]
    pub federation_agreement: Box<Account<'info, FederationAgreement>>,
    #[account(
        init,
        payer = payer,
        space = 8 + MatchRequest::INIT_SPACE,
        seeds = [b"match_req", requester_profile.key().as_ref(), target_profile.key().as_ref()],
        bump,
    )]
    pub match_request: Box<Account<'info, MatchRequest>>,
    pub system_program: Program<'info, System>,
}

#[queue_computation_accounts("intra_org_match_v2", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct ConsentIntraMatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: mempool_account, checked by arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: executing_pool, checked by arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: computation_account, checked by arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_INTRA_ORG_MATCH))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
    #[account(constraint = target_profile.user == payer.key() @ ErrorCode::NotAuthorized)]
    pub target_profile: Box<Account<'info, Profile>>,
    pub requester_profile: Box<Account<'info, Profile>>,
    #[account(mut)]
    pub match_request: Box<Account<'info, MatchRequest>>,
    #[account(address = target_profile.org)]
    pub org: Box<Account<'info, Org>>,
    #[account(seeds = [b"org_bucket", org.org_id.as_ref()], bump = org_bucket.bump)]
    pub org_bucket: Box<Account<'info, OrgBucket>>,
}

#[callback_accounts("intra_org_match_v2")]
#[derive(Accounts)]
pub struct IntraOrgMatchV2Callback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_INTRA_ORG_MATCH))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account, checked by arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint.
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub match_request: Account<'info, MatchRequest>,
}

#[queue_computation_accounts("cross_org_match_v2", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct ConsentCrossMatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: mempool_account, checked by arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: executing_pool, checked by arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: computation_account, checked by arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CROSS_ORG_MATCH))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
    #[account(constraint = target_profile.user == payer.key() @ ErrorCode::NotAuthorized)]
    pub target_profile: Box<Account<'info, Profile>>,
    pub requester_profile: Box<Account<'info, Profile>>,
    #[account(mut)]
    pub match_request: Box<Account<'info, MatchRequest>>,
    pub federation_agreement: Box<Account<'info, FederationAgreement>>,
    #[account(address = requester_profile.org)]
    pub org_a: Box<Account<'info, Org>>,
    #[account(address = target_profile.org)]
    pub org_b: Box<Account<'info, Org>>,
    #[account(seeds = [b"org_bucket", org_a.org_id.as_ref()], bump = org_a_bucket.bump)]
    pub org_a_bucket: Box<Account<'info, OrgBucket>>,
    #[account(seeds = [b"org_bucket", org_b.org_id.as_ref()], bump = org_b_bucket.bump)]
    pub org_b_bucket: Box<Account<'info, OrgBucket>>,
}

#[callback_accounts("cross_org_match_v2")]
#[derive(Accounts)]
pub struct CrossOrgMatchV2Callback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CROSS_ORG_MATCH))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account, checked by arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint.
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub match_request: Account<'info, MatchRequest>,
}

// =============================================================================
// Events
// =============================================================================

#[event]
pub struct OrgCreatedEvent {
    pub org_id: [u8; 32],
    pub admin: Pubkey,
}

#[event]
pub struct FederationAgreementSignedEvent {
    pub org_a: Pubkey,
    pub org_b: Pubkey,
    pub expires_at: i64,
}

#[event]
pub struct ProfileRegisteredEvent {
    pub org: Pubkey,
    pub slot: u8,
}

#[event]
pub struct MatchRequestedEvent {
    pub requester: Pubkey,
    pub target: Pubkey,
    pub is_cross_org: bool,
}

#[event]
pub struct MatchRevealedEvent {
    pub requester: Pubkey,
    pub target: Pubkey,
    pub score: u8,
    pub is_cross_org: bool,
}

#[event]
pub struct FederationRevokedEvent {
    pub org_a: Pubkey,
    pub org_b: Pubkey,
    pub revoked_by: Pubkey,
}

#[event]
pub struct MatchConsentedEvent {
    pub requester: Pubkey,
    pub target: Pubkey,
    pub is_cross_org: bool,
}

#[event]
pub struct MatchRejectedEvent {
    pub requester: Pubkey,
    pub target: Pubkey,
    pub is_cross_org: bool,
}

// =============================================================================
// Errors
// =============================================================================

#[error_code]
pub enum ErrorCode {
    #[msg("The computation was aborted")]
    AbortedComputation,
    #[msg("Cluster not set")]
    ClusterNotSet,
    #[msg("Org name too long")]
    NameTooLong,
    #[msg("Not authorized for this action")]
    NotAuthorized,
    #[msg("Federation agreement does not exist or is inactive")]
    FederationNotEstablished,
    #[msg("Profile is not opted into cross-org matching")]
    NotOptedIntoCrossMatch,
    #[msg("Match request is not in pending state")]
    NotPending,
    #[msg("Wrong match mode (intra/cross mismatch)")]
    WrongMatchMode,
    #[msg("Federation agreement is already inactive")]
    FederationAlreadyInactive,
}
