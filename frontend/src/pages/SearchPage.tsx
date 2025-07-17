// src/pages/SearchPage.tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { findLocoOnFois, findTrainInData, findLocoByTrainAndDate, getTrainProfile } from '../api';
import type { LocoData, TrainScheduleData, TrainProfileData } from '../types';

export default function SearchPage() {
  const navigate = useNavigate();
  const [locoInput, setLocoInput] = useState('');
  const [trainInput, setTrainInput] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveResult, setLiveResult] = useState<LocoData | null>(null);
  const [scheduleResult, setScheduleResult] = useState<TrainScheduleData | null>(null);
  const [profileResult, setProfileResult] = useState<TrainProfileData | null>(null);

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    navigate('/login');
  };

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!locoInput && !trainInput) {
      setError('Please enter a Loco or Train number.');
      return;
    }
    setLoading(true);
    setError(null);
    setLiveResult(null);
    setScheduleResult(null);
    setProfileResult(null);
    try {
      if (locoInput) {
        // Use the new, official FOIS API for direct loco searches
        const result = await findLocoOnFois(locoInput);
        setLiveResult(result);
      } else if (trainInput && dateInput) {
        // Train schedule search remains the same (uses old API)
        const [schedule, profile] = await Promise.all([
          findLocoByTrainAndDate(trainInput, dateInput),
          getTrainProfile(trainInput, dateInput).catch(() => null)
        ]);
        if (!schedule) {
          setError('Could not find an assigned locomotive for this train on the specified date.');
        } else {
          setScheduleResult(schedule);
        }
        if (profile && profile.trainCurrentPosition) {
          setProfileResult(profile);
        } else {
          setProfileResult(null);
          if (schedule) {
            setError("Successfully found assigned loco, but could not retrieve the train's full running status.");
          }
        }
      } else if (trainInput) {
        // Live train search remains the same (uses our DB)
        const result = await findTrainInData(trainInput);
        setLiveResult(result);
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'An unknown error occurred.';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center p-4 sm:p-8">
      <div className="w-full max-w-4xl">
        <header className="text-center mb-8 relative">
          <h1 className="text-4xl sm:text-5xl font-bold text-blue-800">Tracker</h1>
          <p className="text-gray-600 mt-2">Track live positions or find a train's full running status.</p>
          <button onClick={handleLogout} className="absolute top-0 right-0 bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg">Logout</button>
        </header>

        <main className="bg-white p-6 rounded-xl shadow-lg">
          <form onSubmit={handleSearch}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <input type="number" placeholder="Enter Loco Number..." value={locoInput} onChange={(e) => { setLocoInput(e.target.value); setTrainInput(''); setDateInput(''); }} disabled={!!trainInput || loading} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-200" />
              <input type="number" placeholder="Enter Train Number..." value={trainInput} onChange={(e) => { setTrainInput(e.target.value); setLocoInput(''); }} disabled={!!locoInput || loading} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-200" />
            </div>
            <div className="mb-4">
               <label className="block text-sm font-medium text-gray-500 mb-1" htmlFor="date-input">Optional: Add date for schedule/status</label>
               <input id="date-input" type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} disabled={!trainInput || loading} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-200" />
            </div>
            <button type="submit" disabled={loading || (!locoInput && !trainInput)} className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300">
              {loading ? 'Searching...' : 'Search'}
            </button>
          </form>
        </main>
        
        <div className="mt-8">
            {loading && <div className="text-center text-gray-600">Loading...</div>}
            {error && <div className={`text-center p-4 rounded-lg ${error.includes('Successfully found') ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-600'}`}>{error}</div>}
            {liveResult && <LiveResultTable data={liveResult} />}
            {scheduleResult && <CombinedResultView scheduleData={scheduleResult} profileData={profileResult} />}
        </div>
      </div>
    </div>
  );
}

const CombinedResultView = ({ scheduleData, profileData }: { scheduleData: TrainScheduleData, profileData: TrainProfileData | null }) => {
    const hasValidProfile = profileData && profileData.trainCurrentPosition;
    return (
        <div className="bg-white p-6 rounded-xl shadow-lg animate-fade-in space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">
                    Train #{scheduleData.train_no}
                    {hasValidProfile ? ` - ${profileData.trainCurrentPosition["Train Name"]}` : ''}
                </h2>
                {hasValidProfile && <p className="text-md text-red-600 font-semibold">{profileData.trainCurrentPosition["Train Status/Last Location"]}</p>}
            </div>
            <div>
                <h3 className="text-xl font-bold text-gray-700 mb-3 border-b pb-2">Assigned Locomotive Details</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-4">
                    <DetailItem label="Assigned Loco" value={<Link to={`/track/${scheduleData.loco_no}`} className="text-blue-600 hover:underline"><strong>{scheduleData.loco_no}</strong></Link>} />
                    <DetailItem label="Loco Type" value={scheduleData.type} />
                    <DetailItem label="Base Shed" value={scheduleData.base_shed} />
                    <DetailItem label="Owning Railway" value={scheduleData.owning_rly} />
                </div>
            </div>
            {hasValidProfile && profileData.etaTable && (
                <div>
                    <h3 className="text-xl font-bold text-gray-700 mb-3 border-b pb-2">Route Information</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-600">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                                <tr>
                                    <th className="px-4 py-3">#</th>
                                    <th className="px-4 py-3">Station</th>
                                    <th className="px-4 py-3">Arrival</th>
                                    <th className="px-4 py-3">Departure</th>
                                    <th className="px-4 py-3">PF</th>
                                </tr>
                            </thead>
                            <tbody>
                                {profileData.etaTable.map(station => (
                                    <tr key={station['Sr.']} className={`border-b ${station['Has Arrived ?'] === 'Yes' ? 'bg-green-50' : 'bg-white'}`}>
                                        <td className="px-4 py-2">{station['Sr.']}</td>
                                        <td className="px-4 py-2 font-medium text-gray-900">{station['Station Name']} ({station['Station']})</td>
                                        <td className="px-4 py-2">{station['ETA'] || 'Source'}<br/><span className="text-red-500">{station['Delay Arrival']}</span></td>
                                        <td className="px-4 py-2">{station['ETD'] || 'Dest.'}<br/><span className="text-red-500">{station['Delay Departure']}</span></td>
                                        <td className="px-4 py-2">{station['PF']}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

const DetailItem = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div><p className="text-sm font-medium text-gray-500">{label}</p><div className="text-lg font-semibold text-gray-900">{value}</div></div>
);

const LiveResultTable = ({ data }: { data: LocoData }) => (
  <div className="bg-white p-6 rounded-xl shadow-lg animate-fade-in"><h2 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">Latest Live Position Found:<Link to={`/track/${data.loco_no}`} className="text-blue-600 hover:underline ml-2">Loco #{data.loco_no}</Link></h2><div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4"><DetailItem label="Assigned Train" value={data.train_no || 'N/A'} /><DetailItem label="Last Seen Station" value={data.station} /><DetailItem label="Speed" value={`${data.speed} Kmph`} /><DetailItem label="Last Update Time" value={new Date(data.timestamp).toLocaleString()} /></div></div>
);