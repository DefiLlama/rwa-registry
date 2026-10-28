/**
 * solanaAddress: base58 and the program derived address of a Solana mint's Metaplex token metadata account, with node's sha256 and the ed25519 on-curve test, so no Solana library is needed.
 * @dev review: src/discover/readers/solana.ts
 */
import { createHash } from 'node:crypto';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const METADATA_PROGRAM = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';

export const fromBase58 = (text: string): Uint8Array => {
  let value = 0n;
  for (const char of text) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) throw new Error(`not base58: ${char}`);
    value = value * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  for (; value > 0n; value >>= 8n) bytes.unshift(Number(value & 0xffn));
  const zeros = text.length - text.replace(/^1+/, '').length;
  return Uint8Array.from([...new Array<number>(zeros).fill(0), ...bytes]);
};

export const toBase58 = (bytes: Uint8Array): string => {
  let value = bytes.reduce((sum, byte) => (sum << 8n) + BigInt(byte), 0n);
  let text = '';
  for (; value > 0n; value /= 58n) text = ALPHABET[Number(value % 58n)] + text;
  const zeros = bytes.findIndex((byte) => byte !== 0);
  return '1'.repeat(zeros < 0 ? bytes.length : zeros) + text;
};

// The ed25519 field and curve constant: p = 2^255 - 19, d = -121665 / 121666.
const P = 2n ** 255n - 19n;
const mod = (value: bigint) => ((value % P) + P) % P;
const power = (base: bigint, exponent: bigint) => {
  let [result, square, rest] = [1n, mod(base), exponent];
  for (; rest > 0n; rest >>= 1n, square = (square * square) % P) if (rest & 1n) result = (result * square) % P;
  return result;
};
const D = mod(-121665n * power(121666n, P - 2n));

// A 32-byte string is a point when some x solves x^2 = (y^2 - 1) / (d y^2 + 1), the decompression the Solana runtime runs; y is read mod p with the sign bit cleared.
export const onCurve = (bytes: Uint8Array): boolean => {
  const y = mod(bytes.reduceRight((sum, byte, index) => (sum << 8n) + BigInt(index === 31 ? byte & 0x7f : byte), 0n));
  const ratio = mod((y * y - 1n) * power(D * y * y + 1n, P - 2n));
  return ratio === 0n || power(ratio, (P - 1n) / 2n) === 1n;
};

// findProgramAddress: the first bump from 255 down whose hash is off the curve.
export const programAddress = (seeds: Uint8Array[], program: string): string => {
  const programId = fromBase58(program);
  for (let bump = 255; bump >= 0; bump--) {
    const hash = createHash('sha256');
    [...seeds, Uint8Array.of(bump), programId, Buffer.from('ProgramDerivedAddress')].forEach((part) =>
      hash.update(part),
    );
    const address = new Uint8Array(hash.digest());
    if (!onCurve(address)) return toBase58(address);
  }
  throw new Error('no program address off the curve');
};

export const metadataAddress = (mint: string): string =>
  programAddress([Buffer.from('metadata'), fromBase58(METADATA_PROGRAM), fromBase58(mint)], METADATA_PROGRAM);
