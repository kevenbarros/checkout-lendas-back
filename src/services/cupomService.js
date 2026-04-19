const { getDb, admin } = require('../config/firebase');
const { ValidationError, ConflictError } = require('../utils/validators');

const COLLECTION = 'cupons';
const TIPOS_VALIDOS = ['percentual', 'fixo'];

function normalizarCodigo(codigo) {
  if (typeof codigo !== 'string') {
    throw new ValidationError('Código do cupom é obrigatório.');
  }
  const normalizado = codigo.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(normalizado)) {
    throw new ValidationError(
      'Código inválido. Use 3 a 40 caracteres (letras, números, _ ou -).'
    );
  }
  return normalizado;
}

function validarTipo(tipo) {
  if (!TIPOS_VALIDOS.includes(tipo)) {
    throw new ValidationError('Tipo inválido. Use "percentual" ou "fixo".');
  }
  return tipo;
}

function validarValor(valor, tipo) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError('Valor do cupom inválido.');
  }
  if (tipo === 'percentual' && n > 100) {
    throw new ValidationError('Percentual não pode ser maior que 100.');
  }
  if (tipo === 'fixo' && n > 100000) {
    throw new ValidationError('Valor fixo acima do permitido.');
  }
  return Math.round(n * 100) / 100;
}

function validarUsoMaximo(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) {
    throw new ValidationError('Uso máximo inválido (mínimo 1).');
  }
  return n;
}

function validarValidade(valor) {
  if (!valor) return null;
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new ValidationError('Validade inválida (YYYY-MM-DD).');
  }
  const [y, m, d] = valor.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new ValidationError('Validade inválida.');
  }
  return valor;
}

function cupomEstaExpirado(validade) {
  if (!validade) return false;
  const [y, m, d] = validade.split('-').map(Number);
  const fimDoDia = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
  return Date.now() > fimDoDia.getTime();
}

function publicCupomDoc(id, data) {
  return {
    id,
    codigo: data.codigo,
    tipo: data.tipo,
    valor: data.valor,
    uso_maximo: data.uso_maximo ?? null,
    usos: data.usos ?? 0,
    validade: data.validade ?? null,
    ativo: data.ativo !== false,
    esgotado:
      data.uso_maximo != null && (data.usos ?? 0) >= data.uso_maximo,
    expirado: cupomEstaExpirado(data.validade),
  };
}

async function listarCupons() {
  const db = getDb();
  const snap = await db
    .collection(COLLECTION)
    .orderBy('codigo')
    .get();
  return snap.docs.map((d) => publicCupomDoc(d.id, d.data()));
}

async function criarCupom(dados) {
  const codigo = normalizarCodigo(dados.codigo);
  const tipo = validarTipo(dados.tipo);
  const valor = validarValor(dados.valor, tipo);
  const usoMaximo = validarUsoMaximo(dados.uso_maximo);
  const validade = validarValidade(dados.validade);
  const ativo = dados.ativo !== false;

  const db = getDb();
  const existsSnap = await db
    .collection(COLLECTION)
    .where('codigo', '==', codigo)
    .limit(1)
    .get();
  if (!existsSnap.empty) {
    throw new ConflictError('Já existe um cupom com esse código.');
  }

  const ref = db.collection(COLLECTION).doc();
  const payload = {
    codigo,
    tipo,
    valor,
    uso_maximo: usoMaximo,
    usos: 0,
    validade,
    ativo,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };
  await ref.set(payload);
  return publicCupomDoc(ref.id, payload);
}

async function atualizarCupom(id, dados) {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ValidationError('Cupom não encontrado.');
  const atual = snap.data();

  const updates = {};
  if (dados.codigo !== undefined) {
    const novoCodigo = normalizarCodigo(dados.codigo);
    if (novoCodigo !== atual.codigo) {
      const existsSnap = await db
        .collection(COLLECTION)
        .where('codigo', '==', novoCodigo)
        .limit(1)
        .get();
      if (!existsSnap.empty && existsSnap.docs[0].id !== id) {
        throw new ConflictError('Já existe um cupom com esse código.');
      }
      updates.codigo = novoCodigo;
    }
  }
  if (dados.tipo !== undefined) {
    updates.tipo = validarTipo(dados.tipo);
  }
  if (dados.valor !== undefined) {
    updates.valor = validarValor(dados.valor, updates.tipo || atual.tipo);
  }
  if (dados.uso_maximo !== undefined) {
    updates.uso_maximo = validarUsoMaximo(dados.uso_maximo);
  }
  if (dados.validade !== undefined) {
    updates.validade = validarValidade(dados.validade);
  }
  if (dados.ativo !== undefined) {
    updates.ativo = dados.ativo !== false;
  }
  updates.updated_at = admin.firestore.FieldValue.serverTimestamp();

  await ref.set(updates, { merge: true });
  const novo = await ref.get();
  return publicCupomDoc(novo.id, novo.data());
}

