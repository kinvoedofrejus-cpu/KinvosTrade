// XAUUSD Signal Bot — Cloudflare Worker
// Ne prend AUCUNE position. Envoie des signaux via Telegram + journal de trading manuel.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const SYMBOL = "XAU/USD";
const INTERVALS = ["5min"];
const RSI_PERIOD = 14;
const ATR_PERIOD = 14;
const OVERBOUGHT = 70;
const OVERSOLD = 30;
const RSI_LOOKBACK = 20; // nombre de valeurs RSI utilisées pour détecter un sommet/creux
const SL_ATR_MULT = 1.5;
const TP_ATR_MULT = 3;
const MIN_CONFIRMATIONS = 1; // sur 3 timeframes
const R_MULTIPLE = TP_ATR_MULT / SL_ATR_MULT; // gain en "R" si TP touché (SL touché = -1R)

// Calendrier économique : aucun signal envoyé dans cette fenêtre autour d'une annonce à fort impact
const NEWS_BLACKOUT_MINUTES = 30;
const NEWS_CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

const SUBSCRIPTION_DAYS = 30; // durée d'un abonnement payé (en jours)

// ---------------------------------------------------------------------------
// Traductions (choisies par l'utilisateur au /start — FR par défaut)
// ---------------------------------------------------------------------------

const I18N = {
  fr: {
    chooseLang: "🌍 Choisis ta langue / Choose your language",
    welcome:
      "👋 <b>Bienvenue sur KinvosTrade !</b>\n\nTu vas recevoir en continu les signaux de trading sur l'or (XAUUSD), dès qu'ils sont détectés.\n\nTu peux aussi m'écrire un message ici à tout moment — je le recevrai directement.",
    subscribeButton: "💳 S'abonner",
    durationMenuTitle: "⏳ <b>Choisis la durée de ton abonnement</b>",
    duration1Button: "1 mois",
    duration3Button: "3 mois",
    subscribeMenuTitle: "💳 <b>Choisis ton moyen de paiement</b>",
    fedapayButton: "📱 Mobile Money (FedaPay)",
    usdtButton: "₿ USDT (TRC20)",
    fedapayCreating: "⏳ Génération du lien de paiement...",
    usdtCreating: "⏳ Génération du paiement USDT...",
    payNow: "💳 Payer maintenant",
    planLabel: (days) => (days >= 90 ? "3 mois" : "1 mois"),
    fedapayLinkMsg: (amount, days) =>
      `📱 <b>Paiement Mobile Money</b>\n\nMontant : <b>${amount} FCFA</b> — ${
        days >= 90 ? "3 mois" : "1 mois"
      } d'abonnement.\nClique sur le bouton ci-dessous pour payer, ton accès s'active automatiquement après paiement.`,
    usdtLinkMsg: (amount, days) =>
      `₿ <b>Paiement USDT (TRC20)</b>\n\nMontant : <b>${amount} USD</b> — ${
        days >= 90 ? "3 mois" : "1 mois"
      } d'abonnement.\nClique sur le bouton ci-dessous pour payer, ton accès s'active automatiquement après confirmation sur la blockchain.`,
    paymentError: "❌ Impossible de générer le paiement pour le moment. Réessaie dans un instant.",
    paymentConfirmed:
      "✅ <b>Paiement confirmé !</b>\n\nTon abonnement est actif. Tu vas recevoir les prochains signaux automatiquement.",
    messageForwarded: "✅ Message envoyé à l'admin.",
    reminderMessage: (daysLeft) =>
      `⏰ <b>Ton abonnement expire dans ${daysLeft} jour${daysLeft > 1 ? "s" : ""}.</b>\n\nRenouvelle-le pour continuer à recevoir les signaux sans interruption.`,
    expiredMessage:
      "❌ <b>Ton abonnement a expiré.</b>\n\nTu ne recevras plus de signaux tant que tu ne te réabonnes pas.",
    signalBuy: "ACHAT",
    signalSell: "VENTE",
    priceLabel: "Prix",
    recommendedTFLabel: "Timeframe recommandé pour l'entrée",
    signalDisclaimer: "⚠️ Signal informatif uniquement — aucune position n'est prise automatiquement.",
  },
  en: {
    chooseLang: "🌍 Choisis ta langue / Choose your language",
    welcome:
      "👋 <b>Welcome to KinvosTrade!</b>\n\nYou'll receive gold (XAUUSD) trading signals continuously, as soon as they're detected.\n\nYou can also write me a message here anytime — I'll receive it directly.",
    subscribeButton: "💳 Subscribe",
    durationMenuTitle: "⏳ <b>Choose your subscription duration</b>",
    duration1Button: "1 month",
    duration3Button: "3 months",
    subscribeMenuTitle: "💳 <b>Choose your payment method</b>",
    fedapayButton: "📱 Mobile Money (FedaPay)",
    usdtButton: "₿ USDT (TRC20)",
    fedapayCreating: "⏳ Generating payment link...",
    usdtCreating: "⏳ Generating USDT payment...",
    payNow: "💳 Pay now",
    planLabel: (days) => (days >= 90 ? "3 months" : "1 month"),
    fedapayLinkMsg: (amount, days) =>
      `📱 <b>Mobile Money Payment</b>\n\nAmount: <b>${amount} XOF</b> — ${
        days >= 90 ? "3 months" : "1 month"
      } subscription.\nTap the button below to pay, your access activates automatically after payment.`,
    usdtLinkMsg: (amount, days) =>
      `₿ <b>USDT Payment (TRC20)</b>\n\nAmount: <b>${amount} USD</b> — ${
        days >= 90 ? "3 months" : "1 month"
      } subscription.\nTap the button below to pay, your access activates automatically after blockchain confirmation.`,
    paymentError: "❌ Couldn't generate the payment right now. Try again in a moment.",
    paymentConfirmed: "✅ <b>Payment confirmed!</b>\n\nYour subscription is active. You'll receive upcoming signals automatically.",
    messageForwarded: "✅ Message sent to the admin.",
    reminderMessage: (daysLeft) =>
      `⏰ <b>Your subscription expires in ${daysLeft} day${daysLeft > 1 ? "s" : ""}.</b>\n\nRenew it to keep receiving signals without interruption.`,
    expiredMessage: "❌ <b>Your subscription has expired.</b>\n\nYou won't receive signals until you resubscribe.",
    signalBuy: "BUY",
    signalSell: "SELL",
    priceLabel: "Price",
    recommendedTFLabel: "Recommended timeframe for entry",
    signalDisclaimer: "⚠️ Informational signal only — no position is taken automatically.",
  },
};

function t(lang) {
  return I18N[lang === "en" ? "en" : "fr"];
}

// ---------------------------------------------------------------------------
// Twelve Data
// ---------------------------------------------------------------------------

async function fetchJSON(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === "error") {
    throw new Error(`Twelve Data error: ${data.message}`);
  }
  return data;
}

async function getRSISeries(interval, apiKey) {
  const url = `https://api.twelvedata.com/rsi?symbol=${encodeURIComponent(
    SYMBOL
  )}&interval=${interval}&time_period=${RSI_PERIOD}&outputsize=${RSI_LOOKBACK}&apikey=${apiKey}`;
  const data = await fetchJSON(url);
  return data.values.map((v) => parseFloat(v.rsi)); // values[0] = le plus récent
}

async function getATR(interval, apiKey) {
  const url = `https://api.twelvedata.com/atr?symbol=${encodeURIComponent(
    SYMBOL
  )}&interval=${interval}&time_period=${ATR_PERIOD}&outputsize=1&apikey=${apiKey}`;
  const data = await fetchJSON(url);
  return parseFloat(data.values[0].atr);
}

