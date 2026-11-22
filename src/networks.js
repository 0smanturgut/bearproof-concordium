// Concordium networks and the Agent Registry deployments on them.
// Testnet values were read live on 22 Nov 2026 (MCP contract_info / network_status, see docs/api-notes.md).
// Every helper in this repository takes a network id and defaults to nothing: the hosted MCP server and
// the REST account lookups silently fall back to mainnet, and the indexer falls back to devnet.

export const MCP_URL = 'https://agent-registry-mcp.concordium.com/mcp';
export const REST_BASE = 'https://agent-registry-mcp.concordium.com';
export const INDEXER_BASE = 'https://agent-registry-indexer.concordium.com';
export const BADGE_DOCS_URL =
    'https://docs.concordium.com/en/mainnet/technical-reference/agent-registry/concordium-badge.html';

export const NETWORKS = Object.freeze({
    testnet: Object.freeze({
        id: 'testnet',
        genesisHash: '4221332d34e1694168c2a0c0b3fd0f273809612cb13d000d5c2e00e85f50f796',
        cis8004: Object.freeze({ index: 12802, subindex: 0 }),
        cis8: Object.freeze({ index: 12801, subindex: 0 }),
        cis8004ModuleRef: '0e57473715d1c2a364fa626b8783688db32b7fac9d0e2fc97043da91e1a7d3eb',
        cis8ModuleRef: '3236c12fade1b559935906df2e0e43a372234eac5d40599d6e6cb12cdd6b9afd',
        grpcWeb: 'https://grpc.testnet.concordium.com:20000',
        explorer: 'https://ccdexplorer.io/testnet',
        ccdscan: 'https://testnet.ccdscan.io',
    }),
    mainnet: Object.freeze({
        id: 'mainnet',
        genesisHash: '9dd9ca4d19e9393877d2c44b70f89acbfc0883c2243e5eeaecc0d1cd0503f478',
        cis8004: Object.freeze({ index: 10082, subindex: 0 }),
        cis8: Object.freeze({ index: 10081, subindex: 0 }),
        cis8004ModuleRef: '0e57473715d1c2a364fa626b8783688db32b7fac9d0e2fc97043da91e1a7d3eb',
        cis8ModuleRef: null,
        grpcWeb: 'https://grpc.mainnet.concordium.software:20000',
        explorer: 'https://ccdexplorer.io/mainnet',
        ccdscan: 'https://ccdscan.io',
    }),
});

export function network(id) {
    const net = NETWORKS[id];
    if (!net) throw new Error(`unknown network "${id}" (use "testnet" or "mainnet", always explicitly)`);
    return net;
}

// CAIP-2 chain id: "ccd:" + the first 32 hex characters of the genesis hash.
export function caip2(id) {
    return `ccd:${network(id).genesisHash.slice(0, 32)}`;
}

// CAIP-10 account: <caip2>:<base58 account>.
export function caip10Account(id, account) {
    return `${caip2(id)}:${account}`;
}

// CAIP-10 contract, as the badge writes it: <caip2>:<index>.<subindex>.
export function caip10Contract(id, contract) {
    return `${caip2(id)}:${contract.index}.${contract.subindex}`;
}

// CAIP-19 badge: <caip2>/cis-2:<short badge>.
export function caip19Badge(id, shortBadge) {
    return `${caip2(id)}/cis-2:${shortBadge}`;
}
