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
    <div className="layout" style={{ display: 'flex', justifyContent: 'center' }}>
      <form className="card" style={{ width: 420, display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={stage === 'request' ? request : submitReset}>
        <h2 style={{ margin: 0 }}>{stage === 'request' ? 'Forgot password' : 'Enter OTP & new password'}</h2>
        <label>
          <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Email</div>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        {stage === 'reset' && (
          <>
            <label>
              <div style={{ color: 'var(--muted)', marginBottom: 4 }}>OTP</div>
              <input value={code} onChange={(e) => setCode(e.target.value)} required />
            </label>
            <label>
              <div style={{ color: 'var(--muted)', marginBottom: 4 }}>New password</div>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </label>
          </>
        )}
        {msg && <div style={{ color: 'var(--accent)', fontSize: 14 }}>{msg}</div>}
        {err && <div style={{ color: 'var(--danger)', fontSize: 14 }}>{err}</div>}
        <button className="btn btn-primary" type="submit">
          {stage === 'request' ? 'Send OTP' : 'Reset password'}
        </button>
        <a href="/login" style={{ color: 'var(--accent)', fontSize: 14 }}>Back to login</a>
      </form>
    </div>
  );
}
