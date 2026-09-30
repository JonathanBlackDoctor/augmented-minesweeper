import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, seededRandom, activateCell } from './game.js';
import { newRoom, joinRoom, readyRoom, settleRoom, roomCode, validCode, ROOM_TTL } from './match.js';
test('flag mode opens a correctly flagged number, but flags a closed cell', () => {
  const game = new Game('normal', seededRandom(10)); game.reveal(0);
  const index = game.cells.findIndex((c, i) => c.open && c.count && game.neighbors(i).some(n => !game.cells[n].mine && !game.cells[n].open));
  for (const n of game.neighbors(index).filter(n => game.cells[n].mine)) assert.equal(activateCell(game, n, 'flag'), 'flag');
  const before = game.opened;
  activateCell(game, index, 'flag');
  assert.ok(game.opened > before); assert.notEqual(game.state, 'lost');
});
test('flag mode does not open neighbors when flags do not match', () => {
  const g = new Game('normal', seededRandom(10)); g.reveal(0);
  const i = g.cells.findIndex(c => c.open && c.count);
  const before = JSON.stringify(g.cells); assert.equal(activateCell(g, i, 'flag'), 'noop');
  assert.equal(JSON.stringify(g.cells), before);
});
test('identical seeds and start cells produce identical multiplayer boards', () => {
  for (const level of ['easy', 'normal', 'hard']) {
    const a = new Game(level, seededRandom(78215)), b = new Game(level, seededRandom(78215));
    a.augment('shield'); b.augment('scan');
    const i = Math.floor(a.rows / 2) * a.cols + Math.floor(a.cols / 2);
    a.reveal(i); b.reveal(i); assert.deepEqual(a.cells, b.cells);
  }
});
test('rooms admit exactly one guest and reject expired, closed, or foreign rooms', () => {
  const r = newRoom('host', 'easy', 42, 100);
  assert.ok(joinRoom(r, 'guest', 101)); assert.equal(joinRoom(r, 'third', 102), undefined);
  const old = newRoom('host', 'easy', 42, 100);
  assert.equal(joinRoom(old, 'guest', ROOM_TTL + 101), undefined);
  old.meta.kind = 'apple'; assert.equal(joinRoom(old, 'guest', 110), undefined);
});
test('countdown starts only when both connected players choose valid augments', () => {
  const r = newRoom('a', 'easy', 42, 0); joinRoom(r, 'b', 0);
  assert.equal(readyRoom(r, 'a', 'invalid', 10), undefined);
  readyRoom(r, 'a', 'scan', 10); assert.equal(r.meta.phase, 'lobby');
  readyRoom(r, 'b', 'shield', 20); assert.equal(r.meta.phase, 'countdown'); assert.equal(r.meta.startAt, 3520);
  assert.equal(readyRoom(r, 'a', 'probe', 21), undefined);
});
test('race results are terminal, reject early and outsider claims, resolve losses', () => {
  const r = newRoom('a', 'easy', 42, 0); joinRoom(r, 'b', 0); readyRoom(r, 'a', 'scan', 0); readyRoom(r, 'b', 'shield', 0);
  assert.equal(settleRoom(r, 'a', 'clear', 100), undefined);
  assert.equal(settleRoom(r, 'c', 'clear', 5000), undefined);
  settleRoom(r, 'a', 'mine', 5000); assert.equal(r.outcome.winner, 'b');
  assert.equal(settleRoom(r, 'b', 'clear', 6000), undefined); assert.equal(r.outcome.at, 5000);
});
test('room codes normalize and exclude Firebase path characters', () => {
  assert.equal(roomCode('abcd ef23'), 'ABCDEF23'); assert.ok(validCode(roomCode('abcd ef23')));
  for (const code of ['../rooms', 'APPLE', 'AAAA/BBB', '12345678']) assert.equal(validCode(code), false);
});
