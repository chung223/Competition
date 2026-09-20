'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Rank = require('../assets/js/rank.js');

// ---- toRanks -----------------------------------------------------------
test('分數換算名次：高分為第一', () => {
  assert.deepStrictEqual(Rank.toRanks([90, 85, 95], { mode: 'score' }), [2, 3, 1]);
});

test('分數並列取平均名次', () => {
  assert.deepStrictEqual(Rank.toRanks([90, 85, 95, 85], { mode: 'score' }), [2, 3.5, 1, 3.5]);
});

test('分數並列可改用競賽式名次', () => {
  assert.deepStrictEqual(
    Rank.toRanks([90, 85, 95, 85], { mode: 'score', tieMethod: 'standard' }),
    [2, 3, 1, 3]
  );
});

test('名次模式原樣保留相對順序', () => {
  assert.deepStrictEqual(Rank.toRanks([3, 1, 2], { mode: 'rank' }), [3, 1, 2]);
});

test('未評分回傳 null；fillMissing 時補並列末位', () => {
  assert.deepStrictEqual(Rank.toRanks([90, null, 80], { mode: 'score' }), [1, null, 2]);
  assert.deepStrictEqual(
    Rank.toRanks([90, null, 80], { mode: 'score', fillMissing: true }),
    [1, 3, 2]
  );
});

test('給分寬嚴不同不影響名次（核心需求）', () => {
  const strict = Rank.toRanks([70, 65, 60], { mode: 'score' });
  const lenient = Rank.toRanks([99, 95, 91], { mode: 'score' });
  assert.deepStrictEqual(strict, lenient);
});

// ---- compute -----------------------------------------------------------
function fixture(overrides = {}) {
  return Object.assign({
    entries: [
      { id: 'e1', name: '甲隊' },
      { id: 'e2', name: '乙隊' },
      { id: 'e3', name: '丙隊' },
      { id: 'e4', name: '丁隊' }
    ],
    judges: [
      { id: 'j1', name: '委員一', mode: 'score' },
      { id: 'j2', name: '委員二', mode: 'score' },
      { id: 'j3', name: '委員三', mode: 'score' }
    ],
    scores: {
      j1: { e1: 95, e2: 90, e3: 85, e4: 80 },
      j2: { e1: 78, e2: 80, e3: 75, e4: 70 },
      j3: { e1: 99, e2: 97, e3: 98, e4: 90 }
    },
    awards: [{ name: '一等獎', count: 1 }, { name: '二等獎', count: 2 }],
    options: {}
  }, overrides);
}

test('名次和最低者列第一，並依序配發獎項', () => {
  const r = Rank.compute(fixture());
  assert.strictEqual(r.rows[0].name, '甲隊');
  assert.strictEqual(r.rows[0].sumRank, 4);   // 1 + 2 + 1
  assert.strictEqual(r.rows[0].award, '一等獎');
  assert.strictEqual(r.rows[1].award, '二等獎');
  assert.strictEqual(r.rows[2].award, '二等獎');
  assert.strictEqual(r.rows[3].award, '');
  assert.strictEqual(r.complete, true);
});

test('分數與名次混合輸入可共同計算', () => {
  const f = fixture();
  f.judges[1].mode = 'rank';
  f.scores.j2 = { e1: 2, e2: 1, e3: 3, e4: 4 };
  const r = Rank.compute(f);
  assert.strictEqual(r.rows[0].name, '甲隊');
  assert.strictEqual(r.rows[0].perJudge.j2.rank, 2);
});

test('名次和相同時以較優名次個數決勝', () => {
  const r = Rank.compute(fixture({
    entries: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
    judges: [
      { id: 'j1', name: 'J1', mode: 'rank' },
      { id: 'j2', name: 'J2', mode: 'rank' },
      { id: 'j3', name: 'J3', mode: 'rank' }
    ],
    // A = [1,1,3] 和 5；B = [2,2,1] 和 5；C = [3,3,2] 和 8
    scores: {
      j1: { a: 1, b: 2, c: 3 },
      j2: { a: 1, b: 2, c: 3 },
      j3: { a: 3, b: 1, c: 2 }
    },
    awards: []
  }));
  assert.strictEqual(r.rows[0].name, 'A');
  assert.strictEqual(r.rows[0].sumRank, 5);
  assert.strictEqual(r.rows[1].sumRank, 5);
  assert.strictEqual(r.rows[1].decidedBy, 'betterRank');
});

test('主審可作為決勝條件', () => {
  const base = {
    entries: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    judges: [
      { id: 'j1', name: 'J1', mode: 'rank', chief: true },
      { id: 'j2', name: 'J2', mode: 'rank' }
    ],
    scores: { j1: { a: 2, b: 1 }, j2: { a: 1, b: 2 } },
    awards: [],
    options: { tiebreakers: ['chief'] }
  };
  const r = Rank.compute(base);
  assert.strictEqual(r.rows[0].name, 'B');       // 主審給 B 第 1
  assert.strictEqual(r.rows[0].decidedBy, null);
  assert.strictEqual(r.rows[1].decidedBy, 'chief');
});

