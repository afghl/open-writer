// index.ts
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { Sandbox } from '@e2b/code-interpreter'

const currentDir = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(currentDir, '../packages/openwrite/.env') })

const sbx = await Sandbox.create() // By default the sandbox is alive for 5 minutes
const execution = await sbx.runCode('print("hello world")') // Execute Python inside the sandbox
console.log(execution.logs)

const inputsDir = '/inputs'
const readmePath = `${inputsDir}/readme.md`
await sbx.files.makeDir(inputsDir)
await sbx.files.write(readmePath, '# Sandbox Readme\n')
console.log(`readme path: ${readmePath}`)

const readmeContent = await sbx.files.read(readmePath)
console.log(readmeContent)