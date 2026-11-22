// Small shared helpers for the command-line scripts (Node only).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REPO = '0smanturgut/bearproof-concordium';
export const AGENTS = Object.freeze({
    'build-agent': 'BEARPROOF Build Agent',
    'replay-verifier': 'BEARPROOF Replay Verifier',
});
export const NETWORK_ID = 'testnet';

export function parseArgs(argv) {
    const args = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const key = a.slice(2);
            const next = argv[i + 1];
            if (next === undefined || next.startsWith('--')) args[key] = true;
            else {
                args[key] = next;
                i++;
            }
        } else args._.push(a);
    }
    return args;
}

export function need(args, key, hint = '') {
    const v = args[key];
    if (v === undefined || v === true) fail(`missing --${key}${hint ? ` (${hint})` : ''}`);
    return v;
}

export function fail(message, code = 2) {
    console.error(`error: ${message}`);
    process.exit(code);
}

export function agentName(args) {
    const a = need(args, 'agent', Object.keys(AGENTS).join(' | '));
    if (!AGENTS[a]) fail(`unknown agent "${a}" (use ${Object.keys(AGENTS).join(' or ')})`);
    return a;
}

// A card release is a folder agent-card/published/<release>/ committed at a git tag of the same name.
export function releaseName(args) {
    const r = need(args, 'release', 'e.g. cards-v1');
    if (!/^cards-v\d+$/.test(r)) fail(`release must look like cards-v1, cards-v2, ... (got "${r}")`);
    return r;
}

export const publishedPath = (release, agent) => `agent-card/published/${release}/${agent}.json`;

// The immutable URL a released card is served from: raw.githubusercontent.com at the release tag.
export const publishedUrl = (release, agent) =>
    `https://raw.githubusercontent.com/${REPO}/refs/tags/${release}/${publishedPath(release, agent)}`;

export function readRepoFile(rel) {
    const p = join(ROOT, rel);
    if (!existsSync(p)) fail(`${rel} does not exist`);
    return new Uint8Array(readFileSync(p));
}

export function printJson(value) {
    console.log(JSON.stringify(value, null, 2));
}
