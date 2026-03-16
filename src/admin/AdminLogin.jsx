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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a3d2e] to-[#2d5a45]">
      <div className="bg-white p-10 rounded-xl shadow-2xl w-full max-w-[380px]">
        <h1 className="m-0 mb-1 text-[1.75rem] text-[#1a3d2e]">Admin / Rider Login</h1>
        <p className="m-0 mb-6 text-[#5a7a6a] text-[0.95rem]">PlantDelivery secure portal</p>
        <form onSubmit={handleSubmit}>
          <label className="block mb-4 font-medium text-gray-800 text-[0.9rem]">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com or rider@example.com"
              required
              autoComplete="email"
              className="w-full mt-1.5 px-3.5 py-2.5 border border-gray-300 rounded-lg text-base focus:outline-none focus:border-[#2d5a45] focus:ring-2 focus:ring-[#2d5a45]/20"
            />
          </label>
          <label className="block mb-4 font-medium text-gray-800 text-[0.9rem]">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="w-full mt-1.5 px-3.5 py-2.5 border border-gray-300 rounded-lg text-base focus:outline-none focus:border-[#2d5a45] focus:ring-2 focus:ring-[#2d5a45]/20"
            />
          </label>
          {error && (
            <p className="text-red-600 text-sm mb-3">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#2d5a45] text-white border-0 rounded-lg text-base font-semibold cursor-pointer mt-1 disabled:opacity-70 disabled:cursor-not-allowed hover:enabled:bg-[#1a3d2e]"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p className="mt-4 text-sm text-[#5a7a6a]">Admins go to the admin panel. Riders go straight to the rider page.</p>
      </div>
    </div>
  );
}
