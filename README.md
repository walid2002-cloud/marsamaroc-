# Marsa Maroc Project

Projet PFE Marsa Maroc avec backend Node.js, Express et Docker.

## Docker Hub

### 1) Build l'image en local

```bash
cd backend
docker build -t marsa-maroc-backend .
```

### 2) Taguer l'image pour Docker Hub

```bash
docker tag marsa-maroc-backend:latest walidboudarra/marsa-maroc-backend:latest
```

### 3) Se connecter a Docker Hub

```bash
docker login
```

### 4) Pousser l'image sur Docker Hub

```bash
docker push walidboudarra/marsa-maroc-backend:latest
```

### 5) Lancer l'image depuis Docker Hub

```bash
docker run --rm -p 3000:3000 walidboudarra/marsa-maroc-backend:latest
```

Puis ouvrir:

http://localhost:3000