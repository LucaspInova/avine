import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireRole } from '../domains/auth/AuthProvider.jsx'
import { RoleAccessScreen, RoleEntry } from '../domains/auth/RoleAccess.jsx'
import { ForgotPasswordScreen, ResetPasswordScreen } from '../shared/components/auth/PasswordRecovery.jsx'

const GerencialRoutes = lazy(() => import('../apps/gerencial/routes.jsx'))
const PromotorRoutes = lazy(() => import('../apps/promotor/routes.jsx'))

function isPasswordRecoveryRedirect() {
  if (typeof window === 'undefined') return false
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return Boolean(hashParams.get('type') === 'recovery' || hashParams.get('error') || hashParams.get('error_code'))
}

export default function RootApp() {
  return (
    <Suspense fallback={<main className="route-loading" aria-busy="true">Carregando...</main>}>
      <Routes>
        <Route path="/" element={isPasswordRecoveryRedirect() ? <ResetPasswordScreen /> : <RoleEntry />} />
        <Route path="/esqueci-senha" element={<ForgotPasswordScreen />} />
        <Route path="/redefinir-senha" element={<ResetPasswordScreen />} />
        <Route path="/admin/*" element={<RequireRole profile="Admin" authRole="admin"><GerencialRoutes /></RequireRole>} />
        <Route path="/gerencial/*" element={<RequireRole profile="Gerencial" authRole="gerencial"><GerencialRoutes /></RequireRole>} />
        <Route path="/acesso/promotor/*" element={<RequireRole profile="Promotor" authRole="promotor"><PromotorRoutes /></RequireRole>} />
        <Route path="/acesso/:role" element={<RoleAccessScreen />} />
        <Route path="/promotor/*" element={<Navigate to="/acesso/promotor" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
