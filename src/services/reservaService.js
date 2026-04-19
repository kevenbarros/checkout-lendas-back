const { getDb, admin } = require('../config/firebase');

const COLLECTION = 'reservas';

const STATUS = {
  AGUARDANDO_PAGAMENTO: 'AGUARDANDO_PAGAMENTO',
  CONFIRMADO: 'CONFIRMADO',
  CANCELADO: 'CANCELADO',
  REJEITADO: 'REJEITADO',
  ESTORNADO: 'ESTORNADO',
};

async function criarReserva(dados) {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc();
  const payload = {
    nome: dados.nome,
    cpf: dados.cpf,
    email: dados.email || null,
    data_nascimento: dados.dataNascimento || null,
    quantidade: dados.quantidade,
    preco_por_pessoa: dados.precoPorPessoa,
    subtotal: dados.subtotal,
    desconto_bulk: dados.descontoBulk || 0,
    bulk_aplicado: !!dados.bulkAplicado,
    desconto: dados.desconto,
    taxa_mp: dados.taxaMP || 0,
    valor_sem_taxa: dados.totalSemTaxa || dados.total,
    valor_total: dados.total,
    cupons: dados.cuponsAplicados || [],
    cupons_ids: (dados.cuponsAplicados || []).map((c) => c.id).filter(Boolean),
    cupons_usos_incrementados: false,
    slot_id: dados.slotId || null,
    slot_data: dados.slotData || null,
    slot_hora: dados.slotHora || null,
    status: STATUS.AGUARDANDO_PAGAMENTO,
    payment_id: null,
    preference_id: null,
    calendar_event_id: null,
    calendar_event_link: null,
    email_confirmacao_enviado: false,
    termos_aceitos: dados.termosAceitos || null,
    termos_versao: dados.termosVersao || null,
    termos_ip: dados.termosIp || null,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };
  await ref.set(payload);
  return { id: ref.id, ...payload };
}

async function atualizarReserva(id, updates) {
  const db = getDb();
  await db
    .collection(COLLECTION)
    .doc(id)
    .set(
      {
        ...updates,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

async function buscarReservaPorPaymentId(paymentId) {
  const db = getDb();
  const snap = await db
    .collection(COLLECTION)
    .where('payment_id', '==', String(paymentId))
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function buscarReserva(id) {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

function mapStatusMP(statusMp) {
  switch (statusMp) {
    case 'approved':
      return STATUS.CONFIRMADO;
    case 'rejected':
      return STATUS.REJEITADO;
    case 'cancelled':
      return STATUS.CANCELADO;
    case 'refunded':
    case 'charged_back':
      return STATUS.ESTORNADO;
    case 'pending':
    case 'in_process':
    case 'authorized':
    default:
      return STATUS.AGUARDANDO_PAGAMENTO;
  }
}

module.exports = {
  STATUS,
  criarReserva,
  atualizarReserva,
  buscarReservaPorPaymentId,
  buscarReserva,
  mapStatusMP,
};