async function deletarCupom(id) {
  const db = getDb();
  await db.collection(COLLECTION).doc(id).delete();
}

async function buscarCupomParaUso(codigoRaw) {
  if (!codigoRaw) return null;
  const codigo = normalizarCodigo(codigoRaw);

  const db = getDb();
  const snap = await db
    .collection(COLLECTION)
    .where('codigo', '==', codigo)
    .limit(1)
    .get();

  if (snap.empty) {
    throw new ValidationError(`Cupom "${codigo}" não encontrado.`);
  }

  const doc = snap.docs[0];
  const data = doc.data();

  if (data.ativo === false) {
    throw new ValidationError(`Cupom "${codigo}" está desativado.`);
  }
  if (!TIPOS_VALIDOS.includes(data.tipo)) {
    throw new ValidationError(`Cupom "${codigo}" com tipo inválido.`);
  }
  if (typeof data.valor !== 'number' || data.valor <= 0) {
    throw new ValidationError(`Cupom "${codigo}" com valor inválido.`);
  }
  if (cupomEstaExpirado(data.validade)) {
    throw new ValidationError(`Cupom "${codigo}" expirado.`);
  }
  if (
    data.uso_maximo != null &&
    (data.usos ?? 0) >= data.uso_maximo
  ) {
    throw new ValidationError(`Cupom "${codigo}" esgotado.`);
  }

  return {
    id: doc.id,
    codigo: data.codigo,
    tipo: data.tipo,
    valor: data.valor,
    uso_maximo: data.uso_maximo ?? null,
    usos: data.usos ?? 0,
    validade: data.validade ?? null,
  };
}

async function buscarCuponsParaUso(codigos = [], quantidadeParticipantes = 0) {
  if (!Array.isArray(codigos) || codigos.length === 0) return [];

  const normalizados = codigos
    .map((c) => (typeof c === 'string' ? c.trim() : ''))
    .filter(Boolean)
    .map(normalizarCodigo);

  if (normalizados.length === 0) return [];

  const unicos = new Set();
  for (const cod of normalizados) {
    if (unicos.has(cod)) {
      throw new ValidationError(
        `Cupom "${cod}" foi informado mais de uma vez. Cada cupom só pode ser usado uma vez por reserva.`
      );
    }
    unicos.add(cod);
  }

  if (normalizados.length > quantidadeParticipantes) {
    throw new ValidationError(
      `Você só pode aplicar até ${quantidadeParticipantes} cupom(ns) (mesmo número de participantes).`
    );
  }

  const resolvidos = [];
  for (const cod of normalizados) {
    const c = await buscarCupomParaUso(cod);
    resolvidos.push(c);
  }
  return resolvidos;
}

function aplicarCupons(subtotal, cupons = []) {
  let acumulado = subtotal;
  let descontoTotal = 0;
  const aplicados = [];

  for (const cupom of cupons) {
    if (acumulado <= 0) break;

    let d = 0;
    if (cupom.tipo === 'percentual') {
      d = (acumulado * cupom.valor) / 100;
    } else if (cupom.tipo === 'fixo') {
      d = cupom.valor;
    }
    d = Math.round(d * 100) / 100;
    if (d > acumulado) d = acumulado;

    acumulado = Math.round((acumulado - d) * 100) / 100;
    descontoTotal = Math.round((descontoTotal + d) * 100) / 100;
    aplicados.push({
      id: cupom.id,
      codigo: cupom.codigo,
      tipo: cupom.tipo,
      valor: cupom.valor,
      desconto: d,
    });
  }

  if (acumulado < 0) acumulado = 0;

  return {
    desconto: descontoTotal,
    total: acumulado,
    cuponsAplicados: aplicados,
  };
}

async function incrementarUsosCupons(cuponsIds = []) {
  if (!cuponsIds.length) return;
  const db = getDb();
  await db.runTransaction(async (tx) => {
    const refs = cuponsIds.map((id) => db.collection(COLLECTION).doc(id));
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));
    snaps.forEach((snap, i) => {
      if (!snap.exists) return;
      tx.update(refs[i], {
        usos: admin.firestore.FieldValue.increment(1),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  });
}

module.exports = {
  TIPOS_VALIDOS,
  normalizarCodigo,
  listarCupons,
  criarCupom,
  atualizarCupom,
  deletarCupom,
  buscarCupomParaUso,
  buscarCuponsParaUso,
  aplicarCupons,
  incrementarUsosCupons,
};
