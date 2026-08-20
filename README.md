# Radar Prospect

Trouve les commerces autour d'une adresse (via OpenStreetMap) et génère pour
chacun, avec Claude, une analyse et un argumentaire de vente.

## Installation

```bash
npm install
```

## Variables d'environnement

Crée un fichier `.env.local` (non commité) avec :

```
ANTHROPIC_API_KEY=sk-ant-...
```

Clé obtenue sur https://console.anthropic.com

## Développement

```bash
npm run dev
```

## Déploiement

Projet Next.js standard, compatible Vercel (auto-détecté). Pense à ajouter
`ANTHROPIC_API_KEY` dans Project Settings → Environment Variables sur Vercel.
