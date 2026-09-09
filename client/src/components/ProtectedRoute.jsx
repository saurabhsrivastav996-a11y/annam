import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { PageLoader } from './ui.jsx';

/** Gate for authenticated routes; pass `roles` to restrict further. */
export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader label="Checking your session…" />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold text-stone-800">Not available for your role</h1>
        <p className="mt-2 text-sm text-stone-600">
          This area is for {roles.join(' and ')} accounts. You are signed in as{' '}
          <span className="font-medium">{user.role}</span>.
        </p>
      </div>
    );
  }

  return children;
}
