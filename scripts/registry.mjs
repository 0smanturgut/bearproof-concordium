#!/usr/bin/env node
// Concordium Agent Registry, testnet: read state and BUILD unsigned transactions for the operator to sign
// in Concordium Wallet for Web. This script never signs, never submits and never holds a key.
//
// Reads
//   node scripts/registry.mjs status                          contracts, node height, indexer sync (testnet)
//   node scripts/registry.mjs check-badge <badge|account>     the badge verdict; exit 0 only when fully valid
//   node scripts/registry.mjs badge-json <badge>              the badge block to paste into a card
//   node scripts/registry.mjs agent <badge|token-id>          the agent's record and event history (indexer)
//   node scripts/registry.mjs owner <account>                 every agent an account owns (indexer)
// Builders (unsigned; print a signing sheet and save the parameter to out/)
//   node scripts/registry.mjs build-register --release cards-v1 --agent build-agent --sender <account>
//   node scripts/registry.mjs build-set-uri  --release cards-v2 --agent build-agent --sender <account>
//   node scripts/registry.mjs cis8-message   --account <account> --solana <address>
//   node scripts/registry.mjs build-cis8-register --account <account> --solana <address> --signature <hex>
//   node scripts/registry.mjs build-set-external-reference --badge <badge> --sender <account> --solana <address>
import { createPublicKey, verify as edVerify } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeTokenAddress, encodeTokenAddress } from '../src/badge.js';
import { base58Decode, isAccountAddress } from '../src/base58.js';
import { fromHex, toHex } from '../src/bytes.js';
import { cardHash, validateCardFile } from '../src/card.js';
import { SOLANA_MAINNET, solanaCis8Message } from '../src/cis8.js';
import { indexerClient, mcpClient, restClient } from '../src/clients.js';
import { network } from '../src/networks.js';
import { encodeRegister, encodeSetAgentUri } from '../src/params.js';
import { NETWORK_ID, ROOT, agentName, fail, need, parseArgs, printJson, publishedPath, publishedUrl, readRepoFile, releaseName } from './lib/cli.js';

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
const net = network(NETWORK_ID);
const mcp = mcpClient();
const rest = restClient();
const indexer = indexerClient();
const SCTOOLS = 'https://sctools.mainnet.concordium.software/';

async function account(value, flag) {
    if (!(await isAccountAddress(value))) fail(`--${flag} is not a Concordium account address: ${value}`);
    return value;
}

function solanaKey(address) {
    const pk = base58Decode(address);
    if (pk.length !== 32) fail(`--solana is not a Solana address (32-byte ed25519 key): ${address}`);
    return pk;
}

async function badgeOrToken(value) {
    if (/^\d+$/.test(value)) return { tokenId: Number(value), badge: await encodeTokenAddress(net.cis8004, Number(value)) };
    const d = await decodeTokenAddress(value);
    if (d.contract.index !== net.cis8004.index || d.contract.subindex !== net.cis8004.subindex)
        fail(`${value} is not a token of the testnet CIS-8004 registry <${net.cis8004.index},${net.cis8004.subindex}>`);
    return { tokenId: d.tokenId, badge: value };
}

// The hosted card must serve exactly the released file before its hash is anchored.
async function releasedCard(release, agent) {
    const file = publishedPath(release, agent);
    const bytes = readRepoFile(file);
    const check = await validateCardFile(bytes, { networkId: NETWORK_ID, requireBadge: true });
    if (!check.ok) fail(`${file} is not a valid card:\n  ${check.errors.join('\n  ')}`);
    const url = publishedUrl(release, agent);
    const res = await fetch(url, { cache: 'no-store' });
    const served = new Uint8Array(await res.arrayBuffer());
    if (!res.ok) fail(`${url} answers HTTP ${res.status}; push the ${release} tag first`);
    const hash = await cardHash(bytes);
    if ((await cardHash(served)) !== hash) fail(`${url} does not serve the bytes of ${file}`);
    return { file, url, hash, check };
}

