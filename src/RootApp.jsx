import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, RequireRole } from './auth/AuthProvider.jsx'
import { RoleAccessScreen, RoleEntry } from './RoleAccess.jsx'
import { ForgotPasswordScreen, ResetPasswordScreen } from './components/auth/PasswordRecovery.jsx'
import { supabaseConfigError } from './lib/supabaseClient.ts'

const GerencialApp = lazy(() => import('./App.jsx'))
const PromotorApp = lazy(() => import('./promotor/PromotorApp.jsx'))

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
          <Route path="/" element={<RoleEntry />} />
          <Route path="/esqueci-senha" element={<ForgotPasswordScreen />} />
          <Route path="/redefinir-senha" element={<ResetPasswordScreen />} />
          <Route
            path="/gerencial/*"
            element={(
              <RequireRole profile="Gerencial">
                <GerencialApp />
              </RequireRole>
            )}
          />
          <Route
            path="/acesso/promotor/*"
            element={(
              <RequireRole profile="Promotor">
                <PromotorApp />
              </RequireRole>
            )}
          />
          <Route path="/acesso/:role" element={<RoleAccessScreen />} />
          <Route path="/promotor/*" element={<Navigate to="/acesso/promotor" replace />} />
          <Route path="/entregador/*" element={<RoleAccessScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  )
}

export default RootApp
