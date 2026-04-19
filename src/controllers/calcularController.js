const {
  calcularPreco,
  calcularTaxaMP,
  DESCONTO_BULK_MIN_QTD,
  DESCONTO_BULK_POR_PESSOA,
  getPrecoPorPessoa,
} = require('../services/precoService');
const {
  buscarCuponsParaUso,
  aplicarCupons,
} = require('../services/cupomService');
const { buscarSlot } = require('../services/slotService');
const {
  validarQuantidade,
  ValidationError,
} = require('../utils/validators');

function parseDataParaCalculo(dataISO) {
  if (!dataISO) return new Date();
  const [y, m, d] = dataISO.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function coletarCodigosDeEntrada(body) {
  if (Array.isArray(body.cupons)) return body.cupons;
  if (body.cupom) return [body.cupom];
  return [];
}

async function calcular(req, res, next) {
  try {
    const quantidade = validarQuantidade(req.body.quantidade);
    const codigos = coletarCodigosDeEntrada(req.body);
    const slotId = req.body.slot_id;

    let dataBase = new Date();
    let slotResumo = null;
    let precoOverride = null;

    if (slotId) {
      const slot = await buscarSlot(String(slotId));
      if (!slot) throw new ValidationError('Horário não encontrado.');
      dataBase = parseDataParaCalculo(slot.data);
      precoOverride = slot.preco_por_pessoa || null;
      slotResumo = { data: slot.data, hora: slot.hora, status: slot.status };
    }

    const {
      precoPorPessoa,
      precoPorPessoaBase,
      subtotal,
      descontoBulk,
      bulkAplicado,
      descontoBulkPorPessoa,
      fimDeSemana,
    } = calcularPreco(quantidade, dataBase, precoOverride);

    const cupons = await buscarCuponsParaUso(codigos, quantidade);
    const { desconto, total: totalAposCupom, cuponsAplicados } = aplicarCupons(
      subtotal,
      cupons
    );

    const taxaMP = calcularTaxaMP(totalAposCupom);
    const total = Math.round((totalAposCupom + taxaMP) * 100) / 100;

    return res.json({
      quantidade,
      preco_por_pessoa: precoPorPessoa,
      preco_por_pessoa_base: precoPorPessoaBase,
      preco_padrao_data: getPrecoPorPessoa(dataBase),
      fim_de_semana: fimDeSemana,
      subtotal,
      desconto_bulk: descontoBulk,
      desconto_bulk_por_pessoa: descontoBulkPorPessoa,
      bulk_aplicado: bulkAplicado,
      bulk_min_qtd: DESCONTO_BULK_MIN_QTD,
      bulk_valor_por_pessoa: DESCONTO_BULK_POR_PESSOA,
      desconto_cupom: desconto,
      taxa_mp: taxaMP,
      total,
      total_sem_taxa: totalAposCupom,
      cupons: cuponsAplicados,
      max_cupons: quantidade,
      slot: slotResumo,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { calcular };
