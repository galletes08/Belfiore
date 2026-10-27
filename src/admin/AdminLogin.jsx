import { useState } from 'react';
import { Link,useNavigate,useLocation } from 'react-router-dom';
import {
  apiLogin,
  saveWorkforceSession,
} from '../api/client';
import { loadAdminPreferences } from '../utils/adminPreferences';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword,setShowPassword] = useState(false);
  const navigate = useNavigate();
  const location=useLocation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await apiLogin(email, password,'staff',location.pathname.startsWith('/rider')?'rider':'admin');
      const role = response.user?.role;
      if (!['admin', 'rider', 'staff'].includes(role)) {
        throw new Error('This login is only for workforce accounts.');
      }

      saveWorkforceSession(response);
      if(role==='staff') {
        navigate('/staff/dashboard',{replace:true});
        return;
      }

      if (role === 'admin') {
        navigate(loadAdminPreferences().startPage, { replace: true });
        return;
      }

      navigate(response.user?.mustChangePassword?'/rider/change-password':'/rider', { replace: true });
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
        <p className="mb-8 mt-2 text-sm leading-6 text-[#687c71]">Sign in with your administrator, operations staff or rider account.</p>
        <form onSubmit={handleSubmit}>
          {location.state?.passwordChanged&&<p role="status" className="mb-4 text-sm text-emerald-800">Password changed. Sign in with your new password.</p>}
          <label className="mb-5 block text-sm font-medium text-[#294b3a]">
            Email or assigned username
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Administrator email or assigned username"
              required
              autoComplete="username"
              className="mt-2 h-12 w-full rounded-xl border border-[#d7e2da] bg-white px-4 text-sm text-[#173d2b] outline-none transition placeholder:text-[#9aa9a1] focus:border-[#4b916d] focus:ring-4 focus:ring-[#4b916d]/10"
            />
          </label>
          <label className="mb-5 block text-sm font-medium text-[#294b3a]">
            Password
            <input
              type={showPassword?'text':'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              className="mt-2 h-12 w-full rounded-xl border border-[#d7e2da] bg-white px-4 text-sm text-[#173d2b] outline-none transition placeholder:text-[#9aa9a1] focus:border-[#4b916d] focus:ring-4 focus:ring-[#4b916d]/10"
            />
          </label>
          <div className="mb-5 -mt-2 flex items-center justify-between gap-3 text-xs text-emerald-800"><button type="button" aria-pressed={showPassword} onClick={()=>setShowPassword(v=>!v)} className="rounded px-1 py-2 underline">{showPassword?'Hide password':'Show password'}</button><Link className="rounded px-1 py-2 underline" to="/forgot-password">Forgot Password?</Link></div>
          {error && (
            <p role="alert" className="mb-4 rounded-xl border border-[#f1c7c1] bg-[#fff2f0] px-3.5 py-3 text-sm text-[#a33d35]">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="h-12 w-full rounded-xl bg-[#176b4d] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(23,107,77,0.22)] transition hover:enabled:bg-[#12573e] focus:outline-none focus:ring-4 focus:ring-[#4b916d]/25 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {loading ? 'Signing in...' : 'Sign in securely'}
          </button>
        </form>
        <p className="mt-4 text-xs text-[#687c71]">Riders and operations staff: contact an authorized administrator for identity verification and password recovery. Email recovery is for administrators only.</p>
        <p className="mt-6 text-center text-xs leading-5 text-[#7b8e84]">Your role automatically determines which workspace opens after sign-in.</p>
      </div>
    </div>
  );
}
