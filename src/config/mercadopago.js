const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

let clientInstance = null;

function getClient() {
  if (!clientInstance) {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error('MP_ACCESS_TOKEN não configurado no .env');
    }
    clientInstance = new MercadoPagoConfig({
      accessToken,
      options: { timeout: 10000 },
    });
  }
  return clientInstance;
}

function getPreferenceClient() {
  return new Preference(getClient());
}

function getPaymentClient() {
  return new Payment(getClient());
}

module.exports = {
  getClient,
  getPreferenceClient,
  getPaymentClient,
};
