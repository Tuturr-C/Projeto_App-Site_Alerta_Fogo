// Banco de dados do Alerte Fogo (SQLite).
// Usado pelo server.js (site) e pelo gerenciar.js (linha de comando).
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// ---------- Regras de agrupamento (mude aqui se quiser) ----------
// Um relato novo entra num foco já existente quando:
//  - está a até RAIO_AGRUPAMENTO_M metros da posição do foco; e
//  - o foco recebeu o último relato há no máximo JANELA_HORAS horas.
// Caso contrário, nasce um foco novo.
const RAIO_AGRUPAMENTO_M = 300;
const JANELA_HORAS = 24;

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'alerte_fogo.db');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// ---------- Abre o banco e cria/atualiza as tabelas ----------
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS focos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  latitude      REAL NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
  longitude     REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  local_nome    TEXT,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS relatos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  foco_id       INTEGER REFERENCES focos(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL CHECK (tipo IN ('vegetacao', 'fumaca', 'outro')),
  descricao     TEXT NOT NULL CHECK (length(trim(descricao)) > 0 AND length(descricao) <= 500),
  local_nome    TEXT,
  origem_local  TEXT NOT NULL CHECK (origem_local IN ('mapa', 'endereco', 'gps')),
  latitude      REAL NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
  longitude     REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  foto_arquivo  TEXT,
  foto_mime     TEXT,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Migração: bancos criados na versão anterior não tinham a coluna foco_id.
const colunasRelatos = db.prepare('PRAGMA table_info(relatos)').all().map((c) => c.name);
if (!colunasRelatos.includes('foco_id')) {
  db.exec('ALTER TABLE relatos ADD COLUMN foco_id INTEGER REFERENCES focos(id) ON DELETE CASCADE');
}

db.exec(`
CREATE INDEX IF NOT EXISTS idx_relatos_foco  ON relatos (foco_id);
CREATE INDEX IF NOT EXISTS idx_relatos_coord ON relatos (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_relatos_data  ON relatos (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_focos_coord   ON focos (latitude, longitude);
`);

// ---------- Distância (fórmula de Haversine) ----------
function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371; // raio médio da Terra em km
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// "Caixa" ao redor de um ponto: 1° de latitude ≈ 111,32 km; a longitude encolhe com cos(latitude)
function caixaEmTornoDe(lat, lng, raioKm) {
  const dLat = raioKm / 111.32;
  const dLng = raioKm / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return { latMin: lat - dLat, latMax: lat + dLat, lngMin: lng - dLng, lngMax: lng + dLng };
}

// ---------- Consultas preparadas ----------
const FOTO_URL = `CASE WHEN foto_arquivo IS NULL THEN NULL ELSE '/uploads/' || foto_arquivo END`;
const COLUNAS_RELATO = `id, foco_id, tipo, descricao, local_nome, latitude, longitude, criado_em, ${FOTO_URL} AS foto_url`;
const COLUNAS_FOCO = `f.id, f.latitude, f.longitude, f.local_nome, f.criado_em, f.atualizado_em,
  (SELECT COUNT(*) FROM relatos r WHERE r.foco_id = f.id) AS total_alertas`;

const stmt = {
  inserirRelato: db.prepare(`
    INSERT INTO relatos (tipo, descricao, local_nome, origem_local, latitude, longitude, foto_arquivo, foto_mime)
    VALUES (@tipo, @descricao, @local_nome, @origem_local, @latitude, @longitude, @foto_arquivo, @foto_mime)`),

  focosNaCaixa: db.prepare(`
    SELECT id, latitude, longitude FROM focos
    WHERE latitude BETWEEN @latMin AND @latMax
      AND longitude BETWEEN @lngMin AND @lngMax
      AND atualizado_em >= datetime(@ref, @janela)`),
  inserirFoco: db.prepare(`
    INSERT INTO focos (latitude, longitude, local_nome, criado_em, atualizado_em)
    VALUES (@latitude, @longitude, @nome, datetime(@ref), datetime(@ref))`),
  atualizarFoco: db.prepare(`
    UPDATE focos SET atualizado_em = datetime(@ref), local_nome = COALESCE(local_nome, @nome)
    WHERE id = @id`),
  vincularRelato: db.prepare('UPDATE relatos SET foco_id = ? WHERE id = ?'),
  contarAlertas: db.prepare('SELECT COUNT(*) AS total FROM relatos WHERE foco_id = ?'),

  focosRecentes: db.prepare(`
    SELECT ${COLUNAS_FOCO} FROM focos f
    WHERE EXISTS (SELECT 1 FROM relatos r WHERE r.foco_id = f.id)
    ORDER BY f.atualizado_em DESC, f.id DESC LIMIT 200`),
  focosNaCaixaComTotal: db.prepare(`
    SELECT ${COLUNAS_FOCO} FROM focos f
    WHERE f.latitude BETWEEN @latMin AND @latMax
      AND f.longitude BETWEEN @lngMin AND @lngMax
      AND EXISTS (SELECT 1 FROM relatos r WHERE r.foco_id = f.id)`),
  focoPorId: db.prepare(`SELECT ${COLUNAS_FOCO} FROM focos f WHERE f.id = ?`),
  relatosDoFoco: db.prepare(`SELECT ${COLUNAS_RELATO} FROM relatos WHERE foco_id = ? ORDER BY id`),

  relatosRecentes: db.prepare(`SELECT ${COLUNAS_RELATO} FROM relatos ORDER BY id DESC LIMIT 200`),
  relatosNaCaixa: db.prepare(`
    SELECT ${COLUNAS_RELATO} FROM relatos
    WHERE latitude BETWEEN @latMin AND @latMax
      AND longitude BETWEEN @lngMin AND @lngMax`),

  semFoco: db.prepare(`
    SELECT id, latitude, longitude, local_nome, criado_em FROM relatos
    WHERE foco_id IS NULL ORDER BY id`),
};

// ---------- Agrupamento: coloca um relato no foco certo (ou cria um) ----------
// `ref` é o momento do relato: 'now' para relatos novos, ou o criado_em de relatos antigos.
function associarAoFoco(r, ref) {
  const caixa = caixaEmTornoDe(r.latitude, r.longitude, RAIO_AGRUPAMENTO_M / 1000);
  const candidatos = stmt.focosNaCaixa.all({
    latMin: caixa.latMin, latMax: caixa.latMax,
    lngMin: caixa.lngMin, lngMax: caixa.lngMax,
    ref, janela: `-${JANELA_HORAS} hours`,
  });

  // entre os focos próximos, escolhe o mais perto que esteja dentro do raio
  let melhor = null;
  let melhorDist = Infinity;
  for (const f of candidatos) {
    const metros = distanciaKm(r.latitude, r.longitude, f.latitude, f.longitude) * 1000;
    if (metros <= RAIO_AGRUPAMENTO_M && metros < melhorDist) {
      melhor = f;
      melhorDist = metros;
    }
  }

  let focoId;
  let novo = false;
  if (melhor) {
    focoId = melhor.id;
    stmt.atualizarFoco.run({ id: focoId, ref, nome: r.local_nome || null });
  } else {
    const info = stmt.inserirFoco.run({
      latitude: r.latitude, longitude: r.longitude, nome: r.local_nome || null, ref,
    });
    focoId = Number(info.lastInsertRowid);
    novo = true;
  }
  stmt.vincularRelato.run(focoId, r.id);
  return { focoId, novo };
}

// Relatos que já existiam antes desta versão (sem foco) entram nos focos automaticamente.
const antigos = stmt.semFoco.all();
if (antigos.length) {
  db.transaction(() => {
    for (const r of antigos) associarAoFoco(r, r.criado_em);
  })();
}

// ---------- Funções usadas pelo servidor ----------

// `d` precisa ter exatamente: tipo, descricao, local_nome, origem_local,
// latitude, longitude, foto_arquivo, foto_mime
const registrarRelato = db.transaction((d) => {
  const id = Number(stmt.inserirRelato.run(d).lastInsertRowid);
  const { focoId, novo } = associarAoFoco(
    { id, latitude: d.latitude, longitude: d.longitude, local_nome: d.local_nome }, 'now'
  );
  const { total } = stmt.contarAlertas.get(focoId);
  return { id, foco_id: focoId, novo_foco: novo, total_alertas: total };
});

function comRelatos(foco) {
  return { ...foco, relatos: stmt.relatosDoFoco.all(foco.id) };
}

// Focos (cada um com total_alertas e a lista de relatos).
// Com lat/lng, devolve só os próximos, do mais perto ao mais longe.
function listarFocos({ lat, lng, raioKm } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return stmt.focosRecentes.all().map(comRelatos);
  }
  const raio = Math.min(Math.max(raioKm || 10, 0.1), 200);
  return stmt.focosNaCaixaComTotal.all(caixaEmTornoDe(lat, lng, raio))
    .map((f) => ({ ...f, distancia_km: distanciaKm(lat, lng, f.latitude, f.longitude) }))
    .filter((f) => f.distancia_km <= raio)
    .sort((a, b) => a.distancia_km - b.distancia_km)
    .slice(0, 200)
    .map(comRelatos);
}

