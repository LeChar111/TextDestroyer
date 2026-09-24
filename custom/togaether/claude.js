/* Panneau « Claude » — terminal Claude Code personnel dans Overleaf local.
 * Le terminal tourne dans le conteneur claude-terminal (ttyd + tmux) et n'est
 * relayé par nginx que pour une session Overleaf connectée (/togaether/terminal/).
 * La session tmux survit à la fermeture du panneau et au rechargement de la page. */
(() => {
  'use strict'
  if (!document.querySelector('meta[name="ol-user_id"]')?.content) return
  if (window.top !== window) return

  const SRC = '/togaether/terminal/'
  const KEY_W = 'tg-claude-width', KEY_OPEN = 'tg-claude-open'
  const store = { get: k => { try { return localStorage.getItem(k) } catch { return null } }, set: (k, v) => { try { localStorage.setItem(k, v) } catch {} } }

  const css = document.createElement('style')
  css.textContent = `
  #tg-claude-fab{position:fixed;right:20px;bottom:20px;z-index:2147483000;display:flex;align-items:center;gap:12px;
    padding:8px 8px 8px 18px;border-radius:999px;background:#fff;border:1px solid oklch(0.9 0.008 280);cursor:pointer;
    box-shadow:0 2px 6px rgb(20 10 40/.06),0 18px 40px -14px rgb(20 10 40/.28);font-family:Outfit,system-ui,sans-serif;
    transition:transform .18s ease,box-shadow .18s ease}
  #tg-claude-fab:hover{transform:translateY(-1px);box-shadow:0 2px 6px rgb(20 10 40/.08),0 22px 48px -14px rgb(20 10 40/.34)}
  #tg-claude-fab .l{display:flex;flex-direction:column;line-height:1.05;text-align:left}
  #tg-claude-fab .q{font-style:italic;font-size:.78rem;color:oklch(0.5 0.02 280)}
  #tg-claude-fab .t{font-weight:800;font-size:1.02rem;color:oklch(0.15 0.01 280);letter-spacing:-.01em}
  #tg-claude-fab .o{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:oklch(0.692 0.19 46.6);
    color:#fff;font-size:18px;box-shadow:0 6px 16px -6px oklch(0.692 0.19 46.6/.9)}
  #tg-claude-fab.open{opacity:0;pointer-events:none;transform:translateY(8px)}
  #tg-claude-panel{position:fixed;top:12px;right:12px;bottom:12px;z-index:2147483001;display:flex;flex-direction:column;
    width:var(--tg-claude-w,560px);max-width:calc(100vw - 24px);min-width:360px;background:#fbfbfd;border-radius:1.5rem;overflow:hidden;
    box-shadow:0 0 0 1px rgb(20 10 40/.06),0 18px 40px -12px rgb(20 10 40/.2),0 40px 100px -30px rgb(20 10 40/.35);
    transform:translateX(calc(100% + 24px));transition:transform .28s cubic-bezier(.2,.8,.2,1);font-family:Outfit,system-ui,sans-serif}
  #tg-claude-panel.open{transform:none}
  #tg-claude-panel header{display:flex;align-items:center;gap:10px;padding:14px 14px 12px 20px;border-bottom:1px solid oklch(0.93 0.006 280)}
  #tg-claude-panel header .k{font-size:.68rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:oklch(0.692 0.19 46.6)}
  #tg-claude-panel header .h{font-weight:800;font-size:1.15rem;letter-spacing:-.01em;color:oklch(0.15 0.01 280)}
  #tg-claude-panel header .s{font-size:.78rem;color:oklch(0.5 0.02 280)}
  #tg-claude-panel header .sp{flex:1}
  #tg-claude-panel header button,#tg-claude-panel header a{width:34px;height:34px;border-radius:10px;border:0;background:transparent;display:grid;
    place-items:center;color:oklch(0.45 0.02 280);cursor:pointer;font-size:16px;text-decoration:none}
  #tg-claude-panel header button:hover,#tg-claude-panel header a:hover{background:oklch(0.93 0.006 280);color:oklch(0.15 0.01 280)}
  #tg-claude-panel iframe{flex:1;border:0;width:100%;background:#fbfbfd}
  #tg-claude-grip{position:absolute;left:0;top:0;bottom:0;width:8px;cursor:ew-resize}
  #tg-claude-grip:hover{background:oklch(0.692 0.19 46.6/.18)}
  body.tg-claude-resizing iframe{pointer-events:none}
  body.tg-claude-resizing{user-select:none}
  /* Mode fenêtre (détaché) : flottant, déplaçable par l'en-tête, redimensionnable par bords et coins */
  #tg-claude-panel.float{top:var(--tg-y,80px);left:var(--tg-x,calc(100vw - 620px));right:auto;bottom:auto;
    width:var(--tg-fw,600px);height:var(--tg-fh,520px);min-width:320px;min-height:220px;border-radius:1rem;
    transform:scale(.96);opacity:0;pointer-events:none;transition:transform .18s ease,opacity .18s ease}
  #tg-claude-panel.float.open{transform:none;opacity:1;pointer-events:auto}
  #tg-claude-panel.float header{cursor:move;padding:10px 10px 9px 16px}
  #tg-claude-panel.float header .s{display:none}
  #tg-claude-panel.float header .h{font-size:1rem}
  #tg-claude-panel.float #tg-claude-grip{display:none}
  #tg-claude-panel.float.min{height:auto!important;min-height:0}
  #tg-claude-panel.float.min iframe{height:0;flex:0 0 0}
  #tg-claude-panel.float.min header{border-bottom:0}
  #tg-claude-panel .tg-rz{position:absolute;z-index:2;display:none}
  #tg-claude-panel.float:not(.min) .tg-rz{display:block}
  #tg-claude-panel .tg-rz[data-d=n]{top:-3px;left:10px;right:10px;height:8px;cursor:ns-resize}
  #tg-claude-panel .tg-rz[data-d=s]{bottom:-3px;left:10px;right:10px;height:8px;cursor:ns-resize}
  #tg-claude-panel .tg-rz[data-d=e]{right:-3px;top:10px;bottom:10px;width:8px;cursor:ew-resize}
  #tg-claude-panel .tg-rz[data-d=w]{left:-3px;top:10px;bottom:10px;width:8px;cursor:ew-resize}
  #tg-claude-panel .tg-rz[data-d=ne]{top:-3px;right:-3px;width:14px;height:14px;cursor:nesw-resize}
  #tg-claude-panel .tg-rz[data-d=sw]{bottom:-3px;left:-3px;width:14px;height:14px;cursor:nesw-resize}
  #tg-claude-panel .tg-rz[data-d=nw]{top:-3px;left:-3px;width:14px;height:14px;cursor:nwse-resize}
  #tg-claude-panel .tg-rz[data-d=se]{bottom:-3px;right:-3px;width:16px;height:16px;cursor:nwse-resize}
  #tg-claude-panel.float:not(.min)::after{content:"";position:absolute;right:5px;bottom:5px;width:9px;height:9px;pointer-events:none;
    border-right:2px solid oklch(0.8 0.01 280);border-bottom:2px solid oklch(0.8 0.01 280);border-bottom-right-radius:3px}
  #tg-claude-drop{position:absolute;inset:0;z-index:3;display:none;place-items:center;pointer-events:none;
    background:oklch(0.692 0.19 46.6/.1);border:2px dashed oklch(0.692 0.19 46.6);border-radius:inherit;
    font-weight:700;font-size:1rem;color:oklch(0.55 0.19 46.6)}
  #tg-claude-panel.dragging #tg-claude-drop{display:grid}
  #tg-claude-panel.dragging iframe{pointer-events:none}
  #tg-claude-toast{position:absolute;left:50%;bottom:16px;z-index:4;transform:translateX(-50%);padding:6px 14px;border-radius:999px;
    background:oklch(0.2 0.01 280);color:#fff;font-size:.8rem;opacity:0;transition:opacity .2s;pointer-events:none;white-space:nowrap}
  #tg-claude-toast.on{opacity:.92}`
  document.head.appendChild(css)

  const fab = document.createElement('button')
  fab.id = 'tg-claude-fab'; fab.type = 'button'; fab.title = 'Terminal Claude (Ctrl + `)'
  fab.innerHTML = '<span class="l"><span class="q">Besoin d’aide ?</span><span class="t">Claude</span></span><span class="o">✦</span>'

  const panel = document.createElement('aside')
  panel.id = 'tg-claude-panel'; panel.setAttribute('aria-label', 'Terminal Claude')
  panel.innerHTML = `<div id="tg-claude-grip" title="Redimensionner"></div>
    <header><div><div class="k">Claude</div><div class="h">Terminal</div><div class="s">Conteneur claude-terminal · /workspace = dossier de travail</div></div>
    <span class="sp"></span>
    <button type="button" data-a="sel" title="Envoyer la sélection de l’éditeur à Claude">❝</button>
    <button type="button" data-a="reload" title="Recharger le terminal">↻</button>
    <a href="${SRC}" target="_blank" rel="noopener" title="Ouvrir dans un onglet">↗</a>
    <button type="button" data-a="detach" title="Détacher en fenêtre">⧉</button>
    <button type="button" data-a="min" title="Réduire">–</button>
    <button type="button" data-a="close" title="Fermer (la session continue)">✕</button></header>
    <div class="tg-rz" data-d="n"></div><div class="tg-rz" data-d="s"></div><div class="tg-rz" data-d="e"></div><div class="tg-rz" data-d="w"></div>
    <div class="tg-rz" data-d="ne"></div><div class="tg-rz" data-d="nw"></div><div class="tg-rz" data-d="se"></div><div class="tg-rz" data-d="sw"></div>
    <div id="tg-claude-drop">Déposer pour joindre à Claude</div><div id="tg-claude-toast"></div>`

  let frame = null
  const w = parseInt(store.get(KEY_W) || '', 10)
  if (w) panel.style.setProperty('--tg-claude-w', w + 'px')

  function setOpen(open) {
    if (open && !frame) {
      frame = document.createElement('iframe')
      frame.src = SRC; frame.title = 'Terminal Claude'; frame.allow = 'clipboard-read; clipboard-write'
      frame.addEventListener('load', hookFrame)
      panel.appendChild(frame)
    }
    panel.classList.toggle('open', open); fab.classList.toggle('open', open)
    fab.querySelector('.o').textContent = open ? '✕' : '✦'
    store.set(KEY_OPEN, open ? '1' : '0')
    if (open) { setTimeout(() => frame?.contentWindow?.focus(), 300); sendSelection(false) }
  }
  fab.addEventListener('click', () => setOpen(!panel.classList.contains('open')))
  panel.addEventListener('click', e => {
    const a = e.target.closest('button')?.dataset.a
    if (a === 'close') setOpen(false)
    if (a === 'reload' && frame) frame.src = SRC
    if (a === 'sel') sendSelection(true)
    if (a === 'detach') setFloat(!panel.classList.contains('float'))
    if (a === 'min') setMin(!panel.classList.contains('min'))
  })
  document.addEventListener('keydown', e => { if (e.ctrlKey && e.key === '`') { e.preventDefault(); if (panel.classList.contains('min')) setMin(false); else setOpen(!panel.classList.contains('open')) } })

  const grip = panel.querySelector('#tg-claude-grip')
  grip.addEventListener('pointerdown', e => {
    e.preventDefault(); document.body.classList.add('tg-claude-resizing'); grip.setPointerCapture(e.pointerId)
    const move = ev => { const width = Math.max(360, Math.min(window.innerWidth - 24, window.innerWidth - 12 - ev.clientX)); panel.style.setProperty('--tg-claude-w', width + 'px') }
    const up = () => { document.body.classList.remove('tg-claude-resizing'); grip.removeEventListener('pointermove', move); store.set(KEY_W, parseInt(getComputedStyle(panel).width, 10)) }
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up, { once: true })
  })


  // ── Mode fenêtre : détacher / réattacher, déplacer, redimensionner, réduire ──
  // L'iframe n'est jamais déplacée dans le DOM : changer de mode ne recharge pas le terminal.
  const KEY_FLOAT = 'tg-claude-float', KEY_GEOM = 'tg-claude-geom', KEY_MIN = 'tg-claude-min'
  const clampGeom = g => {
    const W = window.innerWidth, H = window.innerHeight
    const w = Math.max(320, Math.min(g.w, W - 16)), h = Math.max(220, Math.min(g.h, H - 16))
    return { x: Math.max(8, Math.min(g.x, W - w - 8)), y: Math.max(8, Math.min(g.y, H - 48)), w, h }
  }
  let geom = (() => { try { return JSON.parse(store.get(KEY_GEOM)) } catch { return null } })()
    || { x: window.innerWidth - 640, y: 90, w: 600, h: Math.min(560, window.innerHeight - 140) }
  function applyGeom(save) {
    geom = clampGeom(geom)
    panel.style.setProperty('--tg-x', geom.x + 'px'); panel.style.setProperty('--tg-y', geom.y + 'px')
    panel.style.setProperty('--tg-fw', geom.w + 'px'); panel.style.setProperty('--tg-fh', geom.h + 'px')
    if (save) store.set(KEY_GEOM, JSON.stringify(geom))
  }
  function setFloat(on) {
    panel.classList.toggle('float', on)
    if (!on) panel.classList.remove('min')
    const b = panel.querySelector('[data-a=detach]')
    b.textContent = on ? '⇥' : '⧉'; b.title = on ? 'Réattacher dans le tiroir' : 'Détacher en fenêtre'
    panel.querySelector('[data-a=min]').style.display = on ? '' : 'none'
    store.set(KEY_FLOAT, on ? '1' : '0'); applyGeom(false)
    if (!panel.classList.contains('open')) setOpen(true)
  }
  function setMin(on) {
    if (!panel.classList.contains('float')) return
    panel.classList.toggle('min', on)
    const b = panel.querySelector('[data-a=min]'); b.textContent = on ? '▢' : '–'; b.title = on ? 'Ré-afficher' : 'Réduire'
    store.set(KEY_MIN, on ? '1' : '0')
    if (!on) setTimeout(() => frame?.contentWindow?.focus(), 150)
  }
  // Déplacer par l'en-tête (hors boutons) ; double-clic = réduire / ré-afficher
  const header = panel.querySelector('header')
  header.addEventListener('dblclick', e => { if (!e.target.closest('button,a') && panel.classList.contains('float')) setMin(!panel.classList.contains('min')) })
  header.addEventListener('pointerdown', e => {
    if (!panel.classList.contains('float') || e.button !== 0 || e.target.closest('button,a')) return
    e.preventDefault(); header.setPointerCapture(e.pointerId); document.body.classList.add('tg-claude-resizing')
    const sx = e.clientX, sy = e.clientY, g0 = { ...geom }
    const move = ev => { geom = { ...g0, x: g0.x + ev.clientX - sx, y: g0.y + ev.clientY - sy }; applyGeom(false) }
    const up = () => { header.removeEventListener('pointermove', move); document.body.classList.remove('tg-claude-resizing'); applyGeom(true) }
    header.addEventListener('pointermove', move); header.addEventListener('pointerup', up, { once: true })
  })
  // Redimensionner par les bords et les coins
  panel.querySelectorAll('.tg-rz').forEach(h => h.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); h.setPointerCapture(e.pointerId); document.body.classList.add('tg-claude-resizing')
    const d = h.dataset.d, sx = e.clientX, sy = e.clientY, g0 = { ...geom }
    const move = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy, g = { ...g0 }
      if (d.includes('e')) g.w = g0.w + dx
      if (d.includes('s')) g.h = g0.h + dy
      if (d.includes('w')) { g.w = Math.max(320, g0.w - dx); g.x = g0.x + (g0.w - g.w) }
      if (d.includes('n')) { g.h = Math.max(220, g0.h - dy); g.y = g0.y + (g0.h - g.h) }
      geom = g; applyGeom(false)
    }
    const up = () => { h.removeEventListener('pointermove', move); document.body.classList.remove('tg-claude-resizing'); applyGeom(true) }
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up, { once: true })
  }))
  window.addEventListener('resize', () => { if (panel.classList.contains('float')) applyGeom(false) })
  applyGeom(false)
  if (store.get(KEY_FLOAT) === '1') { panel.classList.add('float'); setTimeout(() => { setFloat(true); if (store.get(KEY_MIN) === '1') setMin(true); if (store.get(KEY_OPEN) !== '1') setOpen(false) }, 0) }
  else panel.querySelector('[data-a=min]').style.display = 'none'

  // ── Sélection de l'éditeur → saisie de Claude (sans valider) ──────────────
  // « force » : bouton ❝ (renvoie même une sélection déjà envoyée).
  let lastSent = ''
  function selection() {
    const st = window.overleaf?.unstable?.store
    let view; try { view = st?.get('editor.view') } catch {}
    if (!view?.state) return null
    const sel = view.state.selection.main
    if (sel.empty) return null
    const text = view.state.sliceDoc(sel.from, sel.to)
    if (!text.trim()) return null
    const l1 = view.state.doc.lineAt(sel.from).number, l2 = view.state.doc.lineAt(sel.to).number
    let id, name; try { id = st.get('editor.open_doc_id'); name = st.get('editor.open_doc_name') } catch {}
    const path = window.tgOverleaf?.docPath?.(id) || name || 'document'
    const projEl = document.querySelector('.ide-redesign-toolbar-project-dropdown-toggle, .toolbar-project-title')
    const projClone = projEl?.cloneNode(true); projClone?.querySelectorAll('.material-symbols, [class*=material]').forEach(n => n.remove())
    const project = projClone?.textContent?.trim() || document.title.replace(/ - .*$/, '')
    const pid = (location.pathname.match(/^\/project\/([0-9a-f]{24})/) || [])[1]
    return { text, path, l1, l2, project, pid, id }
  }
  async function terminal() {
    for (let i = 0; i < 60; i++) {
      const t = frame?.contentWindow?.term
      if (t && typeof t.paste === 'function') return t
      await new Promise(r => setTimeout(r, 250))
    }
    return null
  }
  async function sendSelection(force) {
    const s = selection()
    if (!s) return
    const key = s.path + ':' + s.l1 + ':' + s.text
    if (!force && key === lastSent) return
    lastSent = key // marqué AVANT les attentes : le relevé périodique ne relance pas un envoi en cours
    if (!panel.classList.contains('open')) setOpen(true)
    if (panel.classList.contains('min')) setMin(false)
    const t = await terminal()
    if (!t) return
    await new Promise(r => setTimeout(r, 400))
    const md = selectionMarkdown(s)
    // Contexte écrit dans un fichier du terminal, puis UNE ligne collée : pas de collage multi-lignes fragile.
    const ref = await postContext(md)
    t.paste(ref ? `@${ref} ` : md)
    if (force) t.focus?.()
    lastSent = key
  }
  function selectionMarkdown(s) {
    const lines = s.l1 === s.l2 ? `ligne ${s.l1}` : `lignes ${s.l1}-${s.l2}`
    const fence = /\\documentclass|\\begin|\\section|\\[a-z]+\{/.test(s.text) ? 'latex' : ''
    const pull = s.pid && s.id ? `overleaf pull ${s.pid} ${s.id} '${s.path}'` : ''
    return `# Contexte Overleaf\n\n- Projet : « ${s.project} » (id ${s.pid || '?'})\n- Fichier : ${s.path} (docId ${s.id || '?'})\n- Sélection : ${lines}\n` +
      (pull ? `- Modifier dans l'éditeur : \`${pull}\` puis \`overleaf push\` sur la copie ; « partout » : \`overleaf grep ${s.pid} '<motif>'\`\n` : '') +
      `\n\`\`\`${fence}\n${s.text}\n\`\`\`\n`
  }
  /** Écrit le contexte dans le conteneur (~/overleaf/selection.md, ou errors/ si kind = « erreur ») ; renvoie son chemin. */
  async function postContext(markdown, kind) {
    try {
      const csrf = document.querySelector('meta[name="ol-csrfToken"]')?.content || ''
      const r = await fetch('/togaether/terminal-ctx/ctx', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Csrf-Token': csrf }, body: JSON.stringify({ markdown, kind }) })
      if (r.ok) return (await r.json()).file
    } catch {}
    return null
  }
  const submitLine = t => (t.input ? t.input('\r', true) : t.paste('\r'))
  /** Colle la référence au contexte puis une consigne, et la valide si demandé. */
  async function ask(ref, fallbackMd, instruction, submit) {
    const t = await readyTerminal()
    if (!t) return
    await new Promise(r => setTimeout(r, 300))
    t.paste((ref ? `@${ref} ` : fallbackMd + '\n') + instruction)
    if (submit) { await new Promise(r => setTimeout(r, 150)); submitLine(t) }
    t.focus?.()
  }

  // Envoi automatique : panneau ouvert, une NOUVELLE sélection restée identique ~1 s (sélection
  // terminée) part dans la saisie de Claude. Relevé périodique : CodeMirror gère lui-même la souris.
  let seenKey = '', seenSince = 0
  setInterval(() => {
    if (!panel.classList.contains('open') || panel.classList.contains('min')) return // réduit : on n'interrompt pas
    const s = selection()
    const key = s ? s.path + ':' + s.l1 + ':' + s.text : ''
    if (key !== seenKey) { seenKey = key; seenSince = Date.now(); return }
    if (key && key !== lastSent && Date.now() - seenSince >= 900) sendSelection(false)
  }, 450)

  // Fichiers : glisser-déposer sur le panneau (depuis le Finder ou l'arborescence Overleaf) ou collage (⌘V)
  // dans le terminal. Fichiers du Mac → ~/overleaf/images/ (images) ou ~/overleaf/files/ du conteneur, puis le
  // chemin est collé dans l'invite (Claude Code joint les images). Document Overleaf → référence « overleaf pull ».
  const OL_ID = 'application/x-overleaf-file-id', OL_PATH = 'application/x-overleaf-file-path'
  const isImg = f => /^image\/(png|jpeg|gif|webp)$/.test(f.type)
  const hasFiles = e => { const t = [...(e.dataTransfer?.types || [])]; return t.includes('Files') || t.includes(OL_ID) }
  let toastT = 0
  function toast(msg) {
    const el = panel.querySelector('#tg-claude-toast'); el.textContent = msg; el.classList.add('on')
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2600)
  }
  async function readyTerminal() {
    if (!panel.classList.contains('open')) setOpen(true)
    if (panel.classList.contains('min')) setMin(false)
    const t = await terminal()
    if (!t) toast('Terminal indisponible')
    return t
  }
  async function uploadOne(blob, name) {
    const csrf = document.querySelector('meta[name="ol-csrfToken"]')?.content || ''
    const r = await fetch('/togaether/terminal-ctx/upload?name=' + encodeURIComponent(name),
      { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': blob.type || 'application/octet-stream', 'X-Csrf-Token': csrf }, body: blob })
    if (!r.ok) throw new Error(r.status === 413 ? 'plus de 20 Mo' : 'HTTP ' + r.status)
    return (await r.json()).file
  }
  async function sendFiles(files) {
    files = [...files]
    if (!files.length) return
    const t = await readyTerminal()
    if (!t) return
    const paths = []
    for (const f of files) {
      if (!f.size && !f.type) { toast(`${f.name} : les dossiers ne sont pas pris en charge`); continue }
      if (f.size > 20e6) { toast(`${f.name || 'fichier'} : plus de 20 Mo`); continue }
      try { paths.push(await uploadOne(f, f.name || 'collage')) } catch (e) { toast(`${f.name || 'fichier'} : échec (${e.message})`) }
    }
    if (!paths.length) return
    t.paste(paths.join(' ') + ' ')
    t.focus?.()
    toast(paths.length > 1 ? `${paths.length} fichiers joints` : (isImg(files[0]) ? 'Image jointe' : 'Fichier joint'))
  }
  // Élément de l'arborescence Overleaf : document (texte) → référence pull ; fichier binaire → copié dans le conteneur.
  async function sendEntity(id, path) {
    const t = await readyTerminal()
    if (!t) return
    const pid = (location.pathname.match(/^\/project\/([0-9a-f]{24})/) || [])[1]
    const type = document.querySelector(`.file-tree [data-file-id="${id}"]`)?.dataset.fileType
    if (type === 'doc') {
      t.paste(`[Overleaf : « ${path} » — overleaf pull ${pid} ${id} '${path}'] `)
    } else {
      try {
        const r = await fetch(`/project/${pid}/file/${id}`, { credentials: 'same-origin' })
        if (!r.ok) throw new Error('HTTP ' + r.status)
        const blob = await r.blob()
        if (blob.size > 20e6) throw new Error('plus de 20 Mo')
        t.paste(`${await uploadOne(blob, path.split('/').pop())} `)
      } catch (e) { return toast(`${path} : échec (${e.message})`) }
    }
    t.focus?.()
    toast(`« ${path.split('/').pop()} » joint`)
  }
  function onDrop(e) {
    const dt = e.dataTransfer, id = dt.getData(OL_ID)
    if (id) return sendEntity(id, dt.getData(OL_PATH) || id)
    sendFiles(dt.files)
  }
  let dragDepth = 0
  const dragOn = on => panel.classList.toggle('dragging', on)
  panel.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; dragOn(true) })
  panel.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy' })
  panel.addEventListener('dragleave', e => { if (!hasFiles(e)) return; if (--dragDepth <= 0) { dragDepth = 0; dragOn(false) } })
  panel.addEventListener('drop', e => {
    if (!hasFiles(e)) return
    e.preventDefault(); e.stopPropagation(); dragDepth = 0; dragOn(false)
    onDrop(e)
  })
  // Le terminal (même origine) : un glisser qui y entre active la zone de dépôt du panneau ; ⌘V d'un fichier l'envoie.
  function hookFrame() {
    let doc; try { doc = frame.contentDocument } catch { return }
    if (!doc || doc.tgClaudeHooked) return
    doc.tgClaudeHooked = true
    doc.addEventListener('dragenter', e => { if (hasFiles(e)) { e.preventDefault(); dragDepth = 0; dragOn(true) } }, true)
    doc.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault() }, true)
    doc.addEventListener('drop', e => { if (hasFiles(e)) { e.preventDefault(); dragDepth = 0; dragOn(false); onDrop(e) } }, true)
    doc.addEventListener('paste', e => {
      const files = [...(e.clipboardData?.items || [])].filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean)
      if (!files.length) return
      e.preventDefault(); e.stopImmediatePropagation()
      sendFiles(files)
    }, true)
  }
  window.addEventListener('dragend', () => { dragDepth = 0; dragOn(false) })

  // ── Actions sur la sélection : pastille ✦ au bout du texte sélectionné dans l'éditeur ───────────
  const APPLY = ' Applique la modification dans Overleaf (overleaf pull puis push), en ne touchant qu\'à ce passage, et résume ce que tu as changé.'
  const ACTIONS = [
    ['Corriger', 'Corrige l\'orthographe, la grammaire et la typographie française (espaces insécables, guillemets, accents) de ce passage, sans changer le fond.' + APPLY],
    ['Reformuler', 'Reformule ce passage pour le rendre plus clair et plus fluide : même sens, même registre, même balisage LaTeX.' + APPLY],
    ['Raccourcir', 'Raccourcis ce passage d\'environ un tiers en gardant toutes les informations essentielles.' + APPLY],
    ['Traduire', 'Traduis ce passage (français → anglais, ou anglais → français) en conservant les commandes LaTeX.' + APPLY],
    ['Expliquer', 'Explique ce passage (LaTeX et contenu) sans rien modifier.'],
    ['Demander…', null],
  ]
  const extraCss = document.createElement('style')
  extraCss.textContent = `
  #tg-sel-fab{position:fixed;z-index:2147482990;display:none;height:26px;padding:0 10px 0 8px;border-radius:999px;border:0;cursor:pointer;
    background:oklch(0.692 0.19 46.6);color:#fff;font:700 12px Outfit,system-ui,sans-serif;box-shadow:0 6px 16px -6px oklch(0.692 0.19 46.6/.9)}
  #tg-sel-fab.on{display:flex;align-items:center;gap:5px}
  #tg-sel-menu{position:fixed;z-index:2147482991;display:none;flex-direction:column;min-width:170px;padding:5px;border-radius:12px;background:#fff;
    border:1px solid oklch(0.9 0.008 280);box-shadow:0 18px 40px -14px rgb(20 10 40/.35);font:500 13px Outfit,system-ui,sans-serif}
  #tg-sel-menu.on{display:flex}
  #tg-sel-menu button{all:unset;padding:7px 10px;border-radius:8px;cursor:pointer;color:oklch(0.2 0.01 280)}
  #tg-sel-menu button:hover,#tg-sel-menu button:focus-visible{background:oklch(0.95 0.02 50);color:oklch(0.5 0.19 42)}
  #tg-sel-menu small{padding:4px 10px 2px;color:oklch(0.55 0.02 280);font-size:11px}
  .tg-log-claude{all:unset;cursor:pointer;margin-left:6px;padding:2px 9px;border-radius:999px;font:700 11.5px Outfit,system-ui,sans-serif;
    color:oklch(0.52 0.19 42);background:oklch(0.692 0.19 46.6/.12);white-space:nowrap}
  .tg-log-claude:hover{background:oklch(0.692 0.19 46.6/.22)}
  #tg-log-all{display:flex;align-items:center;gap:10px;margin:8px 8px 4px;padding:8px 12px;border-radius:10px;background:oklch(0.692 0.19 46.6/.1);
    font:600 12.5px Outfit,system-ui,sans-serif;color:oklch(0.35 0.05 42)}
  #tg-log-all button{margin-left:auto}`
  document.head.appendChild(extraCss)

  const selFab = document.createElement('button')
  selFab.id = 'tg-sel-fab'; selFab.type = 'button'; selFab.title = 'Demander à Claude à propos de la sélection'
  selFab.innerHTML = '✦ <span>Claude</span>'
  const selMenu = document.createElement('div')
  selMenu.id = 'tg-sel-menu'; selMenu.setAttribute('role', 'menu')
  selMenu.innerHTML = '<small>Sélection → Claude</small>' + ACTIONS.map(([label], i) => `<button type="button" role="menuitem" data-i="${i}">${label}</button>`).join('')

  function editorView() {
    try { return window.overleaf?.unstable?.store?.get('editor.view') } catch { return null }
  }
  function placeSelectionFab() {
    if (selMenu.classList.contains('on')) return
    const view = editorView(), sel = view?.state?.selection?.main
    if (!view || !sel || sel.empty || !view.hasFocus) { selFab.classList.remove('on'); return }
    const c = view.coordsAtPos(sel.head)
    if (!c) { selFab.classList.remove('on'); return }
    const below = sel.head >= sel.anchor
    selFab.style.left = Math.max(8, Math.min(window.innerWidth - 100, c.right + 6)) + 'px'
    selFab.style.top = Math.max(8, below ? c.bottom + 6 : c.top - 32) + 'px'
    selFab.classList.add('on')
  }
  selFab.addEventListener('mousedown', e => e.preventDefault()) // garde la sélection et le focus de l'éditeur
  selFab.addEventListener('click', () => {
    const r = selFab.getBoundingClientRect()
    selMenu.style.left = Math.max(8, Math.min(window.innerWidth - 190, r.left)) + 'px'
    selMenu.style.top = (r.bottom + 230 > window.innerHeight ? r.top - 236 : r.bottom + 6) + 'px'
    selMenu.classList.add('on')
  })
  selMenu.addEventListener('mousedown', e => e.preventDefault())
  selMenu.addEventListener('click', async e => {
    const b = e.target.closest('button[data-i]')
    if (!b) return
    selMenu.classList.remove('on'); selFab.classList.remove('on')
    const instruction = ACTIONS[+b.dataset.i][1]
    const s = selection()
    if (!s) return
    const key = s.path + ':' + s.l1 + ':' + s.text
    const already = key === lastSent && panel.classList.contains('open') // la référence est déjà dans l'invite
    lastSent = key // avant d'ouvrir le panneau : l'envoi automatique ne double pas la référence
    if (already) {
      const t = await readyTerminal()
      if (!t) return
      if (instruction) { t.paste(instruction); await new Promise(r => setTimeout(r, 150)); submitLine(t) }
      t.focus?.()
      return
    }
    const md = selectionMarkdown(s)
    await ask(await postContext(md), md, instruction || '', !!instruction)
  })
  document.addEventListener('mousedown', e => { if (!selMenu.contains(e.target) && e.target !== selFab) selMenu.classList.remove('on') }, true)
  document.addEventListener('keydown', e => { if (e.key === 'Escape') selMenu.classList.remove('on') })
  document.addEventListener('scroll', () => { selMenu.classList.remove('on'); selFab.classList.remove('on') }, true)
  document.addEventListener('selectionchange', () => requestAnimationFrame(placeSelectionFab))
  document.addEventListener('mouseup', () => setTimeout(placeSelectionFab, 30))
  document.addEventListener('keyup', e => { if (e.shiftKey || e.key === 'Shift') placeSelectionFab() })
  document.addEventListener('focusout', () => setTimeout(placeSelectionFab, 50))

  // ── Erreurs de compilation → Claude : bouton sur chaque erreur / avertissement, et « tout envoyer » ──
  function logEntryData(entry) {
    return {
      title: entry.querySelector('.log-entry-header-text')?.textContent?.trim() || '',
      loc: entry.querySelector('.log-entry-location')?.textContent?.replace(/[‪‬]/g, '').trim() || '',
      raw: entry.querySelector('.log-entry-content-raw')?.textContent?.trim() || '',
      hint: entry.querySelector('.log-entry-formatted-content')?.textContent?.trim() || '',
      level: entry.querySelector('.log-entry-header-text-error') ? 'erreur' : 'avertissement',
    }
  }
  async function errorsMarkdown(items) {
    const ov = window.tgOverleaf
    const pid = ov?.projectId || (location.pathname.match(/^\/project\/([0-9a-f]{24})/) || [])[1]
    let root = null; try { root = await ov?.compileRoot?.() } catch {}
    let md = `# Erreurs de compilation Overleaf\n\n- Projet : « ${document.title.replace(/ - .*$/, '')} » (id ${pid})\n` +
      (root ? `- Document compilé : ${root.path}${root.engine ? ' (' + root.engine + ')' : ''}\n` : '') +
      `- Vérifier après correction : \`overleaf compile ${pid}${root ? ` '${root.path}'` : ''}\`\n`
    for (const it of items) {
      const m = it.loc.match(/^(.*?)(?:, (?:line|ligne) |:)(\d+)$/)
      const file = m ? m[1] : it.loc, line = m ? +m[2] : 0
      const id = file && ov?.docId?.(file)
      md += `\n## ${it.level} : ${it.title}\n\n- Emplacement : ${it.loc || '?'}\n` +
        (id ? `- Modifier : \`overleaf pull ${pid} ${id} '${file}'\`\n` : '') +
        (it.hint ? `- Indication d'Overleaf : ${it.hint.slice(0, 600)}\n` : '') +
        (it.raw ? `\n\`\`\`\n${it.raw.slice(0, 3000)}\n\`\`\`\n` : '')
      if (id && line) { // quelques lignes de source autour de l'erreur
        try {
          const r = await fetch(`/Project/${pid}/doc/${id}/download`, { credentials: 'same-origin' })
          const src = r.ok ? (await r.text()).split('\n') : []
          const from = Math.max(1, line - 4), to = Math.min(src.length, line + 4)
          if (src.length >= line) md += `\nSource (${file}, lignes ${from}-${to}) :\n\n\`\`\`latex\n` +
            src.slice(from - 1, to).map((l, i) => `${String(from + i).padStart(4)}${from + i === line ? ' ▶ ' : '   '}${l}`).join('\n') + '\n```\n'
        } catch {}
      }
    }
    return md
  }
  async function sendErrors(entries) {
    const items = entries.map(logEntryData)
    if (!items.length) return
    const md = await errorsMarkdown(items)
    const ref = await postContext(md, 'erreur')
    await ask(ref, md, items.length > 1
      ? `Corrige ces ${items.length} problèmes de compilation dans Overleaf (pull/push), puis vérifie avec overleaf compile.`
      : `Corrige cette ${items[0].level} de compilation dans Overleaf (pull/push), puis vérifie avec overleaf compile.`, true)
  }
  const problemEntries = () => [...document.querySelectorAll('.log-entry')].filter(e => e.querySelector('.log-entry-header-text-error, .log-entry-header-text-warning'))
  function decorateLogs() {
    const entries = problemEntries()
    for (const entry of entries) {
      if (entry.querySelector('.tg-log-claude')) continue
      let actions = entry.querySelector('.log-entry-header-actions')
      if (!actions) {
        actions = document.createElement('div'); actions.className = 'log-entry-header-actions'
        entry.querySelector('.log-entry-header-card')?.appendChild(actions)
      }
      const b = document.createElement('button')
      b.type = 'button'; b.className = 'tg-log-claude'; b.textContent = '✦ Claude'; b.title = 'Demander à Claude de corriger'
      b.addEventListener('click', e => { e.stopPropagation(); sendErrors([entry]) })
      actions.appendChild(b)
    }
    const errs = entries.filter(e => e.querySelector('.log-entry-header-text-error'))
    let bar = document.getElementById('tg-log-all')
    if (errs.length < 2) { bar?.remove(); return }
    if (!bar || bar.nextElementSibling !== errs[0]) {
      bar?.remove()
      bar = document.createElement('div'); bar.id = 'tg-log-all'
      bar.innerHTML = '<span></span><button type="button" class="tg-log-claude">✦ Tout envoyer à Claude</button>'
      bar.querySelector('button').addEventListener('click', () => sendErrors(problemEntries().filter(e => e.querySelector('.log-entry-header-text-error'))))
      errs[0].parentElement?.insertBefore(bar, errs[0])
    }
    bar.querySelector('span').textContent = `${errs.length} erreurs de compilation`
  }
  let logTimer = 0
  new MutationObserver(muts => {
    if (muts.every(m => [...m.addedNodes, ...m.removedNodes].every(n => n.id === 'tg-log-all' || n.classList?.contains('tg-log-claude')))) return
    clearTimeout(logTimer); logTimer = setTimeout(decorateLogs, 250)
  }).observe(document.body, { childList: true, subtree: true })

  window.tgClaude = { sendSelection, sendFiles, sendEntity, sendErrors } // pour le diagnostic depuis la console
  document.body.append(panel, fab, selFab, selMenu)
  if (store.get(KEY_OPEN) === '1') setOpen(true)
})()
