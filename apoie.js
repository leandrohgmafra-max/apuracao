/* Botão "Apoie": abre o QR Code PIX (pix.svg, gerado uma vez a partir do código, sem serviço externo) e copia o código. */
(() => {
  'use strict';
  const d = document.getElementById('pix');
  if (!d) return;
  const cod = document.getElementById('pix-cod'), copia = document.getElementById('pix-copia');
  document.querySelectorAll('[data-apoie]').forEach((b) => b.addEventListener('click', () => { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }));
  // compartilhar a partir do painel de apoio: fecha o painel e usa o mesmo fluxo do botão Compartilhar
  const ac = document.getElementById('apoie-comp');
  if (ac) ac.addEventListener('click', () => { if (d.close) d.close(); else d.removeAttribute('open'); const c = document.getElementById('compartilha'); if (c) c.click(); });
  // no celular o botão flutuante some enquanto a pessoa rola e volta quando ela para, para não tapar números
  const fl = document.querySelector('.pix-flutua');
  if (fl) { let t = null; addEventListener('scroll', () => { fl.classList.add('rolando'); clearTimeout(t); t = setTimeout(() => fl.classList.remove('rolando'), 1200); }, { passive: true }); }
  document.getElementById('pix-fecha').addEventListener('click', () => d.close ? d.close() : d.removeAttribute('open'));
  d.addEventListener('click', (e) => { if (e.target === d && d.close) d.close(); });
  copia.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(cod.value); } catch (e) { cod.select(); document.execCommand('copy'); }
    copia.textContent = 'Código copiado';
    setTimeout(() => { copia.textContent = 'Copiar código PIX'; }, 2500);
  });
})();

/* Título volta à apuração ao vivo do Brasil; botão Compartilhar leva o lugar que está na tela. */
(() => {
  'use strict';
  const home = document.getElementById('home');
  if (home) home.addEventListener('click', (e) => { e.preventDefault(); location.href = location.pathname + '#2026-2/1'; if (location.hash === '#2026-2/1') location.reload(); });
  const bt = document.getElementById('compartilha');
  if (!bt) return;
  function alvo() {
    const vis = [...document.querySelectorAll('.visao')].find((v) => !v.hidden);
    const crumbs = vis && vis.querySelector('#crumbs');
    const caminho = crumbs ? crumbs.textContent.replace(/\s*›\s*/g, ' › ').trim() : '';
    const tit = document.getElementById('titulo-sel').textContent;
    let url = location.href;
    // o X guarda a prévia pelo endereço (sem o #): ?v=<nome da imagem de prévia> faz cada imagem nova virar um endereço novo
    const comVersao = (u) => {
      try {
        const og = document.querySelector('meta[property="og:image"]'), x = new URL(u);
        const v = og && og.content.split('/').pop().replace(/\.[a-z]+$/i, '');
        if (v) x.searchParams.set('v', v);
        return x.href;
      } catch (e) { return u; }
    };
    // no mapa do presidente o lugar escolhido não fica no endereço: vai no formato da busca (#ir=)
    const ap = window.apuracao && window.apuracao.estado;
    if (vis && vis.id === 'v-pres' && ap && ap.sel && !['mundo', 'brasil'].includes(ap.sel.nivel) && ap.el === '2026-2') url = location.origin + location.pathname + '#ir=' + encodeURIComponent(JSON.stringify(ap.sel));
    const texto = `${tit}${caminho ? ' · ' + caminho : ''} · resultado do TSE atualizado a cada 15 s`;
    return { url: comVersao(url), texto };
  }
  let menu = null;
  bt.addEventListener('click', async () => {
    const { url, texto } = alvo();
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ title: 'Eleições no Brasil', text: texto, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    if (menu) { menu.remove(); menu = null; return; }
    menu = document.createElement('div'); menu.className = 'menu-comp'; menu.setAttribute('role', 'menu');
    const item = (rot, fn) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.textContent = rot; b.onclick = () => { fn(); }; menu.append(b); return b; };
    item('WhatsApp', () => window.open('https://wa.me/?text=' + encodeURIComponent(texto + '\n' + url), '_blank', 'noopener'));
    item('X (Twitter)', () => window.open('https://x.com/intent/post?text=' + encodeURIComponent(texto) + '&url=' + encodeURIComponent(url), '_blank', 'noopener'));
    const c = item('Copiar link', async () => { try { await navigator.clipboard.writeText(url); c.textContent = 'Link copiado'; } catch (e) { prompt('Copie o link:', url); } });
    bt.after(menu);
    setTimeout(() => document.addEventListener('click', function fora(ev) { if (menu && !menu.contains(ev.target) && ev.target !== bt) { menu.remove(); menu = null; document.removeEventListener('click', fora); } }), 0);
  });
})();
