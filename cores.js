/* Cores escolhidas pela pessoa: tema (claro, escuro ou Brasil) e cor de cada partido. Fica só neste navegador (localStorage).
   Carregado antes dos outros scripts: eles chamam window.corUsuario(numero) e window.corSigla(sigla). */
(() => {
  'use strict';
  const PARTIDOS = { 10: 'REPUBLICANOS', 11: 'PP', 12: 'PDT', 13: 'PT', 14: 'MISSÃO', 15: 'MDB', 16: 'PSTU', 18: 'REDE', 19: 'PODE', 20: 'PODE', 21: 'PCB', 22: 'PL', 23: 'CIDADANIA', 25: 'PRD', 27: 'DC', 28: 'PRTB', 29: 'PCO', 30: 'NOVO', 33: 'MOBILIZA', 35: 'DEMOCRATA', 36: 'AGIR', 40: 'PSB', 43: 'PV', 44: 'UNIÃO', 45: 'PSDB', 50: 'PSOL', 55: 'PSD', 65: 'PCDOB', 70: 'AVANTE', 77: 'SOLIDARIEDADE', 80: 'UP' };
  const PADRAO = { PT: '#c62828', PL: '#1f4fbf' };
  let esc = {};
  try { esc = JSON.parse(localStorage.getItem('cores-partidos') || '{}') || {}; } catch (e) { esc = {}; }
  const norm = (s) => String(s || '').toUpperCase().replace(/\s+/g, '');
  const ok = (c) => /^#[0-9a-f]{6}$/i.test(c || '');
  window.corSigla = (sg) => (ok(esc[norm(sg)]) ? esc[norm(sg)] : null);
  window.corUsuario = (n) => { const sg = PARTIDOS[String(n).slice(0, 2)]; return sg ? window.corSigla(sg) : null; };

  const bt = document.getElementById('cores-bt'), d = document.getElementById('cores');
  if (!bt || !d) return;
  let tema = null;
  try { tema = localStorage.getItem('tema'); } catch (e) { /* sem storage */ }
  const salva = () => { try { localStorage.setItem('cores-partidos', JSON.stringify(esc)); } catch (e) { /* só nesta visita */ } };
  function monta() {
    const temas = d.querySelector('.temas'); temas.textContent = '';
    for (const [v, rot, sw] of [['light', 'Claro', ['#f6f5f1', '#1b1d22', '#0f6b5c']], ['dark', 'Escuro', ['#121417', '#eceae4', '#4fc3a8']], ['brasil', 'Brasil', ['#009c3b', '#ffdf00', '#002776']]]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tema-op'; b.setAttribute('aria-pressed', String((tema || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === v));
      const s = document.createElement('span'); s.className = 'sws'; for (const c of sw) { const i = document.createElement('i'); i.style.background = c; s.append(i); }
      b.append(s, rot);
      b.onclick = () => { try { localStorage.setItem('tema', v); } catch (e) { /* ignora */ } location.reload(); };
      temas.append(b);
    }
    const lista = d.querySelector('.partidos'); lista.textContent = '';
    const vistos = new Set();
    const ordem = Object.entries(PARTIDOS).sort((x, y) => (PADRAO[y[1]] ? 1 : 0) - (PADRAO[x[1]] ? 1 : 0));
    for (const [n, sg] of ordem) {
      if (vistos.has(sg)) continue; vistos.add(sg);
      const l = document.createElement('label'); l.className = 'partido';
      const i = document.createElement('input'); i.type = 'color'; i.value = esc[norm(sg)] || PADRAO[sg] || '#888888';
      i.setAttribute('aria-label', `Cor do ${sg} (${n})`);
      if (!esc[norm(sg)] && !PADRAO[sg]) l.classList.add('auto');
      i.oninput = () => { esc[norm(sg)] = i.value; salva(); l.classList.add('mudou'); l.classList.remove('auto'); };
      const t = document.createElement('span'); t.textContent = `${sg} · ${n}`;
      const a = document.createElement('small'); a.className = 'auto-rot'; a.textContent = ' automática'; t.append(a);
      if (esc[norm(sg)]) l.classList.add('mudou');
      l.append(i, t); lista.append(l);
    }
  }
  bt.addEventListener('click', () => { monta(); d.showModal ? d.showModal() : d.setAttribute('open', ''); });
  d.querySelector('.cores-aplica').addEventListener('click', () => location.reload());
  d.querySelector('.cores-limpa').addEventListener('click', () => { esc = {}; salva(); location.reload(); });
  d.addEventListener('click', (e) => { if (e.target === d && d.close) d.close(); });
})();
