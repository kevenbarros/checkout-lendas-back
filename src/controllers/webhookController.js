const crypto = require('crypto');
const { getPaymentClient } = require('../config/mercadopago');
const {
  atualizarReserva,
  buscarReservaPorPaymentId,
  buscarReserva,
  mapStatusMP,
  STATUS,
} = require('../services/reservaService');
const {
  buscarSlot,
  confirmarSlot,
  liberarSlot,
} = require('../services/slotService');
const { criarEventoReserva } = require('../services/googleCalendarService');
const { enviarConfirmacaoReserva } = require('../services/emailService');
const { incrementarUsosCupons } = require('../services/cupomService');

function validarAssinatura(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return { ok: true, skipped: true };

  const signatureHeader = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'];
  if (!signatureHeader) return { ok: false, reason: 'x-signature ausente' };

  const parts = String(signatureHeader)
    .split(',')
    .map((p) => p.trim());
  const tsPart = parts.find((p) => p.startsWith('ts='));
  const v1Part = parts.find((p) => p.startsWith('v1='));

  if (!tsPart || !v1Part) return { ok: false, reason: 'x-signature inválido' };
  const ts = tsPart.split('=')[1];
  const v1 = v1Part.split('=')[1];

  const dataId =
    (req.query && (req.query['data.id'] || req.query.id)) ||
    (req.body && req.body.data && req.body.data.id) ||
    '';

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(manifest)
    .digest('hex');

  try {
    const ok = crypto.timingSafeEqual(
      Buffer.from(hmac, 'utf8'),
      Buffer.from(v1, 'utf8')
    );
    return ok ? { ok: true } : { ok: false, reason: 'assinatura inválida' };
  } catch {
    return { ok: false, reason: 'assinatura inválida' };
  }
}

async function webhook(req, res) {
  console.log('[webhook] >>> REQUISIÇÃO RECEBIDA', {
    method: req.method,
    url: req.originalUrl,
    headers: req.headers,
    query: req.query,
    body: req.body,
    ip: req.ip,
  });
  try {
    const assinatura = validarAssinatura(req);
    if (!assinatura.ok) {
      console.warn('[webhook] assinatura recusada:', assinatura.reason);
      return res.status(401).json({ error: assinatura.reason });
    }

    const type =
      req.body.type || req.body.topic || req.query.type || req.query.topic;
    const paymentId =
      (req.body.data && req.body.data.id) || req.query.id || req.query['data.id'];

    if (type !== 'payment' || !paymentId) {
      return res.status(200).json({ ignored: true });
    }

    const paymentClient = getPaymentClient();
    const payment = await paymentClient.get({ id: paymentId });
    if (!payment) {
      console.warn('[webhook] pagamento não encontrado:', paymentId);
      return res.status(200).json({ ignored: true });
    }

    const statusMP = payment.status;
    const novoStatus = mapStatusMP(statusMP);
    const reservaId =
      payment.external_reference ||
      (payment.metadata && payment.metadata.reserva_id) ||
      null;

    let reserva = null;
    if (reservaId) reserva = await buscarReserva(reservaId);
    if (!reserva) reserva = await buscarReservaPorPaymentId(paymentId);

    if (!reserva) {
      console.warn('[webhook] reserva não localizada:', paymentId);
      return res.status(200).json({ ignored: true });
    }

    const valorPago = Number(payment.transaction_amount);
    const valorEsperado = Number(reserva.valor_total);
    const valorConfere =
      !Number.isNaN(valorPago) &&
      Math.abs(valorPago - valorEsperado) < 0.01;

    const updates = {
      payment_id: String(paymentId),
      payment_status_raw: statusMP,
      payment_status_detail: payment.status_detail || null,
    };

    if (novoStatus === STATUS.CONFIRMADO && !valorConfere) {
      updates.status = STATUS.REJEITADO;
      updates.reject_reason = `Valor divergente: pago ${valorPago}, esperado ${valorEsperado}`;
      await atualizarReserva(reserva.id, updates);
      if (reserva.slot_id) {
        await liberarSlot(reserva.slot_id, { reservaId: reserva.id }).catch(
          (e) => console.error('[webhook] erro ao liberar slot:', e.message)
        );
      }
      console.warn('[webhook] valor divergente:', {
        reservaId: reserva.id,
        valorPago,
        valorEsperado,
      });
      return res.status(200).json({ received: true, status: updates.status });
    }

    updates.status = novoStatus;
    await atualizarReserva(reserva.id, updates);

    if (novoStatus === STATUS.CONFIRMADO && reserva.slot_id) {
      try {
        await confirmarSlot(reserva.slot_id, {
          reservaId: reserva.id,
          nome: reserva.nome,
        });
      } catch (err) {
        console.error('[webhook] erro ao confirmar slot:', err.message);
      }

      if (!reserva.cupons_usos_incrementados && Array.isArray(reserva.cupons_ids) && reserva.cupons_ids.length) {
        try {
          await incrementarUsosCupons(reserva.cupons_ids);
          await atualizarReserva(reserva.id, {
            cupons_usos_incrementados: true,
          });
        } catch (err) {
          console.error('[webhook] erro ao incrementar cupons:', err.message);
        }
      }

      let calendarEventLink = reserva.calendar_event_link || null;

      if (reserva.calendar_event_id) {
        console.log(
          '[webhook] evento já existe para reserva',
          reserva.id,
          '- pulando criação'
        );
      } else {
        const slot = await buscarSlot(reserva.slot_id);
        if (slot) {
          const resultado = await criarEventoReserva({
            reservaId: reserva.id,
            nome: reserva.nome,
            email: reserva.email,
            cpf: reserva.cpf,
            quantidade: reserva.quantidade,
            valorTotal: reserva.valor_total,
            data: slot.data,
            hora: slot.hora,
            duracaoMin: slot.duracao_min || 60,
          });

          if (resultado) {
            calendarEventLink = resultado.htmlLink;
            await atualizarReserva(reserva.id, {
              calendar_event_id: resultado.eventId,
              calendar_event_link: resultado.htmlLink,
            });
          }
        }
      }

      if (!reserva.email_confirmacao_enviado && reserva.email) {
        const slotParaEmail =
          reserva.slot_data && reserva.slot_hora
            ? { data: reserva.slot_data, hora: reserva.slot_hora }
            : await buscarSlot(reserva.slot_id);
        if (slotParaEmail) {
          const envio = await enviarConfirmacaoReserva({
            nome: reserva.nome,
            email: reserva.email,
            reservaId: reserva.id,
            data: slotParaEmail.data,
            hora: slotParaEmail.hora,
            quantidade: reserva.quantidade,
            valorTotal: reserva.valor_total,
            calendarEventLink,
          });
          if (envio.ok) {
            await atualizarReserva(reserva.id, {
              email_confirmacao_enviado: true,
              email_resend_id: envio.id || null,
            });
          }
        }
      } else if (reserva.email_confirmacao_enviado) {
        console.log(
          '[webhook] e-mail já enviado para reserva',
          reserva.id,
          '- pulando'
        );
      }
    }

    if (
      [STATUS.REJEITADO, STATUS.CANCELADO, STATUS.ESTORNADO].includes(
        novoStatus
      ) &&
      reserva.slot_id
    ) {
      await liberarSlot(reserva.slot_id, { reservaId: reserva.id }).catch((e) =>
        console.error('[webhook] erro ao liberar slot:', e.message)
      );
    }

    return res.status(200).json({ received: true, status: updates.status });
  } catch (err) {
    console.error('[webhook] erro:', err);
    return res.status(200).json({ received: true, error: err.message });
  }
}

module.exports = { webhook };
