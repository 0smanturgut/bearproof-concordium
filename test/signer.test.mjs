// Offline: the operator's CIS-8 signer, run with a throwaway key made inside the test and deleted after.
// No key material is written to the repository or printed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { generateKeyPairSync, verify } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { base58Encode } from '../src/base58.js';
import { fromHex } from '../src/bytes.js';
import { solanaCis8Message } from '../src/cis8.js';

const SCRIPT = fileURLToPath(new URL('../scripts/cis8-sign-solana.mjs', import.meta.url));
const ACCOUNT = '3whdieGHx43KKRwQYbC5pAUdmWZ61B7yreNRU9i36MtdCvajR8';

function throwaway() {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const seed = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32);
    const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
    return { seed, pub, publicKey, address: base58Encode(pub) };
}

test('signs the CIS-8 message with a key file, and only that', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'bp-cis8-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const k = throwaway();
    const keyfile = join(dir, 'key.json');
    writeFileSync(keyfile, JSON.stringify([...k.seed, ...k.pub]), { mode: 0o600 });

    const out = execFileSync(process.execPath, [SCRIPT, '--account', ACCOUNT, '--solana', k.address, '--keyfile', keyfile], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.match(out, /^[0-9a-f]{128}\n$/, 'stdout is the signature and nothing else');
    const msg = await solanaCis8Message({ networkId: 'testnet', concordiumAccount: ACCOUNT, solanaPublicKey: new Uint8Array(k.pub) });
    assert.ok(verify(null, Buffer.from(msg), k.publicKey, Buffer.from(fromHex(out.trim()))));

    // The same key as a base58 secret through a pipe gives the same signature.
    const piped = spawnSync(process.execPath, [SCRIPT, '--account', ACCOUNT, '--solana', k.address, '--stdin'], {
        input: base58Encode(Buffer.concat([k.seed, k.pub])),
        encoding: 'utf8',
    });
    assert.equal(piped.status, 0, piped.stderr);
    assert.equal(piped.stdout, out);
    assert.doesNotMatch(piped.stderr + out, new RegExp(base58Encode(Buffer.concat([k.seed, k.pub]))));
});

test('refuses a key that is not the expected address, and a key on the command line', (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'bp-cis8-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const k = throwaway();
    const other = throwaway();
    const keyfile = join(dir, 'key.json');
    writeFileSync(keyfile, JSON.stringify([...k.seed, ...k.pub]), { mode: 0o600 });
    const wrong = spawnSync(process.execPath, [SCRIPT, '--account', ACCOUNT, '--solana', other.address, '--keyfile', keyfile], { encoding: 'utf8' });
    assert.equal(wrong.status, 2);
    assert.equal(wrong.stdout, '');
    assert.match(wrong.stderr, /nothing signed/);
    const noKey = spawnSync(process.execPath, [SCRIPT, '--account', ACCOUNT, '--solana', k.address], { encoding: 'utf8', input: '' });
    assert.equal(noKey.status, 2);
    assert.equal(noKey.stdout, '');
    // A key file whose public half does not match its seed.
    writeFileSync(keyfile, JSON.stringify([...k.seed, ...other.pub]), { mode: 0o600 });
    const mixed = spawnSync(process.execPath, [SCRIPT, '--account', ACCOUNT, '--solana', k.address, '--keyfile', keyfile], { encoding: 'utf8' });
    assert.equal(mixed.status, 2);
    assert.match(mixed.stderr, /inconsistent/);
});
