const MIN_PARTICIPANTS = 2;
const MAX_PARTICIPANTS = 7;

function validarQuantidade(quantidade) {
  const n = Number(quantidade);
  if (!Number.isInteger(n)) {
    throw new ValidationError('Quantidade deve ser um número inteiro.');
  }
  if (n < MIN_PARTICIPANTS || n > MAX_PARTICIPANTS) {
    throw new ValidationError(
      `Quantidade de participantes deve estar entre ${MIN_PARTICIPANTS} e ${MAX_PARTICIPANTS}.`
    );
  }
  return n;
}

function validarNome(nome) {
  if (typeof nome !== 'string' || nome.trim().length < 3) {
    throw new ValidationError('Nome é obrigatório (mínimo 3 caracteres).');
  }
  return nome.trim();
}

function validarCpf(cpf) {
  if (typeof cpf !== 'string') {
    throw new ValidationError('CPF é obrigatório.');
  }
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) {
    throw new ValidationError('CPF deve conter 11 dígitos.');
  }
  if (/^(\d)\1{10}$/.test(digits)) {
    throw new ValidationError('CPF inválido.');
  }

  const calc = (base, factorStart) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += parseInt(base[i], 10) * (factorStart - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  const d1 = calc(digits.substring(0, 9), 10);
  const d2 = calc(digits.substring(0, 10), 11);

  if (d1 !== parseInt(digits[9], 10) || d2 !== parseInt(digits[10], 10)) {
    throw new ValidationError('CPF inválido.');
  }
  return digits;
}

function validarCupom(codigo) {
  if (codigo === undefined || codigo === null || codigo === '') return null;
  if (typeof codigo !== 'string') {
    throw new ValidationError('Cupom inválido.');
  }
  const normalizado = codigo.trim().toUpperCase();
  if (normalizado.length > 40) {
    throw new ValidationError('Cupom inválido.');
  }
  return normalizado;
}

function validarEmail(email) {
  if (typeof email !== 'string') {
    throw new ValidationError('E-mail obrigatório.');
  }
  const clean = email.trim().toLowerCase();
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!regex.test(clean)) {
    throw new ValidationError('E-mail inválido.');
  }
  return clean;
}

function validarData(data) {
  if (typeof data !== 'string') {
    throw new ValidationError('Data é obrigatória (YYYY-MM-DD).');
  }
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(data)) {
    throw new ValidationError('Data inválida. Use o formato YYYY-MM-DD.');
  }
  const [y, m, d] = data.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new ValidationError('Data inválida.');
  }
  return data;
}

function validarHora(hora) {
  if (typeof hora !== 'string') {
    throw new ValidationError('Hora é obrigatória (HH:MM).');
  }
  const regex = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!regex.test(hora)) {
    throw new ValidationError('Hora inválida. Use o formato HH:MM (24h).');
  }
  return hora;
}

function validarSlotId(id) {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new ValidationError('slot_id é obrigatório.');
  }
  return id.trim();
}

const IDADE_MINIMA = 18;

function validarDataNascimento(dataISO) {
  if (typeof dataISO !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) {
    throw new ValidationError('Data de nascimento inválida (use o formato YYYY-MM-DD).');
  }
  const [y, m, d] = dataISO.split('-').map(Number);
  const nasc = new Date(Date.UTC(y, m - 1, d));
  if (
    nasc.getUTCFullYear() !== y ||
    nasc.getUTCMonth() !== m - 1 ||
    nasc.getUTCDate() !== d
  ) {
    throw new ValidationError('Data de nascimento inválida.');
  }

  const hoje = new Date();
  let idade = hoje.getUTCFullYear() - y;
  const jaFezAniv =
    hoje.getUTCMonth() > m - 1 ||
    (hoje.getUTCMonth() === m - 1 && hoje.getUTCDate() >= d);
  if (!jaFezAniv) idade -= 1;

  if (idade < IDADE_MINIMA) {
    throw new ValidationError(
      `Você precisa ter pelo menos ${IDADE_MINIMA} anos para fazer a reserva.`
    );
  }
  if (idade > 120) {
    throw new ValidationError('Data de nascimento inválida.');
  }
  return dataISO;
}

const TERMOS_VERSAO_ATUAL = '1.0.0';

function validarAceiteTermos(body) {
  const termos = body.aceite_termos === true || body.aceite_termos === 'true';
  const privacidade =
    body.aceite_privacidade === true || body.aceite_privacidade === 'true';
  if (!termos || !privacidade) {
    throw new ValidationError(
      'Você precisa aceitar os Termos de Uso e a Política de Privacidade.'
    );
  }
  return {
    termos: true,
    privacidade: true,
    timestamp: new Date().toISOString(),
  };
}

function validarPrecoPorPessoa(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError('Preço por pessoa inválido.');
  }
  if (n > 10000) {
    throw new ValidationError('Preço por pessoa acima do permitido.');
  }
  return Math.round(n * 100) / 100;
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
    this.status = 409;
  }
}

module.exports = {
  MIN_PARTICIPANTS,
  MAX_PARTICIPANTS,
  IDADE_MINIMA,
  TERMOS_VERSAO_ATUAL,
  validarQuantidade,
  validarNome,
  validarCpf,
  validarCupom,
  validarEmail,
  validarData,
  validarHora,
  validarSlotId,
  validarDataNascimento,
  validarPrecoPorPessoa,
  validarAceiteTermos,
  ValidationError,
  ConflictError,
};
