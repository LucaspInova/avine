import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const maxJavaScriptBytes = 450 * 1024
const assetsDirectory = path.resolve('dist/assets')
const files = await readdir(assetsDirectory)
const oversized = []

for (const file of files) {
  if (!file.endsWith('.js')) continue
  const size = (await stat(path.join(assetsDirectory, file))).size
  if (size > maxJavaScriptBytes) oversized.push({ file, size })
}

if (oversized.length > 0) {
  for (const asset of oversized) {
    console.error(
      `${asset.file}: ${(asset.size / 1024).toFixed(1)} KB excede o orçamento de 450 KB.`,
    )
  }
  process.exitCode = 1
} else {
  console.log('Todos os chunks JavaScript respeitam o orçamento de 450 KB.')
}
