const norm = s => String(s || '').trim().toUpperCase().replace(/^BF1:/, '').replace(/[^A-Z0-9]/g, '');

// Situação no sistema -> resultado da conferência de um ticket que chegou
function classificar(v) {
  if (!v) return 'NAO_ENCONTRADO';
  if (v.situacao === 'Utilizado') return 'OK';
  if (v.situacao === 'Cancelado') return 'CANCELADO';
  if (v.situacao === 'Disponível') return 'DISPONIVEL';
  return 'SITUACAO_DESCONHECIDA';
}

function dataUso(detalhe) {
  const m = /Utilizado em (\d{2})\/(\d{2})\/(\d{4})/.exec(detalhe || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

const texto = c => String(c.text ?? '').trim();
const dois = n => String(n).padStart(2, '0');
// o Excel guarda a hora "de relógio"; o ExcelJS a entrega nos campos UTC
function dataHora(v) {
  if (v instanceof Date && !isNaN(v)) return `${dois(v.getUTCDate())}/${dois(v.getUTCMonth() + 1)}/${v.getUTCFullYear()} ${dois(v.getUTCHours())}:${dois(v.getUTCMinutes())}`;
  return /^(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})(:\d{2})?$/.exec(String(v || '').trim())?.[1] || null;
}

// aceita "16 / 42" (formato antigo) e "PED-000016 · 42/50" (formato novo)
function pedidoViagem(s) {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(s) || /^PED-(\d+)\s*·\s*(\d+)\s*\/\s*\d+$/i.exec(s);
  return m ? { pedido: +m[1], viagem: +m[2] } : null;
}

function lerPlanilha(wb) {
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Planilha vazia.');
  const col = {};
  ws.getRow(1).eachCell((c, i) => { col[texto(c)] = i; });
  const req = ['Pedido / viagem', 'Cliente', 'Resíduo', 'Código', 'Situação', 'Detalhe'];
  const falta = req.filter(n => !col[n]);
  if (falta.length) throw new Error('Colunas ausentes: ' + falta.join(', '));
  const novo = !!(col['Utilizado em'] || col['Placa']);
  if (novo && !(col['Utilizado em'] && col['Placa'])) throw new Error('Colunas ausentes: Utilizado em e Placa devem vir juntas');
  const linhas = [], vistos = new Set(), erros = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const g = k => texto(row.getCell(col[k]));
    if (req.every(k => !g(k))) return;
    const codigo = norm(g('Código'));
    const pv = pedidoViagem(g('Pedido / viagem'));
    if (!codigo || !pv) return erros.push(`linha ${n}: código ou pedido/viagem inválido`);
    if (vistos.has(codigo)) return erros.push(`linha ${n}: código repetido`);
    vistos.add(codigo);
    const situacao = g('Situação');
    let detalhe = g('Detalhe');
    if (novo && situacao === 'Utilizado') {
      const quando = dataHora(row.getCell(col['Utilizado em']).value);
      if (!quando) return erros.push(`linha ${n}: "Utilizado em" vazio ou inválido`);
      const obs = detalhe === 'Entrada registrada' ? '' : detalhe;
      detalhe = `Utilizado em ${quando} | Placa: ${g('Placa')}` + (obs ? ` | ${obs}` : '');
    }
    linhas.push({ codigo, ...pv, cliente: g('Cliente'), residuo: g('Resíduo'), situacao, detalhe, usado_em: dataUso(detalhe) });
  });
  // importação é tudo ou nada: planilha com erro não é aplicada pela metade
  if (erros.length) throw new Error('Planilha não importada. ' + erros.slice(0, 5).join('; '));
  if (!linhas.length) throw new Error('Nenhum voucher encontrado.');
  return linhas;
}
module.exports = { norm, classificar, lerPlanilha };
