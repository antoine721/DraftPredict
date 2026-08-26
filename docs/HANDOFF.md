# État du projet & reprise

> Document de reprise. Tout ce qui est décrit ici est **déjà poussé** sur la
> branche `claude/connexion-verification-2xb05d`. Le conteneur de dev est
> éphémère : le dépôt Git est la seule source de vérité.

Dernière mise à jour : 2026-08-26 (projet stabilisé, prêt pour une pull request).

---

## 1. Ce qui est TERMINÉ et vérifié

| Composant | État | Vérification |
|---|---|---|
| `packages/core` — moteur de prédiction | ✅ complet | 891 tests, dont **667 de parité** avec DraftGap (écart < 1e-9) |
| `packages/data` — Data Dragon + datasets | ✅ complet | 125 tests |
| `packages/riot` — API Riot + style de jeu | ✅ complet | 151 tests |
| `packages/lcu` — client League (temps réel) | ✅ complet | 224 tests |
| `apps/server` — Fastify REST + WebSocket | ✅ complet | 56 tests, serveur démarré et routes vérifiées à la main |
| `apps/pipeline` — construction de datasets | ✅ complet | 73 tests |
| `apps/web` — shell, design system, hooks, store | ✅ complet | 118 tests, bundle construit (356 kB / 113 kB gzip) |
| `apps/desktop` — enveloppe Electron | ✅ complet (non empaqueté) | 15 tests |

**Total : 1653 tests passants, `tsc -b` et `eslint` propres sur tout le monorepo.**

Commandes de vérification :

```bash
npm install
npm run typecheck && npm run lint && npm run test && npm run build
```

Test de bout en bout contre un serveur en cours d'exécution :

```bash
npm run dev            # dans un terminal
npm run smoke          # dans un autre — rapport lisible, code de sortie non nul si échec
```

---

## 2. Ce qu'il RESTE à faire

### 2.1 Les 5 vues de l'interface — **le seul vrai reste**

`apps/web/src/views/*.tsx` contiennent aujourd'hui des **placeholders** (un
`Panel` chacun). Toute la plomberie existe déjà : primitives UI, hooks de
requête, WebSocket temps réel, store de draft, routage. Il ne reste qu'à écrire
le rendu.

Chaque vue doit être écrite dans son propre dossier `apps/web/src/views/<nom>/`
et exporter le même nom de fichier/`default export` que le placeholder qu'elle
remplace.

1. **`DraftView`** — plateau 5v5 (colonnes alliée/ennemie + colonne d'analyse),
   sélecteur de champion au clavier, jauge de probabilité de victoire,
   répartition des contributions (champion / synergie / matchup), courbe de
   winrate par durée, distribution des dégâts, suggestions par rôle libre,
   suggestions de bans, mode « suivre le client » avec badge live et timer.
2. **`ChampionsView`** — index des champions + page détail : items (starter /
   core / bottes / situationnels), runes (arbre complet + shards), sorts
   d'invocateur, ordre de compétences, matchups et synergies, stats par durée,
   mode comparaison.
3. **`AccountView`** — connexion par Riot ID **ou** détection automatique via le
   client (sans clé API), rangs solo/flex, maîtrises, radar du style de jeu sur
   8 axes + archétype + forces/faiblesses, pool de champions, historique avec
   rejeu de la draft de chaque partie.
4. **`LiveView`** — miroir du champ select en cours, partie en cours via
   spectator, analyse de draft live, recherche d'un autre joueur.
5. **`SettingsView`** — clé API Riot (masquée, test, suppression), région/rang,
   niveau de risque, intégration client League, source des données, thème,
   langue.

Contrat complet de la fondation (primitives, hooks, store, règles d'honnêteté
des données) : voir la section 4 ci-dessous et lire `apps/web/src/ui/index.ts`,
`apps/web/src/api/`, `apps/web/src/state/`.

### 2.2 Corrections connues (petites, identifiées, non bloquantes)

- ~~Le cache disque « blanchissait » le dataset fixture en données
  apparemment réelles (`provider: "disk-cache"`, `offline: false`)~~ —
  **corrigé** : le cache mémorise désormais le provider d'origine
  (`DiskCacheRecord.meta`) et `DatasetService` le restaure à la lecture, en
  gardant `source: "disk"`. Vérifié à froid et à chaud.
- ~~`eslint.config.js` sans globals Node pour les `**/*.mjs`~~ — **corrigé**,
  les déclarations `/* global … */` manuelles ont été retirées.
- ~~`npm run dev` échouait sur un dépôt fraîchement cloné~~ — **corrigé** :
  `tsx` résolvait `@draftpredict/data` vers un `dist/` pas encore compilé. Les
  hooks `prepare` / `predev` / `predev:server` / `prepipeline` construisent
  désormais les packages avant tout ce qui les consomme.
- **`GET /api/lcu/champ-select`** : n'inclut pas `updatedAt` hors champ select.
- **Amélioration UX** : une route qui résout directement le summoner connecté au
  client en `puuid` éviterait l'étape « saisir son Riot ID » dans les vues
  Compte et Live (aujourd'hui : `/api/lcu/summoner` → `puuid` →
  `/api/account/:puuid/...`, ce qui fonctionne déjà et ne demande aucune clé).

### 2.3 Mise en production (volontairement laissé à l'utilisateur)

- Clé API Riot (developer.riotgames.com) → **Paramètres → Clé API** ou `.env`.
  Elle n'est nécessaire **que** pour compte / historique / style de jeu / partie
  en cours. La draft temps réel via le client n'en a pas besoin.
- Empaquetage Electron (`npm run package:win|mac|linux -w @draftpredict/desktop`) :
  la configuration est écrite mais **jamais exécutée** ici (pas de binaires
  Electron téléchargeables ni de signature dans le conteneur).
- Datasets réels : soit le bucket public DraftGap (automatique au runtime), soit
  `apps/pipeline` avec votre propre clé (voir `docs/DATASET.md`).

---

## 3. Contraintes de l'environnement de développement

Le conteneur bloque par politique réseau : `ddragon.leagueoflegends.com`,
`raw.communitydragon.org`, `bucket.draftgap.com`, `api.riotgames.com`.
Conséquences, **assumées dans le code** :

- les données statiques sont **embarquées** (`packages/data/assets/ddragon/16.17.1`,
  récupérées via un miroir GitHub) et se mettent à jour toutes seules chez vous ;
- un **dataset fixture déterministe** couvre tout le jeu hors-ligne, et
  l'interface indique honnêtement quand il est utilisé ;
- aucun test ne dépend du réseau ; tous les clients HTTP sont testés avec des
  `fetch` mockés.

Chez vous, ces hôtes sont accessibles : rien à changer.

---

## 4. Repères pour reprendre vite

```
docs/ARCHITECTURE.md   contrat entre packages (types, conventions, API publique)
docs/API.md            toutes les routes REST + le protocole WebSocket
docs/DATASET.md        pipeline de construction de datasets
docs/DESKTOP.md        Electron : dev, packaging, ce que l'app fait du client LoL
NOTICE                 attribution DraftGap (MIT) + Riot
```

Conventions à respecter (elles ont déjà mordu une fois) :

- `packages/*` et `apps/server|pipeline` : **tout import relatif finit par `.js`**
  (sinon `tsc` émet des chemins que Node ESM ne sait pas résoudre).
- `apps/web` : imports relatifs **sans extension** (Vite bundle).
- `RiskLevel` = `very-low | low | medium | high | very-high`, priors
  `{3000, 2000, 1000, 500, 250}` ; appeler `parseRiskLevel()` aux frontières.
- Les `Map` ne sont pas sérialisables : `serializeDraftState` /
  `deserializeDraftState` sur le fil.
- La clé Riot ne quitte jamais le serveur ; l'API n'expose que
  `hasRiotApiKey` / `riotApiKeyPreview`.
- Pas de jsdom : les tests de composants utilisent `renderToStaticMarkup`
  (`react-dom/server`) — modèle dans `apps/web/src/ui/design-system.test.tsx`.
- **Jamais de motif `.gitignore` nu du type `build/`** : git le fait matcher à
  n'importe quelle profondeur. Un tel motif a déjà avalé
  `packages/core/src/models/build/`, rendant le dépôt incompilable après clone
  alors que tout fonctionnait en local. Après un changement de `.gitignore`,
  vérifier avec `git ls-files --others --ignored --exclude-standard`.
- **Toute vérification « ça démarre » se fait dans un clone neuf**, pas dans le
  répertoire de travail : `git clone`, `npm install`, `npm run typecheck && npm
  run lint && npm run test && npm run build`, puis `npm run dev` + `npm run
  smoke`. C'est le seul moyen d'attraper les fichiers manquants.

Démarrage :

```bash
npm install
npm run dev          # serveur 4700 + web 5173
npm run desktop      # application de bureau (après npm run build)
```

---

## 5. Comment relancer le travail

Une seule phrase suffit pour reprendre :

> « Reprends DraftPredict sur la branche `claude/connexion-verification-2xb05d`,
> lis `docs/HANDOFF.md`, et implémente les vues listées en 2.1. »
