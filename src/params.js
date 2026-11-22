// Local encoders for the CIS-8004 parameters we ask the operator to sign, so a payload built by the
// hosted service can be checked byte for byte before anyone signs it. Encodings follow the module's
// embedded schema (read from CCDScan on 22 Nov 2026) and match the service's parameter_hex.
import { concat, fromHex, toHex, u32le, u64le, utf8 } from './bytes.js';

const none = () => Uint8Array.of(0);
const some = (bytes) => concat(Uint8Array.of(1), bytes);
const string = (s) => {
    const b = utf8(s);
    return concat(u32le(b.length), b);
};
const hash32 = (hex) => {
    const b = fromHex(hex);
    if (b.length !== 32) throw new Error('metadata hash must be 32 bytes');
    return b;
};

// CIS-2 TokenIdU64: one length byte (8) then the id as u64 little-endian.
export const tokenIdU64 = (id) => concat(Uint8Array.of(8), u64le(id));

// register(agent_uri: Option<String>, metadata_hash: Option<[u8;32]>, external_reference: Option<..>,
// initial_metadata: Vec<..>). We only ever build it with no external reference and no metadata.
export function encodeRegister({ agentUri = null, metadataHashHex = null }) {
    return toHex(
        concat(
            agentUri === null ? none() : some(string(agentUri)),
            metadataHashHex === null ? none() : some(hash32(metadataHashHex)),
            none(),
            u32le(0)
        )
    );
}

// setAgentURI(token_id: TokenIdU64, agent_uri: Option<String>, metadata_hash: Option<[u8;32]>).
export function encodeSetAgentUri({ tokenId, agentUri = null, metadataHashHex = null }) {
    return toHex(
        concat(
            tokenIdU64(tokenId),
            agentUri === null ? none() : some(string(agentUri)),
            metadataHashHex === null ? none() : some(hash32(metadataHashHex))
        )
    );
}
