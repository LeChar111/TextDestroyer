#!/bin/bash
# Lance tout : Docker Desktop, Overleaf local (toolkit) + terminal Claude, puis ouvre l'onglet.
# macOS (Docker Desktop). Chaque ligne « STATUT: … » / « ERREUR: … » est affichée par l'app.
# Aucun appel à Docker n'attend indéfiniment : un démon figé est détecté et Docker Desktop est relancé.
set -u
SOCK="$HOME/.docker/run/docker.sock"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$(dirname "$0")" || exit 1
PORT="$(sed -n 's/^OVERLEAF_PORT=//p' config/overleaf.rc 2>/dev/null)"; PORT="${PORT:-80}"
URL="http://localhost:$PORT/project"

ready()   { c=$(curl -s -m 4 -o /dev/null -w '%{http_code}' http://localhost:$PORT/launchpad); [ "$c" = 200 ] || [ "$c" = 302 ]; }
docker_ok() { [ "$(curl -s -m 4 --unix-socket "$SOCK" http://localhost/_ping 2>/dev/null)" = OK ]; }
limit()   { perl -e 'alarm shift; exec @ARGV' "$@"; }   # limit <secondes> <commande…>

wait_docker() {  # $1 = secondes
  for _ in $(seq 1 $(( $1 / 2 ))); do docker_ok && return 0; sleep 2; done; return 1
}

restart_docker() {
  echo "STATUT: relance de Docker Desktop"
  osascript -e 'quit app "Docker Desktop"' >/dev/null 2>&1
  for _ in $(seq 1 15); do pgrep -f com.docker.backend >/dev/null || break; sleep 2; done
  pkill -f 'Docker Desktop.app/Contents/MacOS/Docker Desktop' 2>/dev/null
  pkill -f com.docker.backend 2>/dev/null; sleep 3
  pkill -9 -f com.docker.backend 2>/dev/null; sleep 1
  open -b com.docker.docker
}

if ready; then echo "STATUT: déjà en service"; open "$URL"; echo "STATUT: prêt"; exit 0; fi

if ! docker_ok; then
  if pgrep -f com.docker.backend >/dev/null; then
    echo "STATUT: Docker ne répond pas"
    wait_docker 20 || restart_docker        # figé (ex. arrêt resté bloqué) : on relance
  else
    echo "STATUT: démarrage de Docker"
    open -b com.docker.docker || { echo "ERREUR: Docker Desktop introuvable"; exit 1; }
  fi
  wait_docker 180 || { echo "ERREUR: Docker ne répond pas"; exit 1; }
fi

echo "STATUT: démarrage d'Overleaf"
limit 600 ./overleaf.sh up -d >/tmp/overleaf-up.log 2>&1 || { echo "ERREUR: démarrage des conteneurs échoué (voir /tmp/overleaf-up.log)"; exit 1; }

echo "STATUT: attente du serveur"
for _ in $(seq 1 90); do ready && break; sleep 2; done
ready || { echo "ERREUR: Overleaf ne répond pas sur le port $PORT"; exit 1; }

open "$URL"
echo "STATUT: prêt"
