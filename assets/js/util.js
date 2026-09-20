/* util.js — 共用小工具 */
var U = (function () {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var uidSeq = 0;
  function uid(prefix) {
    uidSeq++;
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + uidSeq.toString(36);
  }

  /** 顯示數字：整數不帶小數，小數最多兩位 */
  function fmt(n) {
    if (n === null || n === undefined || n === '') return '—';
    var v = Number(n);
    if (!isFinite(v)) return '—';
    return v % 1 === 0 ? String(v) : String(Math.round(v * 100) / 100);
  }

  function toast(msg, kind) {
    var host = $('#toasts');
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'toast' + (kind === 'err' ? ' err' : '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 320);
    }, kind === 'err' ? 3600 : 2200);
  }

  function download(filename, content, mime) {
    var blob = new Blob(['﻿' + content], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function csvCell(v) {
    var s = String(v === null || v === undefined ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(rows) {
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  }

  /** 解析批次貼上的名單：一行一筆，自動去除「1.」「01、」「(3)」等前置編號 */
  function parseList(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map(function (line) {
        return line
          .replace(/\t/g, ' ')
          .replace(/^\s*[\(（\[]?\s*\d+\s*[\)）\].、,:：\-－_]\s*/, '')
          .trim();
      })
      .filter(function (s) { return s.length > 0; });
  }

  /** 對話框：回傳 { close() }；onOk 回傳 false 可阻止關閉 */
  function modal(opts) {
    var host = $('#modalHost');
    var bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
        '<header><h3>' + esc(opts.title) + '</h3>' +
          '<button class="btn ghost sm" data-act="x" aria-label="關閉">✕</button></header>' +
        '<div class="body">' + (opts.body || '') + '</div>' +
        '<footer>' +
          '<button class="btn" data-act="cancel">' + esc(opts.cancelText || '取消') + '</button>' +
          (opts.okText === null ? '' :
            '<button class="btn primary" data-act="ok">' + esc(opts.okText || '確定') + '</button>') +
        '</footer>' +
      '</div>';
    host.appendChild(bg);

    function close() { document.removeEventListener('keydown', onKey); bg.remove(); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    bg.addEventListener('click', function (e) {
      if (e.target === bg) return close();
      var act = e.target.closest('[data-act]');
      if (!act) return;
      var a = act.getAttribute('data-act');
      if (a === 'ok') { if (opts.onOk && opts.onOk(bg) === false) return; close(); }
      else { close(); }
    });

    var first = bg.querySelector('textarea, input, select');
    if (first) { first.focus(); if (first.select) first.select(); }
    return { el: bg, close: close };
  }

  function confirm(title, message, onOk, okText) {
    modal({
      title: title,
      body: '<p style="margin:0">' + esc(message) + '</p>',
      okText: okText || '確定',
      onOk: onOk
    });
  }

  /** 讓 <ul> 中的 li 可拖曳排序；onReorder(from, to) */
  function makeSortable(ul, onReorder) {
    var dragIdx = null;
    ul.addEventListener('dragstart', function (e) {
      var li = e.target.closest('li[draggable]');
      if (!li) return;
      dragIdx = Array.prototype.indexOf.call(ul.children, li);
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(dragIdx)); } catch (_) {}
    });
    ul.addEventListener('dragend', function () {
      $$('.dragging, .drop-target', ul).forEach(function (n) { n.classList.remove('dragging', 'drop-target'); });
      dragIdx = null;
    });
    ul.addEventListener('dragover', function (e) {
      if (dragIdx === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      var li = e.target.closest('li');
      $$('.drop-target', ul).forEach(function (n) { n.classList.remove('drop-target'); });
      if (li) li.classList.add('drop-target');
    });
    ul.addEventListener('drop', function (e) {
      if (dragIdx === null) return;
      e.preventDefault();
      var li = e.target.closest('li');
      if (!li) return;
      var to = Array.prototype.indexOf.call(ul.children, li);
      if (to !== dragIdx && to >= 0) onReorder(dragIdx, to);
    });
  }

  function move(arr, from, to) {
    if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
    var item = arr.splice(from, 1)[0];
    arr.splice(to, 0, item);
    return arr;
  }

  function todayISO() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function formatDate(iso) {
    if (!iso) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return m ? (m[1] + ' 年 ' + Number(m[2]) + ' 月 ' + Number(m[3]) + ' 日') : iso;
  }

  return {
    $: $, $$: $$, esc: esc, uid: uid, fmt: fmt, toast: toast, download: download,
    toCSV: toCSV, parseList: parseList, modal: modal, confirm: confirm,
    makeSortable: makeSortable, move: move, todayISO: todayISO, formatDate: formatDate
  };
})();
