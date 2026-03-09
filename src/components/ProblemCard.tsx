import { useState } from 'react';
import type { Problem } from '../types';
import { MONTH_LABELS, saveAnnotation } from '../store';
import TagEditor from './TagEditor';

interface Props {
  problem: Problem;
  allConcepts: string[];
  allTags: string[];
  inSet: boolean;
  onToggleSet: () => void;
  onUpdate: (p: Problem) => void;
  cardHeight?: number;
}

export default function ProblemCard({
  problem, allConcepts, allTags, inSet, onToggleSet, onUpdate, cardHeight = 220,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [showSol, setShowSol] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [naturalSize, setNaturalSize] = useState(true);
  const [draft, setDraft] = useState({ ...problem });

  function save() {
    const updated = { ...problem, ...draft };
    saveAnnotation(problem.id, {
      tags: updated.tags,
      concepts: [],
      memo: '',
    });
    onUpdate(updated);
    setEditing(false);
  }

  function cancel() {
    setDraft({ ...problem });
    setEditing(false);
  }

  const displayYear = problem.month === 11 ? problem.year + 1 : problem.year;
  const examLabel = `${displayYear}년 ${MONTH_LABELS[problem.month] ?? problem.month + '월'}`;
  const activeImg = (showSol && problem.solutionImage) ? problem.solutionImage : problem.image;
  const base = import.meta.env.BASE_URL;
  const imgSrc = activeImg ? `${base}${activeImg}` : null;
  const solImgSrcs = showSol && problem.solutionImages && problem.solutionImages.length > 1
    ? problem.solutionImages.map(s => `${base}${s}`)
    : null;

  return (
    <>
      {/* 전체보기 모달 */}
      {expanded && (
        <div
          onClick={() => setExpanded(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 500,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 40,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: 800, width: '100%', maxHeight: '90vh', background: '#fff', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', background: '#f8f9ff', borderBottom: '1px solid #eee',
            }}>
              <span style={{ fontWeight: 700 }}>{problem.num}번</span>
              <span style={{ fontSize: 12, color: '#888' }}>{examLabel}</span>
              {problem.subject && <span style={{ fontSize: 11, color: '#fff', background: '#7b1fa2', borderRadius: 4, padding: '1px 5px' }}>{problem.subject}</span>}
              {problem.solutionImage && (
                <button onClick={() => setShowSol(s => !s)} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 5,
                  border: '1px solid #ccc', background: showSol ? '#4f8ef7' : '#fff',
                  color: showSol ? '#fff' : '#666', cursor: 'pointer', marginLeft: 4,
                }}>해설</button>
              )}
              <div style={{ flex: 1 }} />
              <button onClick={() => setNaturalSize(s => !s)} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 5, cursor: 'pointer',
                border: '1px solid #ccc', background: naturalSize ? '#4f8ef7' : '#fff',
                color: naturalSize ? '#fff' : '#666',
              }}>{naturalSize ? '맞춤' : '원본 크기'}</button>
              <button onClick={() => setExpanded(false)} style={{
                border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#888',
              }}>×</button>
            </div>
            <div style={{ overflow: 'auto', flex: 1 }}>
              {imgSrc
                ? <img src={imgSrc} alt="" style={naturalSize ? { display: 'block', maxWidth: 'none' } : { width: '100%', display: 'block' }} />
                : <div style={{ padding: 16, color: '#aaa', textAlign: 'center' }}>이미지 없음</div>
              }
            </div>
          </div>
        </div>
      )}

      <div style={{
        border: inSet ? '2px solid #4f8ef7' : '1px solid #e0e0e0',
        borderRadius: 10, background: '#fff', overflow: 'hidden',
        boxShadow: inSet ? '0 0 0 2px #4f8ef733' : '0 1px 4px rgba(0,0,0,0.06)',
        transition: 'border-color 0.15s',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* 헤더 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 12px', borderBottom: '1px solid #f0f0f0',
          background: inSet ? '#f0f5ff' : '#fafafa',
        }}>
          <input
            type="checkbox"
            checked={inSet}
            onChange={onToggleSet}
            style={{ width: 17, height: 17, cursor: 'pointer', accentColor: '#4f8ef7', flexShrink: 0 }}
          />
          <span style={{ fontWeight: 700, fontSize: 16, color: '#222' }}>{problem.num}번</span>
          <span style={{ fontSize: 13, color: '#888' }}>{examLabel}</span>
          {problem.subject && <span style={{ fontSize: 11, color: '#fff', background: '#7b1fa2', borderRadius: 4, padding: '1px 6px' }}>{problem.subject}</span>}

          {/* 유형 (인라인) */}
          {(problem.typeTags ?? []).map(t => (
            <span key={t} style={{
              fontSize: 12, padding: '2px 8px', borderRadius: 8,
              background: '#e8f0fe', color: '#4f8ef7', border: '1px solid #c5d8fd',
            }}>{t}</span>
          ))}

          <div style={{ flex: 1 }} />

          {problem.solutionImage && (
            <button onClick={() => setShowSol(s => !s)} style={{
              fontSize: 12, padding: '3px 10px', borderRadius: 5,
              border: '1px solid #ccc', background: showSol ? '#4f8ef7' : '#fff',
              color: showSol ? '#fff' : '#666', cursor: 'pointer',
            }}>해설</button>
          )}
          <button onClick={() => setEditing(e => !e)} style={{
            fontSize: 12, padding: '3px 10px', borderRadius: 5,
            border: '1px solid #ccc', background: editing ? '#e8f4e8' : '#fff',
            color: '#555', cursor: 'pointer',
          }}>{editing ? '편집중' : '편집'}</button>
        </div>

        {/* 편집 패널 — 이미지 위, 항상 같은 위치 */}
        {editing && (
          <div style={{ padding: '10px', borderBottom: '1px solid #e8e8e8', background: '#fafafa' }}>
            <TagEditor
              label="태그"
              values={draft.tags}
              suggestions={[...allConcepts, ...allTags]}
              onChange={v => setDraft(d => ({ ...d, tags: v, concepts: [] }))}
              color="#4f8ef7"
            />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
              <button onClick={cancel} style={{
                fontSize: 12, padding: '4px 12px', borderRadius: 5,
                border: '1px solid #ccc', background: '#fff', cursor: 'pointer',
              }}>취소</button>
              <button onClick={save} style={{
                fontSize: 12, padding: '4px 12px', borderRadius: 5,
                border: 'none', background: '#4f8ef7', color: '#fff', cursor: 'pointer',
              }}>저장</button>
            </div>
          </div>
        )}

        {/* 문제 이미지 */}
        <div
          onClick={() => !editing && setExpanded(true)}
          style={{
            padding: '6px 8px', background: '#fff',
            cursor: editing ? 'default' : 'zoom-in',
            position: 'relative',
            height: cardHeight, overflow: 'hidden',
          }}
        >
          {solImgSrcs
            ? solImgSrcs.map((src, i) => (
                <img key={i} src={src} alt={`${problem.num}번 해설 ${i + 1}`}
                  style={{ width: '100%', display: 'block', borderRadius: 3 }} loading="lazy" />
              ))
            : imgSrc
              ? <img src={imgSrc} alt={`${problem.num}번`} style={{ width: '100%', display: 'block', borderRadius: 3 }} loading="lazy" />
              : <div style={{ padding: 12, color: '#aaa', textAlign: 'center', fontSize: 12 }}>이미지 없음</div>
          }
        </div>

      </div>
    </>
  );
}
