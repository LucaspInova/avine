import { toAppError } from '../errors'

type PageResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>

/** Loads every row while respecting Supabase's per-request row limit. */
export async function paginateSupabase<T>(
  queryPage: (from: number, to: number) => PageResult<T>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryPage(from, from + pageSize - 1)
    if (error) throw toAppError(error)
    const page = data ?? []
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}
