const MASK = (1n << 64n) - 1n;

/** FNV-1a 64-bit hash of the daily seed string. */
export function hashSeed(text: string): bigint {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * 0x100000001b3n) & MASK;
  }
  return h;
}

/**
 * SplitMix64 step. Returns the next additive state and a uniform value in [0, 1).
 * The same seed always yields the same stream.
 */
export function nextUnit(state: bigint): { state: bigint; u: number } {
  const s = (state + 0x9E3779B97F4A7C15n) & MASK;
  let z = s;
  z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & MASK;
  z = (z ^ (z >> 31n)) & MASK;
  const u = Number(z >> 11n) / 2 ** 53;
  return { state: s, u };
}
