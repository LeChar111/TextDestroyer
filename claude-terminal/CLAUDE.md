# Terminal Claude — Overleaf local

Tu tournes dans le conteneur Docker `claude-terminal`. `/workspace` = dossier de travail de l'hôte (réglage
`TG_WORKSPACE`) ; `/toolkit` = ce toolkit (configuration d'Overleaf et de ce terminal).

## Documents Overleaf (ce ne sont PAS des fichiers)
- `overleaf projects` → projets ; `overleaf ls <projectId>` → documents (docId + chemin) ;
  `overleaf grep <projectId> '<motif>' [--i]` → recherche dans TOUS les documents du projet.
- Modifier : `overleaf pull <projectId> <docId> '<chemin>'` → copie sous `~/overleaf/` → éditer la copie
  (modifications ciblées) → `overleaf push '<copie>'` : visible en direct dans l'éditeur.
  Refus si le document a changé dans l'éditeur : refaire pull, réappliquer, push. Jamais `--force` sans accord.
- Une demande « partout » = `overleaf grep` sur le projet, puis pull/push de chaque document concerné.
- Ajouter un fichier au projet (image produite, nouveau .tex…) : `overleaf upload <projectId> <fichier> [chemin/dans/le/projet]`
  (crée les dossiers ; refuse d'écraser un document existant : pour ceux-là, pull/push).
- Vérifier son travail : `overleaf compile <projectId> [racine.tex]` compile une copie (pas le PDF de l'éditeur) et
  résume erreurs / références indéfinies / overfull ; journal et PDF dans `~/overleaf/compile/<projectId>/` (le PDF se lit).
  Après toute modification LaTeX non triviale : compiler, et corriger ce qui casse.
- Contexte envoyé depuis l'éditeur : `@~/overleaf/selection.md` (projet, fichier, lignes, texte, ids, commande pull),
  souvent suivi d'une consigne (Corriger, Reformuler… depuis la pastille ✦ de la sélection).
- Erreurs de compilation envoyées depuis le panneau des erreurs : `@~/overleaf/errors/<date>.md` (message, emplacement,
  extrait de source, commande pull) : corriger, puis `overleaf compile` pour vérifier.
- Fichiers déposés ou collés dans le panneau : images sous `~/overleaf/images/`, autres sous `~/overleaf/files/` ; leur chemin arrive dans l'invite.
  Un document glissé depuis l'arborescence Overleaf arrive comme `[Overleaf : « chemin » — overleaf pull …]` (le récupérer avec cette commande) ;
  un dossier arrive comme `@~/overleaf/selection.md` (liste de ses documents avec leurs commandes pull) ; un texte de plusieurs lignes aussi.
- Après un `overleaf push`, l'éditeur affiche un toast et recompile tout seul le document modifié après quelques secondes.

## Configurations de cet environnement (tu peux les modifier)
Toutes sous `/toolkit/`. Les commandes `make …` se lancent sur l'HÔTE, pas dans ce conteneur (le dire à l'utilisateur).
| Fichier | Rôle | Appliquer |
|---|---|---|
| `custom/togaether/theme.css` | thème d'Overleaf | immédiat (recharger l'onglet) |
| `custom/togaether/likes.js` | likes de projets | immédiat |
| `custom/togaether/claude.js` | panneau / fenêtre de ce terminal, actions sur la sélection, erreurs → Claude | immédiat |
| `custom/togaether/compile-current.js` | compiler le document ouvert (+ `window.tgOverleaf` partagé) | immédiat |
| `custom/togaether/external-update.js` | modification externe (push) : toast + recompilation au lieu de la fenêtre bloquante (chargé en premier) | immédiat |
| `custom/togaether/figure-drop.js` | figure express : image déposée / collée dans l'éditeur → `figures/` + `\begin{figure}` | immédiat |
| `custom/latexmk/LatexMk` | réglages latexmk du compilateur (xdvipdfmx -z 6) | `docker restart sharelatex` |
| `custom/overleaf.conf` | nginx d'Overleaf (injection, relais terminal, passerelle 8082) | MODIFIER SUR PLACE (pas `sed -i` : fichier monté) puis `docker exec sharelatex nginx -t && docker exec sharelatex nginx -s reload` |
| `claude-terminal/bin/overleaf` | cet outil | immédiat (monté) |
| `claude-terminal/CLAUDE.md` | ce fichier (+ `config/togaether/CLAUDE.local.md`, consignes locales) | à la prochaine session |
| `claude-terminal/Dockerfile`, `start.sh`, `ctx-server.js`, `tmux.conf` | image de ce terminal (ctx-server : contexte, fichiers déposés, conversions SVG/HEIC) | sur l'hôte : `make terminal up` |
| `config/docker-compose.override.yml`, `config/overleaf.rc`, `config/togaether/settings.env` | services Docker, port, dossier de travail | sur l'hôte : `make up` |
| `Makefile`, `overleaf.sh`, `overleaf-import.sh`, `overleaf-launch.sh` (macOS) | installation, lancement, import | sur l'hôte |

## Docker
Le socket Docker de l'hôte est monté : `docker ps`, `docker logs sharelatex`, `docker exec sharelatex …`,
`docker restart sharelatex` fonctionnent. Ne jamais supprimer de conteneur, d'image ou de volume sans accord
explicite ; `docker restart` d'Overleaf coupe l'éditeur une trentaine de secondes.
