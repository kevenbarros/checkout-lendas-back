const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

let firestoreInstance = null;

function initFirebase() {
  if (admin.apps.length > 0) {
    return admin.firestore();
  }

  let credential;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      credential = admin.credential.cert(parsed);
    } catch (err) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON inválido. Verifique se é um JSON válido em uma única linha.'
      );
    }
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
