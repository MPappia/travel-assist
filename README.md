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
- **Import d'annonces depuis le navigateur** : un favori (bookmarklet) ou le copier-coller du texte de la page alimente une page de vérification (prix, note, lits, chambres, nuits, annulation…) qui pré-remplit les critères du comparatif.
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
| `APP_URL` | non | Adresse de l'application injectée dans le favori d'import (défaut : `http://localhost:3000`). À changer si l'app tourne sur un autre port ou une autre machine, puis réinstaller le favori. |
| `LLM_BASE_URL`, `LLM_MODEL` | non | Active l'extraction d'annonces assistée par LLM (API compatible OpenAI) — voir plus bas. |
| `LLM_API_KEY` | non | Clé du service LLM, si nécessaire (envoyée en `Authorization: Bearer`). |

Aucune clé n'est exposée au navigateur : pas de variable `NEXT_PUBLIC_*`, les appels ORS, Photon et l'extraction des liens passent par le serveur.

## Importer une annonce depuis le navigateur

Airbnb, Booking et Abritel bloquent les requêtes automatiques : l'aperçu côté serveur ne remonte souvent rien. L'import passe donc par **votre navigateur**, où la page est déjà affichée.

### Installer le favori « Envoyer à Traveler Assist »

Ouvrez **Importer une annonce** (en haut à droite, page `/import/setup`).

- **Chrome, Edge, Brave** : affichez la barre de favoris (Ctrl+Maj+B, ⌘+Maj+B sur Mac) et glissez-y le bouton « Envoyer à Traveler Assist ».
- **Firefox** : affichez la barre personnelle (Ctrl+Maj+B) et glissez-y le bouton ; à défaut, clic droit sur la barre → « Ajouter un marque-page… » et collez le code copié avec « Copier le code du favori » dans le champ Adresse.
- **Safari (macOS)** : le glisser n'est pas toujours accepté. Ajoutez n'importe quelle page aux favoris (⌘+D), puis dans « Signets → Modifier les signets », remplacez son adresse par le code copié.
- **Mobile (iOS, Android)** : même principe que Safari (créer un favori puis modifier son adresse), mais l'exécution d'un favori depuis la barre d'adresse est peu pratique : préférez le copier-coller ci-dessous.

Le favori contient l'adresse de l'application (`APP_URL`) : si elle change, réinstallez-le.

### L'utiliser

Sur la page d'un logement — idéalement avec **vos dates et le nombre de voyageurs saisis**, puisque le prix affiché en dépend — cliquez sur le favori. Il collecte l'URL canonique, les balises `og:*` / `twitter:*`, le `<title>`, les blocs JSON-LD, trois images au plus et le texte visible, puis les envoie par un formulaire `POST` dans un nouvel onglet (pas de `fetch`, donc pas de CORS).

**Pages volumineuses (Booking…)** : les limites de taille sont définies une seule fois (`src/lib/bookmarklet/limits.ts`) et injectées dans le favori, qui réduit lui-même les données avant envoi :

- JSON-LD : seuls les blocs utiles (Hotel, LodgingBusiness, Accommodation…, Product, Offer, AggregateRating, et les `@graph` qui en contiennent), sans avis ni champs inutilisés, dans l'ordre d'utilité jusqu'à la limite ;
- texte : si la page dépasse 30 000 caractères, le début de page (~8 000 caractères : titre, note, adresse) **plus la zone des tarifs**, repérée par des sélecteurs par site (`src/lib/bookmarklet/sites.ts`, à mettre à jour si Booking change sa mise en page), sinon par l'en-tête du tableau des chambres, sinon par le premier bloc contenant plusieurs montants en € et « nuit » / « night ».

Les réductions sont signalées discrètement sur la page d'import. Le serveur applique les mêmes règles (mêmes fonctions) à un envoi qui dépasserait encore une limite, et au copier-coller : il **tronque au lieu de rejeter** ; seul un envoi de plus de 2 Mo est refusé, avec un message qui conseille le copier-coller.

**Favori de diagnostic** : sur `/import/setup` (« Glisser ne fonctionne pas ? »), un second favori affiche la taille de chaque champ, telle qu'elle sera envoyée, au lieu d'envoyer. Utile pour un retour de bug.

`POST /import` ne crée rien : il stocke un import en attente (effacé après 24 h) et redirige vers `/import/[id]`. Là, vous vérifiez les champs extraits — chacun indique discrètement sa provenance (balises de partage, données structurées, texte de la page, IA) et, le cas échéant, une précision (chambre retenue, note convertie, date limite d'annulation) — puis vous choisissez le voyage et le comparatif (ou la création d'un comparatif « Logements »). Les critères correspondants (par nom, puis par unité sans ambiguïté) sont listés et décochables avant validation.

