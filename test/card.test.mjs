// Offline: the two Agent Cards, the validator, the badge block and the hash rule.
// Recorded fixtures (22 Nov 2026, testnet): mcp-build-agent-card-premint.json is build_agent_card's answer
// for a probe card; rest-get-badge-json-1391.json is GET /v1/get-badge-JSON/JyP9VyutM5xqvktMPE7Zf;
// served-card-1391.json is the exact body served at that agent's agent_uri (badge_valid: true).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composeBadgeExtension } from '../src/badge.js';
import { sha256Hex } from '../src/bytes.js';
import { CARD_TYPE, cardBytes, cardHash, cardText, composePublishedCard, validateCard, validateCardFile } from '../src/card.js';

const bytesOf = (rel) => new Uint8Array(readFileSync(new URL(`../${rel}`, import.meta.url)));
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const OWNER = '3whdieGHx43KKRwQYbC5pAUdmWZ61B7yreNRU9i36MtdCvajR8'; // a public testnet account, stands in for the operator's
const CARDS = { 'build-agent': 'BEARPROOF Build Agent', 'replay-verifier': 'BEARPROOF Replay Verifier' };

// URLs the cards may point at: each exists today (the live test fetches them).
const KNOWN_URLS = new Set([
    'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    'https://raw.githubusercontent.com/0smanturgut/bearproof/v1.0-final/hq/assets/apple-touch-icon.png',
    'https://crowlab.ai',
    'https://bearproof.app/',
    'https://github.com/0smanturgut/bearproof',
    'https://github.com/0smanturgut/bearproof-concordium/blob/main/docs/agent-cards.md',
]);

for (const [file, name] of Object.entries(CARDS)) {
    test(`${file}.json is a valid card in the hosted layout`, async () => {
        const r = await validateCardFile(bytesOf(`agent-card/${file}.json`), { networkId: 'testnet' });
        assert.deepEqual(r.errors, []);
        assert.deepEqual(r.warnings, []);
        assert.equal(r.card.name, name);
        assert.equal(r.card.type, CARD_TYPE);
    });

    test(`${file}.json claims nothing that is not true today`, () => {
        const card = JSON.parse(new TextDecoder().decode(bytesOf(`agent-card/${file}.json`)));
        const text = JSON.stringify(card);
        // Not running since 31 Oct 2026, and nothing callable is published yet.
        assert.equal(card.active, false);
        assert.equal(card.x402Support, false);
        assert.deepEqual(card.supportedInterfaces, []);
        assert.deepEqual(card.registrations, []);
        assert.deepEqual(card.capabilities.extensions, [], 'the badge is added at publish time, not in the source card');
        for (const s of card.services) assert.ok(['web', 'source'].includes(s.name), `unexpected service ${s.name}`);
        for (const word of [/\blive\b/i, /nightly/i, /every (night|day)/i, /\bnow running\b/i, /own budget/i, /self-funded/i, /pays? (for )?its own/i, /partner/i])
            assert.doesNotMatch(text, word);
        assert.match(card.description, /not running now|not accepting runs now/);
        assert.match(card.description, /31 Oct 2026/);
        const urls = text.match(/https:\/\/[^"\s)]+/g) || [];
        for (const u of urls) assert.ok(KNOWN_URLS.has(u), `unknown URL in the card: ${u}`);
    });
}

test('the build agent card matches the 1.0 record: Builds #3 to #31, 25 Sep to 23 Oct 2026', () => {
    const card = JSON.parse(new TextDecoder().decode(bytesOf('agent-card/build-agent.json')));
    assert.match(card.description, /29 of the 31 builds: Builds #3 to #31, one a night from 25 Sep to 23 Oct 2026/);
});

test('hash rule: SHA-256 of the raw served bytes, as the registry computes it', async () => {
    const pre = fixture('mcp-build-agent-card-premint.json');
    assert.equal(await sha256Hex(pre.agent_card_json), pre.metadata_hash_hex);
    // A card that passes check-badge on testnet: the served body hashes to the on-chain metadata_hash.
    // (metadata_hash_hex of token 1391 from /v1/check-badge, 22 Nov 2026)
    assert.equal(await cardHash(bytesOf('test/fixtures/served-card-1391.json')), '123159fb44b70cbc1f2c8da608541752f5ac8f72d5488ac873372528c2968e64');
    // Reformatting changes the hash, which is why hosted files are never re-serialised.
    const card = JSON.parse(pre.agent_card_json);
    assert.notEqual(await cardHash(cardBytes(card)), pre.metadata_hash_hex);
    assert.equal(cardText(card), pre.agent_card_json + '\n');
});

test('the badge block equals what the registry returns, before and after mint', async () => {
    const pre = JSON.parse(fixture('mcp-build-agent-card-premint.json').agent_card_json).capabilities.extensions[0];
    assert.deepEqual(await composeBadgeExtension({ networkId: 'testnet', ownerAccount: OWNER, tokenId: null }), pre);
    const after = fixture('rest-get-badge-json-1391.json');
    assert.deepEqual(await composeBadgeExtension({ networkId: 'testnet', ownerAccount: after.owner_account, tokenId: 1391 }), after.extension);
});

test('a real badge-valid card passes our badge checks', async () => {
    const card = JSON.parse(new TextDecoder().decode(bytesOf('test/fixtures/served-card-1391.json')));
    const r = await validateCard(card, { networkId: 'testnet', requireBadge: true });
    assert.deepEqual(r.errors.filter((e) => e.startsWith('capabilities.extensions')), []);
    assert.deepEqual(r.badge, { short: 'JyP9VyutM5xqvktMPE7Zf', tokenId: 1391, owner: '4feUwnLc2VwcUi3ra7itkiEA6jQ9BPmCcLBZ5UF1mERii7LFBD' });
});

test('composing the hosted card: pre-mint, then with the token id', async () => {
    const source = JSON.parse(new TextDecoder().decode(bytesOf('agent-card/replay-verifier.json')));
    const v1 = await composePublishedCard(source, { networkId: 'testnet', ownerAccount: OWNER });
    const r1 = await validateCardFile(cardBytes(v1), { networkId: 'testnet', requireBadge: true });
    assert.deepEqual(r1.errors, []);
    assert.equal(v1.capabilities.extensions[0].params.tokenAddress, null);
    assert.equal(v1.capabilities.extensions[0].params.verification.verifyUrl, `https://agent-registry-mcp.concordium.com/v1/badge-check/${OWNER}`);
    assert.deepEqual(v1.registrations, []);
    assert.deepEqual(Object.keys(v1), Object.keys(source), 'key order (and so the bytes) stays stable');
    assert.deepEqual(source.capabilities.extensions, [], 'the source card is not modified');

    const v2 = await composePublishedCard(v1, { networkId: 'testnet', ownerAccount: OWNER, tokenId: 7 });
    const r2 = await validateCardFile(cardBytes(v2), { networkId: 'testnet', requireBadge: true });
    assert.deepEqual(r2.errors, []);
    assert.deepEqual(r2.warnings, []);
    assert.equal(v2.capabilities.extensions.length, 1, 'the old badge block is replaced, not duplicated');
    assert.deepEqual(v2.registrations, [{ agentId: 7, agentRegistry: 'ccd:4221332d34e1694168c2a0c0b3fd0f27:12802.0' }]);
});

test('the validator rejects what the spec rules out', async () => {
    const base = JSON.parse(new TextDecoder().decode(bytesOf('agent-card/build-agent.json')));
    const good = await composePublishedCard(base, { networkId: 'testnet', ownerAccount: OWNER, tokenId: 7 });
    const bad = async (mutate, pattern, options = { networkId: 'testnet', requireBadge: true }) => {
        const c = structuredClone(good);
        mutate(c);
        const r = await validateCard(c, options);
        assert.ok(r.errors.some((e) => pattern.test(e)), `expected an error matching ${pattern}, got ${JSON.stringify(r.errors)}`);
    };
    await bad((c) => (c.type = 'x'), /^type/);
    await bad((c) => (c.name = 'n'.repeat(129)), /^name/);
    await bad((c) => (c.description = ''), /^description/);
    await bad((c) => (c.version = 'v1'), /^version/);
    await bad((c) => (c.concordium = {}), /legacy/);
    await bad((c) => (c.skills = [c.skills[0], c.skills[0]]), /duplicate id/);
    await bad((c) => (c.capabilities.extensions = []), /no Concordium badge/);
    await bad((c) => (c.capabilities.extensions[0].params.contracts.cis8004 = 'ccd:4221332d34e1694168c2a0c0b3fd0f27:10082.0'), /cis8004/);
    await bad((c) => (c.capabilities.extensions[0].params.verification.verifyUrl += 'x'), /verifyUrl/);
    await bad((c) => (c.capabilities.extensions[0].required = true), /required/);
    await bad((c) => (c.image = 'http://bearproof.app/x.png'), /^image/);
    await bad(() => {}, /expected mainnet/, { networkId: 'mainnet', requireBadge: true });
    const r = await validateCardFile(cardBytes(good).slice(0, -1), { networkId: 'testnet' });
    assert.ok(r.errors.some((e) => /layout/.test(e)), 'a file without the trailing newline is not in the hosted layout');
});
