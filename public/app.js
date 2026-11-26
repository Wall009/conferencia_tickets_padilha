const $ = id => document.getElementById(id);
let perfil = null, timer = null, stream = null, audio = null, ocupado = false, ultimo = '', visto = 0, lidos = 0, trava = null;
async function api(url, op = {}) {
  const r = await fetch(url, { signal: AbortSignal.timeout(url.includes('importar') ? 90000 : 10000), ...op });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && perfil) { telaLogin(); }
  if (!r.ok) throw new Error(j.erro || 'Falha de comunicação.');
  return j;
}
const post = (u, b) => api(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

function telaLogin() { perfil = null; base = null; versao = ''; $('exportar').hidden = true; desligar(); clearTimeout(timer); $('app').hidden = true; $('sair').hidden = true; $('login').hidden = false; }
function entrar(p) {
  perfil = p; $('login').hidden = true; $('app').hidden = false; $('sair').hidden = false;
  const op = p === 'operador';
  $('sub').textContent = ''; $('abas').hidden = !op; $('importar').hidden = !op; $('exportar').hidden = !op;
  aba(op ? 'bipar' : 'painel');
}
function aba(a) {
  $('exportar').hidden = !(perfil === 'operador' && a === 'painel');
  $('bipar').hidden = a !== 'bipar'; $('painel').hidden = a !== 'painel';
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.aba === a));
  if (a !== 'bipar') desligar();
  clearTimeout(timer); if (a === 'painel') atualizar();
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => aba(b.dataset.aba));
$('login').onsubmit = async e => { e.preventDefault(); try { const r = await post('api/login', { senha: $('senha').value }); $('senha').value = ''; $('erroLogin').textContent = ''; entrar(r.perfil); } catch (x) { $('erroLogin').textContent = x.message; } };
$('sair').onclick = async () => { await post('api/sair', {}).catch(() => {}); telaLogin(); };

// um padrão de som por resultado
const SONS = { ok: [[1200, .09]], rep: [[600, .1], [600, .1]], aviso: [[450, .3], [450, .3]], erro: [[220, .8]] };
function som(t) {
  navigator.vibrate?.(t === 'ok' ? 60 : [200, 80, 200]);
  if (!audio) return;
  let q = audio.currentTime;
  for (const [f, d] of SONS[t]) { const o = audio.createOscillator(), g = audio.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.value = .15; o.connect(g).connect(audio.destination); o.start(q); o.stop(q + d); q += d + .07; }
}
const prepararSom = () => { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); };
function mostrar(tipo, txt) { $('resultado').className = tipo; $('resultado').textContent = txt; som(tipo); }

async function conferir(texto) {
  ocupado = true; $('resultado').className = ''; $('resultado').textContent = 'Conferindo…';
  try {
    const r = await post('api/bipar', { texto });
    const tipo = r.resultado !== 'OK' ? (r.resultado === 'DISPONIVEL' ? 'aviso' : 'erro') : r.repetido ? 'rep' : 'ok';
    let t = (r.repetido ? 'JÁ BIPADO, não conta de novo\n' : '') + (r.repetido && r.resultado === 'OK' ? '' : ROT[r.resultado]);
    if (r.cliente) t += `\n${r.cliente}\nPedido ${r.pedido} · Viagem ${r.viagem} · ${r.residuo}\n${r.detalhe}\nPedido: ${r.grupo.conferidos} de ${r.grupo.utilizados} utilizados conferidos`;
    t += `\nFinal ${r.codigo}`;
    if (!r.repetido) $('contador').textContent = ++lidos;
    mostrar(tipo, t.trim()); return true;
  } catch (x) { mostrar('erro', 'NÃO REGISTRADO. Bipe de novo.\n' + (x.name === 'TypeError' || x.name === 'TimeoutError' ? 'Sem conexão com o servidor.' : x.message)); return false; }
  finally { ocupado = false; }
}

