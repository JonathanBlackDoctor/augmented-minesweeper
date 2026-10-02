import { LEVELS } from './game.js?v=7';
import { MODULES } from './augments.js?v=7';

export const RULESET = 'expanded-1';
export const STORAGE_KEY = 'mineshift-records-v3';
export const MAX_RUNS = 500;
export const OUTCOMES = { won: '승리', lost: '패배', abandoned: '중도 종료', interrupted: '연결 중단' };
export const MODES = { solo: '솔로', challenge: '친구 도전', race: '1대1 대전' };
export const formatTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
const own = (object, key) => Object.hasOwn(object, key);
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

export function validRecord(r) {
  return r && r.rules === RULESET && typeof r.id === 'string' && /^[\w-]{1,80}$/.test(r.id)
    && own(LEVELS, r.level) && own(OUTCOMES, r.outcome) && own(MODES, r.mode)
    && integer(r.at, 0, 8640000000000000) && integer(r.seconds, 0, 604800)
    && integer(r.seed, 0, 0xffffffff) && integer(r.first, 0, LEVELS[r.level].rows * LEVELS[r.level].cols - 1)
    && integer(r.progress, 0, 100) && (r.outcome !== 'won' || r.mode === 'race' || r.progress === 100)
    && Array.isArray(r.picks) && r.picks.length <= 4 && r.picks.every(id => MODULES.some(m => m.id === id));
}
function clean(r) {
  return { rules: RULESET, id: r.id, level: r.level, outcome: r.outcome, mode: r.mode, at: r.at, seconds: r.seconds, seed: r.seed, first: r.first, progress: r.progress, picks: [...r.picks] };
}
export function emptyArchive() { return { schema: 1, runs: [], best: {} }; }
export function mergeArchives(...archives) {
  const byId = new Map(), best = {};
  for (const archive of archives) {
    if (archive?.schema !== 1 || !Array.isArray(archive.runs)) continue;
    for (const record of [...archive.runs, ...Object.values(archive.best || {})]) {
      if (!validRecord(record)) continue;
      const r = clean(record);
      // Finished results take precedence over the same run's interruption snapshot.
      const old = byId.get(r.id);
      const terminal = value => value && ['won', 'lost'].includes(value.outcome);
      if (!old || (!terminal(old) && terminal(r)) || (terminal(old) === terminal(r) && r.at >= old.at)) byId.set(r.id, r);
      if (r.mode === 'solo' && r.outcome === 'won' && (!best[r.level] || r.seconds < best[r.level].seconds)) best[r.level] = r;
    }
  }
  return { schema: 1, runs: [...byId.values()].sort((a, b) => b.at - a.at).slice(0, MAX_RUNS), best };
}
export function loadArchive(storage) {
  try { return mergeArchives(JSON.parse(storage.getItem(STORAGE_KEY))); } catch { return emptyArchive(); }
}
export function saveRecord(storage, record, archive = loadArchive(storage)) {
  if (!validRecord(record)) throw new Error('유효하지 않은 기록입니다.');
  const next = mergeArchives(archive, { schema: 1, runs: [record] });
  try { storage.setItem(STORAGE_KEY, JSON.stringify(next)); return { archive: next, saved: true }; }
  catch { return { archive: next, saved: false }; }
}
export function parseBackup(text) {
  if (text.length > 2000000) throw new Error('백업 파일이 너무 큽니다.');
  const data = JSON.parse(text);
  if (data?.schema !== 1 || !Array.isArray(data.runs) || data.runs.length > MAX_RUNS || !data.runs.every(validRecord)
    || !data.best || !Object.values(data.best).every(validRecord)) throw new Error('MINE / SHIFT 기록 백업 파일이 아닙니다.');
  return mergeArchives(data);
}
export function summarize(archive, mode = 'solo') {
  const runs = archive.runs.filter(r => r.mode === mode && r.outcome !== 'interrupted');
  const wins = runs.filter(r => r.outcome === 'won').length;
  let streak = 0;
  for (const r of runs) { if (r.outcome !== 'won') break; streak++; }
  return { played: runs.length, wins, winRate: runs.length ? Math.round(wins / runs.length * 100) : 0, streak };
}
export function challengeHash(record) {
  if (!validRecord(record) || record.mode === 'race') return '';
  // Only the seed, opening and public result are shared, never the mine positions.
  const payload = [1, record.level, record.seed, record.first, record.outcome === 'won' ? record.seconds : null];
  return '#challenge=' + btoa(JSON.stringify(payload)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function parseChallenge(hash) {
  try {
    const match = /^#challenge=([A-Za-z0-9_-]{1,250})$/.exec(hash);
    if (!match) return null;
    const data = JSON.parse(atob(match[1].replaceAll('-', '+').replaceAll('_', '/')));
    if (!Array.isArray(data) || data.length !== 5) return null;
    const [version, level, seed, first, target] = data;
    if (version !== 1 || !own(LEVELS, level) || !integer(seed, 0, 0xffffffff)
      || !integer(first, 0, LEVELS[level].rows * LEVELS[level].cols - 1) || (target !== null && !integer(target, 0, 604800))) return null;
    return { level, seed, first, target };
  } catch { return null; }
}
