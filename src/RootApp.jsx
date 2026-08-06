import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, RequireRole } from './auth/AuthProvider.jsx'
import { RoleAccessScreen, RoleEntry } from './RoleAccess.jsx'
import { ForgotPasswordScreen, ResetPasswordScreen } from './components/auth/PasswordRecovery.jsx'
import { supabaseConfigError } from './lib/supabaseClient.ts'

const GerencialApp = lazy(() => import('./App.jsx'))
const PromotorApp = lazy(() => import('./promotor/PromotorApp.jsx'))

function isPasswordRecoveryRedirect() {
  if (typeof window === 'undefined') return false
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return Boolean(
    hashParams.get('type') === 'recovery' ||
      hashParams.get('error') ||
      hashParams.get('error_code'),
  )
}

function RootApp() {
  if (supabaseConfigError) {
    return (
      <main className="configuration-error" role="alert">
        <h1>Configuração pendente</h1>
        <p>Não foi possível conectar ao Supabase.</p>
        <p>{supabaseConfigError}</p>
      </main>
    )
  }

  return (
    <AuthProvider>
      <Suspense fallback={<main className="route-loading" aria-busy="true">Carregando...</main>}>
        <Routes>
          <Route path="/" element={isPasswordRecoveryRedirect() ? <ResetPasswordScreen /> : <RoleEntry />} />
          <Route path="/esqueci-senha" element={<ForgotPasswordScreen />} />
          <Route path="/redefinir-senha" element={<ResetPasswordScreen />} />
          <Route
            path="/admin/*"
            element={(
              <RequireRole profile="Admin" authRole="admin">
                <GerencialApp />
              </RequireRole>
            )}
          />
          <Route
            path="/gerencial/*"
            element={(
              <RequireRole profile="Gerencial" authRole="gerencial">
                <GerencialApp />
              </RequireRole>
            )}
          />
          <Route
            path="/acesso/promotor/*"
            element={(
              <RequireRole profile="Promotor" authRole="promotor">
                <PromotorApp />
              </RequireRole>
            )}
          />
          <Route path="/acesso/:role" element={<RoleAccessScreen />} />
          <Route path="/promotor/*" element={<Navigate to="/acesso/promotor" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  )
}

export default RootApp
