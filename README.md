# Marsa Maroc AI - Bot-Centric Admin Platform

Plateforme d'administration de **bots IA métier** connectés à WhatsApp via `whatsapp-web.js`.

## Nouveau concept (v2)

Ce projet n'est plus centré sur des utilisateurs finaux authentifiés par QR/OTP.

Le produit est désormais organisé autour de **bots**:

- chaque bot a un domaine métier (ex: Commerce, Conteneur, Logistique),
- chaque bot a sa propre session WhatsApp,
- chaque bot a ses propres sources et chunks de connaissance,
- chaque bot conserve ses conversations/messages indépendamment des autres bots.

Le QR affiché dans l'admin sert uniquement à connecter WhatsApp Web pour le bot.

---

## Stack

- Backend: Node.js + Express
- Frontend: React + Vite
- DB: MySQL 8
- WhatsApp: `whatsapp-web.js`
- IA: orchestrateur prêt pour llama.cpp (`LLAMA_CPP_URL`)
- DevOps: Docker / docker-compose

---

## Arborescence (principale)

```text
backend/
  controllers/
  middlewares/
  models/
  routes/
  services/
  sql/
  utils/
  server.js
frontend/
  src/
    components/
    App.jsx
    main.jsx
docker/
  mysql/
    init.sql
docker-compose.yml
```

---

## Schéma DB principal

Tables bot-centric:

- `admins`
- `bots`
- `bot_sources`
- `bot_whatsapp_sessions`
- `bot_conversations`
- `bot_messages`
- `bot_knowledge_chunks`
- `bot_api_logs`

Le script de référence:

- `docker/mysql/init.sql`
- `backend/sql/bot_platform.sql`

---

## Variables d'environnement

### Backend (`backend/.env` ou variables Docker)

Voir `backend/.env.example`.

Variables essentielles:

- `PORT=3000`
- `DB_HOST=mysql` (avec docker-compose)
- `DB_PORT=3306`
- `DB_USER=root`
- `DB_PASSWORD=Root1234!`
- `DB_NAME=marsa_ai`
- `LLAMA_CPP_URL=http://host.docker.internal:8080` (ou autre endpoint local)
- `WWEBJS_AUTH_PATH=/app/.wwebjs_auth`
- `UPLOAD_DIR=/app/uploads/bot-sources`

### Frontend

En dev Docker/Vite, l'API passe via proxy (`/api` -> backend), rien de spécial à configurer.

Pour build statique hors proxy:

- `VITE_API_BASE_URL=https://api.example.com`

---

## Lancement avec Docker

```bash
cd /Users/walidboudarra/Desktop/marsamaroc-
docker compose up -d --build
```

Services:

- Front: `http://localhost:5173`
- API: `http://localhost:3000`
- Health: `http://localhost:3000/health`

---

## Workflow admin (résumé)

1. Se connecter admin (`admin@marsa.ma` / `Admin1234` si seed initial).
2. Créer un bot (nom, domaine, guardrails).
3. Ouvrir la section Bots et cliquer **Connecter WhatsApp**.
4. Scanner le QR généré avec WhatsApp.
5. Ajouter des sources au bot:
   - texte,
   - PDF,
   - API.
6. Le bot reçoit les messages WhatsApp, applique ses guardrails/domain, répond et enregistre l'historique.

---

## Endpoints REST (v2)

Base: `/api`

### Admin

- `POST /api/admin/login`

### Bots

- `POST /api/bots`
- `GET /api/bots`
- `GET /api/bots/:id`
- `PUT /api/bots/:id`
- `PATCH /api/bots/:id/status`
- `DELETE /api/bots/:id`

### Sources par bot

- `GET /api/bots/:id/sources`
- `POST /api/bots/:id/sources/text`
- `POST /api/bots/:id/sources/pdf`
- `POST /api/bots/:id/sources/api`
- `PUT /api/bots/:id/sources/:sourceId`
- `POST /api/bots/:id/sources/:sourceId/process`
- `GET /api/bots/:id/sources/logs/api`

### WhatsApp par bot

- `POST /api/bots/:id/whatsapp/init`
- `GET /api/bots/:id/whatsapp/status`
- `GET /api/bots/:id/whatsapp/qr`
- `POST /api/bots/:id/whatsapp/disconnect`
- `POST /api/bots/:id/whatsapp/restart`

