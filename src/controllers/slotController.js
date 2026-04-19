const {
  criarSlot,
  buscarSlot,
  listarSlots,
  SLOT_STATUS,
} = require('../services/slotService');
const {
  validarData,
  validarHora,
  validarSlotId,
  validarPrecoPorPessoa,
  ValidationError,
} = require('../utils/validators');

function checkAdminToken(req) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return;
  const header = req.headers['x-admin-token'];
  if (header !== token) {
    const err = new Error('Acesso negado.');
    err.status = 401;
    throw err;
  }
}

function buildReservaUrl(slotId) {
  const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${frontend}/reserva/${slotId}`;
}

function buildWhatsappMessage(slotId, data, hora) {
  const url = buildReservaUrl(slotId);
  const [y, m, d] = data.split('-');
  const dataFmt = `${d}/${m}/${y}`;
  const texto =
    `Olá! Segue o link da sua reserva na Escape Room para ${dataFmt} às ${hora}. ` +
    `Finalize o pagamento para confirmar seu horário: ${url}`;
  return {
    url,
    texto,
    whatsapp_url: `https://wa.me/?text=${encodeURIComponent(texto)}`,
  };
}

async function postSlot(req, res, next) {
  try {
    checkAdminToken(req);
    const data = validarData(req.body.data);
    const hora = validarHora(req.body.hora);
    const duracaoMin = Number(req.body.duracao_min) || 60;
    const precoPorPessoa = validarPrecoPorPessoa(req.body.preco_por_pessoa);

    if (duracaoMin < 15 || duracaoMin > 480) {
      throw new ValidationError('Duração inválida (15 a 480 minutos).');
    }

    const slot = await criarSlot({ data, hora, duracaoMin, precoPorPessoa });
    const links = buildWhatsappMessage(slot.id, slot.data, slot.hora);

    return res.status(201).json({
      slot: {
        id: slot.id,
        data: slot.data,
        hora: slot.hora,
        duracao_min: slot.duracao_min,
        preco_por_pessoa: slot.preco_por_pessoa,
        status: slot.status,
      },
      link: links.url,
      whatsapp_url: links.whatsapp_url,
      mensagem: links.texto,
    });
  } catch (err) {
    next(err);
  }
}

async function getSlot(req, res, next) {
  try {
    const id = validarSlotId(req.params.id);
    const slot = await buscarSlot(id);
    if (!slot) return res.status(404).json({ error: 'Horário não encontrado.' });

    return res.json({
      id: slot.id,
      data: slot.data,
      hora: slot.hora,
      duracao_min: slot.duracao_min,
      preco_por_pessoa: slot.preco_por_pessoa || null,
      status: slot.status,
      disponivel: slot.status !== SLOT_STATUS.RESERVADO,
    });
  } catch (err) {
    next(err);
  }
}

async function getSlots(req, res, next) {
  try {
    checkAdminToken(req);
    const filtro = {};
    if (req.query.data) filtro.data = validarData(req.query.data);
    const slots = await listarSlots(filtro);
    return res.json({
      slots: slots.map((s) => ({
        id: s.id,
        data: s.data,
        hora: s.hora,
        status: s.status,
        reservado_por: s.reservado_por || null,
        link: buildReservaUrl(s.id),
      })),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { postSlot, getSlot, getSlots };
