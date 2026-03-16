import { Navigate, useLocation } from 'react-router-dom';
import { getCustomerUser, hasCustomerToken } from '../../api/client';

export default function CustomerProtectedRoute({ children }) {
  const location = useLocation();
  const role = getCustomerUser()?.role;

  if (!hasCustomerToken()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  if (role && role !== 'customer') {
    return <Navigate to="/login" replace />;
  }

  return children;
}
