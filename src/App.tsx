import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, Zap, Syringe, Wind, ActivitySquare, HeartPulse, Volume2, VolumeX, SquareSquare, List,
  Heart, Minus, Waves, Stethoscope, Plus, Droplet, Bone, Camera, Clock, RefreshCcw, Pencil, Eye, Thermometer, Sun, Moon, Brain, ChevronUp, ChevronDown
} from 'lucide-react';
import { ActionType, LogEvent } from './types';
import { formatTime, cn, vibrate } from './utils';
import { setMetronome } from './audio';
import { Summary } from './components/Summary';

declare const __APP_VERSION__: string;

type AppState = 'START' | 'RUNNING' | 'SUMMARY';

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div onClick={onClose} className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
    <div onClick={(e) => e.stopPropagation()} className="bg-gray-900 border border-gray-700 rounded-3xl w-full max-w-sm shadow-2xl shadow-black overflow-hidden relative flex flex-col mx-auto max-h-[90dvh] animate-in slide-in-from-bottom-8 duration-300 ease-out">
      <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-gray-950 shrink-0">
        <h3 className="text-xl font-bold text-white tracking-wide">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white pb-1 px-2 text-3xl leading-none">&times;</button>
      </div>
      <div className="p-5 flex flex-col gap-3 overflow-y-auto">
        {children}
      </div>
    </div>
  </div>
);

