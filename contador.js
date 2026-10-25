/* Selo "N pessoas vendo agora" no topo. Conecta por WebSocket ao contador (Cloudflare Worker).
   Se o serviço não responder, o selo simplesmente não aparece; o resto do site não depende dele. */
(() => {
  'use strict';
  const URL_WS = ''; // preenchido quando o contador for publicado (wss://apuracao-contador.<conta>.workers.dev/ws)
  const selo = document.getElementById('vendo');
  if (!selo || !URL_WS || !('WebSocket' in window)) return;
  const num = selo.querySelector('.n'), nf = new Intl.NumberFormat('pt-BR');
  let ws = null, ping = null, tentativas = 0, oculto = null;
  function liga() {
    try { ws = new WebSocket(URL_WS); } catch (e) { return; }
    ws.onopen = () => { tentativas = 0; ws.send('ping'); ping = setInterval(() => ws.readyState === 1 && ws.send('ping'), 60000); };
    ws.onmessage = (e) => {
      let d; try { d = JSON.parse(e.data); } catch (x) { return; }
      if (!Number.isInteger(d.n) || d.n < 1) return;
      num.textContent = nf.format(d.n);
      selo.setAttribute('aria-label', `${nf.format(d.n)} ${d.n === 1 ? 'pessoa vendo' : 'pessoas vendo'} agora`);
      selo.querySelector('.r').textContent = d.n === 1 ? ' pessoa vendo agora' : ' pessoas vendo agora';
      selo.hidden = false;
    };
    ws.onclose = () => {
      clearInterval(ping); selo.hidden = true; ws = null;
      if (document.hidden || tentativas >= 5) return;
      tentativas++; setTimeout(liga, Math.min(60000, 2000 * 2 ** tentativas));
    };
  }
  // aba em segundo plano por 5 min: sai da contagem; ao voltar, conecta de novo
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { oculto = setTimeout(() => ws && ws.close(), 300000); return; }
    clearTimeout(oculto);
    if (!ws) { tentativas = 0; liga(); }
  });
  liga();
})();
