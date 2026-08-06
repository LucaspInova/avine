import { supabase } from '../../shared/lib/supabaseClient'

export async function fetchAllNfdNotas(select: string, configureQuery?: (query: any) => any) {
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    let query: any = supabase!.from('nfd_notas').select(select)
    if (configureQuery) query = configureQuery(query)
    const { data, error } = await query.range(from, from + 999)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data ?? []).length < 1000) return rows
  }
}
