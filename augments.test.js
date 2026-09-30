import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, augmentChoices } from './augments.js';
import { Game, seededRandom, activateCell } from './game.js';
import { newRoom, joinRoom, readyRoom } from './match.js';
function board() { const g = new Game('hard', seededRandom(10)); g.reveal(0); return g; }

test('10 distinct augments stack, equip once and preserve board generation', () => {
  assert.equal(MODULES.length, 10); assert.equal(new Set(MODULES.map(m => m.id)).size, 10);
  for (const m of MODULES) {
    const g = new Game('hard', seededRandom(10));
    g.augment(m.id); g.augment(m.id);
    assert.equal(g[m.resource], m.amount * 2); assert.equal(g.equipped.size, 1);
    assert.equal(g.usePower(m.id, 0), false);
    g.reveal(0); assert.deepEqual(g.cells, board().cells);
  }
});
test('drafts offer three unique candidates, vary and are identical for both players', () => {
  const seen = new Set(), offers = new Set();
  for (let seed = 0; seed < 100; seed++) for (let tier = 0; tier < 4; tier++) {
    const a = augmentChoices(seed, tier).map(m => m.id);
    assert.equal(new Set(a).size, 3); assert.deepEqual(a, augmentChoices(seed, tier).map(m => m.id));
    a.forEach(id => seen.add(id)); offers.add(a.join(','));
  }
  assert.equal(seen.size, 10); assert.ok(offers.size > 50);
});
test('row and column radar cover exactly one line and repeat use is free', () => {
  for (const id of ['row', 'column']) {
    const g = board(); g.augment(id); const before = g.opened, i = 136;
    assert.equal(activateCell(g, i, id), id);
    for (let n = 0; n < g.cells.length; n++) {
      const inLine = id === 'row' ? Math.floor(n / g.cols) === 8 : n % g.cols === 8;
      assert.equal(g.cells[n].scanned, inLine && !g.cells[n].open);
    }
    assert.equal(g.opened, before); g.augment(id);
    assert.equal(g.usePower(id, i), false); assert.equal(g[MODULES.find(m => m.id === id).resource], 1);
  }
});
test('defuser safely resolves a mine and safe cell without changing mine layout or shields', () => {
  const g = board(); g.augment('defuse'); g.augment('shield');
  const mines = g.cells.map(c => c.mine), mine = g.cells.findIndex(c => c.mine);
  const safe = g.cells.findIndex(c => !c.mine && !c.open);
  assert.equal(g.usePower('defuse', mine), true); assert.equal(g.cells[mine].flag, true);
  assert.equal(g.usePower('defuse', mine), false); assert.equal(g.defusers, 1);
  assert.equal(g.usePower('defuse', safe), true); assert.equal(g.cells[safe].open, true);
  assert.equal(g.shields, 1); assert.equal(g.defusers, 0); assert.notEqual(g.state, 'lost');
  assert.deepEqual(g.cells.map(c => c.mine), mines);
});
test('hunter confirms two actual mines and never opens cells', () => {
  const g = board(); g.augment('hunter'); const before = g.opened;
  assert.equal(g.usePower('hunter'), true); assert.equal(g.flags, 2);
  assert.ok(g.cells.filter(c => c.flag).every(c => c.mine && c.scanned)); assert.equal(g.opened, before);
  g.cells.forEach(c => { if (c.mine) c.flag = true; }); g.augment('hunter');
  assert.equal(g.usePower('hunter'), false); assert.equal(g.hunters, 1);
});
test('audit preserves correct flags, removes wrong flags and confirms both', () => {
  const g = board(); g.augment('audit'); assert.equal(g.usePower('audit'), false);
  const mine = g.cells.findIndex(c => c.mine), safe = g.cells.findIndex(c => !c.mine && !c.open);
  g.flag(mine); g.flag(safe); const before = g.opened;
  assert.equal(g.usePower('audit'), true); assert.equal(g.cells[mine].flag, true);
  assert.equal(g.cells[safe].flag, false); assert.equal(g.cells[safe].scanned, true);
  assert.equal(g.opened, before); assert.equal(g.audits, 1);
  assert.equal(g.usePower('audit'), false); assert.equal(g.audits, 1);
});
test('breach opens safe neighbors without harming flags or mines and can finish a board', () => {
  const g = board(); g.augment('breach');
  const i = g.cells.findIndex(c => !c.mine && !c.open); const before = g.opened;
  assert.equal(g.usePower('breach', i), true); assert.ok(g.opened > before);
  assert.ok(g.cells.every(c => !c.mine || !c.open)); assert.equal(g.breaches, 0);
  const last = g.cells.findIndex(c => !c.mine && !c.open); g.flag(last);
  g.cells.forEach((c, n) => { if (!c.mine && n !== last) g.reveal(n); });
  g.augment('breach'); assert.equal(g.usePower('breach', last), false); assert.equal(g.breaches, 1);
  g.flag(last); assert.equal(g.usePower('breach', last), true); assert.equal(g.state, 'won');
});
test('echo marks at most five frontier cells without opening or flagging them', () => {
  const g = board(); g.augment('echo'); const before = g.opened;
  assert.equal(g.usePower('echo'), true);
  const marked = g.cells.map((c, i) => c.scanned ? i : -1).filter(i => i >= 0);
  assert.equal(marked.length, 5); assert.ok(marked.every(i => !g.cells[i].open && g.neighbors(i).some(n => g.cells[n].open)));
  assert.equal(g.opened, before); assert.equal(g.flags, 0); assert.equal(g.echoes, 1);
});
test('all powers reject invalid targets and terminal boards without spending charges', () => {
  for (const m of MODULES) {
    const g = board(); g.augment(m.id);
    if (m.target) for (const invalid of [-1, 999, undefined, 1.5]) assert.equal(g.usePower(m.id, invalid), false);
    g.reveal(g.cells.findIndex(c => c.mine));
    if (m.id === 'shield') g.reveal(g.cells.findIndex(c => c.mine && !c.flag));
    const before = JSON.stringify(g); assert.equal(g.usePower(m.id, 10), false); assert.equal(JSON.stringify(g), before);
  }
});
test('all 10 augments are accepted for multiplayer readiness', () => {
  for (const m of MODULES) {
    const room = newRoom('a', 'hard', 123, 0); joinRoom(room, 'b', 0);
    readyRoom(room, 'a', m.id, 1); readyRoom(room, 'b', m.id, 2);
    assert.equal(room.meta.phase, 'countdown'); assert.equal(room.players.a.choice, m.id);
  }
});
