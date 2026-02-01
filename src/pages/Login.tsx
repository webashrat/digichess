import { FormEvent, useEffect, useState } from 'react';
import { login, forgotPassword, forgotUsername, verifyForgotOTP } from '../api/auth';
import { setHashRoute } from '../utils/hashNavigate';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'forgot-password' | 'forgot-username'>('login');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 3000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    if (mode === 'login') {
      // Determine if identifier is email or username
      const isEmail = identifier.includes('@');
      const payload = isEmail 
        ? { email: identifier, password }
        : { username: identifier, password };
      
      login(payload)
        .then((res) => {
          if (res?.token) {
            localStorage.setItem('token', res.token);
            window.dispatchEvent(new Event('auth-changed'));
          }
          setHashRoute('/');
        })
        .catch((err) => {
          const errorMsg = err.response?.data?.detail || err.response?.data?.email?.[0] || err.response?.data?.username?.[0] || 'Login failed';
          setError(errorMsg);
          setLoading(false);
        });
    } else if (mode === 'forgot-password') {
      if (!otpSent) {
        // Send OTP
        const isEmail = identifier.includes('@');
        const payload = isEmail 
          ? { email: identifier }
          : { username: identifier };
        
        forgotPassword(payload)
          .then((res) => {
            setOtpSent(true);
            // Backend returns the email in the response
            if (res?.email) {
              setEmail(res.email);
            } else if (isEmail) {
              setEmail(identifier.toLowerCase());
            }
            // In development, auto-fill OTP if provided
            if (res?.otp) {
              setOtp(res.otp);
            }
            setLoading(false);
          })
          .catch((err) => {
            const errorMsg = err.response?.data?.detail || err.response?.data?.email?.[0] || err.response?.data?.username?.[0] || 'Failed to send OTP';
            setError(errorMsg);
            setLoading(false);
          });
      } else {
        // Verify OTP and log in
        verifyForgotOTP({ email, code: otp })
          .then((res) => {
            if (res?.token) {
              localStorage.setItem('token', res.token);
              window.dispatchEvent(new Event('auth-changed'));
            }
            setHashRoute('/');
          })
          .catch((err) => {
            const errorMsg = err.response?.data?.detail || 'Invalid or expired OTP';
            setError(errorMsg);
            setLoading(false);
          });
      }
    } else if (mode === 'forgot-username') {
      if (!otpSent) {
        // Send OTP
        forgotUsername({ email })
          .then((res) => {
            setOtpSent(true);
            // In development, auto-fill OTP if provided
            if (res?.otp) {
              setOtp(res.otp);
            }
            setLoading(false);
          })
          .catch((err) => {
            const errorMsg = err.response?.data?.detail || err.response?.data?.email?.[0] || 'Failed to send OTP';
            setError(errorMsg);
            setLoading(false);
          });
      } else {
        // Verify OTP and log in
        verifyForgotOTP({ email, code: otp })
          .then((res) => {
            if (res?.token) {
              localStorage.setItem('token', res.token);
              window.dispatchEvent(new Event('auth-changed'));
            }
            setHashRoute('/');
          })
          .catch((err) => {
            const errorMsg = err.response?.data?.detail || 'Invalid or expired OTP';
            setError(errorMsg);
            setLoading(false);
          });
      }
    }
  };

  const resetMode = () => {
    setMode('login');
    setOtpSent(false);
    setError(null);
    setIdentifier('');
    setPassword('');
    setEmail('');
    setOtp('');
  };

  return (
    <div className="layout" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 100px)', padding: 20 }}>
      <form className="card" style={{ 
        width: '100%', 
        maxWidth: 440, 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 16,
        background: 'linear-gradient(160deg, rgba(22, 32, 54, 0.95), rgba(12, 18, 32, 0.98))',
        border: '1px solid rgba(44, 230, 194, 0.2)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
      }} onSubmit={submit}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>♟️</div>
          <h2 style={{ 
            margin: 0, 
            fontSize: 28,
            fontWeight: 800,
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            {mode === 'login' ? 'Welcome Back' : mode === 'forgot-password' ? 'Reset Password' : 'Recover Username'}
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 8, marginBottom: 0 }}>
            {mode === 'login' ? 'Sign in to continue your chess journey' : mode === 'forgot-password' ? 'We\'ll help you reset your password' : 'We\'ll help you recover your username'}
          </p>
        </div>
        
        {mode === 'login' ? (
          <>
            <label>
              <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Email or username</div>
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
            </label>
            <label>
              <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Password</div>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
              <button
                type="button"
                onClick={() => setMode('forgot-password')}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                Forgot Password?
              </button>
              <button
                type="button"
                onClick={() => setMode('forgot-username')}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                Forgot Username?
              </button>
            </div>
          </>
        ) : mode === 'forgot-password' ? (
          <>
            {!otpSent ? (
              <>
                <label>
                  <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Email or username</div>
                  <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
                </label>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  We'll send an OTP to your email if the account exists.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 14, color: 'var(--accent)', marginBottom: 8 }}>
                  OTP sent to {email}. Please check your email.
                </div>
                <label>
                  <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Enter OTP</div>
                  <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit code" maxLength={6} required />
                </label>
              </>
            )}
            <button type="button" onClick={resetMode} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, textAlign: 'left', padding: 0 }}>
              ← Back to login
            </button>
          </>
        ) : (
          <>
            {!otpSent ? (
              <>
                <label>
                  <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Email</div>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </label>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  We'll send an OTP to verify your email if the account exists.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 14, color: 'var(--accent)', marginBottom: 8 }}>
                  OTP sent to {email}. Please check your email.
                </div>
                <label>
                  <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Enter OTP</div>
                  <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit code" maxLength={6} required />
                </label>
              </>
            )}
            <button type="button" onClick={resetMode} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, textAlign: 'left', padding: 0 }}>
              ← Back to login
            </button>
          </>
        )}
        
        {error && <div style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={loading} style={{ fontSize: 16, padding: '14px 28px', fontWeight: 700 }}>
          🚀 {loading ? 'Logging in...' : 'Login'}
        </button>
        {mode === 'login' && (
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
            Not the first time? <a href="#/register" style={{ color: 'var(--accent)' }}>Register</a>
          </div>
        )}
      </form>
    </div>
  );
}
