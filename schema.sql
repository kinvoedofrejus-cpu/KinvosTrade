-- Schéma D1 pour le journal de trading XAUUSD
-- À exécuter une fois sur la base D1 (voir README, étape "Créer la base D1")

CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,        -- "ACHAT" | "VENTE"
  price REAL,
  sl REAL,
  tp REAL,
  tf TEXT,
  takenTf TEXT,            -- timeframe réellement pris (choisi par l'utilisateur après "Finir le trade")
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

-- Abonnés payants : reçoivent les signaux en même temps que l'admin
CREATE TABLE IF NOT EXISTS subscribers (
  chatId TEXT PRIMARY KEY,
  addedAt TEXT NOT NULL,
  expiresAt TEXT,          -- "AAAA-MM-JJ", NULL = sans expiration
  active INTEGER NOT NULL DEFAULT 1,
  reminderSentAt TEXT,      -- expiresAt pour laquelle un rappel a déjà été envoyé (évite les doublons)
  expiredNotifiedAt TEXT    -- expiresAt pour laquelle la notification d'expiration a déjà été envoyée
);

-- Petite table clé/valeur pour l'état du bot (ex: dernier signal envoyé,
-- pour éviter d'envoyer deux fois le même signal à la suite)
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Tous ceux qui ont démarré le bot (admin, abonnés, prospects) : langue choisie
CREATE TABLE IF NOT EXISTS users (
  chatId TEXT PRIMARY KEY,
  lang TEXT NOT NULL DEFAULT 'fr',   -- "fr" | "en"
  createdAt TEXT NOT NULL
);

-- Historique des paiements (audit) — FedaPay et NOWPayments (USDT TRC20)
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  chatId TEXT NOT NULL,
  provider TEXT NOT NULL,     -- "fedapay" | "nowpayments"
  providerRef TEXT,           -- id de la transaction/du paiement chez le prestataire
  amount REAL,
  currency TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- "pending" | "paid" | "failed"
  createdAt TEXT NOT NULL,
  paidAt TEXT
);