**Copier-coller (secours, mobile)** : dans un comparatif, « Ajouter manuellement » → onglet « Coller le contenu de la page ». Sélectionnez tout le texte de l'annonce, copiez, collez : même extraction, même page de confirmation.

### Règles d'extraction

- Ordre : balises `og:*` → JSON-LD (Accommodation, LodgingBusiness, Product, AggregateRating, Offer) → `<title>` → motifs sur le texte (français et anglais) → LLM facultatif.
- **Prix total** : le prix « total » affiché, jamais le prix barré. Pour un tableau de chambres (Booking), le **tarif le moins cher dont la capacité couvre le nombre de voyageurs recherché** ; la chambre retenue est indiquée.
- **Note** ramenée sur 5 (8,2/10 → 4,1/5, la note d'origine est affichée). **Couchages** = nombre de lits (celui de la chambre retenue pour un hôtel).
- **Nuits et dates** du tarif (année déduite si la page ne l'indique pas), prix par nuit calculé si absent, alerte si le nombre de nuits diffère de la durée du voyage ; **annulation gratuite** avec sa date limite.

### Extraction assistée par LLM (facultative)

Définir `LLM_BASE_URL` et `LLM_MODEL` (et `LLM_API_KEY` si besoin) active un second étage : le texte de la page (tronqué à 20 000 caractères) est envoyé à `POST {LLM_BASE_URL}/chat/completions` avec un schéma JSON strict (`response_format: json_schema`). La réponse est validée champ par champ (zod) et **ne remplit que les champs restés vides** ; les valeurs proposées sont marquées « IA — à vérifier ». Le LLM n'est appelé que s'il manque des champs, une seule fois par import (résultat mis en cache), avec un délai de 30 s ; en cas d'échec, l'extraction classique est conservée sans bloquer.

```bash
# Ollama en local
LLM_BASE_URL="http://localhost:11434/v1"
LLM_MODEL="qwen2.5:7b-instruct"

# Service hébergé compatible OpenAI
LLM_BASE_URL="https://api.example.com/v1"
LLM_MODEL="nom-du-modèle"
LLM_API_KEY="…"
```

Le serveur doit accepter `response_format` de type `json_schema` (versions récentes d'Ollama, LM Studio, vLLM, OpenAI…). Avec un service distant, **le texte de la page lui est transmis**.

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
- Import d'annonces : bookmarklet exécuté dans jsdom (code source, version minifiée générée, mode diagnostic, respect des limites sur une page de structure Booking construite à partir du texte réel), réduction du texte et élagage du JSON-LD, troncature serveur au lieu du rejet, extraction sur les fiches réelles Airbnb (en) et Booking (fr) fournies et sur des fiches synthétiques clairement marquées (Abritel, Airbnb fr, page HTML avec og/JSON-LD), étage LLM avec `fetch` simulé (réussite, délai dépassé, erreur), validation du payload, correspondance avec les critères.
- **Playwright** (`tests/e2e`) : 8 tests.
  1. Créer un voyage, des tâches (retard, filtre, cocher, supprimer) et des dépenses (alerte de dépassement), vérifier le tableau de bord.
  2. Comparer 3 logements sur 5 critères, lire le verdict, écarter, retenir et créer la dépense.
  3. Coller un lien qui échoue (et une adresse locale refusée) : l'élément est créé et se complète à la main.
  4. Road trip de 6 étapes : autocomplétion, réordonnancement au clavier, persistance, changement de mode, suppression, jour par jour, étape non routable.
  5. Favori exécuté sur une page d'annonce locale : nouvel onglet, vérification, correction, critères décochés, ajout au comparatif.
  6. Envoi invalide (adresse non http) : renvoi vers l'aide, rien n'est créé.
  7. Copier-coller de la fiche Airbnb réelle jusqu'aux critères pré-remplis.
  8. Page d'annonce volumineuse (JSON-LD de plusieurs centaines de Ko, texte de plus de 100 000 caractères) importée sans rejet, réductions signalées.

  Les tests e2e utilisent une base dédiée (`prisma/e2e.db`, recréée à chaque lancement) et un **faux service Photon / ORS local** (`tests/e2e/mock-services.mjs`) : ils ne dépendent ni du réseau ni d'une clé. Le navigateur Chromium de Playwright 1.56 doit être installé (`npx playwright install chromium` si besoin).

## Architecture

```
prisma/                 schéma, migrations, seed
src/app/                pages (App Router) et routes (/api/geocode, /api/geocode/reverse, /api/directions, POST /import)
src/components/ui/      composants shadcn/ui
src/components/…        composants métier (trips, tasks, budget, comparisons, route)
src/lib/domain/         logique métier pure et testée (budget, tâches, scoring, ORS, Photon, jour par jour…)
src/lib/link-preview/   extraction Open Graph / JSON-LD (pure)
src/lib/bookmarklet/    code du favori d'import (source.ts) et génération minifiée
src/lib/listing-extract/ extraction d'annonces (pure) : og, JSON-LD, motifs FR/EN, LLM, critères
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
| `esbuild` | minification du favori d'import à sa génération (déjà présent via tsx et Vitest ; externalisé du bundle Next) |
| `tsx`, `dotenv` (dev) | exécution du seed TypeScript et chargement de `.env` par la CLI Prisma |
| `jsdom` (dev) | exécution du bookmarklet dans un DOM de test |

Aucune bibliothèque de scraping, de parsing HTML ou de navigateur headless ; aucun SDK LLM (simple `fetch` vers une API compatible OpenAI).

## Limites connues

- **Aperçu côté serveur** : Airbnb, Booking et Abritel protègent leurs pages contre les robots (pages de défi, 403, contenu rendu en JavaScript) ; l'aperçu serveur est donc souvent vide. C'est un choix assumé : pas de navigateur headless ni de contournement de protection. L'élément est **toujours créé** et tout reste saisissable à la main ; l'import par le navigateur (favori ou copier-coller) prend le relais.
- **Favori d'import et CSP** : un site dont la politique de sécurité (CSP) est stricte peut bloquer le favori — en particulier sous **Firefox**, qui applique la CSP de la page aux bookmarklets — ou interdire l'envoi d'un formulaire vers un autre domaine (`form-action`, dans tous les navigateurs ; le favori affiche alors un message). Dans ces cas, utilisez **le copier-coller**.
- Si `APP_URL` est en `http://` sur une autre adresse que `localhost`, le navigateur avertit qu'un formulaire est envoyé depuis une page https vers une adresse non sécurisée.
- **Extraction d'annonces** : heuristiques, à vérifier à chaque import. Le prix dépend des dates et voyageurs saisis sur le site ; seuls les montants en euros sont reconnus ; une page longue est réduite au début de page et à la zone des tarifs (si cette zone n'est pas repérée, seuls les 30 000 premiers caractères sont gardés) ; les sélecteurs Booking n'ont pas encore été vérifiés sur le HTML réel ; l'année des dates est déduite quand elle manque ; la distance au centre n'est jamais extraite. Les motifs suivent la mise en page actuelle des sites et devront évoluer avec elle — les fixtures réelles servent de garde-fou.
- `POST /import` accepte des envois de n'importe quel site (c'est son rôle) : rien n'est créé sans confirmation, la taille est bornée et 50 imports au plus restent en attente.
- Les images d'aperçu sont chargées directement depuis le site d'origine (`referrerPolicy="no-referrer"`) ; certaines peuvent être refusées (une icône les remplace) et ce chargement révèle votre adresse IP à ce site.
- **Services gratuits** : ORS limite le nombre de requêtes (par minute et par jour), à 50 étapes par itinéraire et à une distance maximale par trajet ; Photon public est en « usage raisonnable ». Le cache limite les appels, mais un quota atteint affiche un message et il faut patienter. Carte, géocodage et itinéraire nécessitent une connexion Internet.
- Avec seulement deux éléments, la normalisation min–max donne mécaniquement 1 au meilleur et 0 à l'autre sur chaque critère numérique : les écarts de score paraissent plus marqués qu'avec trois éléments ou plus.
- Durées ORS hors pauses et hors trafic.
- Pas d'authentification ni de multi-utilisateur ; SQLite convient à un usage local.
- `npm audit` signale des vulnérabilités dans des dépendances de la CLI Prisma (pilote MySQL, non utilisé à l'exécution par l'application).
- Ce dépôt a été développé et testé dans un environnement sans accès aux services externes : ORS, Photon et OpenFreeMap ont été validés contre leurs formats documentés et un faux service local, pas en conditions réelles. De même, le favori a été testé sur une page d'annonce locale et l'extraction sur des textes copiés depuis Airbnb et Booking, mais pas en direct sur ces sites (leurs balises og / JSON-LD réelles n'ont donc pas été vérifiées).

## Pistes

Idées hors du périmètre actuel :

- Extension de navigateur (non soumise à la CSP des pages, utilisable sur mobile Firefox) à la place du favori.
- Prix et devises : conversion automatique des montants non en euros.

- Export du programme jour par jour (PDF, iCal) et partage en lecture seule.
- Lier une étape d'itinéraire à un logement retenu (et afficher les logements sur la carte).
- Détails d'une dépense : date, payeur, répartition entre voyageurs, devises et taux de change.
- Distance au centre calculée automatiquement à partir de l'adresse du logement.
- Points d'intérêt et pauses le long du trajet, estimation du carburant et des péages.
- Listes de bagages modèles réutilisables d'un voyage à l'autre.
- Mode hors ligne (PWA) pour consulter le programme sur la route.
- Intégration continue (lint, typecheck, Vitest, Playwright) sur chaque push.
