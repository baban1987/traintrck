// src/types.ts

// For the login form
export interface LoginCredentials {
    username?: string;
    password?: string;
}

// For the live tracking map page
export interface HistoryPoint {
  _id: string; 
  latitude: number;
  longitude: number;
  speed: number;
  event: string;
  station: string;
  timestamp: string; 
}

// For the live tracking search result
export interface LocoData {
  loco_no: number;
  train_no: number | null;
  latitude: number;
  longitude: number;
  station: string;
  speed: number;
  event: string;
  timestamp: string;
}
export type TrainData = LocoData; 

// For the loco schedule search result
export interface TrainScheduleData {
  train_no: number;
  loco_no: number;
  type: string;
  base_shed: string;
  owning_rly: string;
  start_date: string;
  division: string;
}

// For the full train profile status
export interface TrainCurrentPosition {
    "Train Name": string;
    "Last Station/Location": string;
    "Train Status/Last Location": string;
}

// For a single entry in the train's route table
export interface EtaTableEntry {
    "Sr.": string;
    "Station": string;
    "Station Name": string;
    "STA": string;
    "ETA": string;
    "Has Arrived ?": string;
    "Delay Arrival": string;
    "STD": string;
    "ETD": string;
    "Has Departed ?": string;
    "Delay Departure": string;
    "PF": string;
}

// For the complete train profile response
export interface TrainProfileData {
    trainCurrentPosition: TrainCurrentPosition;
    etaTable: EtaTableEntry[];
}