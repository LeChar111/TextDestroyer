# Terminal Claude Code personnel, affiché dans Overleaf local (panneau « Claude »).
# ttyd sert le terminal au navigateur ; tmux garde la session quand on ferme le panneau.
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends tmux git curl ca-certificates less python3 ripgrep openssh-client locales librsvg2-bin libheif-examples \
 && arch="$(uname -m)" && case "$arch" in aarch64) t=aarch64;; x86_64) t=x86_64;; *) echo "arch $arch non gérée"; exit 1;; esac \
 && curl -fsSL "https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.$t" -o /usr/local/bin/ttyd && chmod +x /usr/local/bin/ttyd \
 && sed -i 's/# fr_FR.UTF-8/fr_FR.UTF-8/; s/# en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen && locale-gen \
 && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code mongodb && npm cache clean --force
# Client Docker seul (le démon est celui de Docker Desktop, via le socket monté) : permet à Claude
# de recharger nginx ou redémarrer un conteneur après avoir modifié une configuration.
RUN arch="$(uname -m)" && curl -fsSL "https://download.docker.com/linux/static/stable/${arch}/docker-28.4.0.tgz" \
 | tar -xz -C /tmp docker/docker && mv /tmp/docker/docker /usr/local/bin/docker && rm -rf /tmp/docker
ENV NODE_PATH=/usr/local/lib/node_modules
ENV LANG=fr_FR.UTF-8 LC_ALL=fr_FR.UTF-8 TERM=xterm-256color
COPY tmux.conf /etc/tmux.conf
COPY start.sh /usr/local/bin/tg-claude-session
COPY ctx-server.js /usr/local/lib/tg/ctx-server.js
COPY entrypoint.sh /usr/local/bin/tg-entrypoint
RUN chmod +x /usr/local/bin/tg-claude-session /usr/local/bin/tg-entrypoint
USER node
WORKDIR /workspace
EXPOSE 7681 7682
ENTRYPOINT ["/usr/local/bin/tg-entrypoint"]
# -W : saisie autorisée · -b : servi sous /togaether/terminal (relais nginx d'Overleaf)
CMD ["ttyd", "-W", "-p", "7681", "-b", "/togaether/terminal", \
     "-t", "fontSize=13", \
     "-t", "fontFamily=SF Mono, Menlo, ui-monospace, monospace", \
     "-t", "cursorStyle=bar", \
     "-t", "macOptionClickForcesSelection=true", \
     "-t", "rightClickSelectsWord=true", \
     "-t", "theme={\"background\":\"#fbfbfd\",\"foreground\":\"#1c1b24\",\"cursor\":\"#f06e1e\",\"selectionBackground\":\"#f6c7a5\",\"black\":\"#1c1b24\",\"red\":\"#d6453d\",\"green\":\"#4f8a1c\",\"yellow\":\"#b7791f\",\"blue\":\"#3b5bdb\",\"magenta\":\"#8b3fd9\",\"cyan\":\"#1c7c8a\",\"white\":\"#8e8c99\",\"brightBlack\":\"#5d5b68\",\"brightRed\":\"#f06e1e\"}", \
     "-t", "titleFixed=Claude", \
     "tmux", "new-session", "-A", "-s", "claude", "tg-claude-session"]
