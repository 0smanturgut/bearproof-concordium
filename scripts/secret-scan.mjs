// Fails if a tracked file looks like it contains a secret.
// Run: node scripts/secret-scan.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PATTERNS = [
    ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ['Anthropic API key', /sk-ant-[A-Za-z0-9_-]{20,}/],
    ['GitHub token', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|github_pat_[A-Za-z0-9_]{40,}/],
    ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
    ['Cloudflare API token assignment', /CLOUDFLARE_API_TOKEN\s*[=:]\s*['"]?[A-Za-z0-9_-]{30,}/],
    ['hex private key assignment', /(private|secret)[_ -]?key\s*[=:]\s*['"]?(0x)?[0-9a-fA-F]{64}\b/i],
    ['Solana secret key array', /\[\s*(\d{1,3}\s*,\s*){63}\d{1,3}\s*\]/],
    ['seed phrase assignment', /(mnemonic|seed[_ -]?phrase)\s*[=:]\s*['"][a-z]+( [a-z]+){11,23}['"]/i],
];

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const self = 'scripts/secret-scan.mjs';
let hits = 0;
for (const file of files) {
    if (file === self) continue;
    let text;
    try {
        text = readFileSync(file, 'utf8');
    } catch {
        continue;
    }
    for (const [label, re] of PATTERNS) {
        if (re.test(text)) {
            console.error(`secret-scan: ${file}: looks like a ${label}`);
            hits++;
        }
    }
}
console.log(`secret-scan: ${files.length} file(s), ${hits} finding(s)`);
process.exit(hits ? 1 : 0);
