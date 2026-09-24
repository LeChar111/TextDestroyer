// Ajoute (ou remplace) un fichier binaire dans un dossier d'un projet Overleaf, côté serveur.
// node add-file.mjs --email=… --project=<id> --folder='chemin/du/dossier' --name=fichier.ttf --file=/tmp/fichier.ttf
import minimist from 'minimist'
import UserGetter from '../../../app/src/Features/User/UserGetter.mjs'
import ProjectLocator from '../../../app/src/Features/Project/ProjectLocator.mjs'
import EditorController from '../../../app/src/Features/Editor/EditorController.mjs'
const a = minimist(process.argv.slice(2), { string: ['email', 'project', 'folder', 'name', 'file'] })
const user = await UserGetter.promises.getUser({ email: a.email }, { _id: 1 })
if (!user) { console.error('ERREUR utilisateur introuvable'); process.exit(1) }
const found = await ProjectLocator.promises.findElementByPath({ project_id: a.project, path: a.folder })
const folder = found.element || found
await EditorController.promises.upsertFile(a.project, folder._id, a.name, a.file, null, 'upload', user._id.toString())
console.log(`AJOUTE ${a.folder}/${a.name}`)
process.exit(0)
