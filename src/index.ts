export { splitDiffIntoChunks } from './git.js'
export { resolveTypeCheckCommand, runTypeCheck } from './checks.js'
export { main } from './cli.js'

import { pathToFileURL } from 'node:url'
import { main } from './cli.js'

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
