import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const { signIn, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState('signin') // 'signin' | 'signup' | 'forgot'

  // Sign in
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')

  // Sign up
  const [signupName,     setSignupName]     = useState('')
  const [signupEmail,    setSignupEmail]    = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupConfirm,  setSignupConfirm]  = useState('')
  const [signupSuccess,  setSignupSuccess]  = useState(false)

  // Forgot password
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent,  setForgotSent]  = useState(false)

  // Shared
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  if (isAuthenticated) {
    navigate('/events', { replace: true })
    return null
  }

  function switchTab(t) {
    setTab(t)
    setError('')
  }

  // ── Sign In ──────────────────────────────────────────────────────────────────
  async function handleSignIn(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email.trim(), password)
      navigate('/events', { replace: true })
    } catch (err) {
      setError(err.message || 'Login failed. Check your email and password.')
    } finally {
      setLoading(false)
    }
  }

  // ── Sign Up ──────────────────────────────────────────────────────────────────
  async function handleSignUp(e) {
    e.preventDefault()
    setError('')
    if (!signupName.trim()) { setError('Please enter your full name.'); return }
    if (signupPassword.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (signupPassword !== signupConfirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email:    signupEmail.trim(),
        password: signupPassword,
        options:  { data: { name: signupName.trim() } },
      })
      if (signUpError) throw signUpError
      setSignupSuccess(true)
    } catch (err) {
      setError(err.message || 'Sign up failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Forgot Password ───────────────────────────────────────────────────────────
  async function handleForgot(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        forgotEmail.trim(),
        { redirectTo: window.location.href }
      )
      if (resetError) throw resetError
      setForgotSent(true)
    } catch (err) {
      setError(err.message || 'Failed to send reset email.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>

        {/* Logo / title */}
        <div style={styles.header}>
          <div style={styles.logo}>📋</div>
          <div style={styles.title}>LIVE SCHEDULE MANAGER</div>
          <div style={styles.sub}>SBE Bespoke Events</div>
        </div>

        {/* Tab bar — only shown for signin / signup */}
        {tab !== 'forgot' && (
          <div style={styles.tabs}>
            <button
              style={{ ...styles.tab, ...(tab === 'signin' ? styles.tabActive : {}) }}
              onClick={() => switchTab('signin')}
            >Sign In</button>
            <button
              style={{ ...styles.tab, ...(tab === 'signup' ? styles.tabActive : {}) }}
              onClick={() => switchTab('signup')}
            >Request Access</button>
          </div>
        )}

        {/* ── Sign In form ── */}
        {tab === 'signin' && (
          <form onSubmit={handleSignIn}>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                autoFocus
              />
            </div>
            <div className="form-group" style={{ marginBottom: 6 }}>
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            <button type="button" style={styles.forgotLink} onClick={() => switchTab('forgot')}>
              Forgot password?
            </button>

            {error && <div style={styles.errorBox}>{error}</div>}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '11px', marginTop: 16 }}
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}

        {/* ── Request Access (Sign Up) form ── */}
        {tab === 'signup' && (
          signupSuccess ? (
            <div style={styles.successBox}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>✅</div>
              <strong>Account created!</strong>
              <p style={{ fontSize: 13, color: 'var(--text-mid)', margin: '8px 0 16px' }}>
                You can now sign in with your email and password. Your account has been set up as <strong>Team Member</strong> access — contact your administrator if you need a different access level.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => switchTab('signin')}
              >
                Go to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleSignUp}>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Full Name *</label>
                <input
                  value={signupName}
                  onChange={e => setSignupName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Email *</label>
                <input
                  type="email"
                  value={signupEmail}
                  onChange={e => setSignupEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Password *</label>
                <input
                  type="password"
                  value={signupPassword}
                  onChange={e => setSignupPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 6 }}>
                <label>Confirm Password *</label>
                <input
                  type="password"
                  value={signupConfirm}
                  onChange={e => setSignupConfirm(e.target.value)}
                  placeholder="Repeat password"
                  required
                  autoComplete="new-password"
                />
              </div>

              {error && <div style={styles.errorBox}>{error}</div>}

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '11px', marginTop: 12 }}
                disabled={loading}
              >
                {loading ? 'Creating account…' : 'Create Account'}
              </button>

              <p style={styles.hint}>
                New accounts are granted <strong>Team Member</strong> access. An administrator can update your access level after you sign in.
              </p>
            </form>
          )
        )}

        {/* ── Forgot Password ── */}
        {tab === 'forgot' && (
          forgotSent ? (
            <div style={styles.successBox}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>📬</div>
              <strong>Reset email sent!</strong>
              <p style={{ fontSize: 13, color: 'var(--text-mid)', margin: '8px 0 16px' }}>
                Check your inbox for a link to reset your password.
              </p>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => { switchTab('signin'); setForgotSent(false); setForgotEmail('') }}
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <div style={styles.title}>Reset Password</div>
                <p style={{ fontSize: 13, color: 'var(--text-mid)', marginTop: 6, lineHeight: 1.6 }}>
                  Enter your email address and we'll send you a link to set a new password.
                </p>
              </div>
              <form onSubmit={handleForgot}>
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label>Email</label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus
                  />
                </div>
                {error && <div style={styles.errorBox}>{error}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => switchTab('signin')}
                  >Cancel</button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ flex: 1, justifyContent: 'center' }}
                    disabled={loading}
                  >
                    {loading ? 'Sending…' : 'Send Reset Link'}
                  </button>
                </div>
              </form>
            </>
          )
        )}
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight:      '100vh',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    background:     'var(--bg)',
    padding:        '20px',
  },
  card: {
    background:   'var(--surface)',
    border:       '1px solid var(--border)',
    borderRadius: '14px',
    padding:      '36px 32px',
    width:        '100%',
    maxWidth:     '400px',
  },
  header: {
    textAlign:    'center',
    marginBottom: '24px',
  },
  logo: {
    fontSize:     '40px',
    marginBottom: '12px',
  },
  title: {
    fontSize:      '15px',
    fontWeight:    '800',
    letterSpacing: '2.5px',
    color:         'var(--accent)',
    textTransform: 'uppercase',
  },
  sub: {
    fontSize:      '12px',
    color:         'var(--text-dim)',
    marginTop:     '4px',
    letterSpacing: '0.5px',
  },
  tabs: {
    display:      'flex',
    borderBottom: '1px solid var(--border)',
    marginBottom: '20px',
    gap:          0,
  },
  tab: {
    flex:            1,
    padding:         '9px 12px',
    border:          'none',
    borderBottom:    '2px solid transparent',
    background:      'none',
    color:           'var(--text-dim)',
    fontSize:        13,
    fontWeight:      500,
    cursor:          'pointer',
    transition:      'color 0.15s, border-color 0.15s',
    textAlign:       'center',
    marginBottom:    '-1px',
  },
  tabActive: {
    color:           'var(--accent)',
    borderBottomColor: 'var(--accent)',
    fontWeight:      700,
  },
  forgotLink: {
    background:    'none',
    border:        'none',
    color:         'var(--text-dim)',
    fontSize:      12,
    cursor:        'pointer',
    padding:       0,
    textDecoration: 'underline',
    display:       'block',
    marginBottom:  4,
  },
  errorBox: {
    background:   'var(--danger-subtle)',
    border:       '1px solid rgba(239,68,68,0.3)',
    borderRadius: '8px',
    padding:      '10px 14px',
    fontSize:     '13px',
    color:        'var(--danger)',
    marginTop:    12,
    lineHeight:   1.5,
  },
  successBox: {
    background:   'rgba(34,197,94,0.05)',
    border:       '1px solid rgba(34,197,94,0.2)',
    borderRadius: '10px',
    padding:      '20px',
    textAlign:    'center',
    fontSize:     14,
    color:        'var(--text)',
  },
  hint: {
    fontSize:   '12px',
    color:      'var(--text-dim)',
    textAlign:  'center',
    marginTop:  '14px',
    lineHeight: '1.6',
  },
}
