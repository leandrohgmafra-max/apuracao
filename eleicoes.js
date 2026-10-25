/* Eleições desde 1998, todos os cargos: Brasil → estado → município, com busca de candidato. Dados em data/h/ (ver collector/hist_todos.py). */
(() => {
  'use strict';

  const CARGOS = { 1: 'Presidente', 3: 'Governador', 5: 'Senador', 6: 'Deputado federal', 7: 'Deputado estadual', 8: 'Deputado distrital', 11: 'Prefeito', 13: 'Vereador' };
  const ORDEM = [1, 3, 5, 6, 7, 8, 11, 13];
  const PROP = new Set([6, 7, 8, 13]);
  const MUNIC = new Set([11, 13]);
  const UF_NOME = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PR: 'Paraná', PB: 'Paraíba', PA: 'Pará', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins', ZZ: 'Exterior' };
  // cores aproximadas das legendas; partido sem cor fixa recebe uma da paleta
  const COR_PARTIDO = { PT: '#c62828', PCdoB: '#8e1b1b', 'PC do B': '#8e1b1b', PSOL: '#f2a900', PSTU: '#a31515', PCO: '#7b1010', PDT: '#d4502a', PSB: '#f07c00', REDE: '#16a3a3', PV: '#3f9b3f', PSDB: '#1e7fd8', PL: '#1f3a93', PR: '#1f3a93', PSL: '#2a9d4b', 'UNIÃO': '#0d8a7a', DEM: '#2bb39b', PFL: '#2bb39b', MDB: '#2f7d32', PMDB: '#2f7d32', PP: '#5160c0', PPB: '#5160c0', PSD: '#ff8a50', REPUBLICANOS: '#3949ab', PRB: '#3949ab', PTB: '#6d4c41', NOVO: '#ef6c00', PODE: '#546e7a', PTN: '#546e7a', PSC: '#7cb342', SOLIDARIEDADE: '#e65100', CIDADANIA: '#d81b60', PPS: '#d81b60', AVANTE: '#00897b', PTdoB: '#00897b', PROS: '#ef8b00', PMN: '#8d6e63', PRTB: '#4e5d94', PATRIOTA: '#2e4a7d', PEN: '#2e4a7d', MISSÃO: '#5e35b1', AGIR: '#7e57c2', PTC: '#7e57c2', DC: '#689f38', PSDC: '#689f38', MOBILIZA: '#9e9d24', PMB: '#ad1457', UP: '#b71c1c', PRD: '#283593' };
  const PALETA = ['#00838f', '#6a1b9a', '#9e9d24', '#ad1457', '#5d4037', '#455a64', '#3949ab', '#d84315', '#2e7d32', '#e08a00'];
  const TEMA = document.documentElement.dataset.theme;
  const ESCURO = TEMA ? TEMA === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  const btTema = document.getElementById('tema');
  btTema.textContent = ESCURO ? '☀ Tema claro' : '☾ Tema escuro';
  btTema.addEventListener('click', () => {
    try { localStorage.setItem('tema', ESCURO ? 'light' : 'dark'); } catch (e) { /* sem storage: só nesta visita */ }
    location.reload();
  });

  const nf = new Intl.NumberFormat('pt-BR');
  const pct = (v, d = 2) => (v == null || !isFinite(v) ? '—' : (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%');
  const RAIZ = document.getElementById('v-hist');
  const $ = (id) => RAIZ.querySelector('#' + id);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const extra = {};
  const corPartido = (sg) => COR_PARTIDO[sg] || extra[sg] || (extra[sg] = PALETA[Object.keys(extra).length % PALETA.length]);
  const cache = {};
  const json = (p) => cache[p] || (cache[p] = fetch('data/' + p).then((r) => { if (!r.ok) throw new Error(p); return r.json(); }));

  const S = { indice: null, el: null, cargo: null, uf: null, mun: null, resumo: null, dados: null, aba: 'cand', busca: null, geoMun: {}, ufsGeo: null };

  // ---------- leitura dos resultados ----------
  // uma linha de resultado: {ap, cp, vv, bn, nl, votos:{n:v}, cands:{n:[nome,partido,sit]}, partidos:{sg:v}}
  function linhaMun(cod) {
    const m = S.dados && S.dados.m[cod];
    if (!m) return null;
    const cands = MUNIC.has(S.cargo) ? (m[6] || {}) : S.dados.c;
    let partidos = S.dados.p && S.dados.p.m[cod];
    if (!partidos) { partidos = {}; for (const n in m[5]) { const c = cands[n]; if (c) partidos[c[1]] = (partidos[c[1]] || 0) + m[5][n]; } }
    return { ap: m[0], cp: m[1], vv: m[2], bn: m[3], nl: m[4], votos: m[5], cands, partidos };
  }
  function linhaUf(uf) {
    if (S.dados && uf === S.uf && !MUNIC.has(S.cargo)) {
      const t = S.dados.t;
      let partidos = S.dados.p ? S.dados.p.t : null;
      if (!partidos) { partidos = {}; for (const n in t[5]) { const c = S.dados.c[n]; if (c) partidos[c[1]] = (partidos[c[1]] || 0) + t[5][n]; } }
      return { ap: t[0], cp: t[1], vv: t[2], bn: t[3], nl: t[4], votos: t[5], cands: S.dados.c, partidos };
    }
    const r = S.resumo && S.resumo[S.cargo] && S.resumo[S.cargo][uf];
    if (!r) return null;
    return { ap: r.t[0], cp: r.t[1], vv: r.t[2], bn: r.t[3], nl: r.t[4], votos: r.v || {}, cands: r.c || {}, partidos: r.p || {}, eleitos: r.e };
  }
  function linhaBrasil() {
    const R = S.resumo && S.resumo[S.cargo];
    if (!R) return null;
    const t = { ap: 0, cp: 0, vv: 0, bn: 0, nl: 0, votos: {}, cands: {}, partidos: {}, eleitos: {} };
    for (const uf in R) {
      const r = R[uf];
      t.ap += r.t[0]; t.cp += r.t[1]; t.vv += r.t[2]; t.bn += r.t[3]; t.nl += r.t[4];
      if (S.cargo === 1) for (const n in r.v || {}) { t.votos[n] = (t.votos[n] || 0) + r.v[n]; t.cands[n] = r.c[n]; }
      for (const sg in r.p || {}) t.partidos[sg] = (t.partidos[sg] || 0) + r.p[sg];
      for (const sg in r.e || {}) t.eleitos[sg] = (t.eleitos[sg] || 0) + r.e[sg];
    }
    return t;
  }
  const ordena = (o) => Object.entries(o || {}).map(([k, v]) => [k, v]).sort((a, b) => b[1] - a[1]);
  // líder de um local para colorir o mapa: candidato (majoritário) ou partido (proporcional)
  function lider(l) {
    if (!l || !l.vv) return null;
    if (PROP.has(S.cargo)) {
      const p = ordena(l.partidos);
      return p.length ? { cor: corPartido(p[0][0]), p: p[0][1] / l.vv, nome: p[0][0] } : null;
    }
    const v = ordena(l.votos);
    if (!v.length) return null;
    const c = l.cands[v[0][0]];
    return { cor: corPartido(c ? c[1] : '?'), p: v[0][1] / l.vv, nome: c ? `${c[0]} (${c[1]})` : 'Nº ' + v[0][0] };
  }

  // ---------- filtros ----------
  function chips(id, itens, atual, fn, rotulo) {
    const nav = $(id); nav.textContent = '';
    if (rotulo) nav.append(el('span', 'rot', rotulo));
    for (const [v, txt] of itens) {
      const b = el('button', null, txt); b.type = 'button';
      b.setAttribute('aria-pressed', String(v) === String(atual));
      b.onclick = () => fn(v);
      nav.append(b);
    }
  }
  function desenhaFiltros() {
    const anos = [...new Set(Object.keys(S.indice).map((k) => k.split('-')[0]))].sort().reverse();
    const [ano, turno] = S.el.split('-');
    chips('anos', anos.map((a) => [a, a]), ano, (a) => trocaEleicao(S.indice[a + '-' + turno] ? a + '-' + turno : a + '-1'), 'Ano');
    const turnos = ['1', '2'].filter((t) => S.indice[ano + '-' + t]);
    chips('turnos', turnos.length > 1 ? turnos.map((t) => [t, t + 'º turno']) : [], turno, (t) => trocaEleicao(ano + '-' + t), turnos.length > 1 ? 'Turno' : '');
    const cs = ORDEM.filter((c) => S.indice[S.el][c]);
    chips('cargos', cs.map((c) => [c, CARGOS[c]]), S.cargo, (c) => trocaCargo(+c), 'Cargo');
  }
  function crumbs() {
    const nav = $('crumbs'); nav.textContent = '';
    const passos = [['Brasil', () => irBrasil()]];
    if (S.uf) passos.push([UF_NOME[S.uf] || S.uf, () => irUf(S.uf)]);
    if (S.mun) { const g = (S.geoMun[S.uf] || { features: [] }).features.find((f) => f.properties.cod === S.mun); passos.push([g ? g.properties.nome : S.mun, null]); }
    passos.forEach(([t, fn], i) => {
      if (i) nav.append(el('span', null, '›'));
      const b = el('button', null, t); b.type = 'button';
      if (i === passos.length - 1) b.setAttribute('aria-current', 'page'); else b.onclick = fn;
      nav.append(b);
    });
  }

  // ---------- painel ----------
  // foto em data/fotos/<ano>/<cargo>/<UF>/[<mun>-]<numero>.jpg (só de 2004 em diante e só de parte dos candidatos)
  function foto(n) {
    if (+S.el.slice(0, 4) < 2004 || n == 95 || n == 96) return null;
    const uf = S.cargo === 1 ? 'BR' : S.uf;
    if (!uf || (MUNIC.has(S.cargo) && !S.mun)) return null;
    const i = el('img', 'foto'); i.alt = ''; i.loading = 'lazy'; i.decoding = 'async';
    i.src = `data/fotos/${S.el.slice(0, 4)}/${S.cargo}/${uf}/${MUNIC.has(S.cargo) ? S.mun + '-' : ''}${n}.jpg`;
    i.onerror = () => i.replaceWith(el('span'));
    return i;
  }
  function barras(lista, total, corDe, rotDe, max = 15, fotoDe = null) {
    const bs = el('div', 'barras');
    for (const [k, v] of lista.slice(0, max)) {
      const b = el('div', 'barra'), t = el('span', 't'), f = el('i');
      f.style.width = (total ? v / total * 100 : 0) + '%'; f.style.background = corDe(k); t.append(f);
      const nm = el('span', 'nm'); rotDe(k, nm);
      const ft = fotoDe && fotoDe(k);
      if (fotoDe) { b.classList.add('com-foto'); b.append(ft || el('span')); }
      b.append(nm, el('span', 'v', `${pct(total ? v / total : null)} · ${nf.format(v)}`), t);
      bs.append(b);
    }
    return bs;
  }
  function desenhaPainel() {
    const p = $('painel'); p.textContent = '';
    const nivel = S.mun ? 'mun' : S.uf ? 'uf' : 'br';
    const l = nivel === 'mun' ? linhaMun(S.mun) : nivel === 'uf' ? linhaUf(S.uf) : linhaBrasil();
    const nome = nivel === 'mun' ? ((S.geoMun[S.uf] || { features: [] }).features.find((f) => f.properties.cod === S.mun) || { properties: { nome: S.mun } }).properties.nome : nivel === 'uf' ? UF_NOME[S.uf] : 'Brasil';
    p.append(el('p', 'nivel', `${CARGOS[S.cargo]} · ${S.el.replace('-', ' · ')}º turno`), el('h3', null, nome));
    if (!l) { p.append(el('p', 'meta', nivel === 'br' ? 'Escolha um estado no mapa.' : 'Sem dados para este local nesta eleição.')); return; }
    // base de brancos e nulos = votos dados no cargo (no Senado com duas vagas, cada eleitor vota duas vezes)
    const dados = l.vv + l.bn + l.nl;
    p.append(el('p', 'meta', `${nf.format(l.vv)} votos válidos · ${nf.format(l.ap)} eleitores · abstenção ${pct(l.ap ? 1 - l.cp / l.ap : null, 1)} · brancos ${pct(dados ? l.bn / dados : null, 1)} · nulos ${pct(dados ? l.nl / dados : null, 1)}`));
    if ((nivel === 'br' && S.cargo !== 1) || (nivel === 'uf' && MUNIC.has(S.cargo))) {
      // visão agregada (Brasil, ou estado em eleição municipal): só partidos
      if (l.eleitos && Object.keys(l.eleitos).length) {
        p.append(el('h4', null, 'Eleitos por partido'));
        const tot = Object.values(l.eleitos).reduce((a, b) => a + b, 0);
        p.append(barrasContagem(ordena(l.eleitos), tot));
      }
      p.append(el('h4', null, 'Votos por partido'));
      p.append(barras(ordena(l.partidos), l.vv, corPartido, (k, nm) => { nm.textContent = k; }));
      return;
    }
    const temPartido = PROP.has(S.cargo) || nivel !== 'br';
    if (PROP.has(S.cargo)) {
      const ab = el('div', 'abas');
      for (const [k, t] of [['cand', 'Candidatos'], ['part', 'Partidos']]) {
        const b = el('button', null, t); b.type = 'button'; b.setAttribute('aria-pressed', S.aba === k);
        b.onclick = () => { S.aba = k; desenhaPainel(); }; ab.append(b);
      }
      p.append(ab);
    }
    if (S.aba === 'part' && temPartido && PROP.has(S.cargo)) {
      p.append(barras(ordena(l.partidos), l.vv, corPartido, (k, nm) => { nm.textContent = k; }, 30));
      return;
    }
    p.append(barras(ordena(l.votos), l.vv, (n) => corPartido((l.cands[n] || [])[1]), (n, nm) => {
      const c = l.cands[n];
      if (c && c[2] === 'E') nm.append(el('span', 'tag', 'eleito'));
      if (c && c[2] === '2') nm.append(el('span', 'tag', '2º turno'));
      nm.append(c ? `${c[0]} (${c[1]})` : 'Nº ' + n);
    }, PROP.has(S.cargo) ? 30 : 15, foto));
  }
  function barrasContagem(lista, tot) {
    const bs = el('div', 'barras');
    for (const [k, v] of lista.slice(0, 20)) {
      const b = el('div', 'barra'), t = el('span', 't'), f = el('i');
      f.style.width = (v / tot * 100) + '%'; f.style.background = corPartido(k); t.append(f);
      b.append(el('span', 'nm', k), el('span', 'v', nf.format(v)), t);
      bs.append(b);
    }
    return bs;
  }

  // ---------- tabela ----------
  function desenhaTabela() {
    const th = $('tab').tHead, tb = $('tab').tBodies[0]; th.textContent = ''; tb.textContent = '';
    const cab = (cols) => { const tr = el('tr'); cols.forEach(([t, n]) => tr.append(el('th', n ? 'n' : null, t))); th.append(tr); };
    const linha = (cells, fn) => { const tr = el('tr', fn ? 'click' : null); cells.forEach(([t, n, cor]) => { const td = el('td', n ? 'n' : null); if (cor) { const s = el('span', 'sw'); s.style.background = cor; td.append(s); } td.append(t); tr.append(td); }); if (fn) tr.onclick = fn; tb.append(tr); };
    if (S.busca) {
      $('tab-titulo').textContent = `Onde ${S.busca.nome} teve mais votos`;
      cab([['Município'], ['Votos', 1], ['% dos válidos', 1]]);
      const g = S.geoMun[S.uf] || { features: [] };
      const nome = (cod) => (g.features.find((f) => f.properties.cod === cod) || { properties: { nome: cod } }).properties.nome;
      Object.entries(S.dados.m).map(([cod, m]) => [cod, m[5][S.busca.n] || 0, m[2]]).filter((x) => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 300)
        .forEach(([cod, v, vv]) => linha([[nome(cod)], [nf.format(v), 1], [pct(vv ? v / vv : null), 1]], () => irMun(cod)));
      return;
    }
    if (!S.uf) {
      $('tab-titulo').textContent = 'Por estado';
      cab([['Estado'], ['Mais votado'], ['%', 1], ['Válidos', 1]]);
      for (const uf of Object.keys(S.resumo[S.cargo] || {}).sort((a, b) => (UF_NOME[a] || a).localeCompare(UF_NOME[b] || b))) {
        const l = linhaUf(uf), L = lider(l);
        linha([[UF_NOME[uf] || uf], [L ? L.nome : '—', 0, L && L.cor], [L ? pct(L.p, 1) : '—', 1], [l ? nf.format(l.vv) : '—', 1]], uf === 'ZZ' ? null : () => irUf(uf));
      }
      return;
    }
    $('tab-titulo').textContent = `Por município · ${UF_NOME[S.uf] || S.uf}`;
    cab([['Município'], [PROP.has(S.cargo) ? 'Partido mais votado' : 'Mais votado'], ['%', 1], ['Válidos', 1]]);
    const g = S.geoMun[S.uf] || { features: [] };
    const nome = (cod) => (g.features.find((f) => f.properties.cod === cod) || { properties: { nome: cod } }).properties.nome;
    Object.keys(S.dados ? S.dados.m : {}).map((cod) => [cod, linhaMun(cod)]).sort((a, b) => b[1].ap - a[1].ap)
      .forEach(([cod, l]) => { const L = lider(l); linha([[nome(cod)], [L ? L.nome : '—', 0, L && L.cor], [L ? pct(L.p, 1) : '—', 1], [nf.format(l.vv), 1]], () => irMun(cod)); });
  }

  // ---------- mapa ----------
  let mapa = null;
  const vazio = { type: 'FeatureCollection', features: [] };
  function bbox(fc) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const vai = (c) => { if (typeof c[0] === 'number') { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); } else c.forEach(vai); };
    (fc.features || [fc]).forEach((f) => f.geometry && vai(f.geometry.coordinates));
    return [[x0, y0], [x1, y1]];
  }
  const opac = (p) => Math.max(0.18, Math.min(0.9, 0.2 + (p - 0.3) * 1.1));
  function iniciaMapa() {
    mapa = new maplibregl.Map({ container: $('mapa'), style: ESCURO ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/positron', center: [-53, -14], zoom: 3.2, minZoom: 2, dragRotate: false, attributionControl: { compact: true } });
    mapa.touchZoomRotate.disableRotation();
    mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    return new Promise((ok) => mapa.on('load', async () => {
      S.ufsGeo = await json('geo/ufs.json');
      const linha = ESCURO ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.9)';
      mapa.addSource('ufs', { type: 'geojson', data: S.ufsGeo });
      mapa.addSource('mun', { type: 'geojson', data: vazio });
      mapa.addSource('sel', { type: 'geojson', data: vazio });
      mapa.addLayer({ id: 'ufs-fill', type: 'fill', source: 'ufs', paint: { 'fill-color': ['coalesce', ['get', 'cor'], 'rgba(0,0,0,0)'], 'fill-opacity': ['coalesce', ['get', 'op'], 0] } });
      mapa.addLayer({ id: 'ufs-line', type: 'line', source: 'ufs', paint: { 'line-color': linha, 'line-width': 1 } });
      mapa.addLayer({ id: 'mun-fill', type: 'fill', source: 'mun', paint: { 'fill-color': ['coalesce', ['get', 'cor'], 'rgba(0,0,0,0)'], 'fill-opacity': ['coalesce', ['get', 'op'], 0] } });
      mapa.addLayer({ id: 'mun-line', type: 'line', source: 'mun', paint: { 'line-color': linha, 'line-width': 0.5 } });
      mapa.addLayer({ id: 'sel-line', type: 'line', source: 'sel', paint: { 'line-color': ESCURO ? '#fff' : '#111', 'line-width': 2.5 } });
      const pop = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
      const passa = (camada, rot) => {
        mapa.on('mousemove', camada, (e) => {
          const f = e.features[0]; mapa.getCanvas().style.cursor = 'pointer';
          pop.setLngLat(e.lngLat).setHTML('<div class="pop-h"></div><b></b>').addTo(mapa);
          const [a, b] = rot(f); pop.getElement().querySelector('.pop-h').textContent = a; pop.getElement().querySelector('b').textContent = b;
        });
        mapa.on('mouseleave', camada, () => { mapa.getCanvas().style.cursor = ''; pop.remove(); });
      };
      passa('ufs-fill', (f) => { const L = lider(linhaUf(f.properties.uf)); return [UF_NOME[f.properties.uf], L ? `${L.nome} ${pct(L.p, 1)}` : 'sem dados']; });
      passa('mun-fill', (f) => {
        const l = linhaMun(f.properties.cod);
        if (S.busca) { const v = l ? l.votos[S.busca.n] || 0 : 0; return [f.properties.nome, `${S.busca.nome}: ${nf.format(v)} (${pct(l && l.vv ? v / l.vv : null, 1)})`]; }
        const L = lider(l); return [f.properties.nome, L ? `${L.nome} ${pct(L.p, 1)}` : 'sem dados'];
      });
      mapa.on('click', (e) => {
        const fs = mapa.queryRenderedFeatures(e.point, { layers: ['mun-fill', 'ufs-fill'] });
        const m = fs.find((f) => f.layer.id === 'mun-fill' && f.properties.uf === S.uf);
        if (m) return irMun(m.properties.cod);
        const u = fs.find((f) => f.layer.id === 'ufs-fill');
        if (u && S.indice[S.el][S.cargo].includes(u.properties.uf)) irUf(u.properties.uf);
      });
      ok();
    }));
  }
  function pintaUfs() {
    for (const f of S.ufsGeo.features) {
      const L = S.uf ? null : lider(linhaUf(f.properties.uf));
      f.properties.cor = L ? L.cor : null; f.properties.op = L ? opac(L.p) : 0;
    }
    mapa.getSource('ufs').setData(S.ufsGeo);
  }
  function pintaMun() {
    const g = S.uf && S.geoMun[S.uf];
    if (!g) { mapa.getSource('mun').setData(vazio); return; }
    let max = 0;
    if (S.busca) for (const cod in S.dados.m) { const m = S.dados.m[cod]; if (m[2]) max = Math.max(max, (m[5][S.busca.n] || 0) / m[2]); }
    for (const f of g.features) {
      const l = linhaMun(f.properties.cod);
      if (S.busca) {
        const s = l && l.vv ? (l.votos[S.busca.n] || 0) / l.vv : 0;
        f.properties.cor = corPartido(S.busca.partido); f.properties.op = s && max ? 0.06 + 0.84 * (s / max) : 0;
      } else {
        const L = lider(l); f.properties.cor = L ? L.cor : null; f.properties.op = L ? opac(L.p) : 0;
      }
    }
    mapa.getSource('mun').setData(g);
  }
  function destaca() {
    let f = [];
    if (S.mun && S.geoMun[S.uf]) f = S.geoMun[S.uf].features.filter((x) => x.properties.cod === S.mun);
    else if (S.uf && S.ufsGeo) f = S.ufsGeo.features.filter((x) => x.properties.uf === S.uf);
    mapa.getSource('sel').setData({ type: 'FeatureCollection', features: f });
  }
  function legenda() {
    const lg = $('legenda'); lg.textContent = '';
    if (S.busca) { lg.append(el('span', null, `Tom mais forte = maior fatia dos votos de ${S.busca.nome}`)); return; }
    const l = S.mun ? linhaMun(S.mun) : S.uf ? linhaUf(S.uf) : linhaBrasil();
    const itens = PROP.has(S.cargo) || (!S.uf && S.cargo !== 1) ? ordena(l && l.partidos).slice(0, 8).map(([k]) => [corPartido(k), k])
      : ordena(l && l.votos).slice(0, 6).map(([n]) => { const c = l.cands[n] || ['Nº ' + n, '?']; return [corPartido(c[1]), `${c[0]} (${c[1]})`]; });
    itens.forEach(([cor, t]) => { const s = el('span'); const i = el('i'); i.style.background = cor; s.append(i, t); lg.append(s); });
    lg.append(el('span', null, 'Tom mais forte = vitória mais folgada'));
  }

  // ---------- busca de candidato ----------
  function preparaBusca() {
    const box = $('busca'), dl = $('busca-lista'), inp = $('busca-in');
    const pode = S.uf && S.dados && S.cargo !== 1 || (S.uf && S.cargo === 1);
    box.hidden = !pode; dl.textContent = ''; inp.value = S.busca ? S.busca.rot : '';
    $('busca-limpa').hidden = !S.busca;
    if (!pode) return;
    const lista = [];
    if (MUNIC.has(S.cargo)) {
      const alvo = S.mun ? { [S.mun]: S.dados.m[S.mun] } : {};
      for (const cod in alvo) { const m = alvo[cod]; if (m) for (const n in m[6] || {}) lista.push([n, m[6][n]]); }
    } else for (const n in S.dados.c) if (S.dados.t[5][n]) lista.push([n, S.dados.c[n]]);
    inp.placeholder = MUNIC.has(S.cargo) && !S.mun ? 'Escolha um município para buscar candidatos' : 'Ver no mapa onde um candidato teve votos';
    lista.sort((a, b) => a[1][0].localeCompare(b[1][0]));
    S.opcoes = new Map();
    for (const [n, c] of lista) { const rot = `${c[0]} (${c[1]}, ${n})`; S.opcoes.set(rot, { n, nome: c[0], partido: c[1], rot }); const o = el('option'); o.value = rot; dl.append(o); }
  }
  $('busca-in').addEventListener('change', (e) => {
    const o = S.opcoes && S.opcoes.get(e.target.value);
    if (!o) return;
    S.busca = o; S.mun = MUNIC.has(S.cargo) ? S.mun : null; atualiza();
  });
  $('busca-limpa').addEventListener('click', () => { S.busca = null; atualiza(); });

  // ---------- navegação ----------
  function atualiza() {
    crumbs(); desenhaPainel(); desenhaTabela(); legenda(); preparaBusca(); pintaUfs(); pintaMun(); destaca();
    $('dica').textContent = !S.uf ? 'Clique num estado' : 'Clique num município';
    const h = [S.el, S.cargo, S.uf || '', S.mun || ''].join('/').replace(/\/+$/, '');
    try { history.replaceState(null, '', '#' + h); } catch (e) { /* ignora */ }
  }
  async function trocaEleicao(el) {
    S.el = el;
    const cs = S.indice[el];
    if (!cs[S.cargo]) S.cargo = ORDEM.find((c) => cs[c]);
    S.resumo = await json(`h/${el}/resumo.json`);
    desenhaFiltros();
    if (S.uf && cs[S.cargo].includes(S.uf)) return irUf(S.uf, S.mun, true);
    irBrasil();
  }
  function trocaCargo(c) {
    S.cargo = c; S.busca = null; desenhaFiltros();
    if (S.uf && S.indice[S.el][c].includes(S.uf)) return irUf(S.uf, S.mun, true);
    irBrasil();
  }
  function irBrasil() {
    S.uf = null; S.mun = null; S.dados = null; S.busca = null;
    atualiza();
    mapa.fitBounds([[-74, -34], [-34, 5.5]], { padding: 20, duration: 600 });
  }
  async function irUf(uf, mun = null, manterVista = false) {
    const el0 = S.el, c0 = S.cargo;
    S.uf = uf; S.mun = mun; if (!manterVista) S.busca = null;
    const [d, g] = await Promise.all([json(`h/${S.el}/${S.cargo}/${uf}.json`), uf === 'ZZ' ? null : (S.geoMun[uf] ? S.geoMun[uf] : json(`geo/mun/${uf}.json`))]);
    if (el0 !== S.el || c0 !== S.cargo || uf !== S.uf) return;
    S.dados = d; if (g) S.geoMun[uf] = g;
    if (S.busca && !(MUNIC.has(S.cargo) ? (S.dados.m[S.mun] || [])[6] || {} : S.dados.c)[S.busca.n]) S.busca = null;
    atualiza();
    if (!manterVista || !mun) { const f = S.ufsGeo.features.find((x) => x.properties.uf === uf); if (f) mapa.fitBounds(bbox(f), { padding: 24, duration: 600 }); }
  }
  function irMun(cod) {
    S.mun = cod; atualiza();
    const f = (S.geoMun[S.uf] || { features: [] }).features.find((x) => x.properties.cod === cod);
    if (f && f.geometry) mapa.fitBounds(bbox(f), { padding: 60, maxZoom: 10, duration: 600 });
  }

  // busca (busca.js): estado e município ficam nesta página, no ano e cargo escolhidos; o resto vai para a página ao vivo
  window.eleicoesVaiPara = (sel) => {
    const ufs = S.indice && S.indice[S.el] && S.indice[S.el][S.cargo];
    if (!ufs || !['uf', 'mun'].includes(sel.nivel) || !ufs.includes(sel.uf)) return false;
    irUf(sel.uf, sel.nivel === 'mun' ? sel.cod : null).then(() => { if (sel.nivel === 'mun') irMun(sel.cod); });
    $('mapa').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  };

  // filtros.js troca ano/turno/cargo por aqui
  window.historico = {
    redimensiona: () => { if (mapa) mapa.resize(); },
    define: async (el, cargo) => {
      if (!S.indice || !S.indice[el] || !S.indice[el][cargo]) return;
      if (el === S.el && cargo === S.cargo) return;
      S.cargo = cargo; S.busca = null;
      if (el !== S.el) return trocaEleicao(el);
      trocaCargo(cargo);
    },
  };

  window.iniciaHist = async (el0, c0, uf0, mun0) => {
    const pronto = iniciaMapa();
    S.indice = await json('h/indice.json');
    S.el = S.indice[el0] ? el0 : Object.keys(S.indice).sort().reverse().find((k) => k.endsWith('-1'));
    S.cargo = S.indice[S.el][c0] ? +c0 : ORDEM.find((c) => S.indice[S.el][c]);
    S.resumo = await json(`h/${S.el}/resumo.json`);
    await pronto;
    desenhaFiltros();
    if (uf0 && S.indice[S.el][S.cargo].includes(uf0)) await irUf(uf0, mun0 || null); else irBrasil();
    if (mun0) irMun(mun0);
  };
})();
