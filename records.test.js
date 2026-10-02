import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, LEVELS, seededRandom } from './game.js';
import { RULESET, STORAGE_KEY, MAX_RUNS, emptyArchive, mergeArchives, saveRecord, loadArchive, parseBackup, summarize, challengeHash, parseChallenge, validRecord } from './records.js';
const run = (extra = {}) => ({ rules: RULESET, id: 'run-1', at: 10000, level: 'normal', mode: 'solo', outcome: 'won', seconds: 100, progress: 100, seed: 123, first: 210, picks: ['scan', 'shield'], ...extra });
function disk() { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) }; }
test('current difficulties grow in size without dropping mine density', () => {
  const current = Object.values(LEVELS).filter(l => !l.legacy);
  assert.deepEqual(current.map(l => [l.rows * l.cols, l.mines]), [[256, 48], [400, 90], [576, 144], [900, 225]]);
  const density = current.map(l => l.mines / (l.rows * l.cols));
  assert.ok(density.every((value, i) => i === 0 || value >= density[i - 1]));
  assert.deepEqual([LEVELS.extreme.rows * LEVELS.extreme.cols, LEVELS.extreme.mines], [784, 220]);
});
test('results survive reload, duplicate saves do not inflate totals, completion replaces snapshots', () => {
  const storage = disk(); saveRecord(storage, run({ outcome: 'abandoned', progress: 30 }));
  saveRecord(storage, run()); saveRecord(storage, run());
  const a = loadArchive(storage); assert.equal(a.runs.length, 1); assert.equal(a.runs[0].outcome, 'won'); assert.equal(a.best.normal.seconds, 100);
  saveRecord(storage, run({ outcome: 'abandoned', progress: 30 })); assert.equal(loadArchive(storage).runs[0].outcome, 'won');
  saveRecord(storage, run({ outcome: 'interrupted', progress: 30, at: 20000 })); assert.equal(loadArchive(storage).runs[0].outcome, 'won');
});
test('solo personal bests exclude challenges and races, persist beyond 500 recent runs', () => {
  const records = [run(), run({ id: 'challenge', mode: 'challenge', seconds: 1 }), run({ id: 'race', mode: 'race', seconds: 2, progress: 45 })];
  for (let i = 0; i < 501; i++) records.push(run({ id: `loss-${i}`, at: 20000 + i, outcome: 'lost', progress: 20 }));
  const a = mergeArchives({ schema: 1, runs: records }); assert.equal(a.runs.length, MAX_RUNS); assert.equal(a.best.normal.seconds, 100);
  assert.equal(mergeArchives(a).best.normal.seconds, 100);
});
test('statistics separate modes and interruptions, count abandonment as a broken streak', () => {
  const a = mergeArchives({ schema: 1, runs: [run({ id: 'a', at: 4 }), run({ id: 'b', at: 3 }), run({ id: 'c', at: 2, outcome: 'abandoned' }), run({ id: 'd', at: 5, outcome: 'interrupted' }), run({ id: 'e', at: 6, mode: 'race' })] });
  assert.deepEqual(summarize(a), { played: 3, wins: 2, winRate: 67, streak: 2 }); assert.equal(summarize(a, 'race').wins, 1);
});
test('backup roundtrip merges without losing existing records or injecting fields', () => {
  const a = mergeArchives({ schema: 1, runs: [run()] }), b = mergeArchives({ schema: 1, runs: [run({ id: 'another', secret: 'discard' })] });
  const combined = mergeArchives(a, parseBackup(JSON.stringify(b))); assert.equal(combined.runs.length, 2); assert.equal(combined.runs[1].secret, undefined);
  assert.throws(() => parseBackup('{bad')); assert.throws(() => parseBackup(JSON.stringify({ schema: 1, runs: [run({ picks: ['<script>'] })], best: {} })));
});
test('corrupt or blocked storage fails gracefully and keeps results available in memory', () => {
  const s = disk(); s.setItem(STORAGE_KEY, '{bad'); assert.deepEqual(loadArchive(s), emptyArchive());
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  const result = saveRecord(blocked, run()); assert.equal(result.saved, false); assert.equal(result.archive.runs[0].id, 'run-1');
});
test('challenge links reproduce the exact opening and mine layout with a separate record mode', () => {
  const r = run(), parsed = parseChallenge(challengeHash(r)); assert.deepEqual(parsed, { level: 'normal', seed: 123, first: 210, target: 100 });
  const a = new Game(r.level, seededRandom(r.seed)), b = new Game(parsed.level, seededRandom(parsed.seed));
  a.reveal(r.first); b.reveal(parsed.first); assert.deepEqual(a.cells, b.cells); assert.equal(a.first, r.first);
  assert.equal(parseChallenge(challengeHash(run({ outcome: 'lost', progress: 60 }))).target, null);
  assert.equal(challengeHash(run({ mode: 'race' })), '');
});
test('invalid shared payloads and malformed records cannot enter the game or record list', () => {
  for (const hash of ['#challenge=wrong', '#challenge=' + 'a'.repeat(300), '#challenge=' + btoa(JSON.stringify([1, '__proto__', 0, 0, 0])), '#challenge=' + btoa(JSON.stringify([1, 'hard', 0, 999, 0]))]) assert.equal(parseChallenge(hash), null);
  for (const extra of [{ seconds: -1 }, { seed: 0x100000000 }, { level: 'constructor' }, { first: -1 }, { progress: 20 }, { rules: 'old' }, { picks: Array(5).fill('scan') }]) assert.equal(validRecord(run(extra)), false);
});