const tela = document.createElement('canvas'), ctx = tela.getContext('2d', { willReadFrequently: true });
function quadro() {
  if (!stream) return;
  const v = $('video');
  if (v.videoWidth && !ocupado) {
    const lado = Math.min(v.videoWidth, v.videoHeight), n = Math.min(lado, 640);
    tela.width = tela.height = n;
    ctx.drawImage(v, (v.videoWidth - lado) / 2, (v.videoHeight - lado) / 2, lado, lado, 0, 0, n, n);
    const q = jsQR(ctx.getImageData(0, 0, n, n).data, n, n, { inversionAttempts: 'dontInvert' });
    if (q && q.data) {
      const agora = Date.now();
      // o mesmo QR parado na câmera conta uma vez; só vale de novo após sair por 2,5 s
      if (q.data !== ultimo || agora - visto > 2500) { ultimo = q.data; conferir(q.data).then(ok => { visto = Date.now(); if (!ok) setTimeout(() => ultimo = '', 2000); }); }
      visto = agora;
    }
  }
  setTimeout(quadro, 90);
}
async function ligar() {
  prepararSom();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } });
    $('video').srcObject = stream; await $('video').play(); $('camera').textContent = 'Desligar câmera';
    trava = await navigator.wakeLock?.request('screen').catch(() => null);
    quadro();
  } catch { desligar(); mostrar('erro', 'Não foi possível abrir a câmera. Use o endereço HTTPS e permita o acesso.'); }
}
function desligar() { stream?.getTracks().forEach(t => t.stop()); stream = null; trava?.release().catch(() => {}); trava = null; $('camera').textContent = 'Ligar câmera'; }
$('camera').onclick = () => stream ? desligar() : ligar();
document.addEventListener('visibilitychange', () => { if (document.hidden) desligar(); });
$('manual').onsubmit = async e => { e.preventDefault(); prepararSom(); if (!ocupado && await conferir($('codigo').value)) $('codigo').value = ''; };

let base = null, baseImp = null, versao = '', seq = 0;
// a cada 3 s consulta só a versão; a base completa é baixada apenas quando há nova importação
async function atualizar() {
  clearTimeout(timer); const n = ++seq;
  try {
    const v = await api('api/versao');
    if (n !== seq) return;
    const chave = JSON.stringify(v);
    if (chave !== versao) {
      const imp = v.importacao?.id ?? 0;
      const b = !base || imp !== baseImp ? await api('api/dados') : base;
      const l = await api('api/leituras');
      if (n !== seq || !perfil) return;
      base = b; baseImp = imp; aplicarDados(base, l); versao = chave;
    }
    $('status').className = 'msg';
    $('status').textContent = (v.importacao ? `Planilha: ${new Date(v.importacao.em).toLocaleString('pt-BR')} (${v.importacao.total} vouchers)` : 'Nenhuma planilha importada.') + ` · Verificado às ${new Date().toLocaleTimeString('pt-BR')}`;
  } catch (x) { if (n === seq) { $('status').className = 'msg falha'; $('status').textContent = 'Painel desatualizado: sem conexão.'; } }
  if (n === seq && perfil && !$('painel').hidden) timer = setTimeout(atualizar, 3000);
}
$('exportar').onclick = () => { location.href = 'api/exportar?' + new URLSearchParams({ desde: $('d1').value, ate: $('d2').value }); };
$('arquivo').onchange = async () => {
  const f = $('arquivo').files[0]; if (!f) return;
  const m = $('msgImp'); m.className = 'msg'; m.textContent = 'Importando…';
  try { const r = await api('api/importar', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: f });
    m.textContent = `${r.total} vouchers importados.` + (r.ausentes ? ` Atenção: ${r.ausentes} da base anterior não vieram nesta planilha (foram mantidos como estavam).` : ''); atualizar(); }
  catch (x) { m.className = 'msg falha'; m.textContent = x.message; }
  $('arquivo').value = '';
};
api('api/eu').then(r => entrar(r.perfil)).catch(telaLogin);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
