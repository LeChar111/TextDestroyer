#!/bin/bash
# Enveloppe des scripts bin/* du toolkit (Linux, macOS, WSL2) : charge les réglages locaux, et sous macOS
# met les outils GNU (sed -r, realpath ; brew install gnu-sed coreutils) en tête du PATH.
# - l'image sharelatex (amd64 seulement) déclare sa plateforme dans config/docker-compose.override.yml.
#   ./overleaf.sh docker-compose up -d | stop | start | shell | doctor | logs   (ou : make …)
if [ "$(uname -s)" = Darwin ] && command -v brew >/dev/null 2>&1; then
  b="$(brew --prefix)"; export PATH="$b/opt/gnu-sed/libexec/gnubin:$b/opt/coreutils/libexec/gnubin:$PATH"
fi
cd "$(dirname "$0")" || exit 1
# Réglages locaux (TG_WORKSPACE, DOCKER_GID…) générés par « make config »
[ -f config/togaether/settings.env ] && { set -a; . config/togaether/settings.env; set +a; }
exec bin/"$@"
