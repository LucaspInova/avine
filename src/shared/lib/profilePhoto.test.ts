import { describe, expect, it } from 'vitest'
import { getProfilePhotoPath, validateProfilePhoto } from './profilePhoto'

describe('profilePhoto', () => {
  it('isola a foto pelo usuário autenticado', () => {
    expect(getProfilePhotoPath('usuario-123')).toBe('usuario-123/avatar.jpg')
  })

  it('recusa formatos e tamanhos fora da política do bucket', () => {
    const invalidType = new File(['texto'], 'avatar.txt', { type: 'text/plain' })
    expect(validateProfilePhoto(invalidType)).toMatch(/JPG, PNG ou WebP/)

    const oversized = {
      size: 5 * 1024 * 1024 + 1,
      type: 'image/jpeg',
    } as File
    expect(validateProfilePhoto(oversized)).toMatch(/5MB/)
  })
})
