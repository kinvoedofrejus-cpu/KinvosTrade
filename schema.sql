-- Schéma D1 pour le journal de trading XAUUSD
-- À exécuter une fois sur la base D1 (voir README, étape "Créer la base D1")

CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,        -- "ACHAT" | "VENTE"
  price REAL,
  sl REAL,
  tp REAL,
  tf TEXT,
  sentAt TEXT NOT NULL,      -- ISO 8601
  status TEXT NOT NULL,      -- "signal" | "taken" | "closed"
  takenAt TEXT,
  result TEXT,               -- "TP" | "SL" | NULL
  closedAt TEXT,
  chatId TEXT,
  messageId INTEGER,
  baseMessage TEXT
);

CREATE INDEX IF NOT EXISTS idx_trades_sentAt ON trades(sentAt);

-- Petite table clé/valeur pour l'état du bot (ex: dernier signal envoyé,
-- pour éviter d'envoyer deux fois le même signal à la suite)
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
