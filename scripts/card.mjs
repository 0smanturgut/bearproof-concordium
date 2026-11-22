#!/usr/bin/env node
// Agent Card tool. Offline except `compose --token-id` (reads the badge block) and `check-hosted`.
//
//   node scripts/card.mjs validate [file ...]          validate cards (default: every card in agent-card/)
//   node scripts/card.mjs hash <file>                  SHA-256 of the file's exact bytes (what the registry pins)
//   node scripts/card.mjs compose --release cards-v1 --agent build-agent --owner <account> [--token-id <n>]
//                                                      write agent-card/published/<release>/<agent>.json
//   node scripts/card.mjs check-hosted --release cards-v1 --agent build-agent [--url <url>]
//                                                      fetch the hosted card and compare its hash with the file
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { composeBadgeExtension, encodeTokenAddress } from '../src/badge.js';
import { isAccountAddress } from '../src/base58.js';
import { cardBytes, cardHash, composePublishedCard, validateCardFile } from '../src/card.js';
import { restClient } from '../src/clients.js';
import { network } from '../src/networks.js';
import {
    AGENTS,
    NETWORK_ID,
    ROOT,
    agentName,
    fail,
    need,
    parseArgs,
    publishedPath,
    publishedUrl,
    readRepoFile,
    releaseName,
} from './lib/cli.js';

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

function allCardFiles() {
    const out = Object.keys(AGENTS).map((a) => `agent-card/${a}.json`);
    const pub = join(ROOT, 'agent-card', 'published');
    if (existsSync(pub))
        for (const rel of readdirSync(pub).sort())
            for (const f of readdirSync(join(pub, rel)).sort()) if (f.endsWith('.json')) out.push(`agent-card/published/${rel}/${f}`);
    return out;
}

// Published releases also carry a SHA256SUMS file in `sha256sum` format; check it agrees.
function sumsFor(file) {
    const p = join(ROOT, dirname(file), 'SHA256SUMS');
    if (!existsSync(p)) return null;
    const line = readFileSync(p, 'utf8')
        .split('\n')
        .find((l) => l.endsWith(`  ${file.split('/').pop()}`));
    return line ? line.split('  ')[0] : null;
}

async function validate(files) {
    let bad = 0;
    for (const file of files) {
        const published = file.startsWith('agent-card/published/');
        const r = await validateCardFile(readRepoFile(file), { networkId: NETWORK_ID, requireBadge: published });
        if (published) {
            const sum = sumsFor(file);
            if (sum === null) r.errors.push('SHA256SUMS: no line for this file');
            else if (sum !== r.sha256) r.errors.push(`SHA256SUMS says ${sum}, the file hashes to ${r.sha256}`);
        }
        const ok = r.errors.length === 0;
        if (!ok) bad++;
        console.log(`${ok ? 'ok  ' : 'FAIL'} ${file}  sha256 ${r.sha256}  ${r.byteLength} bytes`);
        for (const e of r.errors) console.log(`     error: ${e}`);
        for (const w of r.warnings) console.log(`     note:  ${w}`);
    }
    if (bad) fail(`${bad} card file(s) failed validation`, 1);
}

