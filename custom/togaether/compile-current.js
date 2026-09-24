/* Compiler le document OUVERT plutôt que le document principal du projet.
 * Overleaf compile toujours le « Main document » ; un projet qui regroupe plusieurs
 * documents (rapport, annexes, livrables…) recompilait donc toujours le même.
 * Règle, à chaque compilation (bouton ou Cmd/Ctrl+S) :
 *   1. le document ouvert porte « % !TEX root = chemin » → on compile cette racine ;
 *   2. sinon il contient \documentclass → on le compile lui-même ;
 *   3. sinon (fichier inclus sans racine déclarée) → document principal, comme avant.
 * Le moteur suit « % !TEX program = xelatex|lualatex|pdflatex|latex » de la racine.
 * Une pastille à côté de « Recompile » montre la cible et bascule le mode (mémorisé). */
(() => {
  'use strict'
  const m = location.pathname.match(/^\/project\/([0-9a-f]{24})\/?$/)
  if (!m) return
  const PROJECT_ID = m[1]
  // Toujours le document ouvert (demande du 24/09) : l'ancien mode « principal » mémorisé est effacé.
  try { localStorage.removeItem('tg-compile-mode-' + PROJECT_ID) } catch {}
  const store = () => window.overleaf?.unstable?.store
  const get = k => { try { return store()?.get(k) } catch { return undefined } }

  // Arborescence complète (dossiers repliés compris) depuis le contexte React de l'arborescence.
  function tree() {
    const el = document.querySelector('.file-tree [data-file-id], .file-tree')
    if (!el) return null
    const key = Object.keys(el).find(k => k.startsWith('__reactFiber$'))
    let f = el[key], data = null
    for (let i = 0; f && i < 600; i++, f = f.return) {
      const v = f.memoizedProps?.value
      if (v && typeof v === 'object' && v.fileTreeData) { data = v.fileTreeData; break }
    }
    if (!data) return null
    const byId = new Map(), byPath = new Map(), all = new Map() // all : chemin → { id, type } (docs, fichiers, dossiers)
    const rootFolder = Array.isArray(data) ? data[0] : data
    const walk = (folder, prefix) => {
      for (const d of folder.docs || []) { byId.set(d._id, prefix + d.name); byPath.set(prefix + d.name, d._id); all.set(prefix + d.name, { id: d._id, type: 'doc' }) }
      for (const f of folder.fileRefs || []) all.set(prefix + f.name, { id: f._id, type: 'file' })
      for (const sub of folder.folders || []) { all.set(prefix + sub.name, { id: sub._id, type: 'folder' }); walk(sub, prefix + sub.name + '/') }
    }
    walk(rootFolder, '')
    all.set('', { id: rootFolder._id, type: 'folder' })
    return { byId, byPath, all }
  }

  // Partagé avec claude.js et figure-drop.js (même page) : arborescence et document compilé.
  window.tgOverleaf = {
    projectId: PROJECT_ID,
    docPath: id => tree()?.byId.get(id) || null,
    docId: path => tree()?.byPath.get(path) || null,
    entity: path => tree()?.all.get(path) || null,
    compileRoot: () => target(),
  }

  const norm = (base, rel) => {
    const parts = (rel.startsWith('/') ? [] : base.split('/').slice(0, -1))
    for (const seg of rel.replace(/^\/+/, '').split('/')) {
      if (seg === '..') parts.pop(); else if (seg && seg !== '.') parts.push(seg)
    }
    return parts.join('/')
  }
  const magic = (text, name) => {
    const r = new RegExp('^\\s*%\\s*!\\s*TEX\\s+' + name + '\\s*=\\s*(.+?)\\s*$', 'im')
    return r.exec(text.split('\n').slice(0, 12).join('\n'))?.[1]
  }
  const ENGINES = { xelatex: 'xelatex', lualatex: 'lualatex', pdflatex: 'pdflatex', latex: 'latex' }

  async function docText(id) {
    if (id === get('editor.open_doc_id')) return get('editor.view')?.state?.doc?.toString() || ''
    try { const r = await fetch(`/Project/${PROJECT_ID}/doc/${id}/download`, { credentials: 'same-origin' }); return r.ok ? await r.text() : '' } catch { return '' }
  }

  /** Repli sans « % !TEX root » : un document autonome des dossiers parents (3 niveaux)
   *  qui inclut ce fichier par \input / \include / \subfile. Résultat mis en cache. */
  const includerCache = new Map()
  async function includer(t, openPath) {
    if (includerCache.get(openPath)) return includerCache.get(openPath)
    const dir = openPath.split('/').slice(0, -1)
    const dirs = [0, 1, 2, 3].map(n => dir.slice(0, Math.max(0, dir.length - n)).join('/')).filter((d, i, a) => a.indexOf(d) === i)
    const cands = [...t.byPath.keys()].filter(p => p.endsWith('.tex') && p !== openPath && dirs.includes(p.split('/').slice(0, -1).join('/')))
    let found = null
    for (const cand of cands.slice(0, 40)) {
      const txt = await docText(t.byPath.get(cand))
      if (!/\\documentclass\b/.test(txt)) continue
      const re = /\\(?:input|include|subfile)\s*\{([^}]+)\}/g
      let mm
      while ((mm = re.exec(txt))) {
        const inc = norm(cand, mm[1].trim())
        if (inc === openPath || inc + '.tex' === openPath) { found = t.byPath.get(cand); break }
      }
      if (found) break
    }
    if (found) includerCache.set(openPath, found) // un échec n'est jamais retenu : on retente à la compilation suivante
    return found
  }

  /** Renvoie { id, path, engine } ou null (= laisser le document principal). */
  async function target() {
    const openId = get('editor.open_doc_id')
    const t = tree()
    if (!openId || !t) return null
    const openPath = t.byId.get(openId)
    const text = get('editor.view')?.state?.doc?.toString() || ''
    let id = null
    const root = magic(text, 'root')
    if (root && openPath) id = t.byPath.get(norm(openPath, root)) || null
    if (!id && /\\documentclass\b/.test(text)) id = openId
    if (!id && openPath) id = await includer(t, openPath)
    if (!id) return null
    const rootText = id === openId ? text : await docText(id)
    const engine = ENGINES[(magic(rootText, 'program') || '').toLowerCase()]
    return { id, path: t.byId.get(id), engine }
  }

  let lastEngine = null
  // Interception de la requête de compilation (le reste du corps est conservé tel quel).
  const origFetch = window.fetch.bind(window)
  window.fetch = async function (input, init) {
    try {
      const url = typeof input === 'string' ? input : input?.url || ''
      if ((init?.method || 'GET').toUpperCase() === 'POST' && url.includes(`/project/${PROJECT_ID}/compile`) && typeof init.body === 'string') {
        const tg = await target()
        if (tg) {
          const body = JSON.parse(init.body)
          body.rootDoc_id = tg.id
          // L'édition communautaire ignore « compiler » dans la requête : seul le réglage du projet compte.
          if (tg.engine && tg.engine !== lastEngine) {
            const csrf = document.querySelector('meta[name="ol-csrfToken"]')?.content || ''
            const r = await origFetch(`/project/${PROJECT_ID}/settings`, { method: 'POST', credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json', 'X-Csrf-Token': csrf }, body: JSON.stringify({ compiler: tg.engine }) })
            if (r.ok) lastEngine = tg.engine
          }
          if (tg.engine) body.compiler = tg.engine
          init = { ...init, body: JSON.stringify(body) }
          lastTarget = tg
          paint()
        }
      }
    } catch (e) { console.warn('[toGæther] compilation du document ouvert :', e) }
    return origFetch(input, init)
  }

  // Pastille « Compile : fichier » à côté du bouton Recompile.
  let lastTarget = null, pill = null
  async function paint() {
    const group = document.querySelector('.compile-button-group')
    if (!group) return
    if (!pill || !pill.isConnected) {
      pill = document.createElement('button')
      pill.type = 'button'; pill.id = 'tg-compile-target'
      pill.disabled = true
      group.insertAdjacentElement('afterend', pill)
    }
    const tg = await target()
    const name = tg ? tg.path.split('/').pop() : 'document principal'
    pill.textContent = (tg ? '◎ ' : '⌂ ') + name + (tg?.engine ? ' · ' + tg.engine : '')
    pill.title = tg
      ? 'Recompile / Cmd+S compilent ' + tg.path + (tg.path.endsWith(get("editor.open_doc_name") || "§") ? ' (le document ouvert)' : ' (le document qui inclut le fichier ouvert)')
      : 'Aucun document compilable trouvé pour le fichier ouvert : le document principal du projet est compilé.'
    pill.classList.toggle('main', !tg)
  }
  const css = document.createElement('style')
  css.textContent = `#tg-compile-target{margin-left:8px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
    height:28px;padding:0 12px;border-radius:999px;border:1px solid oklch(0.88 0.01 280);background:transparent;
    font:600 .78rem Outfit,system-ui,sans-serif;color:oklch(0.35 0.02 280);cursor:default}
    #tg-compile-target:hover{border-color:oklch(0.692 0.19 46.6);color:oklch(0.58 0.19 42)}
    #tg-compile-target.main{color:oklch(0.5 0.02 280);border-style:dashed}`
  document.head.appendChild(css)

  // Rafraîchir la pastille quand le document ouvert change.
  // Le texte de l'éditeur arrive après l'identifiant du document : on repeint aussi une fois chargé.
  let lastOpen = null, lastHead = null
  setInterval(() => {
    const id = get('editor.open_doc_id')
    const head = (get('editor.view')?.state?.doc?.toString() || '').slice(0, 400)
    if (id !== lastOpen || head !== lastHead || !pill?.isConnected) { lastOpen = id; lastHead = head; paint() }
  }, 800)
})()
