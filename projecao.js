/* Projeção da apuração ao vivo (presidente e governador, 2º turno de 2026).
   Os números vêm do coletor que roda no GitHub Actions (ramo ao-vivo: coletor.py), que lê o TSE a cada ~45 s,
   calcula cinco premissas de projeção e grava a série no tempo. Aqui só se mostra, escolhe a premissa, simula e navega no tempo. */
(() => {
  'use strict';

  const REPO = 'leandrohgmafra-max/apuracao', RAMO = 'ao-vivo';
  const COR = { 13: '#c62828', 22: '#1f4fbf' };
  const OUTRAS = ['#e08a00', '#2e7d32'];
  const EXPLICA = {
    simples: 'O que falta apurar vota igual ao que já foi apurado no total. Ignora que regiões diferentes chegam em horas diferentes; serve de referência.',
    mun: 'Cada município mantém o resultado parcial dele; os que ainda não começaram seguem o estado. Corrige parte da ordem de chegada, mas não quem ainda não apurou nada.',
    t1: 'Cada município repete o 1º turno de 2026 entre os dois finalistas, ajustado pela variação já observada no estado (e no próprio município, se já começou).',
    t22: 'Como a anterior, mas a base é o 2º turno de 2022 (Lula contra Bolsonaro).',
    sec: 'A mais fina: o TSE publica quais seções já chegaram. As que faltam são projetadas pelo 1º turno de cada seção, ajustado pela variação das seções já apuradas do mesmo município.',
  };
  const ORDEM = ['sec', 't1', 't22', 'mun', 'simples'];
  const nf = new Intl.NumberFormat('pt-BR');
  const pct = (v, d = 1) => (v == null || !isFinite(v) ? '—' : (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%');
  const mi = (v) => (Math.abs(v) >= 1e6 ? (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi' : Math.abs(v) >= 1e3 ? Math.round(v / 1e3).toLocaleString('pt-BR') + ' mil' : nf.format(Math.round(v)));
  const titulo = (s) => (s || '').toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const phi = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2); return 0.5 * (1 + (x >= 0 ? y : -y)); };
  const hora = (iso) => { try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); } catch (e) { return ''; } };

  const PAINEIS = { projecao: document.getElementById('projecao'), apostas: document.getElementById('apostas'), abstencao: document.getElementById('abstencao') };
  const abas = document.getElementById('abas');
  if (!PAINEIS.projecao || !abas) return;
  let caixa = PAINEIS.projecao; // painel que está sendo desenhado
  const ABAS = [['apuracao', 'Apuração'], ['projecao', 'Projeção'], ['apostas', 'Apostas'], ['abstencao', 'Abstenção']];
  let aba = new URLSearchParams(location.search).get('aba') || 'apuracao';
  const S = { atual: null, serie: [], sha: null, nSerie: -1, corrida: null, modelo: null, idx: null, sim: null, munNome: null, erro: false, semApi: 0, apiEm: 0 };
  try { S.modelo = localStorage.getItem('proj-modelo'); } catch (e) { /* sem storage */ }

  // ---------- dados ----------
  async function baixa() {
    let base = `https://raw.githubusercontent.com/${REPO}/${RAMO}`;
    // a API do GitHub aceita 60 consultas por hora por IP (e muita gente divide IP no celular): consulta no máximo a cada 3 min
    // e, se ela recusar, usa o ramo por 10 min (o ramo pode atrasar até 5 min)
    if (document.hidden && S.atual) return;
    if (Date.now() > S.semApi && Date.now() - S.apiEm > 180000) {
      S.apiEm = Date.now();
      try {
        const r = await fetch(`https://api.github.com/repos/${REPO}/commits/${RAMO}`, { headers: { Accept: 'application/vnd.github.sha' } });
        if (r.ok) S.sha = (await r.text()).trim(); else { S.sha = null; S.semApi = Date.now() + 600000; }
      } catch (e) { S.sha = null; S.semApi = Date.now() + 600000; }
    }
    if (S.sha) base = `https://raw.githubusercontent.com/${REPO}/${S.sha}`;
    try {
      const p = await (await fetch(base + '/dados/projecao.json', { cache: 'no-cache' })).json();
      S.atual = p; S.erro = false;
      if (p.n_serie !== S.nSerie) {
        S.serie = await (await fetch(base + '/dados/serie.json', { cache: 'no-cache' })).json();
        S.nSerie = p.n_serie;
      }
    } catch (e) { S.erro = true; }
    const k = corridaDoEndereco();
    if (k) { AB.t = 0; await baixaAbstencao(k); }
    desenha();
  }

  function corridaDoEndereco() {
    const [e, c, uf] = decodeURIComponent(location.hash.slice(1)).split('/');
    if (e !== '2026-2' && location.hash.length > 1) return null;
    if (!c || c === '1') return 'br';
    if (c === '3') return (uf || 'ES').toLowerCase();
    return null;
  }

  // ---------- desenho ----------
  function nome(c, n) { return titulo((c.nomes && c.nomes[n]) || 'Nº ' + n); }
  function cor(n, i) { return (window.corUsuario && window.corUsuario(n)) || COR[n] || OUTRAS[i]; }
  // divisão entre os dois candidatos, sempre os dois lados com a cor de cada um
  function divide(c, p, rotulos) {
    const d = el('div', 'divide');
    const barra = el('div', 'divide-barra');
    const a = el('i'); a.style.width = (p * 100).toFixed(1) + '%'; a.style.background = cor(c.A, 0);
    const b = el('i'); b.style.width = ((1 - p) * 100).toFixed(1) + '%'; b.style.background = cor(c.B, 1);
    barra.append(a, b);
    const r = el('div', 'divide-rot');
    r.append(el('span', null, (rotulos ? nome(c, c.A).split(' ')[0] + ' ' : '') + pct(p)), el('span', null, (rotulos ? nome(c, c.B).split(' ')[0] + ' ' : '') + pct(1 - p)));
    d.append(barra, r); return d;
  }

  // ---------- abas (só na apuração ao vivo) ----------
  function trocaAba(a) {
    aba = a;
    try { const u = new URL(location.href); if (a === 'apuracao') u.searchParams.delete('aba'); else u.searchParams.set('aba', a); history.replaceState(null, '', u); } catch (e) { /* ignora */ }
    desenha();
    window.scrollTo({ top: Math.min(window.scrollY, abas.offsetTop - 8) });
    if (a === 'apuracao') requestAnimationFrame(() => { if (window.apuracao) window.apuracao.redimensiona(); if (window.governador) window.governador.redimensiona(); });
  }
  window.projecaoAba = (a) => { if (aba !== a) trocaAba(a); };
  function desenhaAbas(k) {
    const lista = ABAS.filter(([a]) => a !== 'apostas' || k === 'br');
    if (!lista.some(([a]) => a === aba)) aba = 'apuracao';
    abas.textContent = '';
    for (const [a, t] of lista) {
      const b = el('button', null, t); b.type = 'button'; b.setAttribute('role', 'tab'); b.id = 'aba-' + a;
      b.setAttribute('aria-selected', String(a === aba)); b.tabIndex = a === aba ? 0 : -1;
      if (a !== 'apuracao') b.setAttribute('aria-controls', a);
      b.onclick = () => trocaAba(a);
      b.onkeydown = (e) => {
        const i = lista.findIndex(([x]) => x === aba), n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (n) { e.preventDefault(); trocaAba(lista[(i + n + lista.length) % lista.length][0]); document.getElementById('aba-' + aba).focus(); }
      };
      abas.append(b);
    }
  }

  function desenha() {
    const k = corridaDoEndereco();
    abas.hidden = !k;
    if (!k) { for (const p of Object.values(PAINEIS)) p.hidden = true; delete document.body.dataset.aba; return; }
    if (k !== S.corrida) { S.corrida = k; S.idx = null; S.sim = null; AB.t = 0; baixaAbstencao(k).then(desenha); }
    desenhaAbas(k);
    if (aba === 'apuracao') delete document.body.dataset.aba; else document.body.dataset.aba = aba;
    for (const [a, p] of Object.entries(PAINEIS)) { p.hidden = a !== aba; if (a === aba) p.setAttribute('aria-labelledby', 'aba-' + a); }
    if (aba === 'apuracao') return;
    caixa = PAINEIS[aba];
    // não redesenha enquanto a pessoa arrasta um controle do simulador
    caixa.textContent = '';
    const c = S.atual && S.atual.corridas && S.atual.corridas[k];
    if (aba === 'apostas') { if (c) apostas(c); else caixa.append(el('p', 'nota', 'Carregando…')); return; }
    if (aba === 'abstencao') { abstencao(k); return; }
    const cab = el('div', 'proj-cab');
    cab.append(el('h2', null, k === 'br' ? 'Projeção · Presidente' : 'Projeção · Governador ' + k.toUpperCase()));
    caixa.append(cab);
    caixa.append(el('p', 'proj-aviso', 'Projeção estatística, não é resultado oficial. O resultado oficial é o do TSE, na aba Apuração.'));
    if (!c) {
      caixa.append(el('p', 'nota', S.erro ? 'Não foi possível ler as projeções agora. Tentando de novo em instantes.' : S.atual ? 'Sem dados para esta disputa ainda.' : 'Carregando projeções…'));
      return;
    }
    const modelos = ORDEM.filter((m) => c.m[m]);
    if (!modelos.includes(S.modelo)) S.modelo = modelos[0];
    const antes = !(c.a_tse + c.b_tse) && S.idx == null;
    // premissa
    const nav = el('div', 'proj-modelos'); nav.setAttribute('role', 'group'); nav.setAttribute('aria-label', 'Premissa da projeção');
    for (const m of modelos) {
      const b = el('button', null, S.atual.modelos[m]); b.type = 'button';
      b.setAttribute('aria-pressed', String(m === S.modelo));
      b.onclick = () => { S.modelo = m; try { localStorage.setItem('proj-modelo', m); } catch (e) { /* ignora */ } desenha(); };
      nav.append(b);
    }
    caixa.append(nav, el('p', 'proj-explica', EXPLICA[S.modelo]));

    // ponto no tempo: atual ou o escolhido na linha do tempo
    const pts = S.serie.filter((p) => p.c[k]);
    const passado = S.idx != null && S.idx < pts.length - 1;
    const ponto = passado ? pts[S.idx].c[k] : null;
    const A = c.A, B = c.B;
    const a = passado ? ponto.a : c.a_tse, b = passado ? ponto.b : c.b_tse;
    const st = passado ? ponto.st : c.st, ts = passado ? ponto.ts : c.ts;
    const mm = passado ? (() => { const x = ponto.m[S.modelo]; return x && { p: x[0], lo: x[1], hi: x[2], ch: x[3] }; })() : c.m[S.modelo];
    if (!mm) { caixa.append(el('p', 'nota', 'Esta premissa não existia neste momento.')); linhaTempo(pts, k); return; }

    if (antes) {
      const ref = el('div', 'proj-ref');
      ref.append(el('b', null, 'Cenário de referência, antes da apuração'),
        el('p', null, k === 'br' && ['sec', 't1', 't22'].includes(S.modelo)
          ? `A apuração ainda não começou, então isto não é projeção: é o ${S.modelo === 't22' ? '2º turno de 2022' : '1º turno de 2026'} repetido entre os dois finalistas, sem nenhum ajuste. Vira projeção na divulgação do TSE, após o fechamento das urnas (19h de Brasília).`
          : 'A apuração ainda não começou, então isto não é projeção: sem votos apurados esta premissa não tem informação e fica no meio a meio. Vira projeção na divulgação do TSE, após o fechamento das urnas (19h de Brasília).'));
      caixa.append(ref);
    } else {
      const quando = el('p', 'proj-quando');
      quando.textContent = passado ? `Vendo como estava às ${hora(pts[S.idx].t)} · ` : `Atualizado às ${hora(S.atual.gerado)} · `;
      quando.append(`${pct(ts ? st / ts : 0, 2)} das seções apuradas`);
      if (passado) { const v = el('button', 'proj-volta', 'Voltar ao vivo'); v.type = 'button'; v.onclick = () => { S.idx = null; desenha(); }; quando.append(' ', v); }
      caixa.append(quando);
    }

    // placar projetado
    const pl = el('div', 'proj-placar' + (antes ? ' ref' : ''));
    [[A, mm.p, mm.lo, mm.hi, mm.ch, a], [B, 1 - mm.p, 1 - mm.hi, 1 - mm.lo, 1 - mm.ch, b]].forEach(([n, p, lo, hi, ch, ap], i) => {
      const d = el('div', 'proj-cand'); d.style.setProperty('--c', cor(n, i));
      d.append(el('span', 'nm', nome(c, n)), el('span', 'pc', pct(p)), el('span', 'fx', `faixa de 95%: ${pct(lo)} a ${pct(hi)}`),
        el('span', 'ch', `${antes ? 'chance neste cenário' : 'chance de vitória'}: ${pct(ch, 0)}`));
      if (!antes) d.append(el('span', 'ap', `apurado agora: ${a + b ? pct(ap / (a + b), 2) : '—'}`));
      pl.append(d);
    });
    caixa.append(pl);
    const barra = el('div', 'proj-barra');
    const fa = el('i'); fa.style.width = mm.p * 100 + '%'; fa.style.background = cor(A, 0);
    const fb = el('i'); fb.style.width = (1 - mm.p) * 100 + '%'; fb.style.background = cor(B, 1);
    const faixa = el('span', 'faixa'); faixa.style.left = mm.lo * 100 + '%'; faixa.style.width = Math.max(0.3, (mm.hi - mm.lo) * 100) + '%';
    barra.append(fa, fb, faixa, el('span', 'meio'));
    caixa.append(barra);
    const marg = (mm.hi - mm.lo) / 2;
    caixa.append(el('p', 'proj-conf', `Margem: ±${(marg * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pontos (95% de confiança). ` +
      (marg < 0.005 ? 'Confiança muito alta.' : marg < 0.015 ? 'Confiança alta.' : marg < 0.04 ? 'Confiança moderada.' : 'Confiança baixa: ainda falta muito voto.')));

    if (!passado && !antes) virar(c, mm);
    linhaTempo(pts, k);
    if (!passado) { simulador(c, mm, antes); comparativo(c, modelos); if (!antes) onde(c, mm, k); }
  }

  function virar(c, mm) {
    const R = mm.R, lider = c.a_tse >= c.b_tse ? c.A : c.B, atras = lider === c.A ? c.B : c.A;
    const dif = Math.abs(c.a_tse - c.b_tse);
    const p = el('p', 'proj-virar');
    if (!c.a_tse && !c.b_tse) { p.textContent = 'A apuração ainda não começou. Até lá, a projeção usa só a premissa escolhida, com margem larga.'; caixa.append(p); return; }
    if (R <= 0) { p.textContent = 'Não falta voto a apurar.'; caixa.append(p); return; }
    const precisa = (R + dif) / (2 * R);
    p.append(el('b', null, nome(c, atras)), ` está ${nf.format(dif)} votos atrás. Faltam cerca de ${mi(R)} votos válidos; para virar, precisa de ${pct(precisa)} deles. `);
    p.append(precisa > 1 ? 'Matematicamente impossível com o que falta.' : precisa > 0.65 ? 'Muito difícil.' : precisa > 0.55 ? 'Difícil, mas possível.' : 'Totalmente possível.');
    caixa.append(p);
  }

  // ---------- simulador: o usuário escolhe quanto do que falta vai para cada um ----------
  function simulador(c, mm, antes) {
    const R = mm.R, V = mm.va + mm.vb;
    const box = el('div', 'proj-sim');
    box.append(el('h3', null, antes ? 'Simule o resultado' : 'Simule o que falta'));
    if (R <= 0) { box.append(el('p', 'nota', 'Não falta voto a apurar.')); caixa.append(box); return; }
    const pRem = (mm.va - c.a_tse) / R;            // fatia de A no que falta, segundo a premissa
    const sRem = Math.max(0.005, (mm.sg || (mm.hi - mm.lo) / 3.92) * V / R); // incerteza dessa fatia
    if (S.sim == null) S.sim = { p: Math.round(pRem * 1000) / 10, c: 100 };
    const linha = (rot, min, max, passo, val, fmt, fn) => {
      const l = el('label', 'proj-ctl'); const t = el('span', 'rot', rot); const v = el('b', null, fmt(val));
      const i = el('input'); i.type = 'range'; i.min = min; i.max = max; i.step = passo; i.value = val;
      i.oninput = () => { v.textContent = fmt(+i.value); fn(+i.value); conta(); };
      l.append(t, i, v); return l;
    };
    const res = el('div', 'proj-sim-res');
    box.append(
      linha(`Fatia de ${nome(c, c.A)} nos votos que faltam`, 0, 100, 0.5, S.sim.p, (x) => `${x.toLocaleString('pt-BR')}% · ${nome(c, c.B)} ${(100 - x).toLocaleString('pt-BR')}%`, (x) => { S.sim.p = x; }),
      linha('Comparecimento no que falta, comparado à premissa', 70, 130, 1, S.sim.c, (x) => `${x}%`, (x) => { S.sim.c = x; }),
    );
    const bt = el('button', 'proj-volta', 'Voltar para a premissa'); bt.type = 'button';
    bt.onclick = () => { S.sim = null; desenha(); };
    box.append(bt, res);
    function conta() {
      const f = S.sim.p / 100, r = R * S.sim.c / 100;
      const fa = c.a_tse + r * f, fb = c.b_tse + r * (1 - f), tot = fa + fb;
      const vence = fa >= fb ? c.A : c.B;
      // chance de o que falta dar pelo menos (ou no máximo) essa fatia, pela premissa escolhida
      const z = (f - pRem) / sRem;
      const prob = f >= pRem ? 1 - phi(z) : phi(z);
      const precisa = (r + Math.abs(c.a_tse - c.b_tse)) / (2 * r);
      res.textContent = '';
      res.append(el('p', 'grande', `Neste cenário: ${nome(c, c.A)} ${pct(fa / tot, 2)} × ${pct(fb / tot, 2)} ${nome(c, c.B)}` + (antes ? '' : ` · ${nome(c, vence)} teria ${nf.format(Math.round(Math.abs(fa - fb)))} votos a mais`)));
      const txt = [];
      txt.push((antes ? 'A apuração ainda não começou. ' : `Nos votos já apurados, ${nome(c, c.A)} tem ${pct(c.a_tse / (c.a_tse + c.b_tse || 1))}. `) + `Pela premissa "${S.atual.modelos[S.modelo]}", o que falta deve dar ${pct(pRem)} a ${nome(c, c.A)} (entre ${pct(Math.max(0, pRem - 1.96 * sRem))} e ${pct(Math.min(1, pRem + 1.96 * sRem))}).`);
      if (Math.abs(f - pRem) < 0.0025) txt.push('Este cenário é o próprio centro da projeção.');
      else txt.push(`Um resultado ${f > pRem ? 'igual ou melhor' : 'igual ou pior'} que ${pct(f)} para ${nome(c, c.A)} no que falta tem chance de ${prob < 0.001 ? 'menos de 0,1%' : pct(prob, prob < 0.1 ? 1 : 0)}.`);
      const atras = c.a_tse >= c.b_tse ? c.B : c.A;
      if (antes) { /* sem votos apurados não há quem esteja atrás */ }
      else if (precisa > 1) txt.push(`Com esse comparecimento, nem 100% do que falta faria ${nome(c, atras)} virar.`);
      else txt.push(`Para ${nome(c, atras)} virar, precisaria de ${pct(precisa)} do que falta${precisa > 0.6 ? ', muito acima do que vem fazendo' : ''}.`);
      txt.push(prob < 0.01 ? 'Cenário praticamente impossível pela premissa.' : prob < 0.1 ? 'Cenário improvável.' : prob < 0.3 ? 'Cenário possível, mas menos provável que o centro.' : 'Cenário plausível.');
      res.append(el('p', null, txt.join(' ')));
    }
    conta();
    caixa.append(box);
  }

  function comparativo(c, modelos) {
    const box = el('div', 'proj-comp');
    box.append(el('h3', null, 'Todas as premissas'));
    const t = el('table'); const h = el('tr');
    for (const x of ['Premissa', `${nome(c, c.A).split(' ')[0]} × ${nome(c, c.B).split(' ')[0]}`, 'Chance']) h.append(el('th', null, x));
    const tb = el('tbody');
    for (const m of modelos) {
      const x = c.m[m], r = el('tr');
      if (m === S.modelo) r.className = 'sel';
      const v = el('td', 'div-cel'); v.append(divide(c, x.p, false), el('small', null, `margem de ±${((x.hi - x.lo) * 50).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pts`));
      const lider = x.ch >= 0.5 ? c.A : c.B;
      r.append(el('td', null, S.atual.modelos[m]), v, el('td', 'n', `${nome(c, lider).split(' ')[0]} ${pct(x.ch >= 0.5 ? x.ch : 1 - x.ch, 0)}`));
      r.onclick = () => { S.modelo = m; desenha(); };
      tb.append(r);
    }
    const th = el('thead'); th.append(h); t.append(th, tb);
    const w = el('div', 'tbl'); w.append(t); box.append(w);
    caixa.append(box);
  }

  function onde(c, mm, k) {
    if (!mm.onde || !mm.onde.length) return;
    if (k !== 'br' && !S.munNome) { fetch('data/busca.json').then((r) => r.json()).then((d) => { S.munNome = new Map(d.m.map((x) => [x[0], x[1]])); desenha(); }).catch(() => {}); }
    const box = el('details', 'proj-onde');
    const top = mm.onde.slice(0, 3).map(([g]) => (k === 'br' ? (g === 'ZZ' ? 'Exterior' : g) : (S.munNome && S.munNome.get(g)) || g)).join(', ');
    const sm = el('summary'); sm.append(el('b', null, 'Onde estão os votos que faltam'), el('span', 'nota', ` · mais em ${top}`));
    box.append(sm);
    const t = el('table'); const h = el('tr');
    for (const x of [k === 'br' ? 'Estado' : 'Município', 'Válidos que faltam', `${nome(c, c.A).split(' ')[0]} × ${nome(c, c.B).split(' ')[0]} no que falta`]) h.append(el('th', null, x));
    const tb = el('tbody');
    for (const [g, r, p] of mm.onde.slice(0, 10)) {
      const tr = el('tr');
      const nm = k === 'br' ? (g === 'ZZ' ? 'Exterior' : g) : (S.munNome && S.munNome.get(g)) || g;
      const td = el('td', 'div-cel'); td.append(divide(c, p, false));
      tr.append(el('td', null, nm), el('td', 'n', mi(r)), td);
      tb.append(tr);
    }
    const th = el('thead'); th.append(h); t.append(th, tb);
    const w = el('div', 'tbl'); w.append(t); box.append(w);
    caixa.append(box);
  }

  // ---------- linha do tempo ----------
  function linhaTempo(pts, k) {
    const box = el('div', 'proj-tempo');
    box.append(el('h3', null, 'Linha do tempo'));
    const comVoto = pts.filter((p) => p.c[k].a + p.c[k].b > 0);
    if (comVoto.length < 2) {
      box.append(el('p', 'nota', 'A linha do tempo aparece quando o TSE fizer as primeiras divulgações. Cada divulgação vira um ponto, gravado pelo coletor desde as 15h (Brasília) de hoje.'));
      caixa.append(box); return;
    }
    // largura real do painel: no celular o texto do gráfico continua legível
    const W = Math.max(300, Math.min(900, caixa.clientWidth - 32 || 640)), H = W < 500 ? 180 : 220, ml = 40, mr = 10, mt = 10, mb = 24;
    const xs = (i) => ml + (W - ml - mr) * (i / (comVoto.length - 1));
    const vals = [];
    for (const p of comVoto) { const c = p.c[k]; vals.push(c.a / (c.a + c.b)); const m = c.m[S.modelo]; if (m) vals.push(m[1], m[2]); }
    let y0 = Math.min(...vals, 0.5) - 0.01, y1 = Math.max(...vals, 0.5) + 0.01;
    const ys = (v) => mt + (H - mt - mb) * (1 - (v - y0) / (y1 - y0));
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'proj-graf');
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Evolução da apuração e da projeção');
    const add = (tag, at) => { const e = document.createElementNS(ns, tag); for (const a in at) e.setAttribute(a, at[a]); svg.append(e); return e; };
    for (const v of [y0 + 0.01, 0.5, y1 - 0.01]) { add('line', { x1: ml, x2: W - mr, y1: ys(v), y2: ys(v), class: v === 0.5 ? 'meio' : 'grade' }); add('text', { x: ml - 4, y: ys(v) + 4, 'text-anchor': 'end', class: 'eixo' }).textContent = pct(v, 0); }
    const c0 = pts[pts.length - 1].c[k], A = c0.A;
    const banda = comVoto.map((p, i) => p.c[k].m[S.modelo] ? [xs(i), ys(p.c[k].m[S.modelo][2])] : null).filter(Boolean);
    const banda2 = comVoto.map((p, i) => p.c[k].m[S.modelo] ? [xs(i), ys(p.c[k].m[S.modelo][1])] : null).filter(Boolean).reverse();
    if (banda.length) add('polygon', { points: [...banda, ...banda2].map((q) => q.join(',')).join(' '), class: 'banda', fill: cor(A, 0) });
    const linha = (f, cls, extra = {}) => add('polyline', Object.assign({ points: comVoto.map((p, i) => { const v = f(p.c[k]); return v == null ? null : `${xs(i)},${ys(v)}`; }).filter(Boolean).join(' '), class: cls }, extra));
    linha((c) => c.a / (c.a + c.b), 'apurado');
    linha((c) => (c.m[S.modelo] ? c.m[S.modelo][0] : null), 'proj', { stroke: cor(A, 0) });
    add('text', { x: ml, y: H - 6, class: 'eixo' }).textContent = hora(comVoto[0].t);
    add('text', { x: W - mr, y: H - 6, 'text-anchor': 'end', class: 'eixo' }).textContent = hora(comVoto[comVoto.length - 1].t);
    const iSel = S.idx == null ? comVoto.length - 1 : Math.min(comVoto.length - 1, comVoto.indexOf(pts[S.idx]) < 0 ? comVoto.length - 1 : comVoto.indexOf(pts[S.idx]));
    add('line', { x1: xs(iSel), x2: xs(iSel), y1: mt, y2: H - mb, class: 'cursor' });
    box.append(svg);
    const leg = el('p', 'proj-leg');
    leg.append(el('span', 'l-proj', `Projeção de ${nome(S.atual.corridas[k] || c0, A)} (${S.atual.modelos[S.modelo]}) com faixa de 95%`), el('span', 'l-ap', 'Apurado até o momento'));
    box.append(leg);
    const r = el('input'); r.type = 'range'; r.min = 0; r.max = comVoto.length - 1; r.value = iSel; r.className = 'proj-slider';
    r.setAttribute('aria-label', 'Momento da apuração');
    r.oninput = () => { const i = +r.value; S.idx = i >= comVoto.length - 1 ? null : pts.indexOf(comVoto[i]); desenha(); const n = caixa.querySelector('.proj-slider'); if (n) n.focus(); };
    box.append(r, el('p', 'nota', 'Arraste para ver como a apuração e a projeção estavam em cada momento.'));
    caixa.append(box);
  }
  // ---------- abstenção: ao vivo (TSE) e perfil do 1º turno (perfil_comparecimento_abstencao) ----------
  const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PR', 'PB', 'PA', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SE', 'SP', 'TO', 'ZZ'];
  const AB = { vivo: {}, perfil: null, dim: 'idade', t: 0 };
  const DIMS = [['idade', 'Idade'], ['genero', 'Gênero'], ['escolaridade', 'Escolaridade'], ['cor', 'Cor ou raça'], ['civil', 'Estado civil'], ['voto', 'Voto obrigatório ou facultativo']];
  async function baixaAbstencao(k) {
    if (!AB.perfil) AB.perfil = fetch('data/abstencao_2026_1.json').then((r) => r.json()).catch(() => ({}));
    if (Date.now() - AB.t < 60000) return;
    AB.t = Date.now();
    const TSE = 'https://resultados.tse.jus.br/oficial/ele2026';
    const alvos = k === 'br' ? ['br', ...UFS.map((u) => u.toLowerCase())].map((u) => [u, `${TSE}/6258/dados/${u}/${u}-c0001-e006258-u.json`]) : [[k, `${TSE}/6260/dados/${k}/${k}-c0003-e006260-u.json`]];
    await Promise.all(alvos.map(([u, url]) => fetch(url).then((r) => r.json()).then((d) => { AB.vivo[u] = { est: +d.e.est || 0, a: +d.e.a || 0, te: +d.e.te || 0 }; }).catch(() => {})));
  }
  function taxa1(P, uf) { const g = P[uf] && P[uf].genero; if (!g) return null; let a = 0, b = 0; for (const r of g) { a += r[1]; b += r[2]; } return a ? b / a : null; }
  function abstencao(k) {
    const box = el('div', 'proj-abst');
    box.append(el('h2', null, k === 'br' ? 'Abstenção · Brasil' : 'Abstenção · ' + k.toUpperCase()));
    caixa.append(box);
    Promise.resolve(AB.perfil).then((P) => {
      if (!P) return;
      const uf = k === 'br' ? 'BR' : k.toUpperCase();
      const v = AB.vivo[k], t1 = taxa1(P, uf);
      const p = el('p');
      if (v && v.est) p.append(`Nas seções já apuradas do 2º turno, a abstenção está em `, el('b', null, pct(v.a / v.est)), `. No 1º turno foi de ${pct(t1)}` + (t1 != null ? ` (${v.a / v.est > t1 ? '+' : ''}${((v.a / v.est - t1) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ponto).` : '.'));
      else p.append(`A abstenção do 2º turno aparece quando as primeiras seções forem apuradas. No 1º turno foi de ${pct(t1)}${k === 'br' ? ' no Brasil' : ''}.`);
      box.append(p);
      if (k === 'br' && Object.values(AB.vivo).some((x) => x.est)) {
        const linhas = UFS.map((u) => { const x = AB.vivo[u.toLowerCase()], a1 = taxa1(P, u); return [u, x && x.est ? x.a / x.est : null, a1, x && x.te ? x.est / x.te : 0]; })
          .sort((a, b) => ((b[1] ?? -1) - (b[2] ?? 0)) - ((a[1] ?? -1) - (a[2] ?? 0)));
        const t = el('table'); const h = el('tr');
        for (const x of ['Estado', '2º turno (apurado)', '1º turno', 'Variação', 'Eleitorado apurado']) h.append(el('th', null, x));
        const tb = el('tbody');
        for (const [u, a2, a1, f] of linhas) {
          const tr = el('tr');
          tr.append(el('td', null, u === 'ZZ' ? 'Exterior' : u), el('td', 'n', pct(a2)), el('td', 'n', pct(a1)), el('td', 'n', a2 == null || a1 == null ? '—' : `${a2 > a1 ? '+' : ''}${((a2 - a1) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.`), el('td', 'n', pct(f, 0)));
          tb.append(tr);
        }
        const th = el('thead'); th.append(h); t.append(th, tb); const w = el('div', 'tbl'); w.append(t);
        const det = el('details', 'proj-onde'); const sm = el('summary'); sm.append(el('b', null, 'Abstenção por estado, 2º turno contra 1º turno'));
        det.append(sm, w); box.append(det);
      }
      // perfil
      const per = P[uf];
      if (!per) return;
      box.append(el('h3', null, `Quem se absteve no 1º turno${k === 'br' ? '' : ' em ' + uf}`), el('p', 'nota', 'O TSE só publica o perfil de quem faltou depois da eleição; para o 2º turno ainda não existe.'));
      const nav = el('div', 'proj-modelos');
      for (const [d, t] of DIMS) { const b = el('button', null, t); b.type = 'button'; b.setAttribute('aria-pressed', String(d === AB.dim)); b.onclick = () => { AB.dim = d; desenha(); }; nav.append(b); }
      box.append(nav);
      let rs = (per[AB.dim] || []).filter((r) => r[1] > 1000 && !/NÃO INFORMADO|Não informado|INVÁLID/i.test(r[0]));
      if (AB.dim === 'idade') {
        // faixas do TSE (uma por ano até 20) agrupadas em oito, mais fáceis de ler no celular
        const F = [[16, 17, '16 e 17 anos'], [18, 24, '18 a 24'], [25, 34, '25 a 34'], [35, 44, '35 a 44'], [45, 59, '45 a 59'], [60, 69, '60 a 69'], [70, 79, '70 a 79'], [80, 200, '80 ou mais']];
        rs = F.map(([a, b, rot]) => { let ap = 0, ab = 0; for (const r of rs) { const n = parseInt(r[0]); if (n >= a && n <= b) { ap += r[1]; ab += r[2]; } } return [rot, ap, ab]; }).filter((r) => r[1]);
      } else rs.sort((a, b) => b[2] / b[1] - a[2] / a[1]);
      const max = Math.max(...rs.map((r) => r[2] / r[1]), 0.01);
      const lista = el('div', 'abst-barras');
      for (const [lab, ap, ab] of rs) {
        const l = el('div', 'abst-l'); const bar = el('span', 'abst-b'); bar.style.width = (ab / ap / max) * 100 + '%';
        l.append(el('span', 'abst-r', AB.dim === 'idade' ? lab : titulo(lab)), (() => { const w = el('span', 'abst-w'); w.append(bar); return w; })(), el('span', 'abst-v', `${pct(ab / ap)} · ${mi(ab)}`));
        lista.append(l);
      }
      box.append(lista);
    });
  }

  // ---------- mercado de apostas (Polymarket, API pública) ----------
  const PM = { ev: null, hist: {}, int: '1m', t: 0 };
  const INTERVALOS = [['1d', '1 dia', 5], ['1w', '1 semana', 60], ['1m', '1 mês', 360], ['max', 'Tudo', 1440]];
  async function baixaApostas() {
    try {
      const d = await (await fetch('https://gamma-api.polymarket.com/events?slug=brazil-presidential-election')).json();
      const ms = d[0].markets.filter((m) => !m.closed && m.outcomePrices).map((m) => ({ q: m.question, p: +JSON.parse(m.outcomePrices)[0], tok: JSON.parse(m.clobTokenIds)[0] }))
        .filter((m) => m.p > 0.01).sort((a, b) => b.p - a.p);
      PM.ev = { ms, vol: +d[0].volume };
      const [, , fid] = INTERVALOS.find((x) => x[0] === PM.int);
      await Promise.all(ms.slice(0, 2).map(async (m) => {
        const h = await (await fetch(`https://clob.polymarket.com/prices-history?market=${encodeURIComponent(m.tok)}&interval=${PM.int}&fidelity=${fid}`)).json();
        PM.hist[m.tok + PM.int] = h.history || [];
      }));
      PM.t = Date.now();
    } catch (e) { /* mercado fora do ar: o bloco some */ }
    if (corridaDoEndereco() === 'br' && S.idx == null) desenha();
  }
  function quem(q) { const m = /Will (.+?) win/.exec(q); const n = m ? m[1] : q; return /Lula/.test(n) ? 'Lula' : /Fl[áa]vio/.test(n) ? 'Flávio Bolsonaro' : n; }
  function apostas(c) {
    if (!PM.ev) return;
    const box = el('div', 'proj-apostas');
    box.append(el('h2', null, 'Mercado de apostas · Presidente'));
    const ms = PM.ev.ms.slice(0, 2);
    const cores = (q) => (/Lula/.test(q) ? cor(13, 0) : /Fl[áa]vio/.test(q) ? cor(22, 1) : OUTRAS[0]);
    const lin = el('div', 'proj-placar');
    ms.forEach((m) => {
      const d = el('div', 'proj-cand'); d.style.setProperty('--c', cores(m.q));
      const nosso = (() => { const x = c.m[S.modelo]; if (!x) return null; const nA = titulo(c.nomes[c.A] || ''); const pn = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(' ')[0].toLowerCase(); return pn(quem(m.q)) === pn(nA) ? x.ch : 1 - x.ch; })();
      d.append(el('span', 'nm', quem(m.q)), el('span', 'pc', pct(m.p, 0)), el('span', 'fx', 'chance implícita no preço do contrato'),
        el('span', 'ap', nosso == null ? '' : `nesta projeção: ${pct(nosso, 0)}`));
      lin.append(d);
    });
    box.append(lin);
    const nav = el('div', 'proj-modelos');
    for (const [k, t] of INTERVALOS) { const b = el('button', null, t); b.type = 'button'; b.setAttribute('aria-pressed', String(k === PM.int)); b.onclick = () => { PM.int = k; baixaApostas(); }; nav.append(b); }
    box.append(nav);
    const series = ms.map((m) => [m, PM.hist[m.tok + PM.int] || []]).filter(([, h]) => h.length > 1);
    if (series.length) {
      const W = Math.max(300, Math.min(900, caixa.clientWidth - 32 || 640)), H = W < 500 ? 160 : 200, ml = 40, mr = 10, mt = 8, mb = 22, ns = 'http://www.w3.org/2000/svg';
      const t0 = Math.min(...series.map(([, h]) => h[0].t)), t1 = Math.max(...series.map(([, h]) => h[h.length - 1].t));
      const xs = (t) => ml + (W - ml - mr) * ((t - t0) / Math.max(1, t1 - t0)), ys = (v) => mt + (H - mt - mb) * (1 - v);
      const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'proj-graf');
      svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Evolução da chance implícita no mercado de apostas');
      const add = (tag, at) => { const e = document.createElementNS(ns, tag); for (const a in at) e.setAttribute(a, at[a]); svg.append(e); return e; };
      for (const v of [0, 0.5, 1]) { add('line', { x1: ml, x2: W - mr, y1: ys(v), y2: ys(v), class: v === 0.5 ? 'meio' : 'grade' }); add('text', { x: ml - 4, y: ys(v) + 4, 'text-anchor': 'end', class: 'eixo' }).textContent = pct(v, 0); }
      for (const [m, h] of series) add('polyline', { points: h.map((q) => `${xs(q.t)},${ys(q.p)}`).join(' '), class: 'proj', stroke: cores(m.q) });
      const dt = (t) => new Date(t * 1000).toLocaleString('pt-BR', PM.int === '1d' ? { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' } : { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
      add('text', { x: ml, y: H - 5, class: 'eixo' }).textContent = dt(t0);
      add('text', { x: W - mr, y: H - 5, 'text-anchor': 'end', class: 'eixo' }).textContent = dt(t1);
      box.append(svg);
    }
    box.append(el('p', 'nota', `Fonte: Polymarket, mercado "Brazil Presidential Election" (US$ ${mi(PM.ev.vol)} negociados), lido ao vivo. O preço de um contrato que paga US$ 1 se o candidato vencer é lido como chance implícita. É a aposta de quem negocia, não uma pesquisa nem um resultado. Casas de aposta brasileiras não publicam cotações de eleição, porque apostas em eleição não são autorizadas no Brasil.`));
    caixa.append(box);
  }

  // ---------- ciclo ----------
  let ultimoHash = location.hash;
  setInterval(() => { if (location.hash !== ultimoHash) { ultimoHash = location.hash; desenha(); } }, 500);
  baixa();
  setInterval(baixa, 90000);
  baixaApostas();
  setInterval(baixaApostas, 60000);
})();
