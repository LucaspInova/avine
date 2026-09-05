import fs from 'node:fs'
import process from 'node:process'

const [generatedPath = '/tmp/database.types.ts', committedPath = 'src/types/database.types.ts'] =
  process.argv.slice(2)

function matchingBrace(source, openIndex) {
  let depth = 0
  let quote = null

  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index]
    const previous = source[index - 1]

    if (quote) {
      if (character === quote && previous !== '\\') quote = null
      continue
    }

    if (character === "'" || character === '"' || character === '`') {
      quote = character
      continue
    }

    if (character === '{') depth += 1
    if (character === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }

  throw new Error('Bloco de tipo não foi fechado.')
}

function namedBlock(source, name, fromIndex = 0) {
  const matcher = new RegExp(`\\b${name}\\s*:\\s*\\{`, 'g')
  matcher.lastIndex = fromIndex
  const match = matcher.exec(source)
  if (!match) throw new Error(`Bloco ${name} não encontrado.`)
  const openIndex = source.indexOf('{', match.index)
  return source.slice(openIndex, matchingBrace(source, openIndex) + 1)
}

function typeDatabaseBlock(source) {
  const marker = source.indexOf('export type Database')
  if (marker < 0) throw new Error('O tipo Database não foi encontrado.')
  const openIndex = source.indexOf('{', marker)
  return source.slice(openIndex, matchingBrace(source, openIndex) + 1)
}

function topLevelMembers(block) {
  const members = new Map()
  let index = 1

  while (index < block.length - 1) {
    while (/\s|;|,/.test(block[index])) index += 1
    if (index >= block.length - 1) break

    const nameMatch = block.slice(index).match(/^([A-Za-z_$][\w$]*|"[^"]+"|'[^']+')\s*:/)
    if (!nameMatch) {
      index += 1
      continue
    }

    const name = nameMatch[1].replace(/^['"]|['"]$/g, '')
    index += nameMatch[0].length
    while (/\s/.test(block[index])) index += 1

    if (block[index] !== '{') {
      const valueStart = index
      while (index < block.length - 1 && block[index] !== '\n') index += 1
      members.set(name, block.slice(valueStart, index).trim())
      continue
    }

    const closeIndex = matchingBrace(block, index)
    members.set(name, block.slice(index, closeIndex + 1))
    index = closeIndex + 1
  }

  return members
}

function sortedKeys(memberMap) {
  return [...memberMap.keys()].sort()
}

function requiredMember(members, name, context) {
  const block = members.get(name)
  if (!block) throw new Error(`Bloco ${context}.${name} não encontrado.`)
  return block
}

function manifest(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const database = typeDatabaseBlock(source)
  const publicSchema = namedBlock(database, 'public')
  const publicMembers = topLevelMembers(publicSchema)
  const tables = topLevelMembers(requiredMember(publicMembers, 'Tables', 'public'))
  const views = topLevelMembers(requiredMember(publicMembers, 'Views', 'public'))
  const functions = topLevelMembers(requiredMember(publicMembers, 'Functions', 'public'))

  const result = {
    tables: {},
    views: {},
    functions: {},
  }

  for (const [tableName, tableBlock] of [...tables].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (!tableBlock) continue
    const tableMembers = topLevelMembers(tableBlock)
    result.tables[tableName] = {
      row: sortedKeys(
        topLevelMembers(requiredMember(tableMembers, 'Row', `Tables.${tableName}`)),
      ),
      insert: sortedKeys(
        topLevelMembers(requiredMember(tableMembers, 'Insert', `Tables.${tableName}`)),
      ),
      update: sortedKeys(
        topLevelMembers(requiredMember(tableMembers, 'Update', `Tables.${tableName}`)),
      ),
    }
  }

  for (const [viewName, viewBlock] of [...views].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (!viewBlock) continue
    const viewMembers = topLevelMembers(viewBlock)
    const rowBlock = requiredMember(viewMembers, 'Row', `Views.${viewName}`)
    const tableAlias = rowBlock.match(
      /^Database\[['"]public['"]\]\[['"]Tables['"]\]\[['"]([^'"]+)['"]\]\[['"]Row['"]\]$/,
    )
    result.views[viewName] = tableAlias
      ? (result.tables[tableAlias[1]]?.row ?? [`@table:${tableAlias[1]}`])
      : sortedKeys(topLevelMembers(rowBlock))
  }

  for (const [functionName, functionBlock] of [...functions].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (!functionBlock) continue
    const functionMembers = topLevelMembers(functionBlock)
    const argsBlock = functionMembers.get('Args')
    result.functions[functionName] = argsBlock
      ? sortedKeys(topLevelMembers(argsBlock))
      : []
  }

  return result
}

function validateDomainTypeReferences(committedPath, committedManifest) {
  const domainsRoot = 'src/domains'
  if (!fs.existsSync(domainsRoot)) return

  const source = fs.readdirSync(domainsRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => fs.readFileSync(`${entry.parentPath}/${entry.name}`, 'utf8'))
    .join('\n')

  const groups = [
    ['table', /(?:TableRow|TableInsert|TableUpdate)<['"]([^'"]+)['"]>/g, committedManifest.tables],
    ['view', /ViewRow<['"]([^'"]+)['"]>/g, committedManifest.views],
    ['function', /(?:RpcArgs|RpcResponse)<['"]([^'"]+)['"]>/g, committedManifest.functions],
  ]

  for (const [kind, pattern, available] of groups) {
    for (const match of source.matchAll(pattern)) {
      if (!(match[1] in available)) {
        throw new Error(`Referência de ${kind} desconhecida nos domínios: ${match[1]} (${committedPath}).`)
      }
    }
  }
}

function describeManifestDifferences(generated, committed) {
  const differences = []

  for (const group of ['tables', 'views', 'functions']) {
    const generatedNames = new Set(Object.keys(generated[group]))
    const committedNames = new Set(Object.keys(committed[group]))

    for (const name of generatedNames) {
      if (!committedNames.has(name)) differences.push(`ausente no arquivo: ${group}.${name}`)
    }
    for (const name of committedNames) {
      if (!generatedNames.has(name)) differences.push(`não existe no schema: ${group}.${name}`)
    }
    for (const name of generatedNames) {
      if (!committedNames.has(name)) continue
      const expected = JSON.stringify(generated[group][name])
      const actual = JSON.stringify(committed[group][name])
      if (expected !== actual) {
        differences.push(`membros divergentes: ${group}.${name}\n  schema=${expected}\n  arquivo=${actual}`)
      }
    }
  }

  return differences
}

const generatedManifest = manifest(generatedPath)
const committedManifest = manifest(committedPath)
validateDomainTypeReferences(committedPath, committedManifest)

if (JSON.stringify(generatedManifest) !== JSON.stringify(committedManifest)) {
  console.error(
    'database.types.ts está desatualizado: tabelas, colunas, views ou argumentos de RPC divergiram.',
  )
  console.error('Regere o arquivo com `supabase gen types typescript`.')
  for (const difference of describeManifestDifferences(generatedManifest, committedManifest)) {
    console.error(`- ${difference}`)
  }
  process.exit(1)
}

console.log('database.types.ts corresponde ao schema gerado.')
