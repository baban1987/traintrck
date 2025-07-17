// src/pages/TrackingPage.tsx
import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getLocoHistory, findLocoOnFois } from '../api';
import type { HistoryPoint, LocoData } from '../types';

type TimeFilter = '1h' | '6h' | 'all';
const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

const RecenterMap = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => { map.setView(center, map.getZoom()); }, [center, map]);
  return null;
};

export default function TrackingPage() {
  const { locoId } = useParams<{ locoId: string }>();
  const navigate = useNavigate();
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [livePosition, setLivePosition] = useState<LocoData | null>(null);
  const [filteredHistory, setFilteredHistory] = useState<HistoryPoint[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!locoId) {
      setError("No Loco ID provided.");
      setLoading(false);
      return;
    }
    const fetchInitialData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [historyData, firstLivePos] = await Promise.all([
          getLocoHistory(locoId).catch(() => []),
          findLocoOnFois(locoId).catch(() => null)
        ]);
        setHistory(historyData);
        setLivePosition(firstLivePos);
        if (!firstLivePos && historyData.length === 0) {
          setError('No historical or live data could be found for this loco.');
        }
      } catch (err: any) {
        setError(err.response?.data?.message || "An error occurred fetching initial data.");
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, [locoId]);

  useEffect(() => {
    if (!locoId) return;
    const pollInterval = setInterval(async () => {
      try {
        const latestData = await findLocoOnFois(locoId);
        setLivePosition(latestData);
      } catch (error) {
        console.warn("Live polling request to FOIS failed, but that's ok.", error);
      }
    }, 30000);
    return () => clearInterval(pollInterval);
  }, [locoId]);

  useEffect(() => {
    if (history.length === 0) { setFilteredHistory([]); return; }
    const now = new Date();
    const filtered = history.filter(point => {
        const pointDate = new Date(point.timestamp);
        if (timeFilter === '1h') return pointDate.getTime() > now.getTime() - 3600000;
        if (timeFilter === '6h') return pointDate.getTime() > now.getTime() - 21600000;
        return true;
    });
    setFilteredHistory(filtered);
  }, [history, timeFilter]);

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    navigate('/login');
  };

  if (loading) return <div className="text-center p-10 font-semibold text-lg">Loading track...</div>;
  if (error) return <div className="text-center text-red-600 bg-red-100 p-4 m-10 rounded-lg">{error}</div>;

  const currentPosition = livePosition || history[0];
  if (!currentPosition) return <div className="text-center p-10">No data available for this loco.</div>;
  
  const currentCoordinates: [number, number] = [currentPosition.latitude, currentPosition.longitude];
  const trackCoordinates = filteredHistory.map(p => [p.latitude, p.longitude] as [number, number]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <header className="mb-4 flex justify-between items-center">
        <div>
          <Link to="/" className="text-blue-600 hover:underline">← Back to Search</Link>
          <h1 className="text-3xl font-bold text-gray-800 mt-2">Tracking Loco #{locoId}</h1>
          <p className="text-gray-600">Last updated: {new Date(currentPosition.timestamp).toLocaleString()}</p>
        </div>
        <button onClick={handleLogout} className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg">Logout</button>
      </header>

      <div className="flex space-x-2 mb-4">
        <button onClick={() => setTimeFilter('1h')} className={`px-4 py-2 text-sm rounded-md ${timeFilter === '1h' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-200'}`}>Last 1 Hour</button>
        <button onClick={() => setTimeFilter('6h')} className={`px-4 py-2 text-sm rounded-md ${timeFilter === '6h' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-200'}`}>Last 6 Hours</button>
        <button onClick={() => setTimeFilter('all')} className={`px-4 py-2 text-sm rounded-md ${timeFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-200'}`}>Show All</button>
      </div>

      <div className="w-full h-[60vh] md:h-[70vh] rounded-lg shadow-lg overflow-hidden">
        {currentCoordinates[0] !== 0 ? (
          <MapContainer center={currentCoordinates} zoom={13} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
            <TileLayer attribution='© OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {trackCoordinates.length > 0 && <Polyline pathOptions={{ color: '#6c757d', weight: 3 }} positions={trackCoordinates} />}
            {filteredHistory.map((point) => (
              <CircleMarker key={point._id} center={[point.latitude, point.longitude]} pathOptions={{ color: '#28a745', fillColor: '#28a745', fillOpacity: 1 }} radius={4}>
                <Popup><div className="font-sans text-sm"><p><strong>Train:</strong> {point.train_no || 'N/A'}</p><p><strong>Station:</strong> {point.station}</p><p><strong>Speed:</strong> {point.speed} Kmph</p><p><strong>Time:</strong> {new Date(point.timestamp).toLocaleString()}</p></div></Popup>
              </CircleMarker>
            ))}
            <Marker position={currentCoordinates} icon={greenIcon}>
              <Popup>
                <div className="font-sans text-sm">
                  <p className="font-bold text-base mb-1">Current Position {livePosition ? '(Live)' : '(DB)'}</p>
                  {/* --- NEW: Display enriched train number --- */}
                  {currentPosition.train_no && <p><strong>Train:</strong> {currentPosition.train_no}</p>}
                  <p><strong>Station:</strong> {currentPosition.station}</p>
                  <p><strong>Speed:</strong> {currentPosition.speed} Kmph</p>
                  <p><strong>Time:</strong> {new Date(currentPosition.timestamp).toLocaleString()}</p>
                </div>
              </Popup>
            </Marker>
            <RecenterMap center={currentCoordinates} />
          </MapContainer>
        ) : (
          <div className="flex items-center justify-center h-full bg-gray-50 text-gray-500">No valid coordinates to display map.</div>
        )}
      </div>
    </div>
  );
}