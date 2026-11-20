import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Edit3, Eye, Plus, Search, X } from 'lucide-react';
import { ResultRecord, StudentRecord, UserRole } from '../../shared/types';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError, apiRequest } from '../lib/api';

interface StudentsResponse {
  students: StudentRecord[];
  total: number;
  page: number;
  pageSize: number;
  courses: string[];
}

export function StudentsPage() {
  const { user } = useAuth();
  const { pushToast } = useToast();

  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [courses, setCourses] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Add / Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StudentRecord | null>(null);
  const [formReg, setFormReg] = useState('');
  const [formName, setFormName] = useState('');
  const [formCourse, setFormCourse] = useState('B.Tech Computer Science');
  const [formSemester, setFormSemester] = useState('6');
  const [formSession, setFormSession] = useState('2025-2026');
  const [formEmail, setFormEmail] = useState('');
  const [saving, setSaving] = useState(false);

  // Detail Drawer
  const [inspectStudent, setInspectStudent] = useState<StudentRecord | null>(null);
  const [inspectResults, setInspectResults] = useState<ResultRecord[]>([]);
  const [inspectLoading, setInspectLoading] = useState(false);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) qs.set('search', search.trim());
      if (courseFilter) qs.set('course', courseFilter);
      if (semesterFilter) qs.set('semester', semesterFilter);

      const res = await apiRequest<StudentsResponse>(`/api/students?${qs.toString()}`);
      setStudents(res.students);
      setTotal(res.total);
      setCourses(res.courses);
    } catch (err) {
      pushToast('error', 'Could not load students', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [page, search, courseFilter, semesterFilter, pushToast]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  const openAddModal = () => {
    setEditing(null);
    setFormReg('');
    setFormName('');
    setFormCourse('B.Tech Computer Science');
    setFormSemester('6');
    setFormSession('2025-2026');
    setFormEmail('');
    setModalOpen(true);
  };

  const openEditModal = (s: StudentRecord) => {
    setEditing(s);
    setFormReg(s.registrationNumber);
    setFormName(s.fullName);
    setFormCourse(s.course);
    setFormSemester(String(s.semester));
    setFormSession(s.academicSession);
    setFormEmail(s.email ?? '');
    setModalOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await apiRequest(`/api/students/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            fullName: formName,
            course: formCourse,
            semester: Number(formSemester),
            academicSession: formSession,
            email: formEmail || null,
          }),
        });
        pushToast('success', 'Student Updated', `${formName} (${editing.registrationNumber})`);
      } else {
        await apiRequest('/api/students', {
          method: 'POST',
          body: JSON.stringify({
            registrationNumber: formReg,
            fullName: formName,
            course: formCourse,
            semester: Number(formSemester),
            academicSession: formSession,
            email: formEmail || null,
          }),
        });
        pushToast('success', 'Student Enrolled', `${formName} (${formReg.toUpperCase()})`);
      }
      setModalOpen(false);
      await loadStudents();
    } catch (err) {
      pushToast(
        'error',
        'Validation Error',
        err instanceof ApiError ? err.message : 'Unable to save student'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleInspectStudent = async (s: StudentRecord) => {
    setInspectStudent(s);
    setInspectLoading(true);
    try {
      const res = await apiRequest<{ results: ResultRecord[] }>(`/api/students/${s.id}`);
      setInspectResults(res.results);
    } catch (err) {
      pushToast('error', 'Failed to load student results', err instanceof Error ? err.message : undefined);
    } finally {
      setInspectLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canEdit = user?.role === UserRole.SUPER_ADMIN;

  return (
    <AppShell
      title="Student Management"
      breadcrumb="VeriMark / Registry / Students"
      actions={
        canEdit ? (
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Add Student</span>
          </button>
        ) : null
      }
    >
      <div className="space-y-5">
        {/* Search & Filters */}
        <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search students"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by registration number, name, or course…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select
            aria-label="Filter by course"
            value={courseFilter}
            onChange={(e) => {
              setCourseFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
          >
            <option value="">All Courses</option>
            {courses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by semester"
            value={semesterFilter}
            onChange={(e) => {
              setSemesterFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
          >
            <option value="">All Semesters</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
              <option key={sem} value={String(sem)}>
                Semester {sem}
              </option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4 font-semibold">Registration No.</th>
                  <th className="py-3 px-4 font-semibold">Student Name</th>
                  <th className="py-3 px-4 font-semibold">Course</th>
                  <th className="py-3 px-4 font-semibold text-right">Semester</th>
                  <th className="py-3 px-4 font-semibold">Session</th>
                  <th className="py-3 px-4 font-semibold text-right">Published Subjects</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-500">
                      Loading student records…
                    </td>
                  </tr>
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-500">
                      No students match the current search or filter.
                    </td>
                  </tr>
                ) : (
                  students.map((s) => (
                    <tr
                      key={s.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                        {s.registrationNumber}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                        {s.fullName}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {s.course}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        Sem {s.semester}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {s.academicSession}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                        {s.publishedCount ?? 0}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleInspectStudent(s)}
                            aria-label={`View results for ${s.fullName}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Results</span>
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openEditModal(s)}
                              aria-label={`Edit ${s.fullName}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Edit</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="tabular-nums">
              Showing {students.length} of {total} students · Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add / Edit Student Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editing ? 'Edit student' : 'Add student'}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60"
        >
          <div className="w-full max-w-lg bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg">
                {editing ? `Edit Student (${editing.registrationNumber})` : 'Add New Student'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
                className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="space-y-4">
              {!editing && (
                <div className="space-y-1">
                  <label htmlFor="stu-reg" className="text-xs font-semibold">
                    Registration Number
                  </label>
                  <input
                    id="stu-reg"
                    required
                    value={formReg}
                    onChange={(e) => setFormReg(e.target.value)}
                    placeholder="DU2026CS099"
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor="stu-name" className="text-xs font-semibold">
                  Full Name
                </label>
                <input
                  id="stu-name"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Student Full Name"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="stu-course" className="text-xs font-semibold">
                    Course
                  </label>
                  <input
                    id="stu-course"
                    required
                    value={formCourse}
                    onChange={(e) => setFormCourse(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="stu-sem" className="text-xs font-semibold">
                    Semester
                  </label>
                  <input
                    id="stu-sem"
                    type="number"
                    min={1}
                    max={12}
                    required
                    value={formSemester}
                    onChange={(e) => setFormSemester(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="stu-session" className="text-xs font-semibold">
                    Academic Session
                  </label>
                  <input
                    id="stu-session"
                    required
                    value={formSession}
                    onChange={(e) => setFormSession(e.target.value)}
                    placeholder="2025-2026"
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="stu-email" className="text-xs font-semibold">
                    University Email (Optional)
                  </label>
                  <input
                    id="stu-email"
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="student@demouniversity.edu"
                    className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-60"
                >
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Student Results Drawer */}
      {inspectStudent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Published subjects for ${inspectStudent.fullName}`}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60"
        >
          <div className="w-full max-w-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display font-bold text-lg">
                  {inspectStudent.fullName}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {inspectStudent.registrationNumber} · {inspectStudent.course} · Sem{' '}
                  {inspectStudent.semester} · {inspectStudent.academicSession}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectStudent(null)}
                aria-label="Close student results"
                className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {inspectLoading ? (
              <p className="text-sm text-slate-500 py-8 text-center">Loading results…</p>
            ) : inspectResults.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">
                No published subjects recorded for this student yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800">
                {inspectResults.map((r) => (
                  <div
                    key={r.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <p className="text-sm font-semibold">
                        {r.subjectCode} — {r.subjectName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {r.examCode} · Block #{r.latestLedgerSequence} · v{r.version} · Receipt{' '}
                        {r.latestReceiptId}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-base tabular-nums">
                        {r.obtainedMarks}/{r.maxMarks}
                      </span>
                      <Link
                        to={`/marksheet/${r.id}`}
                        className="px-3 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-500 whitespace-nowrap"
                      >
                        Marksheet
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
