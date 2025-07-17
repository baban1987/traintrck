// src/api.ts
import axios from 'axios';
import type { 
    LoginCredentials, LocoData, TrainData, TrainScheduleData, TrainProfileData, HistoryPoint 
} from './types';

const api = axios.create();

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) { config.headers.Authorization = `Bearer ${token}`; }
    return config;
  },
  (error) => Promise.reject(error)
);

export const loginUser = async (credentials: LoginCredentials): Promise<{ token: string }> => {
    const response = await api.post('/api/login', credentials);
    return response.data;
};

// --- All functions below use the authenticated 'api' instance ---

// For the old train search using our database
export const findTrainInData = async (trainId: string): Promise<TrainData> => {
  const response = await api.get(`/api/search/train/${trainId}`);
  return response.data;
};

// For finding a loco in the scheduled train list (old API)
export const findLocoByTrainAndDate = async (trainId: string, searchDate: string): Promise<TrainScheduleData | undefined> => {
  const response = await api.get<TrainScheduleData[]>('/api/train-schedules');
  const allSchedules = response.data;
  const monthMap: { [key: string]: string } = {'Jan':'01','Feb':'02','Mar':'03','Apr':'04','May':'05','Jun':'06','Jul':'07','Aug':'08','Sep':'09','Oct':'10','Nov':'11','Dec':'12'};
  const result = allSchedules.find(schedule => {
    if (schedule.train_no.toString() !== trainId) return false;
    const parts = schedule.start_date.split(' ');
    if (parts.length !== 3) return false;
    const apiDateAsYYYYMMDD = `20${parts[2]}-${monthMap[parts[1]]}-${parts[0].padStart(2, '0')}`;
    return apiDateAsYYYYMMDD === searchDate;
  });
  return result;
};

// For getting the full train profile (old API)
export const getTrainProfile = async (trainId: string, searchDate: string): Promise<TrainProfileData> => {
    const response = await api.get(`/api/train-profile/${trainId}`, { params: { date: searchDate } });
    return response.data;
};

// For getting historical data for the track line from our DB
export const getLocoHistory = async (locoId: string): Promise<HistoryPoint[]> => {
    const response = await api.get(`/api/loco/history/${locoId}`);
    return response.data;
};

// --- NEW --- For getting LIVE loco data from the FOIS API
export const findLocoOnFois = async (locoId: string): Promise<LocoData> => {
  const response = await api.get(`/api/fois/loco/${locoId}`);
  return response.data;
};

export default api;