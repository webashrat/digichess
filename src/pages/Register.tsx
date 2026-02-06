import { FormEvent, useEffect, useState } from 'react';
import { register, verifyOTP, resendOTP } from '../api/auth';
import { CountrySelect } from '../components/CountrySelect';
import { setHashRoute } from '../utils/hashNavigate';

export default function Register() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('INTERNATIONAL');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpMsg, setOtpMsg] = useState('');

  const formatError = (err: any): string => {
    if (!err?.response?.data) {
      return 'Registration failed. Please try again.';
    }
    
    const data = err.response.data;
    
    // Handle string error message
    if (typeof data.detail === 'string') {
      return data.detail;
    }
    
    // Handle field-specific validation errors (DRF format)
    if (typeof data === 'object') {
      const errors: string[] = [];
      
      // Check for common field errors
      if (data.email) {
        errors.push(Array.isArray(data.email) ? data.email.join(', ') : data.email);
      }
      if (data.username) {
        errors.push(Array.isArray(data.username) ? data.username.join(', ') : data.username);
      }
      if (data.password) {
        errors.push(Array.isArray(data.password) ? data.password.join(', ') : data.password);
      }
      if (data.country) {
        errors.push(Array.isArray(data.country) ? data.country.join(', ') : data.country);
      }
      
      // Check for non-field errors
      if (data.non_field_errors) {
        errors.push(...(Array.isArray(data.non_field_errors) ? data.non_field_errors : [data.non_field_errors]));
      }
      
      if (errors.length > 0) {
        return errors.join('. ');
      }
    }
    
    return 'Registration failed. Please check your input and try again.';
  };

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 3000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    register({ email, username, password, country })
      .then((res) => {
        setOtpSent(true);
        setOtpMsg(res?.message || 'OTP sent. Verify to activate.');
      })
      .catch((err) => setError(formatError(err)));
  };

  const handleVerify = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    verifyOTP({ email, code: otpCode })
      .then((res) => {
        if (res?.token) {
          localStorage.setItem('token', res.token);
          window.dispatchEvent(new Event('auth-changed'));
        }
        setOtpMsg('Verified! Redirecting...');
        setHashRoute('/');
      })
      .catch((err) => setError(err.response?.data?.detail || 'Invalid or expired code'));
  };

  const handleResend = () => {
    resendOTP({ email })
      .then((res) => setOtpMsg(res?.message || 'OTP resent'))
      .catch((err) => setError(err.response?.data?.detail || 'Could not resend OTP'));
  };

  return (
    <div className="layout centered-shell">
      <form className="card auth-card" onSubmit={submit}>
        <div className="auth-header">
          <div className="auth-icon">♟️</div>
          <h2 className="text-gradient">Join DigiChess</h2>
          <p className="page-subtitle">Create your account and start playing chess</p>
        </div>
        <label>
          <div>Email</div>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          <div>Username</div>
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          <div>Password</div>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={password === '' ? 'min 8 characters' : ''}
              required
              minLength={8}
              style={{ paddingRight: '72px' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="btn btn-ghost btn-xs"
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)'
              }}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>
        <label>
          <div>Country (optional)</div>
          <CountrySelect value={country} onChange={setCountry} />
        </label>
        {error && <div className="form-message form-message--error">{error}</div>}
        {otpSent && <div className="form-message form-message--info">{otpMsg}</div>}
        {!otpSent && (
          <button className="btn btn-primary" type="submit" style={{ fontSize: 16, padding: '14px 28px', fontWeight: 700 }}>
            Register
          </button>
        )}
        {otpSent && (
          <div className="stack-sm" style={{ marginTop: 8 }}>
            <label>
              <div>Enter OTP</div>
              <input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} required />
            </label>
            <button className="btn btn-success" onClick={handleVerify} style={{ fontSize: 16, padding: '14px 28px', fontWeight: 700 }}>
              Verify OTP
            </button>
            <button className="btn btn-warning btn-sm" type="button" onClick={handleResend}>
              Resend OTP
            </button>
          </div>
        )}
        <div className="form-note" style={{ textAlign: 'center' }}>
          Already have an account?{' '}
          <button type="button" onClick={() => setHashRoute('/login')} className="link-inline" style={{ background: 'none', border: 'none', padding: 0 }}>
            Log in
          </button>
        </div>
      </form>
    </div>
  );
}
