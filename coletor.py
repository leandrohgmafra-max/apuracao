#!/usr/bin/env python3
"""Coletor da apuração ao vivo (2º turno 2026): lê o TSE, calcula as projeções e grava a série no tempo.

Roda no GitHub Actions (.github/workflows/coletor.yml) e publica em dados/ deste ramo (ao-vivo):
  dados/projecao.json  estado atual: apurado, projeções de cada modelo, faixa de 95%, chance de vitória
  dados/serie.json     um ponto por divulgação do TSE, para a linha do tempo do site
Modelos (premissas que o usuário escolhe no site):
  simples  extrapolação: o que falta vota igual ao que já foi apurado
  mun      cada município mantém o seu resultado parcial; os que não começaram seguem o estado
  t1       variação (swing logístico) sobre o 1º turno de 2026, por município
  t22      variação sobre o 2º turno de 2022, por município (só presidente)
  sec      variação sobre o 1º turno de 2026 seção a seção, sabendo quais seções já chegaram (só presidente)
Uso: python3 -I coletor.py [--uma-vez]
"""
import gzip, io, json, math, os, subprocess, sys, time, urllib.error, urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

TSE = 'https://resultados.tse.jus.br/oficial/ele2026'
PRES, GOV, PLEITO = os.environ.get('EL_P', '6258'), os.environ.get('EL_G', '6260'), os.environ.get('PLEITO', '3221')
UFS = ['ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms', 'mg', 'pr', 'pb', 'pa', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'se', 'sp', 'to']
GOV_UFS = ['ac', 'am', 'df', 'es', 'rn', 'to']
AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.environ.get('SAIDA') or os.path.join(AQUI, 'dados')
# erro sistemático assumido para o voto que falta (fração do voto válido), por modelo
PRIOR = {'simples': 0.05, 'mun': 0.035, 't1': 0.02, 't22': 0.025, 'sec': 0.015}
NOMES = {'simples': 'Extrapolação simples', 'mun': 'Por município', 't1': 'Variação sobre o 1º turno 2026', 't22': 'Variação sobre o 2º turno 2022', 'sec': 'Por seção (1º turno 2026)'}


# ---------- HTTP ----------
def pega(url, tentativas=3):
    for i in range(tentativas):
        try:
            rq = urllib.request.Request(url, headers={'Accept-Encoding': 'gzip', 'User-Agent': 'apuracao-coletor'})
            with urllib.request.urlopen(rq, timeout=25) as r:
                b = r.read()
                if r.headers.get('Content-Encoding') == 'gzip':
                    b = gzip.decompress(b)
                return json.loads(b)
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                return None
        except Exception:
            pass
        time.sleep(1 + i)
    return None


POOL = ThreadPoolExecutor(24)


def varios(urls):
    return list(POOL.map(pega, urls))


# ---------- leitura ----------
def le_u(d):
    if not d:
        return None
    votos = {}
    for a in d['carg'][0]['agr']:
        for p in a['par']:
            for c in p['cand']:
                votos[c['n']] = int(c['vap'] or 0)
    nomes = {c['n']: c['nmu'] for a in d['carg'][0]['agr'] for p in a['par'] for c in p['cand']}
    return {'v': votos, 'nomes': nomes, 'vv': int(d['v']['vv'] or 0), 'st': int(d['s']['st'] or 0), 'ts': int(d['s']['ts'] or 0),
            'te': int(d['e']['te'] or 0), 'est': int(d['e'].get('est') or 0), 'hora': d.get('dg', '') + ' ' + d.get('hg', '')}


def url_u(el, uf, mun=''):
    cargo = '0001' if el == PRES else '0003'
    return f'{TSE}/{el}/dados/{uf}/{uf}{mun}-c{cargo}-e{int(el):06d}-u.json'