### Conversations par bot

- `GET /api/bots/:id/conversations`
- `GET /api/bots/:id/conversations/:conversationId/messages`

---

## Guardrails IA (implémentés)

Le service IA impose:

- isolement strict par bot (`bot_id`),
- réponse limitée au domaine du bot,
- refus propre si la question semble hors domaine,
- refus propre si l'information n'existe pas dans les chunks/sources du bot,
- pas d'utilisation des sources d'un autre bot.

---

## Ancienne logique supprimée

Retiré/abandonné:

- `authorized_users`,
- inscription/login user final web,
- OTP SMS / Twilio,
- QR d'authentification utilisateur final,
- `qr_sessions`, `device_bindings`, `otp_challenges`,
- flow scan QR -> session chat web.

L'interface web est désormais centrée sur l'admin et la gestion de bots.

# Marsa Maroc - Full Stack (PFE)

Application web Marsa Maroc avec:
- backend `Node.js + Express + MySQL`
- frontend `React + Vite`
- QR d'acces utilisateur
- chat utilisateur (session + historique)
- espace admin (gestion users + approbation + historique)

## 1) Structure du projet

- `backend/` : API Express + MySQL
- `frontend/` : interface React/Vite
- `backend/sql/` : scripts SQL utilitaires/migration

## 2) Prerequis

- Node.js 18+
- npm
- MySQL (base `marsa_ai`)
- (optionnel) Docker, ngrok, cloudflared

## 3) Installation

### Backend

```bash
cd backend
npm install
```

### Frontend

```bash
cd frontend
npm install
```

## 4) Configuration

### Backend (variables d'environnement)

- `PORT` (defaut: `3000`)
- **`BASE_URL`** : URL **publique** du frontend (ngrok, domaine, etc.). Utilisée pour **générer les QR** et comme base des liens. Si absente : `PUBLIC_APP_URL` → `FRONTEND_BASE_URL` → `http://localhost:5173`.
- `PUBLIC_APP_URL` : alias optionnel de `BASE_URL`.
- `FRONTEND_BASE_URL` : ancien nom, toujours supporté (repli LAN / dev).
- `LLAMA_CPP_URL` (defaut: `http://127.0.0.1:8080`)
- **`QR_OTP_SMS_DOMAIN`** (optionnel) : hôte `@…` pour WebOTP dans le SMS. Si absent, **dérivé automatiquement** de `BASE_URL` (ex. `app.ngrok-free.app`).

Exemples :

```bash
# Local uniquement
node server.js

# QR ouverts depuis n’importe quel réseau (même URL que la barre d’adresse du front tunnelé)
BASE_URL=https://abcd-12.ngrok-free.app node server.js
```

Même clé dans `backend/.env` ou, avec Docker Compose, dans le `.env` à la racine : `BASE_URL=https://…`

### Frontend

En **`npm run dev`**, l’API est joignable via le **proxy Vite** (`/api` → backend sur le port 3000). Tu peux ouvrir le front depuis le téléphone avec `http://IP_LAN:5173` sans configurer l’URL du backend.

Si l’admin est en **`localhost`** et tu partages la connexion (hotspot), l’app **tente de remplir automatiquement** l’URL des QR avec ton IP LAN (WebRTC). Tu peux aussi fixer une URL stable dans `frontend/.env` : **`VITE_PUBLIC_FRONTEND_URL=http://TON_IP:5173`** (voir `frontend/.env.example`).

Pour un **`npm run build`** servi en statique (hors proxy), crée `frontend/.env` avec l’URL réelle de l’API, par exemple :

```env
VITE_API_BASE_URL=https://ton-backend.example.com
```

## 5) Lancement en local (meme reseau)

### Terminal 1 - Backend

```bash
cd backend
node server.js
```

(Optionnel : `BASE_URL=…` ou `FRONTEND_BASE_URL=…` si tu n’es pas en localhost.)

### Terminal 2 - Frontend

```bash
cd frontend
npm run dev -- --host 0.0.0.0 --port 5173
```

URLs:
- Front: `http://localhost:5173`
- API: `http://localhost:3000`

## 6) Acces par telephone hors reseau local (tunnels)

