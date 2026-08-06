import { Navigate } from 'react-router-dom'

export function GerencialApplicationShell({ authLoading, session, profile, sidebar, children }) {
  if (authLoading) {
    return (
      <main className="login-shell" aria-busy="true">
        <p className="auth-loading">Validando sessão...</p>
      </main>
    )
  }

  if (!session || !profile) return <Navigate to="/" replace />

  return (
    <div className="admin-shell">
      {sidebar}
      {children}
    </div>
  )
}
