const PRECO_DIA_SEMANA = 60;
const PRECO_FIM_DE_SEMANA = 65;

const DESCONTO_BULK_MIN_QTD = 5;
const DESCONTO_BULK_POR_PESSOA = 5;

const TAXA_MP_PERCENTUAL = 0.0499;
const TAXA_MP_FIXA = 0.39;

function isFimDeSemana(date = new Date()) {
  const dia = date.getDay();
  return dia === 0 || dia === 6;
}

function getPrecoPorPessoa(date = new Date()) {
  return isFimDeSemana(date) ? PRECO_FIM_DE_SEMANA : PRECO_DIA_SEMANA;
}

function aplicarDescontoBulk(precoPorPessoa, quantidade) {
  if (quantidade >= DESCONTO_BULK_MIN_QTD) {
    const novo = Math.max(0, precoPorPessoa - DESCONTO_BULK_POR_PESSOA);
    return {
      precoPorPessoaFinal: novo,
      descontoPorPessoa: DESCONTO_BULK_POR_PESSOA,
      bulkAplicado: true,
    };
  }
  return {
    precoPorPessoaFinal: precoPorPessoa,
    descontoPorPessoa: 0,
    bulkAplicado: false,
  };
}

function calcularTaxaMP(valor) {
  const bruto = Number(valor) + TAXA_MP_FIXA;
  const total = bruto / (1 - TAXA_MP_PERCENTUAL);
  const taxa = total - Number(valor);
  return Math.round(taxa * 100) / 100;
}

function calcularPreco(quantidade, date = new Date(), precoBasePorPessoa = null) {
  const precoBase =
    precoBasePorPessoa != null ? Number(precoBasePorPessoa) : getPrecoPorPessoa(date);

  const { precoPorPessoaFinal, descontoPorPessoa, bulkAplicado } =
    aplicarDescontoBulk(precoBase, quantidade);

  const subtotalBruto = quantidade * precoBase;
  const descontoBulk = quantidade * descontoPorPessoa;
  const subtotal = quantidade * precoPorPessoaFinal;

  return {
    precoPorPessoa: precoPorPessoaFinal,
    precoPorPessoaBase: precoBase,
    subtotal,
    subtotalBruto,
    descontoBulk,
    descontoBulkPorPessoa: descontoPorPessoa,
    bulkAplicado,
    fimDeSemana: isFimDeSemana(date),
  };
}

module.exports = {
  PRECO_DIA_SEMANA,
  PRECO_FIM_DE_SEMANA,
  DESCONTO_BULK_MIN_QTD,
  DESCONTO_BULK_POR_PESSOA,
  TAXA_MP_PERCENTUAL,
  TAXA_MP_FIXA,
  isFimDeSemana,
  getPrecoPorPessoa,
  calcularPreco,
  calcularTaxaMP,
};