Quand le téléphone n’est **pas** sur le même LAN que le PC (4G, autre Wi‑Fi), le QR **ne doit pas** contenir une IP locale (`172.x`, `192.168.x`). Utilise une **URL publique** pour le frontend.

### 1) Tunnel frontend (ex. ngrok)

```bash
ngrok http 5173
```

Copie l’URL HTTPS affichée (ex. `https://abcd.ngrok-free.app`).

### 2) Backend : `BASE_URL`

Dans `backend/.env` (ou variables d’environnement) :

```env
BASE_URL=https://abcd.ngrok-free.app
```

Le backend génère alors les QR avec cette base ; **`QR_OTP_SMS_DOMAIN`** est déduit automatiquement (`abcd.ngrok-free.app`) pour le SMS WebOTP si tu actives `QR_OTP_ENABLE_SMS=1`.

### 3) Frontend : API joignable depuis le téléphone

Avec **`npm run dev`** et un tunnel sur le port **5173** uniquement, le proxy **`/api`** envoie déjà le trafic vers le backend : pas besoin d’URL d’API séparée.

Si tu sers un **build statique** (`vite build`) derrière un domaine public, définis dans `frontend/.env` :

```env
VITE_API_BASE_URL=https://URL_PUBLIQUE_DU_BACKEND:port
```

Sinon un reverse-proxy qui sert le front et proxifie `/` vers le backend.

### 4) Regénérer les QR depuis l’admin

Après changement de `BASE_URL`, **régénère** les codes QR pour qu’ils pointent vers la nouvelle URL.

## 6-bis) Lancer le projet complet avec Docker Compose

Depuis la racine du projet:

```bash
cd /Users/walidboudarra/Desktop/marsamaroc-
docker compose up --build -d
```

Verifier les services:

```bash
docker compose ps
```

Tu dois voir:
- `marsa-mysql` (3307->3306)
- `marsa-backend` (3000->3000)
- `marsa-frontend` (5173->5173)

Tests rapides:

```bash
curl http://localhost:3000/
curl http://localhost:3000/test-db
```

Arreter:

```bash
docker compose down
```

## 7) Flow fonctionnel

1. Admin se connecte
2. User s'inscrit (en attente)
3. Admin approuve le user
4. Admin genere QR
5. User scanne QR, verifie son numero, entre en session
6. User chat avec IA
7. Historique visible dans espace admin

## 8) Endpoints principaux

- `POST /admin/login`
- `POST /auth/register-user`
- `GET /admin/pending-users`
- `POST /admin/approve-user/:id`
- `GET /authorized-users`
- `POST /authorized-users/:id/generate-qr`
- `GET /user-access?token=...`
- `POST /user-session/start`
- `POST /chat`
- `GET /admin/questions-history`

## 9) Docker Hub

### Build local

```bash
cd backend
docker build -t marsa-maroc-backend .
```

### Tag

```bash
docker tag marsa-maroc-backend:latest walidboudarra/marsa-maroc-backend:latest
```

### Login

```bash
docker login
```

### Push

```bash
docker push walidboudarra/marsa-maroc-backend:latest
```

### Run image

```bash
docker run --rm -p 3000:3000 walidboudarra/marsa-maroc-backend:latest
```

## 10) Depannage rapide

