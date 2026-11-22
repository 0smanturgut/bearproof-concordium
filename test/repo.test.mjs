import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the README opens with the pre-existing work disclosure', () => {
    const readme = read('README.md');
    assert.match(readme, /## Pre-existing work and what is new/);
    assert.match(readme, /v1\.0-final/);
    assert.match(readme, /AI_USAGE\.md/);
});

test('the honesty files are present', () => {
    for (const f of ['AI_USAGE.md', 'CLAIMS.md', 'LICENSE']) {
        assert.ok(existsSync(new URL('../' + f, import.meta.url)), f + ' is missing');
    }
    assert.match(read('LICENSE'), /MIT License/);
});

test('no exchange brand in the project name', () => {
    const { name } = JSON.parse(read('package.json'));
    assert.doesNotMatch(name, /binance|bnb/i);
});
