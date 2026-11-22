// Agent Cards: validation against the documented schema, the exact bytes we host, and the hash the
// registry anchors.
// Spec: https://docs.concordium.com/en/mainnet/technical-reference/agent-registry/agent-card.html
// A card is one JSON document that is both an ERC-8004 registration file and an A2A v1.0 Agent Card,
// with the Verified by Concordium badge as an A2A extension under capabilities.extensions.
//
// Hash rule (the one the registry checks): SHA-256 of the raw bytes served at agent_uri. Not canonical
// JSON, not a re-serialisation: the bytes. So we host files byte-for-byte and keep them in one fixed
// layout (2-space JSON plus one trailing newline) that anyone can reproduce from the parsed JSON.
import { BADGE_EXTENSION_URI, composeBadgeExtension, decodeTokenAddress, registrationsEntry, verifyUrlFor } from './badge.js';
import { isAccountAddress } from './base58.js';
import { sha256Hex, utf8 } from './bytes.js';
import { NETWORKS, caip10Contract, caip2, network } from './networks.js';

export const CARD_TYPE = 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1';

const KNOWN_FIELDS = [
    'type',
    'name',
    'description',
    'image',
    'version',
    'provider',
    'supportedInterfaces',
    'capabilities',
    'defaultInputModes',
    'defaultOutputModes',
    'skills',
    'documentationUrl',
    'services',
    'x402Support',
    'active',
    'registrations',
];

// The one layout our hosted card files use.
export function cardText(card) {
    return JSON.stringify(card, null, 2) + '\n';
}

export function cardBytes(card) {
    return utf8(cardText(card));
}

// SHA-256 (hex) of exactly these bytes: what build_register / setAgentURI must pin.
export async function cardHash(bytes) {
    return sha256Hex(bytes);
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v, min = 1) => typeof v === 'string' && v.length >= min;
const isHttps = (v) => {
    try {
        return new URL(v).protocol === 'https:';
    } catch {
        return false;
    }
};
const MEDIA_TYPE = /^[a-z]+\/[a-z0-9.+-]+$/i;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const CAIP10_CONTRACT = /^ccd:[0-9a-f]{32}:\d+\.\d+$/;

