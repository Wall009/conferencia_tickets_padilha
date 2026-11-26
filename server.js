const express = require('express');
const crypto = require('crypto');
const path = require('path');
const ExcelJS = require('exceljs');
const { Pool } = require('pg');
const { norm, classificar, lerPlanilha } = require('./lib');

const { DATABASE_URL, SESSION_SECRET, SENHA_OPERADOR, SENHA_VISUALIZADOR, PORT = 3000 } = process.env;
if (!DATABASE_URL || !SESSION_SECRET || SESSION_SECRET.length < 32) throw new Error('Defina DATABASE_URL e SESSION_SECRET (32+ caracteres).');
if (!SENHA_OPERADOR || !SENHA_VISUALIZADOR || SENHA_OPERADOR === SENHA_VISUALIZADOR ||
    Math.min(SENHA_OPERADOR.length, SENHA_VISUALIZADOR.length) < 10) throw new Error('Defina duas senhas diferentes, com 10+ caracteres.');

const db = new Pool({ connectionString: DATABASE_URL });
const app = express();
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'" });
  if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/jsqr.js', (_, res) => res.sendFile(require.resolve('jsqr')));

const sha = s => crypto.createHash('sha256').update(s).digest();
const iguais = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
// a assinatura inclui as senhas: trocar uma senha derruba as sessões antigas
const assinar = s => crypto.createHmac('sha256', SESSION_SECRET + SENHA_OPERADOR + SENHA_VISUALIZADOR).update(s).digest('base64url');
function sessao(req) {
  const t = /(?:^|; )s=([^;]+)/.exec(req.headers.cookie || '')?.[1];
  if (!t) return null;
  const [perfil, exp, sig] = t.split('.');
  if (!sig || !iguais(sig, assinar(`${perfil}.${exp}`)) || +exp < Date.now()) return null;
  return perfil;
}
const exigir = (...perfis) => (req, res, next) => {
  const p = sessao(req);
  if (!p) return res.status(401).json({ erro: 'Faça login.' });
  if (!perfis.includes(p)) return res.status(403).json({ erro: 'Sem permissão.' });
  req.perfil = p; next();
};
const todos = exigir('operador', 'visualizador'), operador = exigir('operador');
const rota = f => (req, res, next) => f(req, res).catch(next);

const falhas = new Map();
app.post('/api/login', (req, res) => {
  let f = falhas.get(req.ip);
  if (!f || Date.now() > f.ate) f = { n: 0, ate: Date.now() + 15 * 60000 };
  if (f.n >= 8) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde 15 minutos.' });
  const senha = String(req.body?.senha || '');
  const perfil = iguais(senha, SENHA_OPERADOR) ? 'operador' : iguais(senha, SENHA_VISUALIZADOR) ? 'visualizador' : null;
  if (!perfil) { f.n++; falhas.set(req.ip, f); return res.status(401).json({ erro: 'Senha incorreta.' }); }
  falhas.delete(req.ip);
  const corpo = `${perfil}.${Date.now() + 12 * 3600000}`;
  res.cookie('s', `${corpo}.${assinar(corpo)}`, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 12 * 3600000 });
  res.json({ perfil });
});
app.post('/api/sair', (_, res) => res.clearCookie('s').json({ ok: true }));
app.get('/api/eu', todos, (req, res) => res.json({ perfil: req.perfil }));

app.post('/api/importar', operador, express.raw({ type: 'application/octet-stream', limit: '15mb' }), rota(async (req, res) => {
  let linhas;
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.body);
    linhas = lerPlanilha(wb);
  } catch (e) { return res.status(400).json({ erro: /Planilha|Colunas|voucher/.test(e.message) ? e.message : 'Arquivo .xlsx inválido.' }); }
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query('LOCK TABLE vouchers IN SHARE ROW EXCLUSIVE MODE');
    await c.query('UPDATE vouchers SET na_ultima = false');
    await c.query(`INSERT INTO vouchers (codigo,pedido,viagem,cliente,residuo,situacao,detalhe,usado_em,na_ultima)
      SELECT codigo,pedido,viagem,cliente,residuo,situacao,detalhe,usado_em,true FROM jsonb_to_recordset($1::jsonb)
      AS x(codigo text,pedido int,viagem int,cliente text,residuo text,situacao text,detalhe text,usado_em date)
      ON CONFLICT (codigo) DO UPDATE SET pedido=excluded.pedido,viagem=excluded.viagem,cliente=excluded.cliente,
      residuo=excluded.residuo,situacao=excluded.situacao,detalhe=excluded.detalhe,usado_em=excluded.usado_em,na_ultima=true`,
      [JSON.stringify(linhas)]);
    const ausentes = (await c.query('SELECT count(*)::int n FROM vouchers WHERE NOT na_ultima')).rows[0].n;
    await c.query('INSERT INTO importacoes (total) VALUES ($1)', [linhas.length]);
    await c.query('COMMIT');
    res.json({ total: linhas.length, ausentes });
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}));

