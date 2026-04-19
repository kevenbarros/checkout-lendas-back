const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

let firestoreInstance = null;

function initFirebase() {
  if (admin.apps.length > 0) {
    return admin.firestore();
  }

  let credential;

  const jsonInline =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    (process.env.FIREBASE_SERVICE_ACCOUNT_PATH &&
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH.trim().startsWith('{')
      ? process.env.FIREBASE_SERVICE_ACCOUNT_PATH
      : null);

  if (jsonInline) {
    let raw = jsonInline.trim();
    if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      raw = raw.slice(1, -1);
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err1) {
      try {
        parsed = JSON.parse(raw.replace(/\r?\n/g, '\\n'));
      } catch (err2) {
        console.error('[firebase] JSON.parse falhou:', err1.message);
        console.error(
          '[firebase] primeiros 80 chars recebidos:',
          JSON.stringify(raw.slice(0, 80))
        );
        console.error(
          '[firebase] últimos 40 chars recebidos:',
          JSON.stringify(raw.slice(-40))
        );
        throw new Error(
          'Credencial Firebase inválida. Verifique se é um JSON válido em uma única linha.'
        );
      }
    }
    if (parsed.private_key && parsed.private_key.includes('\\n')) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    credential = admin.credential.cert(parsed);
  } else {
    const filePath = path.resolve(
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './serviceAccountKey.json'
    );

    if (!fs.existsSync(filePath)) {
      throw new Error(
        `Arquivo de credencial do Firebase não encontrado em: ${filePath}. ` +
          'Defina FIREBASE_SERVICE_ACCOUNT_PATH ou FIREBASE_SERVICE_ACCOUNT_JSON no .env.'
      );
    }

    const serviceAccount = require(filePath);
    credential = admin.credential.cert(serviceAccount);
  }

  admin.initializeApp({ credential });

  firestoreInstance = admin.firestore();
  firestoreInstance.settings({ ignoreUndefinedProperties: true });

  return firestoreInstance;
}

function getDb() {
  if (!firestoreInstance) {
    firestoreInstance = initFirebase();
  }
  return firestoreInstance;
}

module.exports = {
  initFirebase,
  getDb,
  admin,
};
