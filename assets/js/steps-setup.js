/* steps-setup.js — 步驟 1~3：參賽單位、評審委員、獎項與規則 */
var StepSetup = (function () {
  'use strict';

  var $ = U.$, esc = U.esc;

  var AWARD_PRESETS = {
    rank3:     [['一等獎', 1], ['二等獎', 2], ['三等獎', 3]],
    medal:     [['金牌', 1], ['銀牌', 1], ['銅牌', 1]],
    excellent: [['特優', 2], ['優等', 3], ['甲等', 4]],
    top3:      [['第一名', 1], ['第二名', 1], ['第三名', 1]]
  };

  // ===================== 步驟 1：參賽單位 =====================
  function renderEntries() {
    var s = Store.get();
    var ul = $('#entryList');
    if (!ul) return;

    $('#entryCount').textContent = s.entries.length + ' 個單位';

    if (!s.entries.length) {
      ul.innerHTML =
        '<li style="display:block"><div class="empty">' +
          '<strong>尚未建立參賽單位</strong>' +
          '用「批次輸入」貼上整份名單，或用「自動產生編號」快速建立。' +
        '</div></li>';
      return;
    }

    ul.innerHTML = s.entries.map(function (e, i) {
      return '<li draggable="true" data-id="' + esc(e.id) + '">' +
        '<span class="handle" aria-hidden="true">⠿</span>' +
        '<span class="idx">' + (i + 1) + '</span>' +
        '<span class="grow"><input type="text" value="' + esc(e.name) + '" data-field="name" ' +
          'aria-label="第 ' + (i + 1) + ' 個單位名稱" autocomplete="off"></span>' +
        '<span class="actions">' +
          '<button type="button" data-act="up" title="上移" aria-label="上移">▲</button>' +
          '<button type="button" data-act="down" title="下移" aria-label="下移">▼</button>' +
          '<button type="button" data-act="del" class="del" title="刪除" aria-label="刪除">✕</button>' +
        '</span></li>';
    }).join('');
  }

  function bindEntries() {
    var ul = $('#entryList');

    ul.addEventListener('input', function (e) {
      var inp = e.target.closest('input[data-field="name"]');
      if (!inp) return;
      var id = inp.closest('li').dataset.id;
      Store.update(function (s) {
        var it = s.entries.filter(function (x) { return x.id === id; })[0];
        if (it) it.name = inp.value;
      }, { silent: true, reason: 'entry-name' });
      App.refreshChrome();
    });

    ul.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var li = btn.closest('li'), id = li.dataset.id;
      Store.update(function (s) {
        var i = s.entries.map(function (x) { return x.id; }).indexOf(id);
        if (i < 0) return;
        var act = btn.dataset.act;
        if (act === 'up') U.move(s.entries, i, i - 1);
        else if (act === 'down') U.move(s.entries, i, i + 1);
        else if (act === 'del') { s.entries.splice(i, 1); Store.prune(); }
      }, { reason: 'entries' });
    });

    U.makeSortable(ul, function (from, to) {
      Store.update(function (s) { U.move(s.entries, from, to); }, { reason: 'entries' });
    });

    $('#btnAddEntry').addEventListener('click', function () {
      Store.update(function (s) {
        s.entries.push({ id: U.uid('e'), name: '' });
      }, { reason: 'entries' });
      var inputs = U.$$('#entryList input[data-field="name"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });

    $('#btnBulkEntries').addEventListener('click', openBulkEntries);
    $('#btnGenEntries').addEventListener('click', openGenEntries);

    $('#btnShuffleEntries').addEventListener('click', function () {
      if (Store.get().entries.length < 2) return U.toast('至少需要 2 個單位', 'err');
      U.confirm('隨機抽籤排定出場序', '將重新隨機排列目前所有參賽單位的順序，已輸入的成績會跟著單位一起移動。', function () {
        Store.update(function (s) {
          for (var i = s.entries.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = s.entries[i]; s.entries[i] = s.entries[j]; s.entries[j] = t;
          }
        }, { reason: 'entries' });
        U.toast('已重新抽籤排序');
      }, '開始抽籤');
    });

    $('#btnClearEntries').addEventListener('click', function () {
      if (!Store.get().entries.length) return;
      U.confirm('清空參賽單位', '將刪除所有參賽單位，已輸入的成績也會一併移除。此動作無法復原。', function () {
        Store.update(function (s) { s.entries = []; Store.prune(); }, { reason: 'entries' });
      }, '確定清空');
    });

    ['metaTitle', 'metaGroup', 'metaDate', 'metaVenue'].forEach(function (id) {
      var el = $('#' + id);
      var key = id.replace('meta', '').toLowerCase();
      el.addEventListener('input', function () {
        Store.update(function (s) { s.meta[key] = el.value; }, { silent: true, reason: 'meta' });
        App.refreshChrome();
      });
    });
  }

  function openBulkEntries() {
    U.modal({
      title: '批次輸入參賽單位',
      body:
        '<p style="color:var(--c-text-2);font-size:13.5px">一行一個單位，<strong>由上而下即為出場序</strong>。' +
        '行首的「1.」「(2)」「03、」等編號會自動移除。</p>' +
        '<textarea id="bulkText" placeholder="中正國小&#10;明德國小&#10;信義國小" spellcheck="false"></textarea>' +
        '<div class="row" style="margin-top:12px">' +
          '<label class="chk"><input type="radio" name="bulkMode" value="replace" checked>取代現有名單</label>' +
          '<label class="chk"><input type="radio" name="bulkMode" value="append">附加到名單後面</label>' +
        '</div>',
      okText: '匯入',
      onOk: function (root) {
        var names = U.parseList(root.querySelector('#bulkText').value);
        if (!names.length) { U.toast('沒有可匯入的內容', 'err'); return false; }
        var mode = root.querySelector('input[name="bulkMode"]:checked').value;
        Store.update(function (s) {
          var list = names.map(function (n) { return { id: U.uid('e'), name: n }; });
          if (mode === 'replace') { s.entries = list; Store.prune(); }
          else s.entries = s.entries.concat(list);
        }, { reason: 'entries' });
        U.toast('已匯入 ' + names.length + ' 個單位');
      }
    });
  }

  function openGenEntries() {
    U.modal({
      title: '自動產生編號單位',
      body:
        '<div class="grid cols-3">' +
          '<label class="field"><span class="lab">前綴</span><input type="text" id="gPre" value="第" autocomplete="off"></label>' +
          '<label class="field"><span class="lab">起始號碼</span><input type="number" id="gStart" value="1" min="0"></label>' +
          '<label class="field"><span class="lab">數量</span><input type="number" id="gCount" value="10" min="1" max="300"></label>' +
          '<label class="field"><span class="lab">後綴</span><input type="text" id="gSuf" value="隊" autocomplete="off"></label>' +
          '<label class="field"><span class="lab">補零位數</span><input type="number" id="gPad" value="0" min="0" max="4">' +
            '<span class="tip">0 = 不補零</span></label>' +
        '</div>' +
        '<div class="note info" style="margin:14px 0 0"><span class="ico">👁</span><div id="gPreview"></div></div>',
      okText: '產生',
      onOk: function (root) {
        var v = readGen(root);
        if (!v.count) { U.toast('數量需大於 0', 'err'); return false; }
        Store.update(function (s) {
          s.entries = s.entries.concat(v.names.map(function (n) { return { id: U.uid('e'), name: n }; }));
        }, { reason: 'entries' });
        U.toast('已新增 ' + v.count + ' 個單位');
      }
    });

    var host = $('#modalHost');
    function readGen(root) {
      var pre = root.querySelector('#gPre').value;
      var suf = root.querySelector('#gSuf').value;
      var start = parseInt(root.querySelector('#gStart').value, 10) || 0;
      var count = Math.min(300, Math.max(0, parseInt(root.querySelector('#gCount').value, 10) || 0));
      var pad = Math.min(4, Math.max(0, parseInt(root.querySelector('#gPad').value, 10) || 0));
      var names = [];
      for (var i = 0; i < count; i++) {
        var n = String(start + i);
        while (n.length < pad) n = '0' + n;
        names.push(pre + n + suf);
      }
      return { names: names, count: count };
    }
    function preview() {
      var root = host.querySelector('.modal-bg:last-child') || host;
      var el = root.querySelector('#gPreview');
      if (!el) return;
      var v = readGen(root);
      el.innerHTML = v.count
        ? '將產生 <strong>' + v.count + '</strong> 個：' + esc(v.names.slice(0, 3).join('、')) +
          (v.count > 3 ? ' … ' + esc(v.names[v.count - 1]) : '')
        : '尚未設定數量';
    }
    host.addEventListener('input', preview);
    preview();
  }

  // ===================== 步驟 2：評審委員 =====================
  function renderJudges() {
    var s = Store.get();
    var ul = $('#judgeList');
    if (!ul) return;
    $('#judgeCount').textContent = s.judges.length + ' 位委員';

    if (!s.judges.length) {
      ul.innerHTML = '<li style="display:block"><div class="empty">' +
        '<strong>尚未建立評審委員</strong>輸入人數後按「產生」，或直接貼上委員姓名。</div></li>';
      return;
    }

    ul.innerHTML = s.judges.map(function (j, i) {
      return '<li class="wrap-sm" draggable="true" data-id="' + esc(j.id) + '">' +
        '<span class="handle" aria-hidden="true">⠿</span>' +
        '<span class="idx">' + (i + 1) + '</span>' +
        '<span class="grow"><input type="text" value="' + esc(j.name) + '" data-field="name" ' +
          'aria-label="第 ' + (i + 1) + ' 位委員姓名" autocomplete="off"></span>' +
        '<select data-field="mode" style="width:auto" aria-label="' + esc(j.name) + ' 的填寫方式">' +
          '<option value="score"' + (j.mode !== 'rank' ? ' selected' : '') + '>填分數</option>' +
          '<option value="rank"' + (j.mode === 'rank' ? ' selected' : '') + '>填名次</option>' +
        '</select>' +
        '<label class="chk" title="名次和相同時可作為決勝依據">' +
          '<input type="checkbox" data-field="chief"' + (j.chief ? ' checked' : '') + '>主審</label>' +
        '<span class="actions">' +
          '<button type="button" data-act="up" title="上移" aria-label="上移">▲</button>' +
          '<button type="button" data-act="down" title="下移" aria-label="下移">▼</button>' +
          '<button type="button" data-act="del" class="del" title="刪除" aria-label="刪除">✕</button>' +
        '</span></li>';
    }).join('');
  }

  function bindJudges() {
    var ul = $('#judgeList');

    ul.addEventListener('input', function (e) {
      var inp = e.target.closest('input[data-field="name"]');
      if (!inp) return;
      var id = inp.closest('li').dataset.id;
      Store.update(function (s) {
        var j = s.judges.filter(function (x) { return x.id === id; })[0];
        if (j) j.name = inp.value;
      }, { silent: true, reason: 'judge-name' });
    });

    ul.addEventListener('change', function (e) {
      var el = e.target.closest('[data-field="mode"], [data-field="chief"]');
      if (!el) return;
      var id = el.closest('li').dataset.id;
      var field = el.dataset.field;
      Store.update(function (s) {
        var j = s.judges.filter(function (x) { return x.id === id; })[0];
        if (!j) return;
        if (field === 'mode') j.mode = el.value;
        else {
          // 主審為單選
          if (el.checked) s.judges.forEach(function (x) { x.chief = (x.id === id); });
          else j.chief = false;
        }
      }, { reason: 'judges' });
    });

    ul.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var id = btn.closest('li').dataset.id;
      Store.update(function (s) {
        var i = s.judges.map(function (x) { return x.id; }).indexOf(id);
        if (i < 0) return;
        var act = btn.dataset.act;
        if (act === 'up') U.move(s.judges, i, i - 1);
        else if (act === 'down') U.move(s.judges, i, i + 1);
        else if (act === 'del') { s.judges.splice(i, 1); Store.prune(); }
      }, { reason: 'judges' });
    });

    U.makeSortable(ul, function (from, to) {
      Store.update(function (s) { U.move(s.judges, from, to); }, { reason: 'judges' });
    });

    $('#btnAddJudge').addEventListener('click', function () {
      Store.update(function (s) {
        s.judges.push({ id: U.uid('j'), name: '委員 ' + (s.judges.length + 1), mode: 'score', chief: false });
      }, { reason: 'judges' });
    });

    $('#btnGenJudges').addEventListener('click', function () {
      var n = Math.min(30, Math.max(1, parseInt($('#judgeQty').value, 10) || 0));
      var apply = function () {
        Store.update(function (s) {
          s.judges = [];
          for (var i = 1; i <= n; i++) {
            s.judges.push({ id: U.uid('j'), name: '委員 ' + i, mode: 'score', chief: false });
          }
          Store.prune();
        }, { reason: 'judges' });
        U.toast('已建立 ' + n + ' 位委員');
      };
      if (Store.get().judges.length) {
        U.confirm('重新產生委員名單', '將取代現有的 ' + Store.get().judges.length + ' 位委員，已輸入的成績會一併清除。', apply, '確定取代');
      } else apply();
    });

    $('#btnBulkJudges').addEventListener('click', function () {
      U.modal({
        title: '貼上委員姓名',
        body: '<p style="color:var(--c-text-2);font-size:13.5px">一行一位委員。將取代現有委員名單與其成績。</p>' +
              '<textarea id="bulkJudges" placeholder="王大明&#10;李小華&#10;陳美玲" spellcheck="false"></textarea>',
        okText: '匯入',
        onOk: function (root) {
          var names = U.parseList(root.querySelector('#bulkJudges').value);
          if (!names.length) { U.toast('沒有可匯入的內容', 'err'); return false; }
          Store.update(function (s) {
            s.judges = names.map(function (n) { return { id: U.uid('j'), name: n, mode: 'score', chief: false }; });
            Store.prune();
          }, { reason: 'judges' });
          U.toast('已匯入 ' + names.length + ' 位委員');
        }
      });
    });
  }

  // ===================== 步驟 3：獎項與規則 =====================
  function renderAwards() {
    var s = Store.get();
    var ul = $('#awardList');
    if (!ul) return;

    var total = s.awards.reduce(function (a, b) { return a + (parseInt(b.count, 10) || 0); }, 0);
    $('#awardCount').textContent = '共 ' + total + ' 個名額';

    if (!s.awards.length) {
      ul.innerHTML = '<li style="display:block"><div class="empty">' +
        '<strong>尚未設定獎項</strong>可先套用範本再調整名稱與名額。</div></li>';
    } else {
      ul.innerHTML = s.awards.map(function (a, i) {
        return '<li class="wrap-sm" draggable="true" data-id="' + esc(a.id) + '">' +
          '<span class="handle" aria-hidden="true">⠿</span>' +
          '<span class="idx">' + (i + 1) + '</span>' +
          '<span class="grow"><input type="text" value="' + esc(a.name) + '" data-field="name" ' +
            'aria-label="獎項名稱" placeholder="獎項名稱" autocomplete="off"></span>' +
          '<span class="extra" style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--c-text-2)">' +
            '<input type="number" value="' + (a.count) + '" min="0" max="999" data-field="count" ' +
              'style="width:74px" aria-label="' + esc(a.name) + ' 名額">名' +
          '</span>' +
          '<span class="actions">' +
            '<button type="button" data-act="up" title="上移" aria-label="上移">▲</button>' +
            '<button type="button" data-act="down" title="下移" aria-label="下移">▼</button>' +
            '<button type="button" data-act="del" class="del" title="刪除" aria-label="刪除">✕</button>' +
          '</span></li>';
      }).join('');
    }

    renderTiebreaks();
    syncOptionInputs();
  }

  var TB_LABELS = {
    betterRank: { t: '較優名次個數', d: '獲得較優名次較多者列前（最常見的決勝方式）' },
    rawScore:   { t: '原始總分',     d: '原始分數總和較高者列前（僅比較皆以分數評分的情況）' },
    chief:      { t: '主審名次',     d: '由步驟 2 指定的主審所評名次較優者列前' },
    order:      { t: '出場序',       d: '出場序較前者列前（用於強制排出唯一名次）' }
  };

  function renderTiebreaks() {
    var s = Store.get();
    var ul = $('#tiebreakList');
    if (!ul) return;
    var enabled = s.options.tiebreakers;
    var rest = Object.keys(TB_LABELS).filter(function (k) { return enabled.indexOf(k) < 0; });

    var html = enabled.map(function (k, i) {
      var meta = TB_LABELS[k];
      var warn = (k === 'chief' && !s.judges.some(function (j) { return j.chief; }))
        ? ' <span class="tag warn">未指定主審，此條將略過</span>' : '';
      return '<li class="wrap-sm" data-key="' + k + '">' +
        '<span class="idx">' + (i + 1) + '</span>' +
        '<span class="grow"><strong style="font-size:14px">' + meta.t + '</strong>' + warn +
          '<span style="display:block;font-size:12px;color:var(--c-text-3)">' + meta.d + '</span></span>' +
        '<span class="actions">' +
          '<button type="button" data-tb="up" title="上移" aria-label="上移">▲</button>' +
          '<button type="button" data-tb="down" title="下移" aria-label="下移">▼</button>' +
          '<button type="button" data-tb="off" class="del" title="停用" aria-label="停用">✕</button>' +
        '</span></li>';
    }).join('');

    if (!enabled.length) {
      html = '<li style="display:block"><div class="empty" style="padding:18px">' +
        '未啟用任何決勝條件，名次和相同者將並列同名次。</div></li>';
    }
    if (rest.length) {
      html += '<li style="background:var(--c-surface-2);gap:7px;flex-wrap:wrap">' +
        '<span style="font-size:12.5px;color:var(--c-text-3)">可加入：</span>' +
        rest.map(function (k) {
          return '<button type="button" class="btn sm" data-tb="on" data-key="' + k + '">＋ ' + TB_LABELS[k].t + '</button>';
        }).join('') + '</li>';
    }
    ul.innerHTML = html;
  }

  function syncOptionInputs() {
    var o = Store.get().options;
    $('#optTieMethod').value = o.tieMethod;
    $('#optMissing').value = o.missingPolicy;
    $('#optAwardTie').value = o.awardTiePolicy;
    if ($('#optRemainder') !== document.activeElement) $('#optRemainder').value = o.remainderLabel;
  }

  function bindAwards() {
    var ul = $('#awardList');

    ul.addEventListener('input', function (e) {
      var el = e.target.closest('[data-field]');
      if (!el) return;
      var id = el.closest('li').dataset.id;
      var field = el.dataset.field;
      var isCount = field === 'count';
      Store.update(function (s) {
        var a = s.awards.filter(function (x) { return x.id === id; })[0];
        if (!a) return;
        if (isCount) a.count = Math.max(0, parseInt(el.value, 10) || 0);
        else a.name = el.value;
      }, { silent: true, reason: 'award-edit' });
      var total = Store.get().awards.reduce(function (x, y) { return x + (parseInt(y.count, 10) || 0); }, 0);
      $('#awardCount').textContent = '共 ' + total + ' 個名額';
    });

    ul.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var id = btn.closest('li').dataset.id;
      Store.update(function (s) {
        var i = s.awards.map(function (x) { return x.id; }).indexOf(id);
        if (i < 0) return;
        var act = btn.dataset.act;
        if (act === 'up') U.move(s.awards, i, i - 1);
        else if (act === 'down') U.move(s.awards, i, i + 1);
        else if (act === 'del') s.awards.splice(i, 1);
      }, { reason: 'awards' });
    });

    U.makeSortable(ul, function (from, to) {
      Store.update(function (s) { U.move(s.awards, from, to); }, { reason: 'awards' });
    });

    $('#btnAddAward').addEventListener('click', function () {
      Store.update(function (s) { s.awards.push({ id: U.uid('a'), name: '', count: 1 }); }, { reason: 'awards' });
      var inputs = U.$$('#awardList input[data-field="name"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });

    $('#awardPreset').addEventListener('change', function () {
      var key = this.value;
      this.value = '';
      var preset = AWARD_PRESETS[key];
      if (!preset) return;
      Store.update(function (s) {
        s.awards = preset.map(function (p) { return { id: U.uid('a'), name: p[0], count: p[1] }; });
      }, { reason: 'awards' });
      U.toast('已套用範本');
    });

    // 決勝順序
    $('#tiebreakList').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-tb]');
      if (!btn) return;
      var act = btn.dataset.tb;
      var key = btn.dataset.key || btn.closest('li').dataset.key;
      Store.update(function (s) {
        var arr = s.options.tiebreakers;
        var i = arr.indexOf(key);
        if (act === 'on') { if (i < 0) arr.push(key); }
        else if (act === 'off') { if (i >= 0) arr.splice(i, 1); }
        else if (act === 'up') U.move(arr, i, i - 1);
        else if (act === 'down') U.move(arr, i, i + 1);
      }, { reason: 'options' });
    });

    [['optTieMethod', 'tieMethod'], ['optMissing', 'missingPolicy'], ['optAwardTie', 'awardTiePolicy']]
      .forEach(function (pair) {
        $('#' + pair[0]).addEventListener('change', function () {
          Store.update(function (s) { s.options[pair[1]] = this.value; }.bind(this), { reason: 'options' });
        });
      });

    $('#optRemainder').addEventListener('input', function () {
      var v = this.value;
      Store.update(function (s) { s.options.remainderLabel = v; }, { silent: true, reason: 'options' });
    });
  }

  // ===================== 對外 =====================
  function init() { bindEntries(); bindJudges(); bindAwards(); }

  function render(step) {
    if (step === 1) {
      var m = Store.get().meta;
      if ($('#metaTitle') !== document.activeElement) $('#metaTitle').value = m.title || '';
      if ($('#metaGroup') !== document.activeElement) $('#metaGroup').value = m.group || '';
      if ($('#metaDate') !== document.activeElement) $('#metaDate').value = m.date || '';
      if ($('#metaVenue') !== document.activeElement) $('#metaVenue').value = m.venue || '';
      renderEntries();
    } else if (step === 2) renderJudges();
    else if (step === 3) renderAwards();
  }

  return { init: init, render: render, AWARD_PRESETS: AWARD_PRESETS };
})();
