import { useState, useEffect, useMemo } from 'react';
import type { Problem, ProblemSet, Student, SortKey } from './types';
import {
  mergeAnnotations, getAllConcepts, getAllTags,
  loadStudents, saveStudents, loadProblemSets, saveProblemSets,
} from './store';
import FilterPanel from './components/FilterPanel';
import ProblemCard from './components/ProblemCard';
import SetPanel from './components/SetPanel';
import PrintPreview from './components/PrintPreview';
import HomePage from './pages/HomePage';
import './App.css';

interface Filters {
  years: number[];
  months: number[];
  subjects: string[];
  nums: string;
  concepts: string[];
  tags: string[];
  types: string[];
  onlySelected: boolean;
}

function parseNumRange(s: string): Set<number> {
  const set = new Set<number>();
  if (!s.trim()) return set;
  for (const part of s.split(',')) {
    const range = part.trim().split('-');
    if (range.length === 2) {
      const from = parseInt(range[0]), to = parseInt(range[1]);
      if (!isNaN(from) && !isNaN(to)) for (let i = from; i <= to; i++) set.add(i);
    } else {
      const n = parseInt(range[0]);
      if (!isNaN(n)) set.add(n);
    }
  }
  return set;
}

type Page = { type: 'home' } | { type: 'editor'; setId: string };

