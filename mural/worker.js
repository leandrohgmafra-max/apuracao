/* Mural de mensagens e patrocínios. Um único Durable Object (SQLite) guarda tudo.
   Mensagem só aparece depois de aprovada no painel (admin.html); patrocínio só o dono sobe, pelo painel.
   O site não confirma pagamento: o dono confere o PIX no banco pelo código de referência e só então aprova. */
const ORIGENS = ['https://leandrohgmafra-max.github.io', 'http://localhost:8766'];
const LIM = {
  texto: 280, nome: 40, link: 200, img: 400 * 1024,
  msgJanela: 10 * 60e3, msgMax: 5,        // 5 mensagens a cada 10 min por rede (no celular, muita gente divide o mesmo IP)
  filaMsg: 300,              // pendentes no máximo (protege o armazenamento)
  mostraMsg: 60, mostraPat: 8,
};
const VALOR = { fixar: 10 };
// links e endereços não entram em mensagens (golpe e propaganda costumam vir assim)
const RE_LINK = /(https?:|www\.|\b[a-z0-9-]{2,}\.(com|br|net|org|io|me|ly|gg|xyz|app|site|online|info|co|tv|link|shop|store|bet|club|top)\b|wa\.me|t\.me|bit\.ly)/i;

function cors(origem) {
  return ORIGENS.includes(origem) ? {
    'Access-Control-Allow-Origin': origem, Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600',
  } : {};
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), origem = req.headers.get('Origin') || '';
    if (url.pathname === '/') return new Response('ok');
    if (req.method === 'OPTIONS') return new Response(null, { status: ORIGENS.includes(origem) ? 204 : 403, headers: cors(origem) });
    // escrita só a partir do site (o navegador manda Origin em todo POST de outro domínio)
    if (req.method === 'POST' && !ORIGENS.includes(origem)) return new Response('origem não permitida', { status: 403 });
    const ip = req.headers.get('CF-Connecting-IP') || '0';
    const r = new Request(req, { headers: new Headers([...req.headers, ['x-ip', ip]]) });
    const res = await env.MURAL.get(env.MURAL.idFromName('mural')).fetch(r);
    const h = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors(origem))) h.set(k, v);
    return new Response(res.body, { status: res.status, headers: h });
  },
};

const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });
const erro = (msg, status = 400) => json({ erro: msg }, status);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codigo = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => ALFA[b % ALFA.length]).join('');

