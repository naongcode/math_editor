import { useState } from 'react';
import type { Student, ProblemSet } from '../types';
import { saveStudents, saveProblemSets } from '../store';

interface Props {
  students: Student[];
  problemSets: ProblemSet[];
  onStudentsChange: (s: Student[]) => void;
  onSetsChange: (s: ProblemSet[]) => void;
  onOpenSet: (setId: string) => void;
  onNewSet: () => void;
}

export default function HomePage({
  students, problemSets, onStudentsChange, onSetsChange, onOpenSet, onNewSet,
}: Props) {
  const [newStudentName, setNewStudentName] = useState('');
  const [filterStudent, setFilterStudent] = useState<string>('all');

const [renamingSetId, setRenamingSetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  function addStudent() {
    const name = newStudentName.trim();
    if (!name) return;
    const updated = [...students, { id: crypto.randomUUID(), name }];
    onStudentsChange(updated);
    saveStudents(updated);
    setNewStudentName('');
  }

  function removeStudent(id: string) {
    if (!confirm('학생을 삭제하면 해당 학생의 문제집 배정도 해제됩니다.')) return;
    const updated = students.filter(s => s.id !== id);
    onStudentsChange(updated);
    saveStudents(updated);
    // 문제집에서 해당 학생 배정 해제
    const updatedSets = problemSets.map(ps => ({
      ...ps, studentIds: ps.studentIds.filter(sid => sid !== id),
    }));
    onSetsChange(updatedSets);
    saveProblemSets(updatedSets);
  }

  function deleteSet(id: string) {
    if (!confirm('문제집을 삭제하시겠습니까?')) return;
    const updated = problemSets.filter(ps => ps.id !== id);
    onSetsChange(updated);
    saveProblemSets(updated);
  }

  function toggleStudentAssign(setId: string, studentId: string) {
    const updated = problemSets.map(ps => {
      if (ps.id !== setId) return ps;
      const has = ps.studentIds.includes(studentId);
      return { ...ps, studentIds: has ? ps.studentIds.filter(s => s !== studentId) : [...ps.studentIds, studentId] };
    });
    onSetsChange(updated);
    saveProblemSets(updated);
  }

  function startRename(ps: ProblemSet) {
    setRenamingSetId(ps.id);
    setRenameValue(ps.name);
  }

  function confirmRename(id: string) {
    const name = renameValue.trim();
    if (!name) return;
    const updated = problemSets.map(ps => ps.id === id ? { ...ps, name } : ps);
    onSetsChange(updated);
    saveProblemSets(updated);
    setRenamingSetId(null);
  }

  const filteredSets = filterStudent === 'all'
    ? problemSets
    : problemSets.filter(ps => ps.studentIds.includes(filterStudent));

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f8', fontFamily: 'system-ui, sans-serif' }}>
      {/* 상단 헤더 */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e0e0e0',
        padding: '16px 32px', display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: '#4f8ef7' }}>📚 수학 문제 뱅크</span>
        <div style={{ flex: 1 }} />
        <button onClick={onNewSet} style={{
          padding: '9px 22px', borderRadius: 8, border: 'none',
          background: '#4f8ef7', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
        }}>
          + 새 문제집 만들기
        </button>
      </div>

      <div style={{ display: 'flex', gap: 24, padding: 32, maxWidth: 1200, margin: '0 auto' }}>

        {/* 왼쪽: 학생 관리 */}
        <div style={{ width: 240, flexShrink: 0 }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>학생 관리</div>

            {/* 학생 추가 */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              <input
                value={newStudentName}
                onChange={e => setNewStudentName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addStudent()}
                placeholder="학생 이름"
                style={{
                  width: 0, flex: 1, minWidth: 0, fontSize: 13, padding: '8px 8px',
                  border: '1px solid #ddd', borderRadius: 6, outline: 'none',
                }}
              />
              <button onClick={addStudent} style={{
                padding: '8px 10px', borderRadius: 6, border: 'none', flexShrink: 0,
                background: '#4f8ef7', color: '#fff', fontSize: 13, cursor: 'pointer',
              }}>추가</button>
            </div>

            {/* 학생 목록 */}
            {students.length === 0 && (
              <div style={{ fontSize: 13, color: '#bbb', textAlign: 'center', padding: '12px 0' }}>
                학생을 추가해주세요
              </div>
            )}
            {students.map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', padding: '7px 10px',
                borderRadius: 7, marginBottom: 4,
                background: filterStudent === s.id ? '#e8f0fe' : '#fafafa',
                border: filterStudent === s.id ? '1px solid #c5d8fd' : '1px solid #eee',
                cursor: 'pointer',
              }}
                onClick={() => setFilterStudent(filterStudent === s.id ? 'all' : s.id)}
              >
                <span style={{ fontSize: 13, flex: 1, fontWeight: filterStudent === s.id ? 600 : 400, color: filterStudent === s.id ? '#4f8ef7' : '#333' }}>
                  👤 {s.name}
                </span>
                <span style={{ fontSize: 11, color: '#aaa', marginRight: 6 }}>
                  {problemSets.filter(ps => ps.studentIds.includes(s.id)).length}개
                </span>
                <button
                  onClick={e => { e.stopPropagation(); removeStudent(s.id); }}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ccc', fontSize: 15 }}
                >×</button>
              </div>
            ))}

            {filterStudent !== 'all' && (
              <button
                onClick={() => setFilterStudent('all')}
                style={{ marginTop: 8, width: '100%', padding: '5px', fontSize: 12, borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#888' }}
              >전체 보기</button>
            )}
          </div>
        </div>

        {/* 오른쪽: 문제집 목록 */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              {filterStudent === 'all' ? '전체 문제집' : `${students.find(s => s.id === filterStudent)?.name}의 문제집`}
            </span>
            <span style={{ fontSize: 13, color: '#aaa', marginLeft: 8 }}>{filteredSets.length}개</span>
          </div>

          {filteredSets.length === 0 && (
            <div style={{
              background: '#fff', borderRadius: 12, padding: 48,
              textAlign: 'center', color: '#bbb', fontSize: 14,
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}>
              문제집이 없습니다.<br />
              <button onClick={onNewSet} style={{
                marginTop: 16, padding: '8px 20px', borderRadius: 7, border: 'none',
                background: '#4f8ef7', color: '#fff', cursor: 'pointer', fontSize: 13,
              }}>새 문제집 만들기</button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {filteredSets.map(ps => (
              <SetCard
                key={ps.id}
                ps={ps}
                students={students}
                isRenaming={renamingSetId === ps.id}
                renameValue={renameValue}
                onRenameChange={setRenameValue}
                onStartRename={() => startRename(ps)}
                onConfirmRename={() => confirmRename(ps.id)}
                onCancelRename={() => setRenamingSetId(null)}
                onOpen={() => onOpenSet(ps.id)}
                onDelete={() => deleteSet(ps.id)}
                onToggleStudent={sid => toggleStudentAssign(ps.id, sid)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface CardProps {
  ps: ProblemSet;
  students: Student[];
  isRenaming: boolean;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onStartRename: () => void;
  onConfirmRename: () => void;
  onCancelRename: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onToggleStudent: (sid: string) => void;
}

function SetCard({
  ps, students, isRenaming, renameValue, onRenameChange,
  onStartRename, onConfirmRename, onCancelRename, onOpen, onDelete, onToggleStudent,
}: CardProps) {
  const date = new Date(ps.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });

  return (
    <div style={{
      background: '#fff', borderRadius: 12, overflow: 'hidden',
      boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
      border: '1px solid #eee', display: 'flex', flexDirection: 'column',
    }}>
      {/* 카드 헤더 */}
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #f5f5f5' }}>
        {isRenaming ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              autoFocus
              value={renameValue}
              onChange={e => onRenameChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onConfirmRename(); if (e.key === 'Escape') onCancelRename(); }}
              style={{ flex: 1, fontSize: 14, padding: '4px 8px', border: '1px solid #4f8ef7', borderRadius: 5, outline: 'none' }}
            />
            <button onClick={onConfirmRename} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 5, border: 'none', background: '#4f8ef7', color: '#fff', cursor: 'pointer' }}>확인</button>
            <button onClick={onCancelRename} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 5, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}>취소</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span
              style={{ fontWeight: 700, fontSize: 15, flex: 1, cursor: 'pointer', color: '#222' }}
              onDoubleClick={onStartRename}
              title="더블클릭하여 이름 변경"
            >{ps.name}</span>
            <button onClick={onStartRename} style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, border: '1px solid #e0e0e0', background: '#fff', color: '#999', cursor: 'pointer', flexShrink: 0 }}>이름변경</button>
          </div>
        )}
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 6, display: 'flex', gap: 10 }}>
          <span>📋 {ps.problemIds.length}문제</span>
          <span>{date}</span>
          {ps.includeSolution && <span>📖 해설포함</span>}
        </div>
      </div>

      {/* 학생 배정 */}
      {students.length > 0 && (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid #f5f5f5' }}>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 5 }}>👥 학생 배정</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {students.map(s => (
              <button
                key={s.id}
                onClick={() => onToggleStudent(s.id)}
                style={{
                  fontSize: 12, padding: '3px 10px', borderRadius: 10, cursor: 'pointer',
                  border: ps.studentIds.includes(s.id) ? '1px solid #4f8ef7' : '1px solid #ddd',
                  background: ps.studentIds.includes(s.id) ? '#e8f0fe' : '#fff',
                  color: ps.studentIds.includes(s.id) ? '#4f8ef7' : '#666',
                  fontWeight: ps.studentIds.includes(s.id) ? 600 : 400,
                }}
              >{s.name}</button>
            ))}
          </div>
        </div>
      )}

      {/* 버튼 */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 16px' }}>
        <button onClick={onOpen} style={{
          flex: 1, padding: '7px', borderRadius: 7, border: 'none',
          background: '#4f8ef7', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer',
        }}>열기 / 편집</button>
        <button onClick={onDelete} style={{
          padding: '7px 12px', borderRadius: 7, border: '1px solid #fcc',
          background: '#fff', color: '#e53935', fontSize: 13, cursor: 'pointer',
        }}>삭제</button>
      </div>
    </div>
  );
}