export default function App() {
  const [allProblems, setAllProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>({ type: 'home' });
  const [students, setStudents] = useState<Student[]>(loadStudents);
  const [problemSets, setProblemSets] = useState<ProblemSet[]>(loadProblemSets);

  // 편집기 상태
  const [sortKey, setSortKey] = useState<SortKey>('num');
  const [filters, setFilters] = useState<Filters>({ years: [], months: [], subjects: [], nums: '', concepts: [], tags: [], types: [], onlySelected: false });
  const [cols, setCols] = useState(3);
  const [cardHeight, setCardHeight] = useState(220);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}problems.json`).then(r => r.json()).then(problems => {
      setAllProblems(mergeAnnotations(problems));
      setLoading(false);
    });
  }, []);

  // 현재 열린 문제집
  const currentSet = useMemo(() =>
    page.type === 'editor' ? problemSets.find(ps => ps.id === page.setId) ?? null : null,
    [page, problemSets]);

  // 현재 문제집의 Problem[] (순서 유지)
  const setProblemList = useMemo(() => {
    if (!currentSet) return [];
    return currentSet.problemIds
      .map(id => allProblems.find(p => p.id === id))
      .filter(Boolean) as Problem[];
  }, [currentSet, allProblems]);

  const setIds = useMemo(() => new Set(currentSet?.problemIds ?? []), [currentSet]);

  const allYears = useMemo(() => Array.from(new Set(allProblems.map(p => p.year))).sort(), [allProblems]);
  const allSubjects = useMemo(() => {
    const s = new Set(allProblems.map(p => p.subject).filter(Boolean) as string[]);
    return ['확통', '미적', '기하'].filter(v => s.has(v));
  }, [allProblems]);
  const allConcepts = useMemo(() => getAllConcepts(allProblems), [allProblems]);
  const allTags = useMemo(() => getAllTags(allProblems), [allProblems]);
  const allTypes = useMemo(() =>
    Array.from(new Set(allProblems.flatMap(p => p.typeTags ?? []))).sort(),
    [allProblems]);

  const filtered = useMemo(() => {
    const numSet = parseNumRange(filters.nums);
    return allProblems.filter(p => {
      if (filters.years.length && !filters.years.includes(p.year)) return false;
      if (filters.months.length && !filters.months.includes(p.month)) return false;
      if (filters.subjects.length && !filters.subjects.includes(p.subject ?? '')) return false;
      if (numSet.size && !numSet.has(p.num)) return false;
      if (filters.concepts.length && !filters.concepts.some(c => p.concepts.includes(c))) return false;
      if (filters.tags.length && !filters.tags.some(t => p.tags.includes(t))) return false;
      if (filters.types.length && !filters.types.some(t => (p.typeTags ?? []).includes(t))) return false;
      if (filters.onlySelected && !setIds.has(p.id)) return false;
      return true;
    });
  }, [allProblems, filters, setIds]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortKey === 'num') arr.sort((a, b) => a.num - b.num || a.year - b.year || a.month - b.month);
    else if (sortKey === 'year') arr.sort((a, b) => a.year - b.year || a.month - b.month || a.num - b.num);
    else arr.sort((a, b) => (a.tags[0] ?? '').localeCompare(b.tags[0] ?? '') || a.num - b.num);
    return arr;
  }, [filtered, sortKey]);

  function updateSet(updater: (ps: ProblemSet) => ProblemSet) {
    if (!currentSet) return;
    const updated = problemSets.map(ps => ps.id === currentSet.id ? updater(ps) : ps);
    setProblemSets(updated);
    saveProblemSets(updated);
  }

  function toggleProblem(p: Problem) {
    updateSet(ps => ({
      ...ps,
      problemIds: ps.problemIds.includes(p.id)
        ? ps.problemIds.filter(id => id !== p.id)
        : [...ps.problemIds, p.id],
    }));
  }

  function selectAllFiltered() {
    const filteredIds = sorted.map(p => p.id);
    const allSelected = filteredIds.every(id => setIds.has(id));
    updateSet(ps => ({
      ...ps,
      problemIds: allSelected
        ? ps.problemIds.filter(id => !filteredIds.includes(id))
        : [...ps.problemIds, ...filteredIds.filter(id => !ps.problemIds.includes(id))],
    }));
  }

  function reorder(from: number, to: number) {
    if (!currentSet || to < 0 || to >= currentSet.problemIds.length) return;
    const arr = [...currentSet.problemIds];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    updateSet(ps => ({ ...ps, problemIds: arr }));
  }

  function updateProblem(updated: Problem) {
    setAllProblems(prev => prev.map(p => p.id === updated.id ? updated : p));
  }

  function createNewSet() {
    const newSet: ProblemSet = {
      id: crypto.randomUUID(),
      name: `문제집 ${problemSets.length + 1}`,
      createdAt: new Date().toISOString(),
      studentIds: [],
      problemIds: [],
      includeSolution: true,
    };
    const updated = [...problemSets, newSet];
    setProblemSets(updated);
    saveProblemSets(updated);
    setPage({ type: 'editor', setId: newSet.id });
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: 16, color: '#888' }}>문제 불러오는 중...</div>;
  }

  if (page.type === 'home') {
    return (
      <HomePage
        students={students}
        problemSets={problemSets}
        onStudentsChange={s => { setStudents(s); saveStudents(s); }}
        onSetsChange={ps => { setProblemSets(ps); saveProblemSets(ps); }}
        onOpenSet={id => setPage({ type: 'editor', setId: id })}
        onNewSet={createNewSet}
      />
    );
  }

  // ── 편집기 페이지 ──
  return (
    <>
      {showPreview && currentSet && (
        <PrintPreview
          problems={setProblemList}
          includeSolution={currentSet.includeSolution}
          onClose={() => setShowPreview(false)}
        />
      )}

      <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif', overflow: 'hidden' }}>
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          allYears={allYears}
          allSubjects={allSubjects}
          allConcepts={allConcepts}
          allTypes={allTypes}
        />

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* 툴바 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
            borderBottom: '1px solid #e8e8e8', background: '#fff', flexShrink: 0,
            position: 'relative',
          }}>
            <button onClick={() => setPage({ type: 'home' })} style={{
              fontSize: 14, padding: '8px 18px', borderRadius: 8,
              border: 'none', background: '#4f8ef7', color: '#fff',
              cursor: 'pointer', fontWeight: 700, flexShrink: 0,
              boxShadow: '0 2px 6px rgba(79,142,247,0.3)',
            }}>🏠 홈</button>

            {/* 중앙 타이틀 */}
            <div style={{
              position: 'absolute', left: '50%', transform: 'translateX(-50%)',
              display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none',
            }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{currentSet?.name ?? '문제집'}</span>
              <span style={{ fontSize: 12, color: '#aaa' }}>
                {sorted.length}개 표시 / 전체 {allProblems.length}개
              </span>
            </div>

            <div style={{ flex: 1 }} />

            {(() => {
              const filteredIds = sorted.map(p => p.id);
              const allSelected = filteredIds.length > 0 && filteredIds.every(id => setIds.has(id));
              return (
                <button
                  onClick={selectAllFiltered}
                  disabled={sorted.length === 0}
                  style={{
                    fontSize: 12, padding: '4px 12px', borderRadius: 6, cursor: sorted.length > 0 ? 'pointer' : 'default',
                    border: `1px solid ${allSelected ? '#e53935' : '#4f8ef7'}`,
                    background: allSelected ? '#fff0f0' : '#e8f0fe',
                    color: allSelected ? '#e53935' : '#4f8ef7',
                    fontWeight: 600,
                  }}
                >
                  {allSelected ? '전체 해제' : '전체 선택'} ({sorted.length})
                </button>
              );
            })()}

            <label style={{ fontSize: 12, color: '#555' }}>높이:</label>
            <input
              type="range" min={100} max={600} step={10}
              value={cardHeight}
              onChange={e => setCardHeight(Number(e.target.value))}
              style={{ width: 80, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 12, color: '#888', minWidth: 28 }}>{cardHeight}</span>

            <label style={{ fontSize: 12, color: '#555' }}>정렬:</label>
            <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
              style={{ fontSize: 12, padding: '3px 8px', borderRadius: 5, border: '1px solid #ddd' }}>
              <option value="num">문제 번호</option>
              <option value="year">연도</option>
              <option value="concept">태그</option>
            </select>

            <label style={{ fontSize: 12, color: '#555' }}>열:</label>
            {[1, 2, 3].map(n => (
              <button key={n} onClick={() => setCols(n)} style={{
                padding: '3px 8px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
                border: cols === n ? '2px solid #4f8ef7' : '1px solid #ddd',
                background: cols === n ? '#e8f0fe' : '#fff',
                color: cols === n ? '#4f8ef7' : '#555',
              }}>{n}</button>
            ))}
          </div>

          {/* 문제 그리드 */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <div style={{
              padding: 16, display: 'grid', gap: 12,
              gridTemplateColumns: cols === 1 ? 'minmax(0, 680px)' : `repeat(${cols}, 1fr)`,
              justifyContent: cols === 1 ? 'center' : 'stretch',
            }}>
              {sorted.map(p => (
                <ProblemCard
                  key={p.id}
                  problem={p}
                  allConcepts={allConcepts}
                  allTags={allTags}
                  inSet={setIds.has(p.id)}
                  onToggleSet={() => toggleProblem(p)}
                  onUpdate={updateProblem}
                  cardHeight={cardHeight}
                />
              ))}
              {sorted.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 60, color: '#aaa', fontSize: 14 }}>
                  조건에 맞는 문제가 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>

        <SetPanel
          set={setProblemList}
          onReorder={reorder}
          onRemove={id => updateSet(ps => ({ ...ps, problemIds: ps.problemIds.filter(pid => pid !== id) }))}
          onClear={() => updateSet(ps => ({ ...ps, problemIds: [] }))}
          onPreview={() => setShowPreview(true)}
          includeSolution={currentSet?.includeSolution ?? false}
          onToggleSolution={() => updateSet(ps => ({ ...ps, includeSolution: !ps.includeSolution }))}
          onlySelected={filters.onlySelected}
          onToggleOnlySelected={v => setFilters(f => ({ ...f, onlySelected: v }))}
        />
      </div>
    </>
  );
}
