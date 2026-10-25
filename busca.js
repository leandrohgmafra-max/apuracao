/* Busca com sugestões, comum a todas as páginas: região, estado, município, zona, local de votação, seção e cidade do exterior.
   A página que sabe navegar até o lugar expõe window.apuracao.vaiPara (ao vivo) ou window.eleicoesVaiPara (histórico);
   nas outras, a escolha abre a página ao vivo com #ir=<destino>. */
(() => {
  'use strict';

  const REGIOES = { N: ['Norte', ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO']], NE: ['Nordeste', ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE']], CO: ['Centro-Oeste', ['DF', 'GO', 'MT', 'MS']], SE: ['Sudeste', ['ES', 'MG', 'RJ', 'SP']], S: ['Sul', ['PR', 'RS', 'SC']] };
  const UF_NOME = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PR: 'Paraná', PB: 'Paraíba', PA: 'Pará', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins' };
  const TIPO = { regiao: 'Região', uf: 'Estado', mun: 'Município', zona: 'Zona eleitoral', local: 'Local de votação', secao: 'Seção', cidade: 'Exterior' };
  const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const titulo = (s) => (s || '').toLowerCase().replace(/(^|[\s'(/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());

  const nav = document.querySelector('nav.secoes');
  if (!nav) return;
  const caixa = document.createElement('div'); caixa.className = 'busca-g';
  caixa.innerHTML = '<input type="search" role="combobox" aria-expanded="false" aria-controls="busca-g-lista" aria-autocomplete="list" placeholder="Buscar estado, cidade, zona, escola, seção…" autocomplete="off"><ul id="busca-g-lista" role="listbox" hidden></ul>';
  nav.append(caixa);
  const inp = caixa.querySelector('input'), lista = caixa.querySelector('ul');

  // ---------- índice ----------
  let base = null, locais = null, munPorCod = new Map();
  function carrega() {
    if (base) return base;
    base = fetch('data/busca.json').then((r) => r.json()).then((d) => {
      const itens = [];
      for (const k in REGIOES) itens.push({ t: 'regiao', h: ' ' + norm(REGIOES[k][0] + ' regiao'), rot: REGIOES[k][0], sub: REGIOES[k][1].join(', '), sel: { nivel: 'regiao', cod: k } });
      for (const uf in UF_NOME) itens.push({ t: 'uf', h: ' ' + norm(UF_NOME[uf] + ' ' + uf + ' estado'), sig: uf.toLowerCase(), rot: UF_NOME[uf], sub: uf, sel: { nivel: 'uf', uf } });
      for (const [cod, nome, uf] of d.m) { munPorCod.set(cod, [nome, uf]); itens.push({ t: 'mun', h: ' ' + norm(nome + ' ' + uf + ' ' + UF_NOME[uf]), n: norm(nome), rot: nome, sub: UF_NOME[uf], sel: { nivel: 'mun', cod, uf } }); }
      for (const [cod, zona] of d.z) { const m = munPorCod.get(cod); if (m) itens.push({ t: 'zona', h: ' ' + norm(m[0] + ' ' + m[1] + ' zona'), z: zona, rot: 'Zona ' + zona, sub: `${m[0]}/${m[1]}`, sel: { nivel: 'zona', cod: cod + '|' + zona, uf: m[1] } }); }
      for (const [cod, nome, pais, iso] of d.c) munPorCod.set(cod, [titulo(nome) + ' (' + pais + ')', 'ZZ']);
      for (const [cod, nome, pais, iso] of d.c) itens.push({ t: 'cidade', h: ' ' + norm(nome + ' ' + pais + ' exterior'), rot: titulo(nome), sub: pais, sel: { nivel: 'cidade', cod, iso, nome: titulo(nome), pais } });
      return itens;
    });
    // os locais de votação (arquivo maior) chegam depois; a busca já funciona sem eles
    base.then(() => fetch('data/busca-locais.json')).then((r) => r.json()).then((ls) => {
      locais = ls.map(([uf, cod, zona, local, nome, bairro, sec]) => {
        const m = munPorCod.get(cod) || [cod, uf];
        return { t: 'local', h: ' ' + norm(`${nome} ${bairro} ${m[0]} ${uf}`), z: zona, sec: faixas(sec), secTxt: sec, rot: titulo(nome), sub: `${titulo(bairro)}${bairro ? ' · ' : ''}Zona ${zona} · ${m[0]}/${uf}`, sel: { nivel: 'local', cod: `${cod}|${zona}|${local}`, uf } };
      });
      if (document.activeElement === inp && inp.value.trim()) sugere();
    }).catch(() => { locais = []; });
    return base;
  }
  const faixas = (s) => (s ? s.split(',').map((f) => { const [a, b] = f.split('-').map(Number); return [a, b || a]; }) : []);
  const temSecao = (fx, n) => fx.some(([a, b]) => n >= a && n <= b);

  // ---------- consulta ----------
  function interpreta(q) {
    const toks = norm(q).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    const out = { txt: [], zona: null, secao: null, num: [] };
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i], prox = toks[i + 1];
      if ((t === 'zona' || t === 'ze') && /^\d+$/.test(prox || '')) { out.zona = +prox; i++; continue; }
      if (/^(secao|sec|secoes)$/.test(t) && /^\d+$/.test(prox || '')) { out.secao = +prox; i++; continue; }
      if (/^\d+$/.test(t)) { out.num.push(+t); continue; }
      if (t === 'zona' || /^(secao|sec)$/.test(t)) continue;
      out.txt.push(t);
    }
    return out;
  }
  const casa = (h, txt) => txt.every((t) => h.includes(' ' + t));
  async function busca(q) {
    const itens = await carrega(), Q = interpreta(q), res = [];
    if (!Q.txt.length && !Q.zona && !Q.secao && !Q.num.length) return res;
    const numZona = Q.zona ?? (Q.num.length ? Q.num[0] : null);
    for (const it of itens) {
      if (it.t === 'zona') {
        if (numZona == null || it.z !== numZona || !Q.txt.length || !casa(it.h, Q.txt)) continue;
        res.push([it, 3]);
      } else if (!Q.zona && !Q.secao && !Q.num.length && Q.txt.length && casa(it.h, Q.txt)) {
        let p = { regiao: 0, uf: 0, mun: 2, cidade: 4 }[it.t];
        if (it.sig && Q.txt.length === 1 && Q.txt[0] === it.sig) p = -2;
        if (it.n && it.n === Q.txt.join(' ')) p = -1;
        res.push([it, p]);
      }
    }
    if (locais && Q.txt.length) {
      const sec = Q.secao ?? (Q.num.length && !Q.zona ? Q.num[Q.num.length - 1] : null);
      for (const it of locais) {
        if (!casa(it.h, Q.txt)) continue;
        if (Q.zona != null && it.z !== Q.zona) continue;
        if (sec != null) {
          if (!temSecao(it.sec, sec)) { if (Q.secao != null || Q.num.length && it.z !== Q.num[0]) continue; res.push([it, 5]); continue; }
          res.push([Object.assign({}, it, { t: 'secao', rot: `Seção ${sec} · ${it.rot}`, sel: Object.assign({}, it.sel, { secao: sec }) }), 1]);
          continue;
        }
        res.push([it, 5]);
        if (res.length > 400) break;
      }
    }
    res.sort((a, b) => a[1] - b[1] || a[0].rot.length - b[0].rot.length);
    return res.slice(0, 12).map((r) => r[0]);
  }

  // ---------- lista ----------
  let atual = [], foco = -1, espera = null;
  function mostra(rs) {
    atual = rs; foco = -1; lista.textContent = '';
    if (!rs.length) {
      if (inp.value.trim().length > 1) { const li = document.createElement('li'); li.className = 'vazio'; li.textContent = locais ? 'Nada encontrado. Tente o nome da cidade, da escola ou "zona 12 campinas".' : 'Carregando locais de votação…'; lista.append(li); lista.hidden = false; inp.setAttribute('aria-expanded', 'true'); }
      else fecha();
      return;
    }
    rs.forEach((r, i) => {
      const li = document.createElement('li'); li.setAttribute('role', 'option'); li.id = 'bg-' + i;
      const a = document.createElement('span'); a.className = 'r'; a.textContent = r.rot;
      const b = document.createElement('span'); b.className = 's'; b.textContent = `${TIPO[r.t]} · ${r.sub}`;
      li.append(a, b);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); vai(r); });
      lista.append(li);
    });
    lista.hidden = false; inp.setAttribute('aria-expanded', 'true');
  }
  function fecha() { lista.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); }
  function marca(i) {
    foco = (i + atual.length) % atual.length;
    [...lista.children].forEach((li, j) => li.setAttribute('aria-selected', String(j === foco)));
    inp.setAttribute('aria-activedescendant', 'bg-' + foco);
  }
  async function sugere() { const q = inp.value; const rs = await busca(q); if (q === inp.value) mostra(rs); }
  function vai(r) {
    fecha(); inp.value = r.rot; inp.blur();
    const sel = r.sel;
    if (window.apuracao && window.apuracao.vaiPara) return window.apuracao.vaiPara(sel);
    if (window.eleicoesVaiPara && window.eleicoesVaiPara(sel)) return;
    location.href = './#ir=' + encodeURIComponent(JSON.stringify(sel));
  }

  inp.addEventListener('focus', () => { carrega(); });
  inp.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(sugere, 120); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && atual.length) { e.preventDefault(); marca(foco + 1); }
    else if (e.key === 'ArrowUp' && atual.length) { e.preventDefault(); marca(foco - 1); }
    else if (e.key === 'Enter' && atual.length) { e.preventDefault(); vai(atual[Math.max(foco, 0)]); }
    else if (e.key === 'Escape') fecha();
  });
  inp.addEventListener('blur', () => setTimeout(fecha, 150));
})();
