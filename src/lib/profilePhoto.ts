import { supabase } from './supabaseClient'

const PROFILE_PHOTOS_BUCKET = 'profile-photos'
const PROFILE_PHOTO_MAX_SIZE_BYTES = 5 * 1024 * 1024
const PROFILE_PHOTO_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const PROFILE_PHOTO_SIGNED_URL_TTL_SECONDS = 60 * 60

type ProfilePhotoAllowedType = (typeof PROFILE_PHOTO_ALLOWED_TYPES)[number]

export type ProfilePhotoUploadResult = {
  path: string
  signedUrl: string
}

export function getProfilePhotoPath(authUserId: string): string {
  return `${authUserId}/avatar.jpg`
}

export function validateProfilePhoto(file: File): string {
  if (file.size > PROFILE_PHOTO_MAX_SIZE_BYTES) {
    return 'A foto deve ter no máximo 5MB.'
  }

  if (!PROFILE_PHOTO_ALLOWED_TYPES.includes(file.type as ProfilePhotoAllowedType)) {
    return 'Envie uma foto em JPG, PNG ou WebP.'
  }

  return ''
}

export async function getProfilePhotoSignedUrl(path: string): Promise<string> {
  if (!path) return ''

  const { data, error } = await supabase.storage
    .from(PROFILE_PHOTOS_BUCKET)
    .createSignedUrl(path, PROFILE_PHOTO_SIGNED_URL_TTL_SECONDS)

  if (error) throw error

  return data.signedUrl
}

export async function uploadProfilePhoto(
  authUserId: string,
  file: File,
): Promise<ProfilePhotoUploadResult> {
  const validationError = validateProfilePhoto(file)

  if (validationError) {
    throw new Error(validationError)
  }

  const path = getProfilePhotoPath(authUserId)
  const { error } = await supabase.storage.from(PROFILE_PHOTOS_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: true,
  })

  if (error) throw error

  return {
    path,
    signedUrl: await getProfilePhotoSignedUrl(path),
  }
}