- **Un téléphone affiche le code OTP, un autre écran blanc** : l’URL doit contenir **`/qr-connect?s=...`** (lien exact du QR). Si on ouvre seulement `http://IP:5173/`, la page d’accueil admin charge — ce n’est pas le flux QR. Scannez de nouveau le QR ou copiez le lien « Ouvrir le lien du QR » depuis l’admin. Si `?s=TOKEN` est sur la racine (`/?s=...`), l’app redirige automatiquement vers `/qr-connect`.
- **Deuxième téléphone** : avec le mode **page uniquement** (défaut), tout le monde voit le **même code sur l’écran** ; avec SMS activé (`QR_OTP_ENABLE_SMS=1`), le SMS part vers le numéro du titulaire du QR, mais le code reste aussi sur la page.
- Si QR ouvre `localhost`, c'est faux pour mobile: il faut une IP LAN ou une URL publique.
- Si mobile affiche `ERR_NGROK_3200`, le tunnel ngrok est offline: relancer `ngrok http 5173`.
- **Écran blanc sur `http://172.x…:5173`** : Vite refusait les hôtes non-ngrok ; c’est corrigé avec `server.allowedHosts: true` en dev. Rebuild / relancer `npm run dev`.
- **QR vers la mauvaise IP** : ouvre l’admin avec la **même base d’URL que sur le téléphone** (ex. `http://172.20.10.2:5173` si c’est l’IP du Mac sur le hotspot), puis **régénère le QR** : le backend prend l’en-tête `Origin` pour construire le lien. Avec `http://localhost:5173` seul, le QR peut encore pointer vers `localhost` (inutilisable sur le téléphone) ; dans ce cas définis `BASE_URL` ou `FRONTEND_BASE_URL` dans le `.env`, ou utilise l’URL LAN dans la barre d’adresse avant de cliquer sur « Générer QR ».
- **QR toujours en `localhost` depuis l’admin** : dans la section **Utilisateurs autorisés**, remplis le champ **« URL du front pour les QR »** (ex. `http://172.20.10.2:5173`), puis clique sur **Générer QR** ; la valeur est mémorisée dans le navigateur.
- Si page reste sur « Vérification du lien… », vérifie que le backend répond (en dev, les appels passent par `/api` → port 3000). Avec Docker : `DEV_PROXY_TARGET=http://backend:3000` sur le service frontend.

## 11) Comptes de demo (admin/user)

Utilise ces identifiants pour tester rapidement:

- **Admin**
  - Email: `admin@marsa.ma`
  - Mot de passe: `Admin1234`

- **User (exemple)**
  - Email: `boudarrawalid3@gmail.com`
  - Mot de passe: `12345678`

> Important: ces comptes sont uniquement pour la demo locale. En production, change les mots de passe et n'expose jamais ces identifiants.

## 12) OTP après scan du QR (page uniquement par défaut)

Par défaut, **aucun SMS n’est envoyé** : le code à 6 chiffres est **uniquement** renvoyé dans l’API et affiché sur la page `/qr-connect` (tout téléphone qui ouvre le lien voit le même code).

- **`QR_OTP_PEPPER`** : obligatoire en pratique (secret pour hacher l’OTP côté serveur). Voir `backend/.env.example`.

### SMS Twilio (optionnel)

Pour **en plus** envoyer un SMS au numéro du titulaire du QR :

1. Définir **`QR_OTP_ENABLE_SMS=1`** dans `backend/.env`.
2. Renseigner **Twilio** : `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` ou `TWILIO_MESSAGING_SERVICE_SID`.
3. **`QR_OTP_SMS_DOMAIN`** (optionnel) : sinon dérivé de **`BASE_URL`** pour le WebOTP dans le SMS.
4. Compte d’essai Twilio : numéros destinataires souvent à **vérifier** dans la console.

Si Twilio échoue alors que le SMS est activé, le flux continue avec le code affiché sur la page (`devCode`) et éventuellement `smsErrorDetail`.

Logs : `SMS_VERBOSE_LOG=1` pour plus de détail côté serveur.

## 13) Knowledge Base Admin (RAG MVP)

Nouvelle fonctionnalite: l'admin peut alimenter une base de connaissances (texte , document, API), et le chat utilisateur repond d'abord a partir de ces donnees.

### SQL a executer

```bash
mysql -u root -p marsa_ai < backend/sql/knowledge_base_feature.sql
```

### Variables d'environnement backend

- `KB_UPLOAD_DIR` (optionnel): dossier de stockage des documents uploades.
  - Defaut: `backend/uploads/knowledge`

### Endpoints principaux

- `GET /knowledge/sources`
- `GET /knowledge/sources/:id`
- `POST /knowledge/sources/text`
- `POST /knowledge/sources/document` (multipart form-data, champ `file`)
- `POST /knowledge/sources/api`
- `PUT /knowledge/sources/:id`
- `DELETE /knowledge/sources/:id`
- `POST /knowledge/sources/:id/process`
- `POST /knowledge/sources/:id/refresh-api`
- `POST /knowledge/search`

### Effet sur le chat

- `POST /chat` fait maintenant:
  1. recherche de chunks pertinents dans `knowledge_chunks`
  2. injection du contexte admin dans le prompt envoye a `llama.cpp`
  3. enregistrement des sources utilisees dans `questions_history_sources`