# Traveler Assist

Application web personnelle pour préparer ses vacances de A à Z : tâches, budget, comparatifs pondérés (avec aperçu des annonces) et itinéraire road trip sur carte.

Usage mono-utilisateur, sans authentification (MVP) : à faire tourner en local, **pas à exposer sur Internet**.

## Fonctionnalités

- **Tableau de bord** : un voyage par carte (destination, dates, statut, avancement des tâches, budget engagé / cible).
- **Page voyage** à onglets : vue d'ensemble, tâches, budget, comparatifs, itinéraire.
- **Tâches** : ajout, édition, suppression, filtre par catégorie, tri par échéance, retards mis en évidence.
- **Budget** : dépenses par catégorie, prévisionnel (estimé + réservé + payé), engagé et payé comparés au budget cible, alerte à 90 % et en cas de dépassement.
- **Comparatifs** : critères pondérés (nombre, texte, oui/non, note 1–5 ; sens « plus haut / plus bas = mieux »), tableau côte à côte, score sur 100, meilleure valeur par critère, verdict en une phrase (« X arrive en tête… fait la différence sur… »), statuts option / retenu / écarté, création de la dépense d'un élément retenu.
- **Aperçu de liens** : coller une URL d'annonce crée l'élément avec image, titre, description et domaine (Open Graph puis JSON-LD), sans jamais bloquer la saisie manuelle.
- **Itinéraire** : carte MapLibre, étapes par recherche d'adresse ou clic sur la carte, glisser-déposer, calcul OpenRouteService (distance et durée par tronçon et au total), voiture / vélo / à pied, vue jour par jour à partir des dates et nuits.

## Prérequis

- Node.js ≥ 20.9 (testé avec Node 22) et npm.
- `better-sqlite3` est un module natif : des binaires précompilés existent pour les plateformes courantes ; sinon il faut une chaîne de compilation (Python 3, `make`, compilateur C++).

## Installation

```bash
npm install                 # installe les dépendances et génère le client Prisma (postinstall)
cp .env.example .env        # puis renseigner ORS_API_KEY (voir ci-dessous)
npx prisma migrate deploy   # crée la base SQLite locale prisma/dev.db
npm run seed                # (facultatif) voyage de démonstration complet
npm run dev                 # http://localhost:3000
```

Production locale : `npm run build && npm start`.

## Variables d'environnement

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `DATABASE_URL` | oui | Base SQLite, chemin relatif à la racine du projet. Défaut : `file:./prisma/dev.db` (fichier ignoré par git). |
| `ORS_API_KEY` | pour l'itinéraire | Clé [OpenRouteService](https://openrouteservice.org/dev/#/signup) (gratuite). Lue **uniquement côté serveur** ; sans clé, l'onglet Itinéraire affiche un message explicite et le reste de l'app fonctionne. |
| `GEOCODER_CONTACT` | recommandé | Ajouté au User-Agent des appels Photon (`traveler-assist/0.1 (<contact>)`), comme le demande la politique d'usage. |
| `ORS_BASE_URL` | non | URL d'une instance ORS auto-hébergée (défaut : `https://api.openrouteservice.org`). Utilisé aussi par les tests e2e. |
| `PHOTON_BASE_URL` | non | URL d'une instance Photon auto-hébergée (défaut : `https://photon.komoot.io`). |

Aucune clé n'est exposée au navigateur : pas de variable `NEXT_PUBLIC_*`, les appels ORS, Photon et l'extraction des liens passent par le serveur.

## Scripts

| Script | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement |
| `npm run build` / `npm start` | build et serveur de production |
| `npm run lint` | ESLint |
| `npm run typecheck` | génération des types de routes Next puis `tsc --noEmit` (TypeScript strict) |
| `npm test` | tests unitaires et d'intégration (Vitest) |
| `npm run test:e2e` | build puis parcours Playwright |
| `npm run db:migrate` | nouvelle migration Prisma (développement) |
| `npm run seed` | (re)crée le voyage de démonstration « Road trip au Portugal (démo) » |

## Tests

- **Vitest** (`tests/unit`) : formatage, tâches, budget, validation, **scoring** (module pur), vue comparatif, parseur d'aperçu (Open Graph / JSON-LD), garde anti-SSRF, téléchargement HTML contre un serveur HTTP local (redirections, gzip, encodage, taille, délai), OpenRouteService (requête, réponse, erreurs), Photon, plan jour par jour, service d'itinéraire avec `fetch` simulé (clé manquante, cache, quota).
- **Playwright** (`tests/e2e`) : 4 parcours.
  1. Créer un voyage, des tâches (retard, filtre, cocher, supprimer) et des dépenses (alerte de dépassement), vérifier le tableau de bord.
  2. Comparer 3 logements sur 5 critères, lire le verdict, écarter, retenir et créer la dépense.
  3. Coller un lien qui échoue (et une adresse locale refusée) : l'élément est créé et se complète à la main.
  4. Road trip de 6 étapes : autocomplétion, réordonnancement au clavier, persistance, changement de mode, suppression, jour par jour, étape non routable.

  Les tests e2e utilisent une base dédiée (`prisma/e2e.db`, recréée à chaque lancement) et un **faux service Photon / ORS local** (`tests/e2e/mock-services.mjs`) : ils ne dépendent ni du réseau ni d'une clé. Le navigateur Chromium de Playwright 1.56 doit être installé (`npx playwright install chromium` si besoin).

