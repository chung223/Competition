/* export.js — 成績輸出：獨立 HTML 成績單、CSV、純文字 */
var Exporter = (function () {
  'use strict';

  var esc = U.esc;
  var STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

  function judgeLabel(j, i, anonymous) {
    if (!anonymous) return j.name;
    return '委員' + (i < STEMS.length ? STEMS[i] : String(i + 1));
  }

  /**
   * 原始給分的註記。名次制委員填的就是名次，與換算結果相同時不重複顯示，
   * 只有並列造成換算值不同時才標出原填名次。
   */
  function rawNote(j, pj) {
    if (!pj || pj.raw === null || pj.raw === undefined) return '';
    if (j.mode === 'rank' && pj.raw === pj.rank) return '';
    return '<small>' + U.fmt(pj.raw) + (j.mode === 'rank' ? '' : ' 分') + '</small>';
  }

  function titleLine(s) {
    return [s.meta.title, s.meta.group].filter(Boolean).join('　') || '競賽成績表';
  }
  function subLine(s) {
    return [U.formatDate(s.meta.date), s.meta.venue].filter(Boolean).join('　');
  }

  function baseFilename(s) {
    var name = [s.meta.title, s.meta.group].filter(Boolean).join('_') || '競賽成績';
    var date = (s.meta.date || U.todayISO()).replace(/-/g, '');
    return (name + '_' + date).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80);
  }

  // ---- 表格資料（HTML / CSV / 文字 共用） --------------------------------
  function buildMatrix(s, res) {
    var d = s.display;
    var showJ = d.showJudgeColumns && s.judges.length > 0;

    var header = ['名次', '出場序', '參賽單位'];
    if (showJ) {
      s.judges.forEach(function (j, i) {
        var lab = judgeLabel(j, i, d.anonymousJudges);
        header.push(lab + (j.chief ? '(主審)' : '') + ' 名次');
        if (d.showRawScores) header.push(lab + (j.mode === 'rank' ? ' 原填名次' : ' 原始分數'));
      });
    }
    if (d.showSumRank) header.push('名次和');
    if (d.showAvgRank) header.push('平均名次');
    header.push('獎項');

    var rows = res.rows.map(function (r) {
      var line = [r.place + (r.tied ? '(並列)' : ''), r.order, r.name];
      if (showJ) {
        s.judges.forEach(function (j) {
          var pj = r.perJudge[j.id] || {};
          line.push(pj.rank === null || pj.rank === undefined ? '' : U.fmt(pj.rank));
          if (d.showRawScores) line.push(pj.raw === null || pj.raw === undefined ? '' : U.fmt(pj.raw));
        });
      }
      if (d.showSumRank) line.push(r.rankedCount ? U.fmt(r.sumRank) : '');
      if (d.showAvgRank) line.push(r.avgRank === null ? '' : U.fmt(r.avgRank));
      line.push(r.award || '');
      return line;
    });

    return { header: header, rows: rows };
  }

  // ---- CSV -------------------------------------------------------------
  function toCSV(s, res) {
    var m = buildMatrix(s, res);
    var out = [];
    out.push([titleLine(s)]);
    if (subLine(s)) out.push([subLine(s)]);
    out.push([]);
    out.push(m.header);
    m.rows.forEach(function (r) { out.push(r); });
    out.push([]);
    out.push(['計分方式', '名次法（各委員分數先換算為名次後加總，名次和越低越前）']);
    out.push(['決勝順序', res.tiebreakChain.map(function (c) { return c.label; }).join(' → ')]);
    res.adjustments.forEach(function (a) { out.push(['名額調整', a.message]); });
    out.push(['產生時間', new Date().toLocaleString('zh-TW')]);
    return U.toCSV(out);
  }

  // ---- 純文字 ----------------------------------------------------------
  function toText(s, res) {
    var m = buildMatrix(s, res);
    var lines = [titleLine(s)];
    if (subLine(s)) lines.push(subLine(s));
    lines.push('');
    lines.push(m.header.join('\t'));
    m.rows.forEach(function (r) { lines.push(r.join('\t')); });
    return lines.join('\n');
  }

  // ---- 獨立 HTML 成績單 -------------------------------------------------
  function toHTML(s, res) {
    var d = s.display;
    var showJ = d.showJudgeColumns && s.judges.length > 0;
    var decide = StepResult.DECIDE_LABEL;

    var footnotes = [];
    var bodyRows = res.rows.map(function (r) {
      var fn = '';
      if (r.decidedBy && decide[r.decidedBy]) {
        var i = footnotes.indexOf(r.decidedBy);
        if (i < 0) { footnotes.push(r.decidedBy); i = footnotes.length - 1; }
        fn = '<sup>' + (i + 1) + '</sup>';
      }
      return '<tr' + (r.place <= 3 ? ' class="top t' + r.place + '"' : '') + '>' +
        '<td class="place">' + r.place + fn + (r.tied ? '<em>並列</em>' : '') + '</td>' +
        '<td class="c dim">' + r.order + '</td>' +
        '<td class="name">' + esc(r.name) + '</td>' +
        (showJ ? s.judges.map(function (j) {
          var pj = r.perJudge[j.id] || {};
          var raw = d.showRawScores ? rawNote(j, pj) : '';
          return '<td class="c num">' + (pj.rank === null || pj.rank === undefined ? '—' : U.fmt(pj.rank)) + raw + '</td>';
        }).join('') : '') +
        (d.showSumRank ? '<td class="c num strong">' + (r.rankedCount ? U.fmt(r.sumRank) : '—') + '</td>' : '') +
        (d.showAvgRank ? '<td class="c num">' + (r.avgRank === null ? '—' : U.fmt(r.avgRank)) + '</td>' : '') +
        '<td class="award">' + (r.award ? '<span>' + esc(r.award) + '</span>' : '') + '</td>' +
      '</tr>';
    }).join('');

    var head = '<tr><th>名次</th><th>出場</th><th>參賽單位</th>' +
      (showJ ? s.judges.map(function (j, i) {
        return '<th class="c">' + esc(judgeLabel(j, i, d.anonymousJudges)) + (j.chief ? '<small>主審</small>' : '') + '</th>';
      }).join('') : '') +
      (d.showSumRank ? '<th class="c">名次和</th>' : '') +
      (d.showAvgRank ? '<th class="c">平均名次</th>' : '') +
      '<th>獎項</th></tr>';

    var fnHtml = footnotes.map(function (k, i) {
      return '<sup>' + (i + 1) + '</sup> 與前一名名次和相同，依「' + esc(decide[k]) + '」決勝。';
    }).join('<br>');

    var adj = res.adjustments.map(function (a) { return '<li>' + esc(a.message) + '</li>'; }).join('');

    return '<!DOCTYPE html>\n<html lang="zh-Hant-TW">\n<head>\n' +
'<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
'<title>' + esc(titleLine(s)) + ' — 成績單</title>\n<style>\n' +
':root{--ink:#161b26;--dim:#5a6474;--line:#dfe4ed;--brand:#2a3f8f;--gold:#c8961e;--silver:#8e98a5;--bronze:#a8703d;--soft:#f8fafc}\n' +
'*{box-sizing:border-box}\n' +
'body{margin:0;padding:28px 18px 60px;background:#eef1f6;color:var(--ink);line-height:1.6;\n' +
'  font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,-apple-system,"Segoe UI",sans-serif}\n' +
'.sheet{max-width:1000px;margin:0 auto;background:#fff;border-radius:14px;padding:34px 30px 30px;\n' +
'  box-shadow:0 8px 28px rgba(16,24,40,.1)}\n' +
'header{text-align:center;border-bottom:3px double var(--brand);padding-bottom:16px;margin-bottom:22px}\n' +
'h1{margin:0;font-size:24px;letter-spacing:.02em}\n' +
'.sub{color:var(--dim);font-size:14px;margin-top:6px}\n' +
'table{width:100%;border-collapse:collapse;font-size:14.5px}\n' +
'th,td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:left}\n' +
'thead th{background:var(--soft);font-size:12.5px;color:var(--dim);border-bottom:2px solid #c2cad8;white-space:nowrap}\n' +
'thead th small{display:block;font-weight:400;font-size:10.5px;color:#98a1b0}\n' +
'.c{text-align:center}\n' +
'.num{font-variant-numeric:tabular-nums;font-family:ui-monospace,Menlo,Consolas,monospace}\n' +
'.num small{display:block;font-size:10.5px;color:#98a1b0}\n' +
'.strong{font-weight:700}\n.dim{color:#98a1b0}\n' +
'.place{text-align:center;font-weight:700;font-size:17px;font-variant-numeric:tabular-nums;width:62px}\n' +
'.place em{display:block;font-style:normal;font-size:10px;color:var(--gold);font-weight:700}\n' +
'.place sup{color:var(--gold);font-size:11px}\n' +
'tr.t1 .place{color:var(--gold)}tr.t2 .place{color:var(--silver)}tr.t3 .place{color:var(--bronze)}\n' +
'.name{font-weight:600;white-space:nowrap}\n' +
'.award span{display:inline-block;white-space:nowrap;background:#fdf3dd;color:#8a6408;border-radius:99px;padding:2px 10px;font-size:12.5px;font-weight:700}\n' +
'footer{margin-top:22px;font-size:12px;color:var(--dim)}\n' +
'footer ul{margin:6px 0 0;padding-left:18px}\n' +
'.meta-box{margin-top:14px;padding:12px 14px;background:var(--soft);border-radius:9px;font-size:12.5px;color:var(--dim)}\n' +
'.sign{display:flex;gap:36px;margin-top:46px}\n' +
'.sign div{flex:1;border-top:1px solid #333;padding-top:7px;font-size:12.5px;text-align:center;color:var(--dim)}\n' +
'@media print{body{background:#fff;padding:0}.sheet{box-shadow:none;border-radius:0;padding:0;max-width:none}\n' +
'  thead th{background:#eee!important}@page{margin:14mm}}\n' +
'.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}\n' +
'.scroll-hint{display:none;margin:8px 0 0;font-size:11.5px;color:#98a1b0;text-align:center}\n' +
'@media (max-width:760px){\n' +
'  body{padding:14px 10px 40px}\n' +
'  .sheet{padding:20px 14px;border-radius:10px}\n' +
'  h1{font-size:19px}.sub{font-size:12.5px}\n' +
'  table{font-size:13px}th,td{padding:7px 6px}\n' +
'  /* 橫捲時把「名次／單位」釘在左、「獎項」釘在右，關鍵資訊永遠看得到 */\n' +
'  .place,thead th:first-child{position:sticky;left:0;z-index:3;background:#fff}\n' +
'  thead th:first-child{background:var(--soft)}\n' +
'  td.award,thead th:last-child{position:sticky;right:0;z-index:3;background:#fff}\n' +
'  thead th:last-child{background:var(--soft)}\n' +
'  .scroll-hint{display:block}\n' +
'}\n' +
'@media (max-width:480px){\n' +
'  /* 手機上讓次要的「出場序」欄讓位，確保單位名稱不被折行（列印與 CSV 仍保留） */\n' +
'  thead th:nth-child(2),tbody td:nth-child(2){display:none}\n' +
'  .sign{flex-direction:column;gap:30px;margin-top:34px}\n' +
'}\n' +
'@media print{.scroll{overflow:visible}.scroll-hint{display:none!important}\n' +
'  .place,td.award,thead th:first-child,thead th:last-child{position:static}}\n' +
'</style>\n</head>\n<body>\n<div class="sheet">\n' +
'<header><h1>' + esc(titleLine(s)) + '</h1>' +
  (subLine(s) ? '<div class="sub">' + esc(subLine(s)) + '</div>' : '') + '</header>\n' +
'<div class="scroll"><table><thead>' + head + '</thead><tbody>' + bodyRows + '</tbody></table></div>\n' +
'<p class="scroll-hint">← 左右滑動可檢視各評審委員的名次 →</p>\n' +
'<footer>' + (fnHtml ? '<p>' + fnHtml + '</p>' : '') +
  (adj ? '<p><strong>名額調整</strong></p><ul>' + adj + '</ul>' : '') +
  '<div class="meta-box">' +
    '計分方式：名次法　—　各評審委員的分數先於該委員內部換算為名次，再加總為「名次和」，名次和越低者名次越前。<br>' +
    '決勝順序：' + esc(res.tiebreakChain.map(function (c) { return c.label; }).join(' → ')) + '<br>' +
    '參賽單位 ' + s.entries.length + ' 個　評審委員 ' + s.judges.length + ' 位　' +
    '製表時間：' + esc(new Date().toLocaleString('zh-TW')) +
  '</div>' +
'</footer>\n' +
'<div class="sign"><div>評審長簽章</div><div>承辦人簽章</div><div>主辦單位核章</div></div>\n' +
'</div>\n</body>\n</html>';
  }

  return {
    judgeLabel: judgeLabel, rawNote: rawNote, baseFilename: baseFilename,
    toCSV: toCSV, toText: toText, toHTML: toHTML, buildMatrix: buildMatrix
  };
})();
