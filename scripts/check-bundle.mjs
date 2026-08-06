import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { gzip } from 'node:zlib'
import { promisify } from 'node:util'

const maxJavaScriptBytes = 450 * 1024
const maxRegressionRatio = 0.05
const assetsDirectory = path.resolve('dist/assets')
const manifestPath = path.resolve('dist/.vite/manifest.json')
const baselinePath = path.resolve('scripts/bundle-baseline.json')
const lazyEntries = {
  Promotor: 'src/apps/promotor/routes.jsx',
  Gerencial: 'src/apps/gerencial/routes.jsx',
}
const gzipAsync = promisify(gzip)
const files = await readdir(assetsDirectory)
const oversized = []
let hasFailure = false

const [manifest, baseline] = await Promise.all([
  readJson(manifestPath, 'manifesto do Vite'),
  readJson(baselinePath, 'baseline de bundle'),
])

console.log('Chunks das entradas lazy de RootApp:')

for (const [application, source] of Object.entries(lazyEntries)) {
  const chunk = manifest[source]
  if (!chunk?.file) {
    throw new Error(`O manifesto não contém a entrada lazy ${application} (${source}).`)
  }

  const chunkPath = path.resolve('dist', chunk.file)
  const contents = await readFile(chunkPath)
  const sizes = {
    rawBytes: contents.byteLength,
    gzipBytes: (await gzipAsync(contents)).byteLength,
  }
  const expected = baseline.entries?.[application]

  console.log(
    `- ${application}: ${chunk.file} — bruto ${formatSize(sizes.rawBytes)}; gzip ${formatSize(sizes.gzipBytes)}`,
  )

  if (!expected) {
    console.error(`  Baseline ausente para ${application}.`)
    hasFailure = true
    continue
  }

  for (const metric of ['rawBytes', 'gzipBytes']) {
    const limit = Math.floor(expected[metric] * (1 + maxRegressionRatio))
    if (sizes[metric] > limit) {
      console.error(
        `  Regressão em ${metric === 'rawBytes' ? 'tamanho bruto' : 'gzip'}: ` +
        `${formatSize(sizes[metric])} excede a baseline ${formatSize(expected[metric])} ` +
        `em mais de ${maxRegressionRatio * 100}%.`,
      )
      hasFailure = true
    }
  }
}

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
  hasFailure = true
} else {
  console.log('Todos os chunks JavaScript respeitam o orçamento de 450 KB.')
}

if (hasFailure) process.exitCode = 1

async function readJson(filePath, description) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`Não foi possível ler ${description} em ${filePath}: ${error.message}`)
  }
}

function formatSize(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB (${bytes} bytes)`
}
