/* ============================================================
   通用"过程表格播放器"：给 ≥5 行的 table.gt 自动加逐步播放条
   ——让子集法每行、栈分析每步、归约过程像动画一样逐行走
   无依赖；只加高亮不改内容；.quiz 内与带 data-play="0" 的表跳过
   ============================================================ */
(function () {
  function init() {
    document.querySelectorAll('table.gt').forEach(function (tbl) {
      if (tbl.closest('.quiz')) return;
      if (tbl.closest('.playwrap')) return;
      if (tbl.getAttribute('data-play') === '0') return;
      // 数据行 = 含至少一个 td 的行（跳过纯表头行，兼容双行表头）
      var rows = Array.prototype.filter.call(tbl.rows, function (r) {
        return Array.prototype.some.call(r.cells, function (c) { return c.tagName === 'TD'; });
      });
      if (rows.length < 5) return;

      var wrap = document.createElement('div');
      wrap.className = 'playwrap';
      tbl.parentNode.insertBefore(wrap, tbl);

      var bar = document.createElement('div');
      bar.className = 'playbar';
      bar.innerHTML =
        '<button class="btn small" data-a="first">⏮ 复位</button>' +
        '<button class="btn small" data-a="prev">◀ 上一步</button>' +
        '<button class="btn small" data-a="next">下一步 ▶</button>' +
        '<button class="btn small ghost" data-a="auto">▶ 自动播放</button>' +
        '<span class="pinfo">这个表是个"过程"——点"下一步"逐行走</span>';
      wrap.appendChild(bar);
      wrap.appendChild(tbl);

      var cur = -1, timer = null;
      var info = bar.querySelector('.pinfo');
      var autoBtn = bar.querySelector('[data-a="auto"]');

      function render() {
        info.textContent = cur < 0
          ? ('共 ' + rows.length + ' 行，点"下一步"逐步走')
          : ('第 ' + (cur + 1) + ' / ' + rows.length + ' 行');
      }
      function show(i) {
        cur = i;
        rows.forEach(function (r, k) {
          r.classList.toggle('rowcur', k === i);
          r.style.opacity = (i >= 0 && k > i) ? '.35' : '';
        });
        if (i >= 0 && rows[i].scrollIntoView) {
          try { rows[i].scrollIntoView({ block: 'nearest' }); } catch (e) {}
        }
        render();
      }
      function stopAuto() {
        if (timer) { clearInterval(timer); timer = null; autoBtn.textContent = '▶ 自动播放'; }
      }
      bar.addEventListener('click', function (e) {
        var t = e.target;
        while (t && t !== bar && !t.dataset.a) t = t.parentNode;
        var a = t && t.dataset ? t.dataset.a : null;
        if (!a) return;
        if (a === 'first') { stopAuto(); show(-1); }
        else if (a === 'prev') { stopAuto(); show(Math.max(-1, cur - 1)); }
        else if (a === 'next') { stopAuto(); show(Math.min(rows.length - 1, cur + 1)); }
        else if (a === 'auto') {
          if (timer) { stopAuto(); return; }
          autoBtn.textContent = '⏸ 暂停';
          var i = cur;
          timer = setInterval(function () {
            i++;
            if (i >= rows.length) { stopAuto(); return; }
            show(i);
          }, 1300);
        }
      });
      render();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
