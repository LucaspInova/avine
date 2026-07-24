import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import avineLogo from '../../assets/foto_logoavine.png'
import aviaryImageAvif from '../../assets/avine-egg-factory.avif'
import aviaryImageWebp from '../../assets/avine-egg-factory.webp'
import { supabase } from '../../lib/supabaseClient'
import './AvineLogin.css'
import './PasswordRecovery.css'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const recoveryPath = '/redefinir-senha'

function RecoveryIcon({ name }) {
  const props = {
    className: 'avine-login-icon',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.9',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  }

  if (name === 'mail') {
    return (
      <svg {...props}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 7 9-7" />
      </svg>
    )
  }

  return (
    <svg {...props}>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M12 14v2" />
    </svg>
  )
}

function RecoveryBrand() {
  return (
    <section className="avine-login-brand" aria-labelledby="avine-recovery-welcome">
      <div className="avine-login-curve avine-login-curve-top" aria-hidden="true" />
      <div className="avine-login-brand-copy">
        <img className="avine-login-logo" src={avineLogo} alt="Ovos Avine" />
        <h1 id="avine-recovery-welcome">
          Bem-vindo(a) ao <span>FSTD DIGITAL</span>
        </h1>
      </div>
      <div className="avine-login-aviary" aria-hidden="true">
        <div className="avine-login-aviary-yellow" />
        <picture>
          <source srcSet={aviaryImageAvif} type="image/avif" />
          <img src={aviaryImageWebp} alt="" width="1200" height="628" />
        </picture>
      </div>
    </section>
  )
}

function RecoveryLayout({ children, title, subtitle, icon = 'lock' }) {
  return (
    <main className="avine-login avine-login-recovery">
      <RecoveryBrand />
      <section className="avine-login-form-side">
        <div className="avine-login-card avine-login-recovery-card">
          <div className="avine-login-lock-badge"><RecoveryIcon name={icon} /></div>
          <h2>{title}</h2>
          <p className="avine-login-card-subtitle">{subtitle}</p>
          {children}
        </div>
        <p className="avine-login-copyright">© 2026 <span>Avine.</span> Todos os direitos reservados.</p>
        <a
          className="avine-login-credit"
          href="https://www.instagram.com/inovamasterr/"
          rel="noreferrer"
          target="_blank"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m7.4 7.1 2.2 2.2-2.2 2.2-2.2-2.2 2.2-2.2Zm9.2 5.4 2.2 2.2-2.2 2.2-2.2-2.2 2.2-2.2Zm-6.2-2.1 3.2 3.2m0-3.2-3.2 3.2" />
          </svg>
          <span>Desenvolvido por Master Inova</span>
        </a>
      </section>
    </main>
  )
}

function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const emailError = submitted && !emailPattern.test(email.trim())
    ? 'Informe um e-mail válido.'
    : ''

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitted(true)
    setError('')

    const normalizedEmail = email.trim().toLowerCase()
    if (!emailPattern.test(normalizedEmail) || busy) return

    setBusy(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}${recoveryPath}`,
      })

      if (resetError) {
        setError('Não foi possível enviar o e-mail agora. Tente novamente em instantes.')
      } else {
        setSuccess(true)
      }
    } catch {
      setError('Não foi possível enviar o e-mail agora. Tente novamente em instantes.')
    } finally {
      setBusy(false)
    }
  }

  if (success) {
    return (
      <RecoveryLayout
        icon="mail"
        title="Confira seu e-mail"
        subtitle="Enviamos as instruções para redefinir sua senha."
      >
        <p className="avine-recovery-status avine-recovery-status-success" role="status">
          Se houver uma conta associada a este endereço, você receberá um link para criar uma nova senha.
        </p>
        <Link className="avine-login-secondary avine-recovery-link-button" to="/">
          Voltar para o login
        </Link>
      </RecoveryLayout>
    )
  }

  return (
    <RecoveryLayout
      title="Esqueceu sua senha?"
      subtitle="Informe seu e-mail e enviaremos um link para você criar uma nova senha."
    >
      <form className="avine-recovery-form" onSubmit={handleSubmit} noValidate>
        <label className="avine-login-field" htmlFor="recovery-email">
          <span>E-mail</span>
          <span className={`avine-login-input-wrap ${emailError ? 'is-invalid' : ''}`}>
            <RecoveryIcon name="mail" />
            <input
              id="recovery-email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Digite seu e-mail"
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? 'recovery-email-error' : undefined}
              required
            />
          </span>
          {emailError && <small id="recovery-email-error" className="avine-login-error">{emailError}</small>}
        </label>

        {error && <p className="avine-login-form-error" role="alert">{error}</p>}

        <button className="avine-login-primary" type="submit" disabled={busy}>
          {busy ? 'Enviando...' : 'Enviar link de recuperação'}
        </button>
      </form>

      <Link className="avine-recovery-back-link" to="/">
        Voltar para o login
      </Link>
    </RecoveryLayout>
  )
}

function isRecoveryHash() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return params.get('type') === 'recovery'
}

function hasRecoveryError() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return Boolean(params.get('error') || params.get('error_code'))
}

function ResetPasswordScreen() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState(() => (hasRecoveryError() ? 'invalid' : 'checking'))
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let mounted = true
    let recoveryEventReceived = false
    let fallbackTimer
    const recoveryHash = isRecoveryHash()

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return

      if (event === 'PASSWORD_RECOVERY' && session) {
        recoveryEventReceived = true
        setPhase('ready')
      }
    })

    if (!hasRecoveryError()) {
      supabase.auth.getSession()
        .then(({ data, error: sessionError }) => {
          if (!mounted) return

          if (sessionError) {
            setPhase('error')
            return
          }

          if (!data.session) {
            setPhase('invalid')
            return
          }

          if (recoveryHash) {
            setPhase('ready')
            return
          }

          fallbackTimer = window.setTimeout(() => {
            if (mounted && !recoveryEventReceived) setPhase('invalid')
          }, 800)
        })
        .catch(() => {
          if (mounted) setPhase('error')
        })
    }

    return () => {
      mounted = false
      if (fallbackTimer) window.clearTimeout(fallbackTimer)
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!success) return undefined

    const redirectTimer = window.setTimeout(() => {
      navigate('/', { replace: true })
    }, 1400)

    return () => window.clearTimeout(redirectTimer)
  }, [navigate, success])

  const passwordError = submitted && password.length < 12
    ? 'A senha deve ter pelo menos 12 caracteres.'
    : ''
  const confirmationError = submitted && password !== confirmation
    ? 'As senhas não coincidem.'
    : ''

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitted(true)
    setError('')

    if (password.length < 12 || password !== confirmation || busy) return

    setBusy(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })

      if (updateError) {
        setError(updateError.message?.toLowerCase().includes('weak password')
          ? 'A senha escolhida é muito fraca. Escolha uma senha mais segura.'
          : 'Não foi possível atualizar sua senha. Solicite um novo link e tente novamente.')
        return
      }

      try {
        await supabase.auth.signOut()
      } catch {
        // A senha já foi atualizada; o login ainda será reaberto ao final do fluxo.
      }

      setSuccess(true)
    } catch {
      setError('Não foi possível atualizar sua senha. Solicite um novo link e tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  if (phase === 'checking') {
    return (
      <RecoveryLayout
        title="Validando seu link"
        subtitle="Aguarde enquanto verificamos sua solicitação."
      >
        <p className="avine-recovery-status" role="status">Validando...</p>
      </RecoveryLayout>
    )
  }

  if (phase === 'invalid') {
    return (
      <RecoveryLayout
        title="Link indisponível"
        subtitle="Este link expirou, já foi utilizado ou não é válido."
      >
        <p className="avine-recovery-status avine-recovery-status-error" role="alert">
          Solicite um novo link para redefinir sua senha.
        </p>
        <Link className="avine-login-primary avine-recovery-link-button" to="/esqueci-senha">
          Solicitar novo link
        </Link>
      </RecoveryLayout>
    )
  }

  if (phase === 'error') {
    return (
      <RecoveryLayout
        title="Não foi possível validar o link"
        subtitle="Ocorreu um problema ao acessar sua solicitação."
      >
        <p className="avine-recovery-status avine-recovery-status-error" role="alert">
          Tente solicitar um novo link de recuperação.
        </p>
        <Link className="avine-login-primary avine-recovery-link-button" to="/esqueci-senha">
          Solicitar novo link
        </Link>
      </RecoveryLayout>
    )
  }

  if (success) {
    return (
      <RecoveryLayout
        title="Senha atualizada"
        subtitle="Sua senha foi redefinida com sucesso."
      >
        <p className="avine-recovery-status avine-recovery-status-success" role="status">
          Você será redirecionado para o login em instantes.
        </p>
      </RecoveryLayout>
    )
  }

  return (
    <RecoveryLayout
      title="Crie uma nova senha"
      subtitle="Escolha uma senha segura para voltar a acessar a plataforma."
    >
      <form className="avine-recovery-form" onSubmit={handleSubmit} noValidate>
        <div className="avine-login-fields">
          <label className="avine-login-field" htmlFor="new-password">
            <span>Nova senha</span>
            <span className={`avine-login-input-wrap ${passwordError ? 'is-invalid' : ''}`}>
              <RecoveryIcon name="lock" />
              <input
                id="new-password"
                name="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                minLength={12}
                placeholder="Digite sua nova senha"
                aria-invalid={Boolean(passwordError)}
                aria-describedby={passwordError ? 'new-password-error' : undefined}
                required
              />
            </span>
            {passwordError && <small id="new-password-error" className="avine-login-error">{passwordError}</small>}
          </label>

          <label className="avine-login-field" htmlFor="confirm-password">
            <span>Confirmar nova senha</span>
            <span className={`avine-login-input-wrap ${confirmationError ? 'is-invalid' : ''}`}>
              <RecoveryIcon name="lock" />
              <input
                id="confirm-password"
                name="confirm-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                type="password"
                autoComplete="new-password"
                minLength={12}
                placeholder="Digite a senha novamente"
                aria-invalid={Boolean(confirmationError)}
                aria-describedby={confirmationError ? 'confirm-password-error' : undefined}
                required
              />
            </span>
            {confirmationError && <small id="confirm-password-error" className="avine-login-error">{confirmationError}</small>}
          </label>
        </div>

        {error && <p className="avine-login-form-error" role="alert">{error}</p>}

        <button className="avine-login-primary" type="submit" disabled={busy}>
          {busy ? 'Atualizando...' : 'Atualizar senha'}
        </button>
      </form>
    </RecoveryLayout>
  )
}

export { ForgotPasswordScreen, ResetPasswordScreen }
