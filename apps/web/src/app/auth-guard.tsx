import { Navigate, useLocation } from 'react-router-dom';
import { CurrentUserContext, useAuthToken, useSessionQuery } from '@/lib/use-session';
import { AppShell } from './app-shell';
import { FullScreenLoader } from './page-loader';

export function AuthGuard() {
  const token = useAuthToken();
  const location = useLocation();
  const { data: user, isLoading, isError } = useSessionQuery();

  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (isLoading) return <FullScreenLoader />;
  if (isError || !user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;

  return (
    <CurrentUserContext.Provider value={user}>
      <AppShell />
    </CurrentUserContext.Provider>
  );
}