export default function App() {
  const [appState, setAppState] = useState<AppState>('START');
  const [isHighContrast, setIsHighContrast] = useState(false);

  useEffect(() => {
    if (isHighContrast) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }
  }, [isHighContrast]);

  const [startTime, setStartTime] = useState<number | null>(null);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [cycleStartTime, setCycleStartTime] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [firstRhythmTime, setFirstRhythmTime] = useState<number | null>(null);
  const [lastEpi, setLastEpi] = useState<number | null>(null);
  const [activeModal, setActiveModal] = useState<'NONE' | 'RHYTHM' | 'MEDS' | 'PROCEDURES' | 'VITALS' | 'INFO' | 'HISTORY' | 'OHCA' | 'END_CONFIRM'>('NONE');
  const [vitalInputType, setVitalInputType] = useState<string | null>(null);
  const [vitalValue, setVitalValue] = useState('');
  const [textInputType, setTextInputType] = useState<string | null>(null);
  const [ventMode, setVentMode] = useState<'6S' | '30:2' | 'OFF'>('30:2');
  const [ventStartTime, setVentStartTime] = useState<number | null>(null);
  const [isROSC, setIsROSC] = useState(false);
  const [roscStartTime, setRoscStartTime] = useState<number | null>(null);
  const [historySymptoms, setHistorySymptoms] = useState<string[]>([]);
  const [historyConditions, setHistoryConditions] = useState<string[]>([]);
  const [globalCallTime, setGlobalCallTime] = useState<string>('');
  const [emtContactTime, setEmtContactTime] = useState<string>('');
  const [successfulRecognition, setSuccessfulRecognition] = useState(false);
  const [bystanderCPR, setBystanderCPR] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const wakeLockRef = useRef<any>(null);
  const endPressTimer = useRef<NodeJS.Timeout | null>(null);
  const endPressInterval = useRef<NodeJS.Timeout | null>(null);
  const [endPressProgress, setEndPressProgress] = useState(0);

  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isResetHolding, setIsResetHolding] = useState(false);

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch (err) {}
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && appState === 'RUNNING') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [appState]);

  const ttsState = useRef({
    cycleStart: null as number | null,
    cycle15: false,
    cycle5: false,
    cycle0: false,
    lastMissedRhythm: null as number | null,
    epiStart: null as number | null,
    epi180: false,
    epi240: false,
    epi300: false,
    lastMissedEpi: null as number | null,
    ventPause: false,
    amioAlarmActive: false,
    lastAmioAlarmTime: null as number | null,
  });

  const closeModal = () => {
    setActiveModal('NONE');
    setVitalInputType(null);
    setTextInputType(null);
    setVitalValue('');
  };

  const lastVentId = useRef<string | number>(-1);

  // Tick every second to update UI
  useEffect(() => {
    if (appState !== 'RUNNING' || isROSC) return;
    const interval = setInterval(() => {
      const currentNow = Date.now();
      setNow(currentNow);


      if (ttsState.current.cycleStart !== cycleStartTime) {
        ttsState.current.cycleStart = cycleStartTime;
        ttsState.current.cycle15 = false;
        ttsState.current.cycle5 = false;
        ttsState.current.cycle0 = false;
      }

      if (cycleStartTime) {
        const cElapsed = Math.floor((currentNow - cycleStartTime) / 1000);
        const cRemain = 120 - cElapsed;
        if (cRemain <= 15 && cRemain > 5 && !ttsState.current.cycle15) {
          speak("十五秒後分析"); ttsState.current.cycle15 = true;
        }
        if (cRemain <= 5 && cRemain > 0 && !ttsState.current.cycle5) {
          speak("五秒後分析"); ttsState.current.cycle5 = true;
        }
        if (cRemain <= 0) {
          if (!ttsState.current.cycle0) {
            speak("兩分鐘到，檢查脈搏", 1.1, 'MALE'); 
            ttsState.current.cycle0 = true;
            setMetronome(false, 110);
            setActiveModal('RHYTHM');
            ttsState.current.lastMissedRhythm = currentNow;
          } else {
            if (ttsState.current.lastMissedRhythm && (currentNow - ttsState.current.lastMissedRhythm) >= 10000) {
              speak("檢查脈搏與心律", 1.1, 'MALE');
              ttsState.current.lastMissedRhythm = currentNow;
            }
          }
        }
      }

      const cycleRemainingSecs = cycleStartTime ? 120 - Math.floor((currentNow - cycleStartTime) / 1000) : 0;

      if (ventMode !== 'OFF' && ventStartTime && cycleRemainingSecs > 0) {
        const elapsedMs = currentNow - ventStartTime;
        if (ventMode === '6S') {
          const cycleDuration = metronomeOn ? (60000 / 110) * 10 : 6000;
          const cycleIndex = Math.floor(elapsedMs / cycleDuration);
          const cycleMs = elapsedMs % cycleDuration;
          
          if (metronomeOn) {
            const beatDuration = 60000 / 110;
            const beatIndex = Math.floor(cycleMs / beatDuration);
            if (beatIndex >= 4 && beatIndex <= 9) {
              const countNum = beatIndex + 1;
              const id = `6s-c-${cycleIndex}-${countNum}`;
              if (lastVentId.current !== id) {
                speak(countNum.toString());
                lastVentId.current = id;
              }
            } else if (beatIndex === 0 && cycleIndex > 0) {
              const id = `6s-v-${cycleIndex}`;
              if (lastVentId.current !== id) {
                speak("通氣", 0.75); // slower rate to span ~1 second
                lastVentId.current = id;
              }
            }
          } else {
            if (cycleIndex > 0 && cycleIndex.toString() !== lastVentId.current) {
              speak("通氣", 0.75);
              lastVentId.current = cycleIndex.toString();
            }
          }
        } else if (ventMode === '30:2') {
          const compTime = metronomeOn ? (60000 / 110) * 30 : 16000;
          const ventPauseTime = 4000;
          const totalCycleTime = compTime + ventPauseTime;
          const cycleMs = elapsedMs % totalCycleTime;
          const cycleCount = Math.floor(elapsedMs / totalCycleTime);
          
          if (metronomeOn && cycleMs < compTime) {
            const beatDuration = 60000 / 110;
            const beatIndex = Math.floor(cycleMs / beatDuration);
            if (beatIndex >= 24 && beatIndex <= 29) {
              const countNum = beatIndex + 1;
              const id = `30:2-c-${cycleCount}-${countNum}`;
              if (lastVentId.current !== id) {
                const speakText = countNum === 25 ? "二五" :
                                  countNum === 26 ? "二六" :
                                  countNum === 27 ? "二七" :
                                  countNum === 28 ? "二八" :
                                  countNum === 29 ? "二九" :
                                  countNum === 30 ? "三十" : countNum.toString();
                speak(speakText);
                lastVentId.current = id;
              }
            }
          }
          
          if (cycleMs >= compTime && cycleMs < compTime + 2000) {
            const id = `30:2-v1-${cycleCount}`;
            if (lastVentId.current !== id) {
               speak("通氣", 0.75); // slower rate to span ~1 second
              setMetronome(false, 110);
              ttsState.current.ventPause = true;
              lastVentId.current = id;
            }
          } else if (cycleMs >= compTime + 2000 && cycleMs < compTime + 4000) {
            const id = `30:2-v2-${cycleCount}`;
            if (lastVentId.current !== id) {
              speak("通氣", 0.75);
              lastVentId.current = id;
            }
          } else if (cycleMs < compTime && ttsState.current.ventPause) {
            if (metronomeOn) setMetronome(true, 110);
            ttsState.current.ventPause = false;
          }
        }
      }

      const currentEpiRefTime = lastEpi || firstRhythmTime;

      if (currentEpiRefTime && ttsState.current.epiStart !== currentEpiRefTime) {
        ttsState.current.epiStart = currentEpiRefTime;
        ttsState.current.epi180 = false;
        ttsState.current.epi240 = false;
        ttsState.current.epi300 = false;
        ttsState.current.lastMissedEpi = null;
      }

      if (currentEpiRefTime && lastEpi !== null) {
        const eElapsed = Math.floor((currentNow - currentEpiRefTime) / 1000);
        if (eElapsed >= 180 && eElapsed < 240 && !ttsState.current.epi180) {
          speak("建議給予 Epinephrine", 1.1, 'MALE'); ttsState.current.epi180 = true;
        }
        if (eElapsed >= 240 && eElapsed < 300 && !ttsState.current.epi240) {
          speak("距離給予 Epinephrine 已超過四分鐘", 1.1, 'MALE'); ttsState.current.epi240 = true;
        }
        if (eElapsed >= 300) {
          if (!ttsState.current.epi300) {
            speak("警告，Epinephrine 已超過五分鐘未給予", 1.1, 'MALE'); ttsState.current.epi300 = true;
            ttsState.current.lastMissedEpi = currentNow;
          } else {
            if (ttsState.current.lastMissedEpi && (currentNow - ttsState.current.lastMissedEpi) >= 30000) {
              speak("請盡快給予Epinephrine", 1.1, 'MALE');
              ttsState.current.lastMissedEpi = currentNow;
            }
          }
        }
      }

      // Calculate Amio Alarm State
      const _hasIVIO = logs.some(l => l.action === 'IV' || l.action === 'IO');
      const _hasEpi = logs.some(l => l.action === 'EPI');
      const _shocksCount = logs.filter(l => l.action === 'SHOCK').length;
      const _amiosCount = logs.filter(l => l.action === 'AMIO').length;
      
      let _showAmioReminder = false;
      if (!isROSC && _amiosCount < 2) {
        if (_amiosCount === 0) {
          if ((_hasIVIO || _hasEpi) && _shocksCount >= 2) _showAmioReminder = true;
        } else if (_amiosCount === 1) {
          const firstAmioTime = logs.filter(l => l.action === 'AMIO')[0].realTime;
          const shocksAfterFirstAmio = logs.filter(l => l.action === 'SHOCK' && l.realTime > firstAmioTime).length;
          if (shocksAfterFirstAmio >= 1) _showAmioReminder = true;
        }
      }

      if (_showAmioReminder && _hasEpi) {
         if (!ttsState.current.amioAlarmActive) {
            speak("應給予Amiodarone", 1.1);
            ttsState.current.amioAlarmActive = true;
            ttsState.current.lastAmioAlarmTime = currentNow;
         } else {
            if (ttsState.current.lastAmioAlarmTime && currentNow - ttsState.current.lastAmioAlarmTime >= 30000) {
              speak("請盡速給予Amiodarone", 1.1);
              vibrate([500, 200, 500]);
              ttsState.current.lastAmioAlarmTime = currentNow;
            }
         }
      } else {
         ttsState.current.amioAlarmActive = false;
      }
    }, 100);
    return () => clearInterval(interval);
  }, [appState, cycleStartTime, lastEpi, startTime, isROSC, ventMode, ventStartTime, metronomeOn, firstRhythmTime, logs]);

  const logEvent = (action: ActionType, label: string, photoUrl?: string) => {
    switch(action) {
      case 'SHOCK': vibrate([100, 50, 100]); break;
      case 'EPI': case 'AMIO': vibrate([80, 50, 80]); break;
      case 'ROSC': vibrate([150, 100, 150, 100, 150]); break;
      case 'PROCEDURE': case 'AIRWAY': case 'IV': case 'IO': vibrate([60, 40, 60]); break;
      default: vibrate(50); break;
    }
    const currentNow = Date.now();
    const offset = startTime ? Math.floor((currentNow - startTime) / 1000) : 0;
    
    setLogs(prev => [...prev, {
      id: crypto.randomUUID(),
      timeOffset: offset,
      realTime: currentNow,
      action,
      label,
      photoUrl
    }]);

    if (action === 'EPI') setLastEpi(currentNow);
    if (['RHYTHM', 'SHOCK', 'ROSC', 'CYCLE_RESET'].includes(action)) {
      setFirstRhythmTime(prev => prev || currentNow);
    }
  };

  const removeLog = (id: string) => {
    vibrate(50);
    setLogs(prev => {
      const newLogs = prev.filter(l => l.id !== id);
      const lastEpiLog = [...newLogs].reverse().find(l => l.action === 'EPI');
      setLastEpi(lastEpiLog ? lastEpiLog.realTime : null);
      const firstRhythmLog = newLogs.find(l => ['RHYTHM', 'SHOCK', 'ROSC', 'CYCLE_RESET'].includes(l.action));
      setFirstRhythmTime(firstRhythmLog ? firstRhythmLog.realTime : null);
      return newLogs;
    });
  };

  const logIVIOEvent = (action: ActionType, label: string) => {
    vibrate(50);
    const currentNow = Date.now();
    let realTime = currentNow;
    
    setLogs(prev => {
      const newLogs = [...prev];
      const lastIndex = newLogs.length - 1;
      let offset = startTime ? Math.floor((currentNow - startTime) / 1000) : 0;
      let insertIndex = newLogs.length;

      if (lastIndex >= 0 && (newLogs[lastIndex].action === 'EPI' || newLogs[lastIndex].action === 'AMIO')) {
        const medLog = newLogs[lastIndex];
        realTime = medLog.realTime - 1;
        offset = Math.max(0, medLog.timeOffset);
        insertIndex = lastIndex;
      }
      
      const newLog = {
        id: crypto.randomUUID(),
        timeOffset: offset,
        realTime,
        action,
        label,
      };
      
      newLogs.splice(insertIndex, 0, newLog);
      return newLogs;
    });
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (typeof event.target?.result === 'string') {
          logEvent('VITALS', '拍攝照片', event.target.result);
          setActiveModal('NONE');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const speak = (msg: string, rate: number = 1.1, voiceType: 'DEFAULT' | 'MALE' = 'DEFAULT') => {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(msg);
      u.lang = 'zh-TW';
      u.rate = rate;
      if (voiceType === 'MALE') {
        const voices = window.speechSynthesis.getVoices();
        const maleVoice = voices.find(v => v.lang.includes('zh') && (v.name.toLowerCase().includes('male') || v.name.includes('男')));
        if (maleVoice) u.voice = maleVoice;
      }
      window.speechSynthesis.speak(u);
    }
  };

  const handleStart = () => {
    // Unlock Web Speech API on mobile Safari by speaking an empty utterance during a user gesture
    if ('speechSynthesis' in window) {
      const unlockUtterance = new SpeechSynthesisUtterance('');
      unlockUtterance.volume = 0;
      window.speechSynthesis.speak(unlockUtterance);
    }

    const currentNow = Date.now();
    setStartTime(currentNow);
    setCycleStartTime(currentNow);
    setNow(currentNow);
    
    const newLogs: LogEvent[] = [{
      id: crypto.randomUUID(),
      timeOffset: 0,
      realTime: currentNow,
      action: 'START',
      label: '開始急救 (CPR Started)'
    }];

    if (successfulRecognition && globalCallTime) {
      const [hours, minutes] = globalCallTime.split(':').map(Number);
      const callTimeDate = new Date();
      callTimeDate.setHours(hours, minutes, 0, 0);
      const recognitionTime = callTimeDate.getTime() + 60000;
      newLogs.push({
        id: crypto.randomUUID(),
        timeOffset: Math.floor((recognitionTime - currentNow) / 1000),
        realTime: recognitionTime,
        action: 'VITALS',
        label: '紀錄 - 成功辨識 (報案+1分)'
      });
    } else if (successfulRecognition) {
      const recognitionTime = currentNow + 60000;
      newLogs.push({
        id: crypto.randomUUID(),
        timeOffset: 60,
        realTime: recognitionTime,
        action: 'VITALS',
        label: '紀錄 - 成功辨識 (+1分)'
      });
    }

    if (bystanderCPR) {
      newLogs.push({
        id: crypto.randomUUID(),
        timeOffset: 0,
        realTime: currentNow,
        action: 'VITALS',
        label: '紀錄 - OHCA - 有旁人CPR'
      });
    }

    newLogs.push({
      id: crypto.randomUUID(),
      timeOffset: 0,
      realTime: currentNow,
      action: 'VITALS',
      label: '紀錄 - OHCA - 未使用PAD去顫'
    });

    setLogs(newLogs);
    setAppState('RUNNING');
    setMetronomeOn(true);
    setMetronome(true, 110);
    setVentMode('30:2');
    setVentStartTime(currentNow);
    requestWakeLock();
    vibrate([100]);
  };

  const handleToggleVent = () => {
    vibrate(50);
    if (ventMode === '6S') {
      setVentMode('30:2');
      setVentStartTime(Date.now());
    } else if (ventMode === '30:2') {
      setVentMode('OFF');
      setVentStartTime(null);
      if (ttsState.current.ventPause && metronomeOn) {
        setMetronome(true, 110);
      }
      ttsState.current.ventPause = false;
    } else {
      setVentMode('6S');
      setVentStartTime(Date.now());
    }
  };

  const handleToggleMetronome = () => {
    vibrate(50);
    const nextState = !metronomeOn;
    setMetronomeOn(nextState);
    setMetronome(nextState, 110);
  };

  const handleCycleReset = () => {
    vibrate(50);
    const currentNow = Date.now();
    setCycleStartTime(currentNow);
    if (ventStartTime) setVentStartTime(currentNow);
    logEvent('CYCLE_RESET', '分析心律 / 迴圈重置');
  };

  const startResetHold = () => {
    vibrate(50);
    setIsResetHolding(true);
    resetTimerRef.current = setTimeout(() => {
      handleCycleReset();
      setIsResetHolding(false);
    }, 1000);
  };

  const stopResetHold = () => {
    setIsResetHolding(false);
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  };

  const handleROSC = () => {
    logEvent('ROSC', '恢復循環 (ROSC)');
    setIsROSC(true);
    setRoscStartTime(Date.now());
    setMetronomeOn(false);
    setMetronome(false, 110);
    setActiveModal('VITALS');
  };

  const handleReArrest = () => {
    if (roscStartTime) {
      const pauseDur = Date.now() - roscStartTime;
      setStartTime(prev => prev! + pauseDur);
      setCycleStartTime(prev => prev! + pauseDur);
      if (lastEpi) setLastEpi(prev => prev + pauseDur);
    }
    
    setIsROSC(false);
    setRoscStartTime(null);
    logEvent('ROSC', '再度OHCA (Re-arrest)'); 
    setMetronomeOn(true);
    setMetronome(true, 110);
  };

  const handleRhythmSelected = (action: ActionType, label: string) => {
    if (action === 'ROSC') { 
      closeModal(); 
      handleROSC(); 
      return; 
    }
    logEvent(action, label);
    
    const currentNow = Date.now();
    
    if (!isROSC) {
       setCycleStartTime(currentNow);
       if (ventStartTime) setVentStartTime(currentNow);
       if (metronomeOn) setMetronome(true, 110);
    }
    closeModal();
  };

  const confirmEnd = () => {
    logEvent('STOP', '結束急救 (End Resuscitation)');
    setAppState('SUMMARY');
    setEndTime(Date.now());
    setMetronomeOn(false);
    setMetronome(false);
    setVentMode('OFF');
    closeModal();
    releaseWakeLock();
    vibrate([100, 50, 100]);
  };

  const handleEndPointerDown = () => {
    setEndPressProgress(0);
    const sTime = Date.now();
    endPressInterval.current = setInterval(() => {
      const elapsed = Date.now() - sTime;
      setEndPressProgress(Math.min(100, (elapsed / 3000) * 100));
    }, 50);

    endPressTimer.current = setTimeout(() => {
      if (endPressInterval.current) clearInterval(endPressInterval.current);
      setEndPressProgress(100);
      setActiveModal('END_CONFIRM');
      vibrate([200]);
    }, 3000) as any;
  };

  const handleEndPointerUpOrLeave = () => {
    if (endPressTimer.current) {
      clearTimeout(endPressTimer.current);
      endPressTimer.current = null;
    }
    if (endPressInterval.current) {
      clearInterval(endPressInterval.current);
      endPressInterval.current = null;
    }
    setEndPressProgress(0);
  };

  const handleFullReset = () => {
    setAppState('START');
    setLogs([]);
    setStartTime(null);
    setEndTime(null);
    setCycleStartTime(null);
    setFirstRhythmTime(null);
    setLastEpi(null);
    setBystanderCPR(false);
    setSuccessfulRecognition(false);
    setGlobalCallTime('');
    setEmtContactTime('');
    setHistorySymptoms([]);
    setHistoryConditions([]);
    setIsROSC(false);
    setRoscStartTime(null);
  };

  // Calculations for UI
  const totalElapsed = startTime ? Math.floor((now - startTime) / 1000) : 0;
  const cycleElapsed = cycleStartTime ? Math.floor((now - cycleStartTime) / 1000) : 0;
  const cycleRemaining = Math.max(0, 120 - cycleElapsed);
  
  let ventProgress = 0;
  let isVentLast5 = false;
  if (ventMode !== 'OFF' && ventStartTime) {
    const elapsedMs = now - ventStartTime;
    if (ventMode === '6S') {
      const cycleTime = metronomeOn ? (60000 / 110) * 10 : 6000;
      const cycleMs = elapsedMs % cycleTime;
      ventProgress = (cycleMs / cycleTime) * 100;
      isVentLast5 = metronomeOn ? (cycleMs >= (60000 / 110) * 5) : (cycleMs >= 3000);
    } else if (ventMode === '30:2') {
      const compTime = metronomeOn ? (60000 / 110) * 30 : 16000;
      const totalTime = compTime + 4000;
      const cycleMs = elapsedMs % totalTime;
      ventProgress = (cycleMs / totalTime) * 100;
      isVentLast5 = metronomeOn ? (cycleMs >= (60000 / 110) * 25) : (cycleMs >= 16000 - 2727);
    }
  }
  const ventElapsed = ventStartTime ? Math.floor((now - ventStartTime) / 1000) : 0;

  const epiRefTime = lastEpi || firstRhythmTime;
  const epiElapsed = epiRefTime ? Math.floor((now - epiRefTime) / 1000) : null;
  const isEpiReady = !isROSC && (!epiRefTime || epiElapsed! >= 180); // 3 minutes

  const showEpiWarning = !isROSC && epiElapsed !== null && epiElapsed >= 180 && epiElapsed < 240;
  const showEpiCritical = !isROSC && epiElapsed !== null && epiElapsed >= 240;

  const amiosCount = logs.filter(l => l.action === 'AMIO').length;
  const isAmioMax = amiosCount >= 2;
  const hasIVIO = logs.some(l => l.action === 'IV' || l.action === 'IO');
  const hasEpi = logs.some(l => l.action === 'EPI');
  const shocksCount = logs.filter(l => l.action === 'SHOCK').length;
  
  let showAmioReminder = false;
  if (!isROSC && !isAmioMax) {
    if (amiosCount === 0) {
      if ((hasIVIO || hasEpi) && shocksCount >= 2) {
        showAmioReminder = true;
      }
    } else if (amiosCount === 1) {
      const firstAmioTime = logs.filter(l => l.action === 'AMIO')[0].realTime;
      const shocksAfterFirstAmio = logs.filter(l => l.action === 'SHOCK' && l.realTime > firstAmioTime).length;
      if (shocksAfterFirstAmio >= 1) {
        showAmioReminder = true;
      }
    }
  }

  const isCycleCritical = cycleRemaining === 0;
  const isCycleWarning = cycleRemaining > 0 && cycleRemaining <= 15;

  const ohcaWitness = logs.slice().reverse().find(l => l.label.includes('OHCA - 有目擊') || l.label.includes('OHCA - 無目擊'))?.label;
  const ohcaBystander = logs.slice().reverse().find(l => l.label.includes('OHCA - 有旁人CPR') || l.label.includes('OHCA - 無旁人CPR'))?.label;
  const ohcaPAD = logs.slice().reverse().find(l => l.label.includes('OHCA - 有使用PAD去顫') || l.label.includes('OHCA - 未使用PAD去顫'))?.label;
  const ohcaLastNormal = logs.slice().reverse().find(l => l.action === 'VITALS' && (l.label.includes('最後正常時間') || l.label.includes('最後正常時間不詳')))?.label;

  if (appState === 'START') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white p-6 font-sans relative">
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={() => setIsHighContrast(!isHighContrast)}
            className={cn(
              "p-2 rounded-full font-bold transition-all shadow-inner active:scale-95 border",
              isHighContrast
                ? "bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border-indigo-200 hover:border-indigo-300"
                : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20 hover:border-amber-500/40"
            )}
            title="切換高對比模式"
          >
            {isHighContrast ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>
        </div>
        <HeartPulse className="w-32 h-32 text-red-500 animate-pulse mb-8" />
        <h1 className="text-4xl font-bold tracking-wider mb-3">ResusFlow｜復流</h1>
        <p className="text-gray-400 text-lg mb-16 text-center max-w-sm">
          供專業救護人員使用，包含壓胸與通氣節拍器、給藥倒數及病人評估紀錄。
        </p>
        <button
          onClick={handleStart}
          className="w-full max-w-md py-6 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-3xl text-3xl font-bold shadow-2xl shadow-red-900/50 transition-all active:scale-95 mb-6"        >
          開始急救
        </button>
        <div className="flex flex-col items-center gap-2 w-full max-w-md bg-gray-900 p-4 rounded-2xl border border-gray-800">
           <label className="text-gray-400 text-sm font-bold">報案時間 (選填)</label>
           <input 
             type="time" 
             value={globalCallTime}
             onChange={e => setGlobalCallTime(e.target.value)}
             className="w-full bg-gray-950 text-white text-xl px-4 py-3 rounded-xl border border-gray-700 text-center"
           />
           <div className="flex gap-3 w-full mt-2">
             <button
               onClick={() => setSuccessfulRecognition(!successfulRecognition)}
               className={cn(
                 "flex-1 py-3 rounded-xl font-bold transition-all border",
                 successfulRecognition ? "bg-indigo-600 border-indigo-500 text-white" : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700"
               )}
             >
               成功辨識
             </button>
             <button
               onClick={() => setBystanderCPR(!bystanderCPR)}
               className={cn(
                 "flex-1 py-3 rounded-xl font-bold transition-all border",
                 bystanderCPR ? "bg-teal-600 border-teal-500 text-white" : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700"
               )}
             >
               有旁人CPR
             </button>
           </div>
        </div>
        <div className="mt-8 text-center text-gray-500 text-sm font-medium tracking-wide">
          <p>Created by Denny Wang, Paramedic</p>
          <p className="opacity-60">{__APP_VERSION__}</p>
        </div>
      </div>
    );
  }

  if (appState === 'SUMMARY') {
    return (
      <Summary 
        logs={logs} 
        startTime={startTime} 
        endTime={endTime} 
        historySymptoms={historySymptoms} 
        historyConditions={historyConditions} 
        globalCallTime={globalCallTime} 
        setGlobalCallTime={setGlobalCallTime} 
        emtContactTime={emtContactTime}
        setEmtContactTime={setEmtContactTime}
        onReset={handleFullReset} 
        logEvent={logEvent} 
        speak={speak} 
        isHighContrast={isHighContrast}
        setIsHighContrast={setIsHighContrast}
      />
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] w-full md:max-w-5xl mx-auto bg-gray-950 text-white overflow-hidden shadow-2xl relative">
      {/* Left / Top Panel */}
      <div className={cn(
        "flex flex-col flex-shrink-0 w-full md:w-1/2 md:border-r border-gray-800 md:h-full overflow-y-auto pb-4 transition-all duration-300",
        "flex-none md:flex-1"
      )}>
        {/* Header Panel */}
        <header className="flex items-center justify-between p-4 bg-gray-900 border-b border-gray-800 sticky top-0 z-10 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-red-500" />
          <div>
            <div className="text-xs text-gray-400 font-medium tracking-wide">總急救時間 {isROSC && "(暫停)"}</div>
            <div className={cn("text-2xl font-bold font-mono tracking-wider tabular-nums", isROSC && "text-green-400 animate-pulse")}>{formatTime(totalElapsed)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsHighContrast(!isHighContrast)}
            className={cn(
              "p-2 rounded-full font-bold transition-all shadow-inner active:scale-95 border",
              isHighContrast
                ? "bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border-indigo-200 hover:border-indigo-300"
                : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20 hover:border-amber-500/40"
            )}
            title="切換高對比模式"
          >
            {isHighContrast ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>
          <button
            onClick={handleToggleVent}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-full font-bold transition-colors shadow-inner text-sm",
              ventMode !== 'OFF' ? "bg-teal-900/40 text-teal-400 border border-teal-800" : "bg-gray-800 text-gray-400 border border-gray-700"
            )}
          >
            <Wind className="w-4 h-4" />
            {ventMode === '6S' ? '6秒' : ventMode === '30:2' ? '30:2' : '關閉'}
          </button>
          <button
            onClick={handleToggleMetronome}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-full font-bold transition-colors shadow-inner text-sm",
              metronomeOn ? "bg-red-900/40 text-red-400 border border-red-800" : "bg-gray-800 text-gray-400 border border-gray-700"
            )}
          >
            {metronomeOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            CPR
          </button>
        </div>
      </header>

      {/* Hero: 2 Min Cycle Timer */}
      <div className="flex items-center justify-center py-4 shrink-0 relative bg-gradient-to-b from-gray-950 to-gray-900 overflow-hidden text-center">
        <div 
          className={cn(
            "absolute inset-y-0 left-0 transition-all duration-1000 ease-linear z-0",
             isCycleCritical ? "bg-red-600/40" :
             isCycleWarning ? "bg-red-500/30" : "bg-blue-500/20"
          )} 
          style={{ width: `${Math.min(100, Math.max(0, ((120 - cycleRemaining) / 120) * 100))}%` }}
        />
        <div className="flex items-center gap-4 relative z-10">
          <div 
            className={cn(
              "text-[5rem] md:text-8xl font-black font-mono tracking-tighter tabular-nums transition-colors duration-300 drop-shadow-md",
              isCycleCritical ? "text-red-500 animate-pulse scale-110" : 
              isCycleWarning ? "text-red-500 font-black animate-pulse" : "text-white"
            )}
          >
            {formatTime(cycleRemaining)}
          </div>
          <button
            onPointerDown={startResetHold}
            onPointerUp={stopResetHold}
            onPointerLeave={stopResetHold}
            onContextMenu={(e) => e.preventDefault()}
            className={cn(
              "px-4 py-4 rounded-full font-bold shadow-xl transition-all flex items-center justify-center border relative overflow-hidden select-none",
              isCycleCritical 
                ? "bg-red-600 hover:bg-red-500 text-white border-red-500 shadow-red-900/50 animate-bounce" 
                : "bg-gray-800 hover:bg-gray-700 text-gray-400 border-gray-700",
              isResetHolding ? "scale-95" : ""
            )}
            style={{ touchAction: 'none' }}
          >
            <div 
              className={cn(
                "absolute inset-0 bg-white/20 rounded-full z-0",
                isResetHolding ? "scale-100 transition-transform duration-1000 ease-linear" : "scale-0 transition-none"
              )}
            />
            <RefreshCcw className="w-5 h-5 relative z-10" />
          </button>
        </div>
      </div>

      {/* Action Grid */}
      <div className="flex flex-col gap-2 p-2 shrink-0 bg-gray-950">
        <button
          onClick={() => setActiveModal('MEDS')}
          className={cn(
            "flex flex-col items-center justify-center p-4 border rounded-2xl transition-all active:scale-95 min-h-[100px] relative overflow-hidden w-full",
            showAmioReminder ? "border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)] animate-pulse" :
            showEpiCritical ? "border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse text-red-100" :
            showEpiWarning ? "border-orange-500 text-orange-100" :
            isEpiReady 
              ? "border-blue-800/50 hover:bg-blue-900/50 text-blue-100" 
              : "border-gray-700 text-gray-400 opacity-80"
          )}
        >
          <div 
             className={cn(
                "absolute inset-y-0 left-0 transition-all duration-1000 ease-linear opacity-40 z-0",
                epiElapsed === null ? "bg-transparent" :
                epiElapsed <= 180 ? "bg-gray-500" :
                epiElapsed <= 240 ? "bg-orange-500" :
                "bg-red-600"
             )} 
             style={{ width: `${epiElapsed !== null ? Math.min((epiElapsed / 300) * 100, 100) : 0}%` }}
          />

          <Syringe className={cn("w-8 h-8 mb-2 z-10", 
            showAmioReminder ? "text-indigo-400" : 
            showEpiCritical ? "text-red-400" : 
            showEpiWarning ? "text-orange-400" : 
            isEpiReady ? "text-blue-400" : "text-gray-300"
          )} />
          <span className={cn("font-bold text-lg z-10", showAmioReminder ? "text-indigo-200" : showEpiCritical ? "text-red-200" : showEpiWarning ? "text-orange-200" : "text-white")}>急救藥物</span>
          
          <div className="absolute font-mono bottom-1 w-full text-center text-[11px] font-medium flex flex-col gap-0.5 pointer-events-none z-10">
            {!isEpiReady && epiElapsed !== null && !showAmioReminder && !showEpiCritical && !showEpiWarning ? (
              <span className="text-gray-400 opacity-80">Epi {formatTime(epiElapsed)}前</span>
            ) : null}
            {(showEpiCritical || showEpiWarning) && !showAmioReminder ? (
                 <span className={cn(showEpiCritical ? "text-red-300" : "text-orange-300")}>
                    超越 {Math.floor(epiElapsed! / 60)} 分鐘
                 </span>
            ) : null}
            {isEpiReady && !showEpiWarning && !showEpiCritical && !showAmioReminder ? (
               <span className="text-blue-300">建議 Epi</span>
            ) : null}
            {showAmioReminder && (
               <span className="text-indigo-300 font-bold tracking-wider">提醒: Amio</span>
            )}
          </div>
        </button>

        <button
          onClick={() => setActiveModal('PROCEDURES')}
          className={cn(
            "relative overflow-hidden flex flex-col items-center justify-center p-4 border rounded-2xl text-teal-100 transition-colors active:scale-95 min-h-[100px] w-full",
            isHighContrast ? "border-teal-500 bg-teal-950/20 hover:bg-teal-950/30 font-black" : "border-teal-900/50 hover:bg-teal-900/40"
          )}
        >
          {ventMode !== 'OFF' && ventStartTime && (
            <div 
              className={cn(
                 "absolute inset-y-0 left-0 transition-all duration-105 ease-linear opacity-30 z-0",
                 isVentLast5 ? "bg-teal-500" : "bg-gray-500"
              )} 
              style={{ width: `${Math.min(100, Math.max(0, ventProgress))}%` }}
            />
          )}
          <Plus className="w-8 h-8 text-teal-400 mb-2 z-10" />
          <span className="font-bold text-lg z-10">處置</span>
        </button>

        <div className="grid grid-cols-2 gap-3 w-full">
          <button
            onClick={() => setActiveModal('RHYTHM')}
            className={cn(
              "relative overflow-hidden flex flex-col items-center justify-center p-4 border rounded-2xl text-red-100 transition-all active:scale-95 min-h-[100px]",
              !firstRhythmTime
                ? (isHighContrast ? "border-red-500 bg-red-900 text-white font-black ring-4 ring-red-500 animate-pulse" : "border-red-500 bg-red-950/80 shadow-[0_0_20px_rgba(239,68,68,0.7)] animate-pulse ring-2 ring-red-500/40")
                : (isHighContrast ? "border-red-500 bg-red-950/20 hover:bg-red-950/30 font-black" : "bg-red-900/20 border-red-900/50 hover:bg-red-900/40")
            )}
          >
            <HeartPulse className={cn("w-8 h-8 mb-1 z-10", !firstRhythmTime ? "text-red-400 scale-110 animate-bounce" : "text-red-500")} />
            <span className="font-bold text-lg z-10">心律判讀</span>
            {!firstRhythmTime ? (
              <span className="text-xs text-red-100 mt-1 bg-red-600/90 px-2.5 py-1 rounded-full border border-red-400 font-bold animate-pulse z-10 shadow-lg shadow-red-950">
                🚨 請記錄初始心律
              </span>
            ) : shocksCount > 0 ? (
              <span className="text-xs text-red-200 mt-1 bg-red-950/50 px-2 py-0.5 rounded-full border border-red-800 font-bold z-10">
                已電擊 {shocksCount} 次
              </span>
            ) : null}
          </button>

          <button
            onClick={() => setActiveModal('VITALS')}
            className={cn(
              "flex flex-col items-center justify-center p-4 border rounded-2xl text-indigo-100 transition-colors active:scale-95 min-h-[100px]",
              isHighContrast ? "border-indigo-500 bg-indigo-950/20 hover:bg-indigo-950/30 font-black" : "bg-indigo-900/20 border-indigo-900/50 hover:bg-indigo-900/40"
            )}
          >
            <Stethoscope className="w-8 h-8 text-indigo-400 mb-2" />
            <span className="font-bold text-lg">生命徵象</span>
          </button>
        </div>
      </div>
      </div>

      {/* Right / Bottom Panel - Event Log List (Expanding to fill remaining space) */}
      <div className={cn(
        "flex flex-col bg-black overflow-hidden border-t md:border-t-0 border-gray-800 w-full md:w-1/2 transition-all duration-300",
        "flex-1 min-h-[100px]"
      )}>
        <div className="px-3 py-1.5 bg-gray-900 border-b border-gray-800 flex items-center">
          <div className="flex items-center gap-2">
            <List className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-bold tracking-wider text-gray-300">事件紀錄 {logs.length > 0 && `(${logs.length})`}</span>
          </div>
        </div>
        <div className="flex-1 p-2 md:pb-24 overflow-y-auto">
          {logs.length === 0 && !globalCallTime ? (
            <div className="text-gray-500 text-sm text-center py-4">無事件紀錄</div>
          ) : (
            <div className="relative pl-5 ml-2 border-l-2 border-gray-800 space-y-1.5 pb-2 mt-1">
              {(() => {
                let renderLogs = [...logs];

                if (globalCallTime && startTime) {
                  const match = globalCallTime.match(/^(\d{1,2}):(\d{2})$/);
                  if (match) {
                    const hours = parseInt(match[1]);
                    const mins = parseInt(match[2]);
                    const d = new Date(startTime);
                    d.setHours(hours, mins, 0, 0);
                    if (d.getTime() > startTime + 60000) d.setDate(d.getDate() - 1);
                    renderLogs.push({
                      id: 'pseudo-call',
                      timeOffset: Math.floor((d.getTime() - startTime) / 1000),
                      realTime: d.getTime(),
                      action: 'INFO',
                      label: `報案時間: ${globalCallTime}`
                    });
                  }
                }

                const ohcaLastNormalLog = logs.slice().reverse().find(l => l.label.includes('OHCA - 最後正常時間不詳') || l.label.includes('最後正常時間: '));
                if (ohcaLastNormalLog && startTime && ohcaLastNormalLog.label.includes('最後正常時間: ')) {
                  const match = ohcaLastNormalLog.label.match(/最後正常時間:\s*(\d{1,2}):(\d{2})/);
                  if (match) {
                    const hours = parseInt(match[1]);
                    const mins = parseInt(match[2]);
                    const d = new Date(startTime);
                    d.setHours(hours, mins, 0, 0);
                    if (d.getTime() > startTime + 60000) d.setDate(d.getDate() - 1);
                    renderLogs.push({
                      id: 'pseudo-collapse',
                      timeOffset: Math.floor((d.getTime() - startTime) / 1000),
                      realTime: d.getTime(),
                      action: 'INFO',
                      label: `倒地時間: ${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}`
                    });
                  }
                }

                return renderLogs.sort((a, b) => a.timeOffset - b.timeOffset).reverse();
              })().map((log, index) => {
                let style;
                let dotColorClass = "bg-gray-400";
                let pulseRing = false;

                switch (log.action) {
                  case 'SHOCK': 
                    style = { color: 'text-orange-400', bg: 'bg-orange-950/40', border: 'border-orange-500/30', icon: <Zap className="w-4 h-4 text-orange-500" /> }; 
                    dotColorClass = "bg-orange-500 ring-4 ring-orange-500/20";
                    break;
                  case 'EPI': 
                  case 'AMIO': 
                    style = { color: 'text-blue-400', bg: 'bg-blue-950/40', border: 'border-blue-500/30', icon: <Syringe className="w-4 h-4 text-blue-500" /> }; 
                    dotColorClass = "bg-blue-500 ring-4 ring-blue-500/20";
                    break;
                  case 'ROSC': 
                    if (log.label.includes('再度OHCA') || log.label.includes('Re-arrest')) {
                      style = { color: 'text-red-400', bg: 'bg-red-950/40', border: 'border-red-500/30', icon: <HeartPulse className="w-4 h-4 text-red-500" /> }; 
                      dotColorClass = "bg-red-500 ring-4 ring-red-500/30";
                      pulseRing = false;
                    } else {
                      style = { color: 'text-green-400', bg: 'bg-green-950/40', border: 'border-green-500/30', icon: <HeartPulse className="w-4 h-4 text-green-500" /> }; 
                      dotColorClass = "bg-green-500 ring-4 ring-green-500/30";
                      pulseRing = true;
                    }
                    break;
                  case 'START':
                  case 'STOP': 
                    style = { color: 'text-white', bg: 'bg-gray-900/60', border: 'border-gray-700/50', icon: <Clock className="w-4 h-4 text-gray-400" /> }; 
                    dotColorClass = "bg-white ring-4 ring-white/20";
                    break;
                  case 'CYCLE_RESET': 
                    style = { color: 'text-purple-400', bg: 'bg-purple-950/40', border: 'border-purple-500/30', icon: <RefreshCcw className="w-4 h-4 text-purple-500" /> }; 
                    dotColorClass = "bg-purple-500 ring-4 ring-purple-500/20";
                    break;
                  case 'AIRWAY': 
                    style = { color: 'text-teal-400', bg: 'bg-teal-950/40', border: 'border-teal-500/30', icon: <Wind className="w-4 h-4 text-teal-500" /> }; 
                    dotColorClass = "bg-teal-500 ring-4 ring-teal-500/20";
                    break;
                  case 'IV': 
                    style = { color: 'text-blue-400', bg: 'bg-blue-950/40', border: 'border-blue-500/30', icon: <Droplet className="w-4 h-4 text-blue-500" /> }; 
                    dotColorClass = "bg-blue-400 ring-4 ring-blue-400/20";
                    break;
                  case 'IO': 
                    style = { color: 'text-purple-400', bg: 'bg-purple-950/40', border: 'border-purple-500/30', icon: <Bone className="w-4 h-4 text-purple-500" /> }; 
                    dotColorClass = "bg-purple-400 ring-4 ring-purple-400/20";
                    break;
                  case 'PROCEDURE': 
                    style = { color: 'text-yellow-400', bg: 'bg-yellow-950/40', border: 'border-yellow-500/30', icon: <ActivitySquare className="w-4 h-4 text-yellow-500" /> }; 
                    dotColorClass = "bg-yellow-500 ring-4 ring-yellow-500/20";
                    break;
                  case 'VITALS': 
                    style = { color: 'text-indigo-400', bg: 'bg-indigo-950/40', border: 'border-indigo-500/30', icon: <Pencil className="w-4 h-4 text-indigo-500" /> }; 
                    dotColorClass = "bg-indigo-500 ring-4 ring-indigo-500/20";
                    break;
                  case 'RHYTHM': 
                    style = { color: 'text-gray-300', bg: 'bg-gray-900/60', border: 'border-gray-800/50', icon: <Activity className="w-4 h-4 text-gray-400" /> }; 
                    dotColorClass = "bg-gray-400 ring-4 ring-gray-400/20";
                    break;
                  default: 
                    style = { color: 'text-gray-300', bg: 'bg-gray-900/50', border: 'border-gray-800/50', icon: <Activity className="w-4 h-4 text-gray-500" /> }; 
                    dotColorClass = "bg-gray-400";
                    break;
                }

                let logLabel = log.label;
                if (log.action === 'VITALS' && logLabel.startsWith('OHCA - ')) {
                  logLabel = logLabel.replace('OHCA - ', '紀錄 - ');
                }

                return (
                  <div key={log.id} className="relative group transition-all duration-200">
                    {/* Metro Node Dot Indicator */}
                    <div className="absolute -left-[32px] top-1/2 -translate-y-1/2 flex items-center justify-center w-4 h-4 rounded-full bg-gray-950 border border-gray-800 z-10 transition-colors">
                      <div className={cn("w-2 h-2 rounded-full", dotColorClass)} />
                      {pulseRing && <div className="absolute w-2 h-2 rounded-full bg-green-500 animate-ping opacity-75" />}
                    </div>

                    <div className={cn(
                      "items-center gap-1.5 text-xs py-1.5 px-2 border border-transparent rounded-lg hover:border-gray-800/30 hover:bg-gray-900/40 transition-all duration-150 group flex",
                      style.bg
                    )}>
                      <span className="font-mono text-gray-500 font-bold shrink-0 w-9">
                        {formatTime(log.timeOffset)}
                      </span>
                      <div className="shrink-0 scale-90">
                         {style.icon}
                      </div>
                      <span className={`font-semibold leading-relaxed ${style.color} flex-1`}>
                        {logLabel}
                      </span>
                      {log.photoUrl && (
                        <img src={log.photoUrl} alt="Record" className="w-8 h-8 rounded object-cover ml-auto shrink-0 border border-gray-700" />
                      )}
                      {log.action !== 'START' && (
                        <button 
                          onClick={() => {
                            if (window.confirm('確定要刪除這筆紀錄嗎？')) {
                              removeLog(log.id);
                            }
                          }}
                          className="ml-2 text-gray-500 hover:text-red-400 p-2 md:p-1 opacity-50 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                          aria-label="刪除紀錄"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer Controls */}
      <div className="p-3 bg-gray-900 border-t border-gray-800 flex gap-3 shrink-0 pb-safe md:w-1/2 md:absolute md:bottom-0 md:right-0">
        {isROSC ? (
          <button
            onClick={handleReArrest}
            className="flex-1 py-4 border border-red-800 bg-red-900/20 hover:bg-red-900/40 rounded-xl font-bold text-red-500 transition-colors animate-pulse active:scale-95 text-lg"
          >
            再度OHCA
          </button>
        ) : (
          <button
            onClick={() => setActiveModal('INFO')}
            className="flex-1 py-4 border border-blue-800 bg-blue-900/20 hover:bg-blue-900/40 rounded-xl font-bold text-blue-400 transition-colors active:scale-95 text-lg"
          >
            資訊紀錄
          </button>
        )}
        <button
           onClick={() => fileInputRef.current?.click()}
           className="w-16 flex-shrink-0 flex items-center justify-center border border-gray-700 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors active:scale-95"
        >
          <Camera className="w-6 h-6 text-gray-300" />
        </button>
        <button
          onPointerDown={handleEndPointerDown}
          onPointerUp={handleEndPointerUpOrLeave}
          onPointerLeave={handleEndPointerUpOrLeave}
          onPointerCancel={handleEndPointerUpOrLeave}
          onContextMenu={(e) => e.preventDefault()}
          style={{ touchAction: 'none' }}
          className="flex-1 relative overflow-hidden py-4 border border-gray-700 bg-gray-800 rounded-xl font-bold text-gray-300 transition-colors active:scale-95 text-lg select-none"
        >
          <div className="absolute inset-y-0 left-0 bg-red-600/50 transition-all ease-linear" style={{ width: `${endPressProgress}%` }} />
          <span className="relative z-10">長按3秒結束</span>
        </button>
      </div>

      {activeModal === 'RHYTHM' && (
        <Modal title="心律樣態判讀" onClose={closeModal}>
          <div className="grid grid-cols-1 gap-2">
            <button 
              onClick={() => handleRhythmSelected('ROSC', '心律 - 摸到脈搏 (Pulse)')}
              className="flex items-center gap-4 p-4 bg-green-900/40 border border-green-800 hover:bg-green-900/60 rounded-xl text-left transition-colors"
            >
              <Heart className="w-7 h-7 text-green-400" />
              <span className="font-bold text-lg text-green-100">摸到脈搏 Got a Pulse!</span>
            </button>
            <button 
              onClick={() => handleRhythmSelected('RHYTHM', '心律 - Asystole')}
              className="flex items-center gap-4 p-4 bg-gray-800 hover:bg-gray-700 rounded-xl text-left transition-colors"
            >
              <Minus className="w-7 h-7 text-gray-400" />
              <span className="font-bold text-lg text-white">Asystole</span>
            </button>
            <button 
              onClick={() => handleRhythmSelected('RHYTHM', '心律 - PEA')}
              className="flex items-center gap-4 p-4 bg-gray-800 hover:bg-gray-700 rounded-xl text-left transition-colors"
            >
              <Activity className="w-7 h-7 text-gray-400" />
              <span className="font-bold text-lg text-white">PEA</span>
            </button>
            <button 
              onClick={() => handleRhythmSelected('SHOCK', '心律 - Vfib (給予電擊)')}
              className="flex items-center gap-4 p-4 bg-orange-900/30 border border-orange-900/50 hover:bg-orange-900/50 rounded-xl text-left transition-colors"
            >
              <Zap className="w-7 h-7 text-orange-500" />
              <div>
                <div className="font-bold text-lg text-orange-100">Vfib</div>
                <div className="text-sm text-orange-400/80">記錄為已給予電擊</div>
              </div>
            </button>
            <button 
              onClick={() => handleRhythmSelected('SHOCK', '心律 - Pulseless VT (給予電擊)')}
              className="flex items-center gap-4 p-4 bg-orange-900/30 border border-orange-900/50 hover:bg-orange-900/50 rounded-xl text-left transition-colors"
            >
              <Zap className="w-7 h-7 text-orange-500" />
              <div>
                <div className="font-bold text-lg text-orange-100">Pulseless VT</div>
                <div className="text-sm text-orange-400/80">記錄為已給予電擊</div>
              </div>
            </button>
          </div>
        </Modal>
      )}

      {activeModal === 'MEDS' && (
        <Modal title="給予急救藥物" onClose={closeModal}>
          <div className="grid grid-cols-1 gap-3">
            <button 
              onClick={() => { 
                logEvent('EPI', '給藥 - Epinephrine 1mg');
                if (!hasIVIO) setActiveModal('PROCEDURES');
                else closeModal(); 
              }}
              className={cn(
                "flex items-center gap-4 p-5 rounded-xl border transition-all text-left",
                isEpiReady ? "bg-blue-900/30 border-blue-800 text-blue-100 hover:bg-blue-900/50" : "bg-gray-800 border-gray-700 text-gray-400 opacity-80"
              )}
            >
              <Syringe className={cn("w-8 h-8", isEpiReady ? "text-blue-400" : "text-gray-500")} />
              <div>
                <div className="font-bold text-xl mb-1">Epinephrine</div>
                <div className="text-sm opacity-80">
                  {epiElapsed !== null ? `距離上次給予: ${formatTime(epiElapsed)}` : '第一劑'}
                </div>
              </div>
            </button>
            <button 
              onClick={() => { 
                if (isAmioMax) return; 
                logEvent('AMIO', '給藥 - Amiodarone'); 
                if (!hasIVIO) setActiveModal('PROCEDURES');
                else closeModal(); 
              }}
              disabled={isAmioMax}
              className={cn(
                "flex items-center gap-4 p-5 rounded-xl border text-left transition-all",
                isAmioMax ? "bg-gray-800 border-gray-700 opacity-50" : showAmioReminder ? "bg-indigo-900/40 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)] animate-pulse text-indigo-100" : "bg-indigo-900/20 border-indigo-800/50 hover:bg-indigo-900/40 text-indigo-100"
              )}
            >
              <Syringe className={cn("w-8 h-8", isAmioMax ? "text-gray-500" : showAmioReminder ? "text-indigo-300" : "text-indigo-400")} />
              <div>
                <div className="font-bold text-xl mb-1">Amiodarone{isAmioMax ? ' (達上限)' : ''}</div>
                <div className={cn("text-sm", showAmioReminder ? "text-indigo-300 font-bold" : "text-indigo-300/70")}>已給予 {amiosCount}/2 次</div>
              </div>
            </button>
          </div>
        </Modal>
      )}

      {activeModal === 'PROCEDURES' && (
        <Modal title="急救處置" onClose={closeModal}>
          <div className="grid grid-cols-1 gap-2">
            <button 
              onClick={() => { logEvent('AIRWAY', '處置 - NPA / OPA'); closeModal(); }}
              className="flex items-center gap-4 p-4 bg-gray-800 hover:bg-gray-700 rounded-xl text-left transition-colors"
            >
              <Wind className="w-7 h-7 text-teal-400" />
              <span className="font-bold text-lg text-white">建立 NPA / OPA (鼻咽/口咽)</span>
            </button>
            <button 
              onClick={() => { logEvent('AIRWAY', '處置 - SGA'); closeModal(); }}
              className="flex items-center gap-4 p-4 bg-gray-800 hover:bg-gray-700 rounded-xl text-left transition-colors"
            >
              <Wind className="w-7 h-7 text-teal-400" />
              <span className="font-bold text-lg text-white">建立 SGA (聲門上呼吸道)</span>
            </button>
            <button 
              onClick={() => { logEvent('AIRWAY', '處置 - Endo (氣管內管)'); closeModal(); }}
              className="flex items-center gap-4 p-4 bg-gray-800 hover:bg-gray-700 rounded-xl text-left transition-colors"
            >
              <Wind className="w-7 h-7 text-teal-400" />
              <span className="font-bold text-lg text-white">建立 Endo (氣管內管)</span>
            </button>
            <button 
              onClick={() => { 
                logEvent('PROCEDURE', '處置 - 自動給氧機'); 
                setVentMode('OFF'); 
                setVentStartTime(null);
                if (ttsState.current.ventPause && metronomeOn) {
                  setMetronome(true, 110);
                }
                ttsState.current.ventPause = false;
                closeModal(); 
              }}
              className="flex items-center gap-4 p-4 bg-gray-800 hover:bg-gray-700 rounded-xl text-left transition-colors border border-yellow-900/30"
            >
              <Wind className="w-7 h-7 text-yellow-400" />
              <span className="font-bold text-lg text-white">使用自動給氧機</span>
            </button>
            <div className="h-2 flex-shrink-0" />
            <button 
              onClick={() => { logIVIOEvent('IV', '處置 - 建立 IV (靜脈注射)'); closeModal(); }}
              className="flex items-center gap-4 p-4 bg-gray-800 hover:bg-gray-700 rounded-xl text-left transition-colors"
            >
              <Droplet className="w-7 h-7 text-blue-400" />
              <span className="font-bold text-lg text-white">建立 IV (靜脈)</span>
            </button>
            <button 
              onClick={() => { logIVIOEvent('IO', '處置 - 建立 IO (骨內注射)'); closeModal(); }}
              className="flex items-center gap-4 p-4 bg-gray-800 hover:bg-gray-700 rounded-xl text-left transition-colors"
            >
              <Bone className="w-7 h-7 text-purple-400" />
              <span className="font-bold text-lg text-white">建立 IO (骨針)</span>
            </button>
            <div className="h-2 flex-shrink-0" />
            <button 
              onClick={() => { 
                logEvent('PROCEDURE', '處置 - 架設 mCPR'); 
                setMetronomeOn(false); 
                setMetronome(false, 110); 
                setVentMode('6S'); 
                closeModal(); 
              }}
              className="flex items-center gap-4 p-4 bg-gray-800 hover:bg-gray-700 rounded-xl text-left transition-colors border border-yellow-900/30"
            >
              <ActivitySquare className="w-7 h-7 text-yellow-400" />
              <span className="font-bold text-lg text-white">架設 mCPR</span>
            </button>
          </div>
        </Modal>
      )}

      {activeModal === 'INFO' && (
        <Modal title="資訊紀錄" onClose={closeModal}>
          <div className="flex flex-col gap-3">
            <button onClick={() => setActiveModal('HISTORY')} className="p-4 bg-indigo-900/30 border border-indigo-800 hover:bg-indigo-900/50 rounded-xl font-bold text-indigo-300 text-lg">
              病史紀錄
            </button>
            <button onClick={() => setActiveModal('OHCA')} className="p-4 bg-teal-900/30 border border-teal-800 hover:bg-teal-900/50 rounded-xl font-bold text-teal-300 text-lg">
              OHCA 資訊
            </button>
          </div>
        </Modal>
      )}

      {activeModal === 'VITALS' && (
        <Modal title="生命徵象" onClose={vitalInputType || textInputType ? () => {setVitalInputType(null); setTextInputType(null); setVitalValue('');} : closeModal}>
          {!vitalInputType && !textInputType ? (
            <div className="space-y-4">
              <div>
                <h4 className="text-gray-400 font-bold mb-2 text-sm tracking-wide">數值紀錄</h4>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { name: 'EtCO₂', icon: <Wind className="w-5 h-5 text-teal-400 mb-1" /> },
                    { name: '瞳孔', icon: <Eye className="w-5 h-5 text-indigo-400 mb-1" /> },
                    { name: '意識', icon: <Brain className="w-5 h-5 text-purple-400 mb-1" /> },
                    { name: '血壓', icon: <Activity className="w-5 h-5 text-red-400 mb-1" /> },
                    { name: '脈搏', icon: <HeartPulse className="w-5 h-5 text-pink-400 mb-1" /> },
                    { name: '血氧', icon: <Waves className="w-5 h-5 text-blue-400 mb-1" /> },
                    { name: '體溫', icon: <Thermometer className="w-5 h-5 text-orange-400 mb-1" /> },
                    { name: '血糖', icon: <Droplet className="w-5 h-5 text-red-500 mb-1" /> }
                  ].map(v => (
                    <button 
                      key={v.name}
                      onClick={() => setVitalInputType(v.name)}
                      className="flex flex-col items-center justify-center p-3 bg-gray-800 border border-gray-700 hover:bg-gray-700 rounded-xl font-bold text-gray-200 transition-colors text-sm min-h-[5rem]"
                    >
                      {v.icon}
                      <span>{v.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : vitalInputType ? (
            <div className="flex flex-col gap-3">
              <h4 className="text-gray-400 font-medium tracking-wide">輸入 {vitalInputType} 數值</h4>
              <input 
                type="text"
                readOnly
                value={vitalValue}
                placeholder={`例如: ${vitalInputType === '血壓' ? '120/70' : vitalInputType === '意識' ? '清 (AVPU) 或 456 (GCS)' : vitalInputType === '瞳孔' ? '3+/3+ (左/右)' : '數值'}`}
                className="w-full bg-gray-950 border border-gray-700 rounded-xl p-4 text-2xl font-bold text-white focus:outline-none"
              />
              {vitalInputType === '血壓' && (
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <button onClick={() => { logEvent('VITALS', '紀錄 - 血壓: 頸動脈脈搏可摸到'); setVitalInputType(null); setActiveModal('VITALS'); }} className="p-3 bg-gray-800 hover:bg-gray-700 rounded-xl font-bold text-gray-200 transition-colors text-sm">頸</button>
                  <button onClick={() => { logEvent('VITALS', '紀錄 - 血壓: 橈動脈脈搏可摸到'); setVitalInputType(null); setActiveModal('VITALS'); }} className="p-3 bg-gray-800 hover:bg-gray-700 rounded-xl font-bold text-gray-200 transition-colors text-sm">橈</button>
                  <button onClick={() => { logEvent('VITALS', '紀錄 - 血壓: 股動脈脈搏可摸到'); setVitalInputType(null); setActiveModal('VITALS'); }} className="p-3 bg-gray-800 hover:bg-gray-700 rounded-xl font-bold text-gray-200 transition-colors text-sm">股</button>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 mt-2">
                {(vitalInputType === '體溫' 
                  ? ['1','2','3','4','5','6','7','8','9','.', '0', ''] 
                  : vitalInputType === '瞳孔' 
                  ? ['1','2','3','4','5','6','7','8','9','.5', '0', '/', '+', '-', ''] 
                  : vitalInputType === '血壓' 
                  ? ['1','2','3','4','5','6','7','8','9','/', '0', '']
                  : vitalInputType === '意識'
                  ? ['1','2','3','4','5','6','清','聲','痛','否','','']
                  : ['1','2','3','4','5','6','7','8','9','', '0', '']).map((key, i) => key ? (
                  <button 
                    key={key} 
                    onClick={() => setVitalValue(v => v + key)}
                    className="p-3 bg-gray-800 rounded-xl text-2xl font-bold hover:bg-gray-700 active:bg-gray-600 transition-colors shadow-inner"
                  >
                    {key}
                  </button>
                ) : <div key={`empty-${i}`} />)}
                <button 
                  onClick={() => setVitalValue('')}
                  className="p-3 bg-red-900/30 text-red-400 rounded-xl font-bold hover:bg-red-900/50 active:bg-red-900/70 transition-colors"
                >
                  清除
                </button>
                <button 
                  onClick={() => setVitalValue(v => v.slice(0, -1))}
                  className="col-span-2 p-3 bg-gray-700 text-white rounded-xl font-bold hover:bg-gray-600 active:bg-gray-500 transition-colors shadow-inner"
                >
                  刪除 (Del)
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-2">
                <button 
                  onClick={() => { setVitalInputType(null); setVitalValue(''); }}
                  className="p-4 bg-gray-800 hover:bg-gray-700 rounded-xl font-bold text-white transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={() => { 
                    if(vitalValue.trim()) {
                      logEvent('VITALS', `紀錄 - ${vitalInputType}: ${vitalValue}`);
                      if (activeModal === 'VITALS') setVitalInputType(null);
                      setVitalValue('');
                      setActiveModal('VITALS');
                    }
                  }}
                  className="p-4 bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold text-white shadow-lg shadow-indigo-900/20 transition-all active:scale-95"
                >
                  儲存
                </button>
              </div>
            </div>
          ) : textInputType ? (
            <div className="flex flex-col gap-3">
              <h4 className="text-gray-400 font-medium tracking-wide">輸入 {textInputType}</h4>
              <input 
                type={textInputType === '最後正常時間' ? 'time' : 'text'}
                autoFocus
                value={vitalValue}
                onChange={e => setVitalValue(e.target.value)}
                placeholder={`輸入${textInputType}`}
                className="w-full bg-gray-950 border border-gray-700 rounded-xl p-4 text-2xl font-bold text-white focus:outline-none focus:border-indigo-500"
              />
              <div className="grid grid-cols-2 gap-3 mt-4">
                <button 
                  onClick={() => { setTextInputType(null); setVitalValue(''); setActiveModal(textInputType === '其他病史' ? 'HISTORY' : textInputType === '最後正常時間' ? 'OHCA' : 'INFO'); }}
                  className="p-4 bg-gray-800 hover:bg-gray-700 rounded-xl font-bold text-white transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={() => { 
                    if(vitalValue.trim()) {
                      logEvent('VITALS', `紀錄 - ${textInputType}: ${vitalValue}`);
                      const nextModal = textInputType === '其他病史' ? 'HISTORY' : textInputType === '最後正常時間' ? 'OHCA' : 'INFO';
                      setTextInputType(null);
                      setVitalValue('');
                      setActiveModal(nextModal);
                    }
                  }}
                  className="p-4 bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold text-white shadow-lg shadow-indigo-900/20 transition-all active:scale-95"
                >
                  儲存
                </button>
              </div>
            </div>
          ) : null}
        </Modal>
      )}

      {activeModal === 'HISTORY' && (
        <Modal title="快速病史與 5H5T 鑑別" onClose={() => setActiveModal('INFO')}>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-gray-400 font-bold mb-2 text-sm tracking-wide border-b border-gray-800 pb-1">發病前兆（複選）</h4>
                <div className="flex flex-col gap-2">
                  {['突發胸痛', '劇烈背痛', '突發頭痛', '呼吸困難', '逐漸變喘'].map(sym => (
                    <button 
                      key={sym} 
                      onClick={() => setHistorySymptoms(prev => prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym])}
                      className={cn("p-3 rounded-xl text-sm font-bold transition-all border text-left", historySymptoms.includes(sym) ? "bg-indigo-900/40 border-indigo-500 text-indigo-200" : "bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-300")}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-gray-400 font-bold mb-2 text-sm tracking-wide border-b border-gray-800 pb-1">過去病史（複選）</h4>
                <div className="flex flex-col gap-2">
                  {['心臟病', '高血壓', '糖尿病', '癌症', '洗腎/腎臟病'].map(dz => (
                    <button 
                      key={dz} 
                      onClick={() => setHistoryConditions(prev => prev.includes(dz) ? prev.filter(d => d !== dz) : [...prev, dz])}
                      className={cn("p-3 rounded-xl text-sm font-bold transition-all border text-left", historyConditions.includes(dz) ? "bg-indigo-900/40 border-indigo-500 text-indigo-200" : "bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-300")}
                    >
                      {dz}
                    </button>
                  ))}
                  <button 
                    onClick={() => { setTextInputType('其他病史'); setActiveModal('VITALS'); }}
                    className="p-3 bg-gray-900 border border-gray-700 hover:bg-gray-800 rounded-xl font-bold text-gray-400 text-sm text-left"
                  >
                    + 其他病史...
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-gray-950 p-4 rounded-xl border border-gray-800">
              <h4 className="text-gray-400 font-bold mb-3 text-sm tracking-wide">5H5T 鑑別提示</h4>
              <div className="flex flex-wrap gap-2">
                <span className={cn("px-3 py-1 rounded-full text-xs font-bold border transition-colors", historySymptoms.includes('突發胸痛') || historyConditions.includes('心臟病') ? "bg-red-900/40 border-red-500 text-red-200 shadow-[0_0_8px_rgba(239,68,68,0.3)]" : "bg-gray-900 border-gray-800 text-gray-600")}>心肌梗塞</span>
                <span className={cn("px-3 py-1 rounded-full text-xs font-bold border transition-colors", historySymptoms.includes('劇烈背痛') ? "bg-red-900/40 border-red-500 text-red-200 shadow-[0_0_8px_rgba(239,68,68,0.3)]" : "bg-gray-900 border-gray-800 text-gray-600")}>主動脈剝離</span>
                <span className={cn("px-3 py-1 rounded-full text-xs font-bold border transition-colors", historySymptoms.includes('突發頭痛') ? "bg-orange-900/40 border-orange-500 text-orange-200 shadow-[0_0_8px_rgba(249,115,22,0.3)]" : "bg-gray-900 border-gray-800 text-gray-600")}>腦中風</span>
                <span className={cn("px-3 py-1 rounded-full text-xs font-bold border transition-colors", historySymptoms.includes('呼吸困難') || historyConditions.includes('癌症') ? "bg-blue-900/40 border-blue-500 text-blue-200 shadow-[0_0_8px_rgba(59,130,246,0.3)]" : "bg-gray-900 border-gray-800 text-gray-600")}>肺栓塞</span>
                <span className={cn("px-3 py-1 rounded-full text-xs font-bold border transition-colors", historySymptoms.includes('逐漸變喘') ? "bg-blue-900/40 border-blue-500 text-blue-200 shadow-[0_0_8px_rgba(59,130,246,0.3)]" : "bg-gray-900 border-gray-800 text-gray-600")}>缺氧</span>
                <span className={cn("px-3 py-1 rounded-full text-xs font-bold border transition-colors", historyConditions.includes('洗腎/腎臟病') ? "bg-yellow-900/40 border-yellow-500 text-yellow-200 shadow-[0_0_8px_rgba(234,179,8,0.3)]" : "bg-gray-900 border-gray-800 text-gray-600")}>高血鉀</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-2">
              <button 
                onClick={() => { 
                  setHistorySymptoms([]); 
                  setHistoryConditions([]); 
                  logEvent('VITALS', '病史不明');
                  setActiveModal('VITALS');
                }}
                className="p-4 bg-gray-800 hover:bg-gray-700 rounded-xl font-bold text-white transition-colors text-sm"
              >
                病史不明
              </button>
              <button 
                onClick={() => { 
                  const sysText = historySymptoms.length > 0 ? `前兆：${historySymptoms.join('、')}。` : '';
                  const dzText = historyConditions.length > 0 ? `病史：${historyConditions.join('、')}。` : '';
                  
                  let possible = [];
                  if (historySymptoms.includes('突發胸痛') || historyConditions.includes('心臟病')) possible.push('心肌梗塞');
                  if (historySymptoms.includes('劇烈背痛')) possible.push('主動脈剝離');
                  if (historySymptoms.includes('突發頭痛')) possible.push('腦中風');
                  if (historySymptoms.includes('呼吸困難') || historyConditions.includes('癌症')) possible.push('肺栓塞');
                  if (historySymptoms.includes('逐漸變喘')) possible.push('缺氧');
                  if (historyConditions.includes('洗腎/腎臟病')) possible.push('高血鉀');

                  const suspectText = possible.length > 0 ? `高度懷疑：${possible.join('、')}。` : '';
                  
                  let fullText = `${sysText}${dzText}${suspectText}`.trim();
                  if (fullText) {
                    logEvent('VITALS', `快速病史：${fullText}`);
                  }
                  setActiveModal('INFO');
                }}
                className="p-4 bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold text-white shadow-lg shadow-indigo-900/20 transition-all active:scale-95 text-sm"
              >
                完成
              </button>
            </div>
          </div>
        </Modal>
      )}

      {activeModal === 'OHCA' && (
        <Modal title="OHCA 資訊" onClose={() => setActiveModal('INFO')}>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => { setTextInputType('最後正常時間'); setActiveModal('VITALS'); }} 
                className={cn("p-4 rounded-xl font-bold text-sm transition-all border", ohcaLastNormal && ohcaLastNormal.includes('最後正常時間: ') ? "bg-indigo-900/40 border-indigo-500 text-indigo-200 shadow-[0_0_10px_rgba(99,102,241,0.2)]" : "bg-gray-800 border-gray-700 hover:bg-gray-700 text-white")}
              >
                {ohcaLastNormal && ohcaLastNormal.includes('最後正常時間: ') ? ohcaLastNormal.replace('紀錄 - ', '') : '輸入最後正常時間'}
              </button>
              <button 
                onClick={() => {
                  logEvent('VITALS', 'OHCA - 最後正常時間不詳');
                  if (ohcaWitness && ohcaBystander && ohcaPAD) setActiveModal('INFO');
                }} 
                className={cn("p-4 rounded-xl font-bold text-sm transition-all border", ohcaLastNormal === 'OHCA - 最後正常時間不詳' ? "bg-gray-700 border-gray-500 text-white" : "bg-gray-800 border-gray-700 hover:bg-gray-700 text-white")}
              >
                最後正常時間不詳
              </button>
            </div>
            <div className="flex flex-col gap-1 mt-2">
              <span className="text-gray-400 text-sm font-bold ml-1">目擊</span>
              <div className="flex bg-gray-800 rounded-xl p-1 gap-1">
                 <button 
                   onClick={() => {
                     logEvent('VITALS', 'OHCA - 有目擊');
                     if (ohcaBystander && ohcaPAD && ohcaLastNormal) setActiveModal('INFO');
                   }}
                   className={cn("flex-1 p-2 rounded-lg text-sm font-bold transition-all text-center", ohcaWitness === 'OHCA - 有目擊' ? "bg-green-600 text-white shadow-md shadow-green-900/50" : "text-gray-400 hover:bg-gray-700")}
                 >
                   有目擊
                 </button>
                 <button 
                   onClick={() => {
                     logEvent('VITALS', 'OHCA - 無目擊');
                     if (ohcaBystander && ohcaPAD && ohcaLastNormal) setActiveModal('INFO');
                   }}
                   className={cn("flex-1 p-2 rounded-lg text-sm font-bold transition-all text-center", ohcaWitness === 'OHCA - 無目擊' ? "bg-red-600 text-white shadow-md shadow-red-900/50" : "text-gray-400 hover:bg-gray-700")}
                 >
                   無目擊
                 </button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-gray-400 text-sm font-bold ml-1">旁人CPR</span>
              <div className="flex bg-gray-800 rounded-xl p-1 gap-1">
                 <button 
                   onClick={() => {
                     logEvent('VITALS', 'OHCA - 有旁人CPR');
                     if (ohcaWitness && ohcaPAD && ohcaLastNormal) setActiveModal('INFO');
                   }}
                   className={cn("flex-1 p-2 rounded-lg text-sm font-bold transition-all text-center", ohcaBystander === 'OHCA - 有旁人CPR' ? "bg-green-600 text-white shadow-md shadow-green-900/50" : "text-gray-400 hover:bg-gray-700")}
                 >
                   有旁人CPR
                 </button>
                 <button 
                   onClick={() => {
                     logEvent('VITALS', 'OHCA - 無旁人CPR');
                     if (ohcaWitness && ohcaPAD && ohcaLastNormal) setActiveModal('INFO');
                   }}
                   className={cn("flex-1 p-2 rounded-lg text-sm font-bold transition-all text-center", ohcaBystander === 'OHCA - 無旁人CPR' ? "bg-red-600 text-white shadow-md shadow-red-900/50" : "text-gray-400 hover:bg-gray-700")}
                 >
                   無旁人CPR
                 </button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-gray-400 text-sm font-bold ml-1">使用PAD去顫</span>
              <div className="flex bg-gray-800 rounded-xl p-1 gap-1">
                 <button 
                   onClick={() => {
                     logEvent('VITALS', 'OHCA - 有使用PAD去顫');
                     if (ohcaWitness && ohcaBystander && ohcaLastNormal) setActiveModal('INFO');
                   }}
                   className={cn("flex-1 p-2 rounded-lg text-sm font-bold transition-all text-center", ohcaPAD === 'OHCA - 有使用PAD去顫' ? "bg-green-600 text-white shadow-md shadow-green-900/50" : "text-gray-400 hover:bg-gray-700")}
                 >
                   有使用PAD去顫
                 </button>
                 <button 
                   onClick={() => {
                     logEvent('VITALS', 'OHCA - 未使用PAD去顫');
                     if (ohcaWitness && ohcaBystander && ohcaLastNormal) setActiveModal('INFO');
                   }}
                   className={cn("flex-1 p-2 rounded-lg text-sm font-bold transition-all text-center", ohcaPAD === 'OHCA - 未使用PAD去顫' ? "bg-red-600 text-white shadow-md shadow-red-900/50" : "text-gray-400 hover:bg-gray-700")}
                 >
                   未使用PAD
                 </button>
              </div>
            </div>
            <button onClick={() => setActiveModal('INFO')} className="p-4 bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold text-white mt-2 transition-colors">
              完成 (返回)
            </button>
          </div>
        </Modal>
      )}

      {activeModal === 'END_CONFIRM' && (
        <Modal title="確認結束急救" onClose={closeModal}>
          <div className="flex flex-col gap-4">
            <p className="text-gray-300">確定要結束急救並產生總結報告嗎？此操作無法還原。</p>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <button 
                onClick={closeModal}
                className="p-4 border border-gray-700 bg-gray-800 hover:bg-gray-700 rounded-xl font-bold text-gray-300 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={confirmEnd}
                className="p-4 bg-red-600 hover:bg-red-700 rounded-xl font-bold text-white shadow-lg shadow-red-900/20 transition-all active:scale-95"
              >
                確定結束
              </button>
            </div>
          </div>
        </Modal>
      )}

      <input 
        type="file" 
        accept="image/*" 
        capture="environment" 
        ref={fileInputRef} 
        onChange={handlePhotoCapture} 
        className="hidden" 
      />
    </div>
  );
}
