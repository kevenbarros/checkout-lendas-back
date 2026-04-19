const {
  listarCupons,
  criarCupom,
  atualizarCupom,
  deletarCupom,
} = require('../services/cupomService');

function checkAdminToken(req) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return;
  const header = req.headers['x-admin-token'];
  if (header !== token) {
    const err = new Error('Acesso negado.');
    err.status = 401;
    throw err;
  }
}

async function getCupons(req, res, next) {
  try {
    checkAdminToken(req);
    const cupons = await listarCupons();
    return res.json({ cupons });
  } catch (err) {
    next(err);
  }
}

async function postCupom(req, res, next) {
  try {
    checkAdminToken(req);
    const cupom = await criarCupom(req.body || {});
    return res.status(201).json({ cupom });
  } catch (err) {
    next(err);
  }
}

async function putCupom(req, res, next) {
  try {
    checkAdminToken(req);
    const { id } = req.params;
    const cupom = await atualizarCupom(id, req.body || {});
    return res.json({ cupom });
  } catch (err) {
    next(err);
  }
}

async function deleteCupom(req, res, next) {
  try {
    checkAdminToken(req);
    const { id } = req.params;
    await deletarCupom(id);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { getCupons, postCupom, putCupom, deleteCupom };
