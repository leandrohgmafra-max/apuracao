/* Contador de pessoas no site agora. Um único Durable Object guarda as conexões WebSocket abertas
   (API de hibernação: conexão parada não custa tempo de execução) e avisa a todos quando o número muda. */
const ORIGENS = ['https://leandrohgmafra-max.github.io', 'http://localhost:8766'];
const PING_MS = 60000, VELHA_MS = 150000, AVISO_MS = 10000;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== '/ws') return new Response('ok', { status: 200 });
    if (!ORIGENS.includes(req.headers.get('Origin') || '')) return new Response('origem não permitida', { status: 403 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('esperava websocket', { status: 426 });
    return env.SALA.get(env.SALA.idFromName('site')).fetch(req);
  },
};

export class Sala {
  constructor(ctx) {
    this.ctx = ctx;
    // o navegador manda "ping" a cada 60 s; a resposta é automática e não acorda o objeto
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  async fetch() {
    const [cliente, servidor] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(servidor);
    servidor.send(JSON.stringify({ n: this.ctx.getWebSockets().length }));
    await this.agenda();
    return new Response(null, { status: 101, webSocket: cliente });
  }
  async webSocketClose(ws) { try { ws.close(1000); } catch (e) { /* já fechada */ } await this.agenda(); }
  async webSocketError() { await this.agenda(); }
  async webSocketMessage() { /* nada além do ping, que é respondido automaticamente */ }
  // um aviso a cada 10 s no máximo, para caber no plano gratuito
  async agenda() {
    const atual = await this.ctx.storage.getAlarm(), quando = Date.now() + AVISO_MS;
    if (atual == null || atual > quando) await this.ctx.storage.setAlarm(quando);
  }
  async alarm() {
    const agora = Date.now(), vivas = [];
    for (const ws of this.ctx.getWebSockets()) {
      const ult = this.ctx.getWebSocketAutoResponseTimestamp(ws);
      // celular dormindo some sem fechar a conexão: sem ping há 150 s, conta como saída
      if (ult && agora - ult.getTime() > VELHA_MS) { try { ws.close(1000, 'sem ping'); } catch (e) { /* ignora */ } continue; }
      vivas.push(ws);
    }
    const msg = JSON.stringify({ n: vivas.length });
    for (const ws of vivas) { try { ws.send(msg); } catch (e) { /* ignora */ } }
    // volta a conferir as conexões paradas daqui a 2 min
    if (vivas.length) await this.ctx.storage.setAlarm(Date.now() + PING_MS * 2);
  }
}
