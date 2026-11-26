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

function lerPlanilha(wb) {
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Planilha vazia.');
  const col = {};
  ws.getRow(1).eachCell((c, i) => { col[texto(c)] = i; });
  const req = ['Pedido / viagem', 'Cliente', 'Resíduo', 'Código', 'Situação', 'Detalhe'];
  const falta = req.filter(n => !col[n]);
  if (falta.length) throw new Error('Colunas ausentes: ' + falta.join(', '));
  const linhas = [], vistos = new Set(), erros = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const g = k => texto(row.getCell(col[k]));
    if (req.every(k => !g(k))) return;
    const codigo = norm(g('Código'));
    const pv = /^(\d+)\s*\/\s*(\d+)$/.exec(g('Pedido / viagem'));
    if (!codigo || !pv) return erros.push(`linha ${n}: código ou pedido/viagem inválido`);
    if (vistos.has(codigo)) return erros.push(`linha ${n}: código repetido`);
    vistos.add(codigo);
    linhas.push({ codigo, pedido: +pv[1], viagem: +pv[2], cliente: g('Cliente'), residuo: g('Resíduo'),
      situacao: g('Situação'), detalhe: g('Detalhe'), usado_em: dataUso(g('Detalhe')) });
  });
  // importação é tudo ou nada: planilha com erro não é aplicada pela metade
  if (erros.length) throw new Error('Planilha não importada. ' + erros.slice(0, 5).join('; '));
  if (!linhas.length) throw new Error('Nenhum voucher encontrado.');
  return linhas;
}
module.exports = { norm, classificar, lerPlanilha };
