import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Digest } from '../src/digest/types.js';

const runsDir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };

const NORMAL = '2026-01-10';
const EMPTY = '2026-01-11';
const BAD = '2026-01-12';
const MISSING = '1999-01-01';

const line = (job: string, status: string, at: string, owner: string | null = 'rook', error?: string) =>
  JSON.stringify(error === undefined ? { at, job, status, owner } : { at, job, status, owner, error });

beforeAll(() => {
  // Written out of order on purpose: both routes must sort by job.
  writeFileSync(
    join(runsDir, `${NORMAL}.jsonl`),
    [
      line('zeta/sync', 'ok', '2026-01-11T01:00:00+01:00'),
      line('alpha/build', 'retry', '2026-01-11T01:05:00+01:00', 'kit', 'timeout'),
      line('mid/report', 'fail', '2026-01-11T01:10:00+01:00', null, 'disk full'),
      line('alpha/build', 'ok', '2026-01-11T01:15:00+01:00', 'kit'),
    ].join('\n'),
  );
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    join(runsDir, `${BAD}.jsonl`),
    [
      line('good/two', 'ok', '2026-01-13T02:00:00+01:00'),
      '{not json',
      line('good/one', 'ok', '2026-01-13T02:05:00+01:00'),
    ].join('\n'),
  );
});

beforeEach(() => {
  delete process.env.LANE_MARKER;
  delete process.env.LANE_ID;
});

const get = (path: string) => createApp(config).request(path);

// First-column cell of every body row; header cells are <th>, so they don't match.
function jobsInTable(html: string): string[] {
  const jobs: string[] = [];
  for (const m of html.matchAll(/<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>/g)) {
    jobs.push((m[1] ?? '').replace(/<[^>]*>/g, '').trim());
  }
  return jobs;
}

describe('GET /digest/:night', () => {
  it('renders a normal night in the layout, one row per job, sorted by job', async () => {
    const res = await get(`/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('text/html');
    const html = await res.text();
    expect(html).toContain('lane-07');
    expect(html).toContain('no marker set');
    expect(html.match(/<table[\s>]/g)).toHaveLength(1);
    expect(jobsInTable(html)).toEqual(['alpha/build', 'mid/report', 'zeta/sync']);
  });

  it('shows the lane marker when one is set', async () => {
    process.env.LANE_MARKER = 'ROUTE-MARKER';
    const html = await (await get(`/digest/${NORMAL}`)).text();
    expect(html).toContain('lane-07');
    expect(html).toContain('ROUTE-MARKER');
  });

  it('says nothing ran for an empty night', async () => {
    const res = await get(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it("keeps the good jobs and says a line didn't parse", async () => {
    const res = await get(`/digest/${BAD}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/didn(?:'|&#39;)t parse/);
    expect(jobsInTable(html)).toEqual(['good/one', 'good/two']);
  });

  it('404s for a night with no file', async () => {
    expect((await get(`/digest/${MISSING}`)).status).toBe(404);
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the digest of a normal night as JSON, sorted by job', async () => {
    const res = await get(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Digest;
    expect(body.night).toBe(NORMAL);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/build', 'mid/report', 'zeta/sync']);
    expect(body.rows[0]).toEqual({
      job: 'alpha/build',
      owner: 'kit',
      runs: 2,
      retries: 1,
      fails: 0,
      lastStatus: 'ok',
      lastError: 'timeout',
      firstAt: '2026-01-11T01:05:00+01:00',
      lastAt: '2026-01-11T01:15:00+01:00',
    });
    expect(body.rows[1]).toMatchObject({ job: 'mid/report', owner: null, fails: 1, lastError: 'disk full' });
  });

  it('returns no rows for an empty night', async () => {
    const res = await get(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: EMPTY, rows: [], badLines: 0 });
  });

  it('counts a bad line and keeps the good rows', async () => {
    const res = await get(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Digest;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['good/one', 'good/two']);
  });

  it('404s for a night with no file', async () => {
    expect((await get(`/api/digest/${MISSING}`)).status).toBe(404);
  });
});

describe('page and JSON agree', () => {
  it.each([NORMAL, BAD])('show the same jobs in the same order for %s', async (night) => {
    const html = await (await get(`/digest/${night}`)).text();
    const body = (await (await get(`/api/digest/${night}`)).json()) as Digest;
    expect(body.rows.length).toBeGreaterThan(0);
    expect(jobsInTable(html)).toEqual(body.rows.map((r) => r.job));
  });
});