async function getPrice(apiKey) {
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(
    SYMBOL
  )}&apikey=${apiKey}`;
  const data = await fetchJSON(url);
  return parseFloat(data.price);
}

function analyzeInterval(rsiSeries) {
  const current = rsiSeries[0];
  // Seuil strict uniquement : RSI >= 70 (vente) ou RSI <= 30 (achat).
  // L'ancien déclenchement sur simple extrême local (plus haut/bas des 20 dernières
  // valeurs) est retiré — il donnait des signaux qui ne correspondaient pas.
  const sell = current >= OVERBOUGHT;
  const buy = current <= OVERSOLD;
  return { current, sell, buy };
}

// Priorité pour le timeframe "recommandé" : le plus lent parmi ceux confirmés
const TF_PRIORITY = { "15min": 3, "5min": 2, "1min": 1 };

function pickRecommendedTF(confirmedList) {
  return confirmedList.sort((a, b) => TF_PRIORITY[b] - TF_PRIORITY[a])[0];
}

function formatLabel(tf) {
  return { "1min": "M1", "5min": "M5", "15min": "M15", "30min": "M30" }[tf];
}

// ---------------------------------------------------------------------------
// Calendrier économique (annonces à fort impact)
// ---------------------------------------------------------------------------

// Récupère les événements USD à fort impact de la semaine (source : ForexFactory).
// Retourne { ok: false } en cas d'échec technique, pour distinguer "pas d'annonce cette semaine"
// (ok: true, events: []) d'une vraie panne — les deux cas ne doivent pas être traités pareil.
async function fetchHighImpactEvents() {
  try {
    const res = await fetch(NEWS_CALENDAR_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const events = data
      .filter((e) => e.impact === "High" && e.country === "USD" && e.date)
      .map((e) => new Date(e.date).getTime())
      .filter((t) => !Number.isNaN(t));
    return { ok: true, events };
  } catch (err) {
    console.error("Calendrier économique indisponible:", err.message);
    return { ok: false, events: [] };
  }
}

// Vrai si "now" tombe à moins de NEWS_BLACKOUT_MINUTES d'un événement à fort impact.
function isInNewsBlackout(nowMs, eventTimestamps) {
  const windowMs = NEWS_BLACKOUT_MINUTES * 60 * 1000;
  return eventTimestamps.some((t) => Math.abs(nowMs - t) <= windowMs);
}

// ---------------------------------------------------------------------------
// Telegram helpers
// ---------------------------------------------------------------------------

function tgUrl(token, method) {
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function sendTelegramMessage(token, chatId, text, replyMarkup) {
  const res = await fetch(tgUrl(token, "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error("sendTelegramMessage a échoué :", JSON.stringify(data));
  }
  return data.result; // contient message_id
}

async function editTelegramMessage(token, chatId, messageId, text, replyMarkup) {
  await fetch(tgUrl(token, "editMessageText"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    }),
  });
}

async function answerCallbackQuery(token, callbackQueryId, text) {
  await fetch(tgUrl(token, "answerCallbackQuery"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
      show_alert: false,
    }),
  });
}

async function setTelegramWebhook(token, url, secretToken) {
  const res = await fetch(tgUrl(token, "setWebhook"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secretToken || undefined,
      allowed_updates: ["callback_query", "message"],
    }),
  });
  return res.json();
}

async function setTelegramCommands(token, adminChatId) {
  // Menu public (abonnés) : juste de quoi récupérer son propre chat_id
  const publicRes = await fetch(tgUrl(token, "setMyCommands"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commands: [
        { command: "start", description: "Démarrer / Start" },
        { command: "chatid", description: "Obtenir mon chat_id Telegram" },
      ],
    }),
  });

  // Menu admin (visible uniquement dans le chat de l'admin) : commandes complètes
  const adminRes = await fetch(tgUrl(token, "setMyCommands"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scope: { type: "chat", chat_id: adminChatId },
      commands: [
        { command: "journal", description: "Recevoir le journal de trading en PDF" },
        { command: "admin", description: "Ouvrir le menu admin (gestion des abonnés)" },
      ],
    }),
  });

  return { public: await publicRes.json(), admin: await adminRes.json() };
}

// Envoie un fichier (le PDF du journal) directement dans le chat Telegram
async function sendTelegramDocument(token, chatId, filename, bytes, caption) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) form.append("caption", caption);
  form.append("document", new Blob([bytes], { type: "application/pdf" }), filename);
  const res = await fetch(tgUrl(token, "sendDocument"), { method: "POST", body: form });
  return res.json();
}

// Boutons selon l'étape du trade
function takeKeyboard(id) {
  return { inline_keyboard: [[{ text: "✅ Prendre ce trade", callback_data: `take:${id}` }]] };
}
function finishKeyboard(id) {
  return { inline_keyboard: [[{ text: "🏁 Finir le trade", callback_data: `finish:${id}` }]] };
}
function resultKeyboard(id) {
  return {
    inline_keyboard: [
      [
        { text: "🎯 TP touché", callback_data: `tp:${id}` },
        { text: "🛑 SL touché", callback_data: `sl:${id}` },
      ],
    ],
  };
}
function timeframeKeyboard(id) {
  return {
    inline_keyboard: [[{ text: "M5", callback_data: `tf:5min:${id}` }]],
  };
}

// ---------------------------------------------------------------------------
// Menu admin (gestion des abonnés, tout par boutons)
// ---------------------------------------------------------------------------

function adminMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "➕ Ajouter un abonné", callback_data: "admin:addsub" }],
      [{ text: "📋 Liste des abonnés", callback_data: "admin:listsubs" }],
      [{ text: "📊 Statistiques", callback_data: "admin:stats" }],
      [{ text: "🗑️ Réinitialiser mon journal", callback_data: "admin:resetjournal" }],
    ],
  };
}

function backToAdminMenuKeyboard() {
  return { inline_keyboard: [[{ text: "⬅️ Retour au menu", callback_data: "admin:menu" }]] };
}

function subscriberListKeyboard(subs) {
  const buttons = subs
    .filter((s) => s.active)
    .map((s) => [{ text: `🗑️ Retirer ${s.chatId}`, callback_data: `admin:rm:${s.chatId}` }]);
  buttons.push([{ text: "⬅️ Retour au menu", callback_data: "admin:menu" }]);
  return { inline_keyboard: buttons };
}

function formatSubscriberList(subs) {
  if (!subs.length) return "Aucun abonné enregistré.";
  return subs
    .map(
      (s) =>
        `${s.active ? "✅" : "❌"} <code>${s.chatId}</code> — ${
          s.expiresAt ? `expire le ${s.expiresAt}` : "sans expiration"
        }`
    )
    .join("\n");
}

function languageKeyboard() {
  return {
    inline_keyboard: [[{ text: "🇫🇷 Français", callback_data: "lang:fr" }, { text: "🇬🇧 English", callback_data: "lang:en" }]],
  };
}

function subscribeButtonKeyboard(lang) {
  return { inline_keyboard: [[{ text: t(lang).subscribeButton, callback_data: "subscribe:menu" }]] };
}

function durationKeyboard(lang) {
  return {
    inline_keyboard: [
      [{ text: t(lang).duration1Button, callback_data: "subscribe:duration:30" }],
      [{ text: t(lang).duration3Button, callback_data: "subscribe:duration:90" }],
    ],
  };
}

function paymentMethodKeyboard(lang, days) {
  return {
    inline_keyboard: [
      [{ text: t(lang).fedapayButton, callback_data: `subscribe:pay:fedapay:${days}` }],
      [{ text: t(lang).usdtButton, callback_data: `subscribe:pay:usdt:${days}` }],
    ],
  };
}

function payLinkKeyboard(lang, url) {
  return { inline_keyboard: [[{ text: t(lang).payNow, url }]] };
}

// ---------------------------------------------------------------------------
// Journal de trading (stocké dans D1, table "trades")
// ---------------------------------------------------------------------------

async function saveTrade(env, trade) {
  await env.DB.prepare(
    `INSERT INTO trades (id, type, price, sl, tp, tf, takenTf, sentAt, status, takenAt, result, closedAt, chatId, messageId, baseMessage)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       takenAt = excluded.takenAt,
       takenTf = excluded.takenTf,
       result = excluded.result,
       closedAt = excluded.closedAt`
  )
    .bind(
      trade.id,
      trade.type,
      trade.price,
      trade.sl,
      trade.tp,
      trade.tf,
      trade.takenTf || null,
      trade.sentAt,
      trade.status,
      trade.takenAt,
      trade.result,
      trade.closedAt,
      String(trade.chatId),
      trade.messageId,
      trade.baseMessage
    )
    .run();
}

async function getTrade(env, id) {
  return env.DB.prepare(`SELECT * FROM trades WHERE id = ?1`).bind(id).first();
}

async function listTrades(env, chatId, from, to) {
  // Le journal ne présente que les trades réellement pris (statut "taken" ou "closed"),
  // pas les simples signaux envoyés mais jamais pris — et uniquement ceux du destinataire
  // qui demande le journal (chacun ne voit que ses propres trades).
  const conditions = [`status IN ('taken', 'closed')`, `chatId = ?1`];
  const params = [String(chatId)];
  if (from) {
    conditions.push(`sentAt >= ?${params.length + 1}`);
    params.push(from);
  }
  if (to) {
    conditions.push(`sentAt <= ?${params.length + 1}`);
    params.push(`${to}T23:59:59`);
  }
  let query = `SELECT * FROM trades WHERE ${conditions.join(" AND ")}`;
  query += ` ORDER BY sentAt ASC`;
  const { results } = await env.DB.prepare(query)
    .bind(...params)
    .all();
  return results;
}

async function getLastSignal(env) {
  const row = await env.DB.prepare(`SELECT value FROM meta WHERE key = 'last_signal'`).first();
  return row ? row.value : null;
}

async function setLastSignal(env, value) {
  await env.DB.prepare(
    `INSERT INTO meta (key, value) VALUES ('last_signal', ?1)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )
    .bind(value)
    .run();
}

// ---------------------------------------------------------------------------
// Abonnés payants (reçoivent les signaux en même temps que l'admin)
// ---------------------------------------------------------------------------

function isAdmin(env, chatId) {
  return String(chatId) === String(env.TELEGRAM_CHAT_ID);
}

// Petit état conversationnel pour le menu admin (ex: "en attente du chat_id à ajouter")
async function getAdminState(env) {
  const row = await env.DB.prepare(`SELECT value FROM meta WHERE key = 'admin_state'`).first();
  return row ? row.value : null;
}
async function setAdminState(env, value) {
  if (value === null) {
    await env.DB.prepare(`DELETE FROM meta WHERE key = 'admin_state'`).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO meta (key, value) VALUES ('admin_state', ?1)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
      .bind(value)
      .run();
  }
}

async function addSubscriber(env, chatId, expiresAt) {
  await env.DB.prepare(
    `INSERT INTO subscribers (chatId, addedAt, expiresAt, active)
     VALUES (?1, ?2, ?3, 1)
     ON CONFLICT(chatId) DO UPDATE SET expiresAt = excluded.expiresAt, active = 1`
  )
    .bind(String(chatId), new Date().toISOString(), expiresAt || null)
    .run();
}

async function removeSubscriber(env, chatId) {
  await env.DB.prepare(`UPDATE subscribers SET active = 0 WHERE chatId = ?1`)
    .bind(String(chatId))
    .run();
}

// Abonnés actifs : active = 1 ET (pas de date d'expiration OU expiration pas encore atteinte)
async function listActiveSubscribers(env) {
  const today = new Date().toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    `SELECT chatId, expiresAt FROM subscribers
     WHERE active = 1 AND (expiresAt IS NULL OR expiresAt >= ?1)`
  )
    .bind(today)
    .all();
  return results;
}

// Envoie un rappel (une seule fois par échéance) aux abonnés dont l'abonnement
// expire dans les 3 prochains jours, avec un bouton pour renouveler.
async function sendExpiryReminders(env) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const in3Days = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { results } = await env.DB.prepare(
    `SELECT chatId, expiresAt FROM subscribers
     WHERE active = 1 AND expiresAt IS NOT NULL AND expiresAt >= ?1 AND expiresAt <= ?2
       AND (reminderSentAt IS NULL OR reminderSentAt != expiresAt)`
  )
    .bind(todayStr, in3Days)
    .all();

  for (const sub of results) {
    try {
      const lang = await getUserLang(env, sub.chatId);
      const daysLeft = Math.max(
        1,
        Math.ceil((new Date(`${sub.expiresAt}T00:00:00Z`).getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
      );
      await sendTelegramMessage(
        env.TELEGRAM_BOT_TOKEN,
        sub.chatId,
        t(lang).reminderMessage(daysLeft),
        subscribeButtonKeyboard(lang)
      );
      await env.DB.prepare(`UPDATE subscribers SET reminderSentAt = ?1 WHERE chatId = ?2`)
        .bind(sub.expiresAt, sub.chatId)
        .run();
    } catch (err) {
      console.error(`Rappel d'expiration ${sub.chatId}:`, err.message);
    }
  }
}

// Notifie (une seule fois par échéance) les abonnés dont l'abonnement vient d'expirer,
// et les désactive (ils ne recevront plus de signaux tant qu'ils ne repaient pas).
async function notifyExpiredSubscribers(env) {
  const todayStr = new Date().toISOString().slice(0, 10);

  const { results } = await env.DB.prepare(
    `SELECT chatId, expiresAt FROM subscribers
     WHERE active = 1 AND expiresAt IS NOT NULL AND expiresAt < ?1
       AND (expiredNotifiedAt IS NULL OR expiredNotifiedAt != expiresAt)`
  )
    .bind(todayStr)
    .all();

  for (const sub of results) {
    try {
      const lang = await getUserLang(env, sub.chatId);
      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, sub.chatId, t(lang).expiredMessage, subscribeButtonKeyboard(lang));
      await env.DB.prepare(`UPDATE subscribers SET active = 0, expiredNotifiedAt = ?1 WHERE chatId = ?2`)
        .bind(sub.expiresAt, sub.chatId)
        .run();
    } catch (err) {
      console.error(`Notification d'expiration ${sub.chatId}:`, err.message);
    }
  }
}

async function listAllSubscribers(env) {
  const { results } = await env.DB.prepare(
    `SELECT chatId, addedAt, expiresAt, active FROM subscribers ORDER BY addedAt DESC`
  ).all();
  return results;
}

// Supprime définitivement tous les trades d'un destinataire (réinitialisation de son journal)
async function resetJournal(env, chatId) {
  await env.DB.prepare(`DELETE FROM trades WHERE chatId = ?1`).bind(String(chatId)).run();
}

// ---------------------------------------------------------------------------
// Utilisateurs (langue choisie au /start) + historique des paiements
// ---------------------------------------------------------------------------

async function setUserLang(env, chatId, lang) {
  await env.DB.prepare(
    `INSERT INTO users (chatId, lang, createdAt) VALUES (?1, ?2, ?3)
     ON CONFLICT(chatId) DO UPDATE SET lang = excluded.lang`
  )
    .bind(String(chatId), lang, new Date().toISOString())
    .run();
}

async function getUserLang(env, chatId) {
  const row = await env.DB.prepare(`SELECT lang FROM users WHERE chatId = ?1`).bind(String(chatId)).first();
  return row ? row.lang : "fr";
}

async function logPayment(env, payment) {
  await env.DB.prepare(
    `INSERT INTO payments (id, chatId, provider, providerRef, amount, currency, status, createdAt, paidAt)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, providerRef = excluded.providerRef, paidAt = excluded.paidAt`
  )
    .bind(
      payment.id,
      String(payment.chatId),
      payment.provider,
      payment.providerRef || null,
      payment.amount || null,
      payment.currency || null,
      payment.status,
      payment.createdAt,
      payment.paidAt || null
    )
    .run();
}

// ---------------------------------------------------------------------------
// FedaPay (Mobile Money / carte) — création de transaction + lien de paiement
// ---------------------------------------------------------------------------

function fedapayBaseUrl(env) {
  return env.FEDAPAY_ENV === "sandbox" ? "https://sandbox-api.fedapay.com" : "https://api.fedapay.com";
}

// Crée une transaction FedaPay pour un abonnement, avec le chat_id de l'abonné
// glissé dans custom_metadata pour que le webhook sache à qui l'attribuer.
// Montant selon la durée choisie (30 jours = 1 mois, 90 jours = 3 mois)
function planAmountXOF(env, days) {
  return Number(days >= 90 ? env.FEDAPAY_AMOUNT_3M_XOF || 10000 : env.FEDAPAY_AMOUNT_1M_XOF || 5000);
}
function planAmountUSD(env, days) {
  return Number(days >= 90 ? env.NOWPAYMENTS_AMOUNT_3M_USD || 25 : env.NOWPAYMENTS_AMOUNT_1M_USD || 10);
}

async function createFedaPayPaymentLink(env, chatId, days, callbackUrl) {
  const base = fedapayBaseUrl(env);
  const amount = planAmountXOF(env, days);

  const createRes = await fetch(`${base}/v1/transactions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.FEDAPAY_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: `Abonnement KinvosTrade - ${days >= 90 ? "3 mois" : "1 mois"}`,
      amount,
      currency: { iso: "XOF" },
      callback_url: callbackUrl,
      custom_metadata: { chatId: String(chatId), days: String(days) },
    }),
  });
  if (!createRes.ok) throw new Error(`FedaPay create transaction: HTTP ${createRes.status}`);
  const created = await createRes.json();
  const transactionId = created["v1/transaction"]?.id || created.id;

  const tokenRes = await fetch(`${base}/v1/transactions/${transactionId}/token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.FEDAPAY_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!tokenRes.ok) throw new Error(`FedaPay token: HTTP ${tokenRes.status}`);
  const tokenData = await tokenRes.json();
  const url = tokenData.url || tokenData["v1/token"]?.url;

  return { transactionId, url, amount };
}

