export type ActionType = 
  | 'START' 
  | 'CYCLE_RESET' 
  | 'SHOCK' 
  | 'RHYTHM'
  | 'MEDS'
  | 'EPI' 
  | 'AMIO' 
  | 'PROCEDURE'
  | 'AIRWAY' 
  | 'IV' 
  | 'IO'
  | 'VITALS'
  | 'ROSC' 
  | 'STOP' 
  | 'CUSTOM';

export interface LogEvent {
  id: string;
  timeOffset: number; // 距離開始的秒數
  realTime: number; // Date.now() timestamp
  action: ActionType;
  label: string;
  photoUrl?: string;
}
