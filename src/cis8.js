// CIS-8 External Key Registry: the canonical message an external key signs to prove that the same person
// controls it and a Concordium account. Spec: https://proposals.concordium.com/CIS/cis-8.html
// For the solana-ed25519 scheme the message bytes are signed directly with Ed25519 (no prefix, no hash).
import { decodeAccountAddress } from './base58.js';
import { concat, fromHex, u32le, u64le, utf8 } from './bytes.js';
import { network } from './networks.js';

export const CIS8_DOMAIN_TAG = 'CIS-8/v1/canonical';
// CAIP-2 id of Solana mainnet (genesis hash prefix), the namespace the Agent Registry app uses for Solana.
export const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

const string = (s) => {
    const b = utf8(s);
    return concat(u32le(b.length), b);
};

// CanonicalSignedMessage ::= "CIS-8/v1/canonical" ‖ AccountAddress ‖ ContractAddress (CIS-8) ‖
//   genesis BlockHash ‖ String(external_namespace) ‖ ExternalKeyId ‖ String(proof_scheme)
// ExternalKeyId ::= String(namespace) ‖ String(key_type) ‖ Bytestring(public_key)  (Bytestring = u32 LE length + bytes)
export async function cis8CanonicalBytes({
    networkId,
    concordiumAccount,
    externalNamespace,
    keyNamespace = externalNamespace,
    keyType,
    publicKey,
    proofScheme,
}) {
    const net = network(networkId);
    return concat(
        utf8(CIS8_DOMAIN_TAG),
        await decodeAccountAddress(concordiumAccount),
        u64le(net.cis8.index),
        u64le(net.cis8.subindex),
        fromHex(net.genesisHash),
        string(externalNamespace),
        string(keyNamespace),
        string(keyType),
        concat(u32le(publicKey.length), publicKey),
        string(proofScheme)
    );
}

// The message for binding a Solana ed25519 public key (32 bytes) to a Concordium account.
export function solanaCis8Message({ networkId, concordiumAccount, solanaPublicKey }) {
    if (solanaPublicKey.length !== 32) throw new Error('a Solana public key is 32 bytes');
    return cis8CanonicalBytes({
        networkId,
        concordiumAccount,
        externalNamespace: SOLANA_MAINNET,
        keyType: 'ed25519',
        publicKey: solanaPublicKey,
        proofScheme: 'solana-ed25519',
    });
}
