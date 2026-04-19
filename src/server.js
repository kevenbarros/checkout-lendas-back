require('dotenv').config();

const express = require('express');
const cors = require('cors');

const routes = require('./routes');
const { initFirebase } = require('./config/firebase');
const { ValidationError, ConflictError } = require('./utils/validators');

const app = express();

app.use(
  cors({
    origin: (origin, cb) => cb(null, true),
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  console.log(`[req] ${req.method} ${req.originalUrl} ua=${req.headers['user-agent'] || '-'}`);
  next();
});

app.use('/', routes);

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

app.use((err, _req, res, _next) => {
  if (err instanceof ValidationError || err instanceof ConflictError) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  if (err && err.status) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error('[erro-nao-tratado]', err);
  return res.status(500).json({ error: 'Erro interno do servidor' });
});

const PORT = Number(process.env.PORT) || 3001;

async function bootstrap() {
  try {
    initFirebase();
    app.listen(PORT, () => {
      console.log(`🚀 Backend rodando em http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Falha ao iniciar servidor:', err.message);
    process.exit(1);
  }
}

bootstrap();
