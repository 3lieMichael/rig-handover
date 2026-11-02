import type { Digest } from './types.js';

export type NightCounts = { ok: number; retry: number; fail: number };

// Line counts for one night: every parsed line is exactly one of ok / retry / fail.
export function countsOf(digest: Digest): NightCounts {
  let ok = 0;
  let retry = 0;
  let fail = 0;
  for (const row of digest.rows) {
    ok += row.runs - row.retries - row.fails;
    retry += row.retries;
    fail += row.fails;
  }
  return { ok, retry, fail };
}
