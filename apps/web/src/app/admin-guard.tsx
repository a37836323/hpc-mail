import { Navigate, Outlet } from 'react-router-dom';
import { useCurrentUser } from '@/lib/use-session';

export function AdminGuard() {
  const user = useCurrentUser();
  if (user.role !== 'admin') return <Navigate to="/inbox" replace />;
  return <Outlet />;
}
