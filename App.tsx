
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Message, DailyStats, MealType, Reminder, ReminderType } from './types';
import { sendMessage, generateSpeech } from './geminiService';

interface BreathingPattern {
  name: string;
  description: string;
  guideText: string;
  inhale: number;
  hold?: number;
  exhale: number;
  holdPost?: number;
}

const BREATHING_PATTERNS: Record<string, BreathingPattern> = {
  '4-7-8': {
    name: 'Técnica 4-7-8',
    description: 'Ideal para reduzir a ansiedade e urgência alimentar.',
    guideText: 'A técnica 4-7-8 ajuda a acalmar o sistema nervoso. Inspire pelo nariz contando até quatro. Segure o ar por sete segundos. E solte lentamente pela boca por oito segundos. Siga o ritmo do círculo.',
    inhale: 4000,
    hold: 7000,
    exhale: 8000
  },
  'quadrada': {
    name: 'Respiração Quadrada',
    description: 'Foco total e equilíbrio emocional.',
    guideText: 'A respiração quadrada traz equilíbrio. Inspire por quatro segundos. Segure por quatro. Expire por quatro. E aguarde mais quatro antes da próxima infração. Vamos começar.',
    inhale: 4000,
    hold: 4000,
    exhale: 4000,
    holdPost: 4000
  },
  'calma': {
    name: 'Respiração Profunda',
    description: 'Acalma o sistema nervoso rapidamente.',
    guideText: 'Feche os olhos se desejar. Inspire profundamente prechendo o abdômen. E expire soltando todo o ar, relaxando os ombros. Siga o movimento suave do guia.',
    inhale: 5000,
    exhale: 5000
  }
};

// URL direta da imagem realista enviada pela Gizele
const REALISTIC_PHOTO_URL = 'https://files.oaiusercontent.com/file-NAn5m2mUo9G3V9Yf7Xyv9P';

