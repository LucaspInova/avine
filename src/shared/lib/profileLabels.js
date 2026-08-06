const profileLabels = {
  Admin: 'Admin',
  Gerencial: 'Gerencial',
  Promotor: 'Promotor',
}

export function getProfileLabel(profile) {
  return profileLabels[profile] ?? profile
}
