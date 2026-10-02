import { MODULES } from './augments.js?v=6';
export const LEVELS = {
  easy: { name: '탐사', rows: 16, cols: 16, mines: 48 },
  normal: { name: '심층', rows: 20, cols: 20, mines: 90 },
  hard: { name: '심연', rows: 24, cols: 24, mines: 144 },
  // Kept for old records/challenge links created before the board rebalance.
  extreme: { name: '특이점 (이전)', rows: 28, cols: 28, mines: 220, legacy: true },
  singularity: { name: '특이점', rows: 30, cols: 30, mines: 200 },
};

// Separate random streams keep identical multiplayer boards independent of abilities.
export function seededRandom(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

export function activateCell(game, index, mode = 'reveal') {
  if (MODULES.some(m => m.id === mode && m.target)) return game.usePower(mode, index) ? mode : 'noop';
  if (game.cells[index]?.open) return game.chord(index);
  // The very first primary click always opens the board, even in flag mode.
  if (!game.started) return game.reveal(index);
  if (mode === 'flag') return game.flag(index) ? 'flag' : 'noop';
  return game.reveal(index);
}

export class Game {
  constructor(level = 'easy', rng = Math.random) {
    Object.assign(this, LEVELS[level]);
    this.level = level;
    this.rng = rng;
    this.cells = Array.from({ length: this.rows * this.cols }, () => ({ mine: false, open: false, flag: false, scanned: false, count: 0 }));
    this.state = 'ready';
    for (const m of MODULES) this[m.resource] = 0;
    this.equipped = new Set();
    this.started = false;
    this.saved = 0;
  }
  neighbors(i) {
    const row = Math.floor(i / this.cols), col = i % this.cols, result = [];
    for (let r = row - 1; r <= row + 1; r++) for (let c = col - 1; c <= col + 1; c++) {
      if (r >= 0 && r < this.rows && c >= 0 && c < this.cols && (r !== row || c !== col)) result.push(r * this.cols + c);
    }
    return result;
  }
  seed(first) {
    this.first = first;
    const safe = new Set([first, ...this.neighbors(first)]);
    const available = this.cells.map((_, i) => i).filter(i => !safe.has(i));
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    for (const i of available.slice(0, this.mines)) this.cells[i].mine = true;
    this.cells.forEach((c, i) => { c.count = this.neighbors(i).filter(n => this.cells[n].mine).length; });
    this.started = true;
    this.state = 'playing';
  }
  get flags() { return this.cells.filter(c => c.flag).length; }
  get opened() { return this.cells.filter(c => c.open && !c.mine).length; }
  get safeTotal() { return this.cells.length - this.mines; }
  get progress() { return this.opened / this.safeTotal; }
  flag(i) {
    const c = this.cells[i];
    if (!c || c.open || ['won', 'lost'].includes(this.state)) return false;
    if (!c.flag && this.flags >= this.mines) return false;
    c.flag = !c.flag;
    return true;
  }
  reveal(i) {
    const cell = this.cells[i];
    if (!cell || cell.flag || cell.open || ['won', 'lost'].includes(this.state)) return 'noop';
    if (!this.started) this.seed(i);
    if (cell.mine) {
      if (this.shields > 0) {
        this.shields--;
        this.saved++;
        cell.scanned = true;
        cell.flag = true;
        return 'shield';
      }
      cell.open = true;
      this.state = 'lost';
      return 'lost';
    }
    const queue = [i];
    while (queue.length) {
      const index = queue.pop(), c = this.cells[index];
      if (c.open || c.flag || c.mine) continue;
      c.open = true;
      if (!c.count) queue.push(...this.neighbors(index).filter(n => !this.cells[n].open));
    }
    if (this.opened === this.safeTotal) this.state = 'won';
    return this.state === 'won' ? 'won' : 'open';
  }
  chord(i) {
    const cell = this.cells[i];
    if (!cell?.open || cell.mine || this.state !== 'playing') return 'noop';
    const around = this.neighbors(i);
    if (around.filter(n => this.cells[n].flag).length !== cell.count) return 'noop';
    let result = 'noop';
    for (const n of around) {
      const action = this.reveal(n);
      if (action !== 'noop') result = action;
      if (this.state !== 'playing') break;
    }
    return result;
  }
  resolveKnown(indices) {
    if (this.state !== 'playing') return false;
    const targets = [...new Set(indices)].filter(i => this.cells[i] && (!this.cells[i].open || this.cells[i].flag));
    if (!targets.length) return false;
    // Mark every resolved mine first so cascades can never obscure the information.
    for (const i of targets) {
      const c = this.cells[i];
      c.scanned = true;
      if (c.mine) c.flag = true;
      else if (c.flag) c.flag = false;
    }
    for (const i of targets) {
      const c = this.cells[i];
      if (!c.mine && !c.open && this.state === 'playing') this.reveal(i);
    }
    return true;
  }
  scan(i) {
    if (this.state !== 'playing' || this.scans <= 0 || !this.cells[i]) return false;
    const targets = [i, ...this.neighbors(i)];
    if (!targets.some(n => !this.cells[n].open && !this.cells[n].scanned)) return false;
    this.scans--;
    return this.resolveKnown(targets);
  }
  probe() {
    if (this.state !== 'playing' || this.probes <= 0) return false;
    const safe = this.cells.map((c, i) => !c.mine && !c.flag && !c.open ? i : -1).filter(i => i >= 0);
    if (!safe.length) return false;
    this.probes--;
    for (let n = 0; n < 3 && safe.length && this.state === 'playing'; n++) {
      const j = Math.floor(this.rng() * safe.length);
      this.reveal(safe.splice(j, 1)[0]);
      for (let k = safe.length - 1; k >= 0; k--) if (this.cells[safe[k]].open) safe.splice(k, 1);
    }
    return true;
  }
  augment(id) {
    const m = MODULES.find(m => m.id === id);
    if (!m) return false;
    this[m.resource] += m.amount;
    this.equipped.add(id);
    return true;
  }
  usePower(id, index) {
    const m = MODULES.find(m => m.id === id);
    if (!m || id === 'shield' || this.state !== 'playing' || this[m.resource] <= 0) return false;
    if (m.target && (!Number.isInteger(index) || !this.cells[index])) return false;
    if (id === 'scan') return this.scan(index);
    if (id === 'probe') return this.probe();
    let targets = [];
    if (id === 'row' || id === 'column') {
      targets = this.cells.map((_, i) => i).filter(i => id === 'row' ? Math.floor(i / this.cols) === Math.floor(index / this.cols) : i % this.cols === index % this.cols);
      targets = targets.filter(i => !this.cells[i].open && !this.cells[i].scanned);
    } else if (id === 'defuse') {
      if (!this.cells[index].open && !this.cells[index].flag) targets = [index];
    } else if (id === 'hunter') {
      targets = this.cells.map((c, i) => c.mine && !c.flag ? i : -1).filter(i => i >= 0).slice(0, 2);
    } else if (id === 'audit') {
      targets = this.cells.map((c, i) => c.flag && (!c.scanned || !c.mine) ? i : -1).filter(i => i >= 0);
    } else if (id === 'breach') {
      targets = [index, ...this.neighbors(index)].filter(i => !this.cells[i].mine && !this.cells[i].open && !this.cells[i].flag);
    } else if (id === 'echo') {
      targets = this.cells.map((c, i) => !c.open && !c.scanned && this.neighbors(i).some(n => this.cells[n].open) ? i : -1).filter(i => i >= 0).slice(0, 5);
    }
    if (!targets.length) return false;
    this[m.resource]--;
    if (id !== 'breach') return this.resolveKnown(targets);
    let opened = 0;
    for (const i of targets) {
      const c = this.cells[i];
      if (!c.open && opened < 5) { this.reveal(i); opened++; }
    }
    return true;
  }
}
