/* app.js — 應用外殼：步驟導覽、主題、檔案作業 */
var App = (function () {
  'use strict';

  var $ = U.$, $$ = U.$$, esc = U.esc;
  var THEME_KEY = 'competition-rank:theme';

  var STEPS = [
    { n: 1, label: '參賽單位', sub: '出場順序' },
    { n: 2, label: '評審委員', sub: '人數與姓名' },
    { n: 3, label: '獎項名額', sub: '計分規則' },
    { n: 4, label: '輸入成績', sub: '分數或名次' },
    { n: 5, label: '成績結果', sub: '輸出成績單' }
  ];

  // ---- 主題 ------------------------------------------------------------
  function initTheme() {
    var saved = '';
    try { saved = localStorage.getItem(THEME_KEY) || ''; } catch (e) {}
    document.documentElement.setAttribute('data-theme', saved);
    $('#btnTheme').addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') || '';
      var next = cur === '' ? 'light' : (cur === 'light' ? 'dark' : '');
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      U.toast(next === '' ? '跟隨系統主題' : (next === 'light' ? '淺色主題' : '深色主題'));
    });
  }

  // ---- 步驟導覽 --------------------------------------------------------
  function go(step) {
    step = Math.max(1, Math.min(5, step));
    Store.update(function (s) { s.ui.step = step; }, { reason: 'step' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderStepper() {
    var s = Store.get();
    var st = Store.stepStatus();
    $('#stepper').innerHTML = STEPS.map(function (x) {
      var cls = [];
      if (s.ui.step === x.n) cls.push('is-active');
      else if (st[x.n] && st[x.n].done) cls.push('is-done');
      return '<li class="' + cls.join(' ') + '">' +
        '<button type="button" data-step="' + x.n + '"' + (s.ui.step === x.n ? ' aria-current="step"' : '') + '>' +
          '<span class="num"><span>' + x.n + '</span></span>' +
          '<span><span class="lbl">' + x.label + '</span><span class="sub">' + x.sub + '</span></span>' +
        '</button></li>';
    }).join('');
  }

  function renderNav() {
    var s = Store.get();
    var st = Store.stepStatus();
    var cur = st[s.ui.step] || {};
    $('#btnPrev').disabled = s.ui.step === 1;
    var next = $('#btnNext');
    if (s.ui.step === 5) {
      next.textContent = '重新檢視設定';
      next.classList.remove('primary');
    } else {
      next.textContent = s.ui.step === 4 ? '查看成績 →' : '下一步 →';
      next.classList.add('primary');
    }
    var status = $('#navStatus');
    if (s.ui.step === 4 && cur.total) {
      status.textContent = cur.msg || '成績已輸入完整，可查看結果';
      status.classList.toggle('bad', !!cur.msg);
    } else {
      status.textContent = cur.msg || '';
      status.classList.toggle('bad', !!cur.msg);
    }
  }

  function refreshChrome() {
    var s = Store.get();
    var bits = [s.meta.title, s.meta.group].filter(Boolean);
    $('#appbarMeta').textContent = bits.length
      ? bits.join('　·　') + '　·　' + s.entries.length + ' 單位 / ' + s.judges.length + ' 委員'
      : (s.entries.length ? s.entries.length + ' 單位 / ' + s.judges.length + ' 委員' : '');
    renderStepper();
    renderNav();
  }

  function render() {
    var s = Store.get();
    STEPS.forEach(function (x) { $('#step-' + x.n).hidden = (x.n !== s.ui.step); });
    if (s.ui.step <= 3) StepSetup.render(s.ui.step);
    else if (s.ui.step === 4) StepScore.render();
    else StepResult.render();
    refreshChrome();
  }

  // ---- 檔案作業 --------------------------------------------------------
  function openMenu() {
    var menu = U.modal({
      title: '檔案與資料',
      okText: null,
      cancelText: '關閉',
      body:
        '<div class="grid" style="gap:10px">' +
          '<button class="btn" data-file="save">💾 下載專案檔（JSON）</button>' +
          '<button class="btn" data-file="open">📂 開啟專案檔（JSON）</button>' +
          '<button class="btn" data-file="sample">🧪 載入範例資料</button>' +
          '<button class="btn danger" data-file="reset">🗑 清除所有資料，重新開始</button>' +
        '</div>' +
        '<p class="tip" style="margin-top:14px;font-size:12.5px;color:var(--c-text-3)">' +
          '本工具所有資料只存在你目前這台裝置的瀏覽器中，不會上傳到任何伺服器。' +
          '換裝置或交接工作時，請用「下載專案檔」帶走資料。</p>' +
        '<input type="file" id="fileInput" accept="application/json,.json" hidden>'
    });

    var box = menu.el;
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-file]');
      if (!b) return;
      var act = b.dataset.file;
      if (act === 'save') {
        var s = Store.get();
        U.download(Exporter.baseFilename(s) + '.json', JSON.stringify(s, null, 2), 'application/json');
        U.toast('已下載專案檔');
        menu.close();
      } else if (act === 'open') {
        // 保留選單，等 file input 的 change 事件完成後再關閉
        box.querySelector('#fileInput').click();
      } else if (act === 'sample') {
        menu.close();
        U.confirm('載入範例資料', '將以一份示範賽事取代目前所有資料。', function () {
          Store.replace(sampleData());
          go(5);
          U.toast('已載入範例資料');
        }, '載入範例');
      } else if (act === 'reset') {
        menu.close();
        U.confirm('清除所有資料', '將刪除本機儲存的全部賽事資料，此動作無法復原。建議先下載專案檔備份。', function () {
          Store.reset();
          U.toast('已清除，可重新開始');
        }, '確定清除');
      }
    });

    box.querySelector('#fileInput').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          if (!data || typeof data !== 'object') throw new Error('bad');
          Store.replace(data);
          U.toast('已開啟專案檔');
          menu.close();
        } catch (err) {
          U.toast('檔案格式不正確，無法開啟', 'err');
        }
      };
      reader.readAsText(f);
    });
  }

  function sampleData() {
    var entryNames = ['中正國小', '明德國小', '信義國小', '和平國小', '光復國小', '文昌國小', '大同國小'];
    var judgeNames = ['王大明', '李淑芬', '陳志豪', '林雅婷', '黃建國'];
    var entries = entryNames.map(function (n) { return { id: U.uid('e'), name: n }; });
    var judges = judgeNames.map(function (n, i) {
      return { id: U.uid('j'), name: n, mode: i === 4 ? 'rank' : 'score', chief: i === 0 };
    });
    // 刻意讓委員給分寬嚴不同，凸顯名次法的作用
    var bases = [92, 78, 88, 95, 0];
    var spreads = [1.6, 3.2, 2.1, 1.1, 0];
    var prefs = [
      [1, 3, 2, 5, 4, 7, 6],
      [2, 1, 3, 4, 6, 5, 7],
      [1, 2, 4, 3, 5, 6, 7],
      [2, 3, 1, 4, 5, 7, 6],
      [1, 2, 3, 5, 4, 6, 7]
    ];
    var scores = {};
    judges.forEach(function (j, ji) {
      scores[j.id] = {};
      entries.forEach(function (e, ei) {
        var rank = prefs[ji][ei];
        scores[j.id][e.id] = j.mode === 'rank'
          ? rank
          : Math.round((bases[ji] - (rank - 1) * spreads[ji]) * 10) / 10;
      });
    });
    var d = Store.defaults();
    d.meta = { title: '114 學年度全市學生音樂比賽', group: '國小團體組　直笛合奏', date: U.todayISO(), venue: '市立文化中心演奏廳' };
    d.entries = entries;
    d.judges = judges;
    d.scores = scores;
    d.awards = [
      { id: U.uid('a'), name: '特優', count: 2 },
      { id: U.uid('a'), name: '優等', count: 3 }
    ];
    d.options.remainderLabel = '甲等';
    d.ui.step = 5;
    d.ui.activeJudge = judges[0].id;
    return d;
  }

  // ---- 啟動 ------------------------------------------------------------
  function init() {
    Store.load();
    initTheme();
    StepSetup.init();

    $('#stepper').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-step]');
      if (b) go(+b.dataset.step);
    });
    $('#btnPrev').addEventListener('click', function () { go(Store.get().ui.step - 1); });
    $('#btnNext').addEventListener('click', function () {
      var s = Store.get();
      if (s.ui.step === 5) return go(1);
      var st = Store.stepStatus()[s.ui.step];
      if (st && !st.done && s.ui.step <= 3) {
        U.toast(st.msg, 'err');
        return;
      }
      go(s.ui.step + 1);
    });
    $('#btnMenu').addEventListener('click', openMenu);

    Store.on(function (state, reason) {
      if (reason === 'entry-name' || reason === 'judge-name' || reason === 'award-edit' || reason === 'meta') return;
      render();
    });

    Store.setSaveState('saved');
    render();

    // 首次使用時給一點方向
    var s = Store.get();
    if (!s.entries.length && !s.judges.length) {
      setTimeout(function () { U.toast('可從「檔案 → 載入範例資料」先看看完整流程'); }, 700);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { go: go, render: render, refreshChrome: refreshChrome, sampleData: sampleData };
})();
