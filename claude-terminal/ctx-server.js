// Reçoit le contexte (sélection de l'éditeur) depuis le navigateur, via le relais nginx authentifié
// d'Overleaf (/togaether/terminal-ctx/), et l'écrit dans ~/overleaf/selection.md : le panneau ne colle
// ensuite qu'une ligne « @~/overleaf/selection.md », que Claude Code lit comme une pièce jointe.
// Reçoit aussi les fichiers déposés / collés dans le panneau (POST /upload?name=…, corps binaire) : images dans
// ~/overleaf/images/, le reste dans ~/overleaf/files/ ; le panneau colle leur chemin dans l'invite.
'use strict'
const http = require('http'), fs = require('fs'), path = require('path')
const DIR = path.join(process.env.HOME || '/home/node', 'overleaf')
const IMG = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }
function upload(req, res) {
  const img = IMG[(req.headers['content-type'] || '').split(';')[0].trim()]
  const name = decodeURIComponent((req.url.match(/[?&]name=([^&]*)/) || [])[1] || '')
  const ext = img || ((name.match(/\.([A-Za-z0-9]{1,10})$/) || [])[1] || 'bin').toLowerCase()
  const chunks = []; let size = 0
  req.on('data', c => { size += c.length; if (size > 20e6) { res.writeHead(413); res.end(); req.destroy() } else chunks.push(c) })
  req.on('end', () => {
    if (res.writableEnded) return
    const dir = path.join(DIR, img ? 'images' : 'files'); fs.mkdirSync(dir, { recursive: true })
    const base = name
      .replace(/\.[^.]*$/, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'fichier'
    const file = path.join(dir, new Date().toISOString().replace(/[:.]/g, '-') + '-' + base + '.' + ext)
    fs.writeFileSync(file, Buffer.concat(chunks))
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ file }))
  })
}
// Conversion pour la figure express de l'éditeur (POST /convert?to=pdf|jpg) : SVG → PDF (rsvg-convert),
// HEIC → JPEG (heif-convert). Le résultat repart dans la réponse ; rien n'est gardé.
const { execFile } = require('child_process'), os = require('os')
function convert(req, res) {
  const to = (req.url.match(/[?&]to=(pdf|jpg)\b/) || [])[1]
  if (!to) { res.writeHead(400); return res.end('to=pdf|jpg') }
  const chunks = []; let size = 0
  req.on('data', c => { size += c.length; if (size > 40e6) { res.writeHead(413); res.end(); req.destroy() } else chunks.push(c) })
  req.on('end', () => {
    if (res.writableEnded) return
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-conv-'))
    const input = path.join(work, to === 'pdf' ? 'in.svg' : 'in.heic'), output = path.join(work, 'out.' + to)
    fs.writeFileSync(input, Buffer.concat(chunks))
    const [cmd, args] = to === 'pdf' ? ['rsvg-convert', ['-f', 'pdf', '-o', output, input]] : ['heif-convert', ['-q', '90', input, output]]
    execFile(cmd, args, { timeout: 60000 }, err => {
      try {
        if (err) { res.writeHead(err.code === 'ENOENT' ? 501 : 422); return res.end(String(err.message)) }
        res.writeHead(200, { 'Content-Type': to === 'pdf' ? 'application/pdf' : 'image/jpeg' }); res.end(fs.readFileSync(output))
      } finally { fs.rmSync(work, { recursive: true, force: true }) }
    })
  })
}
http.createServer((req, res) => {
  if (req.method === 'POST' && /\/convert(\?|$)/.test(req.url)) return convert(req, res)
  if (req.method === 'POST' && /\/(upload|img)(\?|$)/.test(req.url)) return upload(req, res)
  if (req.method !== 'POST' || !/\/ctx$/.test(req.url)) { res.writeHead(404); return res.end() }
  let body = ''
  req.on('data', c => { body += c; if (body.length > 2e6) req.destroy() })
  req.on('end', () => {
    try {
      const { markdown, kind } = JSON.parse(body)
      if (typeof markdown !== 'string' || !markdown.trim()) throw new Error('vide')
      const error = kind === 'erreur' // erreurs de compilation : dossier à part, selection.md intact
      fs.mkdirSync(path.join(DIR, error ? 'errors' : 'selections'), { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const file = path.join(DIR, error ? 'errors' : 'selections', stamp + '.md')
      fs.writeFileSync(file, markdown)
      if (!error) fs.writeFileSync(path.join(DIR, 'selection.md'), markdown)
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ file }))
    } catch (e) { res.writeHead(400); res.end(String(e.message)) }
  })
}).listen(7682, '0.0.0.0')
