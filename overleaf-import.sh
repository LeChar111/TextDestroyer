#!/bin/bash
# Importe dans Overleaf local des dossiers ou des zips comme nouveaux projets.
#   ./overleaf-import.sh                 → tout ce qui est dans import/ (déplacé ensuite dans import/importes/)
#   ./overleaf-import.sh <dossier|zip>…  → les chemins donnés
# Un zip d'export global d'overleaf.com (zip de zips) est déplié : un projet par zip interne.
# Compilateur XeLaTeX choisi si un .tex charge fontspec ; fichier principal forcé par un fichier <zip>.root.
# Lignes « STATUT: … » / « ERREUR: … » : lisibles par une interface qui lance le script.
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$(dirname "$0")" || exit 1
[ -f config/togaether/settings.env ] && { set -a; . config/togaether/settings.env; set +a; }
PORT="$(sed -n 's/^OVERLEAF_PORT=//p' config/overleaf.rc 2>/dev/null)"; PORT="${PORT:-80}"
URL="http://localhost:$PORT/project"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

c=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:$PORT/launchpad)
if [ "$c" != 200 ] && [ "$c" != 302 ]; then
  echo "STATUT: démarrage d'Overleaf"
  if [ "$(uname -s)" = Darwin ]; then ./overleaf-launch.sh >/dev/null 2>&1; else ./overleaf.sh up -d >/dev/null 2>&1; fi
  for _ in $(seq 1 90); do c=$(curl -s -m 3 -o /dev/null -w '%{http_code}' "http://localhost:$PORT/launchpad"); [ "$c" = 200 ] || [ "$c" = 302 ] && break; sleep 2; done
  [ "$c" = 200 ] || [ "$c" = 302 ] || { echo "ERREUR: Overleaf ne démarre pas"; exit 1; }
fi
# Propriétaire des projets : OVERLEAF_IMPORT_EMAIL, sinon OVERLEAF_ADMIN_EMAIL (settings.env), sinon le premier administrateur
EMAIL="${OVERLEAF_IMPORT_EMAIL:-${OVERLEAF_ADMIN_EMAIL:-}}"
[ -n "$EMAIL" ] || EMAIL="$(docker exec mongo mongosh --quiet sharelatex --eval 'print((db.users.findOne({isAdmin:true},{email:1})||{}).email||"")' 2>/dev/null | tail -1)"
[ -n "$EMAIL" ] || { echo "ERREUR: aucun administrateur — make admin EMAIL=… ou OVERLEAF_IMPORT_EMAIL"; exit 1; }
docker cp import-tools/import-zip.mjs sharelatex:/overleaf/services/web/modules/server-ce-scripts/scripts/import-zip.mjs >/dev/null \
  || { echo "ERREUR: conteneur sharelatex introuvable"; exit 1; }

ok=0; ko=0; skip=0
import_zip() {  # $1 = zip, $2 = nom du projet (vide = titre du document)
  local zip="$1" name="$2" compiler="" root="" base
  base="$(basename "$zip")"
  unzip -Z1 "$zip" 2>/dev/null | grep -qiE '\.tex$' && unzip -p "$zip" '*.tex' 2>/dev/null | grep -q 'fontspec' && compiler=xelatex
  [ -f "${zip%.zip}.root" ] && root="$(head -1 "${zip%.zip}.root")"
  echo "STATUT: import de ${name:-$base}"
  docker cp "$zip" "sharelatex:/tmp/$base" >/dev/null
  out=$(docker exec sharelatex bash -c "source /etc/container_environment.sh && cd /overleaf/services/web && node modules/server-ce-scripts/scripts/import-zip.mjs --email='$EMAIL' --zip='/tmp/$base' ${name:+--name=\"$name\"} ${compiler:+--compiler=$compiler} ${root:+--root='$root'}" 2>&1 | grep -E '^(IMPORTE|DEJA|ERREUR)' | tail -1)
  docker exec sharelatex rm -f "/tmp/$base"
  case "$out" in IMPORTE*) ok=$((ok+1)); echo "  $out" ;; DEJA*) skip=$((skip+1)); echo "  $out" ;; *) ko=$((ko+1)); echo "  ${out:-ERREUR inconnue} ($base)" ;; esac
}

import_path() {
  local p="$1"
  if [ -d "$p" ]; then
    local name; name="$(basename "$p")"
    (cd "$p" && zip -qr "$WORK/$name.zip" . -x '.git/*' '*/.DS_Store' '.DS_Store' '*.aux' '*.log' '*.synctex.gz' '*.fls' '*.fdb_latexmk' '*.xdv')
    import_zip "$WORK/$name.zip" "$name"
  elif [ -f "$p" ] && [[ "$p" == *.zip ]]; then
    if unzip -Z1 "$p" | grep -qvE '\.zip$|/$'; then
      import_zip "$p" "$(basename "${p%.zip}")"
    else  # zip de zips (export global overleaf.com)
      local d="$WORK/$(basename "${p%.zip}")"; mkdir -p "$d"
      # extraction une à une : l'export overleaf.com peut contenir deux projets de même nom
      python3 - "$p" "$d" <<'PY'
import sys, zipfile, os
src, dst = sys.argv[1], sys.argv[2]
seen = {}
with zipfile.ZipFile(src) as z:
    for i, info in enumerate(z.infolist()):
        if not info.filename.lower().endswith(".zip"): continue
        base = os.path.basename(info.filename)[:-4]
        seen[base] = seen.get(base, 0) + 1
        name = base if seen[base] == 1 else f"{base} ({seen[base]})"
        with z.open(info) as fi, open(os.path.join(dst, f"{i:03d} {name}.zip"), "wb") as fo:
            fo.write(fi.read())
PY
      while IFS= read -r inner; do n="$(basename "${inner%.zip}")"; import_zip "$inner" "${n#??? }"; done < <(find "$d" -name '*.zip' | sort)
    fi
  else
    echo "  ignoré : $p"
  fi
}

if [ $# -gt 0 ]; then
  for p in "$@"; do import_path "$p"; done
else
  mkdir -p import/importes
  shopt -s nullglob
  for p in import/*.zip import/*/; do
    [ "$(basename "$p")" = importes ] && continue
    before=$ko; import_path "${p%/}"
    if [ $ko -eq $before ]; then mv "${p%/}" import/importes/ 2>/dev/null; [ -f "${p%.zip}.root" ] && mv "${p%.zip}.root" import/importes/; fi
  done
fi

if [ $ko -gt 0 ]; then echo "ERREUR: $ok importé(s), $ko en échec"; else echo "STATUT: $ok projet(s) importé(s)${skip:+, $skip déjà présent(s)}"; fi
[ $ok -gt 0 ] && [ -z "${OVERLEAF_IMPORT_NO_OPEN:-}" ] && open "$URL"
[ $ko -eq 0 ]