// Validate a parsed card. Returns { ok, errors, warnings, networkId, badge }.
// options.networkId: the network the badge must point at (default: inferred from the badge, else none).
// options.requireBadge: fail when the card has no badge extension (published cards need one).
export async function validateCard(card, options = {}) {
    const errors = [];
    const warnings = [];
    const err = (path, msg) => errors.push(`${path}: ${msg}`);
    const warn = (path, msg) => warnings.push(`${path}: ${msg}`);

    if (!isObj(card)) return { ok: false, errors: ['$: a card must be a JSON object'], warnings, badge: null };

    for (const key of Object.keys(card)) {
        if (key === 'concordium') err('concordium', 'legacy top-level badge block; the badge belongs in capabilities.extensions');
        else if (!KNOWN_FIELDS.includes(key)) warn(key, 'not a documented Agent Card field');
    }

    if (card.type !== CARD_TYPE) err('type', `must be "${CARD_TYPE}"`);
    if (!isStr(card.name) || card.name.length > 128) err('name', 'required, 1 to 128 characters');
    if (!isStr(card.description) || card.description.length > 2048) err('description', 'required, 1 to 2048 characters');
    if (!isStr(card.version) || !SEMVER.test(card.version)) err('version', 'required, a semantic version such as 1.0.0');
    if (card.image === undefined) warn('image', 'missing (ERC-721 tools render it)');
    else if (!isHttps(card.image)) err('image', 'must be an https URL');

    if (card.provider !== undefined) {
        if (!isObj(card.provider) || !isStr(card.provider.organization)) err('provider', 'needs organization (string)');
        else if (card.provider.url !== undefined && !isHttps(card.provider.url)) err('provider.url', 'must be an https URL');
    }
    if (card.documentationUrl !== undefined && !isHttps(card.documentationUrl)) err('documentationUrl', 'must be an https URL');

    if (!Array.isArray(card.supportedInterfaces)) err('supportedInterfaces', 'required array (may be empty)');
    else
        card.supportedInterfaces.forEach((s, i) => {
            if (!isObj(s) || !isHttps(s.url) || !isStr(s.protocolBinding) || !isStr(s.protocolVersion))
                err(`supportedInterfaces[${i}]`, 'needs url (https), protocolBinding and protocolVersion');
        });

    for (const field of ['defaultInputModes', 'defaultOutputModes']) {
        const v = card[field];
        if (!Array.isArray(v) || v.length === 0 || !v.every((m) => typeof m === 'string' && MEDIA_TYPE.test(m)))
            err(field, 'required, a non-empty array of media types');
    }

    if (!Array.isArray(card.skills)) err('skills', 'required array');
    else {
        const ids = new Set();
        card.skills.forEach((s, i) => {
            const p = `skills[${i}]`;
            if (!isObj(s)) return err(p, 'must be an object');
            if (!isStr(s.id)) err(`${p}.id`, 'required');
            else if (ids.has(s.id)) err(`${p}.id`, `duplicate id "${s.id}"`);
            else ids.add(s.id);
            if (!isStr(s.name)) err(`${p}.name`, 'required');
            if (typeof s.description !== 'string') err(`${p}.description`, 'required string');
            if (!Array.isArray(s.tags) || !s.tags.every((t) => isStr(t))) err(`${p}.tags`, 'required array of strings');
        });
    }

    if (!Array.isArray(card.services)) err('services', 'required array (may be empty)');
    else
        card.services.forEach((s, i) => {
            const p = `services[${i}]`;
            if (!isObj(s) || !isStr(s.name) || !isStr(s.endpoint)) return err(p, 'needs name and endpoint');
            if (s.endpoint.startsWith('http') && !isHttps(s.endpoint)) err(`${p}.endpoint`, 'must be https');
            if (s.version !== undefined && !isStr(s.version)) err(`${p}.version`, 'must be a string');
        });

    if (typeof card.x402Support !== 'boolean') err('x402Support', 'required boolean');
    if (typeof card.active !== 'boolean') err('active', 'required boolean');

    if (!Array.isArray(card.registrations)) err('registrations', 'required array (empty before the agent is registered)');
    else
        card.registrations.forEach((r, i) => {
            if (!isObj(r) || !Number.isSafeInteger(r.agentId) || r.agentId < 0 || !CAIP10_CONTRACT.test(String(r.agentRegistry)))
                err(`registrations[${i}]`, 'needs agentId (integer) and agentRegistry (CAIP-10 contract)');
        });

    let badge = null;
    let networkId = options.networkId || null;
    const caps = card.capabilities;
    if (!isObj(caps)) err('capabilities', 'required object');
    else {
        if (typeof caps.streaming !== 'boolean') err('capabilities.streaming', 'required boolean');
        if (typeof caps.pushNotifications !== 'boolean') err('capabilities.pushNotifications', 'required boolean');
        if (!Array.isArray(caps.extensions)) err('capabilities.extensions', 'required array');
        else {
            caps.extensions.forEach((x, i) => {
                if (!isObj(x) || !isStr(x.uri) || typeof x.required !== 'boolean')
                    err(`capabilities.extensions[${i}]`, 'needs uri and required (boolean)');
            });
            const badges = caps.extensions.filter((x) => isObj(x) && x.uri === BADGE_EXTENSION_URI);
            if (badges.length > 1) err('capabilities.extensions', 'more than one Concordium badge extension');
            if (badges.length === 1) {
                const out = await checkBadgeExtension(badges[0], card, networkId);
                errors.push(...out.errors.map((e) => `capabilities.extensions[badge].${e}`));
                warnings.push(...out.warnings.map((e) => `capabilities.extensions[badge].${e}`));
                badge = out.badge;
                networkId = networkId || out.networkId;
            } else if (options.requireBadge) err('capabilities.extensions', 'no Concordium badge extension');
        }
    }

    return { ok: errors.length === 0, errors, warnings, networkId, badge };
}