function signingSheet({ title, contract, contractName, entrypoint, payload, sender, extra = [] }) {
    const paramJson = JSON.stringify(payload.parameter_json);
    mkdirSync(join(ROOT, 'out'), { recursive: true });
    const saved = `out/${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.parameter.json`;
    writeFileSync(join(ROOT, saved), paramJson + '\n');
    const lines = [
        '',
        `=== ${title} (testnet, unsigned) ===`,
        `Sign in Concordium Wallet for Web, account ${sender}, through ${SCTOOLS}`,
        '  Choose your network: testnet -> Connect To Browser Wallet -> section "Update Smart Contract Instance":',
        `  Smart Contract Index:  ${contract.index}   (subindex ${contract.subindex})`,
        `  Smart Contract Name:   ${contractName}`,
        `  Entry Point Name:      ${entrypoint}`,
        `  Max Execution Energy:  ${payload.suggested_energy || 30000}`,
        '  [x] Derive From Smart Contract Index   [ ] Is Payable   [x] Has Input Parameter',
        '  Select input parameter type: object',
        `  Input parameter: the one line in ${saved}`,
        `  Parameter bytes the wallet should end up signing (hex): ${payload.parameter_hex}`,
        ...extra,
        '',
    ];
    console.log(lines.join('\n'));
}

async function buildRegister() {
    const release = releaseName(args);
    const agent = agentName(args);
    const sender = await account(need(args, 'sender', 'the testnet account that will own this agent'), 'sender');
    const card = await releasedCard(release, agent);
    if (card.check.badge?.owner !== sender) fail(`the card's badge names owner ${card.check.badge?.owner}, but --sender is ${sender}`);
    const out = await mcp.buildRegister(NETWORK_ID, { sender, agentUri: card.url, metadataHashHex: card.hash });
    const local = encodeRegister({ agentUri: card.url, metadataHashHex: card.hash });
    if (out.parameter_hex !== local) fail(`service parameter ${out.parameter_hex} differs from the local encoding ${local}; not signing this`);
    signingSheet({
        title: `register ${agent}`,
        contract: net.cis8004,
        contractName: 'CIS-8004',
        entrypoint: 'register',
        payload: out,
        sender,
        extra: [`  agent_uri:     ${card.url}`, `  metadata_hash: ${card.hash}`, '  After it finalizes: node scripts/registry.mjs owner ' + sender],
    });
}

async function buildSetUri() {
    const release = releaseName(args);
    const agent = agentName(args);
    const sender = await account(need(args, 'sender', 'the account that owns the agent'), 'sender');
    const card = await releasedCard(release, agent);
    const { tokenId, short } = card.check.badge || {};
    if (tokenId === null || tokenId === undefined) fail(`${card.file} is a pre-mint card; set-uri needs the card with the token id (compose --token-id)`);
    const onChain = await rest.verifyAgentCard(NETWORK_ID, short, { fetchCard: false });
    const owner = (await mcp.agentOf(NETWORK_ID, tokenId))?.owner_account;
    if (owner !== sender) fail(`agent ${short} is owned by ${owner}, not ${sender}`);
    // Zero-gap variant from the badge docs: new versioned URL and its hash in one transaction.
    const out = await rest.buildSetAgentUri(NETWORK_ID, short, { metadataHashHex: card.hash, agentUri: card.url, sender });
    const local = encodeSetAgentUri({ tokenId, agentUri: card.url, metadataHashHex: card.hash });
    if (out.parameter_hex !== local) fail(`service parameter ${out.parameter_hex} differs from the local encoding ${local}; not signing this`);
    signingSheet({
        title: `setAgentURI ${agent}`,
        contract: net.cis8004,
        contractName: 'CIS-8004',
        entrypoint: 'setAgentURI',
        payload: out,
        sender,
        extra: [
            `  badge:         ${short} (token ${tokenId})`,
            `  now on chain:  ${onChain.on_chain_uri}  ${onChain.on_chain_hash_hex}`,
            `  new agent_uri: ${card.url}`,
            `  new hash:      ${card.hash}`,
            `  After it finalizes: node scripts/registry.mjs check-badge ${short}`,
        ],
    });
}

