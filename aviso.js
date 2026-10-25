/* Aviso que abre uma vez ao entrar no site (votação prorrogada até 19h). Fechado, não volta neste navegador. */
(() => {
  'use strict';
  const CHAVE = 'aviso-19h-2026-2', d = document.getElementById('aviso');
  if (!d) return;
  try { if (localStorage.getItem(CHAVE)) return; } catch (e) { /* sem storage: mostra */ }
  const fecha = () => { try { localStorage.setItem(CHAVE, '1'); } catch (e) { /* ignora */ } if (d.close) d.close(); else d.removeAttribute('open'); };
  document.getElementById('aviso-ok').addEventListener('click', fecha);
  d.addEventListener('close', () => { try { localStorage.setItem(CHAVE, '1'); } catch (e) { /* ignora */ } });
  d.addEventListener('click', (e) => { if (e.target === d) fecha(); });
  if (d.showModal) d.showModal(); else d.setAttribute('open', '');
})();
