/* steps-result.js — 步驟 5：成績結果、顯示選項與輸出 */
var StepResult = (function () {
  'use strict';

  var $ = U.$, esc = U.esc;

  var DECIDE_LABEL = {
    betterRank: '較優名次個數',
    rawScore: '原始總分',
    chief: '主審名次',
    order: '出場序'
  };

  function render() {
    var s = Store.get();
    var hostEl = $('#resultArea');

    if (s.entries.length < 1 || s.judges.length < 1) {
      hostEl.innerHTML = '<div class="card"><div class="body"><div class="empty">' +
        '<strong>尚無可計算的資料</strong>請先完成參賽單位、評審委員與成績輸入。</div></div></div>';
      return;
    }

    var res = Store.computeResult();
    var d = s.display;

    hostEl.innerHTML =
      renderNotices(res) +
      renderControls(s) +
      renderPodium(res) +
      renderTable(s, res) +
      renderExports();

    bind(hostEl, res);
  }

  // ---- 提示 ------------------------------------------------------------
  function renderNotices(res) {
    var html = '';
    var errs = res.issues.filter(function (i) { return i.level === 'error'; });
    var warns = res.issues.filter(function (i) { return i.level === 'warn'; });

    if (errs.length) {
      html += '<div class="note err"><span class="ico">⚠</span><div><strong>成績尚未輸入完整，以下結果僅供暫時參考</strong>' +
        '<ul>' + errs.map(function (i) { return '<li>' + esc(i.message) + '</li>'; }).join('') + '</ul></div></div>';
    }
    if (warns.length) {
      html += '<div class="note warn"><span class="ico">！</span><div>' +
        '<ul style="margin:0;padding-left:18px">' + warns.map(function (i) { return '<li>' + esc(i.message) + '</li>'; }).join('') + '</ul></div></div>';
    }
    if (res.adjustments.length) {
      html += '<div class="note info"><span class="ico">ⓘ</span><div><strong>並列造成的名額調整</strong>' +
        '<ul>' + res.adjustments.map(function (a) { return '<li>' + esc(a.message) + '</li>'; }).join('') + '</ul></div></div>';
    }
    if (!errs.length && !warns.length) {
      html += '<div class="note ok"><span class="ico">✓</span><div>所有委員成績已輸入完整，計算結果可正式使用。</div></div>';
    }
    return html;
  }

  // ---- 顯示選項 --------------------------------------------------------
  function renderControls(s) {
    var d = s.display;
    function sw(key, label, hint) {
      return '<label class="switch" title="' + esc(hint || '') + '">' +
        '<input type="checkbox" data-disp="' + key + '"' + (d[key] ? ' checked' : '') + '>' +
        '<span class="track"></span><span>' + esc(label) + '</span></label>';
    }
    return '<div class="card no-print"><header><h3>顯示內容</h3>' +
      '<span class="tag">會同步套用到列印與輸出</span></header><div class="body">' +
      '<div style="display:flex;flex-wrap:wrap;gap:18px 26px">' +
        sw('showJudgeColumns', '顯示各委員名次', '關閉後只呈現總成績與獎項') +
        sw('anonymousJudges', '委員以代號顯示', '以「委員甲、委員乙」取代真實姓名') +
        sw('showRawScores', '一併顯示原始分數', '在各委員名次下方加註原始給分') +
        sw('showSumRank', '顯示名次和', '') +
        sw('showAvgRank', '顯示平均名次', '') +
      '</div></div></div>';
  }

  // ---- 前三名 ----------------------------------------------------------
  function renderPodium(res) {
    var top = res.rows.slice(0, 3).filter(function (r) { return r.rankedCount > 0; });
    if (top.length < 3) return '';
    return '<div class="podium no-print">' + top.map(function (r) {
      return '<div class="p">' +
        '<div class="pl">第 ' + r.place + ' 名' + (r.tied ? '（並列）' : '') + '</div>' +
        '<div class="nm">' + esc(r.name) + '</div>' +
        '<div class="aw">' + (r.award ? esc(r.award) : '&nbsp;') + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  // ---- 成績表 ----------------------------------------------------------
  function renderTable(s, res) {
    var d = s.display;
    var showJ = d.showJudgeColumns && s.judges.length > 0;
    var meta = s.meta;

    var titleLine = [meta.title, meta.group].filter(Boolean).join('　') || '競賽成績表';
    var subLine = [U.formatDate(meta.date), meta.venue].filter(Boolean).join('　');

    var head = '<tr>' +
      '<th class="c" style="width:62px">名次</th>' +
      '<th class="c" style="width:54px">出場</th>' +
      '<th>參賽單位</th>' +
      (showJ ? s.judges.map(function (j, i) {
        return '<th class="c">' + esc(Exporter.judgeLabel(j, i, d.anonymousJudges)) +
          (j.chief ? '<small>主審</small>' : '') + '</th>';
      }).join('') : '') +
      (d.showSumRank ? '<th class="c" style="width:78px">名次和</th>' : '') +
      (d.showAvgRank ? '<th class="c" style="width:82px">平均名次</th>' : '') +
      '<th style="width:110px">獎項</th></tr>';

    var footnotes = [];
    var body = res.rows.map(function (r) {
      var fn = '';
      if (r.decidedBy && DECIDE_LABEL[r.decidedBy]) {
        var idx = footnotes.indexOf(r.decidedBy);
        if (idx < 0) { footnotes.push(r.decidedBy); idx = footnotes.length - 1; }
        fn = '<sup class="fn">' + (idx + 1) + '</sup>';
      }
      return '<tr class="' + (r.place <= 3 ? 'top' + r.place : '') + (r.tied ? ' tie-row' : '') + '">' +
        '<td class="place">' + r.place + fn + '</td>' +
        '<td class="order-col">' + r.order + '</td>' +
        '<td class="name-col">' + esc(r.name) + (r.tied ? ' <span class="tag accent">並列</span>' : '') + '</td>' +
        (showJ ? s.judges.map(function (j) {
          var pj = r.perJudge[j.id] || {};
          var rk = pj.rank === null || pj.rank === undefined ? '—' : U.fmt(pj.rank);
          var raw = d.showRawScores ? Exporter.rawNote(j, pj) : '';
          return '<td class="j">' + rk + raw + '</td>';
        }).join('') : '') +
        (d.showSumRank ? '<td class="j sum">' + (r.rankedCount ? U.fmt(r.sumRank) : '—') + '</td>' : '') +
        (d.showAvgRank ? '<td class="j">' + (r.avgRank === null ? '—' : U.fmt(r.avgRank)) + '</td>' : '') +
        '<td class="award-cell">' + (r.award ? '<span class="tag accent">' + esc(r.award) + '</span>' : '') + '</td>' +
      '</tr>';
    }).join('');

    var fnHtml = footnotes.length
      ? '<div style="padding:12px 16px;font-size:12.5px;color:var(--c-text-2);border-top:1px solid var(--c-border)">' +
        footnotes.map(function (k, i) {
          return '<sup class="fn">' + (i + 1) + '</sup> 與前一名名次和相同，依「' + esc(DECIDE_LABEL[k]) + '」決勝。';
        }).join('<br>') + '</div>'
      : '';

    return '<div class="card"><header><h3>成績一覽</h3>' +
        '<span class="tag brand">名次和越低越前</span><span class="grow"></span>' +
        '<span class="tag">決勝順序：' + esc(res.tiebreakChain.map(function (c) { return c.label; }).join(' → ')) + '</span>' +
      '</header><div class="body tight">' +
        '<div class="print-only" style="margin-bottom:10px">' +
          '<h2 style="font-size:16pt;text-align:center">' + esc(titleLine) + '</h2>' +
          (subLine ? '<div style="text-align:center;font-size:10.5pt;color:#444">' + esc(subLine) + '</div>' : '') +
        '</div>' +
        '<div class="tbl-scroll"><table class="data result"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' +
        fnHtml +
        '<div class="print-only sign-row"><div>評審長簽章</div><div>承辦人簽章</div><div>主辦單位核章</div></div>' +
      '</div></div>';
  }

  // ---- 輸出 ------------------------------------------------------------
  function renderExports() {
    return '<div class="card no-print"><header><h3>輸出成績</h3></header><div class="body">' +
      '<div class="row out-grid" style="gap:10px">' +
        '<button class="btn primary" data-out="page">📄 成績單網頁（可直接寄出）</button>' +
        '<button class="btn" data-out="print">🖨 列印 / 存成 PDF</button>' +
        '<button class="btn" data-out="csv">📊 CSV（Excel）</button>' +
        '<button class="btn" data-out="json">🗂 JSON 完整資料</button>' +
        '<button class="btn" data-out="announce">📢 全螢幕公布模式</button>' +
        '<button class="btn" data-out="copy">📋 複製成績表</button>' +
      '</div>' +
      '<p class="tip" style="margin:12px 0 0;font-size:12.5px;color:var(--c-text-3)">' +
        '「成績單網頁」是一個不需網路、不需本工具即可開啟的獨立 HTML 檔；' +
        '「JSON 完整資料」可再匯入本工具繼續編輯。</p>' +
      '</div></div>';
  }

  // ---- 事件 ------------------------------------------------------------
  function bind(hostEl, res) {
    hostEl.addEventListener('change', function (e) {
      var inp = e.target.closest('[data-disp]');
      if (!inp) return;
      Store.update(function (s) { s.display[inp.dataset.disp] = inp.checked; }, { reason: 'display' });
    });

    hostEl.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-out]');
      if (!b) return;
      var s = Store.get();
      var fresh = Store.computeResult();
      var base = Exporter.baseFilename(s);
      switch (b.dataset.out) {
        case 'page':
          U.download(base + '.html', Exporter.toHTML(s, fresh), 'text/html');
          U.toast('已下載成績單網頁');
          break;
        case 'print': window.print(); break;
        case 'csv':
          U.download(base + '.csv', Exporter.toCSV(s, fresh), 'text/csv');
          U.toast('已下載 CSV');
          break;
        case 'json':
          U.download(base + '.json', JSON.stringify(s, null, 2), 'application/json');
          U.toast('已下載 JSON');
          break;
        case 'announce': openAnnounce(s, fresh); break;
        case 'copy':
          var txt = Exporter.toText(s, fresh);
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt).then(
              function () { U.toast('已複製到剪貼簿'); },
              function () { U.toast('複製失敗，請改用其他輸出方式', 'err'); }
            );
          } else U.toast('此瀏覽器不支援複製，請改用其他輸出方式', 'err');
          break;
      }
    });
  }

  // ---- 公布模式 --------------------------------------------------------
  function openAnnounce(s, res) {
    var byAward = [];
    var map = {};
    res.rows.forEach(function (r) {
      var key = r.award || '（未獲獎）';
      if (!map[key]) { map[key] = []; byAward.push({ name: key, rows: map[key] }); }
      map[key].push(r);
    });

    var el = document.createElement('div');
    el.className = 'announce';
    el.innerHTML =
      '<header><div class="grow">' +
        '<h2>' + esc([s.meta.title, s.meta.group].filter(Boolean).join('　') || '競賽成績') + '</h2>' +
        '<div class="sub">' + esc([U.formatDate(s.meta.date), s.meta.venue].filter(Boolean).join('　')) + '</div>' +
      '</div><button class="iconbtn close" type="button" data-close>關閉 (Esc)</button></header>' +
      '<div class="scroll">' + byAward.map(function (g) {
        return '<div class="grp"><h3>' + esc(g.name) + '　<span style="font-size:.6em;opacity:.6">' + g.rows.length + ' 個單位</span></h3>' +
          '<ul>' + g.rows.map(function (r) {
            return '<li><span class="pl">' + r.place + '</span>' + esc(r.name) + '</li>';
          }).join('') + '</ul></div>';
      }).join('') + '</div>';

    function close() { document.removeEventListener('keydown', onKey); el.remove(); }
    function onKey(ev) { if (ev.key === 'Escape') close(); }
    el.addEventListener('click', function (ev) { if (ev.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(el);
  }

  return { render: render, DECIDE_LABEL: DECIDE_LABEL };
})();
