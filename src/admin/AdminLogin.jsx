import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  apiLogin,
  setAdminUser,
  setRiderToken,
  setRiderUser,
  setToken,
} from '../api/client';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await apiLogin(email, password);
      const role = response.user?.role;
      if (!['admin', 'rider'].includes(role)) {
        throw new Error('This login is only for admin or rider accounts.');
      }

      const { token } = response;

      if (role === 'admin') {
        setAdminUser(response.user || null);
        setToken(token);
        navigate('/admin', { replace: true });
        return;
      }

      setRiderUser(response.user || null);
      setRiderToken(token);
      navigate('/rider', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed. Check email and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0f3225] px-4 py-10">
      <div className="relative w-full max-w-[440px] rounded-[2rem] border border-white/10 bg-[#fffef9] p-7 shadow-[0_30px_90px_rgba(0,0,0,0.35)] sm:p-10">
        <h1 className="m-0 text-3xl font-semibold tracking-tight text-[#173d2b]">Welcome back</h1>
        <p className="mb-8 mt-2 text-sm leading-6 text-[#687c71]">Sign in with your admin or rider account to continue.</p>
        <form onSubmit={handleSubmit}>
          <label className="mb-5 block text-sm font-medium text-[#294b3a]">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@belfiore.com"
              required
              autoComplete="email"
              className="mt-2 h-12 w-full rounded-xl border border-[#d7e2da] bg-white px-4 text-sm text-[#173d2b] outline-none transition placeholder:text-[#9aa9a1] focus:border-[#4b916d] focus:ring-4 focus:ring-[#4b916d]/10"
            />
          </label>
          <label className="mb-5 block text-sm font-medium text-[#294b3a]">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              className="mt-2 h-12 w-full rounded-xl border border-[#d7e2da] bg-white px-4 text-sm text-[#173d2b] outline-none transition placeholder:text-[#9aa9a1] focus:border-[#4b916d] focus:ring-4 focus:ring-[#4b916d]/10"
            />
          </label>
          {error && (
            <p className="mb-4 rounded-xl border border-[#f1c7c1] bg-[#fff2f0] px-3.5 py-3 text-sm text-[#a33d35]">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="h-12 w-full rounded-xl bg-[#176b4d] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(23,107,77,0.22)] transition hover:enabled:bg-[#12573e] focus:outline-none focus:ring-4 focus:ring-[#4b916d]/25 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {loading ? 'Signing in...' : 'Sign in securely'}
          </button>
        </form>
        <p className="mt-6 text-center text-xs leading-5 text-[#7b8e84]">Your role automatically determines which workspace opens after sign-in.</p>
      </div>
    </div>
  );
}