def le_base():
    b = json.load(open(os.path.join(AQUI, 'base', 'base_mun.json')))
    sec = defaultdict(dict)  # mun -> {(zona, secao): (a1, b1, validos1)}
    with gzip.open(os.path.join(AQUI, 'base', 'base_secao_2026_1.csv.gz'), 'rt') as f:
        for ln in f:
            uf, mun, z, s, a, bb, o, bn = ln.rstrip('\n').split(';')
            a, bb, o = int(a), int(bb), int(o)
            sec[mun][(int(z), int(s))] = (a, bb, a + bb + o)
    return b, sec


# ---------- modelo ----------
def lg(p):
    p = min(max(p, 0.002), 0.998)
    return math.log(p / (1 - p))


def il(x):
    return 1 / (1 + math.exp(-x))


def phi(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def projeta(unidades, A, B, modelos, total_st, total_ts):
    """unidades: lista de dicts {cod, grupo, te, est, st, ts, a, b, vv, q1, base: {t1: share, t22: share}, sec: {...}}.
    Devolve {modelo: resultado}."""
    cont = [u for u in unidades if u['vv'] > 0]
    A0, B0 = sum(u['a'] for u in unidades), sum(u['b'] for u in unidades)
    V0 = A0 + B0
    P = A0 / V0 if V0 else 0.5
    # participação (válidos / eleitorado) prevista para quem não apurou: 1º turno × razão observada
    def razao(us):
        num = sum(u['vv'] for u in us if u['est'] > 0 and u['q1'])
        den = sum(u['q1'] * u['est'] for u in us if u['est'] > 0 and u['q1'])
        return num / den if den > 0 and num > 0 else None
    kap_tot = razao(cont) or 0.97
    grupos = defaultdict(list)
    for u in unidades:
        grupos[u['grupo']].append(u)
    kap_g = {g: (razao([u for u in us if u['vv'] > 0]) or kap_tot) for g, us in grupos.items()}
    P_g = {}
    for g, us in grupos.items():
        a, v = sum(u['a'] for u in us), sum(u['vv'] for u in us)
        P_g[g] = (a + 5000 * P) / (v + 5000) if v else P

    for u in unidades:
        q1 = u['q1'] or 0.75
        q_prev = q1 * kap_g[u['grupo']]
        q_own = u['vv'] / u['est'] if u['est'] > 0 and u['vv'] > 0 else None
        f = u['est'] / u['te'] if u['te'] else 0
        u['q'] = q_own if q_own is not None and f >= 0.05 else q_prev
        u['R'] = max(0, u['te'] - u['est']) * u['q']

    def swing(chave, peso_own=1000):
        """δ por grupo (logit), encolhido para o total; devolve função p_rem(u) e p_sem_proprio(u)."""
        def dif(u):
            b = u['base'].get(chave)
            if b is None or u['vv'] <= 0:
                return None
            return lg(u['a'] / u['vv']) - lg(b)
        W = defaultdict(float); S = defaultdict(float)
        for u in cont:
            d = dif(u)
            if d is None:
                continue
            W[u['grupo']] += u['vv']; S[u['grupo']] += u['vv'] * d
        Wt, St = sum(W.values()), sum(S.values())
        d_tot = St / Wt if Wt else 0.0
        d_g = {g: (S[g] + 20000 * d_tot) / (W[g] + 20000) for g in grupos}
        def sem_proprio(u):
            b = u['base'].get(chave)
            if b is None:
                return P_g[u['grupo']]
            return il(lg(b) + d_g[u['grupo']])
        def rem(u):
            b = u['base'].get(chave)
            if b is None:
                return (u['a'] + 300 * P_g[u['grupo']]) / (u['vv'] + 300) if u['vv'] else P_g[u['grupo']]
            d = dif(u)
            dm = d_g[u['grupo']] if d is None else (u['vv'] * d + peso_own * d_g[u['grupo']]) / (u['vv'] + peso_own)
            return il(lg(b) + dm)
        return rem, sem_proprio, d_tot

    out = {}
    for m in modelos:
        Rs = {}
        if m == 'simples':
            rem = lambda u: P; sem = lambda u: P
        elif m == 'mun':
            rem = lambda u: (u['a'] + 300 * P_g[u['grupo']]) / (u['vv'] + 300) if u['vv'] else P_g[u['grupo']]
            sem = lambda u: P_g[u['grupo']]
        elif m in ('t1', 't22'):
            rem, sem, _ = swing(m)
        elif m == 'sec':
            rem, sem, Rs = modelo_secao(unidades, grupos, P_g, kap_g)
        A1 = A0; V1 = V0; var_i = 0.0; Rt = 0.0
        # resíduo: quanto o modelo erra nos municípios já apurados, sem usar o próprio resultado
        sw = se = 0.0
        for u in cont:
            e = u['a'] / u['vv'] - sem(u)
            sw += u['vv']; se += u['vv'] * e * e
        s = min(max(math.sqrt(se / sw) if sw else 0.12, 0.01), 0.3)
        por_g = defaultdict(lambda: [0.0, 0.0])
        for u in unidades:
            R = Rs.get(u['cod'], u['R']) if m == 'sec' else u['R']
            if R <= 0:
                continue
            p = rem(u)
            A1 += R * p; V1 += R; Rt += R
            fr = 1 - (u['est'] / u['te'] if u['te'] else 0)
            var_i += R * R * s * s * fr
            g = por_g[u['grupo']]; g[0] += R; g[1] += R * p
        p = A1 / V1 if V1 else 0.5
        fr_rest = Rt / V1 if V1 else 1
        sis = PRIOR[m] * fr_rest + 0.04 * fr_rest ** 4
        sig = math.sqrt(var_i / V1 ** 2 + sis ** 2) if V1 else 0.1
        ch = phi((p - 0.5) / sig) if sig > 1e-9 else (1.0 if p > 0.5 else 0.0 if p < 0.5 else 0.5)
        out[m] = {'p': round(p, 5), 'lo': round(max(0, p - 1.96 * sig), 5), 'hi': round(min(1, p + 1.96 * sig), 5), 'ch': round(ch, 4),
                  'va': round(A1), 'vb': round(V1 - A1), 'R': round(Rt), 's': round(s, 4),
                  'onde': sorted([[g, round(r), round(ra / r, 4)] for g, (r, ra) in por_g.items() if r > 0], key=lambda x: -x[1])[:12]}
    lead = A0 - B0
    return {'a': A0, 'b': B0, 'vv': V0, 'st': total_st, 'ts': total_ts, 'A': A, 'B': B, 'lead': lead, 'm': out}


SEC_LIVE = {}  # mun -> set((zona, secao)) recebidas (arquivo-urna cs do 2º turno)
BASE_SEC = {}
INVERTE = False  # base por seção é (13, 22); True quando o candidato A é o 22


def modelo_secao(unidades, grupos, P_g, kap_g):
    """Seções que faltam projetadas pelo seu 1º turno + variação observada nas seções já apuradas do mesmo município."""
    W = defaultdict(float); S = defaultdict(float); K = defaultdict(lambda: [0.0, 0.0]); info = {}
    for u in unidades:
        bs = BASE_SEC.get(u['cod'])
        rec = SEC_LIVE.get(u['cod'])
        if not bs:
            continue
        if u['vv'] > 0 and rec:
            ca = sum(bs[k][0] for k in rec if k in bs); cb = sum(bs[k][1] for k in rec if k in bs); cv = sum(bs[k][2] for k in rec if k in bs)
            if INVERTE:
                ca, cb = cb, ca
            if ca + cb > 0 and cv > 0:
                d = lg(u['a'] / u['vv']) - lg((ca + 0.5) / (ca + cb + 1))
                info[u['cod']] = (d, u['vv'] / cv)
                W[u['grupo']] += u['vv']; S[u['grupo']] += u['vv'] * d
                K[u['grupo']][0] += u['vv']; K[u['grupo']][1] += cv
    Wt, St = sum(W.values()), sum(S.values())
    d_tot = St / Wt if Wt else 0.0
    d_g = {g: (S[g] + 20000 * d_tot) / (W[g] + 20000) for g in grupos}
    kt = sum(k[0] for k in K.values()) / max(1, sum(k[1] for k in K.values())) if K else 0.97
    k_g = {g: (K[g][0] + 50000 * kt) / (K[g][1] + 50000) if K[g][1] else kt for g in grupos}
    Rs, Ps = {}, {}
    for u in unidades:
        bs = BASE_SEC.get(u['cod'])
        if not bs:
            continue
        rec = SEC_LIVE.get(u['cod']) or set()
        if u['st'] >= u['ts'] > 0:
            Rs[u['cod']] = 0; continue
        d, kap = info.get(u['cod'], (None, None))
        n = u['vv']
        dm = d_g[u['grupo']] if d is None else (n * d + 1000 * d_g[u['grupo']]) / (n + 1000)
        kap = kap if kap else k_g[u['grupo']]
        R = A = 0.0
        for k, (a, b, v) in bs.items():
            if INVERTE:
                a, b = b, a
            if k in rec:
                continue
            w = v * kap
            R += w; A += w * il(lg((a + 0.5) / (a + b + 1)) + dm)
        Rs[u['cod']] = R; Ps[u['cod']] = A / R if R else 0.5

    def rem(u):
        if u['cod'] in Ps:
            return Ps[u['cod']]
        return (u['a'] + 300 * P_g[u['grupo']]) / (u['vv'] + 300) if u['vv'] else P_g[u['grupo']]

    def sem(u):
        b = u['base'].get('t1')
        return il(lg(b) + d_g[u['grupo']]) if b is not None else P_g[u['grupo']]
    return rem, sem, Rs


# ---------- ciclo ----------
class Coletor:
    def __init__(self):
        self.base, BASE_SEC_ = le_base()
        BASE_SEC.update(BASE_SEC_)
        self.cfg = {}
        self.mun = {PRES: {}, GOV: {}}      # el -> mun -> leitura do u
        self.ab = {PRES: {}, GOV: {}}       # el -> mun -> (st, ts, te, est)
        self.ultimo_st = {PRES: {}, GOV: {}}
        self.cs_t = 0
        os.makedirs(SAIDA, exist_ok=True)
        try:
            self.serie = json.load(open(os.path.join(SAIDA, 'serie.json')))
        except Exception:
            self.serie = []

    def config(self, el):
        if el not in self.cfg:
            d = pega(f'{TSE}/{el}/config/mun-e{int(el):06d}-cm.json')
            if not d:
                return None
            self.cfg[el] = {a['cd']: [m['cd'] for m in a['mu']] for a in d['abr']}
        return self.cfg[el]

    def le_ab(self, el, ufs):
        ds = varios([f'{TSE}/{el}/dados/{uf}/{uf}-e{int(el):06d}-ab.json' for uf in ufs])
        ok = 0
        for uf, d in zip(ufs, ds):
            if not d:
                continue
            ok += 1
            for a in d.get('abr', []):
                if a.get('tpabr') != 'mun':
                    continue
                s, e = a['s'], a['e']
                self.ab[el][a['cdabr']] = (int(s['st'] or 0), int(s['ts'] or 0), int(e['te'] or 0), int(e.get('est') or 0))
        return ok == len(ufs)

    def le_municipios(self, el, ufs, ab_ok):
        cfg = self.cfg[el]
        alvo = []
        for uf in ufs:
            for m in cfg.get(uf, []):
                st = self.ab[el].get(m, (None,))[0]
                if ab_ok:
                    if st and st != self.ultimo_st[el].get(m):
                        alvo.append((uf, m, st))
                else:
                    alvo.append((uf, m, None))
        ds = varios([url_u(el, uf, m) for uf, m, _ in alvo])
        for (uf, m, st), d in zip(alvo, ds):
            r = le_u(d)
            if r:
                self.mun[el][m] = r
                self.ultimo_st[el][m] = st if st is not None else r['st']
        return len(alvo)

    def le_secoes(self):
        ds = varios([f'{TSE}/arquivo-urna/{PLEITO}/config/{uf}/{uf}-p00{PLEITO}-cs.json' for uf in UFS + ['zz']])
        n = 0
        for d in ds:
            if not d:
                continue
            for a in d.get('abr', []):
                for m in a.get('mu', []):
                    rec = set()
                    for z in m.get('zon', []):
                        for s in z.get('sec', []):
                            if s.get('ha'):
                                rec.add((int(z['cd']), int(s['ns'])))
                    SEC_LIVE[m['cd']] = rec; n += len(rec)
        return n

    def unidades(self, el, ufs):
        out = []
        for uf in ufs:
            for m in self.cfg[el].get(uf, []):
                ab = self.ab[el].get(m)
                r = self.mun[el].get(m)
                bm = self.base['p'].get(m) if el == PRES else None
                bg = self.base['g'].get(uf.upper(), {}).get(m) if el == GOV else None
                if ab:
                    st, ts, te, est = ab
                elif r:
                    st, ts, te, est = r['st'], r['ts'], r['te'], r['est']
                else:
                    st, ts, est = 0, 0, 0
                    te = (bm[3] if bm and bm[3] else bg[0] if bg else 0)
                u = {'cod': m, 'uf': uf.upper(), 'grupo': uf.upper() if el == PRES else m, 'te': te, 'est': est, 'st': st, 'ts': ts, 'a': 0, 'b': 0, 'vv': 0, 'base': {}, 'q1': None, 'r': r}
                if el == PRES and bm:
                    if bm[2] and bm[3]:
                        u['q1'] = bm[2] / bm[3]
                    # bases guardadas como fatia do 13 contra o 22; corrida() inverte se o candidato A for o 22
                    if bm[0] is not None and bm[0] + bm[1] > 0:
                        u['base']['t1'] = bm[0] / (bm[0] + bm[1])
                    if bm[4] is not None and bm[4] + bm[5] > 0:
                        u['base']['t22'] = bm[4] / (bm[4] + bm[5])
                if el == GOV and bg:
                    u['q1'] = bg[1] / bg[0] if bg[0] else None
                    u['bg'] = bg[2]
                out.append(u)
        return out

    def corrida(self, el, ufs, topo):
        """Calcula uma disputa (presidente no Brasil ou governador num estado)."""
        if not topo:
            return None
        ns = sorted(topo['v'], key=lambda n: (-topo['v'][n], n))
        if len(ns) < 2:
            return None
        A, B = ns[0], ns[1]
        if topo['v'][A] == topo['v'][B]:
            A, B = sorted([A, B])
        us = self.unidades(el, ufs)
        for u in us:
            r = u.pop('r')
            if r:
                u['a'], u['b'] = r['v'].get(A, 0), r['v'].get(B, 0)
                u['vv'] = u['a'] + u['b']
                if not self.ab[el].get(u['cod']):
                    u['st'], u['ts'], u['te'], u['est'] = r['st'], r['ts'], r['te'], r['est']
            bg = u.pop('bg', None)
            if bg:
                a1, b1 = bg.get(A, 0), bg.get(B, 0)
                if a1 + b1 > 0:
                    u['base']['t1'] = a1 / (a1 + b1)
        if el == PRES:
            modelos = ['simples', 'mun', 't1', 't22', 'sec']
            if {A, B} != {'13', '22'}:
                modelos = ['simples', 'mun']
            elif A == '22':
                for u in us:
                    u['base'] = {k: 1 - v for k, v in u['base'].items()}
            global INVERTE
            INVERTE = A == '22'
        else:
            modelos = ['simples', 'mun', 't1']
            # no governador o grupo é a microrregião não disponível; usa o estado inteiro como grupo
            for u in us:
                u['grupo'] = u['uf']
        res = projeta(us, A, B, modelos, topo['st'], topo['ts'])
        res['nomes'] = {A: topo['nomes'].get(A, A), B: topo['nomes'].get(B, B)}
        res['hora'] = topo['hora']
        res['te'] = topo['te']; res['est'] = topo['est']
        # coerência: o topo do TSE manda nos votos apurados
        res['a_tse'], res['b_tse'] = topo['v'].get(A, 0), topo['v'].get(B, 0)
        return res

    def ciclo(self):
        t0 = time.time()
        if not self.config(PRES) or not self.config(GOV):
            print('sem config do TSE', flush=True); return None
        tops = varios([url_u(PRES, 'br')] + [url_u(GOV, uf) for uf in GOV_UFS])
        tops = [le_u(d) for d in tops]
        ab_p = self.le_ab(PRES, UFS + ['zz'])
        ab_g = self.le_ab(GOV, GOV_UFS)
        # sem o arquivo de abrangência é preciso ler todos os municípios; antes da apuração começar não há o que ler
        n_p = self.le_municipios(PRES, UFS + ['zz'], ab_p) if ab_p or (tops[0] and tops[0]['st']) else 0
        n_g = self.le_municipios(GOV, GOV_UFS, ab_g) if ab_g or any(t and t['st'] for t in tops[1:]) else 0
        n_s = 0
        if time.time() - self.cs_t > 110:
            n_s = self.le_secoes(); self.cs_t = time.time()
        corr = {'br': self.corrida(PRES, UFS + ['zz'], tops[0])}
        for uf, tp in zip(GOV_UFS, tops[1:]):
            corr[uf] = self.corrida(GOV, [uf], tp)
        estado = {'gerado': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'modelos': NOMES, 'secoes_recebidas': sum(len(v) for v in SEC_LIVE.values()),
                  'ab': [ab_p, ab_g], 'corridas': corr}
        print(f"{estado['gerado']} br {tops[0]['st'] if tops[0] else '?'}/{tops[0]['ts'] if tops[0] else '?'} mun lidos {n_p}+{n_g} seções {estado['secoes_recebidas']} ({time.time() - t0:.0f}s)", flush=True)
        return estado

    def grava(self, est):
        hora = {k: v['hora'] for k, v in est['corridas'].items() if v}
        if not self.serie or self.serie[-1].get('h') != hora:
            ponto = {'h': hora, 't': est['gerado'], 'c': {}}
            for k, v in est['corridas'].items():
                if v:
                    ponto['c'][k] = {'st': v['st'], 'ts': v['ts'], 'a': v['a_tse'], 'b': v['b_tse'], 'A': v['A'], 'B': v['B'],
                                     'm': {m: [x['p'], x['lo'], x['hi'], x['ch']] for m, x in v['m'].items()}}
            self.serie.append(ponto)
        est['n_serie'] = len(self.serie)
        json.dump(est, open(os.path.join(SAIDA, 'projecao.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
        json.dump(self.serie, open(os.path.join(SAIDA, 'serie.json'), 'w'), ensure_ascii=False, separators=(',', ':'))


def publica(msg):
    if os.environ.get('SEM_GIT'):
        return
    subprocess.run(['git', 'add', 'dados'], cwd=AQUI)
    if subprocess.run(['git', 'diff', '--cached', '--quiet'], cwd=AQUI).returncode == 0:
        return
    subprocess.run(['git', 'commit', '-q', '-m', msg], cwd=AQUI)
    for i in range(4):
        subprocess.run(['git', 'pull', '-q', '--rebase', 'origin', 'ao-vivo'], cwd=AQUI)
        if subprocess.run(['git', 'push', '-q', 'origin', 'HEAD:ao-vivo'], cwd=AQUI).returncode == 0:
            return
        time.sleep(2 ** (i + 1))


def main():
    uma = '--uma-vez' in sys.argv
    c = Coletor()
    inicio = time.time(); completo_desde = None
    while True:
        t = time.time()
        try:
            est = c.ciclo()
            if est:
                c.grava(est)
                publica('Apuração ' + est['gerado'])
                br = est['corridas'].get('br')
                fim = all(v and v['ts'] and v['st'] >= v['ts'] for v in est['corridas'].values())
                completo_desde = (completo_desde or time.time()) if fim else None
        except Exception as e:
            print('erro no ciclo:', repr(e), flush=True)
        if uma or time.time() - inicio > 5.6 * 3600 or (completo_desde and time.time() - completo_desde > 900):
            break
        time.sleep(max(5, 45 - (time.time() - t)))


if __name__ == '__main__':
    main()
