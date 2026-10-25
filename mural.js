/* Mural de mensagens (aprovadas pelo dono do site) e patrocínios nas laterais.
   Fixar mensagem custa R$ 10 por PIX: o QR leva o valor e um código; o dono confere no banco e aprova.
   Se o serviço do mural não responder, o mural mostra o aviso e o resto do site segue normal. */
(() => {
  'use strict';
  const API = 'https://apuracao-mural.leandrohgmafra.workers.dev';
  const PIX = { chave: 'f9ae59ed-8fcb-4dce-95bd-372a6102edf0', nome: 'Leandro Henrique Goncalve', cidade: 'SAO PAULO' };
  const sec = document.getElementById('mural');
  if (!sec) return;
  const lista = sec.querySelector('.mural-lista'), d = document.getElementById('mural-d');
  const form = d.querySelector('form'), msgErro = d.querySelector('.mural-erro'), enviar = d.querySelector('.mural-envia');
  const pagto = d.querySelector('.mural-pix'), feito = d.querySelector('.mural-ok');
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  // ---------- PIX com valor e código (BR Code estático, mesma chave do "Apoie") ----------
  const tlv = (id, v) => id + String(v.length).padStart(2, '0') + v;
  function crc16(s) {
    let c = 0xffff;
    for (const ch of s) { c ^= ch.charCodeAt(0) << 8; for (let i = 0; i < 8; i++) c = c & 0x8000 ? (c << 1) ^ 0x1021 : c << 1; c &= 0xffff; }
    return c.toString(16).toUpperCase().padStart(4, '0');
  }
  function codigoPix(valor, ref) {
    const p = tlv('00', '01') + tlv('01', '11') + tlv('26', tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', PIX.chave)) + tlv('52', '0000') + tlv('53', '986')
      + (valor ? tlv('54', valor.toFixed(2)) : '') + tlv('58', 'BR') + tlv('59', PIX.nome) + tlv('60', PIX.cidade) + tlv('62', tlv('05', ref)) + '6304';
    return p + crc16(p);
  }
  function qrSvg(texto) {
    const q = window.qrcode(0, 'M'); q.addData(texto); q.make();
    const n = q.getModuleCount(), m = 2, ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${n + 2 * m} ${n + 2 * m}`); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'QR Code PIX'); svg.setAttribute('shape-rendering', 'crispEdges');
    let dd = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) dd += `M${c + m} ${r + m}h1v1h-1z`;
    const fundo = document.createElementNS(ns, 'rect'); fundo.setAttribute('width', '100%'); fundo.setAttribute('height', '100%'); fundo.setAttribute('fill', '#fff');
    const p = document.createElementNS(ns, 'path'); p.setAttribute('d', dd); p.setAttribute('fill', '#000');
    svg.append(fundo, p);
    return svg;
  }

  // ---------- lista pública ----------
  const hora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  function mostra(dados) {
    lista.replaceChildren();
    const ms = dados.mensagens || [];
    if (!ms.length) lista.append(el('p', 'nota', 'Ainda não há mensagens. Seja o primeiro a escrever.'));
    for (const m of ms) {
      const li = el('article', 'mural-msg' + (m.fixar ? ' fixada' : ''));
      const cab = el('p', 'mural-cab');
      if (m.fixar) cab.append(el('span', 'mural-selo', '📌 Fixada'));
      cab.append(el('b', null, m.nome), el('time', null, m.aprovado ? hora.format(new Date(m.aprovado)) : ''));
      li.append(cab, el('p', 'mural-txt', m.texto));
      lista.append(li);
    }
    patrocinios(dados.patrocinios || []);
  }
  function patrocinios(ps) {
    document.querySelectorAll('.patro').forEach((x) => x.remove());
    document.body.classList.toggle('com-patro', ps.length > 0);
    if (!ps.length) return;
    const cria = (cls, itens) => {
      const a = el('aside', 'patro ' + cls); a.setAttribute('aria-label', 'Patrocínio');
      a.append(el('p', 'patro-rot', 'Patrocínio'));
      for (const p of itens) {
        const img = el('img'); img.src = API + p.img; img.alt = p.nome; img.loading = 'lazy'; img.decoding = 'async';
        let caixa = img;
        if (p.link) { caixa = el('a'); caixa.href = p.link; caixa.target = '_blank'; caixa.rel = 'sponsored noopener noreferrer'; caixa.title = p.nome; caixa.append(img); }
        a.append(caixa);
      }
      return a;
    };
    // computador largo: metade de cada lado; celular e telas menores: faixa abaixo dos filtros
    const esq = ps.filter((_, i) => i % 2 === 0), dir = ps.filter((_, i) => i % 2 === 1);
    document.body.append(cria('lat esq', esq));
    if (dir.length) document.body.append(cria('lat dir', dir));
    const faixa = cria('faixa', ps), filtros = document.querySelector('.filtros');
    if (filtros) filtros.after(faixa); else document.querySelector('.wrap').prepend(faixa);
  }
  let ultimo = 0;
  async function carrega() {
    if (document.hidden && ultimo) return;
    try {
      const r = await fetch(API + '/mural');
      if (!r.ok) throw new Error(r.status);
      mostra(await r.json()); ultimo = Date.now();
    } catch (e) {
      if (!ultimo) { lista.replaceChildren(el('p', 'nota', 'O mural está fora do ar agora. Tente de novo mais tarde.')); }
    }
  }
  carrega();
  setInterval(carrega, 180000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - ultimo > 180000) carrega(); });

  // ---------- escrever ----------
  const abre = () => {
    form.hidden = false; pagto.hidden = true; feito.hidden = true; msgErro.textContent = ''; enviar.disabled = false;
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  };
  const fecha = () => (d.close ? d.close() : d.removeAttribute('open'));
  document.querySelectorAll('[data-mural]').forEach((b) => b.addEventListener('click', abre));
  document.querySelectorAll('[data-mural-ir]').forEach((b) => b.addEventListener('click', () => sec.scrollIntoView({ behavior: 'smooth', block: 'start' })));
  d.querySelectorAll('.mural-fecha').forEach((b) => b.addEventListener('click', fecha));
  d.addEventListener('click', (e) => { if (e.target === d) fecha(); });
  const txt = form.elements.texto, conta = d.querySelector('.mural-conta');
  txt.addEventListener('input', () => { conta.textContent = `${[...txt.value].length}/280`; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msgErro.textContent = '';
    const fixar = form.elements.fixar.checked;
    const corpo = { nome: form.elements.nome.value, texto: txt.value, fixar, aceito: form.elements.aceito.checked, site: form.elements.site.value };
    if (!corpo.aceito) { msgErro.textContent = 'Marque que leu e aceita as regras.'; return; }
    enviar.disabled = true; enviar.textContent = 'Enviando…';
    try {
      const r = await fetch(API + '/mensagem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || 'não foi possível enviar');
      form.reset(); conta.textContent = '0/280'; form.hidden = true;
      if (j.ref && j.valor) {
        const cod = codigoPix(j.valor, j.ref);
        pagto.querySelector('.mural-ref').textContent = j.ref;
        pagto.querySelector('.mural-valor').textContent = 'R$ ' + j.valor.toFixed(2).replace('.', ',');
        pagto.querySelector('.mural-qr').replaceChildren(qrSvg(cod));
        pagto.querySelector('textarea').value = cod;
        pagto.hidden = false;
      } else feito.hidden = false;
    } catch (x) {
      msgErro.textContent = 'Erro: ' + x.message + '.';
    } finally { enviar.disabled = false; enviar.textContent = 'Enviar para aprovação'; }
  });
  const copia = pagto.querySelector('.mural-copia');
  copia.addEventListener('click', async () => {
    const t = pagto.querySelector('textarea');
    try { await navigator.clipboard.writeText(t.value); } catch (e) { t.select(); document.execCommand('copy'); }
    copia.textContent = 'Código copiado'; setTimeout(() => { copia.textContent = 'Copiar código PIX'; }, 2500);
  });
})();
