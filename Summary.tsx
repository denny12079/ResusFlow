import React from 'react';
import { LogEvent, ActionType } from '../types';
import { formatTime, cn, vibrate } from '../utils';
import { ClipboardList, CheckCircle, Check, X, HelpCircle, Syringe, FileText, Zap, HeartPulse, Activity, Wind, RefreshCcw, Clock, Droplet, Bone, ActivitySquare, Pencil, Sun, Moon } from 'lucide-react';

interface SummaryProps {
  logs: LogEvent[];
  startTime: number | null;
  endTime: number | null;
  historySymptoms: string[];
  historyConditions: string[];
  globalCallTime: string;
  setGlobalCallTime: (val: string) => void;
  emtContactTime: string;
  setEmtContactTime: (val: string) => void;
  onReset: () => void;
  logEvent: (action: ActionType, label: string) => void;
  speak: (msg: string, rate?: number) => void;
  isHighContrast: boolean;
  setIsHighContrast: (val: boolean) => void;
}

export const Summary: React.FC<SummaryProps> = ({ logs, startTime, endTime, historySymptoms, historyConditions, globalCallTime, setGlobalCallTime, emtContactTime, setEmtContactTime, onReset, logEvent, speak, isHighContrast, setIsHighContrast }) => {
  const [currentNow, setCurrentNow] = React.useState(Date.now());
  const [collapseTimeInput, setCollapseTimeInput] = React.useState<string>('');
  const [witnessState, setWitnessState] = React.useState<'YES'|'NO'|'UNKNOWN'>('UNKNOWN');
  const [bystanderState, setBystanderState] = React.useState<'YES'|'NO'|'UNKNOWN'>('UNKNOWN');
  const [padState, setPadState] = React.useState<'YES'|'NO'|'UNKNOWN'>('NO');

  const [completePressProgress, setCompletePressProgress] = React.useState(0);
  const [showCompleteConfirm, setShowCompleteConfirm] = React.useState(false);
  const completePressTimer = React.useRef<any>(null);
  const completePressInterval = React.useRef<any>(null);

  const handleCompletePointerDown = () => {
    setCompletePressProgress(0);
    const sTime = Date.now();
    completePressInterval.current = setInterval(() => {
      const elapsed = Date.now() - sTime;
      setCompletePressProgress(Math.min(100, (elapsed / 3000) * 100));
    }, 50);

    completePressTimer.current = setTimeout(() => {
      if (completePressInterval.current) clearInterval(completePressInterval.current);
      setCompletePressProgress(100);
      setShowCompleteConfirm(true);
      vibrate([200]);
    }, 3000);
  };

  const handleCompletePointerUpOrLeave = () => {
    if (completePressTimer.current) {
      clearTimeout(completePressTimer.current);
      completePressTimer.current = null;
    }
    if (completePressInterval.current) {
      clearInterval(completePressInterval.current);
      completePressInterval.current = null;
    }
    setCompletePressProgress(0);
  };

  React.useEffect(() => {
    const interval = setInterval(() => setCurrentNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const staticDuration = (startTime && endTime) ? Math.floor((endTime - startTime) / 1000) : 0;
  const currentDuration = startTime ? Math.floor((currentNow - startTime) / 1000) : 0;
  
  const shocks = logs.filter(l => l.action === 'SHOCK').length;
  const epis = logs.filter(l => l.action === 'EPI').length;
  const amios = logs.filter(l => l.action === 'AMIO').length;
  const cycles = logs.filter(l => l.action === 'CYCLE_RESET').length;

  const rhythmLogs = logs.filter(l => l.label.includes('心律 - '));
  const initialRhythm = rhythmLogs.length > 0 ? (rhythmLogs[0].label.split(' - ')[1] || '').replace('(給予電擊)', '').trim() : '未記錄';
  const rhythmChangesText = rhythmLogs.map(l => (l.label.split(' - ')[1] || '').replace('(給予電擊)', '').trim()).join(' ➔ ') || '無變化紀錄';
  const lastEpiLog = [...logs].reverse().find(l => l.action === 'EPI');
  const epiElapsedDynamic = lastEpiLog ? currentDuration - lastEpiLog.timeOffset : null;

  const getHistorySummary = () => {
    let possible: string[] = [];
    if (historySymptoms.includes('突發胸痛') || historyConditions.includes('心臟病')) possible.push('心肌梗塞');
    if (historySymptoms.includes('劇烈背痛')) possible.push('主動脈剝離');
    if (historySymptoms.includes('突發頭痛')) possible.push('腦中風');
    if (historySymptoms.includes('呼吸困難') || historyConditions.includes('癌症')) possible.push('肺栓塞');
    if (historySymptoms.includes('逐漸變喘')) possible.push('缺氧');
    if (historyConditions.includes('洗腎/腎臟病')) possible.push('高血鉀');

    if (historySymptoms.length === 0 && historyConditions.length === 0) {
      return { historyText: '未記錄或查無特殊病史', ddxText: '無特定 5H5T 提示' };
    }

    const symptomsStr = historySymptoms.length > 0 ? `前兆: ${historySymptoms.join('、')}` : '';
    const condsStr = historyConditions.length > 0 ? `病史: ${historyConditions.join('、')}` : '';
    const historyText = [symptomsStr, condsStr].filter(Boolean).join('；');

    const ddxText = possible.length > 0 ? possible.join('、') : '無明確對應的 5H5T 特徵';
    return { historyText, ddxText };
  };

  const { historyText, ddxText } = getHistorySummary();

  const ohcaWitnessLog = logs.slice().reverse().find(l => l.label.includes('OHCA - 有目擊') || l.label.includes('OHCA - 無目擊'))?.label;

  const getRenderLogs = () => {
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

    if (collapseTimeInput && collapseTimeInput !== '不詳' && startTime) {
      const match = collapseTimeInput.match(/^(\d{1,2}):(\d{2})$/);
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
          label: `倒地時間: ${collapseTimeInput}`
        });
      }
    }

    if (emtContactTime && startTime) {
      const match = emtContactTime.match(/^(\d{1,2}):(\d{2})$/);
      if (match) {
        const hours = parseInt(match[1]);
        const mins = parseInt(match[2]);
        const d = new Date(startTime);
        d.setHours(hours, mins, 0, 0);
        if (d.getTime() > startTime + 60000) d.setDate(d.getDate() - 1);
        renderLogs.push({
          id: 'pseudo-emt',
          timeOffset: Math.floor((d.getTime() - startTime) / 1000),
          realTime: d.getTime(),
          action: 'INFO',
          label: `EMT接觸時間: ${emtContactTime}`
        });
      }
    }

    return renderLogs.sort((a, b) => a.timeOffset - b.timeOffset);
  };

  const renderLogs = getRenderLogs();
  const ohcaBystanderLog = logs.slice().reverse().find(l => l.label.includes('OHCA - 有旁人CPR') || l.label.includes('OHCA - 無旁人CPR'))?.label;
  const ohcaPADLog = logs.slice().reverse().find(l => l.label.includes('OHCA - 有使用PAD去顫') || l.label.includes('OHCA - 未使用PAD去顫'))?.label;
  const ohcaLastNormalLog = logs.slice().reverse().find(l => l.label.includes('OHCA - 最後正常時間不詳') || l.label.includes('最後正常時間: '));

  React.useEffect(() => {
    if (ohcaWitnessLog?.includes('有')) setWitnessState('YES');
    else if (ohcaWitnessLog?.includes('無')) setWitnessState('NO');

    if (ohcaBystanderLog?.includes('有')) setBystanderState('YES');
    else if (ohcaBystanderLog?.includes('無')) setBystanderState('NO');

    if (ohcaPADLog?.includes('有使用')) setPadState('YES');
    else if (ohcaPADLog?.includes('未使用')) setPadState('NO');

    if (ohcaLastNormalLog) {
      if (ohcaLastNormalLog.label.includes('最後正常時間:')) {
        const timeMatch = ohcaLastNormalLog.label.match(/最後正常時間:\s*(\d{1,2}):(\d{2})/);
        if (timeMatch) setCollapseTimeInput(`${timeMatch[1].padStart(2, '0')}:${timeMatch[2].padStart(2, '0')}`);
      } else if (ohcaLastNormalLog.label.includes('最後正常時間不詳')) {
        setCollapseTimeInput('不詳');
      }
    }
  }, [ohcaWitnessLog, ohcaBystanderLog, ohcaPADLog, ohcaLastNormalLog]);

  let callTimeMs: number | null = null;
  if (globalCallTime && startTime) {
    const match = globalCallTime.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      const hours = parseInt(match[1]);
      const mins = parseInt(match[2]);
      const d = new Date(startTime);
      d.setHours(hours, mins, 0, 0);
      if (d.getTime() > startTime + 60000) {
        d.setDate(d.getDate() - 1);
      }
      callTimeMs = d.getTime();
    }
  }

  let collapseTimeMs: number | null = null;
  if (collapseTimeInput && collapseTimeInput !== '不詳' && startTime) {
    const match = collapseTimeInput.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      const hours = parseInt(match[1]);
      const mins = parseInt(match[2]);
      const d = new Date(startTime);
      d.setHours(hours, mins, 0, 0);
      if (d.getTime() > startTime + 60000) {
        d.setDate(d.getDate() - 1);
      }
      collapseTimeMs = d.getTime();
    }
  }

  const hasBystanderCPR = bystanderState === 'YES';
  
  let noFlowValueMs = -1;
  let noFlowText = '不明';
  if (collapseTimeMs && startTime) {
     if (hasBystanderCPR && callTimeMs) {
         const bystanderCprStartTime = callTimeMs + 60000;
         const diffMs = bystanderCprStartTime - collapseTimeMs;
         if (diffMs >= 0) {
             noFlowValueMs = diffMs;
         }
     } else {
         const diffMs = startTime - collapseTimeMs;
         if (diffMs >= 0) {
             noFlowValueMs = diffMs;
         }
     }
     
     if (noFlowValueMs >= 0) {
         const tMins = Math.floor(noFlowValueMs / 60000);
         if (tMins >= 60) {
             noFlowText = `${Math.floor(tMins / 60)} 小時 ${tMins % 60} 分`;
         } else {
             noFlowText = `${tMins} 分`;
         }
     }
  }

  const referenceTime = currentNow; // Always use currentNow for Low-flow time so it keeps ticking
  let lowFlowMs = 0;
  if (hasBystanderCPR && callTimeMs) {
    lowFlowMs = referenceTime - (callTimeMs + 60000);
  } else if (startTime) {
    lowFlowMs = referenceTime - startTime;
  }
  
  if (lowFlowMs < 0) lowFlowMs = 0;
  const lowFlowMins = Math.floor(lowFlowMs / 60000);
  const lowFlowSecs = Math.floor((lowFlowMs % 60000) / 1000);
  const lowFlowText = `${lowFlowMins} 分 ${lowFlowSecs} 秒`;

  const [copied, setCopied] = React.useState(false);
  
  const formatRealTime = (ts: number | undefined) => {
    if (!ts) return "--:--:--";
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const handleCopy = () => {
    const witnessStr = witnessState === 'YES' ? '有' : witnessState === 'NO' ? '無' : '未記錄';
    const bystanderStr = bystanderState === 'YES' ? '有' : bystanderState === 'NO' ? '無' : '未記錄';
    const padStr = padState === 'YES' ? '有' : padState === 'NO' ? '未' : '未記錄';

    const text = [
      `【CPR急救總結報告】`,
      `首次心律: ${initialRhythm}`,
      `總耗時: ${formatTime(staticDuration)}`,
      `電擊次數: ${shocks} 次`,
      ...(epis > 0 || amios > 0 ? [
        ...(epis > 0 ? [`Epinephrine: ${epis} 劑`] : []),
        ...(amios > 0 ? [`Amiodarone: ${amios} 劑`] : [])
      ] : []),
      `分析迴圈: ${cycles} 次`,
      `心律變化: ${rhythmChangesText}`,
      `快速病史: ${historyText}`,
      ...((!ddxText.includes('無特定') && !ddxText.includes('無明確')) ? [`疑似 5H5T: ${ddxText}`] : []),
      `OHCA 資訊: 倒下時間: ${collapseTimeInput || '未記錄'}, 報案時間: ${globalCallTime || '未記錄'}${emtContactTime ? `, EMT接觸時間: ${emtContactTime}` : ''}, 目擊: ${witnessStr}, 旁人CPR: ${bystanderStr}${padState === 'YES' ? ', PAD去顫: 有' : ''}`,
      `No-flow Time: ${noFlowText}`,
      `Low-flow Time: ${lowFlowText}`,
      `-------------------`,
      `詳細處置紀錄:`,
      ...logs.map(l => `[${formatTime(l.timeOffset)} | ${formatRealTime(l.realTime)}] ${l.label}`)
    ].join('\n');
    
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch((err) => {
      console.error("Failed to copy clipboard:", err);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const toggleState = (current: 'YES'|'NO'|'UNKNOWN', setter: (v: 'YES'|'NO'|'UNKNOWN') => void) => {
    if (current === 'UNKNOWN') setter('YES');
    else if (current === 'YES') setter('NO');
    else setter('UNKNOWN');
  };

  const renderBadgeEditable = (state: 'YES'|'NO'|'UNKNOWN', setter: (v: 'YES'|'NO'|'UNKNOWN') => void, label: string) => {
    if (state === 'UNKNOWN') {
      return (
        <button onClick={() => toggleState(state, setter)} className="flex items-center gap-1 bg-gray-800 hover:bg-gray-700 text-gray-400 px-2 py-1 rounded-md text-xs font-bold border border-gray-700 transition-colors">
          <HelpCircle className="w-3 h-3" />
          {label}不明
        </button>
      );
    }
    const isYes = state === 'YES';
    return (
      <button onClick={() => toggleState(state, setter)} className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold transition-colors ${isYes ? 'bg-green-900/60 hover:bg-green-900/80 text-green-400 border border-green-800/50' : 'bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900/50'}`}>
        {isYes ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
        {label}{isYes ? '是' : '否'}
      </button>
    );
  };

  const renderTimeValue = (text: string) => {
    if (text === '不明') return <span className="text-[35px] font-mono font-bold text-gray-600">不明</span>;
    const hrMatch = text.match(/(\d+)\s*小時\s*(\d+)\s*分/);
    if (hrMatch) {
      return (
        <span className="text-[35px] font-mono font-bold flex items-baseline justify-center">
          {hrMatch[1]}<span className="text-sm font-sans mx-1 opacity-80">小時</span>{hrMatch[2]}<span className="text-sm font-sans ml-1 opacity-80">分</span>
        </span>
      );
    }
    const minSecMatch = text.match(/(\d+)\s*分\s*(\d+)\s*秒/);
    if (minSecMatch) {
      return (
        <span className="text-[35px] font-mono font-bold flex items-baseline justify-center">
          {minSecMatch[1]}<span className="text-sm font-sans mx-1 opacity-80">分</span>{minSecMatch[2]}<span className="text-sm font-sans ml-1 opacity-80">秒</span>
        </span>
      );
    }
    const minMatch = text.match(/(\d+)\s*分/);
    if (minMatch) {
      return (
        <span className="text-[35px] font-mono font-bold flex items-baseline justify-center">
          {minMatch[1]}<span className="text-sm font-sans ml-1 opacity-80">分</span>
        </span>
      );
    }
    return <span className="text-[35px] font-mono font-bold">{text}</span>;
  };

  const handleEpiClick = () => {
    logEvent('EPI', '給藥 - Epinephrine');
    speak('已紀錄 Epinephrine');
  };
  const handleAmioClick = () => {
    logEvent('AMIO', '給藥 - Amiodarone');
    speak('已紀錄 Amiodarone');
  };

  return (
    <div className="flex flex-col h-screen print:block print:h-auto print:overflow-visible w-full max-w-lg mx-auto bg-gray-950 text-white p-6 overflow-y-auto pb-24 relative">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-8 h-8 text-blue-400" />
          <h1 className="text-3xl font-bold">急救總結</h1>
        </div>
        <button
          onClick={() => setIsHighContrast(!isHighContrast)}
          className={cn(
            "p-2 rounded-full font-bold transition-all shadow-inner active:scale-95 border print:hidden",
            isHighContrast
              ? "bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border-indigo-200 hover:border-indigo-300"
              : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20 hover:border-amber-500/40"
          )}
          title="切換高對比模式"
        >
          {isHighContrast ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
        </button>
      </div>

      {/* OHCA 資訊 & 流程時間 置頂 */}

      <div className="bg-gray-900 rounded-xl p-5 border border-gray-700 mb-6 shadow-lg shadow-black/50 print:break-inside-avoid">
        <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-3">
          <h2 className="text-xl font-bold">OHCA 資訊 & 流程時間</h2>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400 font-bold">倒下時間</span>
            <div className="flex items-center gap-2">
              <div className="w-[100px] flex justify-end">
                {collapseTimeInput !== '不詳' ? (
                  <input 
                    type="time" 
                    value={collapseTimeInput}
                    onChange={e => setCollapseTimeInput(e.target.value)}
                    className="w-full bg-gray-800 text-white text-sm px-2 py-1.5 rounded border border-gray-700 text-center focus:outline-none focus:border-blue-500 transition-colors"
                  />
                ) : (
                  <span className="w-full text-center text-sm text-gray-500 bg-gray-950 px-2 py-1.5 rounded border border-transparent font-medium">不詳</span>
                )}
              </div>
              <button 
                 onClick={() => setCollapseTimeInput(prev => prev === '不詳' ? '' : '不詳')}
                className={cn(
                  "text-xs px-2 py-1.5 rounded border transition-colors h-[34px] w-12 flex items-center justify-center font-bold",
                  collapseTimeInput === '不詳' ? 'bg-blue-900/60 text-blue-400 border-blue-700' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border-gray-700'
                )}
              >
                不詳
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400 font-bold">報案時間</span>
            <div className="flex items-center gap-2">
              <div className="w-[100px]">
                <input 
                  type="time" 
                  value={globalCallTime}
                  onChange={e => setGlobalCallTime(e.target.value)}
                  className="w-full bg-gray-800 text-white text-sm px-2 py-1.5 rounded border border-gray-700 text-center focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div className="w-12 h-[34px] shrink-0" />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400 font-bold">EMT接觸時間</span>
            <div className="flex items-center gap-2">
              <div className="w-[100px]">
                <input 
                  type="time" 
                  value={emtContactTime}
                  onChange={e => setEmtContactTime(e.target.value)}
                  className="w-full bg-gray-800 text-white text-sm px-2 py-1.5 rounded border border-gray-700 text-center focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div className="w-12 h-[34px] shrink-0" />
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {renderBadgeEditable(witnessState, setWitnessState, '目擊: ')}
            {renderBadgeEditable(bystanderState, setBystanderState, '旁人CPR: ')}
            {padState === 'YES' && renderBadgeEditable(padState, setPadState, 'PAD去顫: ')}
          </div>
          <div className="grid grid-cols-2 gap-4 mt-2">
            <div className="flex flex-col items-center justify-center bg-gray-950 h-[88px] p-4 rounded-xl border border-gray-800 shadow-inner">
              <span className="text-xs text-gray-500 font-bold mb-1">No-flow Time</span>
              <div className={`text-[35px] font-mono font-bold ${noFlowValueMs >= 600000 ? 'text-red-500' : noFlowText.includes('不明') ? 'text-gray-600' : 'text-orange-500'}`}>
                {renderTimeValue(noFlowText)}
              </div>
            </div>
            <div className="flex flex-col items-center justify-center bg-gray-950 h-[88px] p-4 rounded-xl border border-gray-800 shadow-inner relative">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs text-gray-500 font-bold">Low-flow Time</span>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              </div>
              <div className="text-[35px] font-mono font-bold text-orange-500">
                {renderTimeValue(lowFlowText)}
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* 急救重點摘要 */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-700 mb-6 shadow-lg shadow-black/50">

        <h2 className="text-xl font-bold mb-4 flex items-center justify-between pb-2 border-b border-gray-800">
          <span>院前處置摘要</span>
          <span className="text-sm font-mono text-gray-400 font-normal">總耗時 {formatTime(staticDuration)}</span>
        </h2>
        <ul className="space-y-4">
            <li className="flex justify-between items-center text-sm border-b border-gray-800 pb-2">
                <span className="text-gray-400 font-bold">首次心律</span>
                <span className="font-bold text-white text-base">{initialRhythm}</span>
            </li>
            <li className="flex justify-between items-center text-sm border-b border-gray-800 pb-2">
                <span className="text-gray-400 font-bold">去顫電擊次數</span>
                <span className="font-bold text-orange-500 text-base">{shocks} 次</span>
            </li>
            <li className="flex flex-col justify-start text-sm border-b border-gray-800 pb-2 gap-1.5">
                <span className="text-gray-400 font-bold">心律變化歷程</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {rhythmLogs.length === 0 ? (
                    <span className="font-bold text-teal-400 text-sm">無變化紀錄</span>
                  ) : (
                    rhythmLogs.map((l, idx) => {
                      let rName = l.label.split(' - ')[1] || '';
                      rName = rName.replace('(給予電擊)', '').trim();
                      const isShockable = l.action === 'SHOCK' || rName.toLowerCase().includes('vfib') || rName.toLowerCase().includes('vt');
                      return (
                        <React.Fragment key={l.id}>
                          {idx > 0 && <span className="text-gray-600 font-bold text-xs">➔</span>}
                          <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded border font-bold text-sm", isShockable ? "bg-orange-900/30 text-orange-500 border-orange-900/50" : "bg-gray-800 text-teal-400 border-gray-700")}>
                            {isShockable && <Zap className="w-3.5 h-3.5 text-orange-500" />}
                            {rName}
                          </span>
                        </React.Fragment>
                      );
                    })
                  )}
                </div>
            </li>
            <li className="flex justify-between items-center text-sm pb-1">
                <span className="text-gray-400 font-bold">給藥總數</span>
                <span className="font-bold text-blue-400 text-base">{epis > 0 && amios > 0 ? `Epi ${epis} 劑 / Amio ${amios} 劑` : epis > 0 ? `Epi ${epis} 劑` : amios > 0 ? `Amio ${amios} 劑` : '0 劑'}</span>
            </li>
            
            <li className="flex flex-col gap-2 pt-2 pb-3 border-b border-gray-800">
               <div className="flex justify-between items-center text-sm">
                   <span className="text-gray-400 font-bold">最後給藥經過時間</span>
                   <span className="font-bold text-orange-300 font-mono text-xl">{epiElapsedDynamic !== null ? formatTime(epiElapsedDynamic) : '--:--'}</span>
               </div>
               {/* 互動按鈕區 */}
               <div className="flex gap-2 justify-end mt-1">
                 <button onClick={handleEpiClick} className="flex items-center gap-1.5 bg-blue-900/40 hover:bg-blue-800/60 border border-blue-700/50 text-blue-300 px-3 py-2 rounded-lg text-xs font-bold transition-colors active:scale-95 shadow-sm">
                   <Syringe className="w-3.5 h-3.5" /> 補打 Epi
                 </button>
                 <button onClick={handleAmioClick} className="flex items-center gap-1.5 bg-indigo-900/40 hover:bg-indigo-800/60 border border-indigo-700/50 text-indigo-300 px-3 py-2 rounded-lg text-xs font-bold transition-colors active:scale-95 shadow-sm">
                   <Syringe className="w-3.5 h-3.5" /> 補打 Amio
                 </button>
               </div>
            </li>
            <li className="flex flex-col items-start text-sm gap-1 pt-1">
                <span className="text-gray-400 font-bold">快速病史</span>
                <span className={`font-bold ${historyText.includes('未記錄') ? 'text-gray-500 font-normal' : 'text-yellow-500'}`}>{historyText}</span>
            </li>
            {(!ddxText.includes('無特定') && !ddxText.includes('無明確')) && (
              <li className="flex flex-col items-start text-sm gap-1 mt-2">
                  <span className="text-gray-400 font-bold">疑似 5H5T</span>
                  <span className="font-bold text-orange-400 bg-orange-900/20 px-2 py-1 rounded-md border border-orange-900/50">{ddxText}</span>
              </li>
            )}
        </ul>
      </div>

      <h2 className="text-xl font-bold mb-4 border-b border-gray-800 pb-2">事件時間軸</h2>
      <div className="relative pl-6 ml-2 border-l-2 border-gray-800 space-y-4 mb-8 flex-1 pb-4">
        {renderLogs.map((log) => {
          let style;
          let dotColorClass = "bg-gray-400";
          let pulseRing = false;

          switch (log.action) {
            case 'SHOCK': 
              style = { color: 'text-orange-400', bg: 'bg-orange-950/40', border: 'border-orange-500/30', icon: <Zap className="w-5 h-5 text-orange-500" /> }; 
              dotColorClass = "bg-orange-500 ring-4 ring-orange-500/20";
              break;
            case 'EPI': 
            case 'AMIO': 
              style = { color: 'text-blue-400', bg: 'bg-blue-950/40', border: 'border-blue-500/30', icon: <Syringe className="w-5 h-5 text-blue-500" /> }; 
              dotColorClass = "bg-blue-500 ring-4 ring-blue-500/20";
              break;
            case 'ROSC': 
              if (log.label.includes('再度OHCA') || log.label.includes('Re-arrest')) {
                style = { color: 'text-red-400', bg: 'bg-red-950/40', border: 'border-red-500/30', icon: <HeartPulse className="w-5 h-5 text-red-500" /> }; 
                dotColorClass = "bg-red-500 ring-4 ring-red-500/30";
                pulseRing = false;
              } else {
                style = { color: 'text-green-400', bg: 'bg-green-950/40', border: 'border-green-500/30', icon: <HeartPulse className="w-5 h-5 text-green-500" /> }; 
                dotColorClass = "bg-green-500 ring-4 ring-green-500/30";
                pulseRing = true;
              }
              break;
            case 'START':
            case 'STOP': 
              style = { color: 'text-white', bg: 'bg-gray-900/60', border: 'border-gray-700/50', icon: <Clock className="w-5 h-5 text-gray-400" /> }; 
              dotColorClass = "bg-white ring-4 ring-white/20";
              break;
            case 'CYCLE_RESET': 
              style = { color: 'text-purple-400', bg: 'bg-purple-950/40', border: 'border-purple-500/30', icon: <RefreshCcw className="w-5 h-5 text-purple-500" /> }; 
              dotColorClass = "bg-purple-500 ring-4 ring-purple-500/20";
              break;
            case 'AIRWAY': 
              style = { color: 'text-teal-400', bg: 'bg-teal-950/40', border: 'border-teal-500/30', icon: <Wind className="w-5 h-5 text-teal-500" /> }; 
              dotColorClass = "bg-teal-500 ring-4 ring-teal-500/20";
              break;
            case 'IV': 
              style = { color: 'text-blue-400', bg: 'bg-blue-950/40', border: 'border-blue-500/30', icon: <Droplet className="w-5 h-5 text-blue-500" /> }; 
              dotColorClass = "bg-blue-400 ring-4 ring-blue-400/20";
              break;
            case 'IO': 
              style = { color: 'text-purple-400', bg: 'bg-purple-950/40', border: 'border-purple-500/30', icon: <Bone className="w-5 h-5 text-purple-500" /> }; 
              dotColorClass = "bg-purple-400 ring-4 ring-purple-400/20";
              break;
            case 'PROCEDURE': 
              style = { color: 'text-yellow-400', bg: 'bg-yellow-950/40', border: 'border-yellow-500/30', icon: <ActivitySquare className="w-5 h-5 text-yellow-500" /> }; 
              dotColorClass = "bg-yellow-500 ring-4 ring-yellow-500/20";
              break;
            case 'VITALS': 
              style = { color: 'text-indigo-400', bg: 'bg-indigo-950/40', border: 'border-indigo-500/30', icon: <Pencil className="w-5 h-5 text-indigo-500" /> }; 
              dotColorClass = "bg-indigo-500 ring-4 ring-indigo-500/20";
              break;
            case 'RHYTHM': 
              style = { color: 'text-gray-300', bg: 'bg-gray-900/60', border: 'border-gray-800/50', icon: <Activity className="w-5 h-5 text-gray-400" /> }; 
              dotColorClass = "bg-gray-400 ring-4 ring-gray-400/20";
              break;
            default: 
              style = { color: 'text-gray-300', bg: 'bg-gray-900/50', border: 'border-transparent', icon: <Activity className="w-5 h-5 text-gray-500" /> }; 
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

              <div className={`flex items-center gap-4 p-3 rounded-xl border ${style.bg} ${style.border}`}>
                <div className="flex flex-col shrink-0 w-16">
                  <span className="text-gray-400 font-mono text-sm font-bold">{formatTime(log.timeOffset)}</span>
                  <span className="text-gray-500 font-mono text-xs">{formatRealTime(log.realTime)}</span>
                </div>
                <div className="shrink-0">
                   {style.icon}
                </div>
                <div className="flex flex-col gap-2 w-full">
                  <span className={`font-semibold leading-relaxed ${style.color}`}>{logLabel}</span>
                  {log.photoUrl && (
                    <img 
                      src={log.photoUrl} 
                      alt="Captured record" 
                      className="w-full max-w-[200px] rounded-lg border border-gray-700 object-cover mt-1 animate-in zoom-in-95 duration-150" 
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-auto grid grid-cols-1 sm:grid-cols-3 gap-3 print:hidden">
        <button
          onClick={handleCopy}
          className={`flex items-center justify-center gap-2 py-4 ${copied ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-800 hover:bg-gray-700'} text-white rounded-xl font-bold transition-all`}
        >
          <ClipboardList className="w-5 h-5" />
          {copied ? '已複製！' : '複製報告'}
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center justify-center gap-2 py-4 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold transition-all"
        >
          <FileText className="w-5 h-5" />
          製作 PDF
        </button>
        <button
          onPointerDown={handleCompletePointerDown}
          onPointerUp={handleCompletePointerUpOrLeave}
          onPointerLeave={handleCompletePointerUpOrLeave}
          onPointerCancel={handleCompletePointerUpOrLeave}
          onContextMenu={(e) => e.preventDefault()}
          style={{ touchAction: 'none' }}
          className="flex items-center justify-center gap-2 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-900/30 transition-all relative overflow-hidden select-none active:scale-95"
        >
          <div className="absolute inset-y-0 left-0 bg-blue-400/50 transition-all ease-linear" style={{ width: `${completePressProgress}%` }} />
          <CheckCircle className="w-5 h-5 relative z-10" />
          <span className="relative z-10">長按3秒結束</span>
        </button>
      </div>

      {showCompleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-700 rounded-3xl w-full max-w-sm shadow-2xl shadow-black overflow-hidden relative flex flex-col mx-auto animate-in slide-in-from-bottom-8 duration-300 ease-out">
            <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-gray-950">
              <h3 className="text-xl font-bold text-white tracking-wide">確認結束急救</h3>
              <button onClick={() => setShowCompleteConfirm(false)} className="text-gray-400 hover:text-white pb-1 px-2 text-3xl leading-none">&times;</button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <p className="text-gray-300">確定要完成並返回主畫面嗎？返回後所有急救病歷紀錄將會清除，且無法復原。</p>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <button 
                  onClick={() => setShowCompleteConfirm(false)}
                  className="p-4 border border-gray-700 bg-gray-800 hover:bg-gray-700 rounded-xl font-bold text-gray-300 transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={() => {
                    setShowCompleteConfirm(false);
                    onReset();
                  }}
                  className="p-4 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold text-white shadow-lg shadow-blue-900/20 transition-all active:scale-95"
                >
                  確認返回
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
