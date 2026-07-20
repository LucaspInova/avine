import { Navigate, Route, Routes } from 'react-router-dom'
import GerencialApp from './App.jsx'
import PromotorApp from './promotor/PromotorApp.jsx'

function RootApp() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/gerencial" replace />} />
      <Route path="/gerencial/*" element={<GerencialApp />} />
      <Route path="/promotor/*" element={<PromotorApp />} />
      <Route path="*" element={<Navigate to="/gerencial" replace />} />
    </Routes>
  )
}

export default RootApp
