const express = require('express');
const { calcular } = require('../controllers/calcularController');
const { criarPagamento } = require('../controllers/pagamentoController');
const { webhook } = require('../controllers/webhookController');
const {
  postSlot,
  getSlot,
  getSlots,
} = require('../controllers/slotController');
const {
  getCupons,
  postCupom,
  putCupom,
  deleteCupom,
} = require('../controllers/cupomController');
const { buscarReserva } = require('../services/reservaService');

const router = express.Router();

router.post('/calcular', calcular);
router.post('/criar-pagamento', criarPagamento);

router.post('/webhook', webhook);
router.get('/webhook', webhook);

router.post('/slots', postSlot);
router.get('/slots', getSlots);
router.get('/slots/:id', getSlot);

router.get('/cupons', getCupons);
router.post('/cupons', postCupom);
router.put('/cupons/:id', putCupom);
router.delete('/cupons/:id', deleteCupom);

router.get('/reservas/:id', async (req, res, next) => {
  try {
    const reserva = await buscarReserva(req.params.id);
    if (!reserva) return res.status(404).json({ error: 'Reserva não encontrada' });
    return res.json({
      id: reserva.id,
      status: reserva.status,
      valor_total: reserva.valor_total,
      quantidade: reserva.quantidade,
      cupons: reserva.cupons || [],
      slot_id: reserva.slot_id,
      slot_data: reserva.slot_data,
      slot_hora: reserva.slot_hora,
      calendar_event_link: reserva.calendar_event_link || null,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/health', (_req, res) => res.json({ ok: true }));

module.exports = router;
