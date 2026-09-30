import { Game, LEVELS, seededRandom, activateCell } from './game.js';
const $ = id => document.getElementById(id);
import { MODULES as modules, augmentChoices } from './augments.js';
let draftSeed = 0;
let game, mode = 'reveal', pendingLevel = 'easy', earned = 0, picked = 0, startedAt = 0, elapsed = 0, finished = false, focusIndex = 0;
let race = null, joining = false;
const canAct = () => !finished && (!race || (race.started && race.client.connected && !race.pendingTerminal && !race.room?.outcome));
const thresholds = [.25, .55, .8];
const formatTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
function readBest(level) {
  try { const value = localStorage.getItem(`mineshift-best-v1-${level}`); return value !== null && /^\d+$/.test(value) ? Number(value) : null; } catch { return null; }
}
function updateBest() { const best = readBest(game.level); $('best').textContent = best === null ? '아직 기록이 없어요' : formatTime(best); }
function tell(message) { $('notice').textContent = message; }
function setMode(next) {
  mode = next;
  $('reveal-mode').classList.toggle('active', mode === 'reveal');
  $('flag-mode').classList.toggle('active', mode === 'flag');
  $('reveal-mode').setAttribute('aria-pressed', String(mode === 'reveal'));
  $('flag-mode').setAttribute('aria-pressed', String(mode === 'flag'));
  $('board').classList.toggle('scanning', modules.some(m => m.id === mode && m.target));
}
function start(level = 'easy', options = {}) {
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  game = new Game(level, options.seed === undefined ? Math.random : seededRandom(options.seed));
  draftSeed = options.seed ?? crypto.getRandomValues(new Uint32Array(1))[0];
  earned = picked = elapsed = startedAt = 0;
  finished = false;
  focusIndex = 0;
  setMode('reveal');
  $('timer').textContent = '00:00';
  $('board').style.setProperty('--cols', game.cols);
  $('board').classList.toggle('dense', game.cols > 9);
  $('board').replaceChildren(...game.cells.map((_, i) => {
    const button = document.createElement('button');
    button.className = 'cell';
    button.dataset.index = i;
    button.tabIndex = i === 0 ? 0 : -1;
    return button;
  }));
  document.querySelectorAll('[data-level]').forEach(b => { b.classList.toggle('selected', b.dataset.level === level); b.setAttribute('aria-pressed', String(b.dataset.level === level)); });
  updateBest(); render(); fitBoard();
  if (options.seed === undefined) chooseAugment(true);
}
function render() {
  [...$('board').children].forEach((button, i) => {
    const c = game.cells[i], showMine = c.mine && (c.open || finished || c.scanned), wrong = finished && c.flag && !c.mine;
    button.className = ['cell', c.open ? 'open' : '', c.open && !c.count && !c.mine ? 'zero' : '', c.flag ? 'flag' : '', showMine ? (finished ? 'mine' : 'danger') : '', c.scanned ? 'scanned' : ''].filter(Boolean).join(' ');
    button.dataset.number = c.open && !c.mine ? c.count : '';
    button.textContent = wrong ? '×' : showMine ? '✳' : c.flag ? '⚑' : c.open ? (c.count || '') : c.scanned ? '·' : '';
    const label = wrong ? '잘못 표시한 깃발' : showMine ? '지뢰' : c.flag ? '깃발' : c.open ? (c.count ? `주변 지뢰 ${c.count}개` : '빈칸') : c.scanned ? '안전한 칸' : '닫힌 칸';
    button.setAttribute('aria-label', `${Math.floor(i / game.cols) + 1}행 ${i % game.cols + 1}열, ${label}`);
  });
  $('mines').textContent = Math.max(0, game.mines - game.flags);
  $('progress').textContent = Math.floor(game.progress * 100);
  $('start-hint').innerHTML = game.started ? `<span>✦</span> ${game.opened} / ${game.safeTotal}개의 안전한 칸 탐사` : '<span>✦</span> 첫 번째 칸은 언제나 안전합니다';
  $('augment-count').textContent = `${game.equipped.size}종 장착`;
  $('loadout').innerHTML = modules.filter(m => game.equipped.has(m.id)).map(m => {
    const count = game[m.resource];
    return `<div class="module" title="${m.desc}"><span class="module-symbol">${m.symbol}</span><div class="module-info"><h3>${m.name}</h3><p>${m.short}</p></div>${m.id === 'shield' ? `<span class="passive">× ${count}</span>` : `<button data-power="${m.id}" ${!count || game.state !== 'playing' || !canAct() ? 'disabled' : ''} aria-label="${m.name} 사용, ${count}회 남음">사용 ${count}</button>`}</div>`;
  }).join('') || '<p class="empty-loadout">10종의 증강으로 나만의 조합을 만드세요.</p>';
  const target = thresholds[earned];
  $('next-label').textContent = target ? `탐사율 ${Math.round(target * 100)}%` : '증강 선택 완료';
  $('next-bar').style.width = `${target ? Math.min(100, game.progress / target * 100) : 100}%`;
}
function chooseAugment(initial = false) {
  $('augment-title').textContent = initial ? '당신의 첫 번째 가능성.' : '한계를 넘어, 한 단계 더.';
  $('augment-copy').textContent = initial ? '이번 탐사를 함께할 증강 하나를 선택하세요.' : `탐사율 ${Math.round(thresholds[earned - 1] * 100)}% 달성! 능력을 추가하세요.`;
  $('choices').innerHTML = augmentChoices(draftSeed, earned).map(m => `<button class="choice" data-augment="${m.id}"><span class="choice-symbol">${m.symbol}</span><small>${m.type}</small><h3>${m.name}</h3><p>${m.desc}</p><span class="choice-footer">${m.gain} <span aria-hidden="true">↗</span></span></button>`).join('');
  $('augment-dialog').showModal();
}
function afterAction(result) {
  if (game.started && !startedAt) startedAt = performance.now();
  if (result === 'shield') tell('보호막 작동! 지뢰를 막고 해당 칸에 깃발을 꽂았어요.');
  else if (result !== 'noop') tell(mode === 'scan' ? '스캔할 구역의 중심 칸을 선택하세요.' : '숫자를 따라 안전한 칸을 찾아보세요.');
  if (race) race.client.progress(game.progress * 100, game.state).catch(() => tell('진행도 전송을 재시도합니다.'));
  if (game.state === 'won' || game.state === 'lost') finish();
  else if (thresholds[earned] && game.progress >= thresholds[earned] && !$('augment-dialog').open) { earned++; chooseAugment(); }
  render();
}
function finish() {
  if (finished) return;
  if (race) {
    race.pendingTerminal = game.state === 'won' ? 'clear' : 'mine';
    sendRaceResult(); render(); return;
  }
  finished = true;
  elapsed = startedAt ? Math.floor((performance.now() - startedAt) / 1000) : 0;
  $('timer').textContent = formatTime(elapsed);
  const won = game.state === 'won';
  let record = false;
  if (won) {
    const previous = readBest(game.level);
    if (previous === null || elapsed < previous) {
      try { localStorage.setItem(`mineshift-best-v1-${game.level}`, String(elapsed)); record = true; } catch { /* Private mode can disable storage. */ }
    }
    updateBest();
  }
  $('result-icon').textContent = won ? '✦' : '✳';
  $('result-icon').style.color = won ? 'var(--lime)' : '#f0a0a0';
  $('result-kicker').textContent = won ? 'EXPEDITION COMPLETE' : 'SIGNAL LOST';
  $('result-title').textContent = won ? '모든 가능성을 열었어요.' : '이번 탐사는 여기까지.';
  $('result-copy').textContent = `${LEVELS[game.level].name} · ${formatTime(elapsed)} · 탐사율 ${Math.floor(game.progress * 100)}%${record ? ' · 새로운 최고 기록!' : ''}`;
  tell(won ? '탐사 성공! 모든 안전한 칸을 열었습니다.' : '지뢰를 밟았어요. 새로운 증강 조합으로 다시 도전해 보세요.');
  $('result-dialog').showModal();
}
function requestRestart(level) {
  if (race) { tell('대전 중에는 난이도를 바꿀 수 없어요. 방을 나간 뒤 새 방을 만들어 주세요.'); return; }
  pendingLevel = level;
  if (game.state === 'playing') $('confirm-dialog').showModal();
  else start(level);
}
$('choices').addEventListener('click', e => {
  const button = e.target.closest('[data-augment]'); if (!button) return;
  game.augment(button.dataset.augment); picked++;
  $('augment-dialog').close();
  tell(`${modules.find(m => m.id === button.dataset.augment).name} 장착 완료. ${game.started ? '계속 탐사하세요!' : '원하는 칸을 눌러 시작하세요.'}`);
  if (thresholds[earned] && game.progress >= thresholds[earned]) { earned++; chooseAugment(); }
  render();
});
$('augment-dialog').addEventListener('cancel', e => e.preventDefault());
$('board').addEventListener('click', e => {
  const button = e.target.closest('[data-index]'); if (!button || !canAct()) return;
  const i = Number(button.dataset.index);
  const result = activateCell(game, i, mode);
  const power = modules.find(m => m.id === mode && m.target);
  if (power) {
    if (result === 'noop') { tell('이 칸에는 사용할 효과가 없어요. 횟수는 유지됩니다. 다른 칸을 선택하세요.'); return; }
    setMode('reveal'); afterAction('open');
    if (!finished) tell(`${power.name} 사용 완료. ${power.id === 'breach' ? '안전한 칸을 열었어요.' : '✳는 지뢰, 초록 점은 안전한 칸이에요.'}`);
    return;
  }
  if (result === 'flag') { render(); return; }
  afterAction(result);
});
$('board').addEventListener('contextmenu', e => {
  const button = e.target.closest('[data-index]'); if (!button) return;
  e.preventDefault(); if (canAct()) { game.flag(Number(button.dataset.index)); render(); }
});
$('board').addEventListener('focusin', e => {
  if (!e.target.matches('[data-index]')) return;
  $('board').children[focusIndex].tabIndex = -1;
  focusIndex = Number(e.target.dataset.index); e.target.tabIndex = 0;
});
$('board').addEventListener('keydown', e => {
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -game.cols, ArrowDown: game.cols }[e.key];
  if (delta === undefined) return;
  e.preventDefault();
  const next = Math.max(0, Math.min(game.cells.length - 1, focusIndex + delta));
  $('board').children[next].focus();
});
$('loadout').addEventListener('click', e => {
  const button = e.target.closest('[data-power]'); if (!button || button.disabled || !canAct()) return;
  const power = modules.find(m => m.id === button.dataset.power);
  if (power.target) {
    setMode(mode === power.id ? 'reveal' : power.id);
    tell(mode === 'reveal' ? '탐색 모드로 돌아왔어요.' : `${power.name}: ${power.short}. 칸을 선택하세요. 탐색 버튼으로 취소할 수 있어요.`);
  } else {
    setMode('reveal');
    if (game.usePower(power.id)) { afterAction('open'); if (!finished) tell(`${power.name} 사용 완료. ${power.short}.`); }
    else tell('효과를 적용할 칸이 없어요. 사용 횟수는 유지됩니다.');
  }
});
$('reveal-mode').onclick = () => { setMode('reveal'); tell('탐색 모드: 칸을 눌러 엽니다.'); };
$('flag-mode').onclick = () => { setMode('flag'); tell('깃발 모드: 닫힌 칸은 깃발, 열린 숫자는 주변 열기.'); };
document.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'f' && !document.querySelector('dialog[open]') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setMode(mode === 'flag' ? 'reveal' : 'flag'); tell(mode === 'flag' ? '깃발 모드로 전환했어요.' : '탐색 모드로 전환했어요.'); } });
document.querySelectorAll('[data-level]').forEach(b => b.onclick = () => requestRestart(b.dataset.level));
$('restart').onclick = () => requestRestart(game.level);
$('play-again').onclick = () => race ? leaveRace() : start(game.level);
$('view-board').onclick = () => $('result-dialog').close();
$('help').onclick = () => $('help-dialog').showModal();
$('close-help').onclick = () => $('help-dialog').close();
$('confirm-restart').onclick = () => start(pendingLevel);
$('cancel-restart').onclick = () => $('confirm-dialog').close();
function fitBoard() {
  const wrap = document.querySelector('.board-wrap');
  const style = getComputedStyle(wrap);
  const width = wrap.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const height = wrap.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - $('start-hint').offsetHeight;
  if (width > 0 && height > 0) $('board').style.setProperty('--board-size', `${Math.floor(Math.min(width, height))}px`);
}
new ResizeObserver(fitBoard).observe(document.querySelector('.board-wrap'));
function displayRace() {
  $('room-details').hidden = !race;
  $('open-room-dialog').hidden = !!race;
  $('multiplayer').textContent = race ? '대전 중' : '친구와 대전';
  document.querySelectorAll('[data-level]').forEach(b => b.disabled = !!race);
  $('restart').disabled = !!race;
  if (!race) {
    $('race-title').textContent = '함께 도전하기'; $('connection-state').textContent = '1 VS 1';
    $('race-status').textContent = '같은 지뢰밭에서 펼치는 친구와의 탐사 레이스.';
    $('play-again').textContent = '다시 도전 ↗'; return;
  }
  const room = race.room, self = room?.players?.[race.client.uid];
  if (!room || !self) return;
  const other = Object.entries(room.players).find(([uid]) => uid !== race.client.uid)?.[1];
  $('race-title').textContent = '친구와 탐사 레이스';
  $('connection-state').textContent = race.client.connected ? 'ONLINE' : '재연결 중';
  $('room-code').textContent = race.client.code;
  $('opponent-label').textContent = !other ? '상대 기다리는 중' : !other.online ? '상대 연결 끊김' : other.ready ? '상대 준비 완료' : '상대 증강 선택 중';
  if (race.started && other?.online) $('opponent-label').textContent = '상대 탐사율';
  $('opponent-progress').textContent = `${other?.progress || 0}%`;
  $('opponent-bar').style.width = `${other?.progress || 0}%`;
  $('ready-controls').hidden = room.meta.phase !== 'lobby';
  $('race-ready').disabled = !!self.ready || !race.client.connected;
  $('race-choice').disabled = !!self.ready;
  $('race-choice-help').textContent = modules.find(m => m.id === $('race-choice').value)?.desc || '';
  $('race-ready').textContent = self.ready ? '상대 준비 기다리는 중' : '준비 완료';
  $('race-status').textContent = !race.client.connected ? '연결이 끊겨 조작을 잠시 멈췄어요.' : room.meta.phase === 'closed' ? '방장이 방을 닫았어요. 방 나가기를 눌러 주세요.' : room.outcome ? '대전이 끝났습니다.' : !other ? '코드 또는 초대 링크를 친구에게 보내세요.' : !other.online ? '상대 연결을 기다립니다. 방 나가기로 종료할 수 있어요.' : !race.started ? '첫 증강을 고르고 준비 완료를 눌러 주세요.' : '먼저 모든 안전한 칸을 열면 승리!';
}
async function enterRace(code) {
  if (joining || race) return;
  joining = true; $('create-room').disabled = $('join-room').disabled = true;
  $('room-message').textContent = '대전 연결을 준비하고 있습니다…';
  let candidate;
  try {
    const { OnlineRoom } = await import('./online.js');
    candidate = new OnlineRoom(room => {
      if (race?.client !== candidate || !room) return;
      race.room = room;
      if (!race.initialized) { $('race-choice').innerHTML = modules.map(m => `<option value="${m.id}">${m.name} · ${m.gain}</option>`).join(''); race.initialized = true; start(room.meta.level, { seed: room.meta.seed }); tell('첫 증강을 고르고 준비 완료를 눌러 주세요.'); }
      displayRace();
      if (room.outcome) finishRace();
    }, connected => {
      if (race?.client !== candidate) return;
      displayRace(); render();
      if (connected && race.pendingTerminal) sendRaceResult();
    }, error => { if (race?.client === candidate) tell(`대전 연결 오류: ${friendlyError(error)}`); });
    race = { client: candidate, initialized: false, started: false, room: null };
    await candidate.open(code, $('room-level').value);
  } catch (error) {
    race = null; candidate?.close().catch(() => {}); displayRace();
    $('room-message').textContent = friendlyError(error);
    if (!$('room-dialog').open) $('room-dialog').showModal();
  } finally { joining = false; $('create-room').disabled = $('join-room').disabled = false; }
}
function friendlyError(error) {
  if (/permission|denied/i.test(error?.message || '')) return '방에 참가할 수 없어요. 방이 꽉 찼거나 연결 권한을 확인할 수 없습니다.';
  if (/network|fetch|timeout/i.test(error?.message || '')) return '네트워크 연결을 확인하고 다시 시도하세요.';
  return error?.message || '연결하지 못했어요. 다시 시도해 주세요.';
}
function startRace() {
  race.started = true;
  game.augment(race.room.players[race.client.uid].choice); picked = 1;
  game.reveal(Math.floor(game.rows / 2) * game.cols + Math.floor(game.cols / 2));
  startedAt = performance.now() - Math.max(0, race.client.now() - race.room.meta.startAt);
  displayRace(); afterAction('open');
}
function sendRaceResult() {
  const current = race;
  if (!current || finished || current.sending || !current.client.connected || !current.pendingTerminal) return;
  current.sending = true; tell('경기 결과를 확인하는 중…');
  current.client.settle(current.pendingTerminal).catch(() => tell('연결 복구 후 경기 결과를 다시 전송합니다.')).finally(() => { current.sending = false; });
}
function finishRace() {
  if (!race || finished) return;
  finished = true;
  race.pendingTerminal = null;
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  const win = race.room.outcome.winner === race.client.uid;
  $('result-icon').textContent = win ? '✦' : '✳';
  $('result-icon').style.color = win ? 'var(--lime)' : '#f0a0a0';
  $('result-kicker').textContent = 'FRIENDLY MATCH COMPLETE';
  const interrupted = race.room.outcome.reason === 'disconnect';
  $('result-title').textContent = interrupted ? '연결이 끊겨 대전이 중단됐어요.' : win ? '이번 대전에서 승리했어요!' : '다음 탐사에서 다시 만나요.';
  const reasons = { clear: '안전한 칸을 먼저 모두 열어 승부가 결정됐어요.', mine: '지뢰를 밟아 승부가 결정됐어요.', leave: '상대 또는 내가 방을 나가 대전이 종료됐어요.', disconnect: '이 경기는 승패를 기록하지 않아요. 새 방을 만들어 다시 연결해 주세요.' };
  $('result-copy').textContent = reasons[race.room.outcome.reason];
  $('play-again').textContent = '대전 나가기';
  tell(interrupted ? '연결 종료로 대전이 중단됐어요.' : win ? '대전 승리!' : '대전 패배. 다음에 다시 도전해 보세요.');
  render(); $('result-dialog').showModal();
}
function leaveRace() {
  const current = race; race = null;
  current?.client.close().catch(() => {});
  if (location.hash.startsWith('#room=')) history.replaceState(null, '', location.pathname + location.search);
  displayRace(); start(game.level);
}
function openRoomDialog() {
  if (race) { tell('오른쪽 대전 패널에서 방 상태를 확인하세요.'); return; }
  $('room-level').value = game.level;
  $('room-dialog').showModal();
}
$('multiplayer').onclick = $('open-room-dialog').onclick = openRoomDialog;
$('create-room').onclick = () => enterRace();
$('join-room').onclick = () => enterRace($('join-code').value.trim() || 'invalid');
$('close-room-dialog').onclick = () => { if (!joining) $('room-dialog').close(); };
$('room-dialog').addEventListener('cancel', e => { if (joining) e.preventDefault(); });
$('room-dialog').addEventListener('close', () => { if (!race && !picked && game.state === 'ready' && !$('augment-dialog').open) chooseAugment(true); });
$('race-ready').onclick = async () => { if (!race) return; $('race-ready').disabled = true; try { await race.client.ready($('race-choice').value); } catch (e) { tell(friendlyError(e)); displayRace(); } };
$('copy-room').onclick = async () => { if (!race) return; const url = new URL(location.href); url.hash = `room=${race.client.code}`; try { await navigator.clipboard.writeText(url.href); tell('초대 링크를 복사했어요. 친구에게 보내세요.'); } catch { tell(`방 코드: ${race.client.code} — 친구에게 직접 알려 주세요.`); } };
$('leave-room').onclick = () => $('leave-dialog').showModal();
$('confirm-leave').onclick = leaveRace;
$('cancel-leave').onclick = () => $('leave-dialog').close();
setInterval(() => {
  if (race?.room?.meta.phase === 'countdown' && !race.started && race.client.connected) {
    const remaining = race.room.meta.startAt - race.client.now();
    if (remaining <= 0) startRace();
    else { $('race-status').textContent = `${Math.ceil(remaining / 1000)}초 후 동시 시작!`; tell('가운데 안전한 칸에서 함께 출발합니다.'); }
  }
  if (startedAt && !finished) { elapsed = Math.floor((performance.now() - startedAt) / 1000); $('timer').textContent = formatTime(elapsed); }
}, 250);
$('augment-catalog').innerHTML = modules.map(m => `<li><b>${m.symbol} ${m.name} · ${m.gain}</b><span>${m.desc}</span></li>`).join('');
$('race-choice').addEventListener('change', () => { $('race-choice-help').textContent = modules.find(m => m.id === $('race-choice').value)?.desc || ''; });
start();
function applyInvitation() {
  const invitation = /^#room=([A-HJ-NP-Z2-9]{8})$/.exec(location.hash);
  if (invitation && !race) { $('augment-dialog').close(); $('join-code').value = invitation[1]; if (!$('room-dialog').open) openRoomDialog(); }
}
window.addEventListener('hashchange', applyInvitation);
applyInvitation();
