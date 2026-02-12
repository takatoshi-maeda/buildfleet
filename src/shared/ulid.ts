import { randomBytes } from "node:crypto";

const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LENGTH = 10;
const RANDOM_LENGTH = 16;

export function createUlid(timestampMs: number = Date.now()): string {
  if (!Number.isInteger(timestampMs) || timestampMs < 0) {
    throw new Error("timestampMs must be a non-negative integer");
  }

  return `${encodeTime(timestampMs)}${encodeRandom(randomBytes(10))}`;
}

function encodeTime(timestampMs: number): string {
  let value = BigInt(timestampMs);
  let encoded = "";
  for (let index = 0; index < TIME_LENGTH; index += 1) {
    const digit = Number(value & 31n);
    encoded = `${CROCKFORD_BASE32[digit]}${encoded}`;
    value >>= 5n;
  }

  if (value !== 0n) {
    throw new Error("timestampMs exceeds ULID time capacity");
  }

  return encoded;
}

function encodeRandom(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }

  let encoded = "";
  for (let index = 0; index < RANDOM_LENGTH; index += 1) {
    const digit = Number(value & 31n);
    encoded = `${CROCKFORD_BASE32[digit]}${encoded}`;
    value >>= 5n;
  }

  return encoded;
}
