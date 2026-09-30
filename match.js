import { MODULES } from './augments.js';
import { LEVELS } from './game.js';
export const ROOM_VERSION = 'mineshift-v2';
export const ROOM_TTL = 2 * 60 * 60 * 1000;
export const AUGMENTS = MODULES.map(m => m.id);
export function roomCode(value) { return String(value).toUpperCase().replace(/[\s-]/g, ''); }
export function validCode(value) { return /^[A-HJ-NP-Z2-9]{8}$/.test(value); }
export function newRoom(uid, level, seed, now) {
  if (!LEVELS[level]) throw new Error('Invalid difficulty');
  return {
    meta: { kind: ROOM_VERSION, hostUid: uid, level, seed, createdAt: now, phase: 'lobby' },
    players: { [uid]: { ready: false, online: true, progress: 0, status: 'waiting' } },
  };
}
export function joinRoom(room, uid, now) {
  if (!room || room.meta?.kind !== ROOM_VERSION || room.meta.phase !== 'lobby' || now - room.meta.createdAt > ROOM_TTL) return;
  if (room.players?.[uid]) return room;
  if (room.meta.guestUid || !room.players?.[room.meta.hostUid]?.online) return;
  room.meta.guestUid = uid;
  room.players[uid] = { ready: false, online: true, progress: 0, status: 'waiting' };
  return room;
}
export function readyRoom(room, uid, choice, now) {
  if (!room?.players?.[uid] || room.meta.phase !== 'lobby' || !AUGMENTS.includes(choice)) return;
  Object.assign(room.players[uid], { ready: true, choice });
  const players = Object.values(room.players);
  if (players.length === 2 && players.every(p => p.ready && p.online)) {
    room.meta.phase = 'countdown';
    room.meta.startAt = now + 3500;
  }
  return room;
}
export function settleRoom(room, uid, reason, now) {
  if (!room?.players?.[uid] || room.outcome || room.meta.phase !== 'countdown' || now < room.meta.startAt || !['clear', 'mine', 'leave'].includes(reason)) return;
  const other = Object.keys(room.players).find(id => id !== uid);
  if (!other) return;
  room.outcome = { winner: reason === 'clear' ? uid : other, reason, at: now };
  room.meta.phase = 'finished';
  return room;
}
