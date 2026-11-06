const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Banco de dados (PostgreSQL + PostGIS) ----------
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://alerte:alerte@localhost:5432/alertefogo',
});

// ---------- Upload da foto ----------
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const EXT_POR_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    // nome aleatório: nunca use o nome original enviado pelo usuário
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + EXT_POR_MIME[file.mimetype]),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10 MB, 1 foto
  fileFilter: (req, file, cb) =>
    cb(null, Object.prototype.hasOwnProperty.call(EXT_POR_MIME, file.mimetype)),
});

const TIPOS = ['vegetacao', 'fumaca', 'outro'];
const ORIGENS = ['mapa', 'endereco', 'gps'];

// ---------- Rotas ----------
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

app.post('/api/relatos', upload.single('foto'), async (req, res) => {
  const foto = req.file;
  const limpar = () => foto && fs.unlink(foto.path, () => {});

  try {
    const lat = parseFloat(req.body.latitude);
    const lng = parseFloat(req.body.longitude);
    const descricao = (req.body.descricao || '').trim();
    const tipo = req.body.tipo;
    const origem = ORIGENS.includes(req.body.origem_local) ? req.body.origem_local : 'mapa';

    if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
        !Number.isFinite(lng) || lng < -180 || lng > 180) {
      limpar();
      return res.status(400).json({ erro: 'Escolha a localização do relato.' });
    }
    if (!TIPOS.includes(tipo)) {
      limpar();
      return res.status(400).json({ erro: 'Selecione o tipo de ocorrência.' });
    }
    if (!descricao || descricao.length > 500) {
      limpar();
      return res.status(400).json({ erro: 'Descreva o que você observou (até 500 caracteres).' });
    }

    // ATENÇÃO: ST_MakePoint recebe (longitude, latitude), nessa ordem
    const { rows } = await pool.query(
      `INSERT INTO relatos
         (tipo, descricao, local_nome, origem_local, localizacao, foto_arquivo, foto_mime)
       VALUES
         ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, $7, $8)
       RETURNING id`,
      [
        tipo,
        descricao,
        (req.body.local_nome || '').trim().slice(0, 300) || null,
        origem,
        lng,
        lat,
        foto ? foto.filename : null,
        foto ? foto.mimetype : null,
      ]
    );

    res.status(201).json({ ok: true, id: rows[0].id });
  } catch (err) {
    console.error(err);
    limpar();
    res.status(500).json({ erro: 'Erro ao salvar o relato.' });
  }
});

// Lista relatos. Com ?lat=&lng=&raio_km= devolve só os próximos, ordenados por distância.
app.get('/api/relatos', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const raioKm = Math.min(parseFloat(req.query.raio_km) || 10, 200);

    const colunas = `id, tipo, descricao, local_nome, criado_em,
                     ST_Y(localizacao::geometry) AS latitude,
                     ST_X(localizacao::geometry) AS longitude`;

    const { rows } =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? await pool.query(
            `SELECT ${colunas},
                    ST_Distance(localizacao, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000 AS distancia_km
               FROM relatos
              WHERE ST_DWithin(localizacao, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
              ORDER BY distancia_km
              LIMIT 200`,
            [lng, lat, raioKm * 1000]
          )
        : await pool.query(`SELECT ${colunas} FROM relatos ORDER BY id DESC LIMIT 200`);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar relatos.' });
  }
});

// Erros do multer (arquivo grande demais etc.)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ erro: 'Foto inválida ou maior que 10 MB.' });
  }
  console.error(err);
  res.status(500).json({ erro: 'Erro interno.' });
});

app.listen(PORT, () => console.log(`Rodando em http://localhost:${PORT}`));
