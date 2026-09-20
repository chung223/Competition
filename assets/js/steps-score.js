/* steps-score.js — 步驟 4：成績輸入 */
var StepScore = (function () {
  'use strict';

  var $ = U.$, $$ = U.$$, esc = U.esc;
  var host = null;

  function activeJudge() {
    var s = Store.get();
    var id = s.ui.activeJudge;
    var found = s.judges.filter(function (j) { return j.id === id; })[0];
    if (!found && s.judges.length) {
      found = s.judges[0];
      s.ui.activeJudge = found.id;
    }
    return found || null;
  }

  function judgeFilled(judge) {
    var s = Store.get();
    var m = s.scores[judge.id] || {};
    var n = 0;
    s.entries.forEach(function (e) {
      if (m[e.id] !== undefined && m[e.id] !== null && m[e.id] !== '') n++;
    });
    return n;
  }

  // ---- 版面 ------------------------------------------------------------
  function render() {
    host = $('#scoreArea');
    var s = Store.get();

    if (!s.entries.length || !s.judges.length) {
      host.innerHTML = '<div class="card"><div class="body"><div class="empty">' +
        '<strong>尚未完成前置設定</strong>請先在步驟 1 建立參賽單位，並於步驟 2 建立評審委員。</div></div></div>';
      return;
    }

    var total = s.entries.length * s.judges.length;
    var filled = s.judges.reduce(function (a, j) { return a + judgeFilled(j); }, 0);
    var pct = total ? Math.round(filled / total * 100) : 0;

    host.innerHTML =
      '<div class="card">' +
        '<header>' +
          '<h3>輸入方式</h3>' +
          '<div class="seg" role="group" aria-label="切換輸入版面">' +
            '<button type="button" data-view="byJudge" aria-pressed="' + (s.ui.scoreView !== 'grid') + '">逐位委員</button>' +
            '<button type="button" data-view="grid" aria-pressed="' + (s.ui.scoreView === 'grid') + '">總表一次填</button>' +
          '</div>' +
          '<span class="grow"></span>' +
          '<span class="tag ' + (filled === total ? 'ok' : 'warn') + '">已填 ' + filled + ' / ' + total + '</span>' +
          '<span class="progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
            '<i style="width:' + pct + '%"></i></span>' +
        '</header>' +
        '<div class="body tight" id="scoreBody"></div>' +
      '</div>';

    host.querySelector('.seg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-view]');
      if (!b) return;
      Store.update(function (st) { st.ui.scoreView = b.dataset.view; }, { reason: 'ui' });
    });

    if (s.ui.scoreView === 'grid') renderGrid();
    else renderByJudge();
  }

  // ---- 逐位委員 --------------------------------------------------------
  function renderByJudge() {
    var s = Store.get();
    var judge = activeJudge();
    var body = $('#scoreBody');
    var n = s.entries.length;

    var tabs = '<div class="judge-tabs" role="tablist">' + s.judges.map(function (j) {
      var f = judgeFilled(j);
      var cls = f === 0 ? '' : (f === n ? ' done' : ' part');
      return '<button type="button" role="tab" data-judge="' + esc(j.id) + '" ' +
        'aria-selected="' + (j.id === judge.id) + '">' +
        '<span class="dot' + cls + '"></span>' + esc(j.name) +
        (j.chief ? ' <span style="opacity:.7">·主審</span>' : '') + '</button>';
    }).join('') + '</div>';

    var isRank = judge.mode === 'rank';
    var showQuick = isRank && !!s.ui.quickRank;
    var toolbar =
      '<div class="row" style="padding:12px 14px;border-bottom:1px solid var(--c-border);gap:10px">' +
        '<strong style="font-size:15px">' + esc(judge.name) + '</strong>' +
        '<div class="seg" role="group" aria-label="填寫方式">' +
          '<button type="button" data-mode="score" aria-pressed="' + (!isRank) + '">填分數</button>' +
          '<button type="button" data-mode="rank" aria-pressed="' + isRank + '">填名次</button>' +
        '</div>' +
        '<span class="grow" style="flex:1 1 auto"></span>' +
        (isRank ? '<button class="btn sm" data-act="quick" aria-pressed="' + showQuick + '">' +
          (showQuick ? '✕ 收起點選排序' : '點選排序') + '</button>' : '') +
        '<button class="btn sm danger" data-act="clear">清除本位成績</button>' +
      '</div>';

    var head = isRank
      ? '<tr><th class="order-col">出場</th><th>參賽單位</th><th style="width:110px">名次</th><th style="width:80px">檢核</th></tr>'
      : '<tr><th class="order-col">出場</th><th>參賽單位</th><th style="width:110px">分數</th><th style="width:80px">換算名次</th></tr>';

    var rows = s.entries.map(function (e, i) {
      return '<tr data-entry="' + esc(e.id) + '">' +
        '<td class="order-col">' + (i + 1) + '</td>' +
        '<td class="name-col">' + esc(e.name) + '</td>' +
        '<td><input class="cell-input" inputmode="decimal" data-r="' + i + '" data-c="0" ' +
          'data-judge="' + esc(judge.id) + '" data-entry="' + esc(e.id) + '" ' +
          'value="' + esc(Store.getScore(judge.id, e.id)) + '" ' +
          'aria-label="' + esc(judge.name + ' 給 ' + e.name + ' 的' + (isRank ? '名次' : '分數')) + '"></td>' +
        '<td class="rank-preview" data-cell="' + esc(judge.id) + '|' + esc(e.id) + '">—</td>' +
      '</tr>';
    }).join('');

    body.innerHTML = tabs + toolbar +
      '<div id="quickPanel"' + (showQuick ? '' : ' hidden') + '></div>' +
      '<div class="tbl-scroll"><table class="data"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>' +
      '<div style="padding:10px 14px;font-size:12.5px;color:var(--c-text-3);border-top:1px solid var(--c-border)">' +
        '↑↓ 移動 · Enter 下一列 · 可直接從試算表整欄複製後貼上' +
      '</div>';

    body.querySelector('.judge-tabs').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-judge]');
      if (!b) return;
      Store.update(function (st) { st.ui.activeJudge = b.dataset.judge; }, { reason: 'ui' });
    });

    body.querySelector('.seg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mode]');
      if (!b || b.dataset.mode === judge.mode) return;
      Store.update(function (st) {
        var j = st.judges.filter(function (x) { return x.id === judge.id; })[0];
        if (j) j.mode = b.dataset.mode;
      }, { reason: 'judge-mode' });
    });

    body.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]');
      if (!b) return;
      if (b.dataset.act === 'clear') {
        U.confirm('清除成績', '將清除「' + judge.name + '」已輸入的所有成績。', function () {
          Store.clearJudgeScores(judge.id);
          Store.emit('scores');
        }, '確定清除');
      } else if (b.dataset.act === 'quick') {
        Store.update(function (st) { st.ui.quickRank = !st.ui.quickRank; }, { reason: 'ui' });
      }
    });

    if (showQuick) renderQuickRank(judge);
    bindGridKeys(body, s.entries.length, 1);
    refreshDerived();
  }

  /** 名次模式：依偏好順序點選，自動指派 1、2、3… */
  function renderQuickRank(judge) {
    var s = Store.get();
    var p = $('#quickPanel');
    var used = {};
    s.entries.forEach(function (e) {
      var v = Store.getScore(judge.id, e.id);
      if (v !== '') used[e.id] = Number(v);
    });
    var next = 1;
    while (Object.keys(used).some(function (k) { return used[k] === next; })) next++;

    p.innerHTML =
      '<div style="padding:11px 14px 0;font-size:13px;color:var(--c-text-2)">' +
        '依名次由高到低點選單位，系統自動填入 1、2、3…　下一個將指派 <strong>第 ' + next + ' 名</strong>' +
      '</div>' +
      '<div class="quickrank">' + s.entries.map(function (e) {
        var done = used[e.id] !== undefined;
        return '<button type="button" data-qr="' + esc(e.id) + '"' + (done ? ' disabled' : '') + '>' +
          (done ? '<span class="badge">' + used[e.id] + '</span>' : '') + esc(e.name) + '</button>';
      }).join('') + '</div>' +
      '<div style="padding:0 14px 12px"><button class="btn sm" data-qr-reset>重設本位名次</button></div>';

    p.onclick = function (e) {
      if (e.target.closest('[data-qr-reset]')) {
        Store.clearJudgeScores(judge.id);
        Store.emit('scores');
        return;
      }
      var b = e.target.closest('button[data-qr]');
      if (!b) return;
      Store.setScore(judge.id, b.dataset.qr, next);
      Store.emit('scores');
    };
  }

  // ---- 總表 ------------------------------------------------------------
  function renderGrid() {
    var s = Store.get();
    var body = $('#scoreBody');

    var head = '<tr><th class="order-col">出場</th><th>參賽單位</th>' +
      s.judges.map(function (j) {
        return '<th class="c" style="min-width:96px">' + esc(j.name) +
          '<small style="display:block;font-weight:400;color:var(--c-text-3)">' +
          (j.mode === 'rank' ? '名次' : '分數') + '</small></th>';
      }).join('') +
      '<th class="c" style="width:82px">名次和</th><th class="c" style="width:74px">暫定</th></tr>';

    var rows = s.entries.map(function (e, i) {
      return '<tr data-entry="' + esc(e.id) + '">' +
        '<td class="order-col">' + (i + 1) + '</td>' +
        '<td class="name-col">' + esc(e.name) + '</td>' +
        s.judges.map(function (j, c) {
          return '<td class="c"><input class="cell-input" style="width:82px" inputmode="decimal" ' +
            'data-r="' + i + '" data-c="' + c + '" data-judge="' + esc(j.id) + '" data-entry="' + esc(e.id) + '" ' +
            'value="' + esc(Store.getScore(j.id, e.id)) + '" ' +
            'aria-label="' + esc(j.name + ' 給 ' + e.name) + '"></td>';
        }).join('') +
        '<td class="rank-preview" data-sum="' + esc(e.id) + '">—</td>' +
        '<td class="rank-preview muted" data-place="' + esc(e.id) + '">—</td>' +
      '</tr>';
    }).join('');

    body.innerHTML =
      '<div class="tbl-scroll"><table class="data"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>' +
      '<div style="padding:10px 14px;font-size:12.5px;color:var(--c-text-3);border-top:1px solid var(--c-border)">' +
        '方向鍵移動 · Enter 下一列 · Tab 下一位委員 · 可從試算表整塊複製後貼上' +
      '</div>';

    bindGridKeys(body, s.entries.length, s.judges.length);
    refreshDerived();
  }

  // ---- 共用：鍵盤、貼上、輸入 -------------------------------------------
  function bindGridKeys(root, rowCount, colCount) {
    function cell(r, c) { return root.querySelector('.cell-input[data-r="' + r + '"][data-c="' + c + '"]'); }
    function focusCell(r, c) {
      var el = cell(Math.max(0, Math.min(rowCount - 1, r)), Math.max(0, Math.min(colCount - 1, c)));
      if (el) { el.focus(); el.select(); }
    }

    root.addEventListener('input', function (e) {
      var inp = e.target.closest('.cell-input');
      if (!inp) return;
      Store.setScore(inp.dataset.judge, inp.dataset.entry, inp.value.trim());
      refreshDerived();
      App.refreshChrome();
    });

    root.addEventListener('keydown', function (e) {
      var inp = e.target.closest('.cell-input');
      if (!inp) return;
      var r = +inp.dataset.r, c = +inp.dataset.c;
      if (e.key === 'ArrowDown' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); focusCell(r + 1, c); }
      else if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) { e.preventDefault(); focusCell(r - 1, c); }
      else if (e.key === 'ArrowLeft' && inp.selectionStart === 0) { e.preventDefault(); focusCell(r, c - 1); }
      else if (e.key === 'ArrowRight' && inp.selectionStart === inp.value.length) { e.preventDefault(); focusCell(r, c + 1); }
    });

    root.addEventListener('paste', function (e) {
      var inp = e.target.closest('.cell-input');
      if (!inp) return;
      var text = (e.clipboardData || window.clipboardData).getData('text') || '';
      if (!/[\n\t]/.test(text)) return;   // 單一數值交給瀏覽器預設行為
      e.preventDefault();
      var grid = text.replace(/\r/g, '').split('\n').map(function (line) { return line.split('\t'); });
      var r0 = +inp.dataset.r, c0 = +inp.dataset.c, count = 0;
      grid.forEach(function (line, dr) {
        line.forEach(function (val, dc) {
          var target = cell(r0 + dr, c0 + dc);
          if (!target) return;
          var v = String(val).trim();
          target.value = v;
          Store.setScore(target.dataset.judge, target.dataset.entry, v);
          count++;
        });
      });
      refreshDerived();
      App.refreshChrome();
      U.toast('已貼上 ' + count + ' 筆');
    });
  }

  /** 只更新推導欄位，不重建輸入框，避免打字時失焦 */
  function refreshDerived() {
    var s = Store.get();
    if (!s.entries.length || !s.judges.length) return;
    var res = Store.computeResult();

    // 所有輸入格：文字無法解析為數值時標紅（此時不會寫入 state）
    var invalid = {};
    $$('.cell-input', host).forEach(function (inp) {
      var text = inp.value.trim();
      var bad = text !== '' && !isFinite(Number(text));
      invalid[inp.dataset.judge + '|' + inp.dataset.entry] = bad;
      inp.classList.toggle('is-bad', bad);
    });

    // 逐位委員：換算名次 + 名次模式檢核
    var judge = activeJudge();
    if (judge && s.ui.scoreView !== 'grid') {
      var stats = res.judgeStats[judge.id] || {};
      var dupSet = {};
      (stats.duplicates || []).forEach(function (v) { dupSet[v] = 1; });
      s.entries.forEach(function (e) {
        var td = host.querySelector('[data-cell="' + cssEsc(judge.id) + '|' + cssEsc(e.id) + '"]');
        if (!td) return;
        var raw = Store.getScore(judge.id, e.id);
        var isInvalid = invalid[judge.id + '|' + e.id];
        var pj = res.rows.filter(function (r) { return r.entryId === e.id; })[0];
        var rk = pj ? pj.perJudge[judge.id] : null;
        if (isInvalid) {
          td.textContent = '⚠ 非數值';
          td.classList.remove('muted');
          td.style.color = 'var(--c-err)';
          td.style.fontSize = '11.5px';
        } else if (raw === '') { td.textContent = '—'; td.classList.add('muted'); td.style.color = ''; td.style.fontSize = ''; }
        else if (judge.mode === 'rank') {
          var bad = dupSet[Number(raw)] || Number(raw) < 1 || Number(raw) > s.entries.length;
          td.textContent = bad ? '⚠ 重複/超範圍' : '✓';
          td.classList.toggle('muted', !bad);
          td.style.color = bad ? 'var(--c-err)' : 'var(--c-ok)';
          td.style.fontSize = bad ? '11.5px' : '';
        } else {
          td.textContent = rk && rk.rank !== null ? U.fmt(rk.rank) : '—';
          td.classList.remove('muted');
        }
        var inp = host.querySelector('.cell-input[data-judge="' + cssEsc(judge.id) + '"][data-entry="' + cssEsc(e.id) + '"]');
        if (inp && judge.mode === 'rank' && !isInvalid) {
          inp.classList.toggle('is-bad', raw !== '' && !!(dupSet[Number(raw)] || Number(raw) < 1 || Number(raw) > s.entries.length));
        }
      });
      // 分頁進度點
      $$('.judge-tabs button[data-judge]').forEach(function (b) {
        var j = s.judges.filter(function (x) { return x.id === b.dataset.judge; })[0];
        if (!j) return;
        var f = judgeFilled(j);
        var dot = b.querySelector('.dot');
        dot.className = 'dot' + (f === 0 ? '' : (f === s.entries.length ? ' done' : ' part'));
      });
    }

    // 總表：名次和與暫定名次
    if (s.ui.scoreView === 'grid') {
      res.rows.forEach(function (row) {
        var tdSum = host.querySelector('[data-sum="' + cssEsc(row.entryId) + '"]');
        var tdPl = host.querySelector('[data-place="' + cssEsc(row.entryId) + '"]');
        if (tdSum) tdSum.textContent = row.rankedCount ? U.fmt(row.sumRank) : '—';
        if (tdPl) tdPl.textContent = row.rankedCount ? String(row.place) : '—';
      });
    }

    // 上方進度
    var total = s.entries.length * s.judges.length;
    var filled = s.judges.reduce(function (a, j) { return a + judgeFilled(j); }, 0);
    var tag = host.querySelector('.card > header .tag');
    var bar = host.querySelector('.progress i');
    if (tag) {
      tag.textContent = '已填 ' + filled + ' / ' + total;
      tag.className = 'tag ' + (filled === total ? 'ok' : 'warn');
    }
    if (bar) bar.style.width = (total ? Math.round(filled / total * 100) : 0) + '%';
  }

  /** 屬性選擇器中的 id 皆由 uid() 產生（僅含英數與底線），此處仍做基本防護 */
  function cssEsc(v) { return String(v).replace(/["\\]/g, '\\$&'); }

  return { render: render };
})();
