# Traveler Assist

Application web personnelle pour préparer ses vacances de A à Z : tâches, budget, comparatifs et itinéraire.

## Démarrage rapide

```bash
npm install            # installe les dépendances et génère le client Prisma
cp .env.example .env   # puis renseigner les variables
npx prisma migrate dev # crée la base SQLite locale (prisma/dev.db)
npm run dev            # http://localhost:3000
```

## Scripts

| Script | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement |
| `npm run build` / `npm start` | build et serveur de production |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript strict |
| `npm test` | tests unitaires (Vitest) |
| `npm run test:e2e` | build puis parcours end-to-end (Playwright, base `prisma/e2e.db` dédiée) |
