// Offline: Base58Check, badge token addresses, transaction parameters and the CIS-8 message.
// Expected values were recorded from the live testnet services on 22 Nov 2026 (docs/api-notes.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeTokenAddress, encodeTokenAddress } from '../src/badge.js';
import { base58Decode, base58Encode, decodeAccountAddress, isAccountAddress } from '../src/base58.js';
import { toHex } from '../src/bytes.js';
import { solanaCis8Message } from '../src/cis8.js';
import { NETWORKS, caip10Contract, caip19Badge, caip2 } from '../src/networks.js';
import { encodeRegister, encodeSetAgentUri } from '../src/params.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const TESTNET_ADMIN = '3whdieGHx43KKRwQYbC5pAUdmWZ61B7yreNRU9i36MtdCvajR8'; // registry admin, a public testnet account

test('badge token addresses match the registry (testnet <12802,0> and the mainnet docs example)', async () => {
    const t = NETWORKS.testnet.cis8004;
    assert.equal(await encodeTokenAddress(t, 1391), 'JyP9VyutM5xqvktMPE7Zf');
    assert.equal(await encodeTokenAddress(t, 1390), 'JyP9VxpQR4Tv6debatDJZ');
    assert.equal(await encodeTokenAddress(t, 1345), 'JyP9V7ZjVu29m1xTU1KDH');
    assert.equal(await encodeTokenAddress(t, 999999), 'JyP9V5dupAgxNyUmSS4CG');
    assert.equal(await encodeTokenAddress(NETWORKS.mainnet.cis8004, 484), 'Mf22soLh1NuZYFgBK8iSs');
    assert.deepEqual(await decodeTokenAddress('JyP9VyutM5xqvktMPE7Zf'), { contract: { index: 12802, subindex: 0 }, tokenId: 1391 });
    await assert.rejects(decodeTokenAddress('JyP9VyutM5xqvktMPE7Zg'), /checksum/);
});

test('account addresses: checksum and version byte are enforced', async () => {
    assert.equal((await decodeAccountAddress(TESTNET_ADMIN)).length, 32);
    assert.equal(await isAccountAddress(TESTNET_ADMIN), true);
    assert.equal(await isAccountAddress(TESTNET_ADMIN.slice(0, -1) + 'S'), false);
    assert.equal(await isAccountAddress('JyP9VyutM5xqvktMPE7Zf'), false); // a badge, not an account
    const bytes = Uint8Array.of(0, 0, 1, 2, 255);
    assert.deepEqual(base58Decode(base58Encode(bytes)), bytes);
});

test('CAIP identifiers use the first 32 hex characters of the genesis hash', () => {
    assert.equal(caip2('testnet'), 'ccd:4221332d34e1694168c2a0c0b3fd0f27');
    assert.equal(caip2('mainnet'), 'ccd:9dd9ca4d19e9393877d2c44b70f89acb');
    assert.equal(caip10Contract('testnet', NETWORKS.testnet.cis8004), 'ccd:4221332d34e1694168c2a0c0b3fd0f27:12802.0');
    assert.equal(caip19Badge('testnet', 'X'), 'ccd:4221332d34e1694168c2a0c0b3fd0f27/cis-2:X');
    assert.throws(() => caip2('devnet'), /unknown network/);
});

test('register and setAgentURI parameters encode exactly as the service builds them', () => {
    const reg = fixture('mcp-build-register.json');
    assert.equal(
        encodeRegister({ agentUri: 'https://example.com/card.json', metadataHashHex: '3359a0bae52ed62234f6976ff2e93dd9e569cd5cfa4c2e97dc2bec2774ddff2e' }),
        reg.parameter_hex
    );
    // GET /v1/build-set-agent-uri/JyP9VyutM5xqvktMPE7Zf?metadata_hash_hex=1231… (agent_uri unchanged)
    assert.equal(
        encodeSetAgentUri({ tokenId: 1391, metadataHashHex: '123159fb44b70cbc1f2c8da608541752f5ac8f72d5488ac873372528c2968e64' }),
        '086f050000000000000001123159fb44b70cbc1f2c8da608541752f5ac8f72d5488ac873372528c2968e64'
    );
    assert.throws(() => encodeRegister({ agentUri: 'x', metadataHashHex: 'abcd' }), /32 bytes/);
});

test('the CIS-8 message for a Solana key matches build_cis8_canonical_bytes byte for byte', async () => {
    // build_cis8_canonical_bytes{network: testnet, concordium_account: TESTNET_ADMIN,
    //   external_namespace = key namespace = solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp, ed25519,
    //   public key of GD9HPVpLqDxYfgf9ZNQDN3WwCfZips7tVCHAhMcchRo5 (BEARPROOF 1.0 prize wallet), solana-ed25519}
    const expected =
        '4349532d382f76312f63616e6f6e6963616c8398b5fb9b7cf906e453162cbd93517cb729b4833a881c4295a1dda5fa65545b01320000000000000000000000000000' +
        '4221332d34e1694168c2a0c0b3fd0f273809612cb13d000d5c2e00e85f50f79627000000736f6c616e613a3565796b7434557346763850384e4a64545245705931767a714b715a4b766470' +
        '27000000736f6c616e613a3565796b7434557346763850384e4a64545245705931767a714b715a4b766470070000006564323535313920000000' +
        'e1fba382afbe3cceff8f0fe61853e3982ce60069cd136746bd478d3383f2a0200e000000736f6c616e612d65643235353139';
    const msg = await solanaCis8Message({
        networkId: 'testnet',
        concordiumAccount: TESTNET_ADMIN,
        solanaPublicKey: base58Decode('GD9HPVpLqDxYfgf9ZNQDN3WwCfZips7tVCHAhMcchRo5'),
    });
    assert.equal(msg.length, 249);
    assert.equal(toHex(msg), expected);
});