// texto limpo: sem caracteres de controle, espaços repetidos nem mais de 4 quebras de linha
function limpa(s, max, linhas = false) {
  if (typeof s !== 'string') return '';
  s = s.normalize('NFC').replace(linhas ? /[\u0000-\u0009\u000B-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g : /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g, '');
  s = s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (linhas) s = s.split('\n').slice(0, 5).join('\n');
  return [...s].slice(0, max).join('');
}

function tipoImagem(b) {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

export class Mural {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.sql = ctx.storage.sql; this.publico = null;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS itens (
      id TEXT PRIMARY KEY, tipo TEXT NOT NULL, nome TEXT, texto TEXT, link TEXT,
      fixar INTEGER NOT NULL DEFAULT 0, ref TEXT, status TEXT NOT NULL, criado INTEGER NOT NULL, aprovado INTEGER,
      img BLOB, img_tipo TEXT)`);
    this.sql.exec('CREATE TABLE IF NOT EXISTS lim (k TEXT NOT NULL, t INTEGER NOT NULL)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS lim_k ON lim (k, t)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS cfg (k TEXT PRIMARY KEY, v TEXT)');
  }

  async fetch(req) {
    const url = new URL(req.url), p = url.pathname;
    try {
      if (req.method === 'GET' && p === '/mural') return json(this.lista(), 200, { 'Cache-Control': 'public, max-age=30' });
      if (req.method === 'GET' && p.startsWith('/img/')) return this.imagem(p.slice(5), false);
      if (req.method === 'POST' && p === '/mensagem') return await this.mensagem(req);
      if (p.startsWith('/admin/')) {
        if (!(await this.admin(req))) return erro('senha incorreta', 401);
        if (req.method === 'GET' && p === '/admin/lista') return json(this.listaAdmin());
        if (req.method === 'GET' && p.startsWith('/admin/img/')) return this.imagem(p.slice(11), true);
        if (req.method === 'POST' && p === '/admin/acao') return await this.acao(req);
        if (req.method === 'POST' && p === '/admin/patrocinio') return await this.patrocinio(req);
        if (req.method === 'POST' && p === '/admin/cfg') return await this.salvaCfg(req);
      }
      return erro('não encontrado', 404);
    } catch (e) {
      return erro('falha no servidor', 500);
    }
  }

  // limite por aparelho/rede: guarda só um hash do IP (com sal do dia), apagado depois de 1 hora
  async limite(req, tipo, janela, max) {
    const dia = new Date().toISOString().slice(0, 10);
    const k = tipo + ':' + (await sha(dia + '|' + (req.headers.get('x-ip') || '0'))).slice(0, 20), agora = Date.now();
    this.sql.exec('DELETE FROM lim WHERE t < ?', agora - 60 * 60e3);
    const n = this.sql.exec('SELECT COUNT(*) AS n FROM lim WHERE k = ? AND t > ?', k, agora - janela).one().n;
    if (n >= max) return false;
    this.sql.exec('INSERT INTO lim (k, t) VALUES (?, ?)', k, agora);
    return true;
  }

  cfg(k) { const r = this.sql.exec('SELECT v FROM cfg WHERE k = ?', k).toArray(); return r.length ? r[0].v : ''; }

  async avisa(texto) {
    const topico = this.cfg('ntfy');
    if (!topico) return;
    try {
      await fetch('https://ntfy.sh/' + topico, { method: 'POST', body: texto, headers: { Title: 'Mural: novo pedido', Tags: 'bell' }, signal: AbortSignal.timeout(4000) });
    } catch (e) { /* aviso é opcional */ }
  }

  pendentes(tipo) { return this.sql.exec("SELECT COUNT(*) AS n FROM itens WHERE tipo = ? AND status = 'pendente'", tipo).one().n; }

  async mensagem(req) {
    let d; try { d = await req.json(); } catch (e) { return erro('pedido inválido'); }
    if (d.site) return json({ ok: true }); // campo invisível preenchido: robô
    if (d.aceito !== true) return erro('é preciso aceitar as regras');
    const nome = limpa(d.nome, LIM.nome) || 'Anônimo', texto = limpa(d.texto, LIM.texto, true);
    if ([...texto].length < 3) return erro('mensagem muito curta');
    if (RE_LINK.test(texto) || RE_LINK.test(nome)) return erro('links e endereços de site não são permitidos');
    if (this.pendentes('msg') >= LIM.filaMsg) return erro('muitas mensagens na fila; tente mais tarde', 503);
    if (!(await this.limite(req, 'msg', LIM.msgJanela, LIM.msgMax))) return erro('muitas mensagens seguidas; espere alguns minutos', 429);
    const fixar = d.fixar === true ? 1 : 0, id = crypto.randomUUID(), ref = fixar ? 'MURAL' + codigo(6) : null;
    this.sql.exec("INSERT INTO itens (id, tipo, nome, texto, fixar, ref, status, criado) VALUES (?, 'msg', ?, ?, ?, ?, 'pendente', ?)", id, nome, texto, fixar, ref, Date.now());
    await this.avisa(fixar ? `Mensagem para FIXAR (R$ ${VALOR.fixar}), código ${ref}. Confira o PIX antes de aprovar.` : 'Nova mensagem esperando aprovação.');
    return json({ ok: true, ref, valor: fixar ? VALOR.fixar : 0 });
  }

  // patrocínio só entra pelo painel (lojas e empresas negociadas pelo dono; nada político)
  async patrocinio(req) {
    let f; try { f = await req.formData(); } catch (e) { return erro('pedido inválido'); }
    const nome = limpa(f.get('nome'), LIM.nome);
    if (!nome) return erro('informe o nome do patrocinador');
    let link = limpa(f.get('link') || '', LIM.link);
    if (link) {
      let u; try { u = new URL(link); } catch (e) { return erro('link inválido'); }
      if (u.protocol !== 'https:' || u.username || u.password) return erro('o link precisa começar com https://');
      link = u.href;
    }
    const arq = f.get('img');
    if (!arq || typeof arq === 'string') return erro('envie uma imagem');
    if (arq.size > LIM.img) return erro('imagem maior que 400 KB');
    const bytes = new Uint8Array(await arq.arrayBuffer()), tipo = tipoImagem(bytes);
    if (!tipo) return erro('a imagem precisa ser PNG, JPG ou WebP');
    const id = crypto.randomUUID(), agora = Date.now();
    this.sql.exec("INSERT INTO itens (id, tipo, nome, link, status, criado, aprovado, img, img_tipo) VALUES (?, 'pat', ?, ?, 'ok', ?, ?, ?, ?)", id, nome, link || null, agora, agora, bytes, tipo);
    this.publico = null;
    return json({ ok: true, id });
  }

  imagem(id, admin) {
    const r = this.sql.exec("SELECT img, img_tipo, status FROM itens WHERE id = ? AND tipo = 'pat'", id).toArray()[0];
    if (!r || (!admin && r.status !== 'ok')) return new Response('não encontrado', { status: 404 });
    return new Response(r.img, { headers: {
      'Content-Type': r.img_tipo, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'cross-origin', 'Cache-Control': admin ? 'no-store' : 'public, max-age=86400',
    } });
  }

  lista() {
    if (this.publico) return this.publico;
    const msgs = this.sql.exec(`SELECT id, nome, texto, fixar, aprovado FROM itens WHERE tipo = 'msg' AND status = 'ok'
      ORDER BY fixar DESC, aprovado DESC LIMIT ?`, LIM.mostraMsg).toArray().map((m) => ({ ...m, fixar: !!m.fixar }));
    const pats = this.sql.exec(`SELECT id, nome, link FROM itens WHERE tipo = 'pat' AND status = 'ok' ORDER BY aprovado LIMIT ?`, LIM.mostraPat).toArray()
      .map((x) => ({ ...x, img: '/img/' + x.id }));
    this.publico = { mensagens: msgs, patrocinios: pats };
    return this.publico;
  }

  listaAdmin() {
    const itens = this.sql.exec(`SELECT id, tipo, nome, texto, link, fixar, ref, status, criado, aprovado FROM itens
      ORDER BY status = 'pendente' DESC, COALESCE(aprovado, criado) DESC LIMIT 400`).toArray().map((x) => ({ ...x, fixar: !!x.fixar }));
    return { itens, ntfy: this.cfg('ntfy'), valor: VALOR };
  }

  async admin(req) {
    const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    // a senha tem 256 bits aleatórios: adivinhar por tentativa não é viável
    return tok.length >= 20 && !!this.env.ADMIN_HASH && crypto.subtle.timingSafeEqual(
      new TextEncoder().encode(await sha(tok)), new TextEncoder().encode(this.env.ADMIN_HASH));
  }

  async acao(req) {
    let d; try { d = await req.json(); } catch (e) { return erro('pedido inválido'); }
    const it = this.sql.exec('SELECT id, tipo, status FROM itens WHERE id = ?', String(d.id || '')).toArray()[0];
    if (!it) return erro('item não existe', 404);
    const agora = Date.now();
    switch (d.acao) {
      case 'aprovar': this.sql.exec("UPDATE itens SET status = 'ok', aprovado = COALESCE(aprovado, ?) WHERE id = ?", agora, it.id); break;
      case 'aprovar-sem-fixar': this.sql.exec("UPDATE itens SET status = 'ok', fixar = 0, aprovado = COALESCE(aprovado, ?) WHERE id = ?", agora, it.id); break;
      case 'fixar': this.sql.exec('UPDATE itens SET fixar = 1 WHERE id = ?', it.id); break;
      case 'desfixar': this.sql.exec('UPDATE itens SET fixar = 0 WHERE id = ?', it.id); break;
      case 'ocultar': this.sql.exec("UPDATE itens SET status = 'pendente' WHERE id = ?", it.id); break;
      case 'apagar': this.sql.exec('DELETE FROM itens WHERE id = ?', it.id); break; // recusar também apaga: nada fica guardado
      default: return erro('ação desconhecida');
    }
    this.publico = null;
    return json({ ok: true });
  }

  async salvaCfg(req) {
    let d; try { d = await req.json(); } catch (e) { return erro('pedido inválido'); }
    const t = String(d.ntfy || '');
    if (t && !/^[A-Za-z0-9_-]{16,64}$/.test(t)) return erro('tópico inválido (16 a 64 letras, números, - ou _)');
    this.sql.exec('INSERT INTO cfg (k, v) VALUES (\'ntfy\', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', t);
    if (t) await this.avisa('Teste: avisos do mural ligados.');
    return json({ ok: true });
  }
}
