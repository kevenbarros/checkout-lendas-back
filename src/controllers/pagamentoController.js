const { calcularPreco, calcularTaxaMP } = require('../services/precoService');
const {
  buscarCuponsParaUso,
  aplicarCupons,
} = require('../services/cupomService');
const {
  criarReserva,
  atualizarReserva,
} = require('../services/reservaService');
const {
  buscarSlot,
  lockSlot,
  liberarSlot,
  SLOT_STATUS,
} = require('../services/slotService');
const { getPreferenceClient } = require('../config/mercadopago');
const {
  validarQuantidade,
  validarNome,
  validarCpf,
  validarEmail,
  validarSlotId,
  validarDataNascimento,
  validarAceiteTermos,
  TERMOS_VERSAO_ATUAL,
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

function obterIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
}

async function criarPagamento(req, res, next) {
  let reservaCriada = null;
  let slotId = null;

  try {
    slotId = validarSlotId(req.body.slot_id);
    const nome = validarNome(req.body.nome);
    const cpf = validarCpf(req.body.cpf);
    const email = validarEmail(req.body.email);
    const quantidade = validarQuantidade(req.body.quantidade);
    const dataNascimento = validarDataNascimento(req.body.data_nascimento);
    const aceite = validarAceiteTermos(req.body);
    const codigosCupons = coletarCodigosDeEntrada(req.body);

    const slot = await buscarSlot(slotId);
    if (!slot) {
      throw new ValidationError('Horário não encontrado.');
    }
    if (slot.status === SLOT_STATUS.RESERVADO) {
      throw new ValidationError('Este horário já está reservado.');
    }

    const dataBase = parseDataParaCalculo(slot.data);
    const {
      precoPorPessoa,
      subtotal,
      descontoBulk,
      bulkAplicado,
    } = calcularPreco(quantidade, dataBase, slot.preco_por_pessoa || null);

    const cupons = await buscarCuponsParaUso(codigosCupons, quantidade);
    const { desconto, total: totalAposCupom, cuponsAplicados } = aplicarCupons(
      subtotal,
      cupons
    );

    if (totalAposCupom <= 0) {
      throw new ValidationError(
        'Total final inválido. O valor deve ser maior que zero.'
      );
    }

    const taxaMP = calcularTaxaMP(totalAposCupom);
    const total = Math.round((totalAposCupom + taxaMP) * 100) / 100;

    reservaCriada = await criarReserva({
      nome,
      cpf,
      email,
      dataNascimento,
      quantidade,
      precoPorPessoa,
      subtotal,
      descontoBulk,
      bulkAplicado,
      desconto,
      taxaMP,
      totalSemTaxa: totalAposCupom,
      total,
      cuponsAplicados,
      slotId,
      slotData: slot.data,
      slotHora: slot.hora,
      termosAceitos: aceite,
      termosVersao: TERMOS_VERSAO_ATUAL,
      termosIp: obterIp(req),
    });

    await lockSlot(slotId, reservaCriada.id);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const backendPublicUrl = process.env.BACKEND_PUBLIC_URL;

    const eventStartISO = new Date(
      `${slot.data}T${slot.hora}:00-03:00`
    ).toISOString();
    const eventEndISO = new Date(
      new Date(`${slot.data}T${slot.hora}:00-03:00`).getTime() + 60 * 60 * 1000
    ).toISOString();

    const preferenceData = {
      items: [
        {
          id: reservaCriada.id,
          title: `Escape Room - ${slot.data} ${slot.hora} (${quantidade} pessoas)`,
          description: `Reserva para ${nome}`,
          category_id: 'services',
          quantity: 1,
          currency_id: 'BRL',
          unit_price: Number(total.toFixed(2)),
          event_date: eventStartISO,
        },
      ],
      additional_info: {
        items: [
          {
            id: reservaCriada.id,
            title: `Escape Room - ${slot.data} ${slot.hora}`,
            category_id: 'services',
            quantity: 1,
            unit_price: Number(total.toFixed(2)),
            event_date: eventStartISO,
          },
        ],
      },
      payer: {
        name: nome,
        email,
        identification: { type: 'CPF', number: cpf },
      },
      external_reference: reservaCriada.id,
      back_urls: {
        success: `${frontendUrl}/sucesso?reserva=${reservaCriada.id}`,
        failure: `${frontendUrl}/falha?reserva=${reservaCriada.id}`,
        pending: `${frontendUrl}/pendente?reserva=${reservaCriada.id}`,
      },
      statement_descriptor: 'ESCAPEROOM',
      payment_methods: {
        excluded_payment_types: [
          { id: 'ticket' },
          { id: 'atm' },
        ],
        excluded_payment_methods: [
          { id: 'bolbradesco' },
          { id: 'pec' },
        ],
      },
      metadata: {
        reserva_id: reservaCriada.id,
        slot_id: slotId,
      },
    };

    if (backendPublicUrl) {
      preferenceData.notification_url = `${backendPublicUrl}/webhook`;
    }

    const frontendEhPublico =
      frontendUrl.startsWith('https://') &&
      !frontendUrl.includes('localhost') &&
      !frontendUrl.includes('127.0.0.1');
    if (frontendEhPublico) {
      preferenceData.auto_return = 'approved';
    }

    const preferenceClient = getPreferenceClient();
    const preference = await preferenceClient.create({ body: preferenceData });

    await atualizarReserva(reservaCriada.id, {
      preference_id: preference.id,
    });

    return res.json({
      reserva_id: reservaCriada.id,
      slot_id: slotId,
      preference_id: preference.id,
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
      total,
      total_sem_taxa: totalAposCupom,
      taxa_mp: taxaMP,
      desconto,
      desconto_bulk: descontoBulk,
      subtotal,
      preco_por_pessoa: precoPorPessoa,
      quantidade,
      cupons: cuponsAplicados,
      bulk_aplicado: bulkAplicado,
    });
  } catch (err) {
    if (reservaCriada && slotId) {
      liberarSlot(slotId, { reservaId: reservaCriada.id }).catch((e) =>
        console.error('[pagamento] falha ao liberar slot após erro:', e.message)
      );
      atualizarReserva(reservaCriada.id, { status: 'CANCELADO' }).catch(() => {});
    }
    next(err);
  }
}

module.exports = { criarPagamento };