async function checkBadgeExtension(ext, card, wantNetwork) {
    const errors = [];
    const warnings = [];
    const p = ext.params;
    if (ext.required !== false) errors.push('required: must be false');
    if (!isObj(p)) return { errors: [...errors, 'params: required object'], warnings, badge: null, networkId: null };

    // Which network does the badge point at? Every CAIP id in it must agree.
    const ownerMatch = /^ccd:([0-9a-f]{32}):(\w+)$/.exec(p.owner?.account || '');
    if (!ownerMatch) errors.push('params.owner.account: must be a CAIP-10 Concordium account');
    const chain = ownerMatch ? ownerMatch[1] : null;
    const found = Object.values(NETWORKS).find((n) => n.genesisHash.startsWith(chain || '-'));
    const networkId = found ? found.id : null;
    if (ownerMatch && !found) errors.push('params.owner.account: unknown Concordium chain');
    if (wantNetwork && networkId && wantNetwork !== networkId) errors.push(`params: badge is on ${networkId}, expected ${wantNetwork}`);
    if (!networkId) return { errors, warnings, badge: null, networkId };

    const owner = ownerMatch[2];
    if (!(await isAccountAddress(owner))) errors.push('params.owner.account: not a valid account address');
    const net = network(networkId);
    if (p.agentWallet !== undefined && !new RegExp(`^${caip2(networkId)}:\\w+$`).test(String(p.agentWallet)))
        errors.push('params.agentWallet: must be a CAIP-10 account on the same chain');
    if (p.contracts?.cis8004 !== caip10Contract(networkId, net.cis8004)) errors.push(`params.contracts.cis8004: must be ${caip10Contract(networkId, net.cis8004)}`);
    if (p.contracts?.cis8 !== caip10Contract(networkId, net.cis8)) errors.push(`params.contracts.cis8: must be ${caip10Contract(networkId, net.cis8)}`);
    if (!isStr(p.verify)) errors.push('params.verify: required string');

    let short = null;
    let tokenId = null;
    if (p.tokenAddress !== null) {
        const m = new RegExp(`^${caip2(networkId)}/cis-2:(\\w+)$`).exec(String(p.tokenAddress));
        if (!m) errors.push('params.tokenAddress: must be CAIP-19 on the same chain, or null before mint');
        else {
            try {
                const decoded = await decodeTokenAddress(m[1]);
                if (decoded.contract.index !== net.cis8004.index || decoded.contract.subindex !== net.cis8004.subindex)
                    errors.push('params.tokenAddress: not a token of the CIS-8004 registry');
                short = m[1];
                tokenId = decoded.tokenId;
            } catch (e) {
                errors.push(`params.tokenAddress: ${e.message}`);
            }
        }
    }

    const v = p.verification;
    if (!isObj(v) || !isStr(v.service) || !isHttps(v.verifyUrl) || !isHttps(v.mcp) || !isHttps(v.docs))
        errors.push('params.verification: needs service, verifyUrl, mcp and docs');
    else if (v.verifyUrl !== verifyUrlFor(short || owner))
        errors.push(`params.verification.verifyUrl: must be ${verifyUrlFor(short || owner)}`);

    if (tokenId !== null) {
        const want = registrationsEntry(networkId, tokenId);
        const has = (card.registrations || []).some((r) => r && r.agentId === want.agentId && r.agentRegistry === want.agentRegistry);
        if (!has) warnings.push(`registrations: no entry { agentId: ${tokenId}, agentRegistry: ${want.agentRegistry} }`);
    } else warnings.push('params.tokenAddress: null (pre-mint card; re-anchor after register)');

    return { errors, warnings, networkId, badge: { short, tokenId, owner } };
}

// Validate a file's bytes: UTF-8 JSON in our fixed layout, then the schema.
export async function validateCardFile(bytes, options = {}) {
    let text;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        return { ok: false, errors: ['$: not UTF-8'], warnings: [], badge: null };
    }
    let card;
    try {
        card = JSON.parse(text);
    } catch (e) {
        return { ok: false, errors: [`$: not JSON (${e.message})`], warnings: [], badge: null };
    }
    const result = await validateCard(card, options);
    if (text !== cardText(card)) result.errors.unshift('$: not in the card layout (2-space JSON, one trailing newline)');
    result.ok = result.errors.length === 0;
    result.card = card;
    result.sha256 = await cardHash(bytes);
    result.byteLength = bytes.length;
    return result;
}

// Build the card we host: the source card plus the badge extension (and, once minted, the ERC-8004
// registrations entry). Pass `extension` to paste the service's block verbatim (after mint, from
// /v1/get-badge-JSON); otherwise the block is composed locally (the pre-mint form).
export async function composePublishedCard(source, { networkId, ownerAccount, tokenId = null, extension = null, agentWallet = null }) {
    const card = structuredClone(source);
    delete card.concordium;
    const block = extension || (await composeBadgeExtension({ networkId, ownerAccount, tokenId, agentWallet }));
    card.capabilities = card.capabilities || { streaming: false, pushNotifications: false, extensions: [] };
    const others = (card.capabilities.extensions || []).filter((x) => x?.uri !== BADGE_EXTENSION_URI);
    card.capabilities.extensions = [...others, block];
    if (tokenId !== null && tokenId !== undefined) {
        const entry = registrationsEntry(networkId, tokenId);
        const kept = (card.registrations || []).filter((r) => r?.agentRegistry !== entry.agentRegistry);
        card.registrations = [...kept, entry];
    }
    return card;
}