function buscarFoco(id) {
  const foco = stmt.focoPorId.get(id);
  return foco && foco.total_alertas > 0 ? comRelatos(foco) : null;
}

// Lista simples de relatos (sem agrupar). Com lat/lng, só os próximos.
function listarRelatos({ lat, lng, raioKm } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return stmt.relatosRecentes.all();
  const raio = Math.min(Math.max(raioKm || 10, 0.1), 200);
  return stmt.relatosNaCaixa.all(caixaEmTornoDe(lat, lng, raio))
    .map((r) => ({ ...r, distancia_km: distanciaKm(lat, lng, r.latitude, r.longitude) }))
    .filter((r) => r.distancia_km <= raio)
    .sort((a, b) => a.distancia_km - b.distancia_km)
    .slice(0, 200);
}

// ---------- Exclusão (usada pelo gerenciar.js) ----------

function apagarFotos(nomes) {
  let apagadas = 0;
  for (const nome of nomes) {
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(nome)));
      apagadas++;
    } catch { /* a foto já não existia */ }
  }
  return apagadas;
}

// Apaga relatos pelos ids, as fotos deles e os focos que ficarem sem nenhum relato.
function apagarRelatos(ids) {
  if (!ids.length) return { relatos: 0, focos: 0, fotos: 0 };
  const marcas = ids.map(() => '?').join(',');
  const fotos = db
    .prepare(`SELECT foto_arquivo FROM relatos WHERE id IN (${marcas}) AND foto_arquivo IS NOT NULL`)
    .all(...ids)
    .map((r) => r.foto_arquivo);

  const resultado = db.transaction(() => {
    const r = db.prepare(`DELETE FROM relatos WHERE id IN (${marcas})`).run(...ids);
    const f = db.prepare(
      'DELETE FROM focos WHERE id NOT IN (SELECT foco_id FROM relatos WHERE foco_id IS NOT NULL)'
    ).run();
    return { relatos: r.changes, focos: f.changes };
  })();

  return { ...resultado, fotos: apagarFotos(fotos) };
}

