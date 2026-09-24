// Importe un zip comme nouveau projet Overleaf, côté serveur (copié dans server-ce-scripts/scripts).
// node import-zip.mjs --email=… --zip=/tmp/x.zip --name="Nom" [--compiler=xelatex] [--root=chemin/main.tex]
import minimist from 'minimist'
import { db, ObjectId } from '../../../app/src/infrastructure/mongodb.mjs'
import UserGetter from '../../../app/src/Features/User/UserGetter.mjs'
import ProjectUploadManager from '../../../app/src/Features/Uploads/ProjectUploadManager.mjs'
import ProjectOptionsHandler from '../../../app/src/Features/Project/ProjectOptionsHandler.mjs'
import ProjectRootDocManager from '../../../app/src/Features/Project/ProjectRootDocManager.mjs'

const args = minimist(process.argv.slice(2), { string: ['email', 'zip', 'name', 'compiler', 'root'] })

async function main() {
  const user = await UserGetter.promises.getUser({ email: args.email }, { _id: 1 })
  if (!user) throw new Error(`utilisateur ${args.email} introuvable`)
  const ownerId = user._id.toString()
  if (args.name) {
    const existing = await db.projects.findOne({ owner_ref: new ObjectId(ownerId), name: args.name }, { projection: { _id: 1 } })
    if (existing) { console.log(`DEJA ${existing._id} ${args.name}`); return }
  }
  const result = args.name
    ? await ProjectUploadManager.promises.createProjectFromZipArchiveWithName(ownerId, args.name, args.zip)
    : await ProjectUploadManager.promises.createProjectFromZipArchive(ownerId, 'Projet importé', args.zip)
  const project = result.project ?? result
  if (args.compiler) await ProjectOptionsHandler.promises.setCompiler(project._id, args.compiler)
  if (args.root) await ProjectRootDocManager.promises.setRootDocFromName(project._id, args.root)
  console.log(`IMPORTE ${project._id} ${project.name}`)
}

main().then(() => process.exit(0)).catch(err => {
  console.error(`ERREUR ${err.message}`)
  // la suppression du projet partiel est lancée sans attente par Overleaf : lui laisser le temps d'aboutir
  setTimeout(() => process.exit(1), 5000)
})
