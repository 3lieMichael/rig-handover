import { describe, expect, it } from 'vitest';
import { countsOf } from '../src/digest/counts.js';
import { digestOf, readNight } from '../src/digest/read.js';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('countsOf', () => {
  it('splits parsed lines into ok / retry / fail', () => {
    const text = [
      '{"at":"2026-10-28T01:00:00+01:00","job":"a","status":"ok","owner":null}',
      '{"at":"2026-10-28T01:01:00+01:00","job":"a","status":"retry","owner":null}',
      '{"at":"2026-10-28T01:02:00+01:00","job":"b","status":"fail","owner":null}',
      'not json',
    ].join('\n');
    expect(countsOf(digestOf('2026-10-28', text))).toEqual({ ok: 1, retry: 1, fail: 1 });
  });

  it('is zero for an empty night', () => {
    expect(countsOf({ night: '2026-10-28', rows: [], badLines: 0 })).toEqual({ ok: 0, retry: 0, fail: 0 });
  });

  it('matches the nights in runs/', () => {
    expect(countsOf(readNight('runs', '2026-10-27')!)).toEqual({ ok: 7, retry: 0, fail: 0 });
    expect(countsOf(readNight('runs', '2026-10-28')!)).toEqual({ ok: 10, retry: 4, fail: 1 });
  });
});

describe('status board nights', () => {
  it('links each night to its digest with its counts', async () => {
    const html = await (await createApp(config).request('/')).text();
    expect(html).toContain('href="/digest/2026-10-27"');
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('ok 7 · retry 0 · fail 0');
    expect(html).toContain('ok 10 · retry 4 · fail 1');
  });
});