async function cis8Message() {
    const acct = await account(need(args, 'account', 'the testnet account that will send the CIS-8 transaction'), 'account');
    const pk = solanaKey(need(args, 'solana', 'the Solana address to bind'));
    const local = toHex(await solanaCis8Message({ networkId: NETWORK_ID, concordiumAccount: acct, solanaPublicKey: pk }));
    const out = await mcp.buildCis8CanonicalBytes(NETWORK_ID, {
        account: acct,
        namespace: SOLANA_MAINNET,
        keyType: 'ed25519',
        publicKeyHex: toHex(pk),
        proofScheme: 'solana-ed25519',
    });
    if (out.bytes_hex !== local) fail('the service and the local encoder disagree on the CIS-8 message; stop');
    console.log(`CIS-8 canonical message (${out.byte_length} bytes), identical from the service and the local encoder:`);
    console.log(local);
    console.log('The Solana key signs these bytes directly (Ed25519, scheme solana-ed25519). Sign offline with:');
    console.log(`  node scripts/cis8-sign-solana.mjs --account ${acct} --solana ${need(args, 'solana')} --keyfile <path>`);
}

async function buildCis8Register() {
    const acct = await account(need(args, 'account', 'the account that will send this transaction'), 'account');
    const address = need(args, 'solana', 'the Solana address');
    const pk = solanaKey(address);
    const sigHex = need(args, 'signature', '128 hex characters from cis8-sign-solana.mjs');
    const sig = fromHex(sigHex);
    if (sig.length !== 64) fail('the signature must be 64 bytes');
    const message = await solanaCis8Message({ networkId: NETWORK_ID, concordiumAccount: acct, solanaPublicKey: pk });
    const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(pk)]);
    const okSig = edVerify(null, message, createPublicKey({ key: spki, format: 'der', type: 'spki' }), sig);
    if (!okSig) fail(`the signature does not verify for ${address} over the CIS-8 message for ${acct}`);
    const existing = await mcp.ownerOfKey(NETWORK_ID, { namespace: SOLANA_MAINNET, keyType: 'ed25519', publicKeyHex: toHex(pk) });
    if (existing) console.log(`note: this key is already bound to ${existing.owner || JSON.stringify(existing)}; registering again displaces it`);
    const out = await mcp.buildCis8Register(NETWORK_ID, {
        sender: acct,
        namespace: SOLANA_MAINNET,
        keyType: 'ed25519',
        publicKeyHex: toHex(pk),
        proofScheme: 'solana-ed25519',
        signatureHex: toHex(sig),
    });
    if (out.receive_name !== 'CIS-8.registerExternalKey') fail(`unexpected entrypoint ${out.receive_name}`);
    if (!out.parameter_hex.includes(toHex(pk)) || !out.parameter_hex.includes(toHex(sig))) fail('the payload does not carry this key and signature');
    signingSheet({
        title: 'CIS-8 registerExternalKey',
        contract: net.cis8,
        contractName: 'CIS-8',
        entrypoint: 'registerExternalKey',
        payload: out,
        sender: acct,
        extra: [`  binds Solana ${address} (namespace ${SOLANA_MAINNET}) to ${acct}; signature verified locally`],
    });
}

