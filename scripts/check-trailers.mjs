// Every commit must say who wrote it: a "Build-Mode: bootstrap | human | agent" trailer.
// Run: node scripts/check-trailers.mjs [revision-range]   (default: all of HEAD)
import { execFileSync } from 'node:child_process';

const range = process.argv[2] || 'HEAD';
const log = execFileSync('git', ['log', '--format=%H%x00%B%x1e', range], { encoding: 'utf8' });
const bad = [];
let count = 0;
for (const entry of log.split('\x1e')) {
    const [hash, body] = entry.trim().split('\0');
    if (!hash) continue;
    count++;
    if (!/^Build-Mode: (bootstrap|human|agent)\s*$/m.test(body || '')) bad.push(hash.slice(0, 7));
}
if (bad.length) {
    console.error(`check-trailers: ${bad.length} commit(s) without a Build-Mode trailer: ${bad.join(', ')}`);
    process.exit(1);
}
console.log(`check-trailers: ${count} commit(s), all carry Build-Mode`);
