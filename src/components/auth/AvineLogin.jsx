import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import avineLogo from '../../assets/foto_logoavine.png'
import aviaryImageAvif from '../../assets/avine-egg-factory.avif'
import aviaryImageWebp from '../../assets/avine-egg-factory.webp'
import './AvineLogin.css'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function LoginIcon({ name, className = '' }) {
  const props = {
    className: `avine-login-icon ${className}`.trim(),
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

  if (name === 'lock') {
    return (
      <svg {...props}>
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        <path d="M12 14v2" />
      </svg>
    )
  }

  if (name === 'eye') {
    return (
      <svg {...props}>
        <path d="M2.5 12s3.4-5 9.5-5 9.5 5 9.5 5-3.4 5-9.5 5-9.5-5-9.5-5Z" />
        <circle cx="12" cy="12" r="2.25" />
      </svg>
    )
  }

  if (name === 'eye-off') {
    return (
      <svg {...props}>
        <path d="m3 3 18 18" />
        <path d="M10.6 6.3A10.8 10.8 0 0 1 12 6c6.1 0 9.5 6 9.5 6a17.7 17.7 0 0 1-3.2 3.6" />
        <path d="M6.2 6.2C3.8 8 2.5 12 2.5 12S5.9 18 12 18a9.3 9.3 0 0 0 3-.5" />
      </svg>
    )
  }

  if (name === 'user') {
    return (
      <svg {...props}>
        <circle cx="12" cy="8" r="3.25" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </svg>
    )
  }

  return (
    <svg {...props}>
      <path d="M12 3a4 4 0 0 0-4 4v3H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1V7a4 4 0 0 0-4-4Z" />
      <path d="M12 14v2" />
    </svg>
  )
}

function AvineLogin({ error = '', busy = false, onSubmit }) {
  const emailRef = useRef(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [keepSession, setKeepSession] = useState(true)
  const [submitted, setSubmitted] = useState(false)

  const emailError = submitted && !emailPattern.test(email.trim())
    ? 'Informe um e-mail válido.'
    : ''
  const passwordError = submitted && !password
    ? 'Informe sua senha.'
    : ''
  function handleSubmit(event) {
    event.preventDefault()
    setSubmitted(true)

    if (!emailPattern.test(email.trim()) || !password || busy) return

    onSubmit({ email: email.trim().toLowerCase(), password, keepSession })
  }

  return (
    <main className="avine-login">
      <section className="avine-login-brand" aria-labelledby="avine-login-welcome">
        <div className="avine-login-curve avine-login-curve-top" aria-hidden="true" />
        <div className="avine-login-brand-copy">
          <img className="avine-login-logo" src={avineLogo} alt="Ovos Avine" />
          <h1 id="avine-login-welcome">
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

      <section className="avine-login-form-side">
        <form className="avine-login-card" onSubmit={handleSubmit} noValidate>
          <div className="avine-login-lock-badge"><LoginIcon name="lock" /></div>
          <h2>Entrar na sua conta</h2>
          <p className="avine-login-card-subtitle">
            Informe seus dados para acessar<br className="avine-login-desktop-break" /> a plataforma Avine.
          </p>

          <div className="avine-login-fields">
            <label className="avine-login-field" htmlFor="avine-email">
              <span>E-mail</span>
              <span className={`avine-login-input-wrap ${emailError ? 'is-invalid' : ''}`}>
                <LoginIcon name="mail" />
                <input
                  ref={emailRef}
                  id="avine-email"
                  name="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="Digite seu e-mail"
                  aria-invalid={Boolean(emailError)}
                  aria-describedby={emailError ? 'avine-email-error' : undefined}
                  required
                />
              </span>
              {emailError && <small id="avine-email-error" className="avine-login-error">{emailError}</small>}
            </label>

            <label className="avine-login-field" htmlFor="avine-password">
              <span>Senha</span>
              <span className={`avine-login-input-wrap ${passwordError ? 'is-invalid' : ''}`}>
                <LoginIcon name="lock" />
                <input
                  id="avine-password"
                  name="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Digite sua senha"
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={passwordError ? 'avine-password-error' : undefined}
                  required
                />
                <button
                  className="avine-login-password-toggle"
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  <LoginIcon name={showPassword ? 'eye-off' : 'eye'} />
                </button>
              </span>
              {passwordError && <small id="avine-password-error" className="avine-login-error">{passwordError}</small>}
            </label>
          </div>

          <div className="avine-login-actions-row">
            <label className="avine-login-keep-session">
              <input
                checked={keepSession}
                onChange={(event) => setKeepSession(event.target.checked)}
                type="checkbox"
              />
              <span>Manter sessão</span>
            </label>
            <Link className="avine-login-forgot" to="/esqueci-senha">Esqueceu sua senha?</Link>
          </div>

          {error && <p className="avine-login-form-error" role="alert">{error}</p>}

          <button className="avine-login-primary" type="submit" disabled={busy}>
            {busy ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
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

export default AvineLogin
