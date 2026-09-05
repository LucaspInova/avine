import { describe, expect, it } from 'vitest'
import {
  getGerencialBasePath,
  getGerencialSearch,
  getGerencialScreenFromPath,
  getGerencialScreenPath,
  isCanonicalGerencialPath,
  setGerencialSearch,
} from './navigation'

describe('navegacao canonica gerencial', () => {
  it('preserva a raiz correspondente ao perfil atual', () => {
    expect(getGerencialBasePath('/admin/notas', 'Gerencial')).toBe('/admin')
    expect(getGerencialBasePath('/gerencial/lojas', 'Admin')).toBe('/gerencial')
    expect(getGerencialBasePath('/', 'Admin')).toBe('/admin')
    expect(getGerencialBasePath('/', 'Gerencial')).toBe('/gerencial')
  })

  it('resolve telas por URL e rejeita segmentos desconhecidos', () => {
    expect(getGerencialScreenFromPath('/admin/dashboard')).toBe('dashboard')
    expect(getGerencialScreenFromPath('/gerencial/fotos')).toBe('fotos-anexadas')
    expect(getGerencialScreenFromPath('/admin/fotos-anexadas')).toBe('fotos-anexadas')
    expect(getGerencialScreenFromPath('/admin')).toBe('dashboard')
    expect(getGerencialScreenFromPath('/admin/inexistente')).toBeNull()
  })

  it('gera o mesmo endereco para clique, refresh e historico', () => {
    expect(getGerencialScreenPath('/admin/dashboard', 'Admin', 'usuarios')).toBe('/admin/usuarios')
    expect(getGerencialScreenPath('/gerencial/notas', 'Gerencial', 'fotos-anexadas')).toBe('/gerencial/fotos')
    expect(isCanonicalGerencialPath('/admin/fotos-anexadas', 'fotos-anexadas')).toBe(false)
    expect(isCanonicalGerencialPath('/admin/fotos', 'fotos-anexadas')).toBe(true)
  })

  it('preserva a pesquisa na URL sem apagar outros parametros', () => {
    expect(getGerencialSearch('?q=Loja+Centro&uf=CE')).toBe('Loja Centro')
    expect(setGerencialSearch('/admin/notas', '?uf=CE', 'Nota 42')).toBe('/admin/notas?uf=CE&q=Nota+42')
    expect(setGerencialSearch('/admin/notas', '?uf=CE&q=antiga', '')).toBe('/admin/notas?uf=CE')
  })
})
