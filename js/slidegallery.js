/* ============================================================
   课件原页画廊：把课件每页原图嵌入精讲页
   用法：<div class="slidegal" data-dir="ch3" data-from="1" data-to="48"></div>
   缩略图网格 + 点击放大（lightbox，支持 ←/→ 翻页、Esc 关闭）
   ============================================================ */
(function () {
  function buildGallery(el) {
    var dir = el.getAttribute('data-dir');
    var from = +el.getAttribute('data-from') || 1;
    var to = +el.getAttribute('data-to') || 1;
    if (!dir) return;
    var html = '';
    for (var p = from; p <= to; p++) {
      html += '<div class="slidethumb" data-p="' + p + '" data-dir="' + dir + '">' +
        '<img loading="lazy" src="slides/' + dir + '/p' + p + '.png" alt="课件第' + p + '页">' +
        '<span class="slidecap">P' + p + '</span></div>';
    }
    el.innerHTML = html;
    // 统计缺图；全部缺失时给出提示（公网版未含原图）
    var errs = 0, total = 0;
    el.querySelectorAll('img').forEach(function (img) {
      total++;
      img.addEventListener('error', function () { img.parentNode.style.display = 'none'; if (++errs === total) el.innerHTML = '<div class="notice" style="width:100%">📁 课件原图在本机完整版中提供（slides/ 目录未随公网部署）。</div>'; });
    });
  }

  /* lightbox */
  var lb = null, cur = null, items = [];

  function openLB(node) {
    var gal = node.closest('.slidegal');
    items = Array.prototype.filter.call(gal.querySelectorAll('.slidethumb'), function (t) { return t.style.display !== 'none'; });
    cur = items.indexOf(node);
    if (!lb) {
      lb = document.createElement('div');
      lb.className = 'slidelb';
      lb.innerHTML = '<button class="slidelb-x" aria-label="关闭">✕</button>' +
        '<button class="slidelb-prev" aria-label="上一页">◀</button>' +
        '<img>' + '<button class="slidelb-next" aria-label="下一页">▶</button>' +
        '<div class="slidelb-cap"></div>';
      document.body.appendChild(lb);
      lb.querySelector('.slidelb-x').addEventListener('click', closeLB);
      lb.querySelector('.slidelb-prev').addEventListener('click', function () { step(-1); });
      lb.querySelector('.slidelb-next').addEventListener('click', function () { step(1); });
      lb.addEventListener('click', function (e) { if (e.target === lb) closeLB(); });
      document.addEventListener('keydown', function (e) {
        if (!lb || lb.style.display !== 'flex') return;
        if (e.key === 'Escape') closeLB();
        else if (e.key === 'ArrowLeft') step(-1);
        else if (e.key === 'ArrowRight') step(1);
      });
    }
    lb.style.display = 'flex';
    show();
  }
  function show() {
    var node = items[cur];
    var img = lb.querySelector('img');
    img.src = node.querySelector('img').src;
    lb.querySelector('.slidelb-cap').textContent = '课件第 ' + node.dataset.p + ' 页（' + (cur + 1) + '/' + items.length + '）← → 翻页，Esc 关闭';
  }
  function step(d) { cur = (cur + d + items.length) % items.length; show(); }
  function closeLB() { if (lb) lb.style.display = 'none'; }

  function init() {
    document.querySelectorAll('.slidegal').forEach(function (el) {
      buildGallery(el);
      el.addEventListener('click', function (e) {
        var t = e.target.closest('.slidethumb');
        if (t) openLB(t);
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