const idsDoFoco = (focoId) =>
  db.prepare('SELECT id FROM relatos WHERE foco_id = ?').all(focoId).map((r) => r.id);

const idsPorDescricao = (texto) =>
  db.prepare('SELECT id FROM relatos WHERE descricao = ? COLLATE NOCASE').all(texto).map((r) => r.id);

// Esvazia tudo e faz a contagem de ids voltar para 1.
function apagarTudo() {
  const resultado = db.transaction(() => {
    const r = db.prepare('DELETE FROM relatos').run();
    const f = db.prepare('DELETE FROM focos').run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('relatos', 'focos')").run();
    return { relatos: r.changes, focos: f.changes };
  })();

  let fotos = 0;
  if (fs.existsSync(UPLOAD_DIR)) {
    fotos = apagarFotos(fs.readdirSync(UPLOAD_DIR).filter((n) => /\.(jpe?g|png|webp)$/i.test(n)));
  }
  return { ...resultado, fotos };
}

module.exports = {
  db, DB_PATH, UPLOAD_DIR, RAIO_AGRUPAMENTO_M, JANELA_HORAS,
  distanciaKm, registrarRelato, listarFocos, buscarFoco, listarRelatos,
  apagarRelatos, idsDoFoco, idsPorDescricao, apagarTudo,
};