// Vérifie la signature FedaPay (X-FEDAPAY-SIGNATURE: "t=<timestamp>,s=<hmac>")
async function verifyFedaPaySignature(rawBody, sigHeader, secret) {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(sigHeader.split(",").map((p) => p.split("=")));
  if (!parts.t || !parts.s) return false;
  const signedPayload = `${parts.t}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = [...new Uint8Array(sigBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return expected === parts.s;
}

// ---------------------------------------------------------------------------
// NOWPayments (USDT TRC20) — page de paiement hébergée + vérification IPN
// ---------------------------------------------------------------------------

async function createNowPaymentsInvoice(env, chatId, days, ipnCallbackUrl) {
  const amount = planAmountUSD(env, days);
  const orderId = `sub_${days}d_${chatId}_${Date.now()}`;

  const res = await fetch("https://api.nowpayments.io/v1/invoice", {
    method: "POST",
    headers: {
      "x-api-key": env.NOWPAYMENTS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      price_amount: amount,
      price_currency: "usd",
      pay_currency: "usdttrc20",
      order_id: orderId,
      order_description: `Abonnement KinvosTrade - ${days >= 90 ? "3 mois" : "1 mois"}`,
      ipn_callback_url: ipnCallbackUrl,
    }),
  });
  if (!res.ok) throw new Error(`NOWPayments create invoice: HTTP ${res.status}`);
  const data = await res.json();
  return { orderId, invoiceUrl: data.invoice_url, amount };
}

// Signature IPN NOWPayments : HMAC-SHA512 du JSON dont les clés sont triées récursivement
function sortObjectDeep(obj) {
  if (Array.isArray(obj)) return obj.map(sortObjectDeep);
  if (obj && typeof obj === "object") {
    return Object.keys(obj)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortObjectDeep(obj[key]);
        return acc;
      }, {});
  }
  return obj;
}

async function verifyNowPaymentsSignature(parsedBody, sigHeader, secret) {
  if (!sigHeader) return false;
  const sortedJson = JSON.stringify(sortObjectDeep(parsedBody));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(sortedJson));
  const expected = [...new Uint8Array(sigBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return expected === sigHeader;
}

// ---------------------------------------------------------------------------
// Analyse + envoi du signal
// ---------------------------------------------------------------------------

async function runAnalysis(env) {
  const apiKey = env.TWELVE_DATA_API_KEY;

  const results = {};
  for (const interval of INTERVALS) {
    const series = await getRSISeries(interval, apiKey);
    results[interval] = analyzeInterval(series);
  }

  // Snapshot RSI actuel par timeframe — inclus dans chaque retour pour le diagnostic (route "/")
  const rsiSnapshot = Object.fromEntries(
    INTERVALS.map((tf) => [formatLabel(tf), Number(results[tf].current.toFixed(1))])
  );

  const sellConfirmed = INTERVALS.filter((tf) => results[tf].sell);
  const buyConfirmed = INTERVALS.filter((tf) => results[tf].buy);

  let signalType = null;
  let confirmedList = [];

  if (sellConfirmed.length >= MIN_CONFIRMATIONS) {
    signalType = "VENTE";
    confirmedList = sellConfirmed;
  } else if (buyConfirmed.length >= MIN_CONFIRMATIONS) {
    signalType = "ACHAT";
    confirmedList = buyConfirmed;
  }

  if (!signalType) {
    return { signalType: null, rsi: rsiSnapshot };
  }

  const calendar = await fetchHighImpactEvents();
  if (!calendar.ok) {
    return { signalType: null, rsi: rsiSnapshot, skipped: "calendrier économique indisponible — blocage de sécurité" };
  }
  if (isInNewsBlackout(Date.now(), calendar.events)) {
    return { signalType: null, rsi: rsiSnapshot, skipped: "news blackout (annonce à fort impact ±30min)" };
  }

  const recommendedTF = pickRecommendedTF(confirmedList);
  const price = await getPrice(apiKey);
  const atr = await getATR(recommendedTF, apiKey);

  const sl = signalType === "ACHAT" ? price - SL_ATR_MULT * atr : price + SL_ATR_MULT * atr;
  const tp = signalType === "ACHAT" ? price + TP_ATR_MULT * atr : price - TP_ATR_MULT * atr;

  const emoji = signalType === "ACHAT" ? "🟢" : "🔴";
  const rsiLines = INTERVALS.map((tf) => {
    const r = results[tf];
    const confirmed = confirmedList.includes(tf) ? "✅" : "";
    return `RSI ${formatLabel(tf)}: ${r.current.toFixed(1)} ${confirmed}`;
  }).join("\n");

  // Construit le message dans la langue du destinataire (label ACHAT/VENTE traduit,
  // les chiffres et le RSI restent universels).
  function buildSignalMessage(lang) {
    const L = t(lang);
    const label = signalType === "ACHAT" ? L.signalBuy : L.signalSell;
    return (
      `${emoji} <b>SIGNAL ${label} — XAUUSD</b>\n\n` +
      `${L.priceLabel}: ${price.toFixed(2)}\n` +
      `${rsiLines}\n\n` +
      `➡️ ${L.recommendedTFLabel}: <b>${formatLabel(recommendedTF)}</b>\n` +
      `SL: ${sl.toFixed(2)}\n` +
      `TP: ${tp.toFixed(2)}\n\n` +
      `${L.signalDisclaimer}`
    );
  }

  const id = crypto.randomUUID();
  const sentAt = new Date().toISOString();

  // Envoi à toi (admin) + à chaque abonné actif, chacun avec ses propres boutons,
  // son propre suivi de trade (journal personnel), et sa propre langue.
  const recipients = [String(env.TELEGRAM_CHAT_ID)];
  const subscribers = await listActiveSubscribers(env);
  for (const sub of subscribers) {
    if (!recipients.includes(sub.chatId)) recipients.push(sub.chatId);
  }

  let notified = 0;
  for (const recipientChatId of recipients) {
    try {
      const lang = await getUserLang(env, recipientChatId);
      const message = buildSignalMessage(lang);
      const tradeId = recipientChatId === String(env.TELEGRAM_CHAT_ID) ? id : crypto.randomUUID();
      const sent = await sendTelegramMessage(
        env.TELEGRAM_BOT_TOKEN,
        recipientChatId,
        message,
        takeKeyboard(tradeId)
      );
      await saveTrade(env, {
        id: tradeId,
        type: signalType,
        price,
        sl,
        tp,
        tf: recommendedTF,
        sentAt,
        status: "signal", // signal -> taken -> closed
        takenAt: null,
        result: null, // "TP" | "SL"
        closedAt: null,
        chatId: recipientChatId,
        messageId: sent ? sent.message_id : null,
        baseMessage: message,
      });
      notified += 1;
    } catch (err) {
      console.error(`Échec envoi signal à ${recipientChatId}:`, err.message);
    }
  }

  await setLastSignal(env, signalType);

  return { signalType, price, sl, tp, recommendedTF, notified, rsi: rsiSnapshot };
}

// ---------------------------------------------------------------------------
// Webhook Telegram (clics sur les boutons)
// ---------------------------------------------------------------------------

async function handleTelegramUpdate(env, update, origin) {
  if (update.callback_query && update.callback_query.data) {
    await handleCallbackQuery(env, update.callback_query, origin);
  } else if (update.message && update.message.text) {
    await handleMessage(env, update.message, origin);
  }
}

// Commandes tapées dans le chat (ex: /journal, /journal 2026-08-01 2026-08-31)
async function handleMessage(env, message, origin) {
  const text = message.text.trim();
  const chatId = message.chat.id;

  // Si l'admin a cliqué "Ajouter/Retirer un abonné" dans le menu, ce message est la réponse attendue
  if (isAdmin(env, chatId) && !text.startsWith("/")) {
    const state = await getAdminState(env);
    if (state === "awaiting_addsub") {
      const [subChatId, expiresAt] = text.split(/\s+/);
      await addSubscriber(env, subChatId, expiresAt);
      await setAdminState(env, null);
      await sendTelegramMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        `✅ Abonné ajouté : <code>${subChatId}</code>${
          expiresAt ? ` (expire le ${expiresAt})` : " (sans expiration)"
        }`,
        adminMenuKeyboard()
      );
      return;
    }
    if (state === "awaiting_removesub") {
      const [subChatId] = text.split(/\s+/);
      await removeSubscriber(env, subChatId);
      await setAdminState(env, null);
      await sendTelegramMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        `🗑️ Abonné retiré : <code>${subChatId}</code>`,
        adminMenuKeyboard()
      );
      return;
    }
  }

  if (text.startsWith("/admin")) {
    if (!isAdmin(env, chatId)) return;
    await setAdminState(env, null);
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "🛠️ <b>Espace administrateur</b>", adminMenuKeyboard());
    return;
  }

  if (text.startsWith("/start")) {
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, t("fr").chooseLang, languageKeyboard());
    return;
  }

  // Réponse admin à un abonné : /reply CHAT_ID message...
  if (text.startsWith("/reply")) {
    if (!isAdmin(env, chatId)) return;
    const [, targetChatId, ...rest] = text.split(/\s+/);
    const replyText = rest.join(" ");
    if (!targetChatId || !replyText) {
      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Usage : <code>/reply CHAT_ID ton message</code>");
      return;
    }
    const lang = await getUserLang(env, targetChatId);
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, targetChatId, `💬 <b>${lang === "en" ? "Message from admin" : "Message de l'admin"}</b>\n\n${replyText}`);
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "✅ Réponse envoyée.");
    return;
  }

  if (text.startsWith("/chatid")) {
    await sendTelegramMessage(
      env.TELEGRAM_BOT_TOKEN,
      message.chat.id,
      `Ton chat_id : <code>${message.chat.id}</code>`
    );
    return;
  }

  if (text.startsWith("/journal")) {
    // Ouvert à tous (admin + abonnés) : chacun ne reçoit que son propre journal,
    // filtré par son chat_id — pas d'accès aux trades des autres.
    const token = env.TELEGRAM_BOT_TOKEN;
    const [, from, to] = text.split(/\s+/);

    const trades = await listTrades(env, message.chat.id, from, to);
    const pdfBytes = await generateJournalPDF(trades, from, to);
    await sendTelegramDocument(
      token,
      message.chat.id,
      "journal-trading-xauusd.pdf",
      pdfBytes,
      `Journal de trading — ${from || "début"} → ${to || "aujourd'hui"}`
    );
    return;
  }

  // Tout autre message texte, envoyé par quelqu'un d'autre que l'admin, lui est transmis
  // directement — c'est le canal "écris-moi depuis ton espace" demandé.
  if (!text.startsWith("/") && !isAdmin(env, chatId)) {
    const lang = await getUserLang(env, chatId);
    await sendTelegramMessage(
      env.TELEGRAM_BOT_TOKEN,
      env.TELEGRAM_CHAT_ID,
      `📩 <b>Message de</b> <code>${chatId}</code> :\n\n${text}\n\n<i>Réponds avec /reply ${chatId} ta réponse</i>`
    );
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, t(lang).messageForwarded);
  }
}

async function handleCallbackQuery(env, cq, origin) {
  const token = env.TELEGRAM_BOT_TOKEN;

  if (cq.data.startsWith("admin:")) {
    await handleAdminCallback(env, cq);
    return;
  }

  if (cq.data.startsWith("lang:")) {
    const lang = cq.data.split(":")[1];
    const chatId = cq.message.chat.id;
    await setUserLang(env, chatId, lang);
    await editTelegramMessage(token, chatId, cq.message.message_id, t(lang).welcome, subscribeButtonKeyboard(lang));
    await answerCallbackQuery(token, cq.id, "");
    return;
  }

  if (cq.data.startsWith("subscribe:")) {
    await handleSubscribeCallback(env, cq, origin);
    return;
  }

  // Format habituel "action:id" (take, finish, tp, sl) ou "tf:1min:id" pour le choix du timeframe.
  const parts = cq.data.split(":");
  const action = parts[0];
  const id = parts[parts.length - 1];
  const tfChoice = parts.length === 3 ? parts[1] : null;
  const trade = await getTrade(env, id);

  if (!trade) {
    await answerCallbackQuery(token, cq.id, "Trade introuvable (peut-être expiré).");
    return;
  }

  const chatId = trade.chatId;
  const messageId = trade.messageId;

  if (action === "take") {
    trade.status = "taken";
    trade.takenAt = new Date().toISOString();
    await saveTrade(env, trade);
    await editTelegramMessage(
      token,
      chatId,
      messageId,
      `${trade.baseMessage}\n\n📌 <b>Trade pris</b> — en cours...`,
      finishKeyboard(id)
    );
    await answerCallbackQuery(token, cq.id, "Trade marqué comme pris ✅");
  } else if (action === "finish") {
    await editTelegramMessage(
      token,
      chatId,
      messageId,
      `${trade.baseMessage}\n\n📌 <b>Trade pris</b> — sur quel timeframe l'as-tu pris ?`,
      timeframeKeyboard(id)
    );
    await answerCallbackQuery(token, cq.id, "Choisis le timeframe");
  } else if (action === "tf") {
    trade.takenTf = tfChoice;
    await saveTrade(env, trade);
    await editTelegramMessage(
      token,
      chatId,
      messageId,
      `${trade.baseMessage}\n\n📌 <b>Trade pris sur ${formatLabel(tfChoice)}</b> — comment s'est-il terminé ?`,
      resultKeyboard(id)
    );
    await answerCallbackQuery(token, cq.id, `Timeframe : ${formatLabel(tfChoice)}`);
  } else if (action === "tp" || action === "sl") {
    trade.status = "closed";
    trade.result = action === "tp" ? "TP" : "SL";
    trade.closedAt = new Date().toISOString();
    await saveTrade(env, trade);
    const resultEmoji = action === "tp" ? "🎯" : "🛑";
    const rMultText = action === "tp" ? `+${R_MULTIPLE.toFixed(1)}R` : "-1R";
    await editTelegramMessage(
      token,
      chatId,
      messageId,
      `${trade.baseMessage}\n\n${resultEmoji} <b>Trade clôturé : ${trade.result}</b> (${rMultText})`,
      undefined
    );
    await answerCallbackQuery(token, cq.id, `Trade clôturé : ${trade.result}`);
  }
}