const SEL = `v.codigo AS cod_v, v.pedido, v.viagem, v.cliente, v.residuo, v.situacao, v.detalhe, v.na_ultima,
  to_char(v.usado_em,'YYYY-MM-DD') usado_em`;
const mascara = c => '••••' + c.slice(-4);
const item = r => ({ codigo: mascara(r.codigo || r.cod_v), cliente: r.cliente, pedido: r.pedido, viagem: r.viagem,
  residuo: r.residuo, situacao: r.situacao, detalhe: r.detalhe, lido_em: r.lido_em, repeticoes: r.repeticoes,
  resultado: classificar(r.cod_v ? r : null) });

app.post('/api/bipar', operador, rota(async (req, res) => {
  const codigo = norm(req.body?.texto);
  if (!/^[A-Z0-9]{20}$/.test(codigo)) return res.status(400).json({ erro: 'Este QR não é um voucher.' });
  if (!(await db.query('SELECT 1 FROM importacoes LIMIT 1')).rowCount) return res.status(409).json({ erro: 'Importe a planilha antes de bipar.' });
  // atômico: xmax = 0 indica inserção nova; senão o ticket já havia sido lido
  const l = (await db.query(`INSERT INTO leituras (codigo) VALUES ($1)
    ON CONFLICT (codigo) DO UPDATE SET repeticoes = leituras.repeticoes + 1
    RETURNING *, (xmax = 0) AS nova`, [codigo])).rows[0];
  const v = (await db.query(`SELECT ${SEL} FROM vouchers v WHERE codigo=$1`, [codigo])).rows[0];
  let grupo = null;
  if (v) grupo = (await db.query(`SELECT count(*) FILTER (WHERE v.situacao='Utilizado')::int utilizados,
    count(*) FILTER (WHERE v.situacao='Utilizado' AND l.codigo IS NOT NULL)::int conferidos
    FROM vouchers v LEFT JOIN leituras l USING (codigo) WHERE pedido=$1 AND cliente=$2 AND residuo=$3`,
    [v.pedido, v.cliente, v.residuo])).rows[0];
  res.json({ ...item({ ...v, ...l }), repetido: !l.nova, grupo });
}));

const dataValida = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s)) &&
  new Date(s).toISOString().startsWith(s) ? s : null;

// O período filtra a DATA DE USO. Divergências são sempre mostradas, de qualquer data.
async function montarPainel(desde, ate) {
  const lidos = (await db.query(`SELECT l.codigo, l.lido_em, l.repeticoes, ${SEL}
    FROM leituras l LEFT JOIN vouchers v USING (codigo) ORDER BY l.lido_em DESC`)).rows;
  const pend = (await db.query(`SELECT v.codigo, ${SEL} FROM vouchers v LEFT JOIN leituras l USING (codigo)
    WHERE v.situacao='Utilizado' AND l.codigo IS NULL ORDER BY v.cliente, v.pedido, v.residuo, v.viagem`)).rows;
  const noPeriodo = r => (!desde || (r.usado_em && r.usado_em >= desde)) && (!ate || (r.usado_em && r.usado_em <= ate));
  const ok = lidos.filter(r => r.cod_v && r.situacao === 'Utilizado' && noPeriodo(r));
  const div = lidos.filter(r => classificar(r.cod_v ? r : null) !== 'OK');
  const pendentes = pend.filter(noPeriodo);
  const grupos = new Map();
  const soma = (r, campo) => {
    const k = JSON.stringify([r.cliente, r.pedido, r.residuo]);
    if (!grupos.has(k)) grupos.set(k, { cliente: r.cliente, pedido: r.pedido, residuo: r.residuo, conferidos: 0, pendentes: [] });
    campo === 'ok' ? grupos.get(k).conferidos++ : grupos.get(k).pendentes.push(r.viagem);
  };
  ok.forEach(r => soma(r, 'ok')); pendentes.forEach(r => soma(r, 'p'));
  return { ok, div, pendentes, grupos: [...grupos.values()].sort((a, b) =>
    a.cliente.localeCompare(b.cliente, 'pt-BR') || a.pedido - b.pedido || a.residuo.localeCompare(b.residuo)) };
}

// o identificador liga voucher e leitura no navegador sem enviar o código completo
const ident = c => crypto.createHmac('sha256', SESSION_SECRET).update('id:' + c).digest('base64url').slice(0, 16);
const SIGLA = { Utilizado: 'U', 'Disponível': 'D', Cancelado: 'C' };

app.get('/api/versao', todos, rota(async (req, res) => {
  const imp = (await db.query('SELECT id, em, total FROM importacoes ORDER BY id DESC LIMIT 1')).rows[0] || null;
  const l = (await db.query('SELECT count(*)::int n, COALESCE(sum(repeticoes),0)::int r FROM leituras')).rows[0];
  res.json({ importacao: imp, leituras: l.n, repeticoes: l.r });
}));

