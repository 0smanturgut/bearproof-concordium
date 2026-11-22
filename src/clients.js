// Read-only and transaction-building clients for the hosted Agent Registry services. Plain fetch, so
// the same code runs in Node 20+, browsers and Cloudflare Workers. Nothing here signs or submits.
//
// Network traps (seen live on 22 Nov 2026, see docs/api-notes.md):
// - MCP tools default to network "mainnet" when `network` is omitted, even though tools/list marks it required.
// - REST /v1/check-badge/<account> defaults to mainnet; a badge id resolves its own network.
// - The indexer defaults to "devnet" unless ?network= is given.
// So every call here takes a network id and sends it, and every builder result is checked against it.
import { INDEXER_BASE, MCP_URL, REST_BASE, network } from './networks.js';

const UA = 'bearproof-concordium/0.1 (+https://github.com/0smanturgut/bearproof-concordium)';

export class RegistryError extends Error {
    constructor(message, { status = null, body = null } = {}) {
        super(message);
        this.name = 'RegistryError';
        this.status = status;
        this.body = body;
    }
}

function headers(extra = {}) {
    // Browsers refuse to set User-Agent; Node and Workers send it.
    return typeof window === 'undefined' ? { 'user-agent': UA, ...extra } : extra;
}

async function readJson(res, what) {
    const text = await res.text();
    let body;
    try {
        body = JSON.parse(text);
    } catch {
        // Streamable-HTTP MCP servers may answer as an SSE stream: take the last data: line.
        const data = text
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .pop();
        if (!data) throw new RegistryError(`${what}: response is not JSON (HTTP ${res.status})`, { status: res.status, body: text });
        body = JSON.parse(data.slice(5));
    }
    return body;
}

// ---------- MCP (JSON-RPC 2.0 over HTTPS) ----------

