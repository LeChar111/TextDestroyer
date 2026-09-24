# Overleaf Community Edition + collections TeX Live usuelles (XeLaTeX / LuaLaTeX, paquets courants,
# TikZ, français, polices). Construit par « make image » : tag sharelatex/sharelatex:<version>-with-texlive-full.
# TeX Live complet (~5 Go de plus) : make image TEXLIVE="scheme-full".
# L'image officielle n'existe qu'en amd64 : sur ARM, elle tourne émulée (Rosetta / QEMU).
ARG BASE=sharelatex/sharelatex:6.3.0
FROM ${BASE}
ARG TEXLIVE="collection-xetex collection-luatex collection-latexrecommended collection-latexextra collection-pictures collection-langfrench collection-langenglish collection-fontsrecommended"
RUN tlmgr update --self \
 && tlmgr install ${TEXLIVE} \
 && tlmgr path add
