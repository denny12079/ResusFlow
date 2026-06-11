let audioCtx: AudioContext | null = null;
let timerID: number | null = null;
let isPlaying = false;
let nextNoteTime = 0.0;
const lookahead = 25.0; // ms
const scheduleAheadTime = 0.1; // s

export function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

export function setMetronome(state: boolean, bpm: number = 110) {
  initAudio();
  if (state && !isPlaying) {
    isPlaying = true;
    nextNoteTime = audioCtx!.currentTime + 0.05;
    scheduler(bpm);
  } else if (!state && isPlaying) {
    isPlaying = false;
    if (timerID) window.clearTimeout(timerID);
  }
}

function nextNote(bpm: number) {
  const secondsPerBeat = 60.0 / bpm;
  nextNoteTime += secondsPerBeat;
}

function playNote(time: number) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.frequency.value = 880; // A5 tone, loud and clear
  osc.type = 'sine';
  
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(1, time + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
  
  osc.start(time);
  osc.stop(time + 0.1);
}

function scheduler(bpm: number) {
  if (!isPlaying || !audioCtx) return;
  while (nextNoteTime < audioCtx.currentTime + scheduleAheadTime) {
    playNote(nextNoteTime);
    nextNote(bpm);
  }
  timerID = window.setTimeout(() => scheduler(bpm), lookahead);
}
