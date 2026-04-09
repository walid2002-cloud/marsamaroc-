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
- `FRONTEND_BASE_URL` (defaut: `http://localhost:5173`)
- `LLAMA_CPP_URL` (defaut: `http://127.0.0.1:8080`)

Exemple:

```bash
FRONTEND_BASE_URL=http://localhost:5173 node server.js
```

### Frontend

Creer `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:3000
```

## 5) Lancement en local (meme reseau)

### Terminal 1 - Backend

```bash
cd backend
FRONTEND_BASE_URL=http://localhost:5173 node server.js
```

### Terminal 2 - Frontend

```bash
cd frontend
npm run dev -- --host 0.0.0.0 --port 5173
```

URLs:
- Front: `http://localhost:5173`
- API: `http://localhost:3000`

## 6) Acces par telephone hors reseau local (tunnels)

Quand tu n'es pas sur le meme Wi-Fi, utilise une URL publique:
- Frontend via `ngrok`
- Backend via `cloudflared`

### Front tunnel (ngrok)

```bash
ngrok http 5173
```

### Back tunnel (cloudflared)

```bash
cloudflared tunnel --url http://localhost:3000
```

Ensuite:
1. Mettre `VITE_API_BASE_URL=<URL_PUBLIC_BACK>` dans `frontend/.env`
2. Lancer backend avec:

```bash
FRONTEND_BASE_URL=<URL_PUBLIC_FRONT> node backend/server.js
```

3. Relancer frontend (`npm run dev ...`)
4. Regenerer le QR depuis l'admin

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

- Si QR ouvre `localhost`, c'est faux pour mobile: il faut une IP LAN ou une URL publique.
- Si mobile affiche `ERR_NGROK_3200`, le tunnel ngrok est offline: relancer `ngrok http 5173`.
- Si Vite bloque host ngrok, verifier `frontend/vite.config.js` avec:
  - `server.host: true`
  - `server.allowedHosts: [".ngrok-free.dev"]`
- Si page reste sur "Verification du lien...", verifier `VITE_API_BASE_URL`.