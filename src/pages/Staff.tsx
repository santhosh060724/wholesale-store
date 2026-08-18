import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Staff, StaffAttendance, AttendanceStatus } from '../lib/types';
import { todayDateString, formatDateOnly } from '../lib/utils';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Users,
  X,
  Phone,
  ChevronLeft,
  ChevronRight,
  CalendarCheck,
  Check,
  UserX,
  Clock3,
  CalendarOff,
  BarChart3,
  ChevronLeft as ChevronLeftMonth,
  ChevronRight as ChevronRightMonth,
} from 'lucide-react';

type FormState = { name: string; phone: string; role: string; is_active: boolean };
const emptyForm: FormState = { name: '', phone: '', role: '', is_active: true };

const STATUS_OPTIONS: { status: AttendanceStatus; label: string; icon: typeof Check; activeClass: string }[] = [
  { status: 'Present', label: 'Present', icon: Check, activeClass: 'bg-emerald-600 border-emerald-600 text-white' },
  { status: 'Absent', label: 'Absent', icon: UserX, activeClass: 'bg-red-500 border-red-500 text-white' },
  { status: 'Half Day', label: 'Half Day', icon: Clock3, activeClass: 'bg-amber-500 border-amber-500 text-white' },
  { status: 'Leave', label: 'Leave', icon: CalendarOff, activeClass: 'bg-slate-500 border-slate-500 text-white' },
];