export function mcpClient({ url = MCP_URL, fetchImpl = fetch } = {}) {
    let id = 0;
    async function rpc(method, params) {
        const res = await fetchImpl(url, {
            method: 'POST',
            headers: headers({ 'content-type': 'application/json', accept: 'application/json, text/event-stream' }),
            body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
        });
        const body = await readJson(res, `MCP ${method}`);
        if (body.error) throw new RegistryError(`MCP ${method}: ${body.error.message || JSON.stringify(body.error)}`, { status: res.status, body });
        return body.result;
    }
    async function callTool(name, args) {
        const result = await rpc('tools/call', { name, arguments: args });
        const text = (result?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
        if (result?.isError) throw new RegistryError(`MCP ${name}: ${text}`, { body: result });
        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    }
    return {
        listTools: async () => (await rpc('tools/list', {})).tools,
        callTool,
        // Network-scoped helpers: they always send `network` and check what comes back.
        async contractInfo(networkId) {
            return expectNetwork(await callTool('contract_info', { network: networkId }), networkId);
        },
        async networkStatus(networkId) {
            return expectNetwork(await callTool('network_status', { network: networkId }), networkId);
        },
        async buildRegister(networkId, { sender, agentUri, metadataHashHex }) {
            const out = await callTool('build_register', {
                network: networkId,
                sender,
                agent_uri: agentUri,
                metadata_hash_hex: metadataHashHex,
            });
            return expectContract(out, networkId, 'cis8004', 'CIS-8004.register');
        },
        async buildSetAgentUri(networkId, { tokenId, sender, agentUri = null, metadataHashHex = null }) {
            const out = await callTool('build_set_agent_uri', {
                network: networkId,
                token_id: String(tokenId),
                sender,
                agent_uri: agentUri,
                metadata_hash_hex: metadataHashHex,
            });
            return expectContract(out, networkId, 'cis8004', 'CIS-8004.setAgentURI');
        },
        async buildCis8CanonicalBytes(networkId, { account, namespace, keyType, publicKeyHex, proofScheme }) {
            const out = await callTool('build_cis8_canonical_bytes', {
                network: networkId,
                concordium_account: account,
                external_namespace: namespace,
                external_key_namespace: namespace,
                external_key_type: keyType,
                external_public_key_hex: publicKeyHex,
                proof_scheme: proofScheme,
            });
            return expectNetwork(out, networkId);
        },
        async buildCis8Register(networkId, { sender, namespace, keyType, publicKeyHex, proofScheme, signatureHex }) {
            const out = await callTool('build_cis8_register', {
                network: networkId,
                sender,
                external_key: { namespace, key_type: keyType, public_key_hex: publicKeyHex },
                proof: { scheme: proofScheme, signature_hex: signatureHex },
                metadata: [],
            });
            return expectContract(out, networkId, 'cis8', null);
        },
        async buildSetExternalReference(networkId, { tokenId, sender, namespace, keyType, publicKeyHex }) {
            const net = network(networkId);
            const out = await callTool('build_set_external_reference', {
                network: networkId,
                token_id: String(tokenId),
                sender,
                external_reference: {
                    contract_address: { index: net.cis8.index, subindex: net.cis8.subindex },
                    kind: 'Cis8',
                    key: { namespace, key_type: keyType, public_key_hex: publicKeyHex },
                },
            });
            return expectContract(out, networkId, 'cis8004', 'CIS-8004.setExternalReference');
        },
        async ownerOfKey(networkId, { namespace, keyType, publicKeyHex }) {
            return callTool('owner_of_key', {
                network: networkId,
                external_key: { namespace, key_type: keyType, public_key_hex: publicKeyHex },
            });
        },
        async agentOf(networkId, tokenId) {
            return callTool('agent_of', { network: networkId, token_id: String(tokenId) });
        },
        async checkBadge(networkId, id) {
            return expectNetwork(await callTool('check_badge', { network: networkId, id }), networkId);
        },
    };
}

function expectNetwork(out, networkId) {
    if (out && typeof out === 'object' && out.network !== undefined && out.network !== networkId)
        throw new RegistryError(`service answered for network "${out.network}", expected "${networkId}"`, { body: out });
    return out;
}

function expectContract(out, networkId, which, receiveName) {
    expectNetwork(out, networkId);
    const want = network(networkId)[which];
    const got = out?.contract_address;
    if (!got || got.index !== want.index || got.subindex !== want.subindex)
        throw new RegistryError(`payload targets contract ${JSON.stringify(got)}, expected <${want.index},${want.subindex}>`, { body: out });
    if (receiveName && out.receive_name !== receiveName)
        throw new RegistryError(`payload calls ${out.receive_name}, expected ${receiveName}`, { body: out });
    return out;
}

// ---------- REST twins (GET, keyed on the badge) ----------

export function restClient({ base = REST_BASE, fetchImpl = fetch } = {}) {
    async function get(path, query = {}) {
        const u = new URL(path, base);
        for (const [k, v] of Object.entries(query)) if (v !== null && v !== undefined) u.searchParams.set(k, String(v));
        const res = await fetchImpl(u, { headers: headers({ accept: 'application/json' }) });
        const body = await readJson(res, `GET ${u.pathname}`);
        if (!res.ok) throw new RegistryError(`GET ${u.pathname}: HTTP ${res.status} ${body?.error || ''} ${body?.message || ''}`.trim(), { status: res.status, body });
        return body;
    }
    return {
        healthz: () => get('/healthz'),
        // id: a badge (one verdict) or an account (every badge it owns). Network is always sent.
        checkBadge: async (networkId, id) => expectNetwork(await get(`/v1/check-badge/${encodeURIComponent(id)}`, { network: networkId }), networkId),
        getBadgeJson: async (networkId, badge) => expectNetwork(await get(`/v1/get-badge-JSON/${encodeURIComponent(badge)}`, { network: networkId }), networkId),
        verifyAgentCard: async (networkId, badge, { fetchCard = true } = {}) =>
            expectNetwork(await get(`/v1/verify-agent-card/${encodeURIComponent(badge)}`, { network: networkId, fetch: fetchCard }), networkId),
        buildSetAgentUri: async (networkId, badge, { metadataHashHex = null, agentUri = null, sender = null } = {}) =>
            expectContract(
                await get(`/v1/build-set-agent-uri/${encodeURIComponent(badge)}`, {
                    network: networkId,
                    metadata_hash_hex: metadataHashHex,
                    agent_uri: agentUri,
                    sender,
                }),
                networkId,
                'cis8004',
                'CIS-8004.setAgentURI'
            ),
    };
}

// ---------- Indexer (discovery, history) ----------

export function indexerClient({ base = INDEXER_BASE, fetchImpl = fetch } = {}) {
    async function get(path, query = {}) {
        const u = new URL(path, base);
        for (const [k, v] of Object.entries(query)) if (v !== null && v !== undefined) u.searchParams.set(k, String(v));
        const res = await fetchImpl(u, { headers: headers({ accept: 'application/json' }) });
        const body = await readJson(res, `GET ${u.pathname}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new RegistryError(`GET ${u.pathname}: HTTP ${res.status}`, { status: res.status, body });
        return body;
    }
    return {
        status: () => get('/status'),
        agent: async (networkId, tokenId) => {
            network(networkId);
            const body = await get(`/agents/${encodeURIComponent(tokenId)}`, { network: networkId });
            return body && expectNetwork(body, networkId);
        },
        history: async (networkId, tokenId) => {
            network(networkId);
            const body = await get(`/agents/${encodeURIComponent(tokenId)}/history`, { network: networkId });
            return body && expectNetwork(body, networkId);
        },
        agentsByOwner: async (networkId, owner, { limit = 100 } = {}) => {
            network(networkId);
            return expectNetwork(await get('/agents', { network: networkId, owner, limit }), networkId);
        },
    };
}
