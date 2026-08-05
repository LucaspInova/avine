const profileLabels = {
  Gerencial: 'Admin',
  Supervisor: 'Gerenciais',
  Promotor: 'Promotor',
}

export function getProfileLabel(profile) {
  return profileLabels[profile] ?? profile
}
