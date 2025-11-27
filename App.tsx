import React, { useState, useEffect, useRef } from 'react';
import { Staff, Gender, DailyRecord, ShiftType } from './types';
import { OPENING_JOBS, CLOSING_JOBS, JOB_TEMPLATES } from './constants';
import { 
  Plus, Trash2, User, Calendar, Copy, RotateCcw, Save, 
  CheckCircle2, AlertCircle, RefreshCw, X, Cloud, Loader2
} from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState<'schedule' | 'staff' | 'history'>('schedule');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [data, setData] = useState<{
    staff: Staff[];
    history: DailyRecord[];
    masterQueue: string[]; 
  }>({
    staff: [],
    history: [],
    masterQueue: [], 
  });

  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance] = useState<Set<string>>(new Set());
  
  // Assignments state
  const [openingAssignments, setOpeningAssignments] = useState<Record<string, string[]>>({});
  const [closingAssignments, setClosingAssignments] = useState<Record<string, string[]>>({});
  
  // Mobile Interaction State
  const [selectedStaffForMove, setSelectedStaffForMove] = useState<{
    id: string;
    fromJobId: string;
    shiftType: ShiftType;
  } | null>(null);

  // --- API & Sync Logic ---

  const fetchData = async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const serverData = await res.json();
        // Compare stringified to avoid unnecessary re-renders or state resets if data hasn't changed
        setData(prev => {
          if (JSON.stringify(prev) === JSON.stringify(serverData)) return prev;
          return serverData;
        });
      }
    } catch (err) {
      console.error("Failed to fetch data", err);
    } finally {
      setLoading(false);
    }
  };

  // Initial Load & Polling
  useEffect(() => {
    fetchData();
    // Poll every 5 seconds to keep clients in sync
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Save to Server
  const persistData = async (newData: typeof data) => {
    setSaving(true);
    // Optimistic Update
    setData(newData);
    try {
      await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newData)
      });
    } catch (err) {
      console.error("Failed to save data", err);
      alert("同步数据失败，请检查网络");
    } finally {
      setSaving(false);
    }
  };

  // --- Effects ---

  // Initialize attendance when date changes or data loads
  useEffect(() => {
    const record = data.history.find(r => r.date === selectedDate);
    if (record) {
      setAttendance(new Set(record.attendanceIds));
      setOpeningAssignments(record.openingAssignments);
      setClosingAssignments(record.closingAssignments);
    } else {
      // Default to all active staff if no record for today
      // Only reset if we switched to a date that truly has no record
      // We don't want to reset if we are just polling data updates
      setAttendance(prev => prev.size > 0 ? prev : new Set(data.staff.filter(s => s.active).map(s => s.id)));
      setOpeningAssignments({});
      setClosingAssignments({});
    }
  }, [data.history, selectedDate, data.staff]); // Keep dependencies safe

  // --- Logic: Staff ---

  const addStaff = (name: string, gender: Gender) => {
    const newStaff: Staff = {
      id: Date.now().toString(),
      name,
      gender,
      active: true,
    };
    const newData = {
      ...data,
      staff: [...data.staff, newStaff],
      masterQueue: [...data.masterQueue, newStaff.id]
    };
    persistData(newData);
  };

  const toggleStaffActive = (id: string) => {
    const newData = {
      ...data,
      staff: data.staff.map(s => s.id === id ? { ...s, active: !s.active } : s)
    };
    persistData(newData);
  };

  const removeStaff = (id: string) => {
    if (!confirm('确定要删除该员工吗？这将影响所有客户端。')) return;
    const newData = {
      ...data,
      staff: data.staff.filter(s => s.id !== id),
      masterQueue: data.masterQueue.filter(qid => qid !== id)
    };
    persistData(newData);
  };

  const handleGenderChange = (id: string, gender: Gender) => {
    const newData = {
      ...data,
      staff: data.staff.map(s => s.id === id ? { ...s, gender } : s)
    };
    persistData(newData);
  };

  // --- Logic: Scheduling ---

  const generateSchedule = (type: ShiftType) => {
    const jobs = type === ShiftType.OPENING ? OPENING_JOBS : CLOSING_JOBS;
    const presentStaffIds = data.masterQueue.filter(id => attendance.has(id));
    
    if (presentStaffIds.length === 0) {
      alert("请先选择今日出勤人员");
      return;
    }

    const newAssignments: Record<string, string[]> = {};
    jobs.forEach(j => newAssignments[j.id] = []);

    let workingQueue = [...presentStaffIds];
    
    // Reverse for closing to balance fatigue
    if (type === ShiftType.CLOSING) {
      workingQueue.reverse();
    }

    let cursor = 0; 

    for (const job of jobs) {
      const needed = job.requiredCount;
      let assignedCount = 0;
      let attempts = 0; 
      const maxAttempts = needed * workingQueue.length * 2; 

      while (assignedCount < needed && attempts < maxAttempts) {
        attempts++;
        const candidateId = workingQueue[cursor % workingQueue.length];
        const candidate = data.staff.find(s => s.id === candidateId);
        
        let isEligible = true;
        if (candidate) {
          if (job.genderConstraint && candidate.gender === job.genderConstraint) {
            isEligible = false;
          }
          if (newAssignments[job.id].includes(candidateId)) {
            isEligible = false;
          }
        }

        cursor++;

        if (isEligible && candidate) {
          newAssignments[job.id].push(candidateId);
          assignedCount++;
        }
      }
    }

    if (type === ShiftType.OPENING) {
      setOpeningAssignments(newAssignments);
    } else {
      setClosingAssignments(newAssignments);
    }
    
    setSelectedStaffForMove(null);
  };

  const saveDay = () => {
    if (!confirm('确定要归档今日排班并更新轮岗顺序吗？这将同步给所有人。')) return;

    // S-Shape Rotation
    const newQueue = [...data.masterQueue];
    if (newQueue.length > 0) {
      const first = newQueue.shift();
      if (first) newQueue.push(first);
    }

    const record: DailyRecord = {
      date: selectedDate,
      attendanceIds: Array.from(attendance),
      rotationOrder: data.masterQueue, // Save state at time of generation
      openingAssignments,
      closingAssignments,
    };

    const existingIndex = data.history.findIndex(h => h.date === selectedDate);
    let newHistory = [...data.history];
    if (existingIndex >= 0) {
      newHistory[existingIndex] = record;
    } else {
      newHistory.push(record);
    }
    newHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const newData = {
      ...data,
      history: newHistory,
      masterQueue: newQueue,
    };
    persistData(newData);

    alert("✅ 排班已归档，轮岗顺序已更新！");
  };

  // --- Logic: Interactions ---

  const getStaffName = (id: string) => data.staff.find(s => s.id === id)?.name || '未知';

  const handleStaffClick = (staffId: string, jobId: string, shiftType: ShiftType) => {
    if (selectedStaffForMove?.id === staffId && selectedStaffForMove.fromJobId === jobId) {
      setSelectedStaffForMove(null);
      return;
    }
    setSelectedStaffForMove({ id: staffId, fromJobId: jobId, shiftType });
  };

  const handleJobAreaClick = (targetJobId: string, targetShiftType: ShiftType) => {
    if (!selectedStaffForMove) return;
    if (selectedStaffForMove.shiftType !== targetShiftType) {
      alert("不能跨班次移动人员。");
      return;
    }

    const { id, fromJobId } = selectedStaffForMove;
    if (fromJobId === targetJobId) return;

    const setter = targetShiftType === ShiftType.OPENING ? setOpeningAssignments : setClosingAssignments;
    
    setter(prev => {
      const oldList = prev[fromJobId].filter(x => x !== id);
      const targetList = prev[targetJobId].includes(id) 
        ? prev[targetJobId] 
        : [...(prev[targetJobId] || []), id];

      return {
        ...prev,
        [fromJobId]: oldList,
        [targetJobId]: targetList
      };
    });

    setSelectedStaffForMove(null);
  };

  const generateCopyText = (type: ShiftType) => {
    const assignments = type === ShiftType.OPENING ? openingAssignments : closingAssignments;
    const jobs = type === ShiftType.OPENING ? OPENING_JOBS : CLOSING_JOBS;
    const header = type === ShiftType.OPENING ? JOB_TEMPLATES.OPENING_HEADER : JOB_TEMPLATES.CLOSING_HEADER;

    let text = `${header} (${selectedDate})\n`;
    
    jobs.forEach(job => {
      const staffIds = assignments[job.id] || [];
      const names = staffIds.map(id => getStaffName(id)).join('、');
      
      text += `\n📌 ${job.name}：\n`;
      if (names) {
        text += `   人员：${names}\n`;
      } else {
        text += `   人员：(待定)\n`;
      }
      text += `   内容：${job.description}`;
    });

    navigator.clipboard.writeText(text).then(() => alert('📋 已复制到剪贴板'));
  };

  // --- Components ---

  const StaffTab = () => {
    const [newName, setNewName] = useState('');
    const [newGender, setNewGender] = useState<Gender>(Gender.MALE);

    return (
      <div className="space-y-6 pb-20">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
            <User className="text-blue-500" size={20}/> 添加新员工
          </h3>
          <div className="flex gap-2">
            <input 
              className="border border-slate-200 bg-slate-50 p-3 rounded-xl flex-1 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="输入姓名"
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
            <div className="flex bg-slate-100 rounded-xl p-1">
              <button 
                onClick={() => setNewGender(Gender.MALE)}
                className={`px-4 rounded-lg text-sm font-medium transition-all ${newGender === Gender.MALE ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
              >男</button>
              <button 
                onClick={() => setNewGender(Gender.FEMALE)}
                className={`px-4 rounded-lg text-sm font-medium transition-all ${newGender === Gender.FEMALE ? 'bg-white text-pink-500 shadow-sm' : 'text-slate-400'}`}
              >女</button>
            </div>
            <button 
              onClick={() => {
                if(newName) { addStaff(newName, newGender); setNewName(''); }
              }}
              className="bg-blue-600 active:bg-blue-700 text-white px-4 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200"
            >
              <Plus size={24} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.staff.map(s => (
              <div key={s.id} className={`p-4 rounded-xl flex justify-between items-center transition-all ${s.active ? 'bg-white border border-slate-100 shadow-sm' : 'bg-slate-50 border border-transparent opacity-60'}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md ${s.gender === Gender.MALE ? 'bg-gradient-to-br from-blue-400 to-blue-600' : 'bg-gradient-to-br from-pink-400 to-pink-600'}`}>
                    <span className="font-bold text-sm">{s.name[0]}</span>
                  </div>
                  <div>
                    <div className="font-bold text-slate-800">{s.name}</div>
                    <div className="text-xs text-slate-400">{s.gender} · {s.active ? '在职' : '已停用'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleStaffActive(s.id)} className="p-2 text-slate-400 hover:text-blue-600 rounded-full hover:bg-slate-100">
                    {s.active ? <CheckCircle2 size={18}/> : <RotateCcw size={18}/>}
                  </button>
                  <button onClick={() => handleGenderChange(s.id, s.gender === Gender.MALE ? Gender.FEMALE : Gender.MALE)} className="p-2 text-slate-400 hover:text-purple-600 rounded-full hover:bg-slate-100 font-bold text-xs">
                    {s.gender === '男' ? '变女' : '变男'}
                  </button>
                  <button onClick={() => removeStaff(s.id)} className="p-2 text-slate-300 hover:text-red-500 rounded-full hover:bg-red-50">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>
    );
  };

  const JobCard = ({ job, assignments, shiftType }: any) => {
    const assignedIds = assignments[job.id] || [];
    const isTarget = selectedStaffForMove && selectedStaffForMove.shiftType === shiftType && selectedStaffForMove.fromJobId !== job.id;
    
    return (
      <div 
        onClick={() => handleJobAreaClick(job.id, shiftType)}
        className={`
          p-3 rounded-xl border transition-all duration-200 relative overflow-hidden
          ${isTarget ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-100 cursor-pointer' : 'bg-slate-50 border-slate-100'}
        `}
      >
        {isTarget && <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10 font-bold text-blue-600 pointer-events-none">点击此处移动到该岗位</div>}
        
        <div className="flex justify-between items-start mb-2">
          <div>
            <span className="font-bold text-slate-700 block text-lg">{job.name}</span>
            <span className="text-xs text-slate-400">{job.description}</span>
          </div>
          <span className="text-xs font-mono text-slate-400 bg-white px-2 py-1 rounded border border-slate-100">
            {assignedIds.length}/{job.requiredCount}人
          </span>
        </div>
        
        <div className="flex flex-wrap gap-2 mt-3 min-h-[40px]">
          {assignedIds.map((id: string) => {
            const staff = data.staff.find(s => s.id === id);
            if (!staff) return null;
            const isSelected = selectedStaffForMove?.id === id && selectedStaffForMove?.fromJobId === job.id;
            
            return (
              <button 
                key={id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleStaffClick(id, job.id, shiftType);
                }}
                className={`
                  px-3 py-1.5 rounded-lg text-sm font-medium shadow-sm border flex items-center gap-1 transition-all
                  ${isSelected 
                    ? 'ring-2 ring-offset-1 ring-blue-500 scale-105 z-20' 
                    : ''}
                  ${staff.gender === Gender.MALE 
                    ? (isSelected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-700 border-blue-100')
                    : (isSelected ? 'bg-pink-600 text-white border-pink-600' : 'bg-white text-pink-700 border-pink-100')}
                `}
              >
                 {staff.name}
                 {isSelected && <X size={14} className="ml-1"/>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const ScheduleTab = () => {
    return (
      <div className="space-y-6 pb-20">
        {/* Header Control */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-[70px] z-30">
          <div className="flex items-center gap-3 w-full md:w-auto bg-slate-50 p-1 rounded-xl">
            <div className="p-2 bg-white rounded-lg shadow-sm text-slate-500">
              <Calendar size={20} />
            </div>
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent font-bold text-slate-700 outline-none w-full"
            />
          </div>
          <button 
            onClick={saveDay}
            className="w-full md:w-auto bg-emerald-500 active:bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 font-bold transition-all"
          >
            <Save size={20} /> 归档并轮岗
          </button>
        </div>

        {/* Attendance */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
            <CheckCircle2 className="text-emerald-500" size={20}/> 
            今日考勤 ({attendance.size}人)
          </h3>
          <div className="flex flex-wrap gap-3">
            {data.staff.filter(s => s.active).map(s => {
              const isPresent = attendance.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    const newSet = new Set(attendance);
                    if (newSet.has(s.id)) newSet.delete(s.id);
                    else newSet.add(s.id);
                    setAttendance(newSet);
                  }}
                  className={`
                    px-4 py-2 rounded-xl border text-sm font-medium transition-all
                    ${isPresent 
                      ? 'bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-100' 
                      : 'bg-slate-50 text-slate-400 border-slate-200'}
                  `}
                >
                  {s.name}
                </button>
              )
            })}
          </div>
        </div>

        {/* Shifts */}
        {['OPENING', 'CLOSING'].map((type) => {
          const isOpening = type === 'OPENING';
          const title = isOpening ? '开市安排 (早班)' : '收市安排 (晚班)';
          const colorClass = isOpening ? 'text-amber-600' : 'text-indigo-600';
          const bgClass = isOpening ? 'bg-amber-50' : 'bg-indigo-50';
          const jobs = isOpening ? OPENING_JOBS : CLOSING_JOBS;
          const assignments = isOpening ? openingAssignments : closingAssignments;
          
          return (
            <div key={type} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <h3 className={`font-bold text-xl ${colorClass}`}>{title}</h3>
                <div className="flex gap-2">
                  <button onClick={() => generateSchedule(type as ShiftType)} className={`${bgClass} p-2 rounded-lg hover:brightness-95 transition-all`}>
                    <RefreshCw size={20} className={colorClass} />
                  </button>
                  <button onClick={() => generateCopyText(type as ShiftType)} className="bg-slate-100 p-2 rounded-lg hover:bg-slate-200 transition-all text-slate-600">
                    <Copy size={20} />
                  </button>
                </div>
              </div>
              <div className="space-y-4">
                {jobs.map(job => (
                  <JobCard 
                    key={job.id} 
                    job={job} 
                    assignments={assignments} 
                    shiftType={type as ShiftType}
                  />
                ))}
              </div>
            </div>
          );
        })}
        
        {selectedStaffForMove && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full shadow-xl z-50 animate-bounce flex items-center gap-3">
            <span>点击任意灰色岗位区域以移动人员</span>
            <button onClick={() => setSelectedStaffForMove(null)} className="bg-slate-600 rounded-full p-1"><X size={14}/></button>
          </div>
        )}
      </div>
    );
  };

  const HistoryTab = () => {
    return (
      <div className="space-y-4 pb-20">
        {data.history.slice(0, 14).map((record, idx) => (
          <div key={idx} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-3">
              <span className="font-bold text-lg text-slate-700">{record.date}</span>
              <span className="text-slate-400 text-xs bg-slate-50 px-2 py-1 rounded-full">出勤: {record.attendanceIds.length}人</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-bold text-amber-600 mb-2 flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500"></div> 开市</h4>
                <div className="text-sm space-y-2 text-slate-600">
                  {OPENING_JOBS.map(j => {
                    const names = record.openingAssignments[j.id]?.map(id => getStaffName(id)).join('、');
                    if (!names) return null;
                    return <div key={j.id} className="flex"><span className="text-slate-400 w-20 shrink-0">{j.name}:</span> <span className="font-medium">{names}</span></div>
                  })}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-bold text-indigo-600 mb-2 flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> 收市</h4>
                <div className="text-sm space-y-2 text-slate-600">
                  {CLOSING_JOBS.map(j => {
                    const names = record.closingAssignments[j.id]?.map(id => getStaffName(id)).join('、');
                    if (!names) return null;
                    return <div key={j.id} className="flex"><span className="text-slate-400 w-20 shrink-0">{j.name}:</span> <span className="font-medium">{names}</span></div>
                  })}
                </div>
              </div>
            </div>
            <button 
              onClick={() => {
                setSelectedDate(record.date);
                setAttendance(new Set(record.attendanceIds));
                setOpeningAssignments(record.openingAssignments);
                setClosingAssignments(record.closingAssignments);
                setActiveTab('schedule');
              }}
              className="mt-4 w-full py-2 text-center text-sm font-bold text-blue-500 hover:bg-blue-50 rounded-xl transition-colors"
            >
              载入此记录
            </button>
          </div>
        ))}
        {data.history.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <AlertCircle size={48} className="mb-4 text-slate-200" />
            <p>暂无历史记录</p>
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 gap-2">
        <Loader2 className="animate-spin" /> 正在连接服务器...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 h-16 flex justify-between items-center">
          <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">后厨智能排班</h1>
          
          <div className="flex items-center gap-2">
            {saving && <span className="text-xs text-slate-400 flex items-center gap-1"><Cloud size={12} className="animate-pulse"/> 保存中...</span>}
            <nav className="flex bg-slate-100 p-1 rounded-xl">
              {[
                { id: 'schedule', label: '排班' },
                { id: 'staff', label: '人员' },
                { id: 'history', label: '历史' }
              ].map(tab => (
                <button 
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)} 
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto mt-6 px-4">
        {activeTab === 'staff' && <StaffTab />}
        {activeTab === 'schedule' && <ScheduleTab />}
        {activeTab === 'history' && <HistoryTab />}
      </main>
    </div>
  );
}

export default App;