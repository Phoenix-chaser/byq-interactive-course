/* ============================================================
   编译原理互动课堂 · 算法引擎 BYQ (BianYi Engine)
   纯 JS 实现，无依赖：
   - 文法解析 / nullable / FIRST / FOLLOW / SELECT / LL(1) 判定
   - LL(1) 预测分析表 + 栈分析模拟
   - NFA: ε-闭包 / Move / 子集法确定化 / DFA 最小化(分割法)
   - 正规式 → NFA (Thompson 构造)
   - 正规文法 ↔ FA
   - LR(0) / SLR(1) / LR(1) / LALR(1) 项目集族、分析表、移进归约模拟
   - 表达式 → 四元式(三地址码)
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------------- 通用工具 ---------------- */
  const EPS = 'ε';
  const END = '#';

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uniq(arr) { return [...new Set(arr)]; }
  // 集合用排序数组表示，保证显示稳定
  function setAdd(set, x) { if (!set.includes(x)) { set.push(x); set.sort(); } }
  function setUnion(a, b) { const r = [...a]; b.forEach(x => setAdd(r, x)); return r; }
  function setMinus(a, b) { return a.filter(x => !b.includes(x)); }
  function setInter(a, b) { return a.filter(x => b.includes(x)); }
  function setEq(a, b) { return a.length === b.length && setInter(a, b).length === a.length; }
  function contains(set, x) { return set.includes(x); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------------- 文法解析 ----------------
     输入多行文本，每行:  E -> E+T | T
     符号: 单字符；大写字母后可带撇号（E'）视为一个非终结符；
           ε 或 @ 表示空产生式；# 保留为输入结束符。
  */
  function tokenizeRHS(s) {
    const toks = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      if (c === EPS || c === '@') { i++; continue; } // ε 不产生符号
      if (/[A-Z]/.test(c)) {
        if (s[i + 1] === "'") { toks.push(c + "'"); i += 2; }
        else { toks.push(c); i++; }
      } else if (c === "'") {
        throw new Error("撇号必须跟在大写字母后，如 E' ：" + s);
      } else {
        toks.push(c); i++;
      }
    }
    return toks;
  }

  function parseGrammar(src) {
    const prods = [];
    const vnSet = [], vtSet = [];
    let start = null;
    const lines = String(src).split(/\n+/).map(l => l.trim()).filter(l => l && !l.startsWith('//'));
    for (const line of lines) {
      const m = line.split(/->|→|::=|:=/);
      if (m.length < 2) throw new Error('无法解析产生式行: "' + line + '"，需要形如  E->E+T|T');
      const lhs = m[0].trim();
      if (!/^[A-Z]'?$/.test(lhs)) throw new Error('产生式左部必须是单个非终结符(大写字母可带撇号): "' + lhs + '"');
      if (start === null) start = lhs;
      setAdd(vnSet, lhs);
      const alts = m.slice(1).join('->').split('|');
      for (const alt of alts) {
        const rhs = tokenizeRHS(alt.trim());
        prods.push({ lhs, rhs, no: prods.length });
        rhs.forEach(x => {
          if (/[A-Z]'?/.test(x) && x === x.toUpperCase() || /^[A-Z]'$/.test(x) || /^[A-Z]$/.test(x)) setAdd(vnSet, x);
          else setAdd(vtSet, x);
        });
      }
    }
    if (!start) throw new Error('文法为空');
    // 修正：开始符号取第一条产生式左部
    start = prods[0].lhs;
    return { start, prods, vn: vnSet, vt: vtSet.filter(t => t !== END), vnSet, vtSet };
  }

  function isVN(g, x) { return contains(g.vn, x); }

  /* ---------------- nullable / FIRST / FOLLOW / SELECT ---------------- */
  function computeNullable(g) {
    const nullable = {};
    g.vn.forEach(A => nullable[A] = false);
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of g.prods) {
        if (!nullable[p.lhs] && p.rhs.every(x => isVN(g, x) && nullable[x])) {
          nullable[p.lhs] = true; changed = true;
        }
      }
    }
    return nullable; // {A: bool}，右部为空(ε)的产生式自然使 lhs 可空
  }

  function seqNullable(g, seq, nullable) {
    return seq.every(x => !isVN(g, x) ? false : nullable[x]);
  }

  // firstOfSymbol: {A: [...]}（可含 ε）
  function computeFirst(g) {
    const nullable = computeNullable(g);
    const first = {};
    g.vn.forEach(A => first[A] = []);
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of g.prods) {
        const f = firstOfSeqRaw(g, p.rhs, first);
        const before = first[p.lhs].length;
        first[p.lhs] = setUnion(first[p.lhs], f);
        if (first[p.lhs].length !== before) changed = true;
      }
    }
    return { first, nullable };
  }

  // 求符号串 FIRST（可含 ε）。first: 非终结符的FIRST表
  function firstOfSeqRaw(g, seq, first) {
    let result = [];
    let allNullable = true;
    for (const x of seq) {
      if (!isVN(g, x)) { result = setUnion(result, [x]); allNullable = false; break; }
      const fx = first[x] || [];
      result = setUnion(result, setMinus(fx, [EPS]));
      if (!contains(fx, EPS)) { allNullable = false; break; }
    }
    if (allNullable) setAdd(result, EPS);
    return result;
  }

  function computeFollow(g) {
    const { first, nullable } = computeFirst(g);
    const follow = {};
    g.vn.forEach(A => follow[A] = []);
    setAdd(follow[g.start], END);
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of g.prods) {
        for (let i = 0; i < p.rhs.length; i++) {
          const B = p.rhs[i];
          if (!isVN(g, B)) continue;
          const beta = p.rhs.slice(i + 1);
          const fb = firstOfSeqRaw(g, beta, first);
          const before = follow[B].length;
          follow[B] = setUnion(follow[B], setMinus(fb, [EPS]));
          if (contains(fb, EPS) || beta.length === 0) {
            follow[B] = setUnion(follow[B], follow[p.lhs]);
          }
          if (follow[B].length !== before) changed = true;
        }
      }
    }
    return { follow, first, nullable };
  }

  // SELECT: 每条产生式 {no: [...]}
  function computeSelect(g) {
    const { first, follow, nullable } = computeFollow(g);
    const select = {};
    for (const p of g.prods) {
      const f = firstOfSeqRaw(g, p.rhs, first);
      select[p.no] = contains(f, EPS)
        ? setUnion(setMinus(f, [EPS]), follow[p.lhs])
        : f;
    }
    return { select, first, follow, nullable };
  }

  function firstOfSeq(g, seq) {
    const { first } = computeFirst(g);
    return firstOfSeqRaw(g, seq, first);
  }

  // LL(1) 判定
  function checkLL1(g) {
    const { select } = computeSelect(g);
    const conflicts = [];
    const byLhs = {};
    g.prods.forEach(p => { (byLhs[p.lhs] = byLhs[p.lhs] || []).push(p); });
    for (const A of Object.keys(byLhs)) {
      const ps = byLhs[A];
      for (let i = 0; i < ps.length; i++)
        for (let j = i + 1; j < ps.length; j++) {
          const inter = setInter(select[ps[i].no], select[ps[j].no]);
          if (inter.length)
            conflicts.push({ lhs: A, p1: ps[i], p2: ps[j], inter });
        }
    }
    return { isLL1: conflicts.length === 0, conflicts, select };
  }

  /* ---------------- LL(1) 预测分析表 + 分析过程 ---------------- */
  function buildPredictTable(g) {
    const { select } = computeSelect(g);
    const terms = uniq([...g.vt, END]);
    const table = {}; // M[A][a] = {no, rhs} 或 {error: 'multiple', prods:[]}
    let multiple = [];
    g.vn.forEach(A => { table[A] = {}; });
    for (const p of g.prods) {
      for (const a of select[p.no]) {
        if (table[p.lhs][a]) {
          if (!table[p.lhs][a].multi) { table[p.lhs][a] = { multi: true, prods: [table[p.lhs][a], { no: p.no, lhs: p.lhs, rhs: p.rhs }] }; }
          else table[p.lhs][a].prods.push({ no: p.no, lhs: p.lhs, rhs: p.rhs });
          multiple.push({ cell: p.lhs + ',' + a });
        } else {
          table[p.lhs][a] = { no: p.no, lhs: p.lhs, rhs: p.rhs };
        }
      }
    }
    return { table, terms, multiple, select };
  }

  // 表驱动 LL(1) 分析；input 不带 #（自动追加）
  function llParse(g, input) {
    const { table } = buildPredictTable(g);
    const w = input.split('').filter(c => c !== ' ');
    w.push(END);
    const stack = [END, g.start];
    const steps = [];
    let ptr = 0, ok = true, err = null;
    steps.push({ stack: [...stack], rest: w.slice(ptr), action: '初始' });
    for (let t = 0; t < 500; t++) {
      const X = stack[stack.length - 1];
      const a = w[ptr];
      if (X === END && a === END) {
        steps.push({ stack: [...stack], rest: w.slice(ptr), action: '接受 ✓' });
        return { accept: true, steps };
      }
      if (X === END || !isVN(g, X)) {
        if (X === a) {
          stack.pop(); ptr++;
          steps.push({ stack: [...stack], rest: w.slice(ptr), action: '弹出并匹配终结符 ' + X });
        } else {
          steps.push({ stack: [...stack], rest: w.slice(ptr), action: '出错：栈顶 ' + X + ' 与输入 ' + a + ' 不匹配 ✗' });
          return { accept: false, steps, err: '栈顶终结符 ' + X + ' 与当前输入 ' + a + ' 不匹配' };
        }
      } else {
        const cell = table[X] && table[X][a];
        if (!cell) {
          steps.push({ stack: [...stack], rest: w.slice(ptr), action: '出错：M[' + X + ',' + a + '] 为空白 ✗' });
          return { accept: false, steps, err: '分析表 M[' + X + ',' + a + '] 为空(出错入口)' };
        }
        if (cell.multi) {
          return { accept: false, steps, err: '分析表含多重定义，非 LL(1) 文法' };
        }
        stack.pop();
        for (let i = cell.rhs.length - 1; i >= 0; i--) stack.push(cell.rhs[i]);
        steps.push({
          stack: [...stack], rest: w.slice(ptr),
          action: '用 ' + X + '→' + (cell.rhs.join('') || EPS) + ' （右部逆序进栈）'
        });
      }
    }
    return { accept: false, steps, err: '步数超限' };
  }

  /* ---------------- NFA / DFA ---------------- */
  // NFA: {states:[], alpha:[], trans:{s:{sym:[t...]}}, starts:[], finals:[]}
  // ε 弧的 sym 用 'ε' 表示
  // 状态名排序：数字按数值序，字符串按自然序
  function stateSort(arr) {
    return arr.sort((x, y) => {
      const nx = parseInt(x, 10), ny = parseInt(y, 10);
      if (!isNaN(nx) && !isNaN(ny) && String(nx) === String(x) && String(ny) === String(y)) return nx - ny;
      return String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0;
    });
  }

  function nfaEpsilonClosure(nfa, I) {
    const stack = [...I], result = [...I];
    while (stack.length) {
      const s = stack.pop();
      const nexts = (nfa.trans[s] && nfa.trans[s][EPS]) || [];
      for (const t of nexts) if (!result.includes(t)) { result.push(t); stack.push(t); }
    }
    return stateSort(result);
  }

  function nfaMove(nfa, I, a) {
    const r = [];
    for (const s of I) {
      const nexts = (nfa.trans[s] && nfa.trans[s][a]) || [];
      for (const t of nexts) if (!r.includes(t)) r.push(t);
    }
    return stateSort(r);
  }

  // 子集法：返回 {dfa, steps}
  // dfa: {states:[{name, set}], start:0, trans:{i:{a:j}}, finals:[i...], alpha}
  function subsetConstruct(nfa) {
    const alpha = nfa.alpha;
    const T = [];
    const trans = {};
    const findState = (set) => T.findIndex(s => setEq(s.set, set));
    const steps = [];
    const I0 = nfaEpsilonClosure(nfa, nfa.starts);
    T.push({ name: 'I0', set: I0 });
    let idx = 0;
    while (idx < T.length) {
      const I = T[idx];
      trans[idx] = {};
      for (const a of alpha) {
        const J = nfaMove(nfa, I.set, a);
        if (J.length === 0) continue;
        const Ia = nfaEpsilonClosure(nfa, J);
        let j = findState(Ia);
        if (j < 0) {
          T.push({ name: 'I' + (T.length), set: Ia });
          j = T.length - 1;
        }
        trans[idx][a] = j;
        steps.push({
          from: I.name, sym: a,
          move: '[' + J.join(',') + ']',
          closure: '[' + Ia.join(',') + ']',
          to: 'I' + j, isNew: findState(Ia) === j && T[j] && T[j].name === 'I' + j
        });
      }
      idx++;
    }
    const finals = [];
    T.forEach((s, i) => {
      if (s.set.some(x => nfa.finals.includes(x))) finals.push(i);
    });
    return {
      dfa: { states: T, start: 0, trans, finals, alpha }, steps
    };
  }

  // DFA: {states:[{name,set?}], start, trans:{i:{a:j}}, finals:[], alpha}
  function dfaRun(dfa, input) {
    let cur = dfa.start;
    const trace = [{ state: cur, rest: input }];
    for (const c of input) {
      const nxt = dfa.trans[cur] && dfa.trans[cur][c];
      if (nxt === undefined) return { accept: false, trace, err: '状态 ' + dfa.states[cur].name + ' 无 ' + c + ' 弧' };
      cur = nxt;
      trace.push({ state: cur, rest: '' });
    }
    return { accept: dfa.finals.includes(cur), trace };
  }

  // DFA 最小化（分割法）。先删除不可达状态。返回 {dfa, steps, removed}
  function minimizeDFA(dfa) {
    // 1. 删除不可达
    const reach = new Set([dfa.start]);
    const q = [dfa.start];
    while (q.length) {
      const s = q.shift();
      for (const a of dfa.alpha) {
        const t = dfa.trans[s] && dfa.trans[s][a];
        if (t !== undefined && !reach.has(t)) { reach.add(t); q.push(t); }
      }
    }
    const removed = dfa.states.map(s => s.name).filter((n, i) => !reach.has(i));
    const idMap = [...reach];
    const remap = {}; [...reach].forEach((old, i) => remap[old] = i);
    const st = idMap.map(old => dfa.states[old]);
    const trans = {};
    idMap.forEach((old, i) => {
      trans[i] = {};
      for (const a of dfa.alpha) {
        const t = dfa.trans[old] && dfa.trans[old][a];
        if (t !== undefined) trans[i][a] = remap[t];
      }
    });
    const finals = idMap.filter(old => dfa.finals.includes(old)).map(old => remap[old]);

    // 2. 初始分割
    let partition = [];
    const fin = [], nfin = [];
    st.forEach((s, i) => (finals.includes(i) ? fin : nfin).push(i));
    if (fin.length) partition.push(fin);
    if (nfin.length) partition.push(nfin);
    const steps = [{
      desc: '初始分割：终态 {' + (fin.map(i => st[i].name).join(',') || '空') + '} / 非终态 {' + nfin.map(i => st[i].name).join(',') + '}',
      partition: partition.map(b => b.map(i => st[i].name))
    }];

    // 3. 反复分割
    let changed = true;
    while (changed) {
      changed = false;
      for (let bi = 0; bi < partition.length; bi++) {
        const block = partition[bi];
        if (block.length === 1) continue;
        // 按各输入符号目标块签名分组
        const groups = {};
        for (const s of block) {
          const sig = dfa.alpha.map(a => {
            const t = trans[s][a];
            if (t === undefined) return '∅';
            const tb = partition.findIndex(B => B.includes(t));
            return 'B' + tb;
          }).join(',');
          (groups[sig] = groups[sig] || []).push(s);
        }
        const sigs = Object.keys(groups);
        if (sigs.length > 1) {
          const detail = dfa.alpha.join(',');
          steps.push({
            desc: '块 {' + block.map(i => st[i].name).join(',') + '} 按 (' + detail + ') 的转移目标分属不同块 → 分裂',
            partition: null, splitFrom: block.map(i => st[i].name),
            splitTo: sigs.map(sig => groups[sig].map(i => st[i].name))
          });
          partition.splice(bi, 1);
          for (const sig of sigs) partition.push(groups[sig]);
          changed = true;
          break;
        }
      }
    }
    steps.push({ desc: '不再产生新分割，最终等价类确定', partition: partition.map(b => b.map(i => st[i].name)) });

    // 4. 构造最小 DFA：每块取代表（取块中最小下标）
    const repOf = {}; // 原状态 -> 代表(块内第一个)
    partition.forEach(B => { const rep = Math.min(...B); B.forEach(s => repOf[s] = rep); });
    const newStates = [];
    const newIndexOf = {};
    partition.forEach(B => {
      const rep = Math.min(...B);
      const name = st[rep].name + (B.length > 1 ? '(' + B.map(i => st[i].name).join('=') + ')' : '');
      newIndexOf[rep] = newStates.length;
      newStates.push({ name, set: B.map(i => st[i].name), rep });
    });
    const newTrans = {};
    newStates.forEach((ns, i) => {
      newTrans[i] = {};
      for (const a of dfa.alpha) {
        const t = trans[ns.rep] && trans[ns.rep][a];
        if (t !== undefined) newTrans[i][a] = newIndexOf[repOf[t]];
      }
    });
    const newFinals = [];
    newStates.forEach((ns, i) => { if (finals.includes(ns.rep)) newFinals.push(i); });
    const newStart = newIndexOf[repOf[remap[dfa.start]]];
    return {
      dfa: { states: newStates, start: newStart, trans: newTrans, finals: newFinals, alpha: dfa.alpha },
      steps, removed
    };
  }

  /* ---------------- 正规式 → NFA (Thompson) ---------------- */
  function regexToNFA(pattern) {
    // 词法
    const toks = [];
    for (const ch of String(pattern)) {
      if (ch === ' ' || ch === '\t') continue;
      toks.push(ch);
    }
    let pos = 0;
    const peek = () => toks[pos];
    const next = () => toks[pos++];
    function alt() {
      let l = concat();
      while (peek() === '|') { next(); const r = concat(); l = mkAlt(l, r); }
      return l;
    }
    function concat() {
      let l = null;
      while (peek() && peek() !== '|' && peek() !== ')') {
        const r = star();
        l = l ? mkConcat(l, r) : r;
      }
      if (!l) l = mkEps();
      return l;
    }
    function star() {
      let a = atom();
      while (peek() === '*') { next(); a = mkStar(a); }
      return a;
    }
    function atom() {
      const c = next();
      if (c === undefined) throw new Error('正规式提前结束');
      if (c === '(') { const inner = alt(); if (next() !== ')') throw new Error('括号不匹配'); return inner; }
      if (c === ')' || c === '|' || c === '*') throw new Error('非法字符位置: ' + c);
      if (c === '@') return mkEps();
      return mkSym(c);
    }
    // 片段: {start, accept, trans:{from:{sym:[to...]}}}
    let sid = 0;
    const newState = () => 'S' + (sid++);
    const trans = {};
    const addT = (f, sym, t) => { (trans[f] = trans[f] || {})[sym] = (trans[f][sym] || []).concat([t]); };
    function mkSym(c) { const s = newState(), e = newState(); addT(s, c, e); return { start: s, accept: e }; }
    function mkEps() { const s = newState(), e = newState(); addT(s, EPS, e); return { start: s, accept: e }; }
    function mkConcat(l, r) { addT(l.accept, EPS, r.start); return { start: l.start, accept: r.accept, merge: true, l, r }; }
    function mkAlt(l, r) {
      const s = newState(), e = newState();
      addT(s, EPS, l.start); addT(s, EPS, r.start);
      addT(l.accept, EPS, e); addT(r.accept, EPS, e);
      return { start: s, accept: e };
    }
    function mkStar(a) {
      const s = newState(), e = newState();
      addT(s, EPS, a.start); addT(s, EPS, e);
      addT(a.accept, EPS, a.start); addT(a.accept, EPS, e);
      return { start: s, accept: e };
    }
    const frag = alt();
    if (pos < toks.length) throw new Error('正规式多余部分: ' + toks.slice(pos).join(''));
    // 收集全部状态与字母表
    const states = [];
    (function collect(o) {
      for (const f of Object.keys(trans)) { if (!states.includes(f)) states.push(f); }
    })();
    Object.keys(trans).forEach(f => {
      Object.values(trans[f]).forEach(ts => ts.forEach(t => { if (!states.includes(t)) states.push(t); }));
    });
    states.push(frag.start, frag.accept);
    const uniqStates = uniq(states);
    const alpha = uniq(toks.filter(t => !'|()*@'.includes(t)));
    // 重编号为 0..n-1，起点为 0
    const order = [frag.start];
    // BFS 使编号更像课本
    const seen = new Set(order);
    const qq = [...order];
    while (qq.length) {
      const s = qq.shift();
      for (const sym of [...alpha, EPS]) {
        const ts = (trans[s] && trans[s][sym]) || [];
        for (const t of ts) if (!seen.has(t)) { seen.add(t); order.push(t); qq.push(t); }
      }
    }
    uniqStates.forEach(s => { if (!seen.has(s)) { seen.add(s); order.push(s); } });
    const nfa = { states: order, alpha, trans: {}, starts: [order.indexOf(frag.start)], finals: [order.indexOf(frag.accept)] };
    for (const f of Object.keys(trans)) {
      const fi = order.indexOf(f);
      nfa.trans[fi] = {};
      for (const sym of Object.keys(trans[f])) nfa.trans[fi][sym] = trans[f][sym].map(t => order.indexOf(t));
    }
    return nfa;
  }

  /* ---------------- 正规文法 ↔ FA ---------------- */
  // 右线性正规文法 → NFA（每非终结符一状态，加终态 Z；A→xB: f(A,x)=B；A→x: f(A,x)=Z；x 可为 ε）
  function rgToFA(g) {
    const states = [...g.vn, 'Z'];
    const trans = {};
    let alpha = [];
    g.vn.forEach(A => trans[A] = {});
    for (const p of g.prods) {
      const rhs = p.rhs;
      if (rhs.length === 0) { // A→ε
        (trans[p.lhs][EPS] = trans[p.lhs][EPS] || []).push('Z');
      } else if (rhs.length === 1) { // A→a
        const a = rhs[0];
        (trans[p.lhs][a] = trans[p.lhs][a] || []).push('Z');
        if (!alpha.includes(a)) alpha.push(a);
      } else if (rhs.length === 2 && isVN(g, rhs[1])) { // A→aB
        const a = rhs[0];
        (trans[p.lhs][a] = trans[p.lhs][a] || []).push(rhs[1]);
        if (!alpha.includes(a)) alpha.push(a);
      } else {
        throw new Error('产生式 ' + p.lhs + '→' + rhs.join('') + ' 不是右线性(3型)形式 A→aB 或 A→a');
      }
    }
    // 状态名转索引
    const nfa = {
      states: states.map((s, i) => i),
      names: states,
      alpha,
      trans: {},
      starts: [states.indexOf(g.start)],
      finals: [states.indexOf('Z')]
    };
    states.forEach((s, i) => {
      if (trans[s]) {
        nfa.trans[i] = {};
        Object.keys(trans[s]).forEach(sym => nfa.trans[i][sym] = trans[s][sym].map(t => states.indexOf(t)));
      }
    });
    nfa.getNames = true;
    return nfa;
  }

  /* ================= LR 分析 ================= */
  // 拓广文法：产生式 0 号固定为 S'→S
  function augment(g) {
    const S1 = g.start + "'";
    const prods = [{ lhs: S1, rhs: [g.start], no: 0 }].concat(g.prods.map(p => ({ lhs: p.lhs, rhs: [...p.rhs], no: p.no + 1 })));
    const vn = uniq([S1, ...g.vn]);
    return { start: S1, prods, vn, vt: g.vt, orig: g };
  }
  function isVNa(G, x) { return contains(G.vn, x); }

  function itemStr(G, it) {
    const p = G.prods[it.no];
    const l = [...p.rhs]; l.splice(it.dot, 0, '·');
    return p.lhs + '→' + (p.rhs.length ? l.join('') : '·');
  }
  function item1Str(G, it) {
    const p = G.prods[it.no];
    const l = [...p.rhs]; l.splice(it.dot, 0, '·');
    return p.lhs + '→' + (p.rhs.length ? l.join('') : '·') + ', ' + [...it.la].sort().join('/');
  }

  // LR(0) 闭包
  function closure0(G, items) {
    // items: [{no, dot}]
    const set = items.map(i => ({ ...i }));
    let changed = true;
    while (changed) {
      changed = false;
      for (const it of [...set]) {
        const p = G.prods[it.no];
        const X = p.rhs[it.dot];
        if (X !== undefined && isVNa(G, X)) {
          for (const q of G.prods) {
            if (q.lhs !== X) continue;
            const cand = { no: q.no, dot: 0 };
            if (!set.some(t => t.no === cand.no && t.dot === cand.dot)) { set.push(cand); changed = true; }
          }
        }
      }
    }
    return set.sort((a, b) => a.no - b.no || a.dot - b.dot);
  }

  function itemsKey(items) {
    return items.map(i => i.no + '.' + i.dot).join('|');
  }

  function go0(G, items, X) {
    const moved = items.filter(it => G.prods[it.no].rhs[it.dot] === X).map(it => ({ no: it.no, dot: it.dot + 1 }));
    if (!moved.length) return null;
    return closure0(G, moved);
  }

  // LR(0) 项目集规范族
  function canonical0(g) {
    const G = augment(g);
    const I0 = closure0(G, [{ no: 0, dot: 0 }]);
    const C = [{ items: I0, key: itemsKey(I0) }];
    const trans = {}; // stateIndex -> {X: stateIndex}
    const edges = [];
    let i = 0;
    const symbols = uniq([...G.vn, ...G.vt]);
    while (i < C.length) {
      trans[i] = {};
      for (const X of symbols) {
        const J = go0(G, C[i].items, X);
        if (!J) continue;
        const key = itemsKey(J);
        let j = C.findIndex(s => s.key === key);
        if (j < 0) { C.push({ items: J, key }); j = C.length - 1; }
        trans[i][X] = j;
        edges.push({ from: i, to: j, sym: X });
      }
      i++;
    }
    return { G, C, trans, edges };
  }

  // 项目分类
  function classifyItems(G, items) {
    const shifts = [], reduces = [], accepts = [], waits = [];
    for (const it of items) {
      const p = G.prods[it.no];
      if (it.no === 0 && it.dot === 1) accepts.push(it);
      else if (p.rhs.length === it.dot) reduces.push(it);
      else if (!isVNa(G, p.rhs[it.dot])) shifts.push(it);
      else waits.push(it);
    }
    return { shifts, reduces, accepts, waits };
  }

  function prodStr(p) { return p.lhs + '→' + (p.rhs.join('') || EPS); }

  // 构造 LR 分析表: method in {'LR0','SLR','LR1','LALR'}
  function buildLRTable(g, method) {
    method = method || 'LR0';
    if (method === 'LR0' || method === 'SLR') {
      const { G, C, trans } = canonical0(g);
      const { follow } = computeFollow(g); // 原文法的 FOLLOW
      const terms = uniq([...g.vt, END]);
      const action = C.map(() => ({}));
      const gotoT = C.map(() => ({}));
      const conflicts = [];
      const put = (k, col, val) => {
        if (action[k][col] && action[k][col] !== val) {
          conflicts.push({ state: 'I' + k, cell: col, had: action[k][col], add: val });
          action[k][col] = action[k][col] + '/' + val;
        } else action[k][col] = val;
      };
      C.forEach((I, k) => {
        const cls = classifyItems(G, I.items);
        cls.shifts.forEach(it => {
          const a = G.prods[it.no].rhs[it.dot];
          put(k, a, 's' + trans[k][a]);
        });
        cls.reduces.forEach(it => {
          const p = G.prods[it.no];
          const reduceCols = method === 'LR0' ? [...terms] : follow[p.lhs];
          reduceCols.forEach(a => put(k, a, 'r' + it.no));
        });
        cls.accepts.forEach(() => { put(k, END, 'acc'); });
        G.vn.forEach(A => { if (trans[k][A] !== undefined) gotoT[k][A] = trans[k][A]; });
      });
      return { method, G, C, trans, action, goto: gotoT, conflicts, terms, vars: G.vn.filter(v => v !== G.start), states: C.length };
    }
    // LR(1) / LALR(1)
    const G = augment(g);
    const { closure1, go1 } = lr1Helpers(G);
    const I0 = closure1(G, [{ no: 0, dot: 0, la: [END] }]);
    const C = [{ items: I0, key: lr1Key(I0) }];
    const trans = {};
    let i = 0;
    const symbols = uniq([...G.vn, ...G.vt]);
    while (i < C.length) {
      trans[i] = {};
      for (const X of symbols) {
        const J = go1(G, C[i].items, X);
        if (!J || !J.length) continue;
        const key = lr1Key(J);
        let j = C.findIndex(s => s.key === key);
        if (j < 0) { C.push({ items: J, key }); j = C.length - 1; }
        trans[i][X] = j;
      }
      i++;
    }
    let CC = C, ttrans = trans, mergedInfo = null;
    if (method === 'LALR') {
      const merged = mergeLALR(G, C, trans);
      CC = merged.C; ttrans = merged.trans; mergedInfo = merged.info;
    }
    const terms = uniq([...g.vt, END]);
    const action = CC.map(() => ({}));
    const gotoT = CC.map(() => ({}));
    const conflicts = [];
    const put = (k, col, val) => {
      if (action[k][col] && action[k][col] !== val) {
        conflicts.push({ state: 'I' + k, cell: col, had: action[k][col], add: val });
        action[k][col] = action[k][col] + '/' + val;
      } else action[k][col] = val;
    };
    CC.forEach((I, k) => {
      for (const it of I.items) {
        const p = G.prods[it.no];
        const next = p.rhs[it.dot];
        if (it.no === 0 && it.dot === 1) {
          if (it.la.includes(END)) put(k, END, 'acc');
        } else if (next === undefined) {
          it.la.forEach(a => put(k, a, 'r' + it.no));
        } else if (!isVNa(G, next)) {
          put(k, next, 's' + ttrans[k][next]);
        }
      }
      G.vn.forEach(A => { if (A !== G.start && ttrans[k][A] !== undefined) gotoT[k][A] = ttrans[k][A]; });
    });
    return { method, G, C: CC, trans: ttrans, action, goto: gotoT, conflicts, terms, vars: G.vn.filter(v => v !== G.start), states: CC.length, lr1C: method === 'LALR' ? C : null, mergedInfo };
  }

  function lr1Key(items) {
    return items.map(i => i.no + '.' + i.dot + ',' + [...i.la].sort().join('/')).join('|');
  }
  function lr1Helpers(G) {
    function closure1(G, items) {
      const set = items.map(i => ({ no: i.no, dot: i.dot, la: [...i.la] }));
      const find = (no, dot) => set.find(t => t.no === no && t.dot === dot);
      let changed = true;
      while (changed) {
        changed = false;
        for (const it of [...set]) {
          const p = G.prods[it.no];
          const B = p.rhs[it.dot];
          if (B === undefined || !isVNa(G, B)) continue;
          // FIRST(β a)
          const beta = p.rhs.slice(it.dot + 1);
          const las = [];
          let allNullable = true;
          for (const x of beta) {
            if (!isVNa(G, x)) { las.push(x); allNullable = false; break; }
            const fx = firstCache[x] || [];
                fx.forEach(f => { if (f !== EPS) setAdd(las, f); });
            if (!(nullableCache[x])) { allNullable = false; break; }
          }
          if (allNullable) it.la.forEach(a => setAdd(las, a));
          for (const q of G.prods) {
            if (q.lhs !== B) continue;
            const ex = find(q.no, 0);
            if (!ex) { set.push({ no: q.no, dot: 0, la: [...las] }); changed = true; }
            else {
              const before = ex.la.length;
              las.forEach(a => setAdd(ex.la, a));
              if (ex.la.length !== before) changed = true;
            }
          }
        }
      }
      return set.sort((a, b) => a.no - b.no || a.dot - b.dot);
    }
    function go1(G, items, X) {
      const moved = items.filter(it => G.prods[it.no].rhs[it.dot] === X).map(it => ({ no: it.no, dot: it.dot + 1, la: [...it.la] }));
      if (!moved.length) return null;
      // 合并同心项目后求闭包
      const merged = [];
      for (const m of moved) {
        const ex = merged.find(t => t.no === m.no && t.dot === m.dot);
        if (ex) m.la.forEach(a => setAdd(ex.la, a)); else merged.push(m);
      }
      return closure1(G, merged);
    }
    // FIRST/nullable 缓存（对拓广文法，含原文法全部非终结符）
    const { first, nullable } = computeFirst(G.orig);
    const firstCache = first, nullableCache = nullable;
    return { closure1, go1 };
  }

  // LALR: 合并同心集
  function mergeLALR(G, C, trans) {
    const coreOf = items => items.map(i => i.no + '.' + i.dot).sort().join('|');
    const groups = {};
    C.forEach((I, idx) => {
      const core = coreOf(I.items);
      (groups[core] = groups[core] || []).push(idx);
    });
    // 建立新状态
    const newC = [], map = {}; // oldIdx -> newIdx
    const info = [];
    Object.keys(groups).forEach(core => {
      const olds = groups[core];
      // 合并 lookahead
      const mergedItems = [];
      for (const oi of olds) {
        for (const it of C[oi].items) {
          const ex = mergedItems.find(t => t.no === it.no && t.dot === it.dot);
          if (ex) it.la.forEach(a => setAdd(ex.la, a));
          else mergedItems.push({ no: it.no, dot: it.dot, la: [...it.la] });
        }
      }
      mergedItems.sort((a, b) => a.no - b.no || a.dot - b.dot);
      map[olds[0]] = newC.length; // 代表旧状态
      olds.forEach(oi => map[oi] = newC.length);
      newC.push({ items: mergedItems, key: lr1Key(mergedItems) });
      if (olds.length > 1) info.push({ merged: olds.map(o => 'I' + o), to: 'I' + (newC.length - 1) });
    });
    // 新旧状态映射后，转移：对每个新状态，找其任一旧状态的转移映射
    const newTrans = {};
    newC.forEach((I, i) => {
      newTrans[i] = {};
    });
    C.forEach((I, oi) => {
      const ni = map[oi];
      Object.keys(trans[oi] || {}).forEach(X => {
        newTrans[ni][X] = map[trans[oi][X]];
      });
    });
    return { C: newC, trans: newTrans, info, map };
  }

  // LR 分析过程模拟
  function lrParse(table, input) {
    const { action, goto: gotoT, G } = table;
    const w = input.split('').filter(c => c !== ' ');
    w.push(END);
    const stateStack = [0], symStack = [END];
    const steps = [{ states: [...stateStack], syms: [...symStack], rest: w.slice(0), act: '初始', goto: '' }];
    for (let t = 0; t < 800; t++) {
      const k = stateStack[stateStack.length - 1];
      const a = w[0];
      const act = action[k] && action[k][a];
      if (!act) {
        steps.push({ states: [...stateStack], syms: [...symStack], rest: [...w], act: '出错：ACTION[' + k + ',' + a + '] 为空 ✗', goto: '' });
        return { accept: false, steps, err: 'ACTION[' + k + ',' + a + '] 无动作' };
      }
      if (act === 'acc') {
        steps.push({ states: [...stateStack], syms: [...symStack], rest: [...w], act: '接受 ✓', goto: '' });
        return { accept: true, steps };
      }
      if (/^s\d+/.test(act) || act.startsWith('s')) {
        const j = parseInt(act.slice(1));
        stateStack.push(j); symStack.push(a); w.shift();
        steps.push({ states: [...stateStack], syms: [...symStack], rest: [...w], act: 'ACTION[' + k + ',' + a + ']=s' + j + ' 移进 ' + a, goto: '' });
      } else if (/^r\d+/.test(act) || act.startsWith('r')) {
        const no = parseInt(act.slice(1));
        const p = G.prods[no];
        const len = p.rhs.length;
        for (let i = 0; i < len; i++) { stateStack.pop(); symStack.pop(); }
        symStack.push(p.lhs);
        const kt = stateStack[stateStack.length - 1];
        const gt = gotoT[kt] && gotoT[kt][p.lhs];
        if (gt === undefined) {
          steps.push({ states: [...stateStack], syms: [...symStack], rest: [...w], act: '出错：GOTO[' + kt + ',' + p.lhs + '] 为空 ✗', goto: '' });
          return { accept: false, steps, err: 'GOTO[' + kt + ',' + p.lhs + '] 无目标' };
        }
        stateStack.push(gt);
        steps.push({
          states: [...stateStack], syms: [...symStack], rest: [...w],
          act: 'ACTION[' + k + ',' + a + ']=r' + no + ' 归约 ' + prodStr(p), goto: 'GOTO[' + kt + ',' + p.lhs + ']=' + gt
        });
      } else {
        return { accept: false, steps, err: '动作冲突/非法: ' + act };
      }
    }
    return { accept: false, steps, err: '步数超限' };
  }

  // 判定文法的 LR 类型（依次尝试 LR(0) → SLR(1) → LR(1) → LALR(1)）
  function classifyLR(g) {
    const res = {};
    const t0 = buildLRTable(g, 'LR0');
    res.LR0 = { ok: t0.conflicts.length === 0, conflicts: t0.conflicts, states: t0.states };
    if (res.LR0.ok) { res.SLR = { ok: true, states: t0.states }; res.LR1 = { ok: true }; res.LALR = { ok: true }; return res; }
    const tS = buildLRTable(g, 'SLR');
    res.SLR = { ok: tS.conflicts.length === 0, conflicts: tS.conflicts, states: tS.states };
    if (res.SLR.ok) { res.LR1 = { ok: true }; res.LALR = { ok: true }; return res; }
    const t1 = buildLRTable(g, 'LR1');
    res.LR1 = { ok: t1.conflicts.length === 0, conflicts: t1.conflicts, states: t1.states };
    if (!res.LR1.ok) { res.LALR = { ok: false }; return res; }
    const tL = buildLRTable(g, 'LALR');
    res.LALR = { ok: tL.conflicts.length === 0, conflicts: tL.conflicts, states: tL.states };
    return res;
  }

  /* ---------------- 表达式 → 四元式 ---------------- */
  function exprToQuads(src) {
    const toks = [];
    let i = 0;
    const s = String(src).replace(/\s+/g, '');
    while (i < s.length) {
      const c = s[i];
      if (/[0-9]/.test(c)) {
        let n = c; i++;
        while (i < s.length && /[0-9.]/.test(s[i])) n += s[i++];
        toks.push({ t: 'num', v: n });
      } else if (/[a-zA-Z_]/.test(c)) {
        let n = c; i++;
        while (i < s.length && /[a-zA-Z_0-9]/.test(s[i])) n += s[i++];
        toks.push({ t: 'id', v: n });
      } else if ('+-*/()'.includes(c)) {
        toks.push({ t: c, v: c }); i++;
      } else throw new Error('无法识别的字符: ' + c);
    }
    let p = 0;
    const peek = () => toks[p];
    const eat = (t) => {
      const tk = toks[p];
      if (!tk || tk.t !== t) throw new Error('期望 ' + (t || '结尾') + ' 但遇到 ' + (tk ? tk.v : '结尾'));
      p++; return tk;
    };
    const quads = [];
    let tmpNo = 0;
    const newTemp = () => 'T' + (++tmpNo);
    function expr() {
      let left = term();
      while (peek() && (peek().t === '+' || peek().t === '-')) {
        const op = eat(peek().t).v;
        const right = term();
        const t = newTemp();
        quads.push({ op, l: left, r: right, res: t });
        left = t;
      }
      return left;
    }
    function term() {
      let left = factor();
      while (peek() && (peek().t === '*' || peek().t === '/')) {
        const op = eat(peek().t).v;
        const right = factor();
        const t = newTemp();
        quads.push({ op, l: left, r: right, res: t });
        left = t;
      }
      return left;
    }
    function factor() {
      const tk = peek();
      if (!tk) throw new Error('表达式提前结束');
      if (tk.t === 'num' || tk.t === 'id') { p++; return tk.v; }
      if (tk.t === '(') { eat('('); const v = expr(); eat(')'); return v; }
      throw new Error('意外的符号: ' + tk.v);
    }
    const result = expr();
    if (p < toks.length) throw new Error('多余部分: ' + toks.slice(p).map(t => t.v).join(''));
    return { quads, result };
  }

  /* ---------------- 推导游戏支持（关卡1） ---------------- */
  // 在句型中把最左非终结符用产生式右部替换
  function deriveStep(form, prod) {
    const idx = form.findIndex(x => /[A-Z]'?/.test(x) && x === x.toUpperCase());
    if (idx < 0) return null;
    return [...form.slice(0, idx), ...prod.rhs, ...form.slice(idx + 1)];
  }
  function formToStr(form) {
    return form.map(x => x).join('') || EPS;
  }

  global.BYQ = {
    EPS, END,
    parseGrammar, isVN,
    computeNullable, computeFirst, firstOfSeq, computeFollow, computeSelect,
    checkLL1, buildPredictTable, llParse,
    nfaEpsilonClosure, nfaMove, subsetConstruct, dfaRun, minimizeDFA,
    regexToNFA, rgToFA,
    augment, canonical0, classifyItems, closure0, go0, itemStr, item1Str, buildLRTable, lrParse, classifyLR,
    lr1Helpers, mergeLALR, prodStr,
    exprToQuads, deriveStep, formToStr,
    utils: { setAdd, setUnion, setMinus, setInter, setEq, uniq, clone, esc }
  };
})(typeof window !== 'undefined' ? window : globalThis);
