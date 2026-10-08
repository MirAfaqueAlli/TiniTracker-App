'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

export default function ProviderLoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/api/provider/auth/login', { email, password });
      // Store provider session separately from hospital user session
      if (typeof window !== 'undefined') {
        localStorage.setItem('provider_token', res.data.token);
        localStorage.setItem('provider_admin', JSON.stringify(res.data.admin));
        document.cookie = `provider_token=${res.data.token}; path=/; max-age=604800; SameSite=Lax`;
      }
      router.push('/provider/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
    }}>
      <div style={{
        width: '100%', maxWidth: 420, padding: '2.5rem',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '20px',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: 52, height: 52, borderRadius: '14px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            margin: '0 auto 1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5rem', boxShadow: '0 8px 20px rgba(99,102,241,0.4)',
          }}>🛡️</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.02em' }}>
            TiniTracker Provider
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>
            Internal admin portal
          </div>
        </div>

        {error && (
          <div style={{
            marginBottom: '1rem', padding: '0.75rem 1rem',
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '10px', color: '#fca5a5', fontSize: '0.82rem',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '0.4rem' }}>
              Email
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="admin@tinitracker.in" required
              style={{
                width: '100%', padding: '0.7rem 0.9rem', borderRadius: '10px',
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#f8fafc', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '0.4rem' }}>
              Password
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required
              style={{
                width: '100%', padding: '0.7rem 0.9rem', borderRadius: '10px',
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#f8fafc', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <button
            type="submit" disabled={loading}
            style={{
              marginTop: '0.5rem', padding: '0.8rem',
              background: loading ? '#4338ca' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', border: 'none', borderRadius: '10px',
              fontSize: '0.92rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 15px rgba(99,102,241,0.4)',
              transition: 'opacity 0.2s',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in to Provider Panel'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <a href="/login" style={{ fontSize: '0.775rem', color: '#64748b', textDecoration: 'none' }}>
            ← Back to hospital login
          </a>
        </div>
      </div>
    </div>
  );
}
