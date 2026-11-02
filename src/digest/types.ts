// Plan morning-digest § 1. The contract every part of § 2 builds against.
// The implementation lives in src/digest/read.ts: `export const readNight: ReadNight`.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job for the night. Times keep the log's offset.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type Digest = {
  night: string;
  // Sorted by job.
  rows: DigestRow[];
  // Lines that didn't parse: counted, never thrown.
  badLines: number;
};

// Returns null when runs/<night>.jsonl doesn't exist; an empty file gives rows: [].
export type ReadNight = (runsDir: string, night: string) => Digest | null;
