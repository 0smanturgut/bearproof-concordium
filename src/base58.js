// Base58 and Base58Check (Bitcoin alphabet, checksum = first 4 bytes of double SHA-256).
// Used for Concordium account addresses (version byte 1) and badge token addresses (version byte 2).
import { concat, sha256 } from './bytes.js';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Encode(bytes) {
    let n = 0n;
    for (const b of bytes) n = (n << 8n) | BigInt(b);
    let out = '';
    while (n > 0n) {
        out = ALPHABET[Number(n % 58n)] + out;
        n /= 58n;
    }
    for (const b of bytes) {
        if (b !== 0) break;
        out = '1' + out;
    }
    return out;
}

export function base58Decode(text) {
    let n = 0n;
    for (const ch of text) {
        const v = ALPHABET.indexOf(ch);
        if (v < 0) throw new Error(`not base58: "${ch}"`);
        n = n * 58n + BigInt(v);
    }
    const body = [];
    while (n > 0n) {
        body.unshift(Number(n & 0xffn));
        n >>= 8n;
    }
    let zeros = 0;
    while (zeros < text.length && text[zeros] === '1') zeros++;
    return Uint8Array.from([...new Array(zeros).fill(0), ...body]);
}

async function checksum(payload) {
    return (await sha256(await sha256(payload))).slice(0, 4);
}

export async function base58CheckEncode(payload) {
    return base58Encode(concat(payload, await checksum(payload)));
}

export async function base58CheckDecode(text) {
    const raw = base58Decode(text);
    if (raw.length < 5) throw new Error('base58check string too short');
    const payload = raw.slice(0, -4);
    const sum = await checksum(payload);
    if (!sum.every((b, i) => b === raw[raw.length - 4 + i])) throw new Error('base58check checksum mismatch');
    return payload;
}

// A Concordium account address is Base58Check(0x01 ‖ 32 bytes).
export async function decodeAccountAddress(address) {
    const payload = await base58CheckDecode(address);
    if (payload.length !== 33 || payload[0] !== 1) throw new Error(`not a Concordium account address: ${address}`);
    return payload.slice(1);
}

export async function isAccountAddress(address) {
    try {
        await decodeAccountAddress(String(address));
        return true;
    } catch {
        return false;
    }
}
