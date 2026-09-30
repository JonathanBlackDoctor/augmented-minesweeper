import './vendor/peerjs.min.js?v=4';
import { LEVELS } from './game.js?v=4';
import { newRoom, joinRoom, readyRoom, settleRoom, roomCode, validCode, ROOM_VERSION } from './match.js?v=4';

// The host serializes room changes; clients send only their own commands.
// PeerServer brokers WebRTC. No Firebase project is accessed.
export class OnlineRoom {
  constructor(onRoom, onConnection, onError) {
    this.onRoom = onRoom; this.onConnection = onConnection; this.onError = onError;
    this.offset = 0; this.connected = false; this.closed = false; this.lastProgress = -1;
    this.lastSeen = Date.now(); this.bestRtt = Infinity;
  }
  now() { return Date.now() + this.offset; }
  generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return [...crypto.getRandomValues(new Uint8Array(8))].map(n => chars[n % chars.length]).join('');
  }
  async open(code, level) {
    this.isHost = !code;
    this.code = code ? roomCode(code) : this.generateCode();
    if (!validCode(this.code)) throw new Error('방 코드는 영문·숫자 8자리입니다.');
    this.uid = this.isHost ? `${ROOM_VERSION}-${this.code}` : `mineshift-player-${crypto.randomUUID()}`;
    this.peer = new window.Peer(this.uid, { debug: 0 });
    return new Promise((resolve, reject) => {
      let settled = false;
      const succeed = () => { if (settled) return; settled = true; clearTimeout(this.openTimeout); resolve(this); };
      this.failOpen = error => {
        if (!settled) { settled = true; clearTimeout(this.openTimeout); reject(error); }
        else if (!this.closed) this.onError(error);
      };
      this.openTimeout = setTimeout(() => this.failOpen(new Error('연결 시간이 초과됐어요. 방 코드를 확인하거나 다른 네트워크에서 시도하세요.')), 20000);
      this.peer.on('open', () => {
        if (this.closed) return;
        if (this.isHost) {
          if (this.room) { this.connected = true; this.onConnection(true); this.publish(); return; }
          this.room = newRoom(this.uid, level, crypto.getRandomValues(new Uint32Array(1))[0], Date.now());
          this.connected = true; this.onConnection(true); this.publish(); succeed();
        } else {
          const conn = this.peer.connect(`${ROOM_VERSION}-${this.code}`, { reliable: true, serialization: 'json', metadata: { protocol: ROOM_VERSION } });
          this.bind(conn, succeed);
        }
      });
      this.peer.on('connection', conn => {
        if (!this.isHost || this.closed || this.conn || this.room?.meta.phase !== 'lobby' || conn.metadata?.protocol !== ROOM_VERSION) {
          conn.on('open', () => { conn.send({ t: 'reject' }); setTimeout(() => conn.close(), 100); }); return;
        }
        this.bind(conn, succeed);
      });
      this.peer.on('error', error => {
        const messages = { 'peer-unavailable': '방을 찾을 수 없어요. 코드와 방장 접속 상태를 확인하세요.', 'unavailable-id': '방 코드가 겹쳤어요. 다시 방을 만들어 주세요.', 'network': '연결 서버에 접속할 수 없어요. 네트워크를 확인하세요.' };
        this.failOpen(new Error(messages[error.type] || '기기 간 연결에 실패했어요. 다른 네트워크에서 시도해 주세요.'));
      });
      this.peer.on('disconnected', () => {
        if (!this.closed && !this.peer.destroyed) {
          if (!this.conn?.open) { this.connected = false; this.onConnection(false); }
          try { this.peer.reconnect(); } catch { /* Error UI remains available. */ }
        }
      });
      this.heartbeat = setInterval(() => {
        if (!this.conn?.open || this.closed) return;
        if (Date.now() - this.lastSeen > 30000) { this.conn.close(); return; }
        this.send({ t: 'ping', sent: Date.now() });
      }, 4000);
    });
  }
  bind(conn, succeed) {
    this.conn = conn;
    conn.on('open', () => {
      if (this.closed) { conn.close(); return; }
      this.lastSeen = Date.now();
      if (this.isHost) {
        const joined = joinRoom(this.room, conn.peer, Date.now());
        if (!joined) { this.send({ t: 'reject' }); setTimeout(() => conn.close(), 100); return; }
        this.connected = true; this.onConnection(true); this.publish();
      } else this.send({ t: 'ping', sent: Date.now() });
    });
    conn.on('data', message => {
      if (this.closed || !message || typeof message !== 'object') return;
      this.lastSeen = Date.now();
      if (message.t === 'reject') { this.failOpen(new Error('이미 두 명이 참가했거나 시작된 방입니다.')); return; }
      if (message.t === 'ping' && Number.isFinite(message.sent)) { this.send({ t: 'pong', sent: message.sent, at: Date.now() }); return; }
      if (message.t === 'pong' && Number.isFinite(message.sent) && Number.isFinite(message.at)) {
        const rtt = Date.now() - message.sent;
        if (!this.isHost && rtt >= 0 && rtt < this.bestRtt) { this.bestRtt = rtt; this.offset = message.at - (message.sent + Date.now()) / 2; }
        return;
      }
      if (this.isHost) this.command(message, conn.peer);
      else if (message.t === 'room' && this.validSnapshot(message.room)) {
        this.room = message.room; this.connected = true; this.onConnection(true); this.onRoom(structuredClone(this.room)); succeed();
      }
    });
    conn.on('close', () => this.connectionClosed(conn));
    conn.on('error', () => { this.onError(new Error('기기 간 연결이 불안정합니다.')); });
  }
  validSnapshot(room) {
    return room?.meta?.kind === ROOM_VERSION && LEVELS[room.meta.level] && Number.isInteger(room.meta.seed)
      && room.meta.hostUid === `${ROOM_VERSION}-${this.code}` && !!room.players?.[this.uid]
      && Object.keys(room.players).length <= 2 && ['lobby', 'countdown', 'finished', 'closed'].includes(room.meta.phase)
      && (room.meta.phase !== 'countdown' || Number.isFinite(room.meta.startAt));
  }
  send(message) { if (this.conn?.open) this.conn.send(message); }
  publish() { this.send({ t: 'room', room: this.room }); this.onRoom(structuredClone(this.room)); }
  command(message, uid) {
    if (!this.room?.players?.[uid]) return;
    if (message.t === 'ready') readyRoom(this.room, uid, message.choice, Date.now());
    else if (message.t === 'progress' && Number.isFinite(message.value) && ['playing', 'won', 'lost'].includes(message.status)) {
      Object.assign(this.room.players[uid], { progress: Math.max(0, Math.min(100, Math.floor(message.value))), status: message.status });
    } else if (message.t === 'terminal') settleRoom(this.room, uid, message.reason, Date.now());
    else if (message.t === 'leave') {
      if (this.room.meta.phase === 'lobby') {
        delete this.room.players[uid]; delete this.room.meta.guestUid;
        this.room.players[this.uid].ready = false;
      } else if (!this.room.outcome) {
        this.room.outcome = { winner: this.uid, reason: 'leave', at: Date.now() }; this.room.meta.phase = 'finished';
      }
    } else return;
    this.publish();
  }
  async ready(choice) {
    if (!this.connected) throw new Error('연결을 확인해 주세요.');
    if (this.isHost) { if (!readyRoom(this.room, this.uid, choice, Date.now())) throw new Error('이미 시작된 방입니다.'); this.publish(); }
    else this.send({ t: 'ready', choice });
  }
  async progress(value, status) {
    const integer = Math.floor(value);
    if (!this.connected || integer === this.lastProgress) return;
    this.lastProgress = integer;
    if (this.isHost) this.command({ t: 'progress', value: integer, status }, this.uid);
    else this.send({ t: 'progress', value: integer, status });
  }
  async settle(reason) {
    if (!this.connected) throw new Error('연결이 끊겼어요.');
    if (this.isHost) this.command({ t: 'terminal', reason }, this.uid);
    else this.send({ t: 'terminal', reason });
  }
  connectionClosed(conn) {
    if (this.closed || conn !== this.conn) return;
    this.conn = null;
    if (!this.room) { this.failOpen(new Error('방 연결이 종료됐어요. 다시 참가해 주세요.')); return; }
    if (this.room.outcome) return;
    if (this.isHost && this.room.meta.phase === 'lobby') {
      if (this.room.meta.guestUid) delete this.room.players[this.room.meta.guestUid];
      delete this.room.meta.guestUid; this.room.players[this.uid].ready = false;
      this.publish(); return;
    }
    this.room.outcome = { winner: '', reason: 'disconnect', at: this.now() };
    this.room.meta.phase = 'finished'; this.onRoom(structuredClone(this.room));
  }
  async close() {
    if (this.closed) return;
    if (this.room && !this.room.outcome && this.conn?.open) {
      if (this.isHost) {
        const waiting = this.room.meta.phase === 'lobby';
        this.room.outcome = { winner: waiting ? '' : this.room.meta.guestUid || '', reason: waiting ? 'disconnect' : 'leave', at: Date.now() };
        this.room.meta.phase = 'finished'; this.send({ t: 'room', room: this.room });
      } else this.send({ t: 'leave' });
    }
    this.closed = true; clearInterval(this.heartbeat); clearTimeout(this.openTimeout);
    setTimeout(() => { this.conn?.close(); this.peer?.destroy(); }, 150);
  }
}
