// Live, read-only checks against the hosted Concordium testnet services. Skipped unless LIVE=1, so CI
// stays offline. Nothing here signs or submits: builders only return unsigned bytes.
//   LIVE=1 node --test test/live.test.mjs      (or: npm run test:live)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { composeBadgeExtension } from '../src/badge.js';
import { base58Decode } from '../src/base58.js';
import { sha256Hex, toHex } from '../src/bytes.js';
import { SOLANA_MAINNET, solanaCis8Message } from '../src/cis8.js';
import { indexerClient, mcpClient, restClient } from '../src/clients.js';
import { INDEXER_BASE, NETWORKS } from '../src/networks.js';
import { encodeRegister } from '../src/params.js';

const skip = process.env.LIVE === '1' ? false : 'set LIVE=1 to run live read-only checks';
const mcp = mcpClient();
const rest = restClient();
const indexer = indexerClient();
const ADMIN = '3whdieGHx43KKRwQYbC5pAUdmWZ61B7yreNRU9i36MtdCvajR8'; // public testnet account used as a stand-in sender
const KNOWN_BADGE = 'JyP9VyutM5xqvktMPE7Zf'; // a third-party testnet agent that passed check-badge on 22 Nov 2026

test('testnet contracts are <12802,0> (CIS-8004) and <12801,0> (CIS-8)', { skip }, async () => {
    const info = await mcp.contractInfo('testnet');
    assert.deepEqual(info.cis8004_contract, { index: 12802, subindex: 0 });
    assert.deepEqual(info.cis8_contract, { index: 12801, subindex: 0 });
    assert.equal(info.cis8004_module_ref, NETWORKS.testnet.cis8004ModuleRef);
    const status = await mcp.networkStatus('testnet');
    assert.ok(status.latest_block_height > 51_000_000);
});

test('trap: an MCP call without `network` answers for mainnet', { skip }, async () => {
    const info = await mcp.callTool('contract_info', {});
    assert.equal(info.network, 'mainnet');
    assert.equal(info.cis8004_contract.index, 10082);
});

test('trap: the indexer answers for devnet unless ?network= is given', { skip }, async () => {
    const res = await fetch(`${INDEXER_BASE}/agents?limit=1`);
    assert.equal((await res.json()).network, 'devnet');
    const testnet = await indexer.agentsByOwner('testnet', '4feUwnLc2VwcUi3ra7itkiEA6jQ9BPmCcLBZ5UF1mERii7LFBD');
    assert.equal(testnet.network, 'testnet');
});

test('check-badge and get-badge-JSON on a known good testnet badge', { skip }, async () => {
    const v = await rest.checkBadge('testnet', KNOWN_BADGE);
    assert.equal(v.badge_valid, true);
    assert.equal(v.expected.chain, 'ccd:4221332d34e1694168c2a0c0b3fd0f27');
    const b = await rest.getBadgeJson('testnet', KNOWN_BADGE);
    assert.deepEqual(await composeBadgeExtension({ networkId: 'testnet', ownerAccount: b.owner_account, tokenId: b.token_id, agentWallet: b.agent_wallet }), b.extension);
    const card = await rest.verifyAgentCard('testnet', KNOWN_BADGE);
    assert.equal(card.match, true);
    assert.equal(card.fetched.sha256_hex, card.on_chain_hash_hex);
    const agent = await indexer.agent('testnet', 1391);
    assert.equal(agent.agent.metadata_hash_hex, card.on_chain_hash_hex);
});

test('build_register returns the bytes we encode locally', { skip }, async () => {
    const agentUri = 'https://example.com/card.json';
    const metadataHashHex = await sha256Hex('probe');
    const out = await mcp.buildRegister('testnet', { sender: ADMIN, agentUri, metadataHashHex });
    assert.equal(out.parameter_hex, encodeRegister({ agentUri, metadataHashHex }));
});

test('build_cis8_canonical_bytes returns the message we build locally', { skip }, async () => {
    const pk = base58Decode('GD9HPVpLqDxYfgf9ZNQDN3WwCfZips7tVCHAhMcchRo5');
    const out = await mcp.buildCis8CanonicalBytes('testnet', {
        account: ADMIN,
        namespace: SOLANA_MAINNET,
        keyType: 'ed25519',
        publicKeyHex: toHex(pk),
        proofScheme: 'solana-ed25519',
    });
    assert.equal(out.bytes_hex, toHex(await solanaCis8Message({ networkId: 'testnet', concordiumAccount: ADMIN, solanaPublicKey: pk })));
});

test('every URL in the two cards resolves', { skip }, async (t) => {
    for (const file of ['agent-card/build-agent.json', 'agent-card/replay-verifier.json']) {
        const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
        for (const url of new Set(text.match(/https:\/\/[^"\s)]+/g))) {
            if (url.startsWith('https://eips.ethereum.org/')) continue; // the type identifier, not a link to fetch
            const res = await fetch(url, { method: 'GET', redirect: 'follow' });
            if (res.status === 404 && url.includes('/bearproof-concordium/blob/main/')) {
                const local = url.split('/blob/main/')[1];
                if (existsSync(new URL(`../${local}`, import.meta.url))) {
                    t.diagnostic(`${local} is not on GitHub yet (push it): ${url}`);
                    continue;
                }
            }
            assert.equal(res.status, 200, `${url} answered ${res.status}`);
        }
    }
});
