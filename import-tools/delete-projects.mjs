// Supprime (corbeille Overleaf) les projets dont les identifiants sont passés en arguments.
import ProjectDeleter from '../../../app/src/Features/Project/ProjectDeleter.mjs'
const ids = process.argv.slice(2)
for (const id of ids) {
  await ProjectDeleter.promises.deleteProject(id, { deletedReason: 'zip-import-failure' })
  console.log(`SUPPRIME ${id}`)
}
process.exit(0)