// [pedido, viagem, cliente, resíduo, código mascarado, situação, uso, placa, observação, id]
app.get('/api/dados', todos, rota(async (req, res) => {
  const q = await db.query(`SELECT ${SEL} FROM vouchers v ORDER BY pedido, residuo, viagem`);
  res.json(q.rows.map(r => {
    const m = /^Utilizado em (\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2})(?:\s*\|\s*Placa:\s*([^|]*?))?\s*(?:\|\s*(.*))?$/.exec(r.detalhe || '');
    const obs = m ? m[6] || '' : r.detalhe === 'Aguardando utilização' ? '' : r.detalhe || '';
    return [r.pedido, r.viagem, r.cliente, r.residuo || '', mascara(r.cod_v), SIGLA[r.situacao] || '?',
      m ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}` : '', m?.[5] || '', obs, ident(r.cod_v)];
  }));
}));

app.get('/api/leituras', todos, rota(async (req, res) => {
  const q = await db.query(`SELECT l.codigo, l.lido_em, ${SEL} FROM leituras l LEFT JOIN vouchers v USING (codigo) ORDER BY l.lido_em DESC`);
  res.json(q.rows.map(r => ({ id: ident(r.codigo), codigo: mascara(r.codigo), lido_em: r.lido_em, resultado: classificar(r.cod_v ? r : null) })));
}));

const ROTULO = { OK: 'Conferido', DISPONIVEL: 'Chegou, mas consta Disponível', CANCELADO: 'Ticket cancelado',
  NAO_ENCONTRADO: 'Não está na planilha', SITUACAO_DESCONHECIDA: 'Situação desconhecida' };
app.get('/api/exportar', operador, rota(async (req, res) => {
  const desde = dataValida(req.query.desde), ate = dataValida(req.query.ate);
  const p = await montarPainel(desde, ate);
  const wb = new ExcelJS.Workbook();
  const aba = (nome, cab, linhas) => {
    const ws = wb.addWorksheet(nome);
    ws.addRow(cab).font = { bold: true };
    linhas.forEach(l => ws.addRow(l));
    ws.columns.forEach((c, i) => { c.width = [48, 10, 10, 16, 24, 16, 52, 30, 20, 12][i] || 18; });
    ws.views = [{ state: 'frozen', ySplit: 1 }]; ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cab.length } };
  };
  aba('Resumo por cliente', ['Cliente', 'Pedido', 'Resíduo', 'Conferidos', 'Pendentes', 'Viagens pendentes'],
    p.grupos.map(g => [g.cliente, g.pedido, g.residuo, g.conferidos, g.pendentes.length, g.pendentes.join(', ')]));
  const cab = ['Cliente', 'Pedido', 'Viagem', 'Resíduo', 'Código', 'Situação', 'Detalhe', 'Resultado', 'Lido em', 'Repetições'];
  const lin = (r, res_) => [r.cliente || '', r.pedido ?? '', r.viagem ?? '', r.residuo || '', r.codigo || r.cod_v,
    r.situacao || '', r.detalhe || '', res_, r.lido_em ? r.lido_em.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '', r.repeticoes ?? ''];
  aba('Conferidos', cab, p.ok.map(r => lin(r, ROTULO.OK)));
  aba('Pendentes', cab, p.pendentes.map(r => lin(r, 'Pendente de retorno')));
  aba('Divergencias', cab, p.div.map(r => lin(r, ROTULO[classificar(r.cod_v ? r : null)])));
  aba('Filtro', ['Uso desde', 'Uso até', 'Observação'], [[desde || 'tudo', ate || 'tudo', 'Divergências incluem todas as datas']]);
  res.attachment('conferencia-tickets.xlsx');
  await wb.xlsx.write(res); res.end();
}));

app.use((e, req, res, next) => { console.error(e.message); res.status(e.status || 500).json({ erro: 'Falha no servidor. Tente de novo.' }); });

db.query(`CREATE TABLE IF NOT EXISTS vouchers (codigo text PRIMARY KEY, pedido int NOT NULL, viagem int NOT NULL, cliente text NOT NULL,
    residuo text, situacao text, detalhe text, usado_em date, na_ultima boolean NOT NULL DEFAULT true);
  CREATE TABLE IF NOT EXISTS leituras (codigo text PRIMARY KEY, lido_em timestamptz NOT NULL DEFAULT now(), repeticoes int NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS importacoes (id serial PRIMARY KEY, em timestamptz NOT NULL DEFAULT now(), total int NOT NULL);`)
  .then(() => app.listen(PORT, () => console.log('No ar na porta ' + PORT)))
  .catch(e => { console.error(e); process.exit(1); });
