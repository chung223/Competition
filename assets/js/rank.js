/*!
 * rank.js — 競賽名次計算核心（純函式，無 DOM 依賴）
 *
 * 核心原則：各委員的原始分數一律先在「該委員內部」換算成名次，
 * 再加總各委員名次（名次和），以消除委員給分寬嚴不一造成的落差。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.Rank = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 數值正規化：空白 / null / 非數字 一律視為未評分 (null) */
  function num(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string' && v.trim() === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  /**
   * 將一位委員的評分換算成名次。
   * @param {Array<number|null|string>} values 對應每個參賽單位的原始值
   * @param {Object} opts
   *   opts.mode      'score' 分數越高越好（預設） | 'rank' 本身即名次，越小越好
   *   opts.tieMethod 'average' 並列取平均名次 2.5（預設） | 'standard' 競賽式 1,2,2,4
   *   opts.fillMissing 未評分者是否補上「其後所有名次的平均」（預設 false → 回傳 null）
   * @returns {Array<number|null>} 換算後的名次
   */
  function toRanks(values, opts) {
    opts = opts || {};
    var mode = opts.mode === 'rank' ? 'rank' : 'score';
    var tieMethod = opts.tieMethod === 'standard' ? 'standard' : 'average';
    var i, k;

    var rated = [];
    for (i = 0; i < values.length; i++) {
      var v = num(values[i]);
      if (v === null) continue;
      rated.push({ i: i, v: v });
    }

    // 分數模式由高到低；名次模式由小到大
    rated.sort(function (a, b) {
      return mode === 'score' ? (b.v - a.v) || (a.i - b.i) : (a.v - b.v) || (a.i - b.i);
    });

    var out = [];
    for (i = 0; i < values.length; i++) out.push(null);

    var pos = 0;
    while (pos < rated.length) {
      var end = pos;
      while (end + 1 < rated.length && rated[end + 1].v === rated[pos].v) end++;
      var rank = tieMethod === 'average' ? ((pos + 1) + (end + 1)) / 2 : (pos + 1);
      for (k = pos; k <= end; k++) out[rated[k].i] = rank;
      pos = end + 1;
    }

    // 未評分者：補上剩餘名次的平均（視為並列末位）
    if (opts.fillMissing && rated.length < values.length) {
      var missingCount = values.length - rated.length;
      var fill = tieMethod === 'average'
        ? ((rated.length + 1) + values.length) / 2
        : (rated.length + 1);
      if (missingCount > 0) {
        for (i = 0; i < out.length; i++) if (out[i] === null) out[i] = fill;
      }
    }
    return out;
  }

  /** 名次向量由小到大排序後做字典序比較 → 實作「獲得較優名次較多者列前」 */
  function compareRankVector(a, b) {
    var n = Math.min(a.length, b.length);
    for (var i = 0; i < n; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  }

  var TIEBREAKERS = {
    // 較優名次個數比較法：名次和相同時，獲得較優名次較多者列前
    betterRank: {
      label: '較優名次個數',
      cmp: function (a, b) { return compareRankVector(a.rankVector, b.rankVector); }
    },
    // 原始總分較高者列前（僅在雙方皆有可比較的原始分數時生效）
    rawScore: {
      label: '原始總分',
      cmp: function (a, b) {
        if (a.rawTotal === null || b.rawTotal === null) return 0;
        if (a.rawCount !== b.rawCount) return 0; // 評分筆數不同不具可比性
        return b.rawTotal - a.rawTotal;
      }
    },
    // 主審（評審長）所評名次較優者列前
    chief: {
      label: '主審名次',
      cmp: function (a, b, ctx) {
        if (!ctx || !ctx.chiefJudgeId) return 0;
        var ra = a.perJudge[ctx.chiefJudgeId], rb = b.perJudge[ctx.chiefJudgeId];
        if (!ra || !rb || ra.rank === null || rb.rank === null) return 0;
        return ra.rank - rb.rank;
      }
    },
    // 出場序較前者列前（純粹為了產生穩定且可重現的結果）
    order: {
      label: '出場序',
      cmp: function (a, b) { return a.order - b.order; }
    }
  };

  var DEFAULT_TIEBREAKERS = ['betterRank', 'rawScore', 'chief'];

  function round(n, d) {
    if (n === null || n === undefined) return null;
    var p = Math.pow(10, d === undefined ? 2 : d);
    return Math.round(n * p) / p;
  }

  /**
   * 計算完整成績。
   * @param {Object} input
   *   entries  [{id, name}]                    參賽單位（陣列順序 = 出場序）
   *   judges   [{id, name, mode, chief}]       評審委員
   *   scores   { judgeId: { entryId: value } } 原始輸入
   *   awards   [{name, count}]                 獎項與名額
   *   options  見下方 defaults
   */
  function compute(input) {
    input = input || {};
    var entries = input.entries || [];
    var judges = input.judges || [];
    var scores = input.scores || {};
    var awards = input.awards || [];
    var o = input.options || {};

    var tieMethod = o.tieMethod === 'standard' ? 'standard' : 'average';
    var missingPolicy = o.missingPolicy === 'exclude' ? 'exclude' : 'last';
    // 空陣列代表使用者刻意停用所有決勝條件（名次和相同即並列）；
    // 只有欄位缺漏（非陣列）時才退回預設值。
    var tiebreakers = Array.isArray(o.tiebreakers)
      ? o.tiebreakers.filter(function (t) { return !!TIEBREAKERS[t]; })
      : DEFAULT_TIEBREAKERS.slice();
    var awardTiePolicy = o.awardTiePolicy === 'expand' ? 'expand' : 'carry';
    var remainderLabel = (o.remainderLabel || '').trim();

    var chiefJudge = null;
    for (var j = 0; j < judges.length; j++) if (judges[j].chief) { chiefJudge = judges[j]; break; }

    var issues = [];

    // ---- 1. 逐位委員換算名次 -------------------------------------------
    var perJudgeRanks = {}; // judgeId -> [rank|null]
    var judgeStats = {};    // judgeId -> { filled, total, duplicates, outOfRange }
    judges.forEach(function (judge) {
      var raw = entries.map(function (e) {
        var byJudge = scores[judge.id] || {};
        return num(byJudge[e.id]);
      });
      var filled = raw.filter(function (v) { return v !== null; }).length;

      // 名次模式的資料健檢
      var duplicates = [], outOfRange = [];
      if (judge.mode === 'rank') {
        var seen = {};
        raw.forEach(function (v, i) {
          if (v === null) return;
          if (v < 1 || v > entries.length || v % 1 !== 0) outOfRange.push(entries[i].name);
          if (seen[v]) duplicates.push(v); else seen[v] = true;
        });
      }
      judgeStats[judge.id] = {
        filled: filled, total: entries.length,
        duplicates: duplicates, outOfRange: outOfRange
      };
      if (filled > 0 && filled < entries.length) {
        issues.push({
          level: 'error', judgeId: judge.id,
          message: '「' + judge.name + '」尚有 ' + (entries.length - filled) + ' 個單位未評分'
        });
      }
      if (filled === 0) {
        issues.push({ level: 'error', judgeId: judge.id, message: '「' + judge.name + '」完全未評分' });
      }
      if (duplicates.length) {
        issues.push({
          level: 'warn', judgeId: judge.id,
          message: '「' + judge.name + '」有重複名次：' + duplicates.join('、') + '（將以並列計算）'
        });
      }
      if (outOfRange.length) {
        issues.push({
          level: 'warn', judgeId: judge.id,
          message: '「' + judge.name + '」名次超出 1–' + entries.length + ' 範圍：' + outOfRange.join('、')
        });
      }

      perJudgeRanks[judge.id] = toRanks(raw, {
        mode: judge.mode === 'rank' ? 'rank' : 'score',
        tieMethod: tieMethod,
        fillMissing: missingPolicy === 'last'
      });
    });

    // 納入計算的委員：missingPolicy = 'exclude' 時排除完全未評分者
    var activeJudges = judges.filter(function (jd) {
      return missingPolicy === 'exclude' ? judgeStats[jd.id].filled > 0 : true;
    });

    // ---- 2. 組成每個單位的成績列 ---------------------------------------
    var rows = entries.map(function (e, idx) {
      var perJudge = {};
      var sumRank = 0, rankVector = [], rawTotal = 0, rawCount = 0, rankedCount = 0;

      judges.forEach(function (judge) {
        var byJudge = scores[judge.id] || {};
        var rawVal = num(byJudge[e.id]);
        var rk = perJudgeRanks[judge.id][idx];
        perJudge[judge.id] = { raw: rawVal, rank: rk, mode: judge.mode };
        var counted = activeJudges.indexOf(judge) !== -1;
        if (counted && rk !== null) {
          sumRank += rk; rankVector.push(rk); rankedCount++;
        }
        if (counted && judge.mode !== 'rank' && rawVal !== null) { rawTotal += rawVal; rawCount++; }
      });

      rankVector.sort(function (a, b) { return a - b; });

      return {
        entryId: e.id,
        name: e.name,
        order: idx + 1,
        perJudge: perJudge,
        sumRank: round(sumRank, 2),
        avgRank: rankedCount ? round(sumRank / rankedCount, 2) : null,
        rankVector: rankVector,
        rawTotal: rawCount ? round(rawTotal, 2) : null,
        rawAvg: rawCount ? round(rawTotal / rawCount, 2) : null,
        rawCount: rawCount,
        rankedCount: rankedCount,
        place: null,
        award: '',
        decidedBy: null,
        tied: false
      };
    });

    // ---- 3. 排序 -------------------------------------------------------
    var ctx = { chiefJudgeId: chiefJudge ? chiefJudge.id : null };
    var chain = [{ key: 'sumRank', label: '名次和', cmp: function (a, b) { return a.sumRank - b.sumRank; } }];
    tiebreakers.forEach(function (key) {
      chain.push({ key: key, label: TIEBREAKERS[key].label, cmp: TIEBREAKERS[key].cmp });
    });

    function compareRows(a, b) {
      for (var i = 0; i < chain.length; i++) {
        var c = chain[i].cmp(a, b, ctx);
        if (c !== 0) return { cmp: c, by: chain[i] };
      }
      return { cmp: 0, by: null };
    }

    var sorted = rows.slice().sort(function (a, b) {
      var r = compareRows(a, b);
      return r.cmp !== 0 ? r.cmp : (a.order - b.order);
    });

    // ---- 4. 名次與並列判定 ---------------------------------------------
    var groups = [];   // 完全同分同名次者為一組
    var current = [];
    for (var i = 0; i < sorted.length; i++) {
      if (i === 0) { current = [sorted[i]]; continue; }
      var rel = compareRows(sorted[i - 1], sorted[i]);
      if (rel.cmp === 0) {
        current.push(sorted[i]);
      } else {
        groups.push(current);
        sorted[i].decidedBy = rel.by ? rel.by.key : null;
        current = [sorted[i]];
      }
    }
    if (current.length) groups.push(current);

    var place = 1;
    groups.forEach(function (g) {
      g.forEach(function (r) { r.place = place; r.tied = g.length > 1; });
      place += g.length;
    });

    // ---- 5. 獎項分配 ---------------------------------------------------
    var quotas = awards.map(function (a) {
      return { name: a.name, count: Math.max(0, parseInt(a.count, 10) || 0), left: Math.max(0, parseInt(a.count, 10) || 0) };
    });
    var adjustments = [];
    var qi = 0;
    function currentQuota() {
      while (qi < quotas.length && quotas[qi].left <= 0) qi++;
      return qi < quotas.length ? quotas[qi] : null;
    }

    for (var gi = 0; gi < groups.length; gi++) {
      var q = currentQuota();
      if (!q) break;
      var g2 = groups[gi];
      if (g2.length <= q.left) {
        g2.forEach(function (r) { r.award = q.name; });
        q.left -= g2.length;
      } else {
        var overflow = g2.length - q.left;
        g2.forEach(function (r) { r.award = q.name; });
        q.left = 0;
        if (awardTiePolicy === 'expand') {
          adjustments.push({
            type: 'expand', award: q.name, extra: overflow,
            message: '「' + q.name + '」因並列增額 ' + overflow + ' 名（原 ' + q.count + ' 名 → ' + (q.count + overflow) + ' 名）'
          });
        } else {
          var debt = overflow, jq = qi + 1;
          adjustments.push({
            type: 'carry', award: q.name, extra: overflow,
            message: '「' + q.name + '」因並列多錄取 ' + overflow + ' 名，後續獎項名額順延遞減'
          });
          while (debt > 0 && jq < quotas.length) {
            var take = Math.min(debt, quotas[jq].left);
            quotas[jq].left -= take; debt -= take;
            if (quotas[jq].left === 0 && quotas[jq].count > 0) {
              adjustments.push({
                type: 'reduced', award: quotas[jq].name,
                message: '「' + quotas[jq].name + '」名額由 ' + quotas[jq].count + ' 名減為 ' + (quotas[jq].count - take) + ' 名'
              });
            }
            jq++;
          }
        }
      }
    }

    if (remainderLabel) {
      sorted.forEach(function (r) { if (!r.award) r.award = remainderLabel; });
    }

    var totalQuota = quotas.reduce(function (s, q) { return s + q.count; }, 0);
    if (totalQuota > entries.length) {
      issues.push({
        level: 'warn',
        message: '獎項總名額 ' + totalQuota + ' 名超過參賽單位 ' + entries.length + ' 個，部分名額將從缺'
      });
    }

    return {
      rows: sorted,
      groups: groups,
      judgeStats: judgeStats,
      chiefJudgeId: ctx.chiefJudgeId,
      issues: issues,
      adjustments: adjustments,
      tiebreakChain: chain.map(function (c) { return { key: c.key, label: c.label }; }),
      complete: issues.filter(function (x) { return x.level === 'error'; }).length === 0 && entries.length > 0 && judges.length > 0
    };
  }

  return {
    toRanks: toRanks,
    compute: compute,
    TIEBREAKERS: TIEBREAKERS,
    DEFAULT_TIEBREAKERS: DEFAULT_TIEBREAKERS,
    _num: num
  };
});
