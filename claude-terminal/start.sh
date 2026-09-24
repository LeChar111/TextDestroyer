#!/bin/bash
# Session du panneau : Claude Code dans /workspace, puis un shell quand on le quitte.
cd /workspace || cd ~
echo "Terminal Claude — /workspace = dossier de travail (TG_WORKSPACE). Outils : overleaf (projects, ls, grep, pull, push), docker."
mkdir -p ~/.claude ~/overleaf
# Consignes (outil « overleaf ») : rafraîchies à chaque session depuis le toolkit
# (+ consignes personnelles facultatives : config/togaether/CLAUDE.local.md, non versionné)
cat /etc/tg-claude/CLAUDE.md /etc/tg-claude/local/CLAUDE.local.md > ~/.claude/CLAUDE.md 2>/dev/null
# Reprend la dernière conversation (après un redémarrage du conteneur), sinon en ouvre une nouvelle
claude --continue --add-dir ~/overleaf || claude --add-dir ~/overleaf
exec bash -l
