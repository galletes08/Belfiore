import { Navigate, useLocation } from 'react-router-dom';
import { hasRiderRole, hasRiderToken,getRiderUser } from '../api/client';

export default function RiderProtectedRoute({ children }) {
  const location = useLocation();

  if (!hasRiderToken()) {
    return <Navigate to="/rider/login" state={{ from: location }} replace />;
  }

  if (!hasRiderRole('rider')) {
    return <Navigate to="/admin" replace />;
  }

  if(getRiderUser()?.mustChangePassword&&location.pathname!=='/rider/change-password')return <Navigate to="/rider/change-password" replace/>;
  return children;
}
