/* Apuração presidencial: 2º turno de 2026 lido direto do TSE pelo navegador; turnos anteriores dos arquivos em data/. */
(() => {
  'use strict';

  // ---------- constantes ----------
  const TSE = 'https://resultados.tse.jus.br/oficial/ele2026/6258';
  const ELS = [['2026-2', '2026 · 2º turno'], ['2026-1', '2026 · 1º turno'], ['2022-2', '2022 · 2º'], ['2022-1', '2022 · 1º'], ['2018-2', '2018 · 2º'], ['2018-1', '2018 · 1º'], ['2014-2', '2014 · 2º'], ['2014-1', '2014 · 1º']];
  const AO_VIVO = '2026-2';
  const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PR', 'PB', 'PA', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SE', 'SP', 'TO'];
  const UF_NOME = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PR: 'Paraná', PB: 'Paraíba', PA: 'Pará', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins' };
  const REGIOES = { N: ['Norte', ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO']], NE: ['Nordeste', ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE']], CO: ['Centro-Oeste', ['DF', 'GO', 'MT', 'MS']], SE: ['Sudeste', ['ES', 'MG', 'RJ', 'SP']], S: ['Sul', ['PR', 'RS', 'SC']] };
  const COR_FIXA = { 13: '#c62828', 22: '#1f4fbf' };
  const PALETA = ['#e08a00', '#2e7d32', '#6a1b9a', '#00838f', '#ad1457', '#5d4037', '#455a64', '#9e9d24', '#3949ab', '#d84315'];
  const TEMA = document.documentElement.dataset.theme;
  const ESCURO = TEMA ? TEMA === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  // Troca de tema recarrega a página: as cores do mapa e dos gráficos são fixadas na criação.
  const btTema = document.getElementById('tema');
  btTema.textContent = ESCURO ? '☀ Tema claro' : '☾ Tema escuro';
  btTema.addEventListener('click', () => {
    try { localStorage.setItem('tema', ESCURO ? 'light' : 'dark'); } catch (e) { /* sem storage: só nesta visita */ }
    document.documentElement.dataset.theme = ESCURO ? 'light' : 'dark';
    location.reload();
  });
  const MOV = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900;

  const nf = new Intl.NumberFormat('pt-BR');
  const pct = (v, d = 2) => (v == null || !isFinite(v) ? '—' : (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%');
  // a página tem três visões com os mesmos ids; cada script só enxerga a sua
  const RAIZ = document.getElementById('v-pres');
  const $ = (id) => RAIZ.querySelector('#' + id);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  // ---------- estado ----------
  const S = {
    el: AO_VIVO,
    sel: { nivel: 'mundo' },
    cands: {},          // eleicao -> numero -> {nome, partido}
    hist: null,         // linhas de historico.json indexadas
    mun: {},            // `${el}|${UF}` -> {mun: Map(cod -> loc), zonas: Map(cod -> [loc])}
    live: { br: null, uf: {}, zz: null, cidade: {}, mun: {}, zona: {}, hora: '', ok: null, cfg: null },
    geoMun: {},         // UF -> FeatureCollection
    geoZonas: {},       // UF -> FeatureCollection
    locais: {},         // UF -> [locais]
    cidades: [], ufsGeo: null, mundoGeo: null, ufBox: {},
    evol: [],
  };
  const ordem = new Map(); // numero -> índice de cor

  function cor(n) {
    if (COR_FIXA[n]) return COR_FIXA[n];
    if (!ordem.has(n)) ordem.set(n, ordem.size);
    return PALETA[ordem.get(n) % PALETA.length];
  }
  // foto do candidato a presidente (data/fotos, gerada de foto_cand do TSE); some se o arquivo não existir
  function foto(n, el0 = S.el) {
    if (n == 95 || n == 96) return null;
    const i = document.createElement('img');
    i.className = 'foto'; i.alt = ''; i.loading = 'lazy'; i.decoding = 'async';
    i.src = `data/fotos/${el0.split('-')[0]}/1/BR/${n}.jpg`;
    i.onerror = () => i.remove();
    return i;
  }
  const nomeCand = (n) => (S.cands[S.el] && S.cands[S.el][n] ? S.cands[S.el][n].nome : n == 95 ? 'Brancos' : n == 96 ? 'Nulos' : 'Nº ' + n);

  // ---------- busca com limite de concorrência ----------
  const fila = []; let ativos = 0;
  function pega(url, opts = {}) {
    return new Promise((ok, falha) => { fila.push({ url, opts, ok, falha }); roda(); });
  }
  function roda() {
    while (ativos < 6 && fila.length) {
      const j = fila.shift(); ativos++;
      fetch(j.url, j.opts).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + j.url); return r.json(); })
        .then(j.ok, j.falha).finally(() => { ativos--; roda(); });
    }
  }
  const cacheLocal = {};
  const dados = (p) => cacheLocal[p] || (cacheLocal[p] = fetch('data/' + p).then((r) => { if (!r.ok) throw new Error(p); return r.json(); }));

  // ---------- resultado normalizado: {votos:{n:v}, validos, aptos, comparecimento, secoes, st} ----------
  function deTSE(d) {
    const votos = {}, nomes = {};
    for (const a of d.carg[0].agr) for (const p of a.par) for (const c of p.cand) { votos[c.n] = +c.vap || 0; nomes[c.n] = { nome: titulo(c.nmu), partido: p.sg }; }
    return { votos, nomes, validos: +d.v.vv, aptos: +d.e.te, comparecimento: +d.e.c, brancos: +d.v.vb, nulos: +d.v.tvn, secoes: +d.s.ts, st: +d.s.st, hora: d.dg + ' ' + d.hg };
  }
  function deLinhaLarga(r) {
    const votos = {};
    for (const k in r) if (/^c\d+$/.test(k)) votos[k.slice(1)] = r[k];
    return { votos, validos: r.validos || 0, aptos: r.aptos, comparecimento: r.comparecimento, brancos: r.brancos, nulos: r.nulos, secoes: r.secoes, st: r.secoes_totalizadas ?? r.secoes, nome: r.nome };
  }
  function soma(ls) {
    const t = { votos: {}, validos: 0, aptos: 0, comparecimento: 0, brancos: 0, nulos: 0, secoes: 0, st: 0 };
    for (const l of ls) {
      if (!l) continue;
      for (const k of ['validos', 'aptos', 'comparecimento', 'brancos', 'nulos', 'secoes', 'st']) t[k] += l[k] || 0;
      for (const n in l.votos) t.votos[n] = (t.votos[n] || 0) + l.votos[n];
    }
    return t;
  }
  const titulo = (s) => (s || '').toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());
  function ranking(loc) {
    if (!loc) return [];
    return Object.entries(loc.votos).filter(([n]) => n != 95 && n != 96).map(([n, v]) => ({ n: +n, v })).sort((a, b) => b.v - a.v);
  }
  function lider(loc) {
    const r = ranking(loc);
    if (!loc || !loc.validos || !r.length || !r[0].v) return null;
    return { n: r[0].n, p: r[0].v / loc.validos, seg: r[1] ? { n: r[1].n, p: r[1].v / loc.validos } : null };
  }
  const apurado = (loc) => (loc && loc.secoes ? loc.st / loc.secoes : loc ? 1 : null);

  // ---------- histórico ----------
  async function carregaHistorico() {
    const [h, cfg, cid] = await Promise.all([dados('historico.json'), dados('config.json'), dados('cidades.json')]);
    S.cidades = cid;
    for (const el of Object.keys(cfg.cands)) S.cands[el] = cfg.cands[el];
    const idx = {};
    for (const r of h) {
      const k = r.eleicao + '|' + r.nivel + '|' + r.cod;
      if (!idx[k]) idx[k] = { votos: {}, validos: r.validos, aptos: r.aptos, comparecimento: r.comparecimento, brancos: r.brancos, nulos: r.nulos, secoes: r.secoes, st: r.secoes_totalizadas ?? r.secoes, nome: r.local, pais: r.pais };
      idx[k].votos[r.numero] = r.votos;
    }
    S.hist = idx;
  }
  // resultado de um local na eleição escolhida (ou ao vivo)
  function res(nivel, cod) {
    if (S.el === AO_VIVO) {
      const L = S.live;
      if (nivel === 'brasil') return L.br;
      if (nivel === 'exterior') return L.zz;
      if (nivel === 'uf') return L.uf[cod];
      if (nivel === 'cidade') return L.cidade[cod];
      if (nivel === 'pais') { const cs = S.cidades.filter((c) => c.iso === cod).map((c) => L.cidade[c.cod]).filter(Boolean); return cs.length ? soma(cs) : null; }
      if (nivel === 'mun') return L.mun[cod];
      if (nivel === 'zona') return L.zona[cod];
      return null;
    }
    if (['brasil', 'exterior', 'uf', 'pais', 'cidade'].includes(nivel)) return S.hist && S.hist[S.el + '|' + nivel + '|' + (nivel === 'brasil' ? 'br' : nivel === 'exterior' ? 'zz' : cod)];
    if (nivel === 'mun') { const uf = ufDoMun(cod) || S.sel.uf; const m = S.mun[S.el + '|' + uf]; return m && m.mun.get(cod); }
    if (nivel === 'zona') { const [c, z] = cod.split('|'); const uf = ufDoMun(c); const m = S.mun[S.el + '|' + uf]; return m && (m.zonas.get(c) || []).find((x) => String(x.zona) === z); }
    return null;
  }
  const munUf = new Map();
  const ufDoMun = (cod) => munUf.get(cod);

  async function carregaMunHist(el, uf) {
    const k = el + '|' + uf;
    if (S.mun[k] || el === AO_VIVO) return;
    S.mun[k] = { mun: new Map(), zonas: new Map(), carregando: true };
    try {
      const rs = await dados(`mun/${el}/${uf}.json`);
      const m = new Map(), z = new Map();
      for (const r of rs) {
        const loc = deLinhaLarga(r);
        if (r.nivel === 'mun') { m.set(r.cod, loc); munUf.set(r.cod, uf); }
        else { loc.zona = r.zona; if (!z.has(r.cod)) z.set(r.cod, []); z.get(r.cod).push(loc); }
      }
      S.mun[k] = { mun: m, zonas: z };
    } catch (e) { S.mun[k] = { mun: new Map(), zonas: new Map() }; }
    pinta(); painel();
  }

  // ---------- ao vivo ----------
  const url = { br: () => `${TSE}/dados/br/br-c0001-e006258-u.json`, uf: (u) => `${TSE}/dados/${u}/${u}-c0001-e006258-u.json`, mun: (u, c) => `${TSE}/dados/${u}/${u}${c}-c0001-e006258-u.json`, zona: (u, c, z) => `${TSE}/dados/${u}/${u}${c}-z${String(z).padStart(4, '0')}-c0001-e006258-u.json` };
  let ultimaAtualizacao = 0, falhasSeguidas = 0;

  async function cicloRapido() {
    if (S.el !== AO_VIVO) return;
    try {
      const alvos = [['br', url.br()], ['zz', url.uf('zz')], ...UFS.map((u) => [u, url.uf(u.toLowerCase())])];
      const rs = await Promise.all(alvos.map(([k, u]) => pega(u).then((d) => [k, deTSE(d)]).catch(() => [k, null])));
      let algum = false;
      for (const [k, v] of rs) {
        if (!v) continue;
        algum = true;
        if (k === 'br') { S.live.br = v; S.live.hora = v.hora; for (const n in v.nomes) { (S.cands[AO_VIVO] = S.cands[AO_VIVO] || {})[n] = v.nomes[n]; } }
        else if (k === 'zz') S.live.zz = v;
        else S.live.uf[k] = v;
      }
      if (!algum) throw new Error('sem resposta');
      falhasSeguidas = 0; ultimaAtualizacao = Date.now(); S.live.ok = true;
      registraEvolucao();
    } catch (e) { falhasSeguidas++; S.live.ok = false; }
    tudo();
  }
  async function cicloLento() {
    if (S.el !== AO_VIVO) return;
    if (!S.live.cfg) {
      try { S.live.cfg = await pega(`${TSE}/config/mun-e006258-cm.json`); } catch (e) { return; }
      for (const a of S.live.cfg.abr) for (const m of a.mu) munUf.set(m.cd, a.cd.toUpperCase());
    }
    // cidades do exterior
    const zz = S.live.cfg.abr.find((a) => a.cd === 'zz');
    await Promise.all(zz.mu.map((m) => pega(url.mun('zz', m.cd)).then((d) => { S.live.cidade[m.cd] = deTSE(d); }).catch(() => {})));
    // municípios dos estados visíveis (no máximo 2)
    for (const uf of ufsVisiveis().slice(0, 2)) {
      const a = S.live.cfg.abr.find((x) => x.cd === uf.toLowerCase());
      if (!a) continue;
      await Promise.all(a.mu.map((m) => pega(url.mun(a.cd, m.cd)).then((d) => { S.live.mun[m.cd] = deTSE(d); }).catch(() => {})));
    }
    tudo();
  }
  async function cicloZonas() {
    if (S.el !== AO_VIVO || !S.live.cfg) return;
    const cods = new Set();
    if (S.sel.nivel === 'mun' || S.sel.nivel === 'zona' || S.sel.nivel === 'local') cods.add(S.sel.cod.split('|')[0]);
    if (mapa && mapa.getZoom() >= 9) for (const f of mapa.queryRenderedFeatures({ layers: ['mun-fill'] })) cods.add(f.properties.cod);
    let n = 0;
    const jobs = [];
    for (const c of cods) {
      const uf = ufDoMun(c); if (!uf) continue;
      const a = S.live.cfg.abr.find((x) => x.cd === uf.toLowerCase());
      const m = a && a.mu.find((x) => x.cd === c); if (!m) continue;
      for (const z of m.z) { if (n++ > 120) break; jobs.push(pega(url.zona(a.cd, c, +z)).then((d) => { const l = deTSE(d); l.zona = +z; S.live.zona[c + '|' + (+z)] = l; }).catch(() => {})); }
    }
    await Promise.all(jobs);
    if (jobs.length) { pinta(); painel(); }
  }

  function registraEvolucao() {
    const b = S.live.br;
    if (!b || !b.st) return;
    const p = b.st / b.secoes;
    if (S.evol.length && S.evol[S.evol.length - 1].p === p) return;
    S.evol.push({ p, t: b.hora, votos: { ...b.votos }, validos: b.validos });
    try { localStorage.setItem('evol-6258', JSON.stringify(S.evol)); } catch (e) {}
  }
  try { S.evol = JSON.parse(localStorage.getItem('evol-6258') || '[]'); } catch (e) { S.evol = []; }

  // ---------- topo e placar ----------
  function seletor() {
    const nav = $('eleicoes');
    nav.replaceChildren(...ELS.map(([id, txt]) => {
      const b = el('button', null, id === AO_VIVO ? txt + ' · ao vivo' : txt);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(id === S.el));
      b.addEventListener('click', () => trocaEleicao(id));
      return b;
    }));
  }
  function trocaEleicao(id) {
    S.el = id;
    $('sub-eleicao').textContent = ELS.find((e) => e[0] === id)[1];
    seletor();
    carregaVisiveis();
    if (id === AO_VIVO) { cicloRapido(); cicloLento(); cicloZonas(); }
    tudo();
  }
  function status() {
    const dot = $('status-dot'), t = $('status-txt');
    if (S.el !== AO_VIVO) { dot.className = 'dot'; t.textContent = 'Resultado final · dados abertos do TSE'; return; }
    if (S.live.ok === false && falhasSeguidas > 1) { dot.className = 'dot erro'; t.textContent = 'Sem resposta do TSE, tentando de novo'; return; }
    if (!ultimaAtualizacao) { dot.className = 'dot'; t.textContent = 'Conectando ao TSE…'; return; }
    const s = Math.round((Date.now() - ultimaAtualizacao) / 1000);
    dot.className = 'dot ao-vivo';
    // antes da primeira divulgação o arquivo do TSE traz a data em que foi preparado (véspera), não uma divulgação
    t.textContent = S.live.br && S.live.br.st ? `Ao vivo · atualizado há ${s}s · divulgação TSE ${S.live.hora}` : `Ao vivo · conectado ao TSE, aguardando a primeira divulgação (17h de Brasília)`;
  }
  function placar() {
    const b = res('brasil');
    const ap = apurado(b);
    $('pct-apurado').textContent = b ? pct(ap, 2) : '—';
    $('progress-fill').style.width = b ? (ap * 100) + '%' : '0';
    $('hora-tse').textContent = b && S.el === AO_VIVO && b.hora && b.st ? '· divulgação TSE ' + b.hora : '';
    const r = ranking(b);
    $('cands').replaceChildren(...r.slice(0, 6).map((c, i) => {
      const d = el('div', 'cand com-foto' + (i > 1 ? ' menor' : ''));
      const sw = el('span', 'sw'); sw.style.background = cor(c.n);
      const f = foto(c.n) || el('span');
      f.onerror = () => { f.replaceWith(el('span')); };
      d.append(sw, f, el('span', 'nm', nomeCand(c.n)), el('span', 'pc', b.validos ? pct(c.v / b.validos) : '—'), el('span', 'vt', nf.format(c.v) + ' votos'));
      return d;
    }));
    const nota = $('nota-brasil');
    if (!b) nota.textContent = '';
    else if (!b.validos) nota.textContent = 'A apuração começa às 17h (Brasília), quando fecham as urnas. Os números aparecem aqui assim que o TSE divulgar.';
    else nota.textContent = `Percentual dos votos válidos. ${nf.format(b.validos)} válidos, ${nf.format(b.brancos || 0)} brancos e ${nf.format(b.nulos || 0)} nulos. Inclui o exterior.`;
  }

  // ---------- mapa ----------
  let mapa = null;
  const vazio = { type: 'FeatureCollection', features: [] };
  function bbox(geom) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const vai = (c) => { if (typeof c[0] === 'number') { if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1]; } else c.forEach(vai); };
    vai(geom.coordinates);
    return [[x0, y0], [x1, y1]];
  }

  function iniciaMapa() {
    mapa = new maplibregl.Map({
      container: $('mapa'),
      style: ESCURO ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/positron',
      center: [-30, 5], zoom: 1.4, minZoom: 1, maxZoom: 17, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false,
    });
    mapa.touchZoomRotate.disableRotation();
    mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapa.on('load', async () => {
      const [mundo, ufs] = await Promise.all([dados('geo/mundo.json'), dados('geo/ufs.json')]);
      S.mundoGeo = mundo; S.ufsGeo = ufs;
      for (const f of ufs.features) S.ufBox[f.properties.uf] = bbox(f.geometry);
      const linha = ESCURO ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.9)';
      const add = (id, data) => mapa.addSource(id, { type: 'geojson', data });
      add('paises', mundo); add('ufs', ufs); add('mun', vazio); add('zonas', vazio); add('locais', vazio); add('cidades', vazio); add('sel', vazio);
      const fill = (id, src, minz, maxz, opac) => mapa.addLayer({ id, type: 'fill', source: src, minzoom: minz, maxzoom: maxz, paint: { 'fill-color': ['coalesce', ['get', 'cor'], 'rgba(0,0,0,0)'], 'fill-opacity': opac } });
      fill('paises-fill', 'paises', 0, 24, ['coalesce', ['get', 'op'], 0]);
      fill('ufs-fill', 'ufs', 0, 24, ['interpolate', ['linear'], ['zoom'], 4.5, ['coalesce', ['get', 'op'], 0], 6, 0]);
      mapa.addLayer({ id: 'ufs-line', type: 'line', source: 'ufs', paint: { 'line-color': linha, 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.5, 8, 2] } });
      fill('mun-fill', 'mun', 4.5, 24, ['interpolate', ['linear'], ['zoom'], 4.5, 0, 6, ['coalesce', ['get', 'op'], 0], 9, ['*', 0.55, ['coalesce', ['get', 'op'], 0]], 11, 0.08]);
      mapa.addLayer({ id: 'mun-line', type: 'line', source: 'mun', minzoom: 5.5, paint: { 'line-color': linha, 'line-width': 0.6 } });
      fill('zonas-fill', 'zonas', 8.5, 24, ['interpolate', ['linear'], ['zoom'], 8.5, 0, 9.5, ['coalesce', ['get', 'op'], 0], 13, ['*', 0.4, ['coalesce', ['get', 'op'], 0]]]);
      mapa.addLayer({ id: 'zonas-line', type: 'line', source: 'zonas', minzoom: 8.5, paint: { 'line-color': ESCURO ? '#eceae4' : '#1b1d22', 'line-width': 1, 'line-dasharray': [2, 1.5], 'line-opacity': 0.7 } });
      mapa.addLayer({ id: 'zonas-rot', type: 'symbol', source: 'zonas', minzoom: 10, layout: { 'text-field': ['concat', 'Zona ', ['to-string', ['get', 'zona']]], 'text-size': 11, 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': ESCURO ? '#eceae4' : '#1b1d22', 'text-halo-color': ESCURO ? '#121417' : '#ffffff', 'text-halo-width': 1.2 } });
      mapa.addLayer({ id: 'locais-pt', type: 'circle', source: 'locais', minzoom: 10.5, paint: { 'circle-color': ['coalesce', ['get', 'cor'], '#888'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10.5, ['*', 0.6, ['get', 'r']], 15, ['*', 1.6, ['get', 'r']]], 'circle-stroke-color': ESCURO ? '#121417' : '#ffffff', 'circle-stroke-width': 1, 'circle-opacity': 0.9 } });
      mapa.addLayer({ id: 'cidades-pt', type: 'circle', source: 'cidades', paint: { 'circle-color': ['coalesce', ['get', 'cor'], '#888'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, ['get', 'r'], 8, ['*', 2, ['get', 'r']]], 'circle-stroke-color': ESCURO ? '#121417' : '#ffffff', 'circle-stroke-width': 1 } });
      mapa.addLayer({ id: 'sel-line', type: 'line', source: 'sel', paint: { 'line-color': ESCURO ? '#ffffff' : '#111111', 'line-width': 2.5 } });

      const ordemClique = ['locais-pt', 'cidades-pt', 'zonas-fill', 'mun-fill', 'ufs-fill', 'paises-fill'];
      mapa.on('click', (e) => {
        const fs = mapa.queryRenderedFeatures(e.point, { layers: ordemClique.filter((l) => mapa.getLayer(l)) });
        for (const l of ordemClique) {
          const f = fs.find((x) => x.layer.id === l);
          if (!f) continue;
          if (l === 'zonas-fill' && mapa.getZoom() < 9) continue;
          if (l === 'mun-fill' && mapa.getZoom() < 5.5) continue;
          clique(l, f.properties); return;
        }
      });
      const pop = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, maxWidth: '260px' });
      mapa.on('mousemove', (e) => {
        const fs = mapa.queryRenderedFeatures(e.point, { layers: ordemClique.filter((l) => mapa.getLayer(l)) });
        const f = ordemClique.map((l) => fs.find((x) => x.layer.id === l)).find(Boolean);
        mapa.getCanvas().style.cursor = f ? 'pointer' : '';
        if (!f) { pop.remove(); return; }
        const h = dica(f.layer.id, f.properties);
        if (!h) { pop.remove(); return; }
        const d = el('div'); d.append(el('div', 'pop-h', h[0]), el('div', null, h[1]));
        pop.setLngLat(e.lngLat).setDOMContent(d).addTo(mapa);
      });
      mapa.on('mouseout', () => pop.remove());
      mapa.on('moveend', () => { carregaVisiveis(); dicaMapa(); });
      montaCidades();
      tudo();
      carregaVisiveis();
    });
  }

  function ufsVisiveis() {
    if (!mapa || mapa.getZoom() < 5) return S.sel.uf ? [S.sel.uf] : [];
    const b = mapa.getBounds();
    const out = UFS.filter((u) => { const x = S.ufBox[u]; return x && x[1][0] >= b.getWest() && x[0][0] <= b.getEast() && x[1][1] >= b.getSouth() && x[0][1] <= b.getNorth(); });
    const c = mapa.getCenter();
    out.sort((a, b2) => dist(S.ufBox[a], c) - dist(S.ufBox[b2], c));
    if (S.sel.uf && !out.includes(S.sel.uf)) out.unshift(S.sel.uf);
    return out;
  }
  const dist = (bx, c) => Math.hypot((bx[0][0] + bx[1][0]) / 2 - c.lng, (bx[0][1] + bx[1][1]) / 2 - c.lat);

  async function carregaVisiveis() {
    if (!mapa || !S.ufsGeo) return;
    const z = mapa.getZoom();
    const ufs = ufsVisiveis().slice(0, 4);
    const tarefas = [];
    for (const uf of ufs) {
      if (!S.geoMun[uf]) tarefas.push(dados(`geo/mun/${uf}.json`).then((g) => { S.geoMun[uf] = g; for (const f of g.features) munUf.set(f.properties.cod, uf); }));
      tarefas.push(carregaMunHist(S.el, uf));
      if (z >= 8 || S.sel.nivel === 'mun' || S.sel.nivel === 'zona' || S.sel.nivel === 'local') {
        if (!S.geoZonas[uf]) tarefas.push(dados(`geo/zonas/${uf}.json`).then((g) => { S.geoZonas[uf] = g; }).catch(() => { S.geoZonas[uf] = vazio; }));
        if (!S.locais[uf]) tarefas.push(dados(`locais/${uf}.json`).then((g) => { S.locais[uf] = g; }).catch(() => { S.locais[uf] = []; }));
      }
    }
    await Promise.all(tarefas);
    pinta();
    if (S.el === AO_VIVO && z >= 9) cicloZonas();
  }

  function corOp(l) { const L = lider(l); return L ? { cor: cor(L.n), op: Math.max(0.3, Math.min(0.92, 0.3 + (L.p - 0.4) * 1.9)) } : { cor: null, op: 0 }; }

  function montaCidades() {
    if (!mapa || !mapa.getSource('cidades')) return;
    mapa.getSource('cidades').setData({ type: 'FeatureCollection', features: S.cidades.map((c) => {
      const l = res('cidade', c.cod);
      const L = lider(l);
      return { type: 'Feature', properties: { cod: c.cod, nome: c.nome, pais: c.pais, iso: c.iso, cor: L ? cor(L.n) : (ESCURO ? '#666' : '#9aa0a6'), r: Math.max(3, Math.min(9, Math.sqrt((l && l.aptos) || 400) / 16)), tem: l ? 1 : 0 }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } };
    }).filter((f) => f.properties.tem || S.el === AO_VIVO) });
  }

  function pinta() {
    if (!mapa || !mapa.getSource('paises')) return;
    S.mundoGeo.features.forEach((f) => { const id = f.properties.id; if (id === '76') { f.properties.cor = null; f.properties.op = 0; return; } Object.assign(f.properties, corOp(res('pais', id))); });
    mapa.getSource('paises').setData(S.mundoGeo);
    S.ufsGeo.features.forEach((f) => Object.assign(f.properties, corOp(res('uf', f.properties.uf))));
    mapa.getSource('ufs').setData(S.ufsGeo);
    const ufs = ufsVisiveis().slice(0, 4);
    const munF = [], zonF = [], locF = [];
    for (const uf of ufs) {
      const g = S.geoMun[uf];
      if (g) for (const f of g.features) munF.push({ type: 'Feature', geometry: f.geometry, properties: { ...f.properties, ...corOp(res('mun', f.properties.cod)) } });
      const gz = S.geoZonas[uf];
      if (gz) for (const f of gz.features) zonF.push({ type: 'Feature', geometry: f.geometry, properties: { ...f.properties, ...corOp(res('zona', f.properties.cod + '|' + f.properties.zona)) } });
      const ls = S.locais[uf];
      if (ls && mapa.getZoom() >= 9.5) {
        const b = mapa.getBounds();
        for (const l of ls) {
          if (!l.lat || l.lat === -1 || l.lon < b.getWest() - 0.1 || l.lon > b.getEast() + 0.1 || l.lat < b.getSouth() - 0.1 || l.lat > b.getNorth() + 0.1) continue;
          let c = ESCURO ? '#cfd3d8' : '#4a4f57';
          if (S.el === '2026-1' && l.t1) { const L = lider({ votos: Object.fromEntries(Object.entries(l.t1).map(([k, v]) => [k.slice(1), v])), validos: 1 }); if (L) c = cor(L.n); }
          locF.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [l.lon, l.lat] }, properties: { uf, cod: l.cod, zona: l.zona, local: l.local, nome: l.nome, r: Math.max(2.5, Math.min(8, Math.sqrt(l.eleitores) / 9)), cor: c } });
        }
      }
    }
    mapa.getSource('mun').setData({ type: 'FeatureCollection', features: munF });
    mapa.getSource('zonas').setData({ type: 'FeatureCollection', features: zonF });
    mapa.getSource('locais').setData({ type: 'FeatureCollection', features: locF });
    montaCidades();
    contornoSel();
    legenda();
  }

  function contornoSel() {
    const s = S.sel; let g = null;
    if (s.nivel === 'uf') g = S.ufsGeo.features.find((f) => f.properties.uf === s.uf);
    if (s.nivel === 'pais') g = S.mundoGeo.features.find((f) => f.properties.id === s.cod);
    if (s.nivel === 'mun') g = (S.geoMun[s.uf] || vazio).features.find((f) => f.properties.cod === s.cod);
    if (s.nivel === 'zona') { const [c, z] = s.cod.split('|'); g = (S.geoZonas[s.uf] || vazio).features.find((f) => f.properties.cod === c && String(f.properties.zona) === z); }
    mapa.getSource('sel').setData(g ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: g.geometry, properties: {} }] } : vazio);
  }

  function legenda() {
    const b = res('brasil');
    const r = ranking(b).slice(0, 4);
    const leg = $('legenda');
    leg.replaceChildren(...r.map((c) => { const s = el('span'); const i = el('i'); i.style.background = cor(c.n); s.append(i, document.createTextNode(nomeCand(c.n))); return s; }), el('span', null, 'Tom mais forte = vitória mais folgada'));
  }

  function dica(layer, p) {
    const lin = (l) => { const L = lider(l); return L ? `${nomeCand(L.n)} ${pct(L.p)}` + (l.secoes && l.st < l.secoes ? ` · ${pct(l.st / l.secoes, 0)} apurado` : '') : l ? 'Sem votos apurados' : 'Sem dados'; };
    if (layer === 'paises-fill') { if (p.id === '76') return null; const l = res('pais', p.id); return [p.nome, l ? lin(l) : 'Sem seção eleitoral brasileira']; }
    if (layer === 'ufs-fill') return [UF_NOME[p.uf], lin(res('uf', p.uf))];
    if (layer === 'mun-fill') return [p.nome + ' (' + p.uf + ')', lin(res('mun', p.cod))];
    if (layer === 'zonas-fill') return [`Zona ${p.zona}`, lin(res('zona', p.cod + '|' + p.zona))];
    if (layer === 'cidades-pt') return [p.nome + ' · ' + p.pais, lin(res('cidade', p.cod))];
    if (layer === 'locais-pt') return [p.nome, `Zona ${p.zona} · clique para detalhes`];
    return null;
  }

  function dicaMapa() {
    const z = mapa ? mapa.getZoom() : 0;
    $('mapa-dica').textContent = z < 4.5 ? 'Clique num estado, país ou cidade, ou aproxime para ver municípios' : z < 8.5 ? 'Aproxime mais para ver as zonas eleitorais' : z < 10.5 ? 'Zonas eleitorais (área aproximada). Aproxime para ver os locais de votação' : 'Cada ponto é um local de votação';
  }

  function clique(layer, p) {
    if (layer === 'paises-fill') { if (p.id === '76') return escolhe({ nivel: 'brasil' }); return escolhe({ nivel: 'pais', cod: p.id, nome: p.nome }); }
    if (layer === 'ufs-fill') return escolhe(mapa.getZoom() < 3 && S.sel.nivel === 'mundo' ? { nivel: 'brasil' } : { nivel: 'uf', uf: p.uf });
    if (layer === 'mun-fill') return escolhe({ nivel: 'mun', cod: p.cod, uf: p.uf, nome: p.nome });
    if (layer === 'zonas-fill') return escolhe({ nivel: 'zona', cod: p.cod + '|' + p.zona, uf: ufDoMun(p.cod) });
    if (layer === 'cidades-pt') return escolhe({ nivel: 'cidade', cod: p.cod, iso: p.iso, nome: p.nome, pais: p.pais });
    if (layer === 'locais-pt') return escolhe({ nivel: 'local', cod: p.cod + '|' + p.zona + '|' + p.local, uf: p.uf });
  }

  function escolhe(sel) {
    S.sel = sel;
    let b = null, maxZoom = 14;
    if (sel.nivel === 'mundo') { mapa.flyTo({ center: [-30, 5], zoom: 1.4, duration: MOV }); }
    if (sel.nivel === 'brasil') b = [[-74, -34], [-34.5, 5.5]];
    if (sel.nivel === 'uf') b = S.ufBox[sel.uf];
    if (sel.nivel === 'regiao') {
      const bs = REGIOES[sel.cod][1].map((u) => S.ufBox[u]).filter(Boolean);
      if (bs.length) b = [[Math.min(...bs.map((x) => x[0][0])), Math.min(...bs.map((x) => x[0][1]))], [Math.max(...bs.map((x) => x[1][0])), Math.max(...bs.map((x) => x[1][1]))]];
    }
    if (sel.nivel === 'pais') {
      const cs = S.cidades.filter((c) => c.iso === sel.cod);
      if (cs.length) { const xs = cs.map((c) => c.lon), ys = cs.map((c) => c.lat); b = [[Math.min(...xs) - 3, Math.min(...ys) - 3], [Math.max(...xs) + 3, Math.max(...ys) + 3]]; maxZoom = 6; }
      else { const f = S.mundoGeo.features.find((x) => x.properties.id === sel.cod); if (f) b = bbox(f.geometry); }
    }
    if (sel.nivel === 'cidade') { const c = S.cidades.find((x) => x.cod === sel.cod); if (c) { mapa.flyTo({ center: [c.lon, c.lat], zoom: 8, duration: MOV }); } }
    if (sel.nivel === 'mun') { const f = (S.geoMun[sel.uf] || vazio).features.find((x) => x.properties.cod === sel.cod); if (f) b = bbox(f.geometry); maxZoom = 12; }
    if (sel.nivel === 'zona') { const [c, z] = sel.cod.split('|'); const f = (S.geoZonas[sel.uf] || vazio).features.find((x) => x.properties.cod === c && String(x.properties.zona) === z); if (f) b = bbox(f.geometry); maxZoom = 14; }
    if (sel.nivel === 'local') { const l = localSel(); if (l && l.lat) mapa.flyTo({ center: [l.lon, l.lat], zoom: Math.max(mapa.getZoom(), 14), duration: MOV }); }
    if (b) mapa.fitBounds(b, { padding: 30, maxZoom, duration: MOV });
    if (sel.nivel === 'mun' && S.el === AO_VIVO) cicloZonas();
    tudo();
  }
  function localSel() {
    if (S.sel.nivel !== 'local') return null;
    const [c, z, l] = S.sel.cod.split('|');
    return (S.locais[S.sel.uf] || []).find((x) => x.cod === c && String(x.zona) === z && String(x.local) === l);
  }

  // ---------- painel ----------
  function migalhas() {
    const s = S.sel, out = [['Mundo', { nivel: 'mundo' }]];
    if (['brasil', 'regiao', 'uf', 'mun', 'zona', 'local'].includes(s.nivel)) out.push(['Brasil', { nivel: 'brasil' }]);
    if (s.nivel === 'regiao') out.push([REGIOES[s.cod][0], s]);
    if (['uf', 'mun', 'zona', 'local'].includes(s.nivel)) out.push([UF_NOME[s.uf] || s.uf, { nivel: 'uf', uf: s.uf }]);
    if (['mun', 'zona', 'local'].includes(s.nivel)) { const c = s.cod.split('|')[0]; const m = munNome(c); out.push([m, { nivel: 'mun', cod: c, uf: s.uf, nome: m }]); }
    if (['zona', 'local'].includes(s.nivel)) { const [c, z] = s.cod.split('|'); out.push(['Zona ' + z, { nivel: 'zona', cod: c + '|' + z, uf: s.uf }]); }
    if (s.nivel === 'local') { const l = localSel(); out.push([l ? titulo(l.nome) : 'Local', s]); }
    if (['pais', 'cidade'].includes(s.nivel)) { const iso = s.nivel === 'pais' ? s.cod : s.iso; const nome = s.nivel === 'pais' ? s.nome : s.pais; out.push([nome || 'País', { nivel: 'pais', cod: iso, nome }]); }
    if (s.nivel === 'cidade') out.push([s.nome, s]);
    const nav = $('crumbs');
    nav.replaceChildren();
    out.forEach(([t, sel], i) => {
      if (i) nav.append(el('span', null, '›'));
      const b = el('button', null, t); b.type = 'button';
      if (i < out.length - 1) b.addEventListener('click', () => escolhe(sel)); else b.setAttribute('aria-current', 'location');
      nav.append(b);
    });
  }
  function munNome(c) {
    for (const uf in S.geoMun) { const f = S.geoMun[uf].features.find((x) => x.properties.cod === c); if (f) return f.properties.nome; }
    const l = res('mun', c); return (l && l.nome) || c;
  }

  function barras(loc, host) {
    const box = el('div', 'barras');
    const r = ranking(loc);
    if (!loc || !loc.validos) { box.append(el('p', 'meta', loc ? 'Ainda sem votos apurados aqui.' : 'Carregando ou sem dados para esta eleição.')); host.append(box); return; }
    for (const c of r.slice(0, 8)) {
      const d = el('div', 'barra com-foto');
      const t = el('span', 't'); const i = el('i'); i.style.width = (100 * c.v / loc.validos) + '%'; i.style.background = cor(c.n); t.append(i);
      const f = foto(c.n) || el('span');
      f.onerror = () => { f.replaceWith(el('span')); };
      d.append(f, el('span', 'nm', nomeCand(c.n)), el('span', 'v', pct(c.v / loc.validos) + ' · ' + nf.format(c.v)), t);
      box.append(d);
    }
    host.append(box);
  }
  function meta(loc) {
    if (!loc) return '';
    const p = [];
    if (loc.secoes) p.push(pct(loc.st / loc.secoes, 1) + ' das seções apuradas');
    if (loc.aptos) p.push(nf.format(loc.aptos) + ' eleitores');
    if (loc.aptos && loc.comparecimento) p.push('comparecimento ' + pct(loc.comparecimento / loc.aptos, 1));
    return p.join(' · ');
  }

  function painel() {
    const P = $('painel');
    P.replaceChildren();
    const s = S.sel;
    const cab = (nivel, nome, loc) => { P.append(el('p', 'nivel', nivel), el('h3', null, nome), el('p', 'meta', meta(loc))); barras(loc, P); };
    if (s.nivel === 'mundo' || s.nivel === 'brasil') {
      cab(s.nivel === 'mundo' ? 'Resultado geral' : 'País', 'Brasil', res('brasil'));
      const ext = res('exterior');
      P.append(el('h4', null, 'Brasileiros no exterior'), el('p', 'meta', meta(ext)));
      barras(ext, P);
      P.append(el('p', 'meta', 'Clique num estado, num país ou num ponto do exterior para descer até zonas e locais de votação.'));
    } else if (s.nivel === 'regiao') {
      const ufs = REGIOES[s.cod][1];
      cab('Região', REGIOES[s.cod][0], soma(ufs.map((u) => res('uf', u))));
      P.append(tabela(['Estado', 'Líder', '%', 'Válidos'], ufs.map((u) => { const l = res('uf', u), L = lider(l); return { cells: [UF_NOME[u], L ? nomeCand(L.n) : '—', L ? pct(L.p, 1) : '—', nf.format((l && l.validos) || 0)], cor: L && cor(L.n), click: () => escolhe({ nivel: 'uf', uf: u }) }; })));
    } else if (s.nivel === 'uf') cab('Estado', UF_NOME[s.uf], res('uf', s.uf));
    else if (s.nivel === 'pais') {
      const l = res('pais', s.cod);
      cab('País · eleitores brasileiros', s.nome || 'País', l);
      const cs = S.cidades.filter((c) => c.iso === s.cod).map((c) => ({ c, l: res('cidade', c.cod) })).filter((x) => x.l);
      if (cs.length) {
        P.append(el('h4', null, cs.length === 1 ? 'Cidade com seção eleitoral' : cs.length + ' cidades com seção eleitoral'));
        P.append(tabela(['Cidade', 'Líder', '%', 'Válidos'], cs.sort((a, b) => (b.l.validos || 0) - (a.l.validos || 0)).map(({ c, l }) => { const L = lider(l); return { cells: [c.nome, L ? nomeCand(L.n) : '—', L ? pct(L.p, 1) : '—', nf.format(l.validos || 0)], cor: L && cor(L.n), click: () => escolhe({ nivel: 'cidade', cod: c.cod, iso: c.iso, nome: c.nome, pais: c.pais }) }; })));
      }
    } else if (s.nivel === 'cidade') {
      cab('Cidade no exterior · ' + s.pais, s.nome, res('cidade', s.cod));
      P.append(el('p', 'meta', 'Todas as seções do exterior pertencem à 1ª Zona Eleitoral do Exterior (ZZ), com sede no Distrito Federal.'));
      const ls = (S.locais.ZZ || []).filter((l) => l.cod === s.cod);
      if (!S.locais.ZZ) dados('locais/ZZ.json').then((g) => { S.locais.ZZ = g; painel(); });
      if (ls.length) { P.append(el('h4', null, 'Locais de votação')); for (const l of ls) P.append(el('p', 'meta', `${titulo(l.nome)} · ${l.end} · ${l.secoes} seções · ${nf.format(l.eleitores)} eleitores`)); }
    } else if (s.nivel === 'mun') {
      const l = res('mun', s.cod);
      cab('Município · ' + UF_NOME[s.uf], munNome(s.cod), l);
      const zs = zonasDoMun(s.cod);
      if (zs.length) {
        P.append(el('h4', null, zs.length === 1 ? 'Zona eleitoral' : zs.length + ' zonas eleitorais'));
        P.append(tabela(['Zona', 'Líder', '%', 'Válidos', 'Apurado'], zs.map((z) => { const L = lider(z); return { cells: ['Zona ' + z.zona, L ? nomeCand(L.n) : '—', L ? pct(L.p, 1) : '—', nf.format(z.validos || 0), z.secoes ? pct(z.st / z.secoes, 0) : '—'], cor: L && cor(L.n), click: () => escolhe({ nivel: 'zona', cod: s.cod + '|' + z.zona, uf: s.uf }) }; })));
      } else if (S.el === AO_VIVO) P.append(el('p', 'meta', 'Buscando as zonas no TSE…'));
    } else if (s.nivel === 'zona') {
      const [c, z] = s.cod.split('|');
      cab(munNome(c) + ' · ' + UF_NOME[s.uf], 'Zona ' + z, res('zona', s.cod));
      const g = (S.geoZonas[s.uf] || vazio).features.find((f) => f.properties.cod === c && String(f.properties.zona) === z);
      if (g && g.properties.aprox) P.append(el('p', 'meta', 'Área no mapa aproximada, desenhada pelos locais de votação da zona.'));
      const ls = (S.locais[s.uf] || []).filter((l) => l.cod === c && String(l.zona) === z).sort((a, b) => b.eleitores - a.eleitores);
      if (ls.length) {
        P.append(el('h4', null, ls.length + ' locais de votação'));
        P.append(tabela(['Local', 'Bairro', 'Eleitores', '1º turno'], ls.map((l) => { const L = l.t1 ? liderT1(l.t1) : null; return { cells: [titulo(l.nome), titulo(l.bairro), nf.format(l.eleitores), L ? `${nomeCandEl('2026-1', L.n).split(' ')[0]} ${pct(L.p, 0)}` : '—'], cor: L && cor(L.n), corCol: 3, click: () => escolhe({ nivel: 'local', cod: `${l.cod}|${l.zona}|${l.local}`, uf: s.uf }) }; })));
      }
    } else if (s.nivel === 'local') {
      const l = localSel();
      if (!l) { P.append(el('p', 'meta', 'Carregando…')); return; }
      P.append(el('p', 'nivel', `Local de votação · Zona ${l.zona} · ${munNome(l.cod)}`), el('h3', null, titulo(l.nome)), el('p', 'meta', `${l.end}, ${titulo(l.bairro)} · ${l.secoes} seções · ${nf.format(l.eleitores)} eleitores`));
      if (l.sec) P.append(el('p', 'meta', (s.secao ? `Seção ${s.secao} fica aqui. ` : '') + 'Seções deste local: ' + l.sec.replace(/,/g, ', ').replace(/-/g, ' a ')));
      if (l.t1) {
        P.append(el('h4', null, 'Resultado do 1º turno de 2026 neste local'));
        const votos = Object.fromEntries(Object.entries(l.t1).map(([k, v]) => [k.slice(1), v]));
        const validos = Object.entries(votos).filter(([n]) => n != 95 && n != 96).reduce((a, [, v]) => a + v, 0);
        const el0 = S.el; S.el = '2026-1'; barras({ votos, validos }, P); S.el = el0;
      }
      P.append(el('p', 'meta', 'O TSE divulga ao vivo só até o nível da zona. O voto por seção e por local do 2º turno sai depois da apuração, nos boletins de urna.'));
    }
  }
  const nomeCandEl = (e, n) => (S.cands[e] && S.cands[e][n] ? S.cands[e][n].nome : 'Nº ' + n);
  function liderT1(t1) {
    const r = Object.entries(t1).filter(([k]) => k !== 'c95' && k !== 'c96').map(([k, v]) => ({ n: +k.slice(1), v })).sort((a, b) => b.v - a.v);
    const tot = r.reduce((a, c) => a + c.v, 0);
    return tot && r[0] ? { n: r[0].n, p: r[0].v / tot } : null;
  }
  function zonasDoMun(cod) {
    if (S.el === AO_VIVO) return Object.entries(S.live.zona).filter(([k]) => k.split('|')[0] === cod).map(([, v]) => v).sort((a, b) => a.zona - b.zona);
    const uf = ufDoMun(cod); const m = S.mun[S.el + '|' + uf];
    return m ? (m.zonas.get(cod) || []).slice().sort((a, b) => a.zona - b.zona) : [];
  }
  function tabela(cab, linhas) {
    const box = el('div', 'tbl');
    const t = el('table'); const th = el('tr');
    cab.forEach((c, i) => th.append(el('th', i > 1 ? 'n' : null, c)));
    const thead = el('thead'); thead.append(th);
    const tb = el('tbody');
    for (const l of linhas) {
      const tr = el('tr', l.click ? 'click' : null);
      l.cells.forEach((c, i) => { const td = el('td', i > 1 ? 'n' : null); if (i === (l.corCol ?? 1) && l.cor) { const s = el('span', 'sw'); s.style.background = l.cor; td.append(s); } td.append(document.createTextNode(c)); tr.append(td); });
      if (l.click) { tr.tabIndex = 0; tr.addEventListener('click', l.click); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') l.click(); }); }
      tb.append(tr);
    }
    t.append(thead, tb); box.append(t);
    return box;
  }

  // ---------- tabelas e evolução ----------
  function tabelas() {
    const ufs = UFS.map((u) => ({ u, l: res('uf', u) })).filter((x) => x.l).sort((a, b) => (b.l.validos || b.l.aptos) - (a.l.validos || a.l.aptos));
    $('tab-ufs').tBodies[0].replaceChildren(...ufs.map(({ u, l }) => {
      const L = lider(l);
      const tr = el('tr', 'click');
      const td = (t, n) => { const e = el('td', n ? 'n' : null, t); tr.append(e); return e; };
      td(UF_NOME[u]);
      const tl = td(''); if (L) { const s = el('span', 'sw'); s.style.background = cor(L.n); tl.append(s, document.createTextNode(nomeCand(L.n))); } else tl.textContent = '—';
      td(L ? pct(L.p) : '—', 1); td(L && L.seg ? nomeCand(L.seg.n) : '—', 1); td(L && L.seg ? pct(L.seg.p) : '—', 1); td(nf.format(l.validos || 0), 1); td(pct(apurado(l), 1), 1);
      tr.addEventListener('click', () => { escolhe({ nivel: 'uf', uf: u }); $('mapa').scrollIntoView({ behavior: MOV ? 'smooth' : 'auto', block: 'center' }); });
      return tr;
    }));
    const isos = [...new Set(S.cidades.map((c) => c.iso))];
    const ps = isos.map((iso) => ({ iso, nome: (S.cidades.find((c) => c.iso === iso) || {}).pais, l: res('pais', iso) })).filter((x) => x.l).sort((a, b) => (b.l.aptos || 0) - (a.l.aptos || 0));
    $('tab-paises').tBodies[0].replaceChildren(...ps.map(({ iso, nome, l }) => {
      const L = lider(l);
      const tr = el('tr', 'click');
      const td = (t, n) => { const e = el('td', n ? 'n' : null, t); tr.append(e); return e; };
      td(nome);
      const tl = td(''); if (L) { const s = el('span', 'sw'); s.style.background = cor(L.n); tl.append(s, document.createTextNode(nomeCand(L.n))); } else tl.textContent = '—';
      td(L ? pct(L.p, 1) : '—', 1); td(nf.format(l.validos || 0), 1); td(pct(apurado(l), 0), 1);
      tr.addEventListener('click', () => { escolhe({ nivel: 'pais', cod: iso, nome }); $('mapa').scrollIntoView({ behavior: MOV ? 'smooth' : 'auto', block: 'center' }); });
      return tr;
    }));
  }

  function evolucao() {
    const host = $('evol'), nota = $('evol-nota');
    host.replaceChildren();
    if (S.el !== AO_VIVO) { nota.textContent = 'Disponível no 2º turno de 2026, ao vivo.'; return; }
    const pts = S.evol;
    if (pts.length < 2) { nota.textContent = 'A curva aparece conforme o TSE divulga as seções, a partir das 17h (Brasília). Ela é montada pelo seu navegador enquanto a página está aberta.'; return; }
    nota.textContent = 'Percentual dos válidos de cada candidato conforme as seções são apuradas (registrado por este navegador).';
    const W = Math.max(320, host.clientWidth), H = 240, m = { t: 10, r: 110, b: 26, l: 40 };
    const ns = ranking(S.live.br).slice(0, 4).map((c) => c.n);
    const x = (p) => m.l + (p - pts[0].p) / Math.max(1e-6, pts[pts.length - 1].p - pts[0].p) * (W - m.l - m.r);
    const vals = pts.flatMap((p) => ns.map((n) => (p.validos ? 100 * (p.votos[n] || 0) / p.validos : 0)));
    const y0 = Math.max(0, Math.floor(Math.min(...vals) / 5) * 5 - 5), y1 = Math.min(100, Math.ceil(Math.max(...vals) / 5) * 5 + 5);
    const y = (v) => m.t + (1 - (v - y0) / (y1 - y0)) * (H - m.t - m.b);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const mk = (tag, at, txt) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); if (txt != null) e.textContent = txt; svg.append(e); return e; };
    for (let v = y0; v <= y1; v += 5) { mk('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: 'var(--line)' }); mk('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, v + '%'); }
    mk('text', { x: m.l, y: H - 6 }, pct(pts[0].p, 0) + ' apurado'); mk('text', { x: W - m.r, y: H - 6, 'text-anchor': 'end' }, pct(pts[pts.length - 1].p, 0));
    const fins = [];
    for (const n of ns) {
      const d = pts.map((p, i) => (i ? 'L' : 'M') + x(p.p).toFixed(1) + ' ' + y(p.validos ? 100 * (p.votos[n] || 0) / p.validos : 0).toFixed(1)).join('');
      mk('path', { d, fill: 'none', stroke: cor(n), 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      const u = pts[pts.length - 1];
      fins.push({ n, y: y(u.validos ? 100 * (u.votos[n] || 0) / u.validos : 0), v: u.validos ? (u.votos[n] || 0) / u.validos : 0 });
    }
    fins.sort((a, b) => a.y - b.y); for (let i = 1; i < fins.length; i++) if (fins[i].y - fins[i - 1].y < 14) fins[i].y = fins[i - 1].y + 14;
    for (const f of fins) mk('text', { x: W - m.r + 6, y: f.y + 4, style: `fill:${cor(f.n)};font-weight:600` }, nomeCand(f.n).split(' ')[0] + ' ' + pct(f.v, 1));
    host.append(svg);
  }

  function tudo() { status(); placar(); pinta(); migalhas(); painel(); tabelas(); evolucao(); dicaMapa(); }

  // usado pela busca (busca.js): carrega o que o destino precisa e então navega
  async function vaiPara(sel) {
    if (sel.uf && ['uf', 'mun', 'zona', 'local'].includes(sel.nivel)) {
      const uf = sel.uf, t = [];
      if (!S.geoMun[uf]) t.push(dados(`geo/mun/${uf}.json`).then((g) => { S.geoMun[uf] = g; for (const f of g.features) munUf.set(f.properties.cod, uf); }));
      t.push(carregaMunHist(S.el, uf));
      if (sel.nivel !== 'uf') {
        if (!S.geoZonas[uf]) t.push(dados(`geo/zonas/${uf}.json`).then((g) => { S.geoZonas[uf] = g; }).catch(() => { S.geoZonas[uf] = vazio; }));
        if (!S.locais[uf]) t.push(dados(`locais/${uf}.json`).then((g) => { S.locais[uf] = g; }).catch(() => { S.locais[uf] = []; }));
      }
      await Promise.all(t);
    }
    if (sel.nivel === 'mun') sel.nome = munNome(sel.cod);
    escolhe(sel);
    $('mapa').scrollIntoView({ behavior: MOV ? 'smooth' : 'auto', block: 'center' });
  }
  window.apuracao = { escolhe, vaiPara, trocaEleicao, estado: S, pronto: () => !!(mapa && mapa.loaded() && S.ufsGeo && S.hist), redimensiona: () => { if (mapa) mapa.resize(); evolucao(); } };

  // ---------- início (chamado por filtros.js quando a visão aparece pela primeira vez) ----------
  window.iniciaPres = (el0) => {
  if (el0 && ELS.some((e) => e[0] === el0)) S.el = el0;
  seletor();
  carregaHistorico().then(() => { tudo(); }).catch(() => { $('status-txt').textContent = 'Falha ao carregar o histórico'; });
  iniciaMapa();
  cicloRapido();
  // vindo da busca de outra página: #ir=<destino em JSON>
  let ir = null;
  try { if (location.hash.startsWith('#ir=')) ir = JSON.parse(decodeURIComponent(location.hash.slice(4))); } catch (e) { ir = null; }
  if (ir) {
    const t = setInterval(() => {
      if (!mapa || !mapa.loaded() || !S.ufsGeo || !S.hist) return;
      clearInterval(t);
      try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignora */ }
      vaiPara(ir);
    }, 300);
  }
  cicloLento();
  setInterval(cicloRapido, 15000);
  setInterval(cicloLento, 90000);
  setInterval(cicloZonas, 45000);
  setInterval(status, 1000);
  window.addEventListener('resize', () => evolucao());
  };
})();
