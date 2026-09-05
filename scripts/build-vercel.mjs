import { build } from 'vite'

const HOMOLOGATION_BRANCH = 'inova/homologacao-plano-fstd'
const isHomologation = process.env.VERCEL_GIT_COMMIT_REF === HOMOLOGATION_BRANCH

await build({
  mode: isHomologation ? 'homologacao' : 'production',
})
