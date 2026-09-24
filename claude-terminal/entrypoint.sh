#!/bin/bash
# Serveur de contexte en tâche de fond, puis ttyd (processus principal du conteneur).
node /usr/local/lib/tg/ctx-server.js &
exec "$@"
