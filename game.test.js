import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, LEVELS } from './game.js';
function random(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }

test('all levels preserve mine counts, safe opening, and neighbor numbers', () => {
  for (const level of Object.keys(LEVELS)) for (let seed = 1; seed <= 30; seed++) {
    const g = new Game(level, random(seed));
    const first = seed * 13 % g.cells.length;
    g.reveal(first);
    assert.equal(g.cells.filter(c => c.mine).length, g.mines);
    assert.ok([first, ...g.neighbors(first)].every(i => !g.cells[i].mine));
    assert.ok(g.cells[first].open);
    g.cells.forEach((c, i) => assert.equal(c.count, g.neighbors(i).filter(n => g.cells[n].mine).length));
  }
});
test('flags toggle before start, block reveal, and do not plant mines', () => {
  const g = new Game(); g.flag(0); assert.equal(g.reveal(0), 'noop'); assert.equal(g.started, false);
  g.flag(0); g.reveal(0); assert.equal(g.started, true); assert.equal(g.flag(0), false);
});
test('unprotected mine loses and terminal boards cannot change', () => {
  const g = new Game('easy', random(1)); g.reveal(0);
  const mine = g.cells.findIndex(c => c.mine); assert.equal(g.reveal(mine), 'lost');
  const copy = JSON.stringify(g.cells); g.flag(80); g.reveal(80); g.chord(0);
  assert.equal(JSON.stringify(g.cells), copy); assert.equal(g.scan(0), false);
});
test('shield consumes once, marks the mine, and second mine loses', () => {
  const g = new Game('normal', random(2)); g.augment('shield'); g.reveal(0);
  const mines = g.cells.map((c, i) => c.mine ? i : -1).filter(i => i >= 0);
  assert.equal(g.reveal(mines[0]), 'shield'); assert.equal(g.shields, 0);
  assert.equal(g.cells[mines[0]].flag, true); assert.equal(g.state, 'playing');
  assert.equal(g.reveal(mines[1]), 'lost');
});
test('scanner has finite charges and never reveals cells', () => {
  const g = new Game('normal', random(4)); g.augment('scan'); assert.equal(g.scan(20), false);
  g.reveal(0); const opened = g.opened;
  assert.equal(g.scan(61), true); assert.equal(g.cells.filter(c => c.scanned).length, 9);
  assert.equal(g.opened, opened); assert.equal(g.scans, 1);
  assert.equal(g.scan(61), false); assert.equal(g.scans, 1);
  const fresh = g.cells.findIndex(c => !c.open && !c.scanned);
  g.scan(fresh); assert.equal(g.scans, 0); assert.equal(g.scan(10), false);
});
test('drone opens only safe cells and consumes charges', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = new Game('hard', random(seed)); g.augment('probe'); g.reveal(0);
    const opened = g.opened; assert.equal(g.probe(), true); assert.ok(g.opened > opened);
    assert.equal(g.cells.some(c => c.mine && c.open), false); assert.equal(g.probes, 0); assert.equal(g.probe(), false);
  }
});
test('opening every safe cell wins without needing flags', () => {
  const g = new Game('normal', random(7)); g.reveal(0);
  g.cells.forEach((c, i) => { if (!c.mine) g.reveal(i); });
  assert.equal(g.state, 'won'); assert.equal(g.progress, 1);
});
test('correct chords expand while wrong flags can trigger a mine', () => {
  const g = new Game('normal', random(10)); g.reveal(0);
  const i = g.cells.findIndex((c, i) => c.open && c.count && g.neighbors(i).some(n => !g.cells[n].mine && !g.cells[n].open));
  assert.ok(i >= 0); const around = g.neighbors(i);
  around.filter(n => g.cells[n].mine).forEach(n => g.flag(n));
  const before = g.opened; g.chord(i); assert.ok(g.opened > before); assert.notEqual(g.state, 'lost');
  const bad = new Game('normal', random(10)); bad.reveal(0);
  const neighbors = bad.neighbors(i), mines = neighbors.filter(n => bad.cells[n].mine), safe = neighbors.find(n => !bad.cells[n].mine && !bad.cells[n].open);
  mines.slice(1).forEach(n => bad.flag(n)); bad.flag(safe); bad.chord(i); assert.equal(bad.state, 'lost');
});
test('stacked augments replenish and invalid inputs are inert', () => {
  const g = new Game(); g.augment('scan'); g.augment('scan'); assert.equal(g.scans, 4);
  assert.equal(g.augment('unknown'), false); assert.equal(g.reveal(-1), 'noop'); assert.equal(g.flag(9999), false);
});
