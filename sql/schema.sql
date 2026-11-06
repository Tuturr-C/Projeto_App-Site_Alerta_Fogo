-- Alerte Fogo: esquema PostgreSQL + PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE tipo_ocorrencia AS ENUM ('vegetacao', 'fumaca', 'outro');

CREATE TABLE relatos (
  id            BIGSERIAL PRIMARY KEY,
  tipo          tipo_ocorrencia NOT NULL,
  descricao     VARCHAR(500)    NOT NULL CHECK (length(btrim(descricao)) > 0),
  local_nome    VARCHAR(300),                       -- ex.: "Jardim Ipê, próximo ao parque"
  origem_local  VARCHAR(10)     NOT NULL CHECK (origem_local IN ('mapa', 'endereco', 'gps')),
  localizacao   GEOGRAPHY(Point, 4326) NOT NULL,    -- ponto (longitude, latitude)
  foto_arquivo  TEXT,                               -- nome do arquivo salvo em uploads/
  foto_mime     VARCHAR(50),
  criado_em     TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- índice espacial: acelera consultas "focos perto de mim"
CREATE INDEX idx_relatos_localizacao ON relatos USING GIST (localizacao);
CREATE INDEX idx_relatos_criado_em   ON relatos (criado_em DESC);
