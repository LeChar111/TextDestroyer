# Overleaf local + terminal Claude

Une instance [Overleaf Community Edition](https://github.com/overleaf/overleaf) sur votre machine (Linux, macOS,
Windows via WSL2), construite sur l'[Overleaf Toolkit](https://github.com/overleaf/toolkit), avec :

- **un terminal [Claude Code](https://claude.com/claude-code) intégré** à l'éditeur (bouton « Claude » en bas à droite,
  ou Ctrl + `) : Claude lit et modifie les documents **en direct dans l'éditeur**, compile, ajoute des fichiers ;
- **sélection → Claude** : pastille ✦ au bout du texte sélectionné (Corriger, Reformuler, Raccourcir, Traduire,
  Expliquer, Demander…) ; panneau ouvert, une sélection stable part aussi toute seule en contexte ;
- **erreurs de compilation → Claude** : bouton ✦ sur chaque erreur, « Tout envoyer à Claude » ;
- **glisser-déposer dans le panneau** : fichiers du système (images jointes comme images) et éléments de l'arborescence ;
- **figure express** : une image déposée ou collée dans l'éditeur est importée dans `figures/` et la figure insérée
  (SVG → PDF, HEIC → JPEG, grandes photos réduites ; ⌥/Alt en déposant pour la fenêtre d'Overleaf) ;
- **compiler le document ouvert** plutôt que le document principal (`% !TEX root`, `% !TEX program` respectés) ;
- **compilation accélérée** (dossiers de compilation sur volumes Docker, `xdvipdfmx -z 6`) ;
- **likes de projets**, thème clair, import en masse de projets (dossiers, zips, export global d'overleaf.com).

## Prérequis

| Système | Docker | Outils |
|---|---|---|
| Linux | Docker Engine + plugin Compose v2 (utilisateur dans le groupe `docker`) | `make`, `curl`, `openssl`, `zip`/`unzip` |
| macOS | Docker Desktop | `brew install make gnu-sed coreutils` |
| Windows | Docker Desktop, backend WSL2, **intégration WSL activée** pour la distribution | dans WSL (Ubuntu) : `sudo apt install make curl openssl zip unzip` |

Sous Windows, **tout se fait dans WSL** : cloner le dépôt dans le système de fichiers Linux (`~/…`, pas `/mnt/c/…`,
bien plus lent), puis lancer `make` depuis le terminal Ubuntu.

L'image Overleaf n'existe qu'en **amd64** : sur processeur ARM (Mac Apple Silicon, Linux ARM) elle tourne émulée
(Rosetta sous Docker Desktop — à activer dans *Settings ▸ General* ; QEMU/binfmt sous Linux : `docker run --privileged --rm tonistiigi/binfmt --install amd64`).

## Installation

```bash
git clone <ce dépôt> overleaf-local && cd overleaf-local
make install                       # vérifie, génère config/, construit les images (TeX Live : ~15 min la 1re fois)
make start                         # démarre et ouvre http://localhost:8090
make admin EMAIL=vous@exemple.org  # crée le compte administrateur (lien d'activation affiché)
```

Au premier clic sur « Claude », se connecter à Claude Code dans le terminal (lien + code) ; les identifiants restent
dans le volume Docker `claude-home`.

## Réglages

`make config` génère, sans jamais rien écraser :

| Fichier (non versionné) | Contenu |
|---|---|
| `config/variables.env` | variables d'Overleaf (nom de l'instance, secret des invitations, URL) |
| `config/togaether/settings.env` | `TG_WORKSPACE` : dossier de l'hôte monté dans le terminal sous `/workspace` (défaut : `workspace/` du dépôt) ; `DOCKER_GID` ; `OVERLEAF_ADMIN_EMAIL` (propriétaire des imports) |
| `config/togaether/nginx-token.conf`, `terminal.env` | jeton de la passerelle interne (régénérer : `make token`) |
| `config/togaether/CLAUDE.local.md` | facultatif : consignes personnelles ajoutées à celles du terminal |

Port, version et services : `config/overleaf.rc` (`OVERLEAF_PORT=8090`), `config/version`,
`config/docker-compose.override.yml`. Après modification : `make up`.

## Commandes

`make help` les liste toutes : `start`, `stop`, `restart`, `status`, `logs`, `open`, `shell`, `admin`,
`import FILES="…"`, `terminal` (reconstruire le terminal, p. ex. pour mettre à jour Claude Code), `token`.

**Importer** : `make import FILES="mon-projet/ export.zip"`, ou déposer dans `import/` puis `make import`
(traités → `import/importes/`). XeLaTeX est choisi si un `.tex` charge `fontspec` ; fichier principal forcé par un
fichier `<zip>.root` ; un projet de même nom est sauté.

## Le terminal Claude

Conteneur `claude-terminal` (ttyd + tmux, image native de la machine), relayé par le nginx d'Overleaf **uniquement pour
une session connectée**. Outil `overleaf` : `projects`, `ls`, `grep`, `pull`/`push` (modification en direct, refusée si
le document a changé entre-temps), `upload` (ajouter un fichier au projet), `compile` (compiler une copie et résumer
les erreurs). Le socket Docker de l'hôte y est monté (Claude peut recharger nginx, redémarrer un conteneur) ; consignes
dans `claude-terminal/CLAUDE.md`.

Copier depuis le terminal : maintenir ⌥/Alt pendant la sélection (tmux capte la souris), puis copier.

## Pièges connus

- **macOS** : les scripts `bin/*` exigent GNU sed / coreutils ; `make` et `./overleaf.sh` les mettent en tête du PATH.
- `custom/overleaf.conf` est monté seul : le modifier **sur place**, jamais par `sed -i` (nouveau fichier → le conteneur
  garde l'ancien). Si c'est arrivé : `./overleaf.sh docker-compose up -d --force-recreate sharelatex`.
- Changer `config/version` impose de reconstruire l'image TeX Live (`make image`) ; après une mise à jour d'Overleaf,
  recomparer `custom/overleaf.conf` avec `custom/overleaf.conf.orig` et le fichier d'origine de la nouvelle image.
- Scripts serveur (`import-tools/*.mjs`) : charger `/etc/container_environment.sh` avant `node`.
- `overleaf-launch.sh` : lanceur macOS (démarre ou relance Docker Desktop s'il est figé) ; partout ailleurs, `make start`.

## Licence

Overleaf Toolkit et Overleaf : AGPL-3.0 (voir `LICENSE`). Police Outfit : SIL Open Font License.