// Gère les clics du menu admin ("admin:menu", "admin:addsub", "admin:listsubs", "admin:rm:<chatId>", "admin:stats")
async function handleAdminCallback(env, cq) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;

  if (!isAdmin(env, chatId)) {
    await answerCallbackQuery(token, cq.id, "Réservé à l'admin.");
    return;
  }

  const parts = cq.data.split(":"); // "admin", action, [extra]
  const action = parts[1];

  if (action === "menu") {
    await setAdminState(env, null);
    await editTelegramMessage(token, chatId, messageId, "🛠️ <b>Espace administrateur</b>", adminMenuKeyboard());
    await answerCallbackQuery(token, cq.id, "");
  } else if (action === "addsub") {
    await setAdminState(env, "awaiting_addsub");
    await editTelegramMessage(
      token,
      chatId,
      messageId,
      "➕ <b>Ajouter un abonné</b>\n\nEnvoie le chat_id, en option suivi d'une date d'expiration :\n<code>123456789</code>\nou\n<code>123456789 2026-12-31</code>",
      backToAdminMenuKeyboard()
    );
    await answerCallbackQuery(token, cq.id, "");
  } else if (action === "listsubs") {
    const subs = await listAllSubscribers(env);
    await editTelegramMessage(
      token,
      chatId,
      messageId,
      `📋 <b>Abonnés</b>\n\n${formatSubscriberList(subs)}`,
      subscriberListKeyboard(subs)
    );
    await answerCallbackQuery(token, cq.id, "");
  } else if (action === "rm") {
    const subChatId = parts[2];
    await removeSubscriber(env, subChatId);
    const subs = await listAllSubscribers(env);
    await editTelegramMessage(
      token,
      chatId,
      messageId,
      `📋 <b>Abonnés</b>\n\n${formatSubscriberList(subs)}`,
      subscriberListKeyboard(subs)
    );
    await answerCallbackQuery(token, cq.id, `Retiré : ${subChatId}`);
  } else if (action === "stats") {
    const active = await listActiveSubscribers(env);
    const all = await listAllSubscribers(env);
    const today = new Date();
    const in7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const expiringSoon = active.filter((s) => s.expiresAt && s.expiresAt <= in7Days);
    const statsText =
      `📊 <b>Statistiques</b>\n\n` +
      `Abonnés actifs : <b>${active.length}</b>\n` +
      `Total (historique) : ${all.length}\n` +
      `Expirent sous 7 jours : ${expiringSoon.length}` +
      (expiringSoon.length
        ? `\n${expiringSoon.map((s) => `  • <code>${s.chatId}</code> (${s.expiresAt})`).join("\n")}`
        : "");
    await editTelegramMessage(token, chatId, messageId, statsText, backToAdminMenuKeyboard());
    await answerCallbackQuery(token, cq.id, "");
  } else if (action === "resetjournal") {
    await editTelegramMessage(
      token,
      chatId,
      messageId,
      "⚠️ <b>Réinitialiser ton journal ?</b>\n\nTous tes trades enregistrés seront supprimés définitivement. Cette action est irréversible.",
      {
        inline_keyboard: [
          [{ text: "✅ Oui, tout supprimer", callback_data: "admin:resetjournal_confirm" }],
          [{ text: "❌ Annuler", callback_data: "admin:menu" }],
        ],
      }
    );
    await answerCallbackQuery(token, cq.id, "");
  } else if (action === "resetjournal_confirm") {
    await resetJournal(env, chatId);
    await editTelegramMessage(
      token,
      chatId,
      messageId,
      "🗑️ <b>Journal réinitialisé</b>\n\nTous tes trades ont été supprimés.",
      backToAdminMenuKeyboard()
    );
    await answerCallbackQuery(token, cq.id, "Journal réinitialisé");
  }
}

// Gère le choix du moyen de paiement d'un abonné ("subscribe:menu", "subscribe:fedapay", "subscribe:usdt")
async function handleSubscribeCallback(env, cq, origin) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;
  const lang = await getUserLang(env, chatId);
  const parts = cq.data.split(":"); // "subscribe", step, [...]
  const step = parts[1];

  if (step === "menu") {
    await editTelegramMessage(token, chatId, messageId, t(lang).durationMenuTitle, durationKeyboard(lang));
    await answerCallbackQuery(token, cq.id, "");
    return;
  }

  if (step === "duration") {
    const days = Number(parts[2]);
    await editTelegramMessage(token, chatId, messageId, t(lang).subscribeMenuTitle, paymentMethodKeyboard(lang, days));
    await answerCallbackQuery(token, cq.id, "");
    return;
  }

  if (step === "pay") {
    const provider = parts[2];
    const days = Number(parts[3]);

    if (provider === "fedapay") {
      await answerCallbackQuery(token, cq.id, t(lang).fedapayCreating);
      try {
        const { transactionId, url, amount } = await createFedaPayPaymentLink(
          env,
          chatId,
          days,
          origin || "https://t.me"
        );
        await logPayment(env, {
          id: `fedapay_${transactionId}`,
          chatId,
          provider: "fedapay",
          providerRef: String(transactionId),
          amount,
          currency: "XOF",
          status: "pending",
          createdAt: new Date().toISOString(),
        });
        await sendTelegramMessage(token, chatId, t(lang).fedapayLinkMsg(amount, days), payLinkKeyboard(lang, url));
      } catch (err) {
        console.error("FedaPay:", err.message);
        await sendTelegramMessage(token, chatId, t(lang).paymentError);
      }
      return;
    }

    if (provider === "usdt") {
      await answerCallbackQuery(token, cq.id, t(lang).usdtCreating);
      try {
        const ipnUrl = `${origin || ""}/webhook/nowpayments`;
        const { orderId, invoiceUrl, amount } = await createNowPaymentsInvoice(env, chatId, days, ipnUrl);
        await logPayment(env, {
          id: orderId,
          chatId,
          provider: "nowpayments",
          providerRef: orderId,
          amount,
          currency: "USD",
          status: "pending",
          createdAt: new Date().toISOString(),
        });
        await sendTelegramMessage(token, chatId, t(lang).usdtLinkMsg(amount, days), payLinkKeyboard(lang, invoiceUrl));
      } catch (err) {
        console.error("NOWPayments:", err.message);
        await sendTelegramMessage(token, chatId, t(lang).paymentError);
      }
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Génération du journal PDF
// ---------------------------------------------------------------------------

// Convertit une date ISO (stockée en UTC) vers l'heure UTC+1, format "AAAA-MM-JJ HH:MM"
function formatDateUTC1(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  d.setHours(d.getUTCHours() + 1);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours()
  )}:${pad(d.getUTCMinutes())}`;
}

const MONTH_NAMES_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

// Clé "AAAA-MM" (en UTC+1, comme le reste de l'affichage du journal)
function monthKeyUTC1(iso) {
  const d = new Date(iso);
  d.setHours(d.getUTCHours() + 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES_FR[parseInt(m, 10) - 1]} ${y}`;
}

