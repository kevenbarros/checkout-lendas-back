const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

let authClient = null;

function getAuth() {
  if (authClient) return authClient;

  const scopes = ['https://www.googleapis.com/auth/calendar.events'];

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    authClient = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes,
    });
    return authClient;
  }

  const filePath = path.resolve(
    process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './googleServiceAccount.json'
  );

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const creds = require(filePath);
  authClient = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes,
  });
  return authClient;
}

function getCalendarClient() {
  const auth = getAuth();
  if (!auth) return null;
  return google.calendar({ version: 'v3', auth });
}

function montarDataISO(dataYYYYMMDD, horaHHMM, minutosDuracao = 60) {
  const timezone = process.env.GOOGLE_CALENDAR_TIMEZONE || 'America/Sao_Paulo';
  const start = `${dataYYYYMMDD}T${horaHHMM}:00`;
  const [y, m, d] = dataYYYYMMDD.split('-').map(Number);
  const [hh, mm] = horaHHMM.split(':').map(Number);
  const endDate = new Date(Date.UTC(y, m - 1, d, hh, mm));
  endDate.setUTCMinutes(endDate.getUTCMinutes() + minutosDuracao);
  const end =
    `${endDate.getUTCFullYear()}-` +
    `${String(endDate.getUTCMonth() + 1).padStart(2, '0')}-` +
    `${String(endDate.getUTCDate()).padStart(2, '0')}T` +
    `${String(endDate.getUTCHours()).padStart(2, '0')}:` +
    `${String(endDate.getUTCMinutes()).padStart(2, '0')}:00`;

  return {
    start: { dateTime: start, timeZone: timezone },
    end: { dateTime: end, timeZone: timezone },
  };
}

async function criarEventoReserva({
  reservaId,
  nome,
  email,
  cpf,
  quantidade,
  valorTotal,
  data,
  hora,
  duracaoMin = 60,
}) {
  const calendar = getCalendarClient();
  if (!calendar) {
    console.warn(
      '[calendar] credenciais do Google não configuradas, pulando criação de evento.'
    );
    return null;
  }

  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    console.warn('[calendar] GOOGLE_CALENDAR_ID não configurado.');
    return null;
  }

  const { start, end } = montarDataISO(data, hora, duracaoMin);

  const event = {
    summary: `Escape Room - ${nome} (${quantidade} pessoas)`,
    description: [
      `Reserva: ${reservaId}`,
      `Cliente: ${nome}`,
      email ? `E-mail: ${email}` : null,
      cpf ? `CPF: ${cpf}` : null,
      `Participantes: ${quantidade}`,
      `Valor total: R$ ${Number(valorTotal).toFixed(2)}`,
    ]
      .filter(Boolean)
      .join('\n'),
    start,
    end,
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'popup', minutes: 30 },
      ],
    },
    extendedProperties: {
      private: { reservaId },
    },
  };

  try {
    const resp = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });
    return {
      eventId: resp.data.id,
      htmlLink: resp.data.htmlLink,
    };
  } catch (err) {
    console.error('[calendar] falha ao criar evento:', err.message);
    return null;
  }
}

module.exports = {
  criarEventoReserva,
};
