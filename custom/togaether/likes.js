/* Likes de projets — Overleaf local (toGæther).
 * Injecté par nginx sur toutes les pages HTML (voir custom/overleaf.conf).
 * Un like = appartenance à l'étiquette Overleaf « ❤ Likés » : stocké côté serveur,
 * visible aussi dans le filtre « Tags » de la barre latérale. */
(() => {
  'use strict'
  if (!/^\/project\/?(tags\/.*)?$/.test(location.pathname)) return

  const TAG_NAME = '❤ Likés'
  const TAG_COLOR = '#e5484d'
  const ID_RE = /^\/project\/([0-9a-f]{24})\/?$/
  const csrf = document.querySelector('meta[name="ol-csrfToken"]')?.content || ''
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Csrf-Token': csrf }

  let tag = null
  let projects = new Map() // id -> { name, lastUpdated }
  const liked = new Set()

  const api = (method, url, body) =>
    fetch(url, { method, headers, credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined })

  async function load() {
    const tags = await (await api('GET', '/tag')).json()
    tag = tags.find(t => t.name === TAG_NAME) || null
    liked.clear()
    ;(tag?.project_ids || []).forEach(id => liked.add(id))
    const res = await api('POST', '/api/project', { filters: {}, page: { size: 1000 }, sort: { by: 'lastUpdated', order: 'desc' } })
    if (res.ok) {
      const data = await res.json()
      projects = new Map((data.projects || []).map(p => [p.id, p]))
    }
  }

  async function ensureTag() {
    if (tag) return tag
    tag = await (await api('POST', '/tag', { name: TAG_NAME, color: TAG_COLOR })).json()
    return tag
  }

  async function toggle(id) {
    await ensureTag()
    const on = !liked.has(id)
    const res = await api(on ? 'POST' : 'DELETE', `/tag/${tag._id}/project/${id}`)
    if (!res.ok) return
    on ? liked.add(id) : liked.delete(id)
    render()
  }

  // ---- Bouton cœur sur chaque ligne ------------------------------------
  function heart(id, small) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'tg-like' + (small ? ' tg-like-sm' : '')
    b.dataset.projectId = id
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggle(id) })
    paint(b)
    return b
  }
  function paint(b) {
    const on = liked.has(b.dataset.projectId)
    const glyph = on ? '♥' : '♡'
    if (b.textContent === glyph) return // n'écrire que ce qui change : sinon l'observateur se relance à l'infini
    b.textContent = glyph
    b.classList.toggle('on', on)
    b.title = on ? 'Retirer des likés' : 'Liker ce projet'
    b.setAttribute('aria-pressed', String(on))
  }

  function decorateRows() {
    document.querySelectorAll('table a[href^="/project/"]').forEach(a => {
      const m = ID_RE.exec(a.getAttribute('href') || '')
      if (!m || a.closest('#tg-liked')) return
      const cell = a.closest('td')
      if (!cell || cell.querySelector('.tg-like')) return
      cell.style.whiteSpace = 'nowrap'
      cell.insertBefore(heart(m[1]), cell.firstChild)
    })
    document.querySelectorAll('.tg-like').forEach(paint)
  }

  // ---- Tableau des likés au-dessus de la liste -------------------------
  function panel() {
    let el = document.getElementById('tg-liked')
    if (el) return el
    const table = document.querySelector('table')
    if (!table) return null
    const anchor = table.closest('.project-list-table, .card, .project-list-main-react, [class*="project-list"]') || table
    el = document.createElement('section')
    el.id = 'tg-liked'
    anchor.parentNode.insertBefore(el, anchor)
    return el
  }

  function ago(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  let lastPanelKey = ''
  function renderPanel() {
    const el = panel()
    if (!el) return
    const ids = [...liked].filter(id => projects.has(id))
    const key = ids.join(',')
    if (key === lastPanelKey && el.childElementCount) return
    lastPanelKey = key
    ids.sort((a, b) => String(projects.get(b).lastUpdated).localeCompare(String(projects.get(a).lastUpdated)))
    el.innerHTML = ''
    const h = document.createElement('h2')
    h.textContent = `Projets likés (${ids.length})`
    el.appendChild(h)
    if (!ids.length) {
      const p = document.createElement('p')
      p.className = 'tg-empty'
      p.textContent = 'Aucun projet liké. Cliquez sur ♡ devant un titre pour l’épingler ici.'
      el.appendChild(p)
      return
    }
    const t = document.createElement('table')
    t.innerHTML = '<thead><tr><th>Titre</th><th>Dernière modification</th><th></th></tr></thead>'
    const tb = document.createElement('tbody')
    ids.forEach(id => {
      const p = projects.get(id)
      const tr = document.createElement('tr')
      const td1 = document.createElement('td')
      td1.appendChild(heart(id, true))
      const a = document.createElement('a')
      a.href = `/project/${id}`
      a.textContent = p.name
      td1.appendChild(a)
      const td2 = document.createElement('td')
      td2.textContent = ago(p.lastUpdated)
      const td3 = document.createElement('td')
      const open = document.createElement('a')
      open.href = `/project/${id}`
      open.className = 'tg-open'
      open.textContent = 'Ouvrir'
      td3.appendChild(open)
      tr.append(td1, td2, td3)
      tb.appendChild(tr)
    })
    t.appendChild(tb)
    el.appendChild(t)
  }

  function render() { decorateRows(); renderPanel() }

  // ---- Styles ------------------------------------------------------------
  const css = document.createElement('style')
  css.textContent = `
    .tg-like{background:none;border:0;cursor:pointer;font-size:16px;line-height:1;padding:0 8px 0 0;color:#8b95a7;vertical-align:middle}
    .tg-like:hover{color:${TAG_COLOR}} .tg-like.on{color:${TAG_COLOR}} .tg-like-sm{font-size:14px}
    #tg-liked{margin:0 0 18px;padding:16px 18px;border-radius:1rem;background:oklch(0.995 0.001 280);border:1px solid oklch(0.88 0.01 280);box-shadow:0 1px 2px rgb(0 0 0/.04),0 12px 32px -20px rgb(20 10 40/.18);color:oklch(0.15 0.01 280)}
    #tg-liked h2{font-size:.72rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:oklch(0.692 0.19 46.6);margin:0 0 10px}
    #tg-liked table{width:100%;border-collapse:collapse}
    #tg-liked th{font-size:.68rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;text-align:left;padding:4px 6px;color:oklch(0.5 0.02 280)}
    #tg-liked td{padding:8px 6px;border-top:1px solid oklch(0.94 0.01 280)} #tg-liked td a{color:oklch(0.15 0.01 280);font-weight:600;text-decoration:none} #tg-liked td a:hover{color:oklch(0.692 0.19 46.6)}
    #tg-liked td:last-child{text-align:right} #tg-liked .tg-open{display:inline-block;padding:3px 12px;border-radius:999px;border:1px solid oklch(0.88 0.01 280);font-size:.8rem;font-weight:600} #tg-liked .tg-open:hover{border-color:oklch(0.692 0.19 46.6)} #tg-liked td:nth-child(2){color:oklch(0.5 0.02 280)}
    #tg-liked .tg-empty{margin:0;opacity:.7;font-size:13px}`
  document.head.appendChild(css)

  // React redessine la liste (tri, recherche, pagination) : on repasse à chaque mutation.
  let pending = false
  const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; render() }) } }
  load().then(() => {
    render()
    new MutationObserver(muts => {
      const ours = n => n.nodeType === 1 && (n.closest('#tg-liked') || n.classList.contains('tg-like'))
      if (muts.every(m => ours(m.target) || [...m.addedNodes].every(ours))) return
      schedule()
    }).observe(document.body, { childList: true, subtree: true })
  })
})()
