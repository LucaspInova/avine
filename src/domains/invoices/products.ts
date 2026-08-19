export function normalizeProductCode(value: unknown) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, '').toUpperCase()
}

export function getProductGroupKey(product: any) {
  const productId = String(product?.produto_id ?? '').trim()
  if (productId) return `produto:${productId}`
  const codes = Array.isArray(product?.codigos_produto) ? product.codigos_produto : [product?.codigo_produto]
  const code = normalizeProductCode(codes.find(Boolean))
  return code ? `codigo:${code}` : ''
}

export function getNfdProducts(nfd: any, productsCatalog: any[] = []) {
  const catalogByCode = new Map(productsCatalog.map((p) => [normalizeProductCode(p.codigo_produto), p]))
  const grouped = new Map<string, any>()
  for (const detail of Array.isArray(nfd?.detalhes) ? nfd.detalhes : []) {
    const code = normalizeProductCode(detail?.codigo_produto)
    if (!code) continue
    const catalog: any = catalogByCode.get(code)
    const product = { codigo_produto: code, produto_id: catalog?.produto_id ?? null, nome: catalog?.nome ?? detail?.descricao_produto ?? code, descricao: detail?.descricao_produto ?? catalog?.nome ?? null, imagem_url: catalog?.imagem_url ?? '', quantidade_faturada_galinha: Number(detail?.quantidade_galinha ?? 0), quantidade_faturada_codorna: Number(detail?.quantidade_codorna ?? 0) }
    const key = getProductGroupKey(product); const current = grouped.get(key)
    if (current) { if (!current.codigos_produto.includes(code)) current.codigos_produto.push(code); current.quantidade_faturada_galinha += product.quantidade_faturada_galinha; current.quantidade_faturada_codorna += product.quantidade_faturada_codorna }
    else grouped.set(key, { ...product, codigos_produto: [code] })
  }
  return [...grouped.values()]
}

export function getFstdTargetProducts(nfd: any, productsCatalog: any[] = [], processProducts: any[] = []) {
  return mergeNfdProducts(getNfdProducts(nfd, productsCatalog), processProducts)
}

export function mergeNfdProducts(importedProducts: any[], processProducts: any[] = []) {
  const grouped = new Map(importedProducts.map((p) => [getProductGroupKey(p), p]))
  for (const product of processProducts) {
    const code = normalizeProductCode(product.codigo_produto); const key = getProductGroupKey(product); const imported: any = grouped.get(key)
    if (imported) grouped.set(key, { ...imported, produto_id: imported.produto_id ?? product.produto_id ?? null, codigos_produto: [...new Set([...(imported.codigos_produto ?? [imported.codigo_produto]), ...(code ? [code] : [])])], imagem_url: imported.imagem_url || product.imagem_url || '' })
    else if (code) grouped.set(key, { codigo_produto: code, produto_id: product.produto_id ?? null, nome: product.nome ?? code, descricao: product.descricao ?? product.nome ?? null, imagem_url: product.imagem_url ?? '', codigos_produto: [code], quantidade_faturada_galinha: Number(product.quantidade_faturada_galinha ?? 0), quantidade_faturada_codorna: Number(product.quantidade_faturada_codorna ?? 0) })
  }
  return [...grouped.values()]
}

export function getNfdReturnRates(nfd: any) {
  const billed = { galinha: Number(nfd?.quantidade_galinha ?? 0), codorna: Number(nfd?.quantidade_codorna ?? 0) }; const returned = { galinha: 0, codorna: 0 }
  const byKey = new Map((nfd?.produtos ?? []).map((p: any) => [getProductGroupKey(p), p])); const byCode = new Map<string, any>()
  for (const p of nfd?.produtos ?? []) for (const c of p.codigos_produto ?? [p.codigo_produto]) byCode.set(normalizeProductCode(c), p)
  for (const p of nfd?.fstd_process?.produtos ?? []) { const source: any = byKey.get(getProductGroupKey(p)) ?? byCode.get(normalizeProductCode(p.codigo_produto)); const gal = Number(p.quantidade_faturada_galinha ?? source?.quantidade_faturada_galinha ?? 0); const cod = Number(p.quantidade_faturada_codorna ?? source?.quantidade_faturada_codorna ?? 0); const qty = Math.max(0, Number(p.quantidade_retorno ?? 0)); if (gal && cod) { returned.galinha += qty * gal / (gal + cod); returned.codorna += qty * cod / (gal + cod) } else if (gal) returned.galinha += qty; else if (cod) returned.codorna += qty }
  const rate = (value: number, total: number) => total <= 0 ? 0 : Math.min(100, Math.max(0, value / total * 100))
  return { galinha: rate(returned.galinha, billed.galinha), codorna: rate(returned.codorna, billed.codorna) }
}