async function buildSetExternalReference() {
    const { tokenId, badge } = await badgeOrToken(need(args, 'badge'));
    const sender = await account(need(args, 'sender'), 'sender');
    const address = need(args, 'solana');
    const pk = solanaKey(address);
    const owner = (await mcp.agentOf(NETWORK_ID, tokenId))?.owner_account;
    if (owner !== sender) fail(`agent ${badge} is owned by ${owner}, not ${sender}`);
    const binding = await mcp.ownerOfKey(NETWORK_ID, { namespace: SOLANA_MAINNET, keyType: 'ed25519', publicKeyHex: toHex(pk) });
    if (!binding) fail(`${address} is not bound on CIS-8 yet; run build-cis8-register and sign it first`);
    const out = await mcp.buildSetExternalReference(NETWORK_ID, { tokenId, sender, namespace: SOLANA_MAINNET, keyType: 'ed25519', publicKeyHex: toHex(pk) });
    if (!out.parameter_hex.includes(toHex(pk))) fail('the payload does not carry this key');
    signingSheet({
        title: 'setExternalReference',
        contract: net.cis8004,
        contractName: 'CIS-8004',
        entrypoint: 'setExternalReference',
        payload: out,
        sender,
        extra: [`  agent ${badge} (token ${tokenId}) -> CIS-8 key ${address}`],
    });
}

async function checkBadge() {
    const id = args._[1] || fail('usage: registry.mjs check-badge <badge|account>');
    const v = await rest.checkBadge(NETWORK_ID, id);
    const verdicts = v.agents ? v.agents : [v];
    let good = verdicts.length > 0;
    for (const a of verdicts) {
        const pass = a.badge_valid === true && a.checks?.extension_conformant === true && a.checks?.verification_present === true && (a.issues || []).length === 0;
        good &&= pass;
        console.log(`${pass ? 'VALID  ' : 'INVALID'} ${a.token_address} (token ${a.token_id})  ${a.agent_uri || '-'}`);
        for (const [k, val] of Object.entries(a.checks || {})) console.log(`        ${k}: ${val}`);
        for (const i of a.issues || []) console.log(`        issue: ${i.severity} ${i.field}: ${i.message}`);
    }
    if (v.agents) console.log(`account ${v.account}: ${v.agent_count} agent(s), ${v.summary?.valid} valid, ${v.summary?.invalid} invalid`);
    if (!good) process.exit(1);
}

switch (cmd) {
    case 'status': {
        const [info, status, idx] = await Promise.all([mcp.contractInfo(NETWORK_ID), mcp.networkStatus(NETWORK_ID), indexer.status()]);
        if (info.cis8004_contract.index !== net.cis8004.index || info.cis8_contract.index !== net.cis8.index) fail('contract addresses differ from src/networks.js');
        printJson({ contracts: info, node: status, indexer: idx.networks?.[NETWORK_ID] });
        break;
    }
    case 'check-badge':
        await checkBadge();
        break;
    case 'badge-json':
        printJson(await rest.getBadgeJson(NETWORK_ID, args._[1] || fail('usage: registry.mjs badge-json <badge>')));
        break;
    case 'agent': {
        const { tokenId, badge } = await badgeOrToken(args._[1] || fail('usage: registry.mjs agent <badge|token-id>'));
        const [rec, hist] = await Promise.all([indexer.agent(NETWORK_ID, tokenId), indexer.history(NETWORK_ID, tokenId)]);
        if (!rec) fail(`no agent ${badge} (token ${tokenId}) on testnet`, 1);
        printJson({ badge, ...rec, history: (hist?.events || []).map((e) => ({ block: e.block_height, tx: e.tx_hash, event: e.event_name, at: e.timestamp })) });
        break;
    }
    case 'owner':
        printJson(await indexer.agentsByOwner(NETWORK_ID, await account(args._[1] || fail('usage: registry.mjs owner <account>'), 'account')));
        break;
    case 'build-register':
        await buildRegister();
        break;
    case 'build-set-uri':
        await buildSetUri();
        break;
    case 'cis8-message':
        await cis8Message();
        break;
    case 'build-cis8-register':
        await buildCis8Register();
        break;
    case 'build-set-external-reference':
        await buildSetExternalReference();
        break;
    default:
        fail('usage: see the header of scripts/registry.mjs');
}
