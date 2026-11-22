#!/usr/bin/env node
// OPERATOR ONLY, OFFLINE. Signs the CIS-8 canonical message that binds a Solana key to a Concordium
// account (scheme solana-ed25519: Ed25519 over the message bytes, nothing else).
//
//   node scripts/cis8-sign-solana.mjs --account <concordium account> --solana <solana address> --keyfile <path>
//   <command that prints the base58 secret> | node scripts/cis8-sign-solana.mjs --account <...> --solana <...> --stdin
//
// --keyfile: a solana-keygen JSON file (64 numbers) or a text file holding the base58 secret key.
// --stdin:   the base58 secret key piped in (refused from a keyboard, so it is never typed or pasted).
// The key never goes on the command line. This script makes no network call: it builds the message
// itself from --account and the key, refuses unless the key is the --solana address, signs, checks the
// signature, and prints only the 64-byte signature as hex on stdout. Nothing secret is printed.
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { base58Decode, base58Encode, isAccountAddress } from '../src/base58.js';
import { sha256Hex, toHex } from '../src/bytes.js';
import { CIS8_DOMAIN_TAG, solanaCis8Message } from '../src/cis8.js';
import { network } from '../src/networks.js';

const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex');

function fail(msg) {
    process.stderr.write(`error: ${msg}\n`);
    process.exit(2);
}

function arg(name) {
    const i = process.argv.indexOf(`--${name}`);
    if (i < 0) return undefined;
    const v = process.argv[i + 1];
    return v === undefined || v.startsWith('--') ? true : v;
}

function parseSecret(text) {
    const t = text.trim();
    let bytes;
    if (t.startsWith('[')) bytes = Uint8Array.from(JSON.parse(t));
    else bytes = base58Decode(t);
    if (bytes.length !== 64 && bytes.length !== 32) throw new Error('expected a 64-byte Solana secret key (or a 32-byte seed)');
    return bytes;
}

async function readStdin() {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    return Buffer.concat(chunks).toString('utf8');
}

const account = arg('account');
const expected = arg('solana');
const networkId = arg('network') === undefined ? 'testnet' : arg('network');
if (typeof account !== 'string' || !(await isAccountAddress(account)))
    fail('--account <the Concordium account that will send the CIS-8 transaction> is required');
if (typeof expected !== 'string') fail('--solana <the Solana address being bound> is required');
network(networkId);

let secret;
try {
    if (typeof arg('keyfile') === 'string') secret = parseSecret(readFileSync(arg('keyfile'), 'utf8'));
    else if (arg('stdin') === true) {
        if (process.stdin.isTTY) fail('--stdin reads a pipe only; do not type or paste a key here');
        secret = parseSecret(await readStdin());
    } else fail('give the key with --keyfile <path> or pipe it with --stdin');
} catch (e) {
    fail(`could not read the key: ${e.message}`); // the message never contains key material
}

const seed = Buffer.from(secret.subarray(0, 32));
const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), format: 'der', type: 'pkcs8' });
const publicKey = createPublicKey(privateKey);
const pub = new Uint8Array(publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
// A 64-byte Solana secret carries the public key in its second half; it must match the seed.
const consistent = secret.length === 32 || toHex(secret.subarray(32)) === toHex(pub);
secret.fill(0);
seed.fill(0);
if (!consistent) fail('the key file is inconsistent (its public half does not match its seed); nothing signed');
const address = base58Encode(pub);
if (address !== expected) fail(`the key belongs to ${address}, not ${expected}; nothing signed`);

const message = await solanaCis8Message({ networkId, concordiumAccount: account, solanaPublicKey: pub });
if (new TextDecoder().decode(message.subarray(0, CIS8_DOMAIN_TAG.length)) !== CIS8_DOMAIN_TAG) fail('internal: bad message prefix');
const signature = sign(null, Buffer.from(message), privateKey);
if (!verify(null, Buffer.from(message), publicKey, signature)) fail('internal: the signature does not verify');

process.stderr.write(
    [
        `signed the CIS-8 canonical message (${message.length} bytes, sha256 ${await sha256Hex(message)})`,
        `  network:  ${networkId}`,
        `  account:  ${account}  (this account must send the registerExternalKey transaction)`,
        `  solana:   ${address}`,
        '  signature (stdout): pass it to: node scripts/registry.mjs build-cis8-register --signature <hex> ...',
        '',
    ].join('\n')
);
process.stdout.write(toHex(signature) + '\n');
