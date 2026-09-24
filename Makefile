# Overleaf local + terminal Claude — installation et lancement.
# Linux, macOS (Intel / Apple Silicon) et Windows via WSL2 (Docker Desktop, intégration WSL activée).
#
#   make install   vérifie l'environnement, génère la configuration, construit les images
#   make start     démarre les conteneurs et ouvre Overleaf dans le navigateur
#   make admin EMAIL=vous@exemple.org   crée un compte administrateur
#   make help      toutes les commandes
#
# Réglages locaux (non versionnés) : config/togaether/settings.env, créé par « make config ».

SHELL := /bin/bash
.DEFAULT_GOAL := help

ifeq ($(OS),Windows_NT)
  $(error Sous Windows, lancez make depuis WSL2 (Ubuntu) avec Docker Desktop et l'intégration WSL activée)
endif

UNAME   := $(shell uname -s)
IS_WSL  := $(shell grep -qi microsoft /proc/version 2>/dev/null && echo 1)

# macOS : les scripts bin/* du toolkit attendent GNU sed / coreutils (brew install gnu-sed coreutils)
ifeq ($(UNAME),Darwin)
  BREW := $(shell brew --prefix 2>/dev/null)
  ifneq ($(BREW),)
    export PATH := $(BREW)/opt/gnu-sed/libexec/gnubin:$(BREW)/opt/coreutils/libexec/gnubin:$(PATH)
  endif
endif

SETTINGS := config/togaether/settings.env
-include $(SETTINGS)
export TG_WORKSPACE DOCKER_GID OVERLEAF_ADMIN_EMAIL

PORT    := $(shell sed -n 's/^OVERLEAF_PORT=//p' config/overleaf.rc 2>/dev/null)
PORT    := $(if $(PORT),$(PORT),80)
URL     := http://localhost:$(PORT)
VERSION := $(shell cat config/version 2>/dev/null)
BASE    := $(subst -with-texlive-full,,$(VERSION))
IMAGE   := sharelatex/sharelatex:$(VERSION)
DC      := ./bin/docker-compose

ifeq ($(UNAME),Darwin)
  OPEN := open
else ifeq ($(IS_WSL),1)
  OPEN := $(shell command -v wslview >/dev/null 2>&1 && echo wslview || echo 'cmd.exe /c start ""')
else
  OPEN := xdg-open
endif

.PHONY: help check config image terminal install start up stop restart status logs shell open admin import token

help: ## Affiche cette aide
	@echo "Overleaf local + terminal Claude — $(URL)"
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-10s %s\n", $$1, $$2}'

check: ## Vérifie Docker, Docker Compose et les outils requis
	@command -v docker >/dev/null || { echo "✗ docker introuvable : installer Docker Desktop (Mac, Windows) ou Docker Engine (Linux)"; exit 1; }
	@docker info >/dev/null 2>&1 || { echo "✗ le démon Docker ne répond pas : démarrer Docker"; exit 1; }
	@docker compose version >/dev/null 2>&1 || { echo "✗ Docker Compose v2 requis (« docker compose »)"; exit 1; }
	@for t in curl openssl sed awk; do command -v $$t >/dev/null || { echo "✗ $$t introuvable"; exit 1; }; done
	@sed --version >/dev/null 2>&1 || { echo "✗ GNU sed requis (macOS : brew install gnu-sed coreutils)"; exit 1; }
	@arch=$$(docker info --format '{{.Architecture}}'); case "$$arch" in x86_64|amd64) ;; *) \
	  echo "ℹ Docker tourne en $$arch : l'image Overleaf (amd64) sera émulée (Rosetta sous Docker Desktop, QEMU/binfmt sous Linux)";; esac
	@echo "✓ environnement prêt ($(UNAME)$(if $(IS_WSL), / WSL2,))"

