const { getDb, admin } = require('../config/firebase');
const { ConflictError, ValidationError } = require('../utils/validators');

const COLLECTION = 'slots';

const SLOT_STATUS = {
  DISPONIVEL: 'DISPONIVEL',
  RESERVANDO: 'RESERVANDO',
  RESERVADO: 'RESERVADO',
};

const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

function docIdFromDateTime(data, hora) {
  return `${data}_${hora.replace(':', '')}`;
}

async function criarSlot({ data, hora, duracaoMin = 60, precoPorPessoa = null }) {
  const db = getDb();
  const id = docIdFromDateTime(data, hora);
  const ref = db.collection(COLLECTION).doc(id);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      throw new ConflictError('Já existe um slot para esta data e hora.');
    }
    tx.set(ref, {
      data,
      hora,
      duracao_min: duracaoMin,
      preco_por_pessoa: precoPorPessoa,
      status: SLOT_STATUS.DISPONIVEL,
      reservado_por: null,
      reserva_id: null,
      lock_at: null,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return buscarSlot(id);
}

async function buscarSlot(id) {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function listarSlots({ data } = {}) {
  const db = getDb();
  let query = db.collection(COLLECTION);
  if (data) query = query.where('data', '==', data);
  const snap = await query.orderBy('data').orderBy('hora').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function lockExpirou(lockAt) {
  if (!lockAt) return true;
  const ms = lockAt.toMillis ? lockAt.toMillis() : new Date(lockAt).getTime();
  return Date.now() - ms > LOCK_TIMEOUT_MS;
}

async function lockSlot(slotId, reservaId) {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(slotId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new ValidationError('Slot não encontrado.');
    }
    const slot = snap.data();

    if (slot.status === SLOT_STATUS.RESERVADO) {
      throw new ConflictError('Este horário já foi reservado.');
    }

    if (
      slot.status === SLOT_STATUS.RESERVANDO &&
      !lockExpirou(slot.lock_at) &&
      slot.reserva_id !== reservaId
    ) {
      throw new ConflictError(
        'Outro cliente está finalizando um pagamento para este horário. Tente novamente em alguns minutos.'
      );
    }

    tx.update(ref, {
      status: SLOT_STATUS.RESERVANDO,
      reserva_id: reservaId,
      lock_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { id: snap.id, ...slot };
  });
}

async function confirmarSlot(slotId, { reservaId, nome }) {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(slotId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new ValidationError('Slot não encontrado.');
    }
    const slot = snap.data();
    if (slot.status === SLOT_STATUS.RESERVADO && slot.reserva_id !== reservaId) {
      throw new ConflictError(
        'Slot já confirmado por outra reserva. Reembolso necessário.'
      );
    }

    tx.update(ref, {
      status: SLOT_STATUS.RESERVADO,
      reserva_id: reservaId,
      reservado_por: nome || slot.reservado_por || null,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

async function liberarSlot(slotId, { reservaId } = {}) {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(slotId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const slot = snap.data();

    if (slot.status === SLOT_STATUS.RESERVADO) return;
    if (reservaId && slot.reserva_id && slot.reserva_id !== reservaId) return;

    tx.update(ref, {
      status: SLOT_STATUS.DISPONIVEL,
      reserva_id: null,
      reservado_por: null,
      lock_at: null,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

module.exports = {
  SLOT_STATUS,
  LOCK_TIMEOUT_MS,
  docIdFromDateTime,
  criarSlot,
  buscarSlot,
  listarSlots,
  lockSlot,
  confirmarSlot,
  liberarSlot,
};
