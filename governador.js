/* Governador 2026, 2º turno ao vivo: estado e municípios lidos direto do TSE. ?el=6259 mostra o 1º turno (útil para conferir). */
(() => {
  'use strict';

  const EL = /^\d{4}$/.test(new URLSearchParams(location.search).get('el') || '') ? new URLSearchParams(location.search).get('el') : '6260';
  const TSE = `https://resultados.tse.jus.br/oficial/ele2026/${EL}`;
  const E6 = 'e' + EL.padStart(6, '0');
  const UF_NOME = { AC: 'Acre', AM: 'Amazonas', DF: 'Distrito Federal', ES: 'Espírito Santo', RN: 'Rio Grande do Norte', TO: 'Tocantins' };
  const PALETA = ['#d84315', '#3949ab', '#2e7d32', '#6a1b9a', '#00838f', '#ad1457', '#5d4037', '#9e9d24'];
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
  const RAIZ = document.getElementById('v-gov');
  const $ = (id) => RAIZ.querySelector('#' + id);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const titulo = (s) => (s || '').toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());

  const S = { cfg: null, ufs: [], uf: null, est: {}, mun: {}, geo: {}, sel: null, cor: {}, ultimo: 0, erro: false };

  // busca com no máximo 6 pedidos simultâneos
  const fila = []; let ativos = 0;
  const pega = (url) => new Promise((ok, falha) => { fila.push({ url, ok, falha }); roda(); });
  function roda() {
    while (ativos < 6 && fila.length) {
      const j = fila.shift(); ativos++;
      fetch(j.url, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(j.ok, j.falha).finally(() => { ativos--; roda(); });
    }
  }

  function deTSE(d) {
    const cands = [];
    for (const a of d.carg[0].agr) for (const p of a.par) for (const c of p.cand) cands.push({ n: c.n, nome: titulo(c.nmu), partido: p.sg, v: +c.vap || 0 });
    cands.sort((a, b) => b.v - a.v);
    return { cands, validos: +d.v.vv, aptos: +d.e.te, secoes: +d.s.ts, st: +d.s.st, hora: d.dg + ' ' + d.hg };
  }
  const cor = (n) => S.cor[S.uf + n] || '#888';
  function fixaCores(r) {
    // cor pela ordem do estado na primeira leitura, para não trocar de cor quando a liderança muda
    [...r.cands].sort((a, b) => a.n - b.n).forEach((c, i) => { if (!S.cor[S.uf + c.n]) S.cor[S.uf + c.n] = PALETA[i % PALETA.length]; });
  }

  // ---------- leitura ----------
  async function lerEstado() {
    try {
      const r = deTSE(await pega(`${TSE}/dados/${S.uf.toLowerCase()}/${S.uf.toLowerCase()}-c0003-${E6}-u.json`));
      S.est[S.uf] = r; fixaCores(r); S.ultimo = Date.now(); S.erro = false;
    } catch (e) { S.erro = true; }
    desenhaPlacar(); status();
  }
  async function lerMunicipios() {
    const uf = S.uf, a = S.cfg.abr.find((x) => x.cd === uf.toLowerCase());
    if (!a) return;
    const m = S.mun[uf] || (S.mun[uf] = {});
    await Promise.all(a.mu.map((mu) => pega(`${TSE}/dados/${uf.toLowerCase()}/${uf.toLowerCase()}${mu.cd}-c0003-${E6}-u.json`)
      .then((d) => { m[mu.cd] = Object.assign(deTSE(d), { nome: titulo(mu.nm) }); }, () => {})));
    if (uf === S.uf) { pintaMapa(); desenhaTabela(); desenhaPainel(); }
  }

  // ---------- telas ----------
  function status() {
    const r = S.est[S.uf];
    $('status-dot').className = 'dot ' + (S.erro ? 'erro' : 'ao-vivo');
    const seg = S.ultimo ? Math.round((Date.now() - S.ultimo) / 1000) : null;
    $('status-txt').textContent = (S.erro ? 'Falha ao ler o TSE, tentando de novo' : 'Ao vivo') + (seg != null ? ` · atualizado há ${seg}s` : '') + (r ? ` · TSE ${r.hora}` : '');
  }
  function desenhaUfs() {
    const nav = $('ufs'); nav.textContent = '';
    for (const uf of S.ufs) {
      const b = el('button', null, UF_NOME[uf] || uf); b.type = 'button';
      b.setAttribute('aria-pressed', uf === S.uf);
      b.onclick = () => escolheUf(uf);
      nav.append(b);
    }
  }
  function desenhaPlacar() {
    const r = S.est[S.uf], box = $('cands'); box.textContent = '';
    if (!r) return;
    const ap = r.secoes ? r.st / r.secoes : 0;
    $('pct-apurado').textContent = pct(ap);
    $('progress-fill').style.width = (ap * 100) + '%';
    $('hora-tse').textContent = '· divulgação TSE ' + r.hora;
    r.cands.forEach((c, i) => {
      const d = el('div', 'cand com-foto' + (i > 1 ? ' menor' : ''));
      const sw = el('i', 'sw'); sw.style.background = cor(c.n);
      const ft = el('img', 'foto'); ft.alt = ''; ft.loading = 'lazy'; ft.src = `data/fotos/2026/3/${S.uf}/${c.n}.jpg`; ft.onerror = () => ft.replaceWith(el('span'));
      d.append(sw, ft, el('span', 'nm', `${c.nome} (${c.partido})`), el('span', 'pc', r.validos ? pct(c.v / r.validos) : '—'), el('span', 'vt', nf.format(c.v) + ' votos'));
      box.append(d);
    });
    $('nota').textContent = r.st ? `${nf.format(r.validos)} votos válidos · ${nf.format(r.aptos)} eleitores` : 'A apuração começa às 17h (Brasília). Os números aparecem aqui assim que o TSE divulgar.';
    const leg = $('legenda'); leg.textContent = '';
    r.cands.forEach((c) => { const s = el('span'); const i = el('i'); i.style.background = cor(c.n); s.append(i, c.nome); leg.append(s); });
    leg.append(el('span', null, 'Tom mais forte = vitória mais folgada'));
  }
  function desenhaPainel() {
    const p = $('painel'); p.textContent = '';
    const m = S.mun[S.uf] || {};
    const r = S.sel ? m[S.sel] : S.est[S.uf];
    p.append(el('p', 'nivel', S.sel ? 'Município' : 'Estado'), el('h3', null, S.sel ? (r ? r.nome : '') : UF_NOME[S.uf]));
    if (!r) { p.append(el('p', 'meta', 'Carregando…')); return; }
    p.append(el('p', 'meta', `${pct(r.secoes ? r.st / r.secoes : 0, 1)} das seções apuradas · ${nf.format(r.aptos)} eleitores`));
    if (!r.validos) { p.append(el('p', null, 'Ainda sem votos apurados aqui.')); return; }
    const bs = el('div', 'barras');
    for (const c of r.cands) {
      const b = el('div', 'barra'), t = el('span', 't'), f = el('i');
      f.style.width = (c.v / r.validos * 100) + '%'; f.style.background = cor(c.n); t.append(f);
      b.append(el('span', 'nm', c.nome), el('span', 'v', `${pct(c.v / r.validos)} · ${nf.format(c.v)}`), t);
      bs.append(b);
    }
    p.append(bs);
  }
  function desenhaTabela() {
    const tb = $('tab').tBodies[0]; tb.textContent = '';
    const m = S.mun[S.uf] || {};
    Object.entries(m).sort((a, b) => b[1].aptos - a[1].aptos).forEach(([cod, r]) => {
      const tr = el('tr', 'click'), L = r.validos ? r.cands[0] : null;
      const td = el('td'); const sw = el('span', 'sw'); sw.style.background = L ? cor(L.n) : 'transparent'; td.append(sw, L ? L.nome : '—');
      tr.append(el('td', null, r.nome), td, el('td', 'n', L ? pct(L.v / r.validos, 1) : '—'), el('td', 'n', nf.format(r.validos)), el('td', 'n', pct(r.secoes ? r.st / r.secoes : 0, 0)));
      tr.onclick = () => { S.sel = cod; desenhaPainel(); destaca(); $('mapa').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
      tb.append(tr);
    });
  }

  // ---------- mapa ----------
  let mapa = null;
  const vazio = { type: 'FeatureCollection', features: [] };
  function bbox(fc) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const vai = (c) => { if (typeof c[0] === 'number') { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); } else c.forEach(vai); };
    fc.features.forEach((f) => f.geometry && vai(f.geometry.coordinates));
    return [[x0, y0], [x1, y1]];
  }
  function iniciaMapa() {
    mapa = new maplibregl.Map({ container: $('mapa'), style: ESCURO ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/positron', center: [-50, -12], zoom: 3.5, dragRotate: false, attributionControl: { compact: true } });
    mapa.touchZoomRotate.disableRotation();
    mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    return new Promise((ok) => mapa.on('load', () => {
      mapa.addSource('mun', { type: 'geojson', data: vazio });
      mapa.addSource('sel', { type: 'geojson', data: vazio });
      mapa.addLayer({ id: 'mun-fill', type: 'fill', source: 'mun', paint: { 'fill-color': ['coalesce', ['get', 'cor'], 'rgba(0,0,0,0)'], 'fill-opacity': ['coalesce', ['get', 'op'], 0] } });
      mapa.addLayer({ id: 'mun-line', type: 'line', source: 'mun', paint: { 'line-color': ESCURO ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.9)', 'line-width': 0.7 } });
      mapa.addLayer({ id: 'sel-line', type: 'line', source: 'sel', paint: { 'line-color': ESCURO ? '#fff' : '#111', 'line-width': 2.5 } });
      const pop = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
      mapa.on('mousemove', 'mun-fill', (e) => {
        const f = e.features[0], r = (S.mun[S.uf] || {})[f.properties.cod];
        mapa.getCanvas().style.cursor = 'pointer';
        const L = r && r.validos ? r.cands[0] : null;
        pop.setLngLat(e.lngLat).setHTML(`<div class="pop-h"></div><b></b>`).addTo(mapa);
        const n = pop.getElement().querySelector('.pop-h'), b = pop.getElement().querySelector('b');
        n.textContent = f.properties.nome; b.textContent = L ? `${L.nome} ${pct(L.v / r.validos, 1)}` : 'sem votos apurados';
      });
      mapa.on('mouseleave', 'mun-fill', () => { mapa.getCanvas().style.cursor = ''; pop.remove(); });
      mapa.on('click', 'mun-fill', (e) => { S.sel = e.features[0].properties.cod; desenhaPainel(); destaca(); });
      ok();
    }));
  }
  async function carregaGeo(uf) {
    if (!S.geo[uf]) S.geo[uf] = await fetch(`data/geo/mun/${uf}.json`).then((r) => r.json());
    return S.geo[uf];
  }
  function pintaMapa() {
    const g = S.geo[S.uf]; if (!g || !mapa) return;
    const m = S.mun[S.uf] || {};
    for (const f of g.features) {
      const r = m[f.properties.cod];
      if (r && r.validos && r.cands[0].v) {
        const p = r.cands[0].v / r.validos;
        f.properties.cor = cor(r.cands[0].n); f.properties.op = Math.max(0.15, Math.min(0.9, 0.25 + (p - 0.5) * 1.6));
      } else { f.properties.cor = null; f.properties.op = 0; }
    }
    mapa.getSource('mun').setData(g);
  }
  function destaca() {
    const g = S.geo[S.uf];
    const f = g && S.sel ? g.features.filter((x) => x.properties.cod === S.sel) : [];
    mapa.getSource('sel').setData({ type: 'FeatureCollection', features: f });
  }

  // ---------- fluxo ----------
  let tEst = null, tMun = null;
  async function escolheUf(uf) {
    S.uf = uf; S.sel = null;
    try { history.replaceState(null, '', '#2026-2/3/' + uf); } catch (e) { /* ignora */ }
    desenhaUfs(); $('crumbs').textContent = UF_NOME[uf];
    $('tab').tBodies[0].textContent = ''; desenhaPainel();
    const g = await carregaGeo(uf);
    if (uf !== S.uf) return;
    pintaMapa(); destaca();
    mapa.fitBounds(bbox(g), { padding: 30, duration: 600 });
    clearInterval(tEst); clearInterval(tMun);
    lerEstado(); lerMunicipios();
    tEst = setInterval(lerEstado, 15000);
    tMun = setInterval(lerMunicipios, 60000);
  }

  window.governador = { redimensiona: () => { if (mapa) mapa.resize(); } };
  window.iniciaGov = async (ufPedida) => {
    const pronto = iniciaMapa();
    try { S.cfg = await pega(`${TSE}/config/mun-${E6}-cm.json`); } catch (e) { $('status-txt').textContent = 'Não consegui ler a configuração do TSE. Recarregue a página.'; return; }
    S.ufs = S.cfg.abr.map((a) => a.cd.toUpperCase()).filter((u) => u !== 'ZZ' && u !== 'BR').sort();
    if (EL === '6259') $('sub-eleicao').firstChild.textContent = '2026 · 1º turno · ';
    await pronto;
    const pedido = (ufPedida || '').toUpperCase();
    escolheUf(S.ufs.includes(pedido) ? pedido : S.ufs.includes('ES') ? 'ES' : S.ufs[0]);
    setInterval(status, 1000);
  };
})();
