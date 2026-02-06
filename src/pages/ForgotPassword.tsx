import { FormEvent, useEffect, useState } from 'react';
import { forgotPassword, resetPassword } from '../api/auth';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [stage, setStage] = useState<'request' | 'reset'>('request');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!err) return;
    const timer = window.setTimeout(() => setErr(''), 3000);
    return () => window.clearTimeout(timer);
  }, [err]);

  const request = (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    forgotPassword({ email })
      .then((res) => {
        setMsg(res?.message || 'OTP sent to email');
        setStage('reset');
      })
      .catch((error) => setErr(error.response?.data?.detail || 'Failed to send OTP'));
  };

  const submitReset = (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    resetPassword({ email, code, new_password: newPassword })
      .then((res) => setMsg(res?.message || 'Password reset, check your email for username if needed'))
      .catch((error) => setErr(error.response?.data?.detail || 'Reset failed'));
  };

  return (
    <div className="layout centered-shell">
      <form className="card auth-card" onSubmit={stage === 'request' ? request : submitReset}>
        <div className="auth-header">
          <div className="auth-icon">🔐</div>
          <h2 className="text-gradient">{stage === 'request' ? 'Forgot password' : 'Reset your password'}</h2>
          <p className="page-subtitle">
            {stage === 'request' ? 'We will send an OTP to your email.' : 'Enter the OTP and choose a new password.'}
          </p>
        </div>
        <label>
          <div>Email</div>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        {stage === 'reset' && (
          <>
            <label>
              <div>OTP</div>
              <input value={code} onChange={(e) => setCode(e.target.value)} required />
            </label>
            <label>
              <div>New password</div>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </label>
          </>
        )}
        {msg && <div className="form-message form-message--info">{msg}</div>}
        {err && <div className="form-message form-message--error">{err}</div>}
        <button className="btn btn-primary" type="submit">
          {stage === 'request' ? 'Send OTP' : 'Reset password'}
        </button>
        <a href="#/login" className="link-inline" style={{ fontSize: 14 }}>
          Back to login
        </a>
      </form>
    </div>
  );
}
