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
    <div className="layout centered-shell">
      <form className="card auth-card" onSubmit={submit}>
        <div className="auth-header">
          <div className="auth-icon">♟️</div>
          <h2 className="text-gradient">
            {mode === 'login' ? 'Welcome Back' : mode === 'forgot-password' ? 'Reset Password' : 'Recover Username'}
          </h2>
          <p className="page-subtitle">
            {mode === 'login'
              ? 'Sign in to continue your chess journey'
              : mode === 'forgot-password'
                ? 'We will help you reset your password'
                : 'We will help you recover your username'}
          </p>
        </div>

        {mode === 'login' ? (
          <>
            <label>
              <div>Email or username</div>
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
            </label>
            <label>
              <div>Password</div>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
              <button
                type="button"
                onClick={() => setMode('forgot-password')}
                className="link-inline"
                style={{ background: 'none', border: 'none', padding: 0 }}
              >
                Forgot Password?
              </button>
              <button
                type="button"
                onClick={() => setMode('forgot-username')}
                className="link-inline"
                style={{ background: 'none', border: 'none', padding: 0 }}
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
                  <div>Email or username</div>
                  <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
                </label>
                <div className="form-note">We will send an OTP to your email if the account exists.</div>
              </>
            ) : (
              <>
                <div className="form-message form-message--info">OTP sent to {email}. Please check your email.</div>
                <label>
                  <div>Enter OTP</div>
                  <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit code" maxLength={6} required />
                </label>
              </>
            )}
            <button
              type="button"
              onClick={resetMode}
              className="link-inline"
              style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', fontSize: 13 }}
            >
              ← Back to login
            </button>
          </>
        ) : (
          <>
            {!otpSent ? (
              <>
                <label>
                  <div>Email</div>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </label>
                <div className="form-note">We will send an OTP to verify your email if the account exists.</div>
              </>
            ) : (
              <>
                <div className="form-message form-message--info">OTP sent to {email}. Please check your email.</div>
                <label>
                  <div>Enter OTP</div>
                  <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit code" maxLength={6} required />
                </label>
              </>
            )}
            <button
              type="button"
              onClick={resetMode}
              className="link-inline"
              style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', fontSize: 13 }}
            >
              ← Back to login
            </button>
          </>
        )}

        {error && <div className="form-message form-message--error">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={loading} style={{ fontSize: 16, padding: '14px 28px', fontWeight: 700 }}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
        {mode === 'login' && (
          <div className="form-note" style={{ textAlign: 'center' }}>
            Not the first time? <a href="#/register" className="link-inline">Register</a>
          </div>
        )}
      </form>
    </div>
  );
}
