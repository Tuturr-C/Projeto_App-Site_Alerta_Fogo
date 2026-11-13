const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const bd = require('./db'); // banco, agrupamento de focos e consultas

const app = express();
const PORT = process.env.PORT || 3000;

// Este arquivo fica numa pasta ao lado de html, css, Icons, fonts (ex.: Projeto/json/).
// O site (html, css, Icons, fonts) fica na pasta de cima.
const RAIZ_SITE = path.join(__dirname, '..');
// Só estas pastas ficam públicas (assim o banco e o server.js não são expostos).
// Se tiver outra pasta usada pelo site (ex.: 'img'), acrescente aqui.
const PASTAS_PUBLICAS = ['html', 'css', 'js', 'Icons', 'fonts'];

// ---------- Upload da foto ----------
fs.mkdirSync(bd.UPLOAD_DIR, { recursive: true });

const EXT_POR_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const upload = multer({
  storage: multer.diskStorage({
    destination: bd.UPLOAD_DIR,
    // nome aleatório: nunca use o nome original enviado pelo usuário
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + EXT_POR_MIME[file.mimetype]),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10 MB, 1 foto
  fileFilter: (req, file, cb) =>
    cb(null, Object.prototype.hasOwnProperty.call(EXT_POR_MIME, file.mimetype)),
});

const TIPOS = ['vegetacao', 'fumaca', 'outro'];
const ORIGENS = ['mapa', 'endereco', 'gps'];

// ---------- Arquivos estáticos ----------
console.log('Raiz do site:', path.resolve(RAIZ_SITE));
PASTAS_PUBLICAS.forEach((pasta) => {
  const caminho = path.join(RAIZ_SITE, pasta);
  if (!fs.existsSync(caminho)) {
    console.warn(`AVISO: a pasta "${pasta}" não existe em ${path.resolve(RAIZ_SITE)}`);
  }
  app.use('/' + pasta, express.static(caminho));
});
app.use('/uploads', express.static(bd.UPLOAD_DIR));
app.get('/', (req, res) => res.redirect('/html/Main.html'));

// ---------- Receber um relato ----------
app.post('/api/relatos', upload.single('foto'), (req, res) => {
  const foto = req.file;
  const limpar = () => foto && fs.unlink(foto.path, () => {});

  try {
    const latitude = parseFloat(req.body.latitude);
    const longitude = parseFloat(req.body.longitude);
    const descricao = (req.body.descricao || '').trim();
    const tipo = req.body.tipo;
    const origem = ORIGENS.includes(req.body.origem_local) ? req.body.origem_local : 'mapa';

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
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

    // grava o relato e já o coloca no foco certo (novo ou já existente perto dali)
    const resultado = bd.registrarRelato({
      tipo,
      descricao,
      local_nome: (req.body.local_nome || '').trim().slice(0, 300) || null,
      origem_local: origem,
      latitude,
      longitude,
      foto_arquivo: foto ? foto.filename : null,
      foto_mime: foto ? foto.mimetype : null,
    });

    res.status(201).json({ ok: true, ...resultado });
  } catch (err) {
    console.error(err);
    limpar();
    res.status(500).json({ erro: 'Erro ao salvar o relato.' });
  }
});

// ---------- Consultas ----------
// Lê ?lat=&lng=&raio_km= (opcionais)
function parametrosDeBusca(q) {
  return {
    lat: parseFloat(q.lat),
    lng: parseFloat(q.lng),
    raioKm: parseFloat(q.raio_km) || 10,
  };
}

// Focos: cada item tem total_alertas e a lista de relatos dele.
app.get('/api/focos', (req, res) => {
  try {
    res.json(bd.listarFocos(parametrosDeBusca(req.query)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar focos.' });
  }
});

app.get('/api/focos/:id', (req, res) => {
  try {
    const foco = bd.buscarFoco(parseInt(req.params.id, 10));
    if (!foco) return res.status(404).json({ erro: 'Foco não encontrado.' });
    res.json(foco);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar o foco.' });
  }
});

// Lista simples de relatos, sem agrupar (cada um traz o foco_id).
app.get('/api/relatos', (req, res) => {
  try {
    res.json(bd.listarRelatos(parametrosDeBusca(req.query)));
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