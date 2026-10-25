/* Página única: filtros de ano, turno e cargo decidem qual visão aparece.
   Presidente 2014-2026 usa a visão com mapa do mundo, zonas e locais (app.js; 2026 2º turno ao vivo).
   Governador 2026 2º turno usa a visão ao vivo por estado (governador.js). O resto usa a visão histórica (eleicoes.js).
   Endereço: #<ano>-<turno>/<cargo>[/<UF>[/<município>]] */
(() => {
  'use strict';

  const AO_VIVO = '2026-2';
  const CARGOS = { 1: 'Presidente', 3: 'Governador', 5: 'Senador', 6: 'Deputado federal', 7: 'Deputado estadual', 8: 'Deputado distrital', 11: 'Prefeito', 13: 'Vereador' };
  const ORDEM = [1, 3, 5, 6, 7, 8, 11, 13];
  const PRES = ['2026-2', '2026-1', '2022-2', '2022-1', '2018-2', '2018-1', '2014-2', '2014-1'];
  const VIVO = { 1: true, 3: true };
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  const S = { indice: null, el: AO_VIVO, cargo: 1, visao: null, iniciadas: {} };

  const cargosDe = (e) => (e === AO_VIVO ? [1, 3] : ORDEM.filter((c) => S.indice[e] && S.indice[e][c]));
  const visaoDe = (e, c) => (c === 1 && PRES.includes(e) ? 'pres' : c === 3 && e === AO_VIVO ? 'gov' : 'hist');
  const eleicoes = () => [...new Set([...Object.keys(S.indice), AO_VIVO])];

  function chips(id, itens, atual, fn) {
    const nav = $(id); nav.textContent = '';
    for (const [v, txt, vivo] of itens) {
      const b = el('button'); b.type = 'button';
      if (vivo) b.append(el('span', 'vivo'));
      b.append(txt);
      b.setAttribute('aria-pressed', String(v) === String(atual));
      b.onclick = () => fn(v);
      nav.append(b);
    }
  }
  function desenha() {
    const [ano, turno] = S.el.split('-');
    const anos = [...new Set(eleicoes().map((k) => k.split('-')[0]))].sort().reverse();
    chips('f-anos', anos.map((a) => [a, a]), ano, (a) => {
      const t = eleicoes().includes(`${a}-${turno}`) ? turno : '1';
      escolhe(`${a}-${t}`, S.cargo);
    });
    const turnos = ['1', '2'].filter((t) => eleicoes().includes(`${ano}-${t}`));
    chips('f-turnos', turnos.length > 1 ? turnos.map((t) => [t, `${t}º turno`, `${ano}-${t}` === AO_VIVO]) : [], turno, (t) => escolhe(`${ano}-${t}`, S.cargo));
    chips('f-cargos', cargosDe(S.el).map((c) => [c, CARGOS[c], S.el === AO_VIVO && VIVO[c]]), S.cargo, (c) => escolhe(S.el, +c));
    $('titulo-sel').textContent = `${CARGOS[S.cargo]} · ${ano} · ${turno}º turno${S.el === AO_VIVO ? ' · apuração ao vivo' : ''}`;
  }

  function mostra(v, extra = []) {
    for (const id of ['pres', 'gov', 'hist']) $('v-' + id).hidden = id !== v;
    S.visao = v;
    if (!S.iniciadas[v]) {
      S.iniciadas[v] = true;
      if (v === 'pres') window.iniciaPres(S.el);
      if (v === 'gov') window.iniciaGov(extra[0]);
      if (v === 'hist') window.iniciaHist(S.el, S.cargo, extra[0], extra[1]);
      return;
    }
    if (v === 'pres') window.apuracao.trocaEleicao(S.el);
    if (v === 'hist') window.historico.define(S.el, S.cargo);
    // mapa criado com a visão escondida precisa recalcular o tamanho
    requestAnimationFrame(() => {
      if (v === 'pres' && window.apuracao) window.apuracao.redimensiona();
      if (v === 'gov' && window.governador) window.governador.redimensiona();
      if (v === 'hist' && window.historico) window.historico.redimensiona();
    });
  }
  function escolhe(e, c, extra = []) {
    const cs = cargosDe(e);
    S.el = e; S.cargo = cs.includes(c) ? c : cs[0];
    desenha();
    try { history.replaceState(null, '', `#${S.el}/${S.cargo}` + (extra.length ? '/' + extra.filter(Boolean).join('/') : '')); } catch (err) { /* ignora */ }
    mostra(visaoDe(S.el, S.cargo), extra);
  }

  // busca do topo: estado e município ficam na visão histórica quando ela está aberta; o resto vai para o mapa do presidente
  window.buscaVai = (sel) => {
    if (S.visao === 'hist' && window.eleicoesVaiPara && window.eleicoesVaiPara(sel)) return;
    if (S.visao !== 'pres') escolhe(PRES.includes(S.el) ? S.el : AO_VIVO, 1);
    const t = setInterval(() => {
      if (!window.apuracao || !window.apuracao.pronto()) return;
      clearInterval(t);
      window.apuracao.vaiPara(sel);
    }, 200);
  };

  window.addEventListener('hashchange', () => location.reload());

  fetch('data/h/indice.json').then((r) => r.json()).then((ind) => {
    S.indice = ind;
    let [e, c, ...extra] = decodeURIComponent(location.hash.slice(1)).split('/');
    // endereço antigo da busca (#ir=...) e da página do governador (#UF)
    let ir = null;
    if (location.hash.startsWith('#ir=')) { try { ir = JSON.parse(decodeURIComponent(location.hash.slice(4))); } catch (err) { ir = null; } e = AO_VIVO; c = '1'; extra = []; }
    if (!eleicoes().includes(e)) { e = AO_VIVO; c = '1'; extra = []; }
    escolhe(e, +c || 1, extra);
    if (ir) window.buscaVai(ir);
  });
})();
