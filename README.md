<div align="center">

# DraftPredict

**Companion de draft League of Legends** — prédiction de victoire en temps réel
pendant la sélection des champions, suggestions de picks/bans, meilleurs builds
et analyse de votre style de jeu.

</div>

---

## Ce que fait l'application

| | |
|---|---|
| **Draft en temps réel** | Connexion en lecture seule au client League of Legends (LCU) : les picks, bans et hovers des deux équipes arrivent automatiquement, la probabilité de victoire est recalculée à chaque changement. |
| **Suggestions** | Pour chaque rôle allié encore libre, les champions classés par gain de winrate (matchups + synergies + méta), et les bans les plus rentables. |
| **Builds optimaux** | Items (starter / core / bottes / situationnels), runes, sorts d'invocateur et ordre de compétences, avec winrate, écart à la moyenne et taille d'échantillon — adaptés au matchup. |
| **Compte & style de jeu** | Connexion via Riot ID ou détection automatique du compte connecté au client. Rang, maîtrises, historique, et un profil de style de jeu (agressivité, farm, vision, objectifs, survie, jeu d'équipe, régularité, scaling) avec archétype, forces et faiblesses. |
| **Partie en cours** | Analyse de la draft d'une partie en cours (via spectator) pour vous ou n'importe quel joueur. |

## Démarrage rapide

```bash
npm install          # une seule fois
npm run dev          # serveur (4700) + interface web (5173)
```

Ouvrez http://localhost:5173. **Aucune clé API n'est nécessaire** pour la draft
en temps réel : il suffit que le client League of Legends tourne sur la même
machine.

Pour l'application de bureau (fenêtre dédiée + overlay + icône de barre système) :

```bash
npm run build
npm run desktop
```

## Clé API Riot (optionnelle)

Elle sert uniquement aux fonctionnalités liées au compte : recherche par Riot ID,
historique, style de jeu, partie en cours. Récupérez-en une sur
[developer.riotgames.com](https://developer.riotgames.com), puis :

- soit via l'interface : **Paramètres → Clé API Riot**,
- soit via l'environnement : copiez `.env.example` en `.env` et renseignez `RIOT_API_KEY`.

La clé est stockée dans `~/.draftpredict/config.json` (permissions `0600`), n'est
jamais renvoyée par l'API et est masquée dans tous les logs.

## Sources de données

DraftPredict lit les statistiques via une chaîne de fournisseurs, dans l'ordre :

1. **Dataset public DraftGap** (format v5) — statistiques de la ligue en cours ;
2. **Dataset local** produit par `apps/pipeline` à partir de l'API Riot ;
3. **Fixture embarquée** — dataset déterministe complet, pour un fonctionnement
   hors-ligne.

L'interface indique toujours *quelle* source a réellement servi les données.
Les données statiques (champions, items, runes, sorts) sont embarquées
(Data Dragon **16.17.1**) et se mettent à jour automatiquement quand un patch
plus récent est disponible.

## Structure

```
packages/core       moteur de prédiction (pur, sans I/O)
packages/data       données statiques + fournisseurs de datasets
packages/riot       client API Riot + profilage du style de jeu
packages/lcu        connecteur client League of Legends
apps/server         backend Fastify (REST + WebSocket)
apps/web            interface React + Vite + Tailwind
apps/desktop        enveloppe Electron
apps/pipeline       construction de datasets depuis l'API Riot
```

Documentation détaillée : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
[`docs/API.md`](docs/API.md), [`docs/DATASET.md`](docs/DATASET.md),
[`docs/DESKTOP.md`](docs/DESKTOP.md).

## Qualité

```bash
npm run typecheck    # TypeScript sur tout le monorepo
npm run lint         # ESLint 9
npm run test         # Vitest — tests unitaires + parité avec DraftGap
npm run build        # build complet
```

Le moteur statistique est un portage de [DraftGap](https://github.com/vigovlugt/draftgap)
(MIT, © Vigo Vlugt). Une suite de tests de **parité** compare le portage au code
d'origine sur des drafts aléatoires afin de garantir des résultats identiques —
voir [`NOTICE`](NOTICE).

## Vie privée & conformité

- L'accès au client League of Legends est **en lecture seule** : DraftPredict lit
  la session de champ select, n'automatise aucune action, n'injecte aucune entrée
  et ne modifie pas le jeu.
- Aucune donnée n'est envoyée à un serveur tiers : tout tourne en local.
- DraftPredict n'est pas endossé par Riot Games (voir [`NOTICE`](NOTICE)).