const App: React.FC = () => {
  const [userPhoto, setUserPhoto] = useState<string>(() => {
    return localStorage.getItem('mindful_user_photo') || REALISTIC_PHOTO_URL;
  });
  
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      text: 'Olá! Sou Gizele Anastacio, sua Terapeuta Comportamental. Estou aqui para te apoiar na sua jornada de bem-estar e equilíbrio com a comida. Como você está se sentindo em relação à sua alimentação hoje?',
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeBreathing, setActiveBreathing] = useState<BreathingPattern | null>(null);
  const [breathingStep, setBreathingStep] = useState<'Inspirar' | 'Segurar' | 'Expirar' | 'Aguardar'>('Inspirar');
  const [audioLoading, setAudioLoading] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showReminderSettings, setShowReminderSettings] = useState(false);
  const [activeNotification, setActiveNotification] = useState<{title: string, message: string} | null>(null);
  
  const [stats, setStats] = useState<DailyStats>(() => {
    const saved = localStorage.getItem('mindful_stats');
    return saved ? JSON.parse(saved) : { pauses: 0, moodScores: [], meals: [] };
  });

  const [reminders, setReminders] = useState<Reminder[]>(() => {
    const saved = localStorage.getItem('mindful_reminders');
    return saved ? JSON.parse(saved) : [
      { id: '1', time: '10:00', type: 'pause', enabled: true },
      { id: '2', time: '15:00', type: 'pause', enabled: true },
      { id: '3', time: '20:00', type: 'log', enabled: true },
    ];
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTriggeredRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    localStorage.setItem('mindful_stats', JSON.stringify(stats));
  }, [stats]);

  useEffect(() => {
    localStorage.setItem('mindful_reminders', JSON.stringify(reminders));
  }, [reminders]);

  useEffect(() => {
    localStorage.setItem('mindful_user_photo', userPhoto);
  }, [userPhoto]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      if (lastTriggeredRef.current === currentTime) return;
      const matchedReminder = reminders.find(r => r.enabled && r.time === currentTime);
      if (matchedReminder) {
        lastTriggeredRef.current = currentTime;
        triggerNotification(matchedReminder);
      }
    };
    const interval = setInterval(checkReminders, 10000); 
    return () => clearInterval(interval);
  }, [reminders]);

  const triggerNotification = (reminder: Reminder) => {
    const title = reminder.type === 'pause' ? '🌬️ Hora de uma Pausa' : '📓 Registro de Bem-estar';
    const message = reminder.type === 'pause' 
      ? 'Gizele aqui: que tal pararmos um minuto para respirar?' 
      : 'Como foi sua última refeição? Vamos conversar sobre isso.';
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body: message, icon: userPhoto });
    }
    setActiveNotification({ title, message });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setUserPhoto(base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (!activeBreathing) {
      stopAudio();
      return;
    }
    let timeoutId: number;
    const runCycle = () => {
      setBreathingStep('Inspirar');
      timeoutId = window.setTimeout(() => {
        if (activeBreathing.hold) {
          setBreathingStep('Segurar');
          timeoutId = window.setTimeout(() => {
            setBreathingStep('Expirar');
            timeoutId = window.setTimeout(() => {
              if (activeBreathing.holdPost) {
                setBreathingStep('Aguardar');
                timeoutId = window.setTimeout(runCycle, activeBreathing.holdPost);
              } else {
                runCycle();
              }
            }, activeBreathing.exhale);
          }, activeBreathing.hold);
        } else {
          setBreathingStep('Expirar');
          timeoutId = window.setTimeout(runCycle, activeBreathing.exhale);
        }
      }, activeBreathing.inhale);
    };
    runCycle();
    return () => window.clearTimeout(timeoutId);
  }, [activeBreathing]);

  const stopAudio = () => {
    if (currentAudioSourceRef.current) {
      try { currentAudioSourceRef.current.stop(); } catch (e) {}
      currentAudioSourceRef.current = null;
    }
  };

  const decodeAndPlayAudio = async (base64Audio: string) => {
    stopAudio();
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') await ctx.resume();
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    const dataInt16 = new Int16Array(bytes.buffer);
    const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
    currentAudioSourceRef.current = source;
  };

  const playGuideAudio = async (text: string) => {
    if (isAudioMuted) return;
    setAudioLoading(true);
    const audioData = await generateSpeech(text);
    if (audioData) await decodeAndPlayAudio(audioData);
    setAudioLoading(false);
  };

  const handleSend = async (textOverride?: string) => {
    const textToSubmit = textOverride || inputText;
    if (!textToSubmit.trim() || isLoading) return;
    const userMessage: Message = { role: 'user', text: textToSubmit, timestamp: new Date() };
    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);
    try {
      const responseText = await sendMessage(textToSubmit);
      const aiMessage: Message = { role: 'model', text: responseText || 'Houve um problema na conexão.', timestamp: new Date() };
      setMessages((prev) => [...prev, aiMessage]);
      const lowText = textToSubmit.toLowerCase();
      if (lowText.includes('refeição') || lowText.includes('comi')) {
        const isMindful = !lowText.includes('rápido') && !lowText.includes('excesso');
        setStats(prev => ({ ...prev, meals: [...prev.meals, isMindful ? 'mindful' : 'unmindful'] }));
      }
      if (lowText.includes('feliz') || lowText.includes('bem') || lowText.includes('consegui')) {
        setStats(prev => ({ ...prev, moodScores: [...prev.moodScores, 5] }));
      } else if (lowText.includes('difícil') || lowText.includes('triste') || lowText.includes('ansiosa')) {
        setStats(prev => ({ ...prev, moodScores: [...prev.moodScores, 2] }));
      }
    } catch (error) { console.error(error); } finally { setIsLoading(false); }
  };

  const handlePausingTechnique = (key: string) => {
    const pattern = BREATHING_PATTERNS[key];
    setActiveBreathing(pattern);
    playGuideAudio(pattern.guideText);
  };

  const concludeBreathing = () => {
    setActiveBreathing(null);
    setStats(prev => ({ ...prev, pauses: prev.pauses + 1 }));
    stopAudio();
  };

  const toggleReminder = (id: string) => setReminders(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  const deleteReminder = (id: string) => setReminders(prev => prev.filter(r => r.id !== id));
  const addReminder = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    setReminders(prev => [...prev, { id: newId, time: '12:00', type: 'pause', enabled: true }]);
  };
  const updateReminderTime = (id: string, time: string) => setReminders(prev => prev.map(r => r.id === id ? { ...r, time } : r));

  const averageMood = useMemo(() => {
    if (stats.moodScores.length === 0) return 0;
    return (stats.moodScores.reduce((a, b) => a + b, 0) / stats.moodScores.length).toFixed(1);
  }, [stats.moodScores]);

  const mindfulMealsCount = useMemo(() => stats.meals.filter(m => m === 'mindful').length, [stats.meals]);

  // Mood Trend Chart Generator
  const renderMoodChart = () => {
    if (stats.moodScores.length < 2) {
      return (
        <div className="flex flex-col items-center justify-center h-32 bg-[#fdfaf6]/50 rounded-xl border border-dashed border-purple-200 mt-2">
          <p className="text-[10px] text-purple-400 font-medium">Continue conversando para gerar tendência</p>
        </div>
      );
    }

    const height = 80;
    const width = 280;
    const padding = 10;
    const scores = stats.moodScores;
    const maxScore = 5;
    const minScore = 1;

    const points = scores.map((score, i) => {
      const x = padding + (i / (scores.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((score - minScore) / (maxScore - minScore)) * (height - 2 * padding);
      return `${x},${y}`;
    }).join(' ');

    return (
      <div className="mt-4 animate-scale-in">
        <div className="flex justify-between text-[8px] text-purple-400 uppercase tracking-tighter mb-1 font-bold">
          <span>Início</span>
          <span>Tendência de Humor</span>
          <span>Agora</span>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto drop-shadow-sm">
          {/* Grid lines */}
          {[1, 2, 3, 4, 5].map(v => {
            const y = height - padding - ((v - minScore) / (maxScore - minScore)) * (height - 2 * padding);
            return <line key={v} x1={padding} y1={y} x2={width - padding} y2={y} stroke="#f3e8ff" strokeWidth="0.5" strokeDasharray="2,2" />;
          })}
          {/* Line */}
          <polyline
            fill="none"
            stroke="#9b89b3"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
            className="transition-all duration-1000"
          />
          {/* Points */}
          {scores.map((score, i) => {
            const x = padding + (i / (scores.length - 1)) * (width - 2 * padding);
            const y = height - padding - ((score - minScore) / (maxScore - minScore)) * (height - 2 * padding);
            return (
              <circle key={i} cx={x} cy={y} r="3" fill="white" stroke="#9b89b3" strokeWidth="2" />
            );
          })}
        </svg>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-white shadow-xl overflow-hidden relative">
      <header className="bg-[#9b89b3] text-white p-4 flex items-center justify-between shadow-md z-10 border-b border-white/10 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-lg bg-[#fdfaf6] transform transition-transform hover:scale-110 active:scale-95 duration-300">
            <img 
              src={userPhoto} 
              alt="Gizele Anastacio" 
              className="w-full h-full object-cover"
              style={{ objectPosition: 'center top' }}
            />
          </div>
          <div>
            <h1 className="font-bold text-base md:text-lg leading-tight">Gizele Anastacio</h1>
            <p className="text-[10px] md:text-xs text-purple-100 opacity-90 font-medium">Terapeuta Comportamental de Emagrecimento</p>
          </div>
        </div>
        <div className="flex gap-1 md:gap-2">
          <button onClick={() => { setShowReminderSettings(true); setShowDashboard(false); }} className="p-2 rounded-full hover:bg-white/10 transition-all hover:scale-110 active:scale-90">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>
          <button onClick={() => { setShowDashboard(!showDashboard); setShowReminderSettings(false); }} className={`p-2 rounded-full transition-all hover:scale-110 active:scale-90 ${showDashboard ? 'bg-white/30' : 'hover:bg-white/10'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          </button>
        </div>
      </header>

      {activeNotification && (
        <div className="absolute top-20 inset-x-4 z-[100] bg-white border-2 border-[#9b89b3] rounded-2xl p-4 shadow-2xl animate-scale-in">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full overflow-hidden border border-purple-200 shadow-sm flex-shrink-0">
              <img src={userPhoto} alt="Gizele" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-[#9b89b3]">{activeNotification.title}</h4>
              <p className="text-sm text-gray-600 mb-3">{activeNotification.message}</p>
              <div className="flex gap-2">
                <button onClick={() => { handlePausingTechnique('calma'); setActiveNotification(null); }} className="px-4 py-1.5 bg-[#9b89b3] text-white rounded-lg text-xs font-bold hover:brightness-110 transition-all active:scale-95">Fazer Pausa</button>
                <button onClick={() => setActiveNotification(null)} className="px-4 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 transition-all active:scale-95">Depois</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showReminderSettings && (
        <div className="absolute top-[72px] inset-0 bg-white z-40 overflow-y-auto p-6 animate-fade-in-up">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-[#9b89b3]">Meus Lembretes</h2>
            <button onClick={() => setShowReminderSettings(false)} className="text-gray-400 p-2 hover:text-gray-600 transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
          <div className="space-y-4">
            {reminders.map(reminder => (
              <div key={reminder.id} className="bg-[#fdfaf6] border border-purple-50 p-4 rounded-2xl flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-full transition-colors ${reminder.type === 'pause' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>{reminder.type === 'pause' ? '🌬️' : '📓'}</div>
                  <div>
                    <input type="time" value={reminder.time} onChange={(e) => updateReminderTime(reminder.id, e.target.value)} className="text-lg font-bold bg-transparent focus:outline-none text-[#9b89b3] hover:underline cursor-pointer" />
                    <p className="text-xs text-gray-500 font-medium">{reminder.type === 'pause' ? 'Pausa' : 'Registro'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => toggleReminder(reminder.id)} className={`w-12 h-6 rounded-full transition-all relative ${reminder.enabled ? 'bg-[#9b89b3]' : 'bg-gray-300'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${reminder.enabled ? 'left-7' : 'left-1'}`} /></button>
                  <button onClick={() => deleteReminder(reminder.id)} className="text-gray-400 hover:text-red-500 transition-all hover:scale-110 active:scale-90"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                </div>
              </div>
            ))}
            <button onClick={addReminder} className="w-full py-4 border-2 border-dashed border-purple-200 rounded-2xl text-purple-700 font-bold text-sm hover:bg-purple-50 hover:border-purple-300 transition-all flex items-center justify-center gap-2 group"><svg className="w-5 h-5 group-hover:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>Novo Lembrete</button>
          </div>
        </div>
      )}

      {showDashboard && (
        <div className="absolute top-[72px] inset-x-0 bottom-0 bg-white z-40 overflow-y-auto p-6 animate-fade-in-up">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-[#9b89b3]">Painel de Controle</h2>
            <button onClick={() => setShowDashboard(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
          
          {/* User Photo Upload Section - Realistic Design */}
          <div className="bg-[#fdfaf6] border border-purple-100 rounded-3xl p-8 mb-8 shadow-sm flex flex-col items-center gap-6 animate-scale-in">
            <div className="relative">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white shadow-2xl ring-4 ring-purple-50/50">
                <img src={userPhoto} alt="Perfil Realista" className="w-full h-full object-cover" />
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-1 right-1 bg-[#9b89b3] text-white p-2.5 rounded-full shadow-xl hover:scale-110 active:scale-90 transition-all border-4 border-white"
                title="Trocar Foto"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept="image/*" 
                className="hidden" 
              />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-extrabold text-[#9b89b3] mb-1">Gizele Anastacio</h3>
              <p className="text-sm text-gray-500 font-medium">Toque para atualizar sua foto profissional</p>
              {userPhoto !== REALISTIC_PHOTO_URL && (
                <button 
                  onClick={() => setUserPhoto(REALISTIC_PHOTO_URL)} 
                  className="mt-3 text-xs text-purple-700 underline hover:text-purple-900 transition-colors"
                >
                  Restaurar foto original
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {/* Expanded Mood Section with Chart */}
            <div className="bg-purple-50 rounded-2xl p-6 border border-purple-100 transition-all hover:shadow-md">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="text-xs font-bold text-purple-800 uppercase tracking-widest mb-1">Humor & Bem-estar</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-5xl font-black text-purple-700">{averageMood}</span>
                    <div className="text-xs text-purple-600 leading-tight font-medium">
                      Média de<br/>satisfação
                    </div>
                  </div>
                </div>
                <div className="p-3 bg-white rounded-full text-2xl shadow-sm">
                  {Number(averageMood) >= 4 ? '✨' : Number(averageMood) >= 2.5 ? '⚖️' : '🌱'}
                </div>
              </div>
              {renderMoodChart()}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#fdfaf6] rounded-2xl p-5 border border-purple-100 transition-transform hover:-translate-y-1">
                <h3 className="text-sm font-semibold text-purple-800 uppercase tracking-wider mb-4">Pausas Realizadas</h3>
                <div className="flex items-end gap-3"><span className="text-4xl font-black text-[#9b89b3] animate-pulse-subtle">{stats.pauses}</span></div>
              </div>
              <div className="bg-[#fdfaf6] rounded-2xl p-5 border border-purple-100 transition-transform hover:-translate-y-1">
                <h3 className="text-sm font-semibold text-purple-800 uppercase tracking-wider mb-2">Refeições Conscientes</h3>
                <div className="flex justify-between items-center mb-3"><span className="text-4xl font-black text-orange-400">{mindfulMealsCount} / {stats.meals.length || 0}</span></div>
                <div className="h-2 w-full bg-purple-100/50 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-300 transition-all duration-1000" style={{ width: stats.meals.length > 0 ? `${(mindfulMealsCount/stats.meals.length)*100}%` : '0%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeBreathing && (
        <div className="absolute inset-0 z-50 bg-[#fdfaf6]/95 flex flex-col items-center justify-center p-8 animate-fade-in-up">
          <div className="absolute top-6 right-6 flex gap-2">
            <button onClick={() => setIsAudioMuted(!isAudioMuted)} className="p-2 text-gray-500 hover:text-[#9b89b3] transition-all hover:scale-110">
              {isAudioMuted ? <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg> : <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>}
            </button>
            <button onClick={() => { setActiveBreathing(null); stopAudio(); }} className="p-2 text-gray-400 hover:text-gray-600 transition-all hover:rotate-90"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-[#9b89b3] mb-2">{activeBreathing.name}</h2>
            <p className="text-gray-600 max-w-xs mx-auto">{activeBreathing.description}</p>
          </div>
          <div className="relative flex items-center justify-center">
            <div className={`rounded-full bg-purple-100 opacity-40 transition-all ease-in-out ${breathingStep === 'Inspirar' ? 'scale-[2.5]' : breathingStep === 'Expirar' ? 'scale-100' : 'scale-[2.5]'}`} style={{ width: '120px', height: '120px', transitionDuration: `${breathingStep === 'Inspirar' ? activeBreathing.inhale : activeBreathing.exhale}ms` }} />
            <div className="absolute w-32 h-32 bg-[#9b89b3] rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg border-4 border-white transform transition-transform duration-500">{breathingStep}</div>
          </div>
          <div className="mt-16 flex gap-4">
             <button onClick={() => playGuideAudio(activeBreathing.guideText)} disabled={audioLoading} className="flex items-center gap-2 px-4 py-2 bg-white border border-purple-200 rounded-full text-sm font-medium text-purple-800 shadow-sm hover:bg-purple-50 transition-all active:scale-95">{audioLoading ? <div className="w-4 h-4 border-2 border-purple-800 border-t-transparent rounded-full animate-spin"></div> : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.983 5.983 0 01-1.414 4.243 1 1 0 11-1.415-1.415A3.987 3.987 0 0013 10a3.987 3.987 0 00-1.414-2.828 1 1 0 010-1.415z"/></svg>} Ouvir Guia</button>
             <button onClick={concludeBreathing} className="px-6 py-2 bg-[#9b89b3] text-white rounded-full text-sm font-bold shadow-md hover:bg-[#7d6b91] transition-all active:scale-95">Concluir</button>
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 chat-gradient custom-scrollbar">
        {messages.map((msg, idx) => {
          const isLatest = idx === messages.length - 1;
          const isModel = msg.role === 'model';
          return (
            <div key={idx} className="space-y-3">
              <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                {isModel && (
                  <div className="w-9 h-9 rounded-full overflow-hidden mr-3 mt-1 shadow-md border-2 border-purple-50 flex-shrink-0 transform hover:scale-125 transition-transform">
                    <img src={userPhoto} alt="Gizele Professional" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className={`max-w-[85%] p-4 ${msg.role === 'user' ? 'bubble-user' : 'bubble-ai'}`}>
                  <p className="text-sm md:text-base whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  <span className={`text-[10px] block mt-2 opacity-50 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
              {isModel && isLatest && !isLoading && (
                <div className="flex flex-wrap gap-2 px-1 ml-10">
                  <button onClick={() => handleSend('Gizele, fiz uma refeição consciente agora e quero registrar.')} className="chip-stagger animate-scale-in px-3 py-1.5 bg-white border border-purple-200 text-purple-800 rounded-full text-[11px] font-bold shadow-sm hover:bg-purple-50 hover:border-purple-400 transition-all active:scale-90">🍴 Registrar refeição mindful</button>
                  <button onClick={() => handlePausingTechnique('4-7-8')} className="chip-stagger animate-scale-in px-3 py-1.5 bg-white border border-purple-200 text-purple-800 rounded-full text-[11px] font-bold shadow-sm hover:bg-purple-50 hover:border-purple-400 transition-all active:scale-90">🌬️ Respiração 4-7-8</button>
                  <button onClick={() => handleSend('Me ajuda a lembrar de uma vitória de hoje?')} className="chip-stagger animate-scale-in px-3 py-1.5 bg-white border border-purple-200 text-purple-800 rounded-full text-[11px] font-bold shadow-sm hover:bg-purple-50 hover:border-purple-400 transition-all active:scale-90">🏆 Lembrar vitória</button>
                </div>
              )}
            </div>
          );
        })}
        {isLoading && (
          <div className="flex justify-start ml-12 animate-fade-in-up">
            <div className="bubble-ai p-4 flex gap-1.5 items-center shadow-sm">
              <div className="w-2 h-2 bg-purple-100 rounded-full animate-bounce [animation-duration:0.6s]"></div>
              <div className="w-2 h-2 bg-purple-200 rounded-full animate-bounce [animation-delay:0.2s] [animation-duration:0.6s]"></div>
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:0.4s] [animation-duration:0.6s]"></div>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-2 border-t border-gray-100 overflow-x-auto whitespace-nowrap bg-[#fdfaf6]/50">
        <div className="flex gap-2">
          <div className="group relative">
            <button className="px-3 py-1.5 bg-[#9b89b3] text-white rounded-full text-xs font-bold hover:brightness-110 transition-all shadow-sm flex items-center gap-1 active:scale-95">🌬️ Pausa Guiada</button>
            <div className="hidden group-hover:flex absolute bottom-full left-0 mb-2 flex-col gap-1 bg-white border border-purple-100 p-2 rounded-xl shadow-xl z-20 animate-scale-in">
              {Object.keys(BREATHING_PATTERNS).map(key => (
                <button key={key} onClick={() => handlePausingTechnique(key)} className="text-left px-3 py-2 hover:bg-purple-50 rounded-lg text-xs font-medium text-purple-900 whitespace-nowrap">{BREATHING_PATTERNS[key].name}</button>
              ))}
            </div>
          </div>
          <button onClick={() => handleSend('Gizele, como registro meu diário emocional de hoje?')} className="px-3 py-1.5 bg-white border border-purple-100 rounded-full text-xs font-medium text-purple-800 hover:bg-purple-50 hover:border-purple-300 transition-all shadow-sm active:scale-95">📓 Diário Emocional</button>
          <button onClick={() => handleSend('Quero compartilhar uma vitória não-relacionada à balança!')} className="px-3 py-1.5 bg-white border border-purple-100 rounded-full text-xs font-medium text-purple-800 hover:bg-purple-50 hover:border-purple-300 transition-all shadow-sm active:scale-95">🏆 Vitória</button>
        </div>
      </div>

      <footer className="p-4 border-t border-gray-100 bg-white">
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2 items-center">
          <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Olá Gizele, hoje eu senti que..." className="flex-1 p-3.5 bg-[#fdfaf6] rounded-xl border border-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:bg-white transition-all text-sm shadow-inner" />
          <button type="submit" disabled={!inputText.trim() || isLoading} className={`p-3.5 rounded-xl transition-all shadow-lg transform active:scale-90 ${!inputText.trim() || isLoading ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#9b89b3] text-white hover:bg-[#7d6b91] hover:scale-105 active:brightness-90'}`}><svg className={`w-5 h-5 transition-transform ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg></button>
        </form>
      </footer>
    </div>
  );
};

export default App;
