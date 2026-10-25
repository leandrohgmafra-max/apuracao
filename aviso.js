/* Aviso que abre toda vez que alguém entra no site (votação prorrogada até 19h).
   "Entendi" fecha só nesta visita; "Não mostrar mais" é a única opção que grava no navegador. */
(() => {
  'use strict';
  const CHAVE = 'aviso-19h-2026-2-nunca', d = document.getElementById('aviso');
  if (!d) return;
  try { if (localStorage.getItem(CHAVE)) return; } catch (e) { /* sem storage: mostra */ }
  const fecha = () => { if (d.close) d.close(); else d.removeAttribute('open'); };
  document.getElementById('aviso-ok').addEventListener('click', fecha);
  document.getElementById('aviso-nunca').addEventListener('click', () => { try { localStorage.setItem(CHAVE, '1'); } catch (e) { /* ignora */ } fecha(); });
  d.addEventListener('click', (e) => { if (e.target === d) fecha(); });
  if (d.showModal) d.showModal(); else d.setAttribute('open', '');
})();