async function compose() {
    const release = releaseName(args);
    const agent = agentName(args);
    const owner = need(args, 'owner', 'the testnet account that owns (or will own) this agent');
    if (!(await isAccountAddress(owner))) fail(`--owner is not a Concordium account address: ${owner}`);
    const tokenId = args['token-id'] === undefined ? null : Number(need(args, 'token-id'));
    if (tokenId !== null && !Number.isSafeInteger(tokenId)) fail('--token-id must be an integer');

    const source = JSON.parse(new TextDecoder().decode(readRepoFile(`agent-card/${agent}.json`)));
    let extension = null;
    if (tokenId !== null) {
        // After mint: take the block from the registry (the documented flow) and check it against ours.
        const badge = await encodeTokenAddress(network(NETWORK_ID).cis8004, tokenId);
        const got = await restClient().getBadgeJson(NETWORK_ID, badge);
        if (got.owner_account !== owner) fail(`token ${tokenId} is owned by ${got.owner_account}, not ${owner}`);
        if (got.status !== 'Active') fail(`token ${tokenId} is ${got.status}`);
        const ours = await composeBadgeExtension({ networkId: NETWORK_ID, ownerAccount: owner, tokenId, agentWallet: got.agent_wallet });
        // The service may add params we do not compose (for example an external key once CIS-8 is linked);
        // those are kept, since the block is pasted verbatim. Every field we do compose must agree.
        const { params: theirParams, ...theirTop } = got.extension || {};
        const { params: ourParams, ...ourTop } = ours;
        const shared = Object.fromEntries(Object.keys(ourParams).map((k) => [k, theirParams?.[k]]));
        if (!isDeepStrictEqual(ourTop, theirTop) || !isDeepStrictEqual(ourParams, shared)) {
            console.error('The registry returned a badge block that differs from the documented form:');
            console.error(JSON.stringify(got.extension, null, 2));
            fail('stopping so a human can look (the spec may have changed)');
        }
        const extra = Object.keys(theirParams).filter((k) => !(k in ourParams));
        if (extra.length) console.log(`note: the registry's block also carries ${extra.join(', ')} (kept as given)`);
        extension = got.extension;
        console.log(`badge ${badge} (token ${tokenId}), block from /v1/get-badge-JSON matches the documented form`);
    }
    const card = await composePublishedCard(source, { networkId: NETWORK_ID, ownerAccount: owner, tokenId, extension });
    const bytes = cardBytes(card);
    const check = await validateCardFile(bytes, { networkId: NETWORK_ID, requireBadge: true });
    if (!check.ok) fail(`composed card is invalid:\n  ${check.errors.join('\n  ')}`);

    const rel = publishedPath(release, agent);
    const abs = join(ROOT, rel);
    if (existsSync(abs)) fail(`${rel} already exists; a published card is never edited. Use a new release (cards-vN).`);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, bytes);
    const hash = await cardHash(bytes);
    const sums = join(dirname(abs), 'SHA256SUMS');
    const prev = existsSync(sums) ? readFileSync(sums, 'utf8') : '';
    writeFileSync(sums, prev + `${hash}  ${agent}.json\n`);

    console.log(`wrote ${rel}`);
    console.log(`  sha256 (metadata_hash): ${hash}`);
    console.log(`  bytes:                  ${bytes.length}`);
    console.log(`  agent_uri once tagged:  ${publishedUrl(release, agent)}`);
    console.log('next: commit, tag the commit with the release name, push the tag, then run');
    console.log(`  node scripts/card.mjs check-hosted --release ${release} --agent ${agent}`);
}

async function checkHosted() {
    const release = releaseName(args);
    const agent = agentName(args);
    const url = args.url && args.url !== true ? args.url : publishedUrl(release, agent);
    const local = readRepoFile(publishedPath(release, agent));
    const res = await fetch(url, { cache: 'no-store' });
    const served = new Uint8Array(await res.arrayBuffer());
    const [a, b] = [await cardHash(local), await cardHash(served)];
    console.log(`file   ${a}  ${local.length} bytes  ${publishedPath(release, agent)}`);
    console.log(`served ${res.ok ? b : '-'}  ${res.ok ? served.length + ' bytes' : 'HTTP ' + res.status}  ${url}`);
    if (!res.ok || a !== b) fail('the hosted card does not match the file; do not register or pin this URL', 1);
    console.log('match: the URL serves exactly these bytes');
}

switch (cmd) {
    case 'validate':
        await validate(args._.length > 1 ? args._.slice(1).map((f) => relative(ROOT, join(process.cwd(), f))) : allCardFiles());
        break;
    case 'hash': {
        const file = args._[1] || fail('usage: card.mjs hash <file>');
        const bytes = new Uint8Array(readFileSync(file));
        console.log(`${await cardHash(bytes)}  ${bytes.length} bytes  ${file}`);
        break;
    }
    case 'compose':
        await compose();
        break;
    case 'check-hosted':
        await checkHosted();
        break;
    default:
        fail('usage: card.mjs validate | hash <file> | compose | check-hosted   (see the header of scripts/card.mjs)');
}

