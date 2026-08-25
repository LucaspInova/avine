import { describe, expect, it } from 'vitest'
import { resolveSupabaseUrl } from './supabaseClient'

describe('resolveSupabaseUrl', () => {
  it('monta a URL a partir do ID do projeto', () => {
    expect(resolveSupabaseUrl('abcdefghijklmnopqrst'))
      .toBe('https://abcdefghijklmnopqrst.supabase.co')
  })

  it('preserva uma URL válida copiada do painel do Supabase', () => {
    expect(resolveSupabaseUrl('https://abcdefghijklmnopqrst.supabase.co/'))
      .toBe('https://abcdefghijklmnopqrst.supabase.co')
  })

  it('rejeita endereços que não são do Supabase', () => {
    expect(resolveSupabaseUrl('https://example.com')).toBe('')
  })
})
