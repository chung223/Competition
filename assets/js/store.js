/* store.js — 應用狀態、自動存檔、匯入匯出 */
var Store = (function () {
  'use strict';

  var KEY = 'competition-rank:v1';
  var listeners = [];
  var saveTimer = null;
  var state = null;

  function defaults() {
    return {
      version: 1,
      meta: { title: '', group: '', date: U.todayISO(), venue: '' },
      entries: [],
      judges: [],
      scores: {},
      awards: [],
      options: {
        tieMethod: 'average',
        missingPolicy: 'last',
        awardTiePolicy: 'carry',
        remainderLabel: '',
        tiebreakers: Rank.DEFAULT_TIEBREAKERS.slice()
      },
      display: {
        showJudgeColumns: true,
        anonymousJudges: false,
        showRawScores: false,
        showSumRank: true,
        showAvgRank: false
      },
      ui: { step: 1, activeJudge: null, scoreView: 'byJudge', quickRank: false }
    };
  }

  function migrate(raw) {
    var d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    var s = {
      version: 1,
      meta: Object.assign({}, d.meta, raw.meta || {}),
      entries: Array.isArray(raw.entries) ? raw.entries : [],
      judges: Array.isArray(raw.judges) ? raw.judges : [],
      scores: (raw.scores && typeof raw.scores === 'object') ? raw.scores : {},
      awards: Array.isArray(raw.awards) ? raw.awards : [],
      options: Object.assign({}, d.options, raw.options || {}),
      display: Object.assign({}, d.display, raw.display || {}),
      ui: Object.assign({}, d.ui, raw.ui || {})
    };
    // 欄位正規化，避免匯入的檔案缺欄位造成後續錯誤
    s.entries = s.entries.filter(Boolean).map(function (e) {
      return { id: e.id || U.uid('e'), name: String(e.name || '').trim() || '未命名單位' };
    });
    s.judges = s.judges.filter(Boolean).map(function (j) {
      return {
        id: j.id || U.uid('j'),
        name: String(j.name || '').trim() || '評審委員',
        mode: j.mode === 'rank' ? 'rank' : 'score',
        chief: !!j.chief
      };
    });
    s.awards = s.awards.filter(Boolean).map(function (a) {
      return { id: a.id || U.uid('a'), name: String(a.name || '').trim() || '獎項', count: Math.max(0, parseInt(a.count, 10) || 0) };
    });
    if (!Array.isArray(s.options.tiebreakers)) s.options.tiebreakers = d.options.tiebreakers.slice();
    return s;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      state = raw ? migrate(JSON.parse(raw)) : defaults();
    } catch (err) {
      state = defaults();
    }
    return state;
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      return false;
    }
  }

  function get() { return state; }

  /** 修改狀態並觸發重繪；mutator 內直接改 state */
  function update(mutator, opts) {
    opts = opts || {};
    mutator(state);
    scheduleSave();
    if (!opts.silent) emit(opts.reason || 'update');
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    setSaveState('saving');
    saveTimer = setTimeout(function () {
      setSaveState(persist() ? 'saved' : 'error');
    }, 350);
  }

  function setSaveState(s) {
    var el = U.$('#saveState');
    if (!el) return;
    if (s === 'saving') { el.textContent = '儲存中…'; el.classList.add('is-saving'); }
    else if (s === 'error') { el.textContent = '⚠ 無法自動儲存'; el.classList.add('is-saving'); }
    else { el.textContent = '已自動儲存'; el.classList.remove('is-saving'); }
  }

  function on(fn) { listeners.push(fn); }
  function emit(reason) { listeners.forEach(function (fn) { fn(state, reason); }); }

  function reset() {
    state = defaults();
    persist();
    emit('reset');
  }

  function replace(next) {
    state = migrate(next);
    persist();
    emit('replace');
  }

  // ---- 分數存取 -------------------------------------------------------
  function getScore(judgeId, entryId) {
    var m = state.scores[judgeId];
    var v = m ? m[entryId] : null;
    return (v === null || v === undefined) ? '' : v;
  }
  function setScore(judgeId, entryId, value) {
    if (!state.scores[judgeId]) state.scores[judgeId] = {};
    if (value === '' || value === null || value === undefined) delete state.scores[judgeId][entryId];
    else state.scores[judgeId][entryId] = Number(value);
    scheduleSave();
  }
  function clearJudgeScores(judgeId) {
    state.scores[judgeId] = {};
    scheduleSave();
  }

  /** 移除已不存在的單位／委員所留下的孤兒分數 */
  function prune() {
    var entryIds = {}, judgeIds = {};
    state.entries.forEach(function (e) { entryIds[e.id] = 1; });
    state.judges.forEach(function (j) { judgeIds[j.id] = 1; });
    Object.keys(state.scores).forEach(function (jid) {
      if (!judgeIds[jid]) { delete state.scores[jid]; return; }
      Object.keys(state.scores[jid]).forEach(function (eid) {
        if (!entryIds[eid]) delete state.scores[jid][eid];
      });
    });
  }

  function computeResult() {
    var s = state;
    return Rank.compute({
      entries: s.entries,
      judges: s.judges,
      scores: s.scores,
      awards: s.awards,
      options: s.options
    });
  }

  /** 各步驟的完成度，供步驟列與導覽按鈕判斷 */
  function stepStatus() {
    var s = state;
    var filled = 0, total = s.judges.length * s.entries.length;
    s.judges.forEach(function (j) {
      var m = s.scores[j.id] || {};
      s.entries.forEach(function (e) {
        if (m[e.id] !== undefined && m[e.id] !== null && m[e.id] !== '') filled++;
      });
    });
    return {
      1: { done: s.entries.length >= 2, msg: s.entries.length >= 2 ? '' : '請至少建立 2 個參賽單位' },
      2: { done: s.judges.length >= 1, msg: s.judges.length >= 1 ? '' : '請至少建立 1 位評審委員' },
      3: { done: s.awards.length >= 1, msg: s.awards.length >= 1 ? '' : '請至少設定 1 個獎項（或新增後將名額設為 0）' },
      4: { done: total > 0 && filled === total, filled: filled, total: total,
           msg: total === 0 ? '請先完成前面步驟' : (filled === total ? '' : '尚有 ' + (total - filled) + ' 格未填寫') },
      5: { done: false, msg: '' }
    };
  }

  return {
    KEY: KEY, defaults: defaults, load: load, get: get, update: update, on: on, emit: emit,
    reset: reset, replace: replace, persist: persist, prune: prune,
    getScore: getScore, setScore: setScore, clearJudgeScores: clearJudgeScores,
    computeResult: computeResult, stepStatus: stepStatus, setSaveState: setSaveState
  };
})();
