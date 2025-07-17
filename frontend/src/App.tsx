import { Routes, Route } from 'react-router-dom';
import SearchPage from './pages/SearchPage';
import TrackingPage from './pages/TrackingPage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';

// Import Leaflet's CSS globally
import 'leaflet/dist/leaflet.css';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <Routes>
        {/* Public login route */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes */}
        <Route 
          path="/" 
          element={<ProtectedRoute><SearchPage /></ProtectedRoute>} 
        />
        <Route 
          path="/track/:locoId" 
          element={<ProtectedRoute><TrackingPage /></ProtectedRoute>} 
        />
      </Routes>
    </div>
  );
}