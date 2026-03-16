import { Navigate, useLocation } from 'react-router-dom';
import { getAdminUser, hasToken } from '../api/client';

export default function AdminProtectedRoute({ children }) {
  const location = useLocation();

  if (!hasToken()) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  if (getAdminUser()?.role !== 'admin') {
    return <Navigate to="/login" replace />;
  }

  return children;
}
