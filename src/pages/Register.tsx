import { FormEvent, useState } from 'react';
import { register, verifyOTP, resendOTP } from '../api/auth';
import { CountrySelect } from '../components/CountrySelect';

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
        errors.push(`Email: ${Array.isArray(data.email) ? data.email.join(', ') : data.email}`);
      }
      if (data.username) {
        errors.push(`Username: ${Array.isArray(data.username) ? data.username.join(', ') : data.username}`);
      }
      if (data.password) {
        errors.push(`Password: ${Array.isArray(data.password) ? data.password.join(', ') : data.password}`);
      }
      if (data.country) {
        errors.push(`Country: ${Array.isArray(data.country) ? data.country.join(', ') : data.country}`);
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
        if (res?.token) localStorage.setItem('token', res.token);
        setOtpMsg('Verified! Redirecting...');
        window.location.href = '/';
      })
      .catch((err) => setError(err.response?.data?.detail || 'Invalid or expired code'));
  };

  const handleResend = () => {
    resendOTP({ email })
      .then((res) => setOtpMsg(res?.message || 'OTP resent'))
      .catch((err) => setError(err.response?.data?.detail || 'Could not resend OTP'));
  };

  return (
    <div className="layout" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 100px)', padding: 20 }}>
      <form className="card" style={{ 
        width: '100%', 
        maxWidth: 460, 
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
            Join DigiChess
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 8, marginBottom: 0 }}>
            Create your account and start playing chess
          </p>
        </div>
        <label>
          <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Email</div>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Username</div>
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Password</div>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={password === '' ? 'min 8 characters' : ''}
              required
              minLength={8}
              style={{ paddingRight: '50px', width: '100%', boxSizing: 'border-box' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--muted)',
                cursor: 'pointer',
                padding: '4px 8px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 500
              }}
              title={showPassword ? 'Hide password' : 'Show password'}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--muted)';
              }}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>
        <label>
          <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Country (optional)</div>
          <CountrySelect value={country} onChange={setCountry} />
        </label>
        {error && (
          <div style={{ 
            color: 'var(--danger)', 
            fontSize: 14, 
            padding: '10px', 
            background: 'rgba(239, 83, 80, 0.1)', 
            border: '1px solid var(--danger)', 
            borderRadius: '4px',
            marginTop: '4px'
          }}>
            {error}
          </div>
        )}
        {otpSent && <div style={{ color: 'var(--accent)', fontSize: 14 }}>{otpMsg}</div>}
        {!otpSent && <button className="btn btn-purple" type="submit" style={{ fontSize: 16, padding: '14px 28px', fontWeight: 700 }}>✨ Register</button>}
        {otpSent && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <label>
              <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Enter OTP</div>
              <input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} required />
            </label>
            <button className="btn btn-success" onClick={handleVerify} style={{ fontSize: 16, padding: '14px 28px', fontWeight: 700 }}>✓ Verify OTP</button>
            <button className="btn btn-warning" type="button" onClick={handleResend} style={{ fontSize: 14, padding: '10px 20px' }}>🔄 Resend OTP</button>
          </div>
        )}
        <a href="/login" style={{ color: 'var(--accent)', fontSize: 14 }}>Already have an account? Log in</a>
      </form>
    </div>
  );
}
