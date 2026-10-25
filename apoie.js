/* Botão "Apoie": abre o QR Code PIX (pix.svg, gerado uma vez a partir do código, sem serviço externo) e copia o código. */
(() => {
  'use strict';
  const d = document.getElementById('pix');
  if (!d) return;
  const cod = document.getElementById('pix-cod'), copia = document.getElementById('pix-copia');
  document.querySelectorAll('[data-apoie]').forEach((b) => b.addEventListener('click', () => { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }));
  document.getElementById('pix-fecha').addEventListener('click', () => d.close ? d.close() : d.removeAttribute('open'));
  d.addEventListener('click', (e) => { if (e.target === d && d.close) d.close(); });
  copia.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(cod.value); } catch (e) { cod.select(); document.execCommand('copy'); }
    copia.textContent = 'Código copiado';
    setTimeout(() => { copia.textContent = 'Copiar código PIX'; }, 2500);
  });
})();
