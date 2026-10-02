export const MODULES = [
  { id: 'shield', resource: 'shields', amount: 1, name: '위상 보호막', symbol: '◇', type: '자동 · 방어', desc: '지뢰 충돌을 1회 막고 해당 칸에 깃발을 꽂습니다.', short: '지뢰 충돌 1회 방어', gain: '+1 보호막' },
  { id: 'scan', resource: 'scans', amount: 2, target: true, name: '광역 스캐너', symbol: '⌖', type: '지정 · 정보', desc: '선택한 칸 주변 3×3을 확인해 안전한 칸은 열고 지뢰는 깃발로 확정합니다.', short: '3×3 자동 확인·정리', gain: '+2 스캔' },
  { id: 'probe', resource: 'probes', amount: 1, name: '탐사 드론', symbol: '⤢', type: '즉시 · 탐사', desc: '무작위 안전한 칸을 최대 3개 엽니다. 빈 공간은 연쇄로 열립니다.', short: '안전한 칸 최대 3개 열기', gain: '+1 출격' },
  { id: 'row', resource: 'rowscans', amount: 1, target: true, name: '가로 레이더', symbol: '↔', type: '지정 · 정보', desc: '선택한 칸이 속한 가로 한 줄을 확인해 안전한 칸은 열고 지뢰는 깃발로 확정합니다.', short: '가로 한 줄 자동 정리', gain: '+1 탐지' },
  { id: 'column', resource: 'colscans', amount: 1, target: true, name: '세로 레이더', symbol: '↕', type: '지정 · 정보', desc: '선택한 칸이 속한 세로 한 줄을 확인해 안전한 칸은 열고 지뢰는 깃발로 확정합니다.', short: '세로 한 줄 자동 정리', gain: '+1 탐지' },
  { id: 'defuse', resource: 'defusers', amount: 2, target: true, name: '정밀 해체', symbol: '⊙', type: '지정 · 방어', desc: '닫힌 칸 하나를 안전하게 확인합니다. 지뢰면 깃발, 안전하면 개방합니다. 지뢰 배치는 유지됩니다.', short: '선택한 한 칸 안전 확인', gain: '+2 해체' },
  { id: 'hunter', resource: 'hunters', amount: 1, name: '지뢰 추적기', symbol: '⚑', type: '즉시 · 표식', desc: '아직 깃발이 없는 지뢰를 최대 2개 찾아 확정 표시하고 깃발을 꽂습니다.', short: '지뢰 최대 2개 자동 깃발', gain: '+1 추적' },
  { id: 'audit', resource: 'audits', amount: 2, name: '깃발 검증기', symbol: '✓', type: '즉시 · 교정', desc: '모든 깃발을 검증합니다. 잘못된 깃발은 제거하고 해당 안전 칸을 열며, 맞는 깃발은 지뢰로 확정합니다.', short: '모든 깃발 검증·오류 수정', gain: '+2 검증' },
  { id: 'breach', resource: 'breaches', amount: 1, target: true, name: '안전 굴착기', symbol: '▧', type: '지정 · 탐사', desc: '선택한 칸 주변 3×3에서 깃발 없는 안전한 칸을 최대 5개 엽니다. 빈 공간은 연쇄로 열립니다.', short: '3×3 안전한 칸 최대 5개 열기', gain: '+1 굴착' },
  { id: 'echo', resource: 'echoes', amount: 2, name: '경계 탐지기', symbol: '◎', type: '즉시 · 정보', desc: '열린 구역에 인접한 미확인 칸을 최대 5개 확인해 안전 칸은 열고 지뢰는 깃발로 확정합니다.', short: '경계 최대 5칸 자동 정리', gain: '+2 탐지' },
];

// A separate stream ensures draft choices never affect mine placement.
export function augmentChoices(seed, tier = 0) {
  let state = (seed ^ Math.imul(tier + 1, 0x9e3779b9)) >>> 0;
  const pool = [...MODULES];
  for (let i = pool.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = Math.floor(state / 4294967296 * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}
