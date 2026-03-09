import { useRef, useState } from 'react';
import type { Problem } from '../types';
import { MONTH_LABELS } from '../store';

interface Props {
  set: Problem[];
  onReorder: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onPreview: () => void;
  includeSolution: boolean;
  onToggleSolution: () => void;
  onlySelected: boolean;
  onToggleOnlySelected: (v: boolean) => void;
}

export default function SetPanel({
  set, onReorder, onRemove, onClear, onPreview, includeSolution, onToggleSolution,
  onlySelected, onToggleOnlySelected,
}: Props) {
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function handleDragStart(idx: number) {
    dragIndex.current = idx;
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setOverIndex(idx);
  }

  function handleDrop(idx: number) {
    if (dragIndex.current !== null && dragIndex.current !== idx) {
      onReorder(dragIndex.current, idx);
    }
    dragIndex.current = null;
    setOverIndex(null);
  }

  function handleDragEnd() {
    dragIndex.current = null;
    setOverIndex(null);
  }

  return (
    <div style={{
      width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column',
      borderLeft: '1px solid #e0e0e0', background: '#fff',
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '12px 14px', borderBottom: '1px solid #e8e8e8',
        background: '#f8f9ff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>문제지 세트</span>
          <span style={{
            marginLeft: 8, fontSize: 11, padding: '1px 7px', borderRadius: 10,
            background: '#4f8ef722', color: '#4f8ef7', fontWeight: 600,
          }}>{set.length}문제</span>
          {set.length > 0 && (
            <button onClick={onClear} style={{
              marginLeft: 'auto', fontSize: 11, color: '#999', border: 'none',
              background: 'none', cursor: 'pointer', padding: '2px 4px',
            }}>전체 삭제</button>
          )}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', marginBottom: 6 }}>
          <input
            type="checkbox"
            checked={includeSolution}
            onChange={onToggleSolution}
            style={{ accentColor: '#4f8ef7' }}
          />
          해설 포함
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={onlySelected}
            onChange={e => onToggleOnlySelected(e.target.checked)}
            style={{ accentColor: '#4f8ef7' }}
          />
          선택된 문제만 보기
        </label>

        <button
          onClick={onPreview}
          disabled={set.length === 0}
          style={{
            width: '100%', padding: '8px', borderRadius: 7, border: 'none',
            background: set.length > 0 ? '#4f8ef7' : '#e0e0e0',
            color: set.length > 0 ? '#fff' : '#aaa',
            fontWeight: 600, fontSize: 13, cursor: set.length > 0 ? 'pointer' : 'default',
          }}
        >
          🖨️ 미리보기 / 인쇄
        </button>
      </div>

      {/* 문제 목록 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {set.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: '#bbb', fontSize: 13 }}>
            문제를 선택하면<br />여기에 추가됩니다
          </div>
        )}
        {set.map((p, idx) => {
          const isOver = overIndex === idx && dragIndex.current !== null && dragIndex.current !== idx;
          const isDragging = dragIndex.current === idx;
          return (
            <div
              key={p.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderBottom: '1px solid #f5f5f5',
                cursor: 'grab',
                opacity: isDragging ? 0.4 : 1,
                borderTop: isOver ? '2px solid #4f8ef7' : '2px solid transparent',
                background: isDragging ? '#f0f4ff' : 'transparent',
                transition: 'border-top 0.1s',
              }}
            >
              {/* 드래그 핸들 */}
              <span style={{
                fontSize: 13, color: '#ccc', cursor: 'grab',
                userSelect: 'none', flexShrink: 0, lineHeight: 1,
              }}>⠿</span>

              {/* 순서 번호 */}
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#4f8ef7',
                width: 18, textAlign: 'center', flexShrink: 0,
              }}>{idx + 1}</span>

              {/* 문제 정보 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>
                  {p.num}번
                </div>
                <div style={{ fontSize: 10, color: '#999', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.year} {MONTH_LABELS[p.month]}
                </div>
                {p.concepts.length > 0 && (
                  <div style={{
                    fontSize: 9, color: '#e65100', marginTop: 1,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {p.concepts.join(', ')}
                  </div>
                )}
              </div>

              {/* 삭제 */}
              <button
                onClick={() => onRemove(p.id)}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  color: '#ccc', fontSize: 16, lineHeight: 1, padding: '0 2px',
                  flexShrink: 0,
                }}
              >×</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
