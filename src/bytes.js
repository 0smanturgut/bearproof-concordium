// Byte helpers that run the same in Node 20+, browsers and Cloudflare Workers (WebCrypto only).

export const utf8 = (text) => new TextEncoder().encode(text);

export function toHex(bytes) {
    return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex) {
    const clean = String(hex).trim().replace(/^0x/i, '');
    if (clean.length % 2 || /[^0-9a-f]/i.test(clean)) throw new Error('not a hex string');
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return out;
}

export function concat(...parts) {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) {
        out.set(p, at);
        at += p.length;
    }
    return out;
}

export function u32le(n) {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, n, true);
    return out;
}

export function u64le(n) {
    const out = new Uint8Array(8);
    new DataView(out.buffer).setBigUint64(0, BigInt(n), true);
    return out;
}

export function uleb128(n) {
    let v = BigInt(n);
    const out = [];
    do {
        let byte = Number(v & 0x7fn);
        v >>= 7n;
        if (v) byte |= 0x80;
        out.push(byte);
    } while (v);
    return Uint8Array.from(out);
}

// Raw SHA-256 of bytes (or of the UTF-8 of a string). This is what the Agent Registry anchors:
// the hash of the served bytes, not of any re-serialised JSON.
export async function sha256(input) {
    const bytes = typeof input === 'string' ? utf8(input) : input;
    return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

export async function sha256Hex(input) {
    return toHex(await sha256(input));
}