config: ## Génère la configuration locale (idempotent : ne remplace rien d'existant)
	@mkdir -p config/togaether
	@if [ ! -f config/variables.env ]; then \
	  cp lib/config-seed/variables.env config/variables.env; \
	  secret=$$(openssl rand -hex 32); \
	  sed -i.bak -e "s|^OVERLEAF_APP_NAME=.*|OVERLEAF_APP_NAME=\"Overleaf local\"|" \
	             -e "s|^OVERLEAF_INVITE_TOKEN_SECRET=.*|OVERLEAF_INVITE_TOKEN_SECRET=$$secret|" config/variables.env; \
	  grep -q '^OVERLEAF_SITE_URL=' config/variables.env || echo "OVERLEAF_SITE_URL=$(URL)" >> config/variables.env; \
	  rm -f config/variables.env.bak; echo "✓ config/variables.env"; fi
	@if [ ! -f config/togaether/nginx-token.conf ] || [ ! -f config/togaether/terminal.env ]; then \
	  token=$$(openssl rand -hex 24); \
	  printf '# Généré par make config : jeton de la passerelle interne (port 8082)\n# (entrée regex : une clé de 48 caractères déborde la table de hachage des map)\nmap $$http_x_tg_token $$tg_token_ok {\n\tdefault 0;\n\t"~^%s$$" 1;\n}\n' "$$token" > config/togaether/nginx-token.conf; \
	  printf '# Généré par make config\nOVERLEAF_BRIDGE_TOKEN=%s\n' "$$token" > config/togaether/terminal.env; \
	  echo "✓ jeton de la passerelle"; fi
	@if [ ! -f $(SETTINGS) ]; then \
	  if [ "$(UNAME)" = Linux ] && ! docker info --format '{{.OperatingSystem}}' 2>/dev/null | grep -q 'Docker Desktop'; then \
	    gid=$$(stat -c %g /var/run/docker.sock 2>/dev/null || echo 0); else gid=0; fi; \
	  { echo "# Réglages locaux (non versionnés) — lus par le Makefile et overleaf.sh"; \
	    echo "# Dossier monté dans le terminal Claude sous /workspace (chemin absolu)"; \
	    echo "TG_WORKSPACE=$(CURDIR)/workspace"; \
	    echo "# Groupe du socket Docker dans le terminal (0 sous Docker Desktop)"; \
	    echo "DOCKER_GID=$$gid"; \
	    echo "# Propriétaire des projets importés (vide : premier administrateur)"; \
	    echo "OVERLEAF_ADMIN_EMAIL="; } > $(SETTINGS); \
	  echo "✓ $(SETTINGS) (à ajuster : TG_WORKSPACE)"; fi
	@mkdir -p "$${TG_WORKSPACE:-$(CURDIR)/workspace}" 2>/dev/null; true

image: ## Construit l'image Overleaf + TeX Live si elle manque (TEXLIVE="scheme-full" : tout)
	@if docker image inspect $(IMAGE) >/dev/null 2>&1; then echo "✓ image $(IMAGE)"; \
	elif [ "$(VERSION)" = "$(BASE)" ]; then docker pull --platform linux/amd64 $(IMAGE); \
	else docker build --platform linux/amd64 --build-arg BASE=sharelatex/sharelatex:$(BASE) \
	  $(if $(TEXLIVE),--build-arg TEXLIVE="$(TEXLIVE)") -t $(IMAGE) overleaf-image; fi

terminal: config ## (Re)construit l'image du terminal Claude
	$(DC) build claude-terminal

install: check config image terminal ## Installation complète
	@echo "✓ installé — « make start », puis « make admin EMAIL=… » au premier lancement"

up: config ## Démarre les conteneurs (sans ouvrir le navigateur)
	$(DC) up -d

start: up ## Démarre et ouvre Overleaf
	@printf "attente d'Overleaf sur $(URL) "; for i in $$(seq 1 120); do \
	  c=$$(curl -s -m 3 -o /dev/null -w '%{http_code}' $(URL)/launchpad); \
	  if [ "$$c" = 200 ] || [ "$$c" = 302 ]; then echo " ✓"; $(OPEN) "$(URL)/project" >/dev/null 2>&1 || echo "→ $(URL)/project"; exit 0; fi; \
	  printf .; sleep 2; done; echo " ✗ pas de réponse (make logs)"; exit 1

stop: ## Arrête les conteneurs
	$(DC) stop

restart: ## Redémarre les conteneurs
	$(DC) restart

status: ## État des conteneurs
	$(DC) ps

logs: ## Journaux (Ctrl+C pour quitter)
	$(DC) logs -f --tail=100

shell: ## Shell dans le conteneur Overleaf
	./bin/shell

open: ## Ouvre Overleaf dans le navigateur
	@$(OPEN) "$(URL)/project" >/dev/null 2>&1 || echo "→ $(URL)/project"

admin: ## Crée un administrateur : make admin EMAIL=vous@exemple.org
	@test -n "$(EMAIL)" || { echo "usage : make admin EMAIL=vous@exemple.org"; exit 1; }
	docker exec sharelatex /bin/bash -ce "cd /overleaf/services/web && node modules/server-ce-scripts/scripts/create-user --admin --email=$(EMAIL)"

import: ## Importe des projets : make import [FILES="dossier/ projet.zip"] (défaut : import/)
	./overleaf-import.sh $(FILES)

token: ## Régénère le jeton de la passerelle interne, puis redémarre
	rm -f config/togaether/nginx-token.conf config/togaether/terminal.env
	@$(MAKE) --no-print-directory config
	$(DC) up -d --force-recreate sharelatex claude-terminal
