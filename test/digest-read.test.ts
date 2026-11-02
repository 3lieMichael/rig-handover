import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line', () => {
    const d = readNight('runs', '2026-10-28');
    expect(d).not.toBeNull();
    expect(d!.badLines).toBe(1);
    expect(d!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    const refresh = d!.rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(refresh).toMatchObject({
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    const backup = d!.rows.find((r) => r.job === 'notes/backup')!;
    expect(backup).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded', retries: 0, fails: 1 });
  });

  it('keeps a row whose owner is null', () => {
    const d = readNight('runs', '2026-10-28')!;
    expect(d.rows.find((r) => r.job === 'digest/render')).toMatchObject({ owner: null, runs: 1, lastError: null });
  });

  it('returns null for a night with no file', () => {
    expect(readNight('runs', '1999-01-01')).toBeNull();
    expect(readNight('runs', '../package')).toBeNull();
  });

  it('renders an empty night as no rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('counts lines that are valid JSON but not run lines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(
      join(dir, '2026-01-02.jsonl'),
      ['{"at":"t","job":"a","status":"ok","owner":"x"}', '[]', '{"at":"t","job":"b","status":"weird"}', 'null'].join('\n'),
    );
    const d = readNight(dir, '2026-01-02')!;
    expect(d.rows).toHaveLength(1);
    expect(d.badLines).toBe(3);
  });
});
