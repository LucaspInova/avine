import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireRole } from '../domains/auth/AuthProvider.jsx'
import { RoleAccessScreen, RoleEntry } from '../domains/auth/RoleAccess.jsx'
import { ForgotPasswordScreen, ResetPasswordScreen } from '../shared/components/auth/PasswordRecovery.jsx'
import { applicationRoutes } from './routePaths.js'

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
        <Route path={applicationRoutes.entry} element={isPasswordRecoveryRedirect() ? <ResetPasswordScreen /> : <RoleEntry />} />
        <Route path={applicationRoutes.forgotPassword} element={<ForgotPasswordScreen />} />
        <Route path={applicationRoutes.resetPassword} element={<ResetPasswordScreen />} />
        <Route path={applicationRoutes.admin} element={<RequireRole profile="Admin" authRole="admin"><GerencialRoutes /></RequireRole>} />
        <Route path={applicationRoutes.gerencial} element={<RequireRole profile="Gerencial" authRole="gerencial"><GerencialRoutes /></RequireRole>} />
        <Route path={applicationRoutes.promotor} element={<RequireRole profile="Promotor" authRole="promotor"><PromotorRoutes /></RequireRole>} />
        <Route path={applicationRoutes.roleAccess} element={<RoleAccessScreen />} />
        <Route path={applicationRoutes.legacyPromotor} element={<Navigate to="/acesso/promotor" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
