import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '../../domains/auth/AuthProvider.jsx'
import EnvironmentBanner from '../../shared/components/EnvironmentBanner.jsx'
import { supabaseConfigError } from '../../shared/lib/supabaseClient.ts'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

export default function AppProviders({ children }) {
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
    <QueryClientProvider client={queryClient}>
      <EnvironmentBanner />
      <BrowserRouter>
        <AuthProvider>{children}</AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
