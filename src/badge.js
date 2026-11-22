// The "Verified by Concordium" badge: the CIS-2 token address of an agent's CIS-8004 NFT, and the A2A
// extension block an Agent Card carries for it.
// Spec: https://docs.concordium.com/en/mainnet/technical-reference/agent-registry/concordium-badge.html
// The block composed here matches, field for field and in the same key order, what the hosted service
// returns from build_agent_card (pre-mint) and /v1/get-badge-JSON (after mint); see test/badge.test.mjs.
import { base58CheckDecode, base58CheckEncode } from './base58.js';
import { concat, u64le, uleb128 } from './bytes.js';
import { BADGE_DOCS_URL, MCP_URL, REST_BASE, caip10Account, caip10Contract, caip19Badge, network } from './networks.js';

export const BADGE_EXTENSION_URI = 'https://docs.concordium.com/a2a-extensions/concordium-badge/v1';
export const BADGE_DESCRIPTION = 'Verified by Concordium badge — on-chain agent identity in a CIS-8004 registry';
export const BADGE_VERIFY_TEXT =
    'Resolve tokenAddress via CIS-8004 agent_of; confirm owner + status=Active + card SHA-256 == metadata_hash.';

// Short badge: Base58Check(0x02 ‖ ULEB128(index) ‖ ULEB128(subindex) ‖ token id as u64 little-endian).
export async function encodeTokenAddress(contract, tokenId) {
    return base58CheckEncode(
        concat(Uint8Array.of(2), uleb128(contract.index), uleb128(contract.subindex), u64le(tokenId))
    );
}

export async function decodeTokenAddress(badge) {
    const p = await base58CheckDecode(badge);
    if (p[0] !== 2) throw new Error(`not a CIS-2 token address: ${badge}`);
    let at = 1;
    const read = () => {
        let v = 0n;
        let shift = 0n;
        for (;;) {
            const b = p[at++];
            if (b === undefined) throw new Error('truncated token address');
            v |= BigInt(b & 0x7f) << shift;
            if (!(b & 0x80)) return v;
            shift += 7n;
        }
    };
    const index = Number(read());
    const subindex = Number(read());
    const idBytes = p.slice(at);
    if (idBytes.length !== 8) throw new Error('token id is not a u64 (CIS-8004 uses TokenIdU64)');
    const tokenId = new DataView(idBytes.buffer, idBytes.byteOffset).getBigUint64(0, true);
    return { contract: { index, subindex }, tokenId: Number(tokenId) };
}

export function verifyUrlFor(key) {
    return `${REST_BASE}/v1/badge-check/${key}`;
}

// The extension object for capabilities.extensions.
// tokenId === null gives the pre-mint form (tokenAddress null, verifyUrl keyed on the owner account),
// as build_agent_card returns it before register has minted a token id.
export async function composeBadgeExtension({ networkId, ownerAccount, tokenId = null, agentWallet = null }) {
    const net = network(networkId);
    if (!ownerAccount) throw new Error('ownerAccount is required');
    const short = tokenId === null || tokenId === undefined ? null : await encodeTokenAddress(net.cis8004, tokenId);
    return {
        uri: BADGE_EXTENSION_URI,
        description: BADGE_DESCRIPTION,
        required: false,
        params: {
            tokenAddress: short ? caip19Badge(networkId, short) : null,
            owner: { account: caip10Account(networkId, ownerAccount) },
            agentWallet: caip10Account(networkId, agentWallet || ownerAccount),
            contracts: {
                cis8004: caip10Contract(networkId, net.cis8004),
                cis8: caip10Contract(networkId, net.cis8),
            },
            verify: BADGE_VERIFY_TEXT,
            verification: {
                service: 'Concordium Agent Registry',
                verifyUrl: verifyUrlFor(short || ownerAccount),
                mcp: MCP_URL,
                docs: BADGE_DOCS_URL,
            },
        },
    };
}

// The ERC-8004 registrations entry: { agentId, agentRegistry } with the registry as a CAIP-10 contract.
export function registrationsEntry(networkId, tokenId) {
    return { agentId: Number(tokenId), agentRegistry: caip10Contract(networkId, network(networkId).cis8004) };
}
