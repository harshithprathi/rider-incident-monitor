import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline, AppBar, Toolbar, Typography, Button, Box } from '@mui/material';
import { AuthProvider, useAuth } from '../features/auth';
import { LoginPage } from '../features/auth';
import { IncidentListPage } from '../features/incidents';
import { IncidentDetailsPage } from '../features/incidents';
import { RiderDashboardPage } from '../features/safe-return';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRole?: string }> = ({ children, allowedRole }) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRole && user?.role !== allowedRole) {
    // Redirect unauthorized roles back to their default dashboards
    return <Navigate to={user?.role === 'RIDER' ? '/rider-dashboard' : '/incidents'} replace />;
  }

  return <>{children}</>;
};

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user, logout } = useAuth();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {isAuthenticated && (
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              Rider Incident Monitor
            </Typography>
            <Typography variant="body2" sx={{ mr: 2 }}>
              {user?.name} ({user?.role})
            </Typography>
            <Button color="inherit" onClick={logout}>
              Logout
            </Button>
          </Toolbar>
        </AppBar>
      )}
      <Box component="main" sx={{ flexGrow: 1 }}>
        {children}
      </Box>
    </Box>
  );
};

const HomeRedirect: React.FC = () => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={user?.role === 'RIDER' ? '/rider-dashboard' : '/incidents'} replace />;
};

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <AppLayout>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/incidents"
                element={
                  <ProtectedRoute allowedRole="RESPONDER">
                    <IncidentListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/incidents/:id"
                element={
                  <ProtectedRoute allowedRole="RESPONDER">
                    <IncidentDetailsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/rider-dashboard"
                element={
                  <ProtectedRoute allowedRole="RIDER">
                    <RiderDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/" element={<HomeRedirect />} />
            </Routes>
          </AppLayout>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
