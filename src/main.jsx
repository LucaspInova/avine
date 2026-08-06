import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import RootApp from './app/RootApp.jsx'
import AppProviders from './app/providers/AppProviders.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppProviders>
      <RootApp />
    </AppProviders>
  </StrictMode>,
)