// Regroupe des trades (déjà triés par sentAt croissant) par mois, dans l'ordre chronologique
function groupTradesByMonth(trades) {
  const groups = new Map();
  for (const t of trades) {
    const key = monthKeyUTC1(t.sentAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}

async function generateJournalPDF(trades, from, to) {
  const doc = await PDFDocument.create();
  doc.setTitle("Journal de trading — KinvosTrade_Bot");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const margin = 40;
  const rowHeight = 22;
  const contentWidth = pageWidth - margin * 2;

  // Palette "or / trading"
  const navy = rgb(0.06, 0.09, 0.16);
  const gold = rgb(0.83, 0.68, 0.21);
  const lightGold = rgb(0.97, 0.94, 0.85);
  const white = rgb(1, 1, 1);
  const textDark = rgb(0.15, 0.15, 0.17);
  const textGray = rgb(0.45, 0.45, 0.48);
  const zebra = rgb(0.96, 0.96, 0.97);
  const green = rgb(0.09, 0.5, 0.24);
  const red = rgb(0.75, 0.16, 0.16);
  const lineGray = rgb(0.82, 0.82, 0.84);

  const closed = trades.filter((t) => t.status === "closed");
  const wins = closed.filter((t) => t.result === "TP").length;
  const losses = closed.filter((t) => t.result === "SL").length;
  const totalR = wins * R_MULTIPLE - losses;
  const winrate = closed.length ? ((wins / closed.length) * 100).toFixed(1) : "0.0";

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight;
  let pageNum = 1;

  function drawText(text, x, yy, options = {}) {
    page.drawText(text, {
      x,
      y: yy,
      size: options.size || 10,
      font: options.bold ? bold : font,
      color: options.color || textDark,
    });
  }

  function drawRect(x, yy, w, h, color) {
    page.drawRectangle({ x, y: yy, width: w, height: h, color });
  }

  function drawFooter() {
    const genDate = formatDateUTC1(new Date().toISOString());
    page.drawLine({
      start: { x: margin, y: 34 },
      end: { x: pageWidth - margin, y: 34 },
      thickness: 0.5,
      color: lineGray,
    });
    drawText(`KinvosTrade_Bot — genere le ${genDate} (UTC+1)`, margin, 20, {
      size: 8,
      color: textGray,
    });
    drawText(`Page ${pageNum}`, pageWidth - margin - 40, 20, { size: 8, color: textGray });
  }

  const columns = [
    { key: "date", label: "Date (UTC+1)", x: margin + 8, w: 95 },
    { key: "type", label: "Type", x: margin + 100, w: 45 },
    { key: "price", label: "Entree", x: margin + 150, w: 55 },
    { key: "sl", label: "SL", x: margin + 205, w: 55 },
    { key: "tp", label: "TP", x: margin + 260, w: 55 },
    { key: "tf", label: "TF", x: margin + 315, w: 45 },
    { key: "status", label: "Statut", x: margin + 365, w: 60 },
    { key: "result", label: "Resultat", x: margin + 425, w: 55 },
    { key: "r", label: "R", x: margin + 485, w: 50 },
  ];

  function drawBrandHeader() {
    // Bandeau noir avec liseré or
    drawRect(0, pageHeight - 80, pageWidth, 80, navy);
    drawRect(0, pageHeight - 84, pageWidth, 4, gold);
    drawText("KinvosTrade_Bot", margin, pageHeight - 34, { size: 20, bold: true, color: gold });
    drawText("Journal de trading — XAUUSD", margin, pageHeight - 56, {
      size: 11,
      color: white,
    });
    y = pageHeight - 106;
  }

  function drawStatsCards() {
    const cards = [
      { label: "Trades clotures", value: String(closed.length), color: textDark },
      { label: "Gagnants", value: String(wins), color: green },
      { label: "Perdants", value: String(losses), color: red },
      { label: "Winrate", value: `${winrate}%`, color: textDark },
      {
        label: "Total",
        value: `${totalR >= 0 ? "+" : ""}${totalR.toFixed(1)}R`,
        color: totalR >= 0 ? green : red,
      },
    ];
    const gap = 8;
    const cardW = (contentWidth - gap * (cards.length - 1)) / cards.length;
    const cardH = 44;
    const cardY = y - cardH;
    cards.forEach((c, i) => {
      const cx = margin + i * (cardW + gap);
      drawRect(cx, cardY, cardW, cardH, lightGold);
      drawText(c.label, cx + 8, cardY + cardH - 16, { size: 8, color: textGray });
      drawText(c.value, cx + 8, cardY + 10, { size: 14, bold: true, color: c.color });
    });
    y = cardY - 18;
    drawText(`Periode : ${from || "debut"} - ${to || "aujourd'hui"}`, margin, y, {
      size: 9,
      color: textGray,
    });
    y -= 22;
  }

  function drawTableHeader() {
    drawRect(margin, y - 20, contentWidth, 24, navy);
    for (const col of columns) {
      drawText(col.label, col.x, y - 14, { bold: true, size: 9, color: white });
    }
    y -= 24;
  }

  function drawMonthBanner(label, monthTrades) {
    const monthClosed = monthTrades.filter((t) => t.status === "closed");
    const monthWins = monthClosed.filter((t) => t.result === "TP").length;
    const monthLosses = monthClosed.filter((t) => t.result === "SL").length;
    const monthR = monthWins * R_MULTIPLE - monthLosses;
    const bannerH = 22;
    drawRect(margin, y - bannerH, contentWidth, bannerH, gold);
    drawText(label, margin + 8, y - bannerH + 7, { size: 11, bold: true, color: navy });
    const summary = `${monthClosed.length} trade(s) — ${monthWins}G / ${monthLosses}P — ${
      monthR >= 0 ? "+" : ""
    }${monthR.toFixed(1)}R`;
    drawText(summary, margin + contentWidth - 8 - summary.length * 4.6, y - bannerH + 7, {
      size: 9,
      bold: true,
      color: navy,
    });
    y -= bannerH + 4;
  }

  function newPage() {
    drawFooter();
    page = doc.addPage([pageWidth, pageHeight]);
    pageNum += 1;
    y = pageHeight - margin;
  }

  function newPageIfNeeded() {
    if (y < margin + rowHeight) {
      newPage();
      drawTableHeader();
    }
  }

  drawBrandHeader();
  drawStatsCards();

  const statusLabel = { signal: "Signal", taken: "En cours", closed: "Cloture" };
  const statusColor = { signal: rgb(0.55, 0.4, 0.05), taken: rgb(0.1, 0.35, 0.6), closed: textGray };

  const monthGroups = groupTradesByMonth(trades);

  monthGroups.forEach(([key, monthTrades]) => {
    // S'assurer qu'il reste la place pour la bannière + l'en-tête avant de les dessiner
    if (y < margin + 22 + 24 + rowHeight) newPage();
    drawMonthBanner(monthLabel(key), monthTrades);
    drawTableHeader();

    monthTrades.forEach((t, idx) => {
      newPageIfNeeded();
      if (idx % 2 === 0) drawRect(margin, y - rowHeight + 6, contentWidth, rowHeight, zebra);

      const row = {
        date: formatDateUTC1(t.sentAt),
        type: t.type || "-",
        price: t.price != null ? t.price.toFixed(2) : "-",
        sl: t.sl != null ? t.sl.toFixed(2) : "-",
        tp: t.tp != null ? t.tp.toFixed(2) : "-",
        tf: t.takenTf ? formatLabel(t.takenTf) : t.tf ? formatLabel(t.tf) : "-",
        status: statusLabel[t.status] || t.status,
        result: t.result || "-",
        r: t.result === "TP" ? `+${R_MULTIPLE.toFixed(1)}` : t.result === "SL" ? "-1" : "-",
      };

      for (const col of columns) {
        let color = textDark;
        let useBold = false;
        if (col.key === "type") {
          color = t.type === "ACHAT" ? green : red;
          useBold = true;
        } else if (col.key === "status") {
          color = statusColor[t.status] || textGray;
        } else if (col.key === "result" || col.key === "r") {
          color = t.result === "TP" ? green : t.result === "SL" ? red : textGray;
          useBold = true;
        }
        drawText(String(row[col.key]), col.x, y - 14, { size: 9, color, bold: useBold });
      }
      y -= rowHeight;
    });

    y -= 6; // petit espace entre les mois
  });

  if (trades.length === 0) {
    drawText("Aucun trade enregistre sur cette periode.", margin + 8, y - 10, {
      size: 10,
      color: textGray,
    });
  }

  drawFooter();

  return doc.save();
}

// ---------------------------------------------------------------------------
// Worker entrypoint
// ---------------------------------------------------------------------------

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAnalysis(env));
    ctx.waitUntil(sendExpiryReminders(env));
    ctx.waitUntil(notifyExpiredSubscribers(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      // Webhook Telegram (clics sur les boutons Prendre / Finir / TP / SL)
      if (request.method === "POST" && url.pathname === "/webhook") {
        if (env.TELEGRAM_WEBHOOK_SECRET) {
          const header = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
          if (header !== env.TELEGRAM_WEBHOOK_SECRET) {
            return new Response("Unauthorized", { status: 401 });
          }
        }
        const update = await request.json();
        ctx.waitUntil(handleTelegramUpdate(env, update, url.origin));
        return new Response("OK");
      }

      // Webhook FedaPay : confirme un paiement Mobile Money et active l'abonnement
      if (request.method === "POST" && url.pathname === "/webhook/fedapay") {
        const rawBody = await request.text();
        const sig = request.headers.get("X-FEDAPAY-SIGNATURE") || request.headers.get("x-fedapay-signature");
        const valid = env.FEDAPAY_WEBHOOK_SECRET
          ? await verifyFedaPaySignature(rawBody, sig, env.FEDAPAY_WEBHOOK_SECRET)
          : true; // pas de secret configuré = vérification désactivée (déconseillé)
        if (!valid) return new Response("Invalid signature", { status: 401 });

        const event = JSON.parse(rawBody);
        if (event.name === "transaction.approved") {
          const entity = event.entity || event.data?.entity || {};
          const chatId = entity.custom_metadata?.chatId;
          const days = Number(entity.custom_metadata?.days || SUBSCRIPTION_DAYS);
          if (chatId) {
            const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            await addSubscriber(env, chatId, expiresAt);
            await logPayment(env, {
              id: `fedapay_${entity.id}`,
              chatId,
              provider: "fedapay",
              providerRef: String(entity.id),
              amount: entity.amount,
              currency: "XOF",
              status: "paid",
              createdAt: new Date().toISOString(),
              paidAt: new Date().toISOString(),
            });
            const lang = await getUserLang(env, chatId);
            await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, t(lang).paymentConfirmed);
          }
        }
        return new Response("OK");
      }

      // Webhook NOWPayments (IPN) : confirme un paiement USDT TRC20 et active l'abonnement
      if (request.method === "POST" && url.pathname === "/webhook/nowpayments") {
        const rawBody = await request.text();
        const parsed = JSON.parse(rawBody);
        const sig = request.headers.get("x-nowpayments-sig");
        const valid = env.NOWPAYMENTS_IPN_SECRET
          ? await verifyNowPaymentsSignature(parsed, sig, env.NOWPAYMENTS_IPN_SECRET)
          : true; // pas de secret configuré = vérification désactivée (déconseillé)
        if (!valid) return new Response("Invalid signature", { status: 401 });

        if (parsed.payment_status === "finished" || parsed.payment_status === "confirmed") {
          // order_id au format "sub_<jours>d_<chatId>_<timestamp>"
          const match = /^sub_(\d+)d_(.+)_\d+$/.exec(parsed.order_id || "");
          const days = match ? Number(match[1]) : SUBSCRIPTION_DAYS;
          const chatId = match ? match[2] : null;
          if (chatId) {
            const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            await addSubscriber(env, chatId, expiresAt);
            await logPayment(env, {
              id: parsed.order_id,
              chatId,
              provider: "nowpayments",
              providerRef: String(parsed.payment_id),
              amount: parsed.price_amount,
              currency: "USD",
              status: "paid",
              createdAt: new Date().toISOString(),
              paidAt: new Date().toISOString(),
            });
            const lang = await getUserLang(env, chatId);
            await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, t(lang).paymentConfirmed);
          }
        }
        return new Response("OK");
      }

      // Configure le webhook Telegram + la commande /journal (à visiter une seule fois depuis le navigateur)
      if (url.pathname === "/setup-webhook") {
        const webhookUrl = `${url.origin}/webhook`;
        const result = await setTelegramWebhook(
          env.TELEGRAM_BOT_TOKEN,
          webhookUrl,
          env.TELEGRAM_WEBHOOK_SECRET
        );
        const commandsResult = await setTelegramCommands(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID);
        return new Response(JSON.stringify({ webhook: result, commands: commandsResult }, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Télécharge le journal de trading en PDF : /journal.pdf?from=2026-08-01&to=2026-08-31
      // (alternative au bouton /journal dans Telegram — utile depuis un navigateur ; sans le
      // paramètre chat_id, c'est ton propre journal admin qui est renvoyé)
      if (url.pathname === "/journal.pdf") {
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        const chatId = url.searchParams.get("chat_id") || env.TELEGRAM_CHAT_ID;
        const trades = await listTrades(env, chatId, from, to);
        const pdfBytes = await generateJournalPDF(trades, from, to);
        return new Response(pdfBytes, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="journal-trading-xauusd.pdf"`,
          },
        });
      }

      // Endpoint manuel pour tester (GET https://<ton-worker>.workers.dev/)
      const result = await runAnalysis(env);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
