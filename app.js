import { Game, LEVELS } from './game.js';
const $ = id => document.getElementById(id);
const modules = [
  { id: 'shield', name: '위상 보호막', symbol: '◇', type: 'PASSIVE / DEFENSE', desc: '지뢰를 한 번 밟아도 생존합니다. 해당 칸에 자동으로 깃발을 꽂아요.', short: '지뢰 충돌 1회 방어', gain: '+1 보호막' },
  { id: 'scan', name: '광역 스캐너', symbol: '⌖', type: 'ACTIVE / INTELLIGENCE', desc: '선택한 칸 주변 3×3의 지뢰와 안전한 칸을 표시합니다.', short: '3×3 구역 위험 감지', gain: '+2 스캔' },
  { id: 'probe', name: '탐사 드론', symbol: '⤢', type: 'ACTIVE / EXPLORATION', desc: '숨겨진 안전한 칸을 최대 3개 엽니다. 빈 공간은 연쇄로 열려요.', short: '안전한 칸 최대 3개 열기', gain: '+1 출격' },
];
let game, mode = 'reveal', pendingLevel = 'easy', earned = 0, picked = 0, startedAt = 0, elapsed = 0, finished = false, focusIndex = 0;
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
  $('board').classList.toggle('scanning', mode === 'scan');
}
function start(level = 'easy') {
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  game = new Game(level);
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
  updateBest(); render(); chooseAugment(true);
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
  $('mines').textContent = game.mines - game.flags;
  $('progress').textContent = Math.floor(game.progress * 100);
  $('start-hint').innerHTML = game.started ? `<span>✦</span> ${game.opened} / ${game.safeTotal}개의 안전한 칸 탐사` : '<span>✦</span> 첫 번째 칸은 언제나 안전합니다';
  $('augment-count').textContent = `${picked} EQUIPPED`;
  $('loadout').innerHTML = modules.map(m => {
    const count = game[m.id === 'shield' ? 'shields' : m.id === 'scan' ? 'scans' : 'probes'];
    return `<div class="module"><span class="module-symbol">${m.symbol}</span><div class="module-info"><h3>${m.name}</h3><p>${m.short}</p></div>${m.id === 'shield' ? `<span class="passive">× ${count}</span>` : `<button data-power="${m.id}" ${!count || game.state !== 'playing' ? 'disabled' : ''} aria-label="${m.name} 사용, ${count}회 남음">사용 ${count}</button>`}</div>`;
  }).join('');
  const target = thresholds[earned];
  $('next-label').textContent = target ? `탐사율 ${Math.round(target * 100)}%` : '모든 증강 획득';
  $('next-bar').style.width = `${target ? Math.min(100, game.progress / target * 100) : 100}%`;
}
function chooseAugment(initial = false) {
  $('augment-title').textContent = initial ? '당신의 첫 번째 가능성.' : '한계를 넘어, 한 단계 더.';
  $('augment-copy').textContent = initial ? '이번 탐사를 함께할 증강 하나를 선택하세요.' : `탐사율 ${Math.round(thresholds[earned - 1] * 100)}% 달성! 능력을 추가하세요.`;
  $('choices').innerHTML = modules.map(m => `<button class="choice" data-augment="${m.id}"><span class="choice-symbol">${m.symbol}</span><small>${m.type}</small><h3>${m.name}</h3><p>${m.desc}</p><span class="choice-footer">${m.gain} <span aria-hidden="true">↗</span></span></button>`).join('');
  $('augment-dialog').showModal();
}
function afterAction(result) {
  if (game.started && !startedAt) startedAt = performance.now();
  if (result === 'shield') tell('보호막 작동! 지뢰를 막고 해당 칸에 깃발을 꽂았어요.');
  else if (result !== 'noop') tell(mode === 'scan' ? '스캔할 구역의 중심 칸을 선택하세요.' : '숫자를 따라 안전한 칸을 찾아보세요.');
  if (game.state === 'won' || game.state === 'lost') finish();
  else if (thresholds[earned] && game.progress >= thresholds[earned] && !$('augment-dialog').open) { earned++; chooseAugment(); }
  render();
}
function finish() {
  if (finished) return;
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
  const button = e.target.closest('[data-index]'); if (!button || finished) return;
  const i = Number(button.dataset.index);
  if (mode === 'flag') { game.flag(i); render(); return; }
  if (mode === 'scan') {
    if (game.scan(i)) { setMode('reveal'); render(); tell('스캔 완료: ✳는 지뢰, 초록 점은 안전한 칸이에요.'); }
    return;
  }
  afterAction(game.cells[i].open ? game.chord(i) : game.reveal(i));
});
$('board').addEventListener('contextmenu', e => {
  const button = e.target.closest('[data-index]'); if (!button) return;
  e.preventDefault(); game.flag(Number(button.dataset.index)); render();
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
  const button = e.target.closest('[data-power]'); if (!button || button.disabled) return;
  if (button.dataset.power === 'scan') { setMode(mode === 'scan' ? 'reveal' : 'scan'); tell(mode === 'scan' ? '스캔할 구역의 중심 칸을 선택하세요. 탐색 버튼으로 취소할 수 있어요.' : '탐색 모드로 돌아왔어요.'); }
  else { setMode('reveal'); if (game.probe()) { afterAction('open'); if (!finished) tell('드론이 안전한 칸을 열었어요.'); } else tell('깃발이 없는 안전한 칸이 없어요. 깃발을 확인하세요.'); }
});
$('reveal-mode').onclick = () => { setMode('reveal'); tell('탐색 모드: 칸을 눌러 엽니다.'); };
$('flag-mode').onclick = () => { setMode('flag'); tell('깃발 모드: 칸을 눌러 깃발을 꽂거나 지웁니다.'); };
document.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'f' && !document.querySelector('dialog[open]') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setMode(mode === 'flag' ? 'reveal' : 'flag'); tell(mode === 'flag' ? '깃발 모드로 전환했어요.' : '탐색 모드로 전환했어요.'); } });
document.querySelectorAll('[data-level]').forEach(b => b.onclick = () => requestRestart(b.dataset.level));
$('restart').onclick = () => requestRestart(game.level);
$('play-again').onclick = () => start(game.level);
$('view-board').onclick = () => $('result-dialog').close();
$('help').onclick = () => $('help-dialog').showModal();
$('close-help').onclick = () => $('help-dialog').close();
$('confirm-restart').onclick = () => start(pendingLevel);
$('cancel-restart').onclick = () => $('confirm-dialog').close();
setInterval(() => { if (startedAt && !finished) { elapsed = Math.floor((performance.now() - startedAt) / 1000); $('timer').textContent = formatTime(elapsed); } }, 250);
start();
