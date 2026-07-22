import { Navigate, Route, Routes } from 'react-router-dom'
import GerencialApp from './App.jsx'
import { RoleAccessScreen, RoleEntry } from './RoleAccess.jsx'
import PromotorApp from './promotor/PromotorApp.jsx'
import { ForgotPasswordScreen, ResetPasswordScreen } from './components/auth/PasswordRecovery.jsx'

function RootApp() {
  return (
    <Routes>
      <Route path="/" element={<RoleEntry />} />
      <Route path="/esqueci-senha" element={<ForgotPasswordScreen />} />
      <Route path="/redefinir-senha" element={<ResetPasswordScreen />} />
      <Route path="/gerencial/*" element={<GerencialApp />} />
      <Route path="/acesso/promotor/*" element={<PromotorApp />} />
      <Route path="/acesso/:role" element={<RoleAccessScreen />} />
      <Route path="/promotor/*" element={<PromotorApp />} />
      <Route path="/entregador/*" element={<RoleAccessScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default RootApp