test('完全並列者同名次，下一名次跳號', () => {
  const r = Rank.compute({
    entries: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
    judges: [{ id: 'j1', name: 'J1', mode: 'rank' }, { id: 'j2', name: 'J2', mode: 'rank' }],
    scores: { j1: { a: 1, b: 2, c: 3 }, j2: { a: 2, b: 1, c: 3 } },
    awards: [],
    options: { tiebreakers: [] }   // 不啟用任何決勝 → 維持並列
  });
  assert.strictEqual(r.rows[0].place, 1);
  assert.strictEqual(r.rows[1].place, 1);
  assert.strictEqual(r.rows[0].tied, true);
  assert.strictEqual(r.rows[2].place, 3);
});

test('並列跨越獎項邊界：預設後續名額順延遞減', () => {
  const r = Rank.compute({
    entries: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
    judges: [{ id: 'j1', name: 'J1', mode: 'rank' }, { id: 'j2', name: 'J2', mode: 'rank' }],
    scores: { j1: { a: 1, b: 2, c: 3 }, j2: { a: 2, b: 1, c: 3 } },
    awards: [{ name: '一等獎', count: 1 }, { name: '二等獎', count: 2 }],
    options: { tiebreakers: [] }
  });
  assert.strictEqual(r.rows[0].award, '一等獎');
  assert.strictEqual(r.rows[1].award, '一等獎');
  assert.strictEqual(r.rows[2].award, '二等獎');
  assert.ok(r.adjustments.some(a => a.type === 'carry'));
});

test('並列跨越獎項邊界：可改為增額不影響後續', () => {
  const r = Rank.compute({
    entries: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }],
    judges: [{ id: 'j1', name: 'J1', mode: 'rank' }, { id: 'j2', name: 'J2', mode: 'rank' }],
    scores: { j1: { a: 1, b: 2, c: 3, d: 4 }, j2: { a: 2, b: 1, c: 4, d: 3 } },
    awards: [{ name: '一等獎', count: 1 }, { name: '二等獎', count: 2 }],
    options: { tiebreakers: [], awardTiePolicy: 'expand' }
  });
  assert.strictEqual(r.rows[0].award, '一等獎');
  assert.strictEqual(r.rows[1].award, '一等獎');
  assert.strictEqual(r.rows[2].award, '二等獎');
  assert.strictEqual(r.rows[3].award, '二等獎');
  assert.ok(r.adjustments.some(a => a.type === 'expand'));
});

test('未填完的委員會產生錯誤提示且 complete 為 false', () => {
  const f = fixture();
  delete f.scores.j2.e3;
  const r = Rank.compute(f);
  assert.strictEqual(r.complete, false);
  assert.ok(r.issues.some(i => i.level === 'error' && i.message.includes('委員二')));
});

test('名次模式重複填寫會提出警告', () => {
  const f = fixture();
  f.judges[0].mode = 'rank';
  f.scores.j1 = { e1: 1, e2: 1, e3: 3, e4: 4 };
  const r = Rank.compute(f);
  assert.ok(r.issues.some(i => i.level === 'warn' && i.message.includes('重複名次')));
});

test('未獲獎者可統一標示', () => {
  const r = Rank.compute(fixture({ options: { remainderLabel: '佳作' } }));
  assert.strictEqual(r.rows[3].award, '佳作');
});

test('獎項總名額超出參賽數會警告', () => {
  const r = Rank.compute(fixture({ awards: [{ name: '一等獎', count: 10 }] }));
  assert.ok(r.issues.some(i => i.message.includes('超過參賽單位')));
});

test('決勝條件全部停用時，即使較優名次不同仍維持並列', () => {
  // A = [1,1,3] 和 5；B = [2,2,1] 和 5 → 若啟用「較優名次個數」A 勝，停用則並列
  const input = {
    entries: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
    judges: [
      { id: 'j1', name: 'J1', mode: 'rank' },
      { id: 'j2', name: 'J2', mode: 'rank' },
      { id: 'j3', name: 'J3', mode: 'rank' }
    ],
    scores: { j1: { a: 1, b: 2, c: 3 }, j2: { a: 1, b: 2, c: 3 }, j3: { a: 3, b: 1, c: 2 } },
    awards: []
  };

  const withTb = Rank.compute(Object.assign({}, input, { options: { tiebreakers: ['betterRank'] } }));
  assert.strictEqual(withTb.rows[0].place, 1);
  assert.strictEqual(withTb.rows[1].place, 2);

  const noTb = Rank.compute(Object.assign({}, input, { options: { tiebreakers: [] } }));
  assert.strictEqual(noTb.rows[0].place, 1);
  assert.strictEqual(noTb.rows[1].place, 1);
  assert.strictEqual(noTb.rows[0].tied, true);
  assert.strictEqual(noTb.rows[2].place, 3);
});

test('options 未提供 tiebreakers 欄位時退回預設決勝順序', () => {
  const r = Rank.compute({
    entries: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
    judges: [
      { id: 'j1', name: 'J1', mode: 'rank' },
      { id: 'j2', name: 'J2', mode: 'rank' },
      { id: 'j3', name: 'J3', mode: 'rank' }
    ],
    scores: { j1: { a: 1, b: 2, c: 3 }, j2: { a: 1, b: 2, c: 3 }, j3: { a: 3, b: 1, c: 2 } },
    awards: []
  });
  assert.deepStrictEqual(r.tiebreakChain.map(c => c.key), ['sumRank'].concat(Rank.DEFAULT_TIEBREAKERS));
  assert.strictEqual(r.rows[1].place, 2);
});
