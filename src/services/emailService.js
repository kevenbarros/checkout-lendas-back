const { Resend } = require('resend');

let resendClient = null;

function getClient() {
  if (resendClient) return resendClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  resendClient = new Resend(apiKey);
  return resendClient;
}

function formatBRL(valor) {
  return Number(valor).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatDataBR(isoYYYYMMDD) {
  if (!isoYYYYMMDD) return '';
  const [y, m, d] = isoYYYYMMDD.split('-');
  return `${d}/${m}/${y}`;
}

function montarHtml({
  nome,
  reservaId,
  data,
  hora,
  quantidade,
  valorTotal,
  calendarEventLink,
}) {
  const linkCalendar = calendarEventLink
    ? `<p style="text-align:center;margin:24px 0;">
         <a href="${calendarEventLink}"
            style="display:inline-block;padding:12px 24px;background:#6a3cff;color:#fff;
                   text-decoration:none;border-radius:8px;font-weight:600;">
           Adicionar ao Google Calendar
         </a>
       </p>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-br">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f2fb;font-family:Arial,sans-serif;color:#2d2245;">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;
              box-shadow:0 10px 30px rgba(0,0,0,.08);">
    <div style="background:linear-gradient(120deg,#9b7bff,#6a3cff);color:#fff;padding:28px 32px;">
      <h1 style="margin:0;font-size:22px;">Reserva confirmada! 🎉</h1>
      <p style="margin:4px 0 0 0;opacity:.9;">Escape Room Lendas</p>
    </div>

    <div style="padding:28px 32px;">
      <p style="font-size:16px;">Olá, <strong>${nome}</strong>!</p>
      <p>Sua reserva foi confirmada e já está agendada. Guarde este e-mail para referência.</p>

      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:15px;">
        <tr><td style="padding:10px 0;color:#6b5b8a;border-bottom:1px dashed #e6e0f2;">Reserva</td>
            <td style="padding:10px 0;text-align:right;border-bottom:1px dashed #e6e0f2;"><strong>${reservaId}</strong></td></tr>
        <tr><td style="padding:10px 0;color:#6b5b8a;border-bottom:1px dashed #e6e0f2;">Data</td>
            <td style="padding:10px 0;text-align:right;border-bottom:1px dashed #e6e0f2;"><strong>${formatDataBR(data)}</strong></td></tr>
        <tr><td style="padding:10px 0;color:#6b5b8a;border-bottom:1px dashed #e6e0f2;">Horário</td>
            <td style="padding:10px 0;text-align:right;border-bottom:1px dashed #e6e0f2;"><strong>${hora}</strong></td></tr>
        <tr><td style="padding:10px 0;color:#6b5b8a;border-bottom:1px dashed #e6e0f2;">Participantes</td>
            <td style="padding:10px 0;text-align:right;border-bottom:1px dashed #e6e0f2;"><strong>${quantidade}</strong></td></tr>
        <tr><td style="padding:10px 0;color:#6b5b8a;">Valor pago</td>
            <td style="padding:10px 0;text-align:right;"><strong>${formatBRL(valorTotal)}</strong></td></tr>
      </table>

      ${linkCalendar}

      <p style="font-size:14px;color:#6b5b8a;margin-top:24px;">
        <strong>Importante:</strong> chegue 10 minutos antes do horário. Em caso de dúvidas,
        responda este e-mail.
      </p>
    </div>

    <div style="background:#faf7ff;padding:16px 32px;text-align:center;font-size:12px;color:#9388b6;">
      Até logo! · Escape Room Lendas
    </div>
  </div>
</body>
</html>`;
}

async function enviarConfirmacaoReserva({
  nome,
  email,
  reservaId,
  data,
  hora,
  quantidade,
  valorTotal,
  calendarEventLink,
}) {
  const client = getClient();
  if (!client) {
    console.warn('[email] RESEND_API_KEY não configurada, pulando envio.');
    return { ok: false, skipped: true };
  }
  if (!email) {
    return { ok: false, skipped: true, reason: 'sem e-mail' };
  }

  const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const subject = `Reserva confirmada - ${formatDataBR(data)} às ${hora}`;
  const html = montarHtml({
    nome,
    reservaId,
    data,
    hora,
    quantidade,
    valorTotal,
    calendarEventLink,
  });

  try {
    const result = await client.emails.send({
      from,
      to: [email],
      subject,
      html,
    });
    if (result.error) {
      console.error('[email] erro Resend:', result.error);
      return { ok: false, error: result.error.message || 'erro Resend' };
    }
    return { ok: true, id: result.data && result.data.id };
  } catch (err) {
    console.error('[email] exceção no envio:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { enviarConfirmacaoReserva };
