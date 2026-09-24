/* Figure express : déposer ou coller une image dans l'éditeur l'importe et insère la figure, sans la
 * fenêtre « Insérer une figure » d'Overleaf (toujours accessible : maintenir ⌥ Option en déposant).
 *  - l'image va dans <dossier du document ouvert>/figures/, sous un nom propre et unique ;
 *  - \includegraphics est écrit relativement au document COMPILÉ (celui de compile-current.js),
 *    puisque LaTeX résout les chemins depuis la racine, pas depuis le fichier inclus ;
 *  - conversions : SVG → PDF et HEIC → JPEG (conteneur claude-terminal), WebP / GIF / BMP → PNG ou JPEG,
 *    photos de plus de 2400 px ou 1,5 Mo réduites (xdvipdfmx recompresse chaque image à chaque compilation) ;
 *  - plusieurs images d'un coup : une seule figure, côte à côte ; le curseur finit dans \caption{}. */
(() => {
  'use strict'
  const m = location.pathname.match(/^\/project\/([0-9a-f]{24})\/?$/)
  if (!m) return
  const PROJECT_ID = m[1]
  const MAX_SIDE = 2400, MAX_BYTES = 1.5e6

  const css = document.createElement('style')
  css.textContent = `#tg-fig-toast{position:fixed;left:50%;bottom:28px;z-index:2147483100;transform:translateX(-50%);padding:9px 16px;border-radius:999px;
    background:oklch(0.2 0.01 280);color:#fff;font:600 13px Outfit,system-ui,sans-serif;opacity:0;transition:opacity .2s;pointer-events:none;max-width:80vw}
    #tg-fig-toast.on{opacity:.94}`
  document.head.appendChild(css)
  const toastEl = document.createElement('div'); toastEl.id = 'tg-fig-toast'; document.body.appendChild(toastEl)
  let toastT = 0
  function toast(msg, ms = 3200) { toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastT); if (ms) toastT = setTimeout(() => toastEl.classList.remove('on'), ms) }

  const store = () => window.overleaf?.unstable?.store
  const get = k => { try { return store()?.get(k) } catch { return undefined } }
  const csrf = () => document.querySelector('meta[name="ol-csrfToken"]')?.content || ''
  const ext = name => (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || ''
  const kindOf = f => {
    const e = ext(f.name), t = (f.type || '').toLowerCase()
    if (t === 'image/svg+xml' || e === 'svg') return 'svg'
    if (/image\/hei[cf]/.test(t) || e === 'heic' || e === 'heif') return 'heic'
    if (t === 'application/pdf' || e === 'pdf') return 'pdf'
    if (t === 'image/png' || e === 'png') return 'png'
    if (t === 'image/jpeg' || e === 'jpg' || e === 'jpeg') return 'jpeg'
    if (/^image\/(webp|gif|bmp|tiff)$/.test(t) || ['webp', 'gif', 'bmp', 'tif', 'tiff'].includes(e)) return 'raster'
    return null
  }
  const accepted = files => [...files].filter(f => kindOf(f))

  function slug(name) {
    const base = name.replace(/\.[^.]*$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 48)
    // captures d'écran et collages : un nom daté plutôt que « image » ou « screenshot-2026-… »
    if (!base || /^(image|img|screenshot|capture|screen-shot|clipboard|blob|collage)(-|$)/.test(base)) {
      const d = new Date(), p = n => String(n).padStart(2, '0')
      return `fig-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
    }
    return base
  }

  // ── Conversion / réduction ───────────────────────────────────────────────────────────────────────
  async function convertOnServer(file, to) {
    const r = await fetch(`/togaether/terminal-ctx/convert?to=${to}&name=${encodeURIComponent(file.name || 'image')}`,
      { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Csrf-Token': csrf() }, body: file })
    if (!r.ok) throw new Error(r.status === 404 || r.status === 501 ? 'conversion indisponible (reconstruire claude-terminal)' : 'conversion refusée (' + r.status + ')')
    return r.blob()
  }
  function hasAlpha(bitmap) {
    const c = document.createElement('canvas'); c.width = 48; c.height = 48
    const g = c.getContext('2d'); g.drawImage(bitmap, 0, 0, 48, 48)
    const d = g.getImageData(0, 0, 48, 48).data
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true
    return false
  }
  async function rasterize(source, forceType) {
    const bitmap = await createImageBitmap(source)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bitmap.width * scale); c.height = Math.round(bitmap.height * scale)
    c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height)
    const type = forceType || (hasAlpha(bitmap) ? 'image/png' : 'image/jpeg')
    const blob = await new Promise(res => c.toBlob(res, type, 0.88))
    return { blob, ext: type === 'image/png' ? 'png' : 'jpg', note: scale < 1 ? `réduite à ${c.width}×${c.height}` : '' }
  }
  /** Renvoie { blob, ext, note } prêt à importer. */
  async function prepare(file) {
    const kind = kindOf(file)
    if (kind === 'pdf') return { blob: file, ext: 'pdf', note: '' }
    if (kind === 'svg') {
      try { return { blob: await convertOnServer(file, 'pdf'), ext: 'pdf', note: 'SVG → PDF' } }
      catch { const r = await rasterize(await svgBitmapSource(file), 'image/png'); return { ...r, note: 'SVG → PNG (conversion PDF indisponible)' } }
    }
    if (kind === 'heic') return { blob: await convertOnServer(file, 'jpg'), ext: 'jpg', note: 'HEIC → JPEG' }
    if (kind === 'raster') { const r = await rasterize(file); return { ...r, note: [ext(file.name).toUpperCase() + ' → ' + r.ext.toUpperCase(), r.note].filter(Boolean).join(', ') } }
    // PNG / JPEG : tels quels s'ils sont raisonnables, sinon réduits (PNG gardé s'il a de la transparence)
    const bitmap = await createImageBitmap(file)
    if (file.size <= MAX_BYTES && Math.max(bitmap.width, bitmap.height) <= MAX_SIDE) return { blob: file, ext: kind === 'png' ? 'png' : 'jpg', note: '' }
    const r = await rasterize(file, kind === 'jpeg' ? 'image/jpeg' : undefined)
    return { ...r, note: r.note || `recompressée (${(file.size / 1e6).toFixed(1)} Mo)` }
  }
  async function svgBitmapSource(file) {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image(); img.src = url; await img.decode()
      const c = document.createElement('canvas'); const k = 3
      c.width = (img.naturalWidth || 800) * k; c.height = (img.naturalHeight || 600) * k
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      return await new Promise(res => c.toBlob(res, 'image/png'))
    } finally { URL.revokeObjectURL(url) }
  }

  // ── Import dans le projet ────────────────────────────────────────────────────────────────────────
  const dirOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
  const join = (a, b) => (a ? a + '/' : '') + b
  function relative(fromDir, to) {
    const a = fromDir ? fromDir.split('/') : [], b = to.split('/')
    let i = 0; while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++
    return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/')
  }
  function uniqueName(folder, base, extension, taken) {
    for (let n = 1; n < 500; n++) {
      const name = `${base}${n > 1 ? '-' + n : ''}.${extension}`
      const p = join(folder, name)
      if (!taken.has(p) && !window.tgOverleaf?.entity?.(p)) { taken.add(p); return name }
    }
    return `${base}-${Date.now()}.${extension}`
  }
  async function upload(blob, name, docFolderId) {
    const form = new FormData()
    form.append('name', name)
    form.append('relativePath', 'figures/' + name)
    form.append('type', blob.type || 'application/octet-stream')
    form.append('qqfile', blob, name)
    const r = await fetch(`/project/${PROJECT_ID}/upload?folder_id=${docFolderId}`, { method: 'POST', credentials: 'same-origin', headers: { 'X-Csrf-Token': csrf() }, body: form })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j.success === false) throw new Error(j.error === 'duplicate_file_name' ? 'nom déjà pris' : j.error || 'HTTP ' + r.status)
  }

  function figureCode(paths, labelBase) {
    const n = paths.length
    const width = n === 1 ? '0.8' : n === 2 ? '0.48' : n === 3 ? '0.31' : '0.23'
    // au-delà de 4 images : rangées de 4
    const lines = paths.map((p, i) => `  \\includegraphics[width=${width}\\linewidth]{${p}}` + (i < n - 1 ? ((i + 1) % 4 ? '\\hfill' : '\\\\[1ex]') : ''))
    const before = `\\begin{figure}[htbp]\n  \\centering\n${lines.join('\n')}\n  \\caption{`
    return { before, after: `}\n  \\label{fig:${labelBase}}\n\\end{figure}\n` }
  }

  let busy = false
  async function handle(files, pos) {
    const view = get('editor.view'), ov = window.tgOverleaf
    const openId = get('editor.open_doc_id'), openPath = ov?.docPath?.(openId)
    if (!view || !openPath) return toast('Figure express : document ouvert introuvable — utilisez ⌥ en déposant pour la fenêtre d’Overleaf')
    const openDir = dirOf(openPath)
    const folder = ov.entity(openDir)
    if (!folder || folder.type !== 'folder') return toast('Figure express : dossier du document introuvable')
    if (busy) return toast('Import en cours…')
    busy = true
    try {
      toast(files.length > 1 ? `Import de ${files.length} images…` : 'Import de l’image…', 0)
      let root = null; try { root = await ov.compileRoot() } catch {}
      const rootDir = dirOf(root?.path || openPath)
      const taken = new Set(), paths = [], notes = []
      let labelBase = ''
      for (const f of files) {
        const prepared = await prepare(f)
        const base = slug(f.name || 'image')
        const name = uniqueName(join(openDir, 'figures'), base, prepared.ext, taken)
        await upload(prepared.blob, name, folder.id)
        paths.push(relative(rootDir, join(openDir, 'figures/' + name)))
        if (!labelBase) labelBase = name.replace(/\.[^.]+$/, '')
        if (prepared.note) notes.push(prepared.note)
      }
      // Insertion sur une ligne à part : fin de la ligne visée si elle contient du texte, sinon à sa place.
      const state = view.state
      const line = state.doc.lineAt(Math.min(pos, state.doc.length))
      const blank = !line.text.trim()
      const at = blank ? line.from : line.to
      const { before, after } = figureCode(paths, labelBase)
      const insert = (blank ? '' : '\n') + before + after.replace(/\n$/, '')
      const cursor = at + (blank ? 0 : 1) + before.length
      view.dispatch({ changes: { from: at, to: blank ? line.to : at, insert }, selection: { anchor: cursor }, scrollIntoView: true })
      view.focus()
      toast(`${files.length > 1 ? files.length + ' images importées' : 'Image importée'} dans ${join(openDir, 'figures')}/${notes.length ? ' · ' + [...new Set(notes)].join(' · ') : ''} — légende à saisir`)
    } catch (e) {
      console.warn('[toGæther] figure express :', e)
      toast('Figure express : ' + e.message + ' (⌥ en déposant : fenêtre d’Overleaf)', 6000)
    } finally { busy = false }
  }

  const inEditor = t => t instanceof Element && t.closest('.cm-editor')
  window.addEventListener('drop', e => {
    if (e.altKey || !inEditor(e.target) || !e.dataTransfer?.files?.length) return
    const files = accepted(e.dataTransfer.files)
    if (!files.length) return
    e.preventDefault(); e.stopImmediatePropagation()
    const view = get('editor.view')
    const pos = view?.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view?.state.selection.main.head ?? 0
    handle(files, pos)
  }, true)
  window.addEventListener('paste', e => {
    if (!inEditor(e.target) || !e.clipboardData?.files?.length) return
    if (e.clipboardData.types.includes('text/plain')) return // du texte accompagné d'une image : collage normal
    const files = accepted(e.clipboardData.files)
    if (!files.length) return
    e.preventDefault(); e.stopImmediatePropagation()
    handle(files, get('editor.view')?.state.selection.main.head ?? 0)
  }, true)
})()