export default function StaffPage() {
  const [subTab, setSubTab] = useState<'directory' | 'attendance' | 'summary'>('directory');

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Staff Management</h1>
          <p className="text-sm text-slate-500 mt-1">Manage staff details and track daily attendance</p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm flex-wrap">
          <button
            onClick={() => setSubTab('directory')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
              subTab === 'directory' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Users size={15} />
            Staff Directory
          </button>
          <button
            onClick={() => setSubTab('attendance')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
              subTab === 'attendance' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <CalendarCheck size={15} />
            Daily Attendance
          </button>
          <button
            onClick={() => setSubTab('summary')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
              subTab === 'summary' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <BarChart3 size={15} />
            Monthly Summary
          </button>
        </div>
      </div>

      {subTab === 'directory' && <StaffDirectory />}
      {subTab === 'attendance' && <DailyAttendance />}
      {subTab === 'summary' && <MonthlySummary />}
    </div>
  );
}

/* ------------------------- Staff Directory ------------------------- */

function StaffDirectory() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchStaff = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .order('name', { ascending: true });
    if (error) {
      setError(error.message);
    } else {
      setStaff(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  };

  const openEdit = (s: Staff) => {
    setEditing(s);
    setForm({ name: s.name, phone: s.phone, role: s.role || '', is_active: s.is_active });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      setError('Name and phone number are required.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      role: form.role.trim() || null,
      is_active: form.is_active,
    };
    if (editing) {
      const { error } = await supabase.from('staff').update(payload).eq('id', editing.id);
      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from('staff').insert(payload);
      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    setShowModal(false);
    fetchStaff();
  };

  const handleDelete = async (s: Staff) => {
    if (!confirm(`Remove staff member "${s.name}"? This also deletes their attendance history.`)) return;
    const { error } = await supabase.from('staff').delete().eq('id', s.id);
    if (error) {
      alert(error.message);
      return;
    }
    fetchStaff();
  };

  const filtered = staff.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.phone.toLowerCase().includes(search.toLowerCase()) ||
      (s.role || '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p className="text-sm text-slate-500">{staff.length} staff member{staff.length !== 1 ? 's' : ''}</p>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
        >
          <Plus size={18} />
          Add Staff
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name, phone or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 bg-white"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Users className="animate-pulse" size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Users size={48} className="mb-3" />
          <p className="text-sm">No staff members found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((s) => (
            <div
              key={s.id}
              className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm">
                  {s.name
                    .split(' ')
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEdit(s)}
                    className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(s)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <h3 className="font-semibold text-slate-800 text-sm leading-snug mb-1">{s.name}</h3>
              {s.role && <p className="text-xs text-slate-400 mb-2">{s.role}</p>}
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-2">
                <div className="flex items-center gap-1.5 text-sm text-slate-600">
                  <Phone size={13} />
                  {s.phone}
                </div>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    s.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {s.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-800">
                {editing ? 'Edit Staff' : 'New Staff'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                  placeholder="e.g. Ramesh Kumar"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                  placeholder="e.g. +91 98765 43210"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  Role <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                  placeholder="e.g. Cashier, Helper, Delivery"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-600">Active (shown in daily attendance)</span>
              </label>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------- Daily Attendance ------------------------- */

function DailyAttendance() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [records, setRecords] = useState<Record<string, StaffAttendance>>({});
  const [date, setDate] = useState(todayDateString());
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchData = async (forDate: string) => {
    setLoading(true);
    setError('');
    const [staffRes, attendanceRes] = await Promise.all([
      supabase.from('staff').select('*').eq('is_active', true).order('name', { ascending: true }),
      supabase.from('staff_attendance').select('*').eq('attendance_date', forDate),
    ]);
    if (staffRes.error) setError(staffRes.error.message);
    if (attendanceRes.error) setError(attendanceRes.error.message);

    setStaff(staffRes.data || []);
    const map: Record<string, StaffAttendance> = {};
    (attendanceRes.data || []).forEach((r: StaffAttendance) => {
      map[r.staff_id] = r;
    });
    setRecords(map);
    setLoading(false);
  };

  useEffect(() => {
    fetchData(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const markAttendance = async (staffId: string, status: AttendanceStatus) => {
    setSavingId(staffId);
    const existing = records[staffId];
    const nowTime = new Date().toTimeString().slice(0, 8);
    const payload = {
      staff_id: staffId,
      attendance_date: date,
      status,
      check_in_time: status === 'Present' || status === 'Half Day' ? existing?.check_in_time || nowTime : null,
    };
    const { data, error } = await supabase
      .from('staff_attendance')
      .upsert(payload, { onConflict: 'staff_id,attendance_date' })
      .select()
      .single();
    if (error) {
      setError(error.message);
    } else if (data) {
      setRecords((prev) => ({ ...prev, [staffId]: data }));
    }
    setSavingId(null);
  };

  const shiftDate = (deltaDays: number) => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + deltaDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setDate(`${y}-${m}-${day}`);
  };

  const summary = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = { Present: 0, Absent: 0, 'Half Day': 0, Leave: 0 };
    Object.values(records).forEach((r) => {
      counts[r.status] = (counts[r.status] || 0) + 1;
    });
    const marked = Object.keys(records).length;
    return { ...counts, marked, unmarked: Math.max(staff.length - marked, 0) };
  }, [records, staff.length]);

  const isToday = date === todayDateString();

  return (
    <div>
      {/* Date navigator */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3 mb-4">
        <button
          onClick={() => shiftDate(-1)}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              max={todayDateString()}
              onChange={(e) => setDate(e.target.value)}
              className="text-sm font-semibold text-slate-800 border-none focus:outline-none bg-transparent"
            />
            {isToday && (
              <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                Today
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{formatDateOnly(date)}</p>
        </div>
        <button
          onClick={() => shiftDate(1)}
          disabled={isToday}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        <SummaryCard label="Present" value={summary.Present} color="text-emerald-600" bg="bg-emerald-50" />
        <SummaryCard label="Absent" value={summary.Absent} color="text-red-500" bg="bg-red-50" />
        <SummaryCard label="Half Day" value={summary['Half Day']} color="text-amber-500" bg="bg-amber-50" />
        <SummaryCard label="Leave" value={summary.Leave} color="text-slate-500" bg="bg-slate-100" />
        <SummaryCard label="Unmarked" value={summary.unmarked} color="text-slate-400" bg="bg-slate-50" />
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <CalendarCheck className="animate-pulse" size={32} />
        </div>
      ) : staff.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Users size={48} className="mb-3" />
          <p className="text-sm">No active staff yet. Add staff members from the Staff Directory tab.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {staff.map((s) => {
            const rec = records[s.id];
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 p-3.5 flex-wrap">
                <div className="flex items-center gap-3 min-w-[160px]">
                  <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
                    {s.name
                      .split(' ')
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                    <p className="text-xs text-slate-400">
                      {s.role ? `${s.role} · ` : ''}
                      {s.phone}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {STATUS_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const active = rec?.status === opt.status;
                    return (
                      <button
                        key={opt.status}
                        onClick={() => markAttendance(s.id, opt.status)}
                        disabled={savingId === s.id}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                          active
                            ? opt.activeClass
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        <Icon size={13} />
                        {opt.label}
                      </button>
                    );
                  })}
                  {rec?.check_in_time && (rec.status === 'Present' || rec.status === 'Half Day') && (
                    <span className="text-[11px] text-slate-400 ml-1">
                      In: {rec.check_in_time.slice(0, 5)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
  bg,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <div className={`rounded-xl p-3 ${bg}`}>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-[11px] font-medium text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

/* ------------------------- Monthly Summary ------------------------- */

type MonthTotals = {
  staff: Staff;
  Present: number;
  Absent: number;
  'Half Day': number;
  Leave: number;
  marked: number;
};

function monthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function MonthlySummary() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const [staff, setStaff] = useState<Staff[]>([]);
  const [totals, setTotals] = useState<MonthTotals[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  useEffect(() => {
    const fetchMonth = async () => {
      setLoading(true);
      setError('');

      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const toDateStr = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const startStr = toDateStr(firstDay);
      const endStr = toDateStr(lastDay);

      const [staffRes, attendanceRes] = await Promise.all([
        supabase.from('staff').select('*').order('name', { ascending: true }),
        supabase
          .from('staff_attendance')
          .select('*')
          .gte('attendance_date', startStr)
          .lte('attendance_date', endStr),
      ]);

      if (staffRes.error) setError(staffRes.error.message);
      if (attendanceRes.error) setError(attendanceRes.error.message);

      const staffList: Staff[] = staffRes.data || [];
      setStaff(staffList);

      const computed: MonthTotals[] = staffList.map((s) => {
        const rows = (attendanceRes.data || []).filter((r: StaffAttendance) => r.staff_id === s.id);
        const counts = { Present: 0, Absent: 0, 'Half Day': 0, Leave: 0 } as Record<AttendanceStatus, number>;
        rows.forEach((r: StaffAttendance) => {
          counts[r.status] = (counts[r.status] || 0) + 1;
        });
        return { staff: s, ...counts, marked: rows.length };
      });
      setTotals(computed);
      setLoading(false);
    };

    fetchMonth();
  }, [year, month]);

  const shiftMonth = (delta: number) => {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }
    setYear(newYear);
    setMonth(newMonth);
  };

  return (
    <div>
      {/* Month navigator */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3 mb-5">
        <button onClick={() => shiftMonth(-1)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100">
          <ChevronLeftMonth size={18} />
        </button>
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-800">{monthLabel(year, month)}</p>
          {isCurrentMonth && (
            <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
              This month
            </span>
          )}
        </div>
        <button
          onClick={() => shiftMonth(1)}
          disabled={isCurrentMonth}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRightMonth size={18} />
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <BarChart3 className="animate-pulse" size={32} />
        </div>
      ) : staff.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Users size={48} className="mb-3" />
          <p className="text-sm">No staff members yet. Add staff from the Staff Directory tab.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Staff</th>
                <th className="px-3 py-3 font-medium text-center">Present</th>
                <th className="px-3 py-3 font-medium text-center">Absent</th>
                <th className="px-3 py-3 font-medium text-center">Half Day</th>
                <th className="px-3 py-3 font-medium text-center">Leave</th>
                <th className="px-4 py-3 font-medium text-center">Days Marked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {totals.map((t) => (
                <tr key={t.staff.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-[11px] shrink-0">
                        {t.staff.name
                          .split(' ')
                          .map((p) => p[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{t.staff.name}</p>
                        {t.staff.role && <p className="text-xs text-slate-400">{t.staff.role}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center font-semibold text-emerald-600">{t.Present}</td>
                  <td className="px-3 py-3 text-center font-semibold text-red-500">{t.Absent}</td>
                  <td className="px-3 py-3 text-center font-semibold text-amber-500">{t['Half Day']}</td>
                  <td className="px-3 py-3 text-center font-semibold text-slate-500">{t.Leave}</td>
                  <td className="px-4 py-3 text-center text-slate-500">{t.marked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
