# XAUUSD Signal Bot

Bot de signaux (RSI combiné M1/M5/M15) pour XAUUSD. **Ne prend aucune position** — envoie une notification Telegram uniquement. Aucune connexion à MT5 ou à ton compte prop firm.

Chaque signal Telegram a maintenant des boutons :
1. **✅ Prendre ce trade** → si tu l'as pris, tu cliques dessus. Le message devient "en cours".
2. **🏁 Finir le trade** → quand c'est terminé, tu cliques dessus.
3. **🎯 TP touché** / **🛑 SL touché** → tu choisis le résultat. Le trade est enregistré dans ton journal.

Tu peux ensuite recevoir ton journal en PDF directement dans Telegram en tapant `/journal` (ou `/journal 2026-08-01 2026-08-31` pour une période précise), ou via une URL dans le navigateur si tu préfères.

## Déploiement depuis Android (sans PC), via GitHub + Cloudflare

### 1. Mettre le code sur GitHub
1. Crée un nouveau repo sur GitHub (app GitHub ou github.com depuis le navigateur mobile), ex: `xauusd-signal-bot`
2. Upload les fichiers de ce dossier en gardant la même structure :
   - `src/index.js`
   - `wrangler.toml`
   - `package.json`
   - `README.md`
   - Sur l'app GitHub ou via `github.dev/TON_USER/xauusd-signal-bot` (navigateur mobile) tu peux créer les fichiers/dossiers directement et coller le contenu.

### 2. Créer la base D1 sur Cloudflare
1. Va sur **dash.cloudflare.com** → **Workers & Pages** → **D1**
2. Crée une base, ex: `xauusd-signal-bot-db`
3. Copie l'**ID** généré et remplace `REMPLACE_MOI_AVEC_TON_ID_D1` dans `wrangler.toml` sur GitHub
4. Ouvre l'onglet **Console** de ta base D1 et exécute le contenu de `schema.sql` (copier-coller) pour créer les tables `trades` et `meta`

### 3. Connecter le repo à Cloudflare Workers
1. Dans le dashboard Cloudflare → **Workers & Pages** → **Create** → **Connect to Git**
2. Sélectionne ton repo `xauusd-signal-bot`
3. Cloudflare détecte `wrangler.toml`, installe les dépendances (`package.json` inclut `pdf-lib`) et configure le déploiement automatiquement
4. Valide — le Worker se déploie

### 4. Ajouter les secrets (jamais dans le code)
Dans le dashboard Cloudflare → ton Worker → **Settings** → **Variables** → **Add secret** :
- `TWELVE_DATA_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_WEBHOOK_SECRET` (optionnel — invente une chaîne aléatoire, ex. `mon-secret-123`, sert à sécuriser le webhook)

### 5. Vérifier le binding D1
Dans **Settings** → **Bindings**, vérifie que `DB` pointe bien vers la base D1 créée à l'étape 2.

### 6. Activer les boutons Telegram (webhook) + la commande /journal
Ouvre une seule fois dans ton navigateur (Android ou autre) :
```
https://xauusd-signal-bot.<ton-sous-domaine>.workers.dev/setup-webhook
```
Ça enregistre automatiquement l'URL de ton Worker auprès de Telegram, et déclare la commande `/journal` dans le menu du bot. Tu dois voir `"ok": true` pour `webhook` et `commands` dans la réponse. À refaire seulement si l'URL de ton Worker change.

### 7. Tester
Ouvre `https://xauusd-signal-bot.<ton-sous-domaine>.workers.dev/` — ça déclenche une analyse immédiate. Si un signal est détecté, tu reçois la notification Telegram avec le bouton **✅ Prendre ce trade**.

Le cron (toutes les 5 min) tournera ensuite automatiquement.

## Récupérer le journal de trading en PDF

**Option 1 — directement dans Telegram (recommandé) :**
Tape dans le chat avec ton bot :
```
/journal
/journal 2026-08-01 2026-08-31
```
Le bot t'envoie le PDF en pièce jointe, avec la liste des trades, le winrate et le total en "R" (1R = risque initial ; TP = +2R, SL = -1R avec les réglages actuels). Les dates sont optionnelles (format `AAAA-MM-JJ`) — sans elles, tout l'historique est exporté.

**Option 2 — via le navigateur :**
```
https://xauusd-signal-bot.<ton-sous-domaine>.workers.dev/journal.pdf?from=2026-08-01&to=2026-08-31
```
Mêmes paramètres `from`/`to` optionnels.

## Prochaines évolutions possibles
- Ajuster le ratio SL/TP (actuellement 1.5x / 3x ATR)
- Ajuster le seuil de confirmation (actuellement 2 timeframes sur 3)
- Ajouter un filtre de tendance (EMA) pour réduire les faux signaux
- Ajouter un prix de clôture réel (au lieu de TP/SL théorique) pour un calcul de gain plus précis
