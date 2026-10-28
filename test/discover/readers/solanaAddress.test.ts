import { describe, expect, it } from 'vitest';
import {
  fromBase58,
  metadataAddress,
  onCurve,
  programAddress,
  toBase58,
} from '../../../src/discover/readers/solanaAddress';

describe('solana addresses', () => {
  it('derives the Metaplex metadata account of a mint as the chain holds it', () => {
    // Checked on mainnet on 2026-10-28: each account is owned by the metadata program and names the mint at bytes 33 to 65.
    expect(metadataAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(
      '5x38Kp4hvdomTCnCrAny4UtMUt5rQBdB6px2K1Ui45Wq',
    );
    expect(metadataAddress('USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB')).toBe(
      'HEffotZXTZuTs8t8Q9qiirMcnFvJFdB1bhBE6KwMibbe',
    );
  });

  it('reads and writes base58 with its leading zeros', () => {
    const bytes = fromBase58('11' + 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

    expect(bytes.slice(0, 2)).toEqual(Uint8Array.of(0, 0));
    expect(toBase58(bytes)).toBe('11EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  });

  it('tells a curve point from a program address', () => {
    // The ed25519 base point, y = 4/5, and the all-zero string, y = 0, are on the curve.
    const base = Uint8Array.from(Buffer.from('58' + '66'.repeat(31), 'hex'));
    const pda = programAddress([Buffer.from('seed')], 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

    expect(onCurve(base)).toBe(true);
    expect(onCurve(new Uint8Array(32))).toBe(true);
    expect(onCurve(fromBase58(pda))).toBe(false);
  });
});
