/* Mise à jour externe (overleaf push depuis le terminal Claude, API…) : la fenêtre bloquante
 * « Document Updated Externally » d'Overleaf est remplacée par un petit toast en bas de l'écran.
 *  - le toast décompte puis recompile le document modifié (sa racine) ; la croix annule la recompilation ;
 *  - si l'utilisateur écrivait dans la MÊME section que le passage modifié, le toast s'ouvre en alerte
 *    avec le texte avant / après ; ailleurs (autre section, autre document), pas d'alerte ;
 *  - le survol met le décompte en pause ; plusieurs mises à jour rapprochées se regroupent.
 * La modification est déjà appliquée par Overleaf (OT) quand le message arrive : elle ne peut pas être
 * différée, seule la recompilation l'est. Chargé AVANT les autres scripts : il enveloppe WebSocket pour lire
 * les messages otUpdateApplied (opération exacte) avant que la connexion socket.io ne soit ouverte. */
(() => {
  'use strict'
  const m = location.pathname.match(/^\/project\/([0-9a-f]{24})\/?$/)
  if (!m) return
  const COUNTDOWN = 6, COUNTDOWN_ALERT = 12, EDIT_WINDOW = 20e3

  // ── Écoute des mises à jour externes sur la socket ─────────────────────────────────────────────
  const NativeWS = window.WebSocket
  function onFrame(ev) {
    const data = typeof ev.data === 'string' ? ev.data : ''
    if (!data.includes('otUpdateApplied')) return
    const mm = data.match(/^5:[^:]*:[^:]*:([\s\S]*)$/) // socket.io 0.9 : « 5:id:endpoint:{json} »
    if (!mm) return
    let msg; try { msg = JSON.parse(mm[1]) } catch { return }
    const up = msg?.args?.[0]
    if (msg.name !== 'otUpdateApplied' || !up?.op || up.meta?.type !== 'external' || up.meta.source === 'git-bridge') return
    // Laisser Overleaf appliquer l'opération dans l'éditeur avant de lire le texte obtenu.
    setTimeout(() => onExternal(up), 60)
  }
  function TgWebSocket(...args) {
    const ws = new NativeWS(...args)
    ws.addEventListener('message', onFrame)
    return ws
  }
  TgWebSocket.prototype = NativeWS.prototype
  Object.assign(TgWebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 })
  window.WebSocket = TgWebSocket

  // ── Suppression de la fenêtre bloquante d'Overleaf ─────────────────────────────────────────────
  const isExternalModal = el => /updated externally|mis à jour (de façon |de manière )?externe/i.test(el.querySelector('.modal-title')?.textContent || '')
  new MutationObserver(() => {
    for (const modal of document.querySelectorAll('.modal.show, .modal[role=dialog]')) {
      if (modal.dataset.tgSeen || !isExternalModal(modal)) continue
      modal.dataset.tgSeen = '1'
      modal.style.display = 'none'
      document.querySelectorAll('.modal-backdrop').forEach(b => { b.style.display = 'none' })
      // Fermeture par le bouton OK : l'état React de la fenêtre reste cohérent.
      setTimeout(() => modal.querySelector('.modal-footer .btn, .btn-close, [aria-label=Close]')?.click(), 0)
      if (!pending.size) show() // message socket manqué (polling) : toast simple
    }
  }).observe(document.body, { childList: true, subtree: true })

  // ── Suivi de la frappe : « en train de modifier » ──────────────────────────────────────────────
  let lastEdit = 0
  document.addEventListener('keydown', e => { if (e.target.closest?.('.cm-editor') && !e.metaKey && !e.ctrlKey) lastEdit = Date.now() }, true)
  document.addEventListener('input', e => { if (e.target.closest?.('.cm-editor')) lastEdit = Date.now() }, true)

  const get = k => { try { return window.overleaf?.unstable?.store?.get(k) } catch { return undefined } }
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

  /** Texte d'avant : on défait l'opération (composantes appliquées dans l'ordre) sur le texte d'après. */
  function undo(after, op) {
    let s = after
    for (let k = op.length - 1; k >= 0; k--) {
      const c = op[k]
      if (typeof c.i === 'string') s = s.slice(0, c.p) + s.slice(c.p + c.i.length)
      else if (typeof c.d === 'string') s = s.slice(0, c.p) + c.d + s.slice(c.p)
    }
    return s
  }
  /** Lignes modifiées : préfixe et suffixe communs retirés (1-indexé, dans le texte d'après). */
  function hunk(before, after) {
    const a = before.split('\n'), b = after.split('\n')
    let pre = 0
    while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++
    let suf = 0
    while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++
    return { from: pre + 1, to: Math.max(pre + 1, b.length - suf), old: a.slice(pre, a.length - suf), neu: b.slice(pre, b.length - suf) }
  }
  const HEADING = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\s*[[{]/
  /** Section qui contient la ligne n : bornée par les titres LaTeX, sinon ±20 lignes. */
  function section(lines, n) {
    let s = n, e = n
    while (s > 1 && !HEADING.test(lines[s - 1])) s--
    while (e < lines.length && !HEADING.test(lines[e])) e++
    const titled = HEADING.test(lines[s - 1]) || e < lines.length
    return titled ? { s, e } : { s: Math.max(1, n - 20), e: Math.min(lines.length, n + 20) }
  }

  // ── Regroupement et toast ──────────────────────────────────────────────────────────────────────
  const pending = new Map() // docId → { path, alert?: { from, to, old, neu } }
  function onExternal(up) {
    const ov = window.tgOverleaf
    const path = ov?.docPath?.(up.doc) || 'document'
    const entry = pending.get(up.doc) || { path }
    const view = get('editor.view')
    if (view?.state && get('editor.open_doc_id') === up.doc) {
      const after = view.state.doc.toString()
      const h = hunk(undo(after, up.op), after)
      const lines = after.split('\n')
      const cursor = view.state.doc.lineAt(view.state.selection.main.head).number
      const sec = section(lines, cursor)
      const editing = Date.now() - lastEdit < EDIT_WINDOW
      if (editing && h.from <= sec.e && h.to >= sec.s) entry.alert = h
      entry.lines = h.from === h.to ? `ligne ${h.from}` : `lignes ${h.from}-${h.to}`
    }
    pending.set(up.doc, entry)
    show()
  }

  const css = document.createElement('style')
  css.textContent = `
  #tg-ext{position:fixed;left:50%;bottom:22px;z-index:2147483050;width:min(540px,calc(100vw - 32px));transform:translate(-50%,24px);opacity:0;
    pointer-events:none;transition:transform .32s cubic-bezier(.2,.9,.25,1.15),opacity .2s ease;font-family:Outfit,system-ui,sans-serif}
  #tg-ext.on{transform:translate(-50%,0);opacity:1;pointer-events:auto}
  #tg-ext .c{position:relative;overflow:hidden;border-radius:16px;background:oklch(0.2 0.012 280);color:#fff;
    box-shadow:0 2px 6px rgb(20 10 40/.12),0 22px 50px -16px rgb(20 10 40/.55)}
  #tg-ext .r{display:flex;align-items:center;gap:12px;padding:11px 10px 11px 14px}
  #tg-ext .ic{flex:0 0 30px;height:30px;border-radius:50%;display:grid;place-items:center;background:oklch(0.692 0.19 46.6);font-size:14px;
    animation:tg-ext-pulse 1.6s ease-out infinite}
  #tg-ext.alert .ic{background:oklch(0.78 0.16 75);color:oklch(0.25 0.05 60)}
  @keyframes tg-ext-pulse{0%{box-shadow:0 0 0 0 oklch(0.692 0.19 46.6/.55)}100%{box-shadow:0 0 0 12px oklch(0.692 0.19 46.6/0)}}
  #tg-ext .tx{flex:1;min-width:0;line-height:1.25}
  #tg-ext .t1{font-weight:700;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #tg-ext .t2{font-size:.78rem;color:oklch(0.78 0.01 280);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #tg-ext button{all:unset;cursor:pointer;border-radius:999px;font-weight:600;font-size:.8rem;white-space:nowrap}
  #tg-ext .go{padding:6px 12px;background:rgb(255 255 255/.1)}
  #tg-ext .go:hover{background:rgb(255 255 255/.18)}
  #tg-ext .x{width:30px;height:30px;display:grid;place-items:center;font-size:15px;color:oklch(0.8 0.01 280)}
  #tg-ext .x:hover{background:rgb(255 255 255/.12);color:#fff}
  #tg-ext [hidden]{display:none!important}
  #tg-ext .n{font-variant-numeric:tabular-nums}
  #tg-ext .bar{position:absolute;left:0;bottom:0;height:3px;width:100%;transform-origin:left;background:oklch(0.692 0.19 46.6)}
  #tg-ext.alert .bar{background:oklch(0.78 0.16 75)}
  #tg-ext .diff{display:none;margin:0 12px 12px;max-height:210px;overflow:auto;border-radius:10px;background:oklch(0.14 0.01 280);
    font:12px/1.45 ui-monospace,"SF Mono",Menlo,monospace}
  #tg-ext.alert .diff{display:block}
  #tg-ext .diff div{padding:0 10px;white-space:pre-wrap;word-break:break-word}
  #tg-ext .diff .o{background:oklch(0.65 0.2 25/.18);color:oklch(0.85 0.08 25)}
  #tg-ext .diff .u{background:oklch(0.7 0.17 145/.16);color:oklch(0.88 0.1 145)}
  #tg-ext .diff .h{padding:6px 10px 4px;color:oklch(0.7 0.01 280);font-family:Outfit,system-ui,sans-serif;font-size:11px;letter-spacing:.04em}
  #tg-ext .see{padding:6px 10px;color:oklch(0.85 0.1 75)}
  #tg-ext .see:hover{background:rgb(255 255 255/.08)}`
  document.head.appendChild(css)

  const box = document.createElement('div')
  box.id = 'tg-ext'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite')
  box.innerHTML = `<div class="c"><div class="r"><span class="ic">✦</span><div class="tx"><div class="t1"></div><div class="t2"></div></div>
    <button type="button" class="see" hidden>Voir</button><button type="button" class="go">Recompiler</button>
    <button type="button" class="x" title="Fermer sans recompiler">✕</button></div><div class="diff"></div><div class="bar"></div></div>`
  document.body.appendChild(box)

  let where = '', left = 0, total = 0, timer = 0, paused = false, targetDoc = null, seeLine = 0
  function show() {
    const docs = [...pending.keys()], entries = [...pending.values()]
    const alertEntry = entries.find(e => e.alert)
    targetDoc = docs[docs.length - 1] || get('editor.open_doc_id') || null
    const t1 = box.querySelector('.t1'), diff = box.querySelector('.diff'), see = box.querySelector('.see')
    if (entries.length > 1) t1.textContent = `${entries.length} documents mis à jour par Claude`
    else if (entries.length) t1.textContent = `« ${entries[0].path.split('/').pop()} » mis à jour`
    else t1.textContent = 'Document mis à jour depuis l’extérieur'
    box.classList.toggle('alert', !!alertEntry)
    if (alertEntry) {
      const a = alertEntry.alert, cap = l => l.slice(0, 14).concat(l.length > 14 ? [`… (${l.length - 14} lignes de plus)`] : [])
      diff.innerHTML = '<div class="h">Vous écriviez dans cette section : passage remplacé</div>' +
        cap(a.old).map(l => `<div class="o">− ${esc(l)}</div>`).join('') + cap(a.neu).map(l => `<div class="u">+ ${esc(l)}</div>`).join('')
      seeLine = a.from
    }
    see.hidden = !alertEntry
    where = entries.length === 1 && entries[0].lines ? entries[0].lines + ' · ' : ''
    total = left = alertEntry ? COUNTDOWN_ALERT : COUNTDOWN
    box.classList.add('on')
    tick(true)
  }
  function tick(restart) {
    clearInterval(timer)
    const bar = box.querySelector('.bar')
    const paint = () => {
      box.querySelector('.t2').innerHTML = where + (paused ? 'recompilation en pause' : `recompilation dans <span class="n">${left}</span> s`)
      bar.style.transition = restart ? 'none' : 'transform 1s linear'
      bar.style.transform = `scaleX(${left / total})`
    }
    paint(); restart = false
    timer = setInterval(() => {
      if (paused) return
      left--
      paint()
      if (left <= 0) { clearInterval(timer); setTimeout(() => finish(true), 250) }
    }, 1000)
  }
  function finish(compile) {
    clearInterval(timer)
    box.classList.remove('on')
    const doc = targetDoc
    pending.clear(); paused = false
    if (!compile) return
    if (window.tgOverleaf?.compileDoc && doc) window.tgOverleaf.compileDoc(doc)
    else document.querySelector('.compile-button-group .compile-button, .compile-button-group .btn:not(.dropdown-toggle)')?.click()
  }
  box.addEventListener('mouseenter', () => { paused = true; box.querySelector('.t2').textContent = where + 'recompilation en pause' })
  box.addEventListener('mouseleave', () => { paused = false; if (box.classList.contains('on')) box.querySelector('.t2').innerHTML = where + `recompilation dans <span class="n">${left}</span> s` })
  box.querySelector('.x').addEventListener('click', () => finish(false))
  box.querySelector('.go').addEventListener('click', () => finish(true))
  box.querySelector('.see').addEventListener('click', () => {
    const view = get('editor.view')
    if (!view || !seeLine) return
    const line = view.state.doc.line(Math.min(seeLine, view.state.doc.lines))
    view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true })
    view.focus()
  })
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && box.classList.contains('on')) finish(false) })
  window.tgExternal = { onExternal, markEditing: () => { lastEdit = Date.now() } } // pour le diagnostic depuis la console
})()
