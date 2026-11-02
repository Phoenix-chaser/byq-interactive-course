/* 编译原理互动课堂 · 共享 UI 组件：导航 / 测验框架 / 自动机绘图 / 步骤播放器 / 大题导出 */
(function (global) {
  'use strict';
  const LS_PREFIX = 'byq_';

  /* ---------- 进度 ---------- */
  const progress = {
    key: LS_PREFIX + 'progress',
    all() { try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch (e) { return {}; } },
    save(level, data) {
      const p = this.all();
      const old = p[level] || {};
      p[level] = {
        bestScore: Math.max(old.bestScore || 0, data.score || 0),
        lastScore: data.score, total: data.total, done: (data.score || 0) >= Math.ceil(data.total * 0.6),
        time: Date.now()
      };
      localStorage.setItem(this.key, JSON.stringify(p));
    },
    stars(level) {
      const p = this.all()[level];
      if (!p) return 0;
      if (p.total && p.bestScore >= p.total) return 3;
      if (p.total && p.bestScore >= Math.ceil(p.total * 0.8)) return 2;
      if (p.done) return 1;
      return p.bestScore > 0 ? 1 : 0;
    },
    starStr(n) { return '★'.repeat(n) + '☆'.repeat(3 - n); },
    reset() { localStorage.removeItem(this.key); }
  };

  /* ---------- 顶部导航 ---------- */
  const LEVELS = [
    { id: 'index.html', name: '🏠 首页' },
    { id: 'textbook.html', name: '📖 全书精讲' },
    { id: 'level1.html', name: '第1关 · 编译全景与文法' },
    { id: 'level2.html', name: '第2关 · 词法分析' },
    { id: 'level3.html', name: '第3关 · LL(1)' },
    { id: 'level4.html', name: '第4关 · LR分析' },
    { id: 'level5.html', name: '第5关 · 语法制导与中间代码' },
    { id: 'level6.html', name: '第6关 · 运行存储与优化' },
    { id: 'final.html', name: '🏁 终极测验' },
    { id: 'cheatsheet.html', name: '📜 考前速查' }
  ];
  function nav(cur) {
    const bar = document.createElement('div');
    bar.className = 'topnav';
    bar.innerHTML = '<span class="brand">⚙️ 编译原理闯关</span>' + LEVELS.map(l =>
      `<a class="chip ${l.id === cur ? 'cur' : ''}" href="${l.id}">${l.name}</a>`).join('');
    document.body.prepend(bar);
  }

  /* ---------- 测验框架 ---------- */
  const quiz = {
    render(mountId, cfg) {
      const root = document.getElementById(mountId);
      if (!root) return;
      const state = cfg.questions.map(() => ({ sel: null }));
      let html = `<div class="quiz" id="quiz-${cfg.id}">`;
      html += `<div class="notice">📝 <b>关末测验</b>：共 ${cfg.questions.length} 题。选好后点"交卷"，即时判分并给出解析。答错也没关系，看看解析就懂了！</div>`;
      cfg.questions.forEach((q, qi) => {
        html += `<div class="q" data-qi="${qi}"><div class="stem">${qi + 1}. [${typeLabel(q)}] ${q.q}</div>`;
        if (q.type === 'single') {
          html += q.options.map((o, oi) => `<div class="opt" data-oi="${oi}">${String.fromCharCode(65 + oi)}. ${o}</div>`).join('');
        } else if (q.type === 'multi') {
          html += q.options.map((o, oi) => `<div class="opt" data-oi="${oi}">${String.fromCharCode(65 + oi)}. ${o}</div>`).join('')
            + '<div style="color:var(--muted);font-size:13px;margin-top:4px">（多选：点击选择所有你认为正确的选项）</div>';
        } else {
          html += `<input class="fillin" type="text" placeholder="在这里填写答案…" data-fill="1">`;
        }
        html += `<div class="explain"></div></div>`;
      });
      html += `<button class="btn" data-act="submit">交卷判分</button>
               <button class="btn ghost" data-act="retry">重做</button>
               <div class="scorebox"></div></div>`;
      root.innerHTML = html;
      const box = root.querySelector('.quiz');

      box.querySelectorAll('.q').forEach(qEl => {
        const qi = +qEl.dataset.qi;
        if (cfg.questions[qi].type === 'fill') {
          qEl.querySelector('[data-fill]').addEventListener('input', e => { state[qi].sel = e.target.value; });
          return;
        }
        qEl.querySelectorAll('.opt').forEach(oEl => {
          oEl.addEventListener('click', () => {
            const oi = +oEl.dataset.oi;
            if (cfg.questions[qi].type === 'multi') {
              oEl.classList.toggle('sel');
              state[qi].sel = [...qEl.querySelectorAll('.opt.sel')].map(x => +x.dataset.oi);
            } else {
              qEl.querySelectorAll('.opt').forEach(x => x.classList.remove('sel'));
              oEl.classList.add('sel');
              state[qi].sel = oi;
            }
          });
        });
      });

      box.querySelector('[data-act=submit]').addEventListener('click', () => grade());
      box.querySelector('[data-act=retry]').addEventListener('click', () => {
        state.forEach(s => s.sel = null);
        box.querySelectorAll('.opt').forEach(x => x.classList.remove('sel', 'correct', 'wrong'));
        box.querySelectorAll('.fillin').forEach(x => { x.value = ''; x.style.borderColor = ''; });
        box.querySelectorAll('.explain').forEach(x => x.classList.remove('show'));
        const sb = box.querySelector('.scorebox'); sb.classList.remove('show');
      });

      function normAns(s) { return String(s).replace(/[\s,，、;；]/g, '').toLowerCase(); }
      function grade() {
        let score = 0;
        const report = [];
        cfg.questions.forEach((q, qi) => {
          const qEl = box.querySelector(`.q[data-qi="${qi}"]`);
          const ex = qEl.querySelector('.explain');
          let ok = false, userAns = '（未作答）';
          if (q.type === 'single') {
            ok = state[qi].sel === q.answer;
            if (state[qi].sel !== null) userAns = String.fromCharCode(65 + state[qi].sel) + '. ' + q.options[state[qi].sel];
            qEl.querySelectorAll('.opt').forEach(oEl => {
              const oi = +oEl.dataset.oi;
              if (oi === q.answer) oEl.classList.add('correct');
              else if (oi === state[qi].sel) oEl.classList.add('wrong');
            });
          } else if (q.type === 'multi') {
            const sel = (state[qi].sel || []).slice().sort((a, b) => a - b);
            const ans = q.answer.slice().sort((a, b) => a - b);
            ok = JSON.stringify(sel) === JSON.stringify(ans);
            userAns = (state[qi].sel || []).map(i => String.fromCharCode(65 + i)).join('') || '（未作答）';
            qEl.querySelectorAll('.opt').forEach(oEl => {
              const oi = +oEl.dataset.oi;
              if (q.answer.includes(oi)) oEl.classList.add('correct');
              else if ((state[qi].sel || []).includes(oi)) oEl.classList.add('wrong');
            });
          } else {
            ok = normAns(state[qi].sel) === normAns(q.answer);
            userAns = state[qi].sel || '（未作答）';
            const inp = qEl.querySelector('.fillin');
            inp.style.borderColor = ok ? 'var(--good)' : 'var(--bad)';
          }
          if (ok) score++;
          else { qEl.classList.add('wrongShake'); setTimeout(() => qEl.classList.remove('wrongShake'), 400); }
          ex.innerHTML = (ok ? '✅ <b>答对了！</b> ' : '❌ <b>再想想。</b> 正确答案：' + dispAnswer(q) + '<br>') +
            '<b>解析：</b>' + q.explain;
          ex.classList.add('show');
          report.push({ no: qi + 1, ok, user: userAns });
        });
        const sb = box.querySelector('.scorebox');
        const full = score === cfg.questions.length;
        sb.innerHTML = `<div class="big">${score} / ${cfg.questions.length}</div>
          <div>${full ? '🏆 全对！满分通关，太强了！' : score >= cfg.questions.length * 0.8 ? '🎉 优秀！离满分只差一点点' : score >= cfg.questions.length * 0.6 ? '👍 及格！看看错题解析，再来一次？' : '💪 别灰心，仔细看解析后重做一遍'}</div>
          <div style="margin-top:10px"><button class="btn small" data-copy="1">📋 复制成绩单（发给AI老师批改薄弱点）</button></div>`;
        sb.classList.add('show');
        sb.querySelector('[data-copy]').addEventListener('click', () => {
          const txt = `【${cfg.title || cfg.id} 测验成绩单】\n得分：${score}/${cfg.questions.length}\n` +
            report.map(r => `第${r.no}题 ${r.ok ? '✓' : '✗'} 我的答案: ${r.user}`).join('\n') +
            `\n时间: ${new Date().toLocaleString()}`;
          copyText(txt, sb.querySelector('[data-copy]'));
        });
        progress.save(cfg.id, { score, total: cfg.questions.length });
        sb.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      function dispAnswer(q) {
        if (q.type === 'single') return String.fromCharCode(65 + q.answer);
        if (q.type === 'multi') return q.answer.slice().sort((a, b) => a - b).map(i => String.fromCharCode(65 + i)).join('');
        return q.answer;
      }
      function typeLabel(q) {
        return q.type === 'single' ? '单选' : q.type === 'multi' ? '多选' : '填空';
      }
    }
  };

  function copyText(txt, btn) {
    const done = () => { const t = btn.textContent; btn.textContent = '✅ 已复制'; setTimeout(() => btn.textContent = t, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done).catch(() => fallback());
    } else fallback();
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { alert('复制失败，请手动复制：\n' + txt); }
      document.body.removeChild(ta);
    }
  }

  /* ---------- 自动机 SVG 绘图 ---------- */
  // fa: {states:[name 或 {name,label}], start: idx 或 [idx], finals:[idx], edges:[{from,sym,to}]}
  // opts: {directed:true, width, stateLabelBelow:bool, onNodeClick, highlightPath:[edges]}
  function drawFA(mountId, fa, opts = {}) {
    const el = typeof mountId === 'string' ? document.getElementById(mountId) : mountId;
    if (!el) return;
    const N = fa.states.length;
    const starts = Array.isArray(fa.start) ? fa.start : [fa.start];
    const finals = fa.finals || [];
    const nameOf = s => typeof s === 'object' ? s.name : s;
    const labelOf = s => (typeof s === 'object' && s.label) ? s.label : null;

    // 层次布局：从起点 BFS
    const layer = Array(N).fill(-1);
    starts.forEach(s => layer[s] = 0);
    let frontier = [...starts];
    while (frontier.length) {
      const next = [];
      for (const s of frontier) {
        for (const e of fa.edges) if (e.from === s && layer[e.to] < 0) { layer[e.to] = layer[s] + 1; next.push(e.to); }
        for (const e of fa.edges) if (e.to === s && layer[e.from] < 0) { layer[e.from] = layer[s] + 1; next.push(e.from); }
      }
      frontier = next;
    }
    let maxL = 0;
    layer.forEach(l => { if (l >= 0) maxL = Math.max(maxL, l); });
    layer.forEach((l, i) => { if (l < 0) layer[i] = ++maxL; });

    const perLayer = {};
    layer.forEach(l => perLayer[l] = (perLayer[l] || 0) + 1);
    const counter = {};
    const W = Math.max(760, (maxL + 1) * 150 + 100);
    const H = Math.max(220, Math.max(...Object.values(perLayer)) * 110 + 80);
    const pos = fa.states.map((s, i) => {
      const l = layer[i];
      counter[l] = (counter[l] || 0);
      const n = perLayer[l];
      const x = 90 + l * (W - 160) / Math.max(1, maxL);
      const y = H / 2 + (counter[l] - (n - 1) / 2) * 105;
      counter[l]++;
      return { x, y };
    });

    // 聚合平行边
    const edgeMap = {};
    fa.edges.forEach(e => {
      const k = e.from + '→' + e.to;
      if (!edgeMap[k]) edgeMap[k] = { from: e.from, to: e.to, syms: [] };
      if (!edgeMap[k].syms.includes(e.sym)) edgeMap[k].syms.push(e.sym);
    });
    const edges = Object.values(edgeMap).map(e => ({ ...e, syms: e.syms.sort().join(',') }));

    const R = 24;
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="${Math.min(W, 980)}" style="max-width:100%" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<defs><marker id="arr" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L9,3 L0,6 Z" fill="#9aa0c7"/></marker></defs>`;

    // 边
    edges.forEach(e => {
      const a = pos[e.from], b = pos[e.to];
      const sym = e.syms === 'ε' ? 'ε' : e.syms;
      let d, lx, ly;
      if (e.from === e.to) {
        d = `M ${a.x - 14} ${a.y - R + 4} C ${a.x - 40} ${a.y - R - 42}, ${a.x + 40} ${a.y - R - 42}, ${a.x + 14} ${a.y - R + 4}`;
        lx = a.x; ly = a.y - R - 26;
      } else {
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const hasBack = edges.some(e2 => e2.from === e.to && e2.to === e.from && e2 !== e);
        const off = hasBack ? 0.28 : 0;
        const mx = (a.x + b.x) / 2 + (-dy / dist) * off * dist * 0.35;
        const my = (a.y + b.y) / 2 + (dx / dist) * off * dist * 0.35;
        const ax = a.x + dx / dist * (R + 2) + (-dy / dist) * off * dist * 0.16;
        const ay = a.y + dy / dist * (R + 2) + (dx / dist) * off * dist * 0.16;
        const bx = b.x - dx / dist * (R + 8) + (-dy / dist) * off * dist * 0.16;
        const by = b.y - dy / dist * (R + 8) + (dx / dist) * off * dist * 0.16;
        d = `M ${ax} ${ay} Q ${mx} ${my} ${bx} ${by}`;
        lx = (ax + bx) / 2 + (mx - (ax + bx) / 2) * 0.55;
        ly = (ay + by) / 2 + (my - (ay + by) / 2) * 0.55 - 12;
      }
      svg += `<path d="${d}" fill="none" stroke="#9aa0c7" stroke-width="1.6" marker-end="url(#arr)"/>`;
      svg += `<rect x="${lx - sym.length * 4.6 - 3}" y="${ly - 10}" width="${sym.length * 9.2 + 6}" height="16" rx="4" fill="#0f1226" opacity="0.9"/>`;
      svg += `<text x="${lx}" y="${ly + 3}" text-anchor="middle" font-size="12.5" fill="#4dd6ff">${sym}</text>`;
    });

    // 节点
    fa.states.forEach((s, i) => {
      const p = pos[i];
      const nm = nameOf(s);
      const isStart = starts.includes(i);
      const isFinal = finals.includes(i);
      if (isStart) {
        svg += `<path d="M ${p.x - R - 22} ${p.y - 8} L ${p.x - R - 6} ${p.y} L ${p.x - R - 22} ${p.y + 8} Z" fill="#ffd166"/>`;
      }
      if (isFinal) svg += `<circle cx="${p.x}" cy="${p.y}" r="${R}" fill="#1e2348" stroke="#2fd08a" stroke-width="2.4"/>`;
      svg += `<circle cx="${p.x}" cy="${p.y}" r="${R - 4}" fill="#1e2348" stroke="${isFinal ? '#2fd08a' : '#7c6cff'}" stroke-width="2.4" style="cursor:${opts.onNodeClick ? 'pointer' : 'default'}" data-node="${i}"/>`;
      svg += `<text x="${p.x}" y="${p.y + 5}" text-anchor="middle" font-size="14" fill="#e8eaf6" font-weight="bold" data-node="${i}" style="cursor:pointer">${nm}</text>`;
      const lb = labelOf(s);
      if (lb && opts.stateLabelBelow !== false) {
        svg += `<text x="${p.x}" y="${p.y + R + 15}" text-anchor="middle" font-size="10.5" fill="#9aa0c7">${lb}</text>`;
      }
    });
    svg += '</svg>';
    el.innerHTML = `<div class="svgwrap">${svg}</div>`;
    if (opts.onNodeClick) {
      el.querySelectorAll('[data-node]').forEach(n => {
        n.addEventListener('click', () => opts.onNodeClick(+n.dataset.node));
      });
    }
  }

  /* ---------- 步骤播放器 ----------
     rows: [{html: '<td>…</td>', 或 数组[cells]}, note: '说明']
     headers: ['步骤','分析栈',...]
  */
  function stepPlayer(mountId, headers, rows, opts = {}) {
    const el = typeof mountId === 'string' ? document.getElementById(mountId) : mountId;
    let cur = -1;
    function render() {
      let html = `<div class="stepper">
        <button class="btn small" data-s="first">⏮ 首步</button>
        <button class="btn small" data-s="prev">◀ 上一步</button>
        <button class="btn small" data-s="next">下一步 ▶</button>
        <button class="btn small" data-s="last">末步 ⏭</button>
        <button class="btn small ghost" data-s="auto">▶ 自动播放</button>
        <span style="color:var(--muted);font-size:13px">${cur + 1} / ${rows.length}</span></div>
        <table class="gt"><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
      rows.forEach((r, i) => {
        const cells = Array.isArray(r.cells) ? r.cells.map(c => `<td>${c}</td>`).join('') : `<td>${r.html}</td>`;
        html += `<tr class="${i === cur ? 'me' : ''}" style="${i > cur && !opts.showAll ? 'opacity:.35' : ''}">${opts.showIndex === false ? '' : `<td>${i + 1}</td>`}${cells}</tr>`;
      });
      html += `</table>`;
      if (cur >= 0 && rows[cur].note) html += `<div class="notice" style="margin-top:8px">💡 ${rows[cur].note}</div>`;
      el.innerHTML = html;
      el.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => {
        const s = b.dataset.s;
        if (s === 'first') cur = 0;
        if (s === 'prev') cur = Math.max(0, cur - 1);
        if (s === 'next') cur = Math.min(rows.length - 1, cur + 1);
        if (s === 'last') cur = rows.length - 1;
        if (s === 'auto') {
          cur = 0; render();
          const t = setInterval(() => {
            cur++; render();
            if (cur >= rows.length - 1) clearInterval(t);
          }, opts.speed || 900);
          return;
        }
        render();
      }));
    }
    cur = 0;
    render();
  }

  /* ---------- 大题（导出给AI老师批改） ---------- */
  function bigQuestions(mountId, cfg) {
    const el = typeof mountId === 'string' ? document.getElementById(mountId) : mountId;
    let html = `<div class="notice">✍️ <b>大题演练</b>：在文本框里写出你的解答过程，然后点"复制全部答案"，粘贴给 AI 老师批改讲解。</div>`;
    cfg.questions.forEach((q, i) => {
      html += `<div class="q bigq" style="border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:12px 0">
        <div class="stem">${i + 1}. ${q.q}</div>
        ${q.hint ? `<details class="fold"><summary>💡 提示</summary>${q.hint}</details>` : ''}
        <textarea data-bq="${i}" placeholder="在这里写你的解答…"></textarea></div>`;
    });
    html += `<button class="btn" id="bq-copy-${cfg.id}">📋 复制全部答案（发给AI老师）</button>`;
    el.innerHTML = html;
    document.getElementById('bq-copy-' + cfg.id).addEventListener('click', () => {
      let txt = `【${cfg.title} 大题作答】\n`;
      cfg.questions.forEach((q, i) => {
        const v = el.querySelector(`[data-bq="${i}"]`).value.trim();
        txt += `\n第${i + 1}题：${q.q}\n我的解答：${v || '（未作答）'}\n`;
      });
      txt += `\n提交时间: ${new Date().toLocaleString()}`;
      copyText(txt, document.getElementById('bq-copy-' + cfg.id));
    });
  }

  /* ---------- 通用：表格渲染 ---------- */
  function gt(headers, rows, opts = {}) {
    let html = `<table class="gt">`;
    if (headers) html += `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    rows.forEach(r => {
      const cls = r.__cls || '';
      html += `<tr class="${cls}">${r.map(c => `<td>${c}</td>`).join('')}</tr>`;
    });
    return html + `</table>`;
  }

  global.BYUI = { nav, progress, quiz, drawFA, stepPlayer, bigQuestions, gt, copyText, LEVELS };
})(window);
