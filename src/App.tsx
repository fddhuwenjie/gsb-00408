import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from '@/components/Layout';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import ContentCreate from '@/pages/ContentCreate';
import ContentList from '@/pages/ContentList';
import ContentCalendar from '@/pages/ContentCalendar';
import ReviewQueue from '@/pages/ReviewQueue';
import SensitiveWords from '@/pages/SensitiveWords';
import RiskDetails from '@/pages/RiskDetails';
import PublishRecords from '@/pages/PublishRecords';
import ChannelManage from '@/pages/ChannelManage';
import useAuthStore from '@/store/useAuthStore';
import type { UserRole } from '@/types';

const ProtectedRoute = ({ children, roles }: { children: React.ReactNode; roles?: UserRole[] }) => {
  const { isAuthenticated, user } = useAuthStore();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
};

export default function App() {
  const { loadFromStorage, isAuthenticated } = useAuthStore();
  
  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/dashboard" replace />} />
        
        <Route path="/" element={<ProtectedRoute roles={['editor', 'reviewer', 'admin']}><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="content/create" element={<ProtectedRoute roles={['editor', 'admin']}><ContentCreate /></ProtectedRoute>} />
          <Route path="content/list" element={<ContentList />} />
          <Route path="content/calendar" element={<ContentCalendar />} />
          <Route path="review/queue" element={<ProtectedRoute roles={['reviewer', 'admin']}><ReviewQueue /></ProtectedRoute>} />
          <Route path="sensitive/words" element={<ProtectedRoute roles={['admin']}><SensitiveWords /></ProtectedRoute>} />
          <Route path="sensitive/details" element={<ProtectedRoute roles={['reviewer', 'admin']}><RiskDetails /></ProtectedRoute>} />
          <Route path="publish/records" element={<PublishRecords />} />
          <Route path="channels" element={<ProtectedRoute roles={['admin']}><ChannelManage /></ProtectedRoute>} />
        </Route>
        
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}
