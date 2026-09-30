import { LEVELS } from './game.js?v=4';
import { MODULES } from './augments.js?v=4';
import { STORAGE_KEY, MODES, OUTCOMES, loadArchive, saveRecord, mergeArchives, parseBackup, summarize, challengeHash, formatTime } from './records.js?v=4';
const $ = id => document.getElementById(id);
const date = at => new Date(at).toLocaleDateString('ko-KR');
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function storage() { try { return localStorage; } catch { return { getItem: () => null, setItem: () => { throw new Error('storage'); } }; } }

export function createRecordsUI(activeId) {
  const disk = storage();
  let archive = loadArchive(disk), selected = null, cardFile = null, generation = 0;
  const urlFor = r => new URL(challengeHash(r) || './', location.href).href;
  const description = r => {
    const level = LEVELS[r.level];
    return `MINE / SHIFT · ${MODES[r.mode]} ${OUTCOMES[r.outcome]}\n${level.name} ${level.rows}×${level.cols} · 지뢰 ${level.mines}개\n${formatTime(r.seconds)} · 탐사 ${r.progress}%\n${r.mode === 'race' ? '증강 지뢰찾기에 도전해 보세요!' : '같은 지뢰밭에서 제 기록에 도전해 보세요!'}`;
  };
  function render() {
    const mode = $('record-filter').value;
    const visible = { ...archive, runs: archive.runs.filter(r => r.id !== activeId()) };
    const stats = summarize(visible, mode);
    $('record-summary').textContent = `${MODES[mode]} ${stats.played}판 · ${stats.wins}승 · 승률 ${stats.winRate}% · 현재 ${stats.streak}연승`;
    $('record-bests').innerHTML = Object.entries(LEVELS).map(([id, level]) => {
      const r = archive.best[id];
      return `<button class="best-tile" ${r ? `data-record="${r.id}"` : 'disabled'}><span>${level.name} · ${level.rows}×${level.cols}</span><strong>${r ? formatTime(r.seconds) : '—'}</strong><small>솔로 최고 기록</small></button>`;
    }).join('');
    $('record-list').innerHTML = visible.runs.filter(r => r.mode === mode).map(r => `<button class="history-row" data-record="${r.id}"><span><b>${LEVELS[r.level].name} · ${OUTCOMES[r.outcome]}</b><small>${date(r.at)} · ${r.picks.map(id => MODULES.find(m => m.id === id).name).join(' / ') || '증강 없음'}</small></span><span><b>${formatTime(r.seconds)}</b><small>${r.progress}% 탐사 ↗</small></span></button>`).join('') || '<p class="empty-loadout">아직 기록이 없어요. 한 판을 마치면 자동으로 남습니다.</p>';
    const legacy = Object.entries(LEVELS).map(([id, l], i) => {
      try { const v = disk.getItem(`mineshift-best-v1-${id}`); return v !== null && /^\d+$/.test(v) ? `${l.name} ${[9, 12, 16][i]}×${[9, 12, 16][i]} ${formatTime(Number(v))}` : ''; } catch { return ''; }
    }).filter(Boolean);
    $('legacy-records').textContent = legacy.length ? `이전 작은 보드 최고 기록: ${legacy.join(' · ')}` : '';
  }
  async function showCard(record) {
    selected = record; cardFile = null;
    const token = ++generation;
    $('share-card').disabled = $('download-card').disabled = true;
    $('share-status').textContent = '카드를 준비하고 있어요.';
    $('share-link').value = urlFor(record);
    $('copy-challenge').textContent = record.mode === 'race' ? '결과 문구 복사' : '도전 링크 복사';
    $('share-title').textContent = `${LEVELS[record.level].name} · ${OUTCOMES[record.outcome]}`;
    const canvas = $('result-card'), ctx = canvas.getContext('2d'), level = LEVELS[record.level];
    ctx.fillStyle = '#11161e'; ctx.fillRect(0, 0, 1200, 675);
    for (let row = 0; row < 9; row++) for (let col = 0; col < 17; col++) {
      ctx.strokeStyle = '#202c37'; ctx.strokeRect(780 + col * 32, 44 + row * 32, 25, 25);
    }
    ctx.fillStyle = '#c5f277'; ctx.font = '700 27px sans-serif'; ctx.fillText('MINE / SHIFT', 64, 70);
    ctx.fillStyle = '#b8aacb'; ctx.font = '19px sans-serif'; ctx.fillText('AUGMENTED MINESWEEPER', 64, 104);
    ctx.fillStyle = '#fff'; ctx.font = '700 45px sans-serif'; ctx.fillText(`${level.name} ${level.rows}×${level.cols}`, 64, 190);
    ctx.fillStyle = record.outcome === 'won' ? '#c5f277' : '#c6b0f1'; ctx.font = '700 28px sans-serif'; ctx.fillText(`${MODES[record.mode]} · ${OUTCOMES[record.outcome]}`, 66, 235);
    ctx.fillStyle = '#fff'; ctx.font = '700 105px monospace'; ctx.fillText(formatTime(record.seconds), 60, 355);
    ctx.fillStyle = '#b8c3cd'; ctx.font = '24px sans-serif'; ctx.fillText(`지뢰 ${level.mines}개   /   ${level.rows * level.cols}칸   /   탐사 ${record.progress}%`, 67, 402);
    ctx.fillStyle = '#c5f277'; ctx.font = '20px sans-serif';
    const names = record.picks.map(id => MODULES.find(m => m.id === id).name);
    ctx.fillText(names.slice(0, 2).join(' + '), 67, 464); ctx.fillText(names.slice(2).join(' + '), 67, 500);
    ctx.fillStyle = '#85929f'; ctx.font = '18px sans-serif'; ctx.fillText(`${date(record.at)} · 개인 플레이 기록`, 67, 570);
    ctx.fillStyle = '#c5f277'; ctx.fillRect(0, 611, 1200, 64);
    ctx.fillStyle = '#162012'; ctx.font = '700 21px sans-serif'; ctx.fillText('이 지뢰밭에 도전해 보세요.  jonathanblackdoctor.github.io/augmented-minesweeper', 45, 652);
    $('share-dialog').showModal();
    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('image');
      if (token !== generation) return;
      cardFile = new File([blob], `mine-shift-${record.level}-${record.seconds}s.png`, { type: 'image/png' });
      $('share-card').disabled = $('download-card').disabled = false;
      $('share-status').textContent = record.mode === 'race' ? '결과 카드를 저장하거나 공유하세요.' : '도전 링크는 같은 배치·시작 칸·증강 후보로 이어집니다.';
    } catch { $('share-status').textContent = '이미지를 만들지 못했어요. 아래 링크는 복사할 수 있습니다.'; }
  }
  $('open-records').onclick = () => { archive = mergeArchives(loadArchive(disk), archive); render(); $('records-dialog').showModal(); };
  $('close-records').onclick = () => $('records-dialog').close();
  $('close-share').onclick = () => $('share-dialog').close();
  $('record-filter').onchange = render;
  for (const id of ['record-list', 'record-bests']) $(id).onclick = event => {
    const target = event.target.closest('[data-record]'); if (!target) return;
    const record = [...archive.runs, ...Object.values(archive.best)].find(r => r.id === target.dataset.record);
    if (record) showCard(record);
  };
  $('download-card').onclick = () => { if (cardFile) { download(cardFile, cardFile.name); $('share-status').textContent = 'PNG 카드를 저장했어요. 다운로드에서 확인하세요.'; } };
  $('share-card').onclick = async () => {
    if (!selected || !cardFile) return;
    try {
      const content = { title: 'MINE / SHIFT 탐사 기록', text: description(selected), url: urlFor(selected) };
      if (navigator.canShare?.({ files: [cardFile] })) content.files = [cardFile];
      if (navigator.share) await navigator.share(content);
      else { download(cardFile, cardFile.name); await navigator.clipboard.writeText(`${description(selected)}\n${urlFor(selected)}`); $('share-status').textContent = '카드를 저장하고 공유 문구·링크를 복사했어요.'; }
    } catch (error) { if (error.name !== 'AbortError') $('share-status').textContent = '공유 창을 열지 못했어요. 카드 저장이나 링크 복사를 이용하세요.'; }
  };
  $('copy-challenge').onclick = async () => {
    if (!selected) return;
    try { await navigator.clipboard.writeText(selected.mode === 'race' ? `${description(selected)}\n${urlFor(selected)}` : urlFor(selected)); $('share-status').textContent = '복사했어요. 친구에게 보내세요!'; }
    catch { $('share-link').focus(); $('share-link').select(); $('share-status').textContent = '아래 주소를 길게 눌러 복사하세요.'; }
  };
  $('export-records').onclick = () => download(new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' }), 'mine-shift-records.json');
  $('import-records').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 2000000) throw new Error('백업 파일이 너무 큽니다.');
      archive = mergeArchives(loadArchive(disk), archive, parseBackup(await file.text()));
      disk.setItem(STORAGE_KEY, JSON.stringify(archive)); render();
      $('record-message').textContent = '기존 기록과 합쳐 복원했어요. 중복 경기는 한 번만 표시합니다.';
    } catch { $('record-message').textContent = '복원하지 못했어요. 백업 형식과 브라우저 저장 공간을 확인하세요.'; }
    event.target.value = '';
  };
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    archive = mergeArchives(archive, loadArchive(disk));
    if ($('records-dialog').open) render();
  });
  return {
    best: level => archive.best[level]?.seconds ?? null,
    add(record) { const result = saveRecord(disk, record, mergeArchives(archive, loadArchive(disk))); archive = result.archive; return result.saved; },
    showCard,
  };
}
