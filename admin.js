/* Painel do mural: aprovar, recusar, fixar e remover mensagens; subir patrocínios; ligar o aviso por ntfy.
   A senha fica só neste navegador (sessão, ou "lembrar") e vai no cabeçalho Authorization. */
(() => {
  'use strict';
  if (top !== self) { document.documentElement.hidden = true; return; }
  const API = 'https://apuracao-mural.leandrohgmafra.workers.dev';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const hora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  let senha = '', vistos = null, timer = null;
  const blobs = [];
  try { senha = sessionStorage.getItem('mural-senha') || localStorage.getItem('mural-senha') || ''; } catch (e) { /* sem storage */ }

  async function api(caminho, opc = {}) {
    const r = await fetch(API + caminho, { ...opc, headers: { ...(opc.headers || {}), Authorization: 'Bearer ' + senha } });
    if (r.status === 401) { sair(); throw new Error('senha incorreta'); }
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.erro || 'erro ' + r.status); }
    return r;
  }

  function sair() {
    senha = ''; clearInterval(timer);
    try { sessionStorage.removeItem('mural-senha'); localStorage.removeItem('mural-senha'); } catch (e) { /* ignora */ }
    $('painel').hidden = true; $('entrar').hidden = false;
  }

  $('entrar').addEventListener('submit', async (e) => {
    e.preventDefault();
    senha = $('senha').value.trim(); $('erro-entrar').textContent = '';
    try {
      await carrega();
      try { (($('lembrar').checked) ? localStorage : sessionStorage).setItem('mural-senha', senha); } catch (x) { /* ignora */ }
      $('senha').value = '';
    } catch (x) { $('erro-entrar').textContent = 'Não entrou: ' + x.message; }
  });
  $('sair').addEventListener('click', sair);
  $('atualiza').addEventListener('click', () => carrega().catch((x) => { $('erro').textContent = x.message; }));
  $('notif').addEventListener('click', async () => {
    if (!('Notification' in window)) { $('erro').textContent = 'Este navegador não mostra avisos.'; return; }
    const p = await Notification.requestPermission();
    $('notif').textContent = p === 'granted' ? 'Avisos ligados (com esta aba aberta)' : 'Avisos bloqueados';
  });

  function botao(rot, acao, id, cls) {
    const b = el('button', cls || null, rot); b.type = 'button';
    b.addEventListener('click', async () => {
      if ((acao === 'apagar') && !confirm('Apagar de vez? Não dá para desfazer.')) return;
      b.disabled = true;
      try { await api('/admin/acao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, acao }) }); await carrega(); }
      catch (x) { $('erro').textContent = x.message; b.disabled = false; }
    });
    return b;
  }

  function cartao(it) {
    const c = el('article', 'item' + (it.fixar ? ' fixar' : ''));
    const cab = el('p', 'cab');
    cab.append(el('b', null, it.tipo === 'pat' ? 'Patrocínio' : 'Mensagem'));
    if (it.tipo === 'msg' && it.ref) cab.append(el('span', 'pago', `FIXAR R$ 10 · código ${it.ref}`));
    else if (it.fixar) cab.append(el('span', 'pago', 'Fixada'));
    cab.append(el('time', null, hora.format(new Date(it.aprovado || it.criado))));
    c.append(cab, el('p', 'nome', it.nome || ''));
    if (it.texto) c.append(el('p', 'txt', it.texto));
    if (it.link) c.append(el('p', 'link', it.link));
    if (it.tipo === 'pat') {
      const img = el('img'); img.alt = it.nome; c.append(img);
      api('/admin/img/' + it.id).then((r) => r.blob()).then((b) => { const u = URL.createObjectURL(b); blobs.push(u); img.src = u; }).catch(() => {});
    }
    const ac = el('div', 'acoes');
    if (it.status === 'pendente') {
      ac.append(botao(it.fixar ? 'Aprovar e fixar (PIX conferido)' : 'Aprovar', 'aprovar', it.id, 'ok'));
      if (it.fixar) ac.append(botao('Aprovar sem fixar', 'aprovar-sem-fixar', it.id));
      ac.append(botao('Recusar', 'apagar', it.id, 'mau'));
    } else {
      if (it.tipo === 'msg') ac.append(it.fixar ? botao('Desafixar', 'desfixar', it.id) : botao('Fixar', 'fixar', it.id));
      ac.append(botao('Tirar do ar', 'ocultar', it.id), botao('Apagar', 'apagar', it.id, 'mau'));
    }
    c.append(ac);
    return c;
  }

  async function carrega() {
    const j = await (await api('/admin/lista')).json();
    $('entrar').hidden = true; $('painel').hidden = false; $('erro').textContent = '';
    blobs.splice(0).forEach((u) => URL.revokeObjectURL(u));
    const pend = j.itens.filter((x) => x.status === 'pendente'), noar = j.itens.filter((x) => x.status === 'ok');
    $('pendentes').replaceChildren(...(pend.length ? pend.map(cartao) : [el('p', 'dica', 'Nada esperando.')]));
    $('noar').replaceChildren(...(noar.length ? noar.map(cartao) : [el('p', 'dica', 'Nada no ar.')]));
    $('resumo').textContent = `${pend.length} esperando · ${noar.length} no ar · ${new Date().toLocaleTimeString('pt-BR')}`;
    document.title = (pend.length ? `(${pend.length}) ` : '') + 'Painel do mural';
    if (!$('cfg').elements.ntfy.matches(':focus')) $('cfg').elements.ntfy.value = j.ntfy || '';
    // pedido novo desde a última leitura: aviso do navegador
    const ids = new Set(pend.map((x) => x.id));
    if (vistos && 'Notification' in window && Notification.permission === 'granted') {
      const novos = pend.filter((x) => !vistos.has(x.id));
      if (novos.length) new Notification('Mural: ' + novos.length + ' pedido(s) novo(s)', { body: novos.some((x) => x.ref) ? 'Tem pedido de fixar (R$ 10).' : 'Mensagem esperando aprovação.' });
    }
    vistos = ids;
    clearInterval(timer); timer = setInterval(() => carrega().catch(() => {}), 30000);
  }

  // imagem reduzida e reconvertida aqui (tira metadados e qualquer coisa embutida no arquivo)
  async function reprocessa(arq) {
    if (!/^image\/(png|jpeg|webp)$/.test(arq.type)) throw new Error('use PNG, JPG ou WebP');
    if (arq.size > 8 * 1024 * 1024) throw new Error('imagem maior que 8 MB');
    const bmp = await createImageBitmap(arq);
    const k = Math.min(1, 600 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    for (const [tipo, q] of [['image/webp', 0.9], ['image/webp', 0.75], ['image/png'], ['image/jpeg', 0.8]]) {
      const b = await new Promise((ok) => cv.toBlob(ok, tipo, q));
      if (b && b.type === tipo && b.size <= 400 * 1024) return b;
    }
    throw new Error('imagem continua grande demais; use uma menor');
  }
  const fp = $('patro');
  fp.elements.img.addEventListener('change', async () => {
    const a = fp.elements.img.files[0], pv = $('previa');
    if (!a) { pv.hidden = true; return; }
    try { const b = await reprocessa(a); pv.src = URL.createObjectURL(b); pv.hidden = false; $('erro-patro').textContent = ''; }
    catch (x) { $('erro-patro').textContent = x.message; pv.hidden = true; }
  });
  fp.addEventListener('submit', async (e) => {
    e.preventDefault(); $('erro-patro').textContent = '';
    const bt = fp.querySelector('[type=submit]'); bt.disabled = true;
    try {
      const b = await reprocessa(fp.elements.img.files[0]);
      const f = new FormData(); f.set('nome', fp.elements.nome.value); f.set('link', fp.elements.link.value.trim()); f.set('img', b, 'logo');
      await api('/admin/patrocinio', { method: 'POST', body: f });
      fp.reset(); $('previa').hidden = true; await carrega();
    } catch (x) { $('erro-patro').textContent = x.message; } finally { bt.disabled = false; }
  });

  const fc = $('cfg');
  $('gera').addEventListener('click', () => {
    const a = 'abcdefghijkmnpqrstuvwxyz23456789';
    fc.elements.ntfy.value = 'mural-' + [...crypto.getRandomValues(new Uint8Array(20))].map((x) => a[x % a.length]).join('');
  });
  fc.addEventListener('submit', async (e) => {
    e.preventDefault(); $('erro-cfg').textContent = '';
    try { await api('/admin/cfg', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ntfy: fc.elements.ntfy.value.trim() }) }); $('erro-cfg').textContent = 'Salvo. Se o tópico estiver assinado no app, chegou um teste.'; }
    catch (x) { $('erro-cfg').textContent = x.message; }
  });

  if (senha) carrega().catch(() => sair());
})();
