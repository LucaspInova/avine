export default function EnvironmentBanner() {
  if (import.meta.env.VITE_APP_ENV !== 'homologacao') {
    return null
  }

  return (
    <div className="environment-banner" role="status">
      Ambiente de homologação — dados de teste
    </div>
  )
}