## Architecture

```
prisma/                 schéma, migrations, seed
src/app/                pages (App Router) et routes API (/api/geocode, /api/geocode/reverse, /api/directions)
src/components/ui/      composants shadcn/ui
src/components/…        composants métier (trips, tasks, budget, comparisons, route)
src/lib/domain/         logique métier pure et testée (budget, tâches, scoring, ORS, Photon, jour par jour…)
src/lib/link-preview/   extraction Open Graph / JSON-LD (pure)
src/server/             accès base, server actions, services externes (aperçu, géocodage, itinéraire, cache)
tests/unit, tests/e2e   Vitest et Playwright
```

Les mutations passent par des **server actions** (validées avec zod) ; les lectures par des requêtes Prisma dans les composants serveur. Les appels déclenchés en continu par le client (autocomplétion, recalcul d'itinéraire) passent par des **routes API** pour pouvoir être annulés (`AbortController`).

## Choix techniques

- **Next.js 16 (App Router, Turbopack) + TypeScript strict.**
- **Prisma 7 + SQLite** via l'adaptateur `@prisma/adapter-better-sqlite3` (Prisma 7 n'embarque plus de moteur Rust ; l'adaptateur est la voie standard pour SQLite).
- **Montants en centimes** (entiers) et **dates calendaires à minuit UTC**, toujours formatées en UTC : pas d'erreur d'arrondi ni de décalage de fuseau.
- **shadcn/ui** : composants (style « new-york », thème neutre clair/sombre via `next-themes`) écrits dans `src/components/ui` sur les primitives Radix, comme le ferait la CLI ; `components.json` est présent pour en ajouter d'autres avec `npx shadcn add`. Les listes déroulantes de formulaire sont des `<select>` natifs stylés (plus fiables sur mobile).
- **Score des comparatifs** (`src/lib/domain/scoring.ts`) :
  - nombre : normalisation min–max entre les éléments renseignés (une valeur unique ou des valeurs toutes égales valent 1) ;
  - note : échelle absolue (note − 1) / 4 ; oui/non : 1 / 0 ; sens « plus bas = mieux » : 1 − note ;
  - texte : affiché, non noté ; valeur manquante : 0 sur ce critère ; un élément sans aucune valeur n'est pas classé ;
  - score = Σ(poids × note) / Σ(poids) × 100. Les éléments **écartés** sont hors course (ni notés ni pris en compte dans la normalisation).
- **Aperçu de liens** (`src/server/link-preview`) : `node:http(s)` sans dépendance, délai global de 8 s, au plus 1,5 Mo lus (après décompression), 4 redirections revalidées, HTML uniquement, User-Agent de navigateur standard, aucun cookie ni JavaScript exécuté. Anti-SSRF : http/https seulement, ports 80/443/8080/8443, pas d'identifiants dans l'URL, refus de `localhost` et de toutes les plages privées, réservées, de lien local, CGNAT, multicast et IPv4 mappées — vérifiées **sur les adresses réellement résolues au moment de la connexion** (fonction `lookup` personnalisée), ce qui couvre redirections et « DNS rebinding ». Résultat mis en cache en base 7 jours (1 h pour un échec) ; « Rafraîchir l'aperçu » contourne le cache.
- **Géocodage : Photon** (komoot, données OpenStreetMap), conçu pour l'autocomplétion (Nominatim interdit cet usage). Debounce de 350 ms côté client avec 3 caractères minimum et annulation des requêtes obsolètes ; côté serveur, User-Agent identifiable, **1 requête/s au plus** et cache en base de 30 jours.
- **Itinéraires : OpenRouteService** Directions v2 (profils `driving-car`, `cycling-regular`, `foot-walking`), un seul appel multi-étapes, rayon d'accroche de 1 km par étape, cache 7 jours par (mode, coordonnées). Recalcul automatique 600 ms après le dernier changement.
- **Carte : MapLibre GL JS v5** + tuiles **OpenFreeMap** (style « liberty »). La v6 charge son worker depuis un fichier séparé que Turbopack n'émet pas ; la v5 l'embarque. Si le fond de carte est injoignable, un style de repli local garde marqueurs et tracé visibles ; sans WebGL, un message remplace la carte.
- **Cache générique** `ApiCache` (clé → JSON) pour l'aperçu, le géocodage et les itinéraires.

### Adaptations du modèle de données

- `Criterion` et `CriterionValue` sont des tables (et non une liste JSON) : intégrité référentielle, valeurs typées (`numberValue`, `textValue`, `boolValue`), conservation des valeurs quand on renomme ou réordonne un critère. Un critère a aussi une **unité** (€, km…) et une position.
- `Comparison.expenseCategory` : catégorie budgétaire de la dépense créée depuis un élément retenu (un comparatif n'est pas forcément du logement).
- `Expense.comparisonItemId` (unique) : relie la dépense à l'élément retenu et empêche les doublons.
- `ComparisonItem.preview*` : aperçu stocké sur l'élément (statut OK / partiel / échec, message, date) et éditable à la main.
- `RouteStop.date` + `RouteStop.nights` : date d'arrivée et nuits sur place, facultatives, pour la vue jour par jour (une étape sans date hérite de la précédente décalée de ses nuits).
- Plusieurs itinéraires par voyage sont possibles (ex. aller / boucle sur place).

### Dépendances

Au-delà de la stack imposée (Next, React, Tailwind, shadcn/ui, Prisma, MapLibre, Vitest, Playwright) :

| Paquet | Pourquoi |
| --- | --- |
| `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`, `lucide-react` | socle standard de shadcn/ui |
| `next-themes` | thème clair / sombre sans flash |
| `sonner` | notifications (composant toast de shadcn/ui) |
| `zod` | validation des formulaires et des routes API |
| `@dnd-kit/core`, `/sortable`, `/utilities` | glisser-déposer accessible (souris, tactile, **clavier**) |
| `better-sqlite3`, `@prisma/adapter-better-sqlite3` | pilote SQLite requis par Prisma 7 |
| `server-only` | empêche d'importer par erreur du code serveur (base, clés) côté client |
| `tsx`, `dotenv` (dev) | exécution du seed TypeScript et chargement de `.env` par la CLI Prisma |

Aucune bibliothèque de scraping, de parsing HTML ou de navigateur headless.

## Limites connues

- **Extraction des annonces** : Airbnb, Booking et Abritel protègent souvent leurs pages contre les robots (pages de défi, 403, contenu rendu en JavaScript). Selon le site, le moment ou l'adresse IP, l'aperçu peut être complet, partiel ou absent. C'est un choix assumé : pas de navigateur headless ni de contournement de protection. L'élément est **toujours créé** et tout reste saisissable à la main. Le prix, les couchages, la note ou la distance ne sont jamais extraits automatiquement (peu fiables, dépendants des dates) : ce sont des critères manuels.
- Les images d'aperçu sont chargées directement depuis le site d'origine (`referrerPolicy="no-referrer"`) ; certaines peuvent être refusées (une icône les remplace) et ce chargement révèle votre adresse IP à ce site.
- **Services gratuits** : ORS limite le nombre de requêtes (par minute et par jour), à 50 étapes par itinéraire et à une distance maximale par trajet ; Photon public est en « usage raisonnable ». Le cache limite les appels, mais un quota atteint affiche un message et il faut patienter. Carte, géocodage et itinéraire nécessitent une connexion Internet.
- Avec seulement deux éléments, la normalisation min–max donne mécaniquement 1 au meilleur et 0 à l'autre sur chaque critère numérique : les écarts de score paraissent plus marqués qu'avec trois éléments ou plus.
- Durées ORS hors pauses et hors trafic.
- Pas d'authentification ni de multi-utilisateur ; SQLite convient à un usage local.
- `npm audit` signale des vulnérabilités dans des dépendances de la CLI Prisma (pilote MySQL, non utilisé à l'exécution par l'application).
- Ce dépôt a été développé et testé dans un environnement sans accès aux services externes : ORS, Photon et OpenFreeMap ont été validés contre leurs formats documentés et un faux service local, pas en conditions réelles.

## Pistes

Idées hors du périmètre actuel :

- Export du programme jour par jour (PDF, iCal) et partage en lecture seule.
- Lier une étape d'itinéraire à un logement retenu (et afficher les logements sur la carte).
- Détails d'une dépense : date, payeur, répartition entre voyageurs, devises et taux de change.
- Pré-remplir certains critères depuis le JSON-LD quand il est fiable (note, adresse), avec confirmation.
- Distance au centre calculée automatiquement à partir de l'adresse du logement.
- Points d'intérêt et pauses le long du trajet, estimation du carburant et des péages.
- Listes de bagages modèles réutilisables d'un voyage à l'autre.
- Mode hors ligne (PWA) pour consulter le programme sur la route.
- Intégration continue (lint, typecheck, Vitest, Playwright) sur chaque push.
