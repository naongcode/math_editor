import { useState } from 'react';
import type { Problem } from '../types';
import { MONTH_LABELS } from '../store';

interface Props {
  problems: Problem[];
  includeSolution: boolean;
  onClose: () => void;
}

export default function PrintView({ problems, includeSolution, onClose }: Props) {
  const [cols, setCols] = useState(1);

  return (
    <>
      {/* 화면용 컨트롤 (인쇄 시 숨김) */}
      <div className="no-print" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        background: '#1a1a2e', color: '#fff', padding: '10px 20px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontWeight: 600 }}>인쇄 미리보기 — {problems.length}개 문제</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 16 }}>
          <span style={{ fontSize: 13, color: '#aaa' }}>열:</span>
          {[1, 2].map(n => (
            <button
              key={n}
              onClick={() => setCols(n)}
              style={{
                padding: '3px 10px', borderRadius: 5, fontSize: 12,
                border: cols === n ? '2px solid #4f8ef7' : '1px solid #555',
                background: cols === n ? '#4f8ef7' : 'transparent',
                color: '#fff', cursor: 'pointer',
              }}
            >
              {n}열
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />
        <button
          onClick={() => window.print()}
          style={{
            padding: '6px 20px', borderRadius: 6, border: 'none',
            background: '#4f8ef7', color: '#fff', cursor: 'pointer', fontWeight: 600,
          }}
        >
          🖨️ 인쇄
        </button>
        <button
          onClick={onClose}
          style={{
            padding: '6px 16px', borderRadius: 6, border: '1px solid #555',
            background: 'transparent', color: '#ccc', cursor: 'pointer',
          }}
        >
          닫기
        </button>
      </div>

      {/* 인쇄 콘텐츠 */}
      <div className="print-content" style={{ paddingTop: 56 }}>
        <div style={{
          columns: cols,
          columnGap: 24,
          padding: '20px',
          maxWidth: cols === 1 ? 700 : 960,
          margin: '0 auto',
        }}>
          {problems.map((p, idx) => (
            <div
              key={p.id}
              style={{
                breakInside: 'avoid',
                pageBreakInside: 'avoid',
                display: 'inline-block',
                width: '100%',
                borderBottom: '1px solid #e0e0e0',
                paddingBottom: 12,
                marginBottom: 12,
              }}
            >
              {/* 문제 헤더 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  {idx + 1}.
                </span>
                <span style={{ fontSize: 11, color: '#888' }}>
                  [{p.year} {MONTH_LABELS[p.month]} {p.num}번]
                </span>
                {p.concepts.map(c => (
                  <span key={c} style={{
                    fontSize: 10, padding: '0 5px', borderRadius: 6,
                    background: '#fff3e0', color: '#e65100',
                    border: '1px solid #ffe0b2',
                  }}>{c}</span>
                ))}
                {p.tags.map(t => (
                  <span key={t} style={{
                    fontSize: 10, padding: '0 5px', borderRadius: 6,
                    background: '#e8f5e9', color: '#2e7d32',
                    border: '1px solid #c8e6c9',
                  }}>{t}</span>
                ))}
              </div>
              {/* 문제 이미지 */}
              <img
                src={`/${p.image}`}
                alt={`${p.num}번`}
                style={{ width: '100%', display: 'block' }}
              />
            </div>
          ))}
        </div>

        {/* 해설 섹션 */}
        {includeSolution && problems.some(p => p.solutionImage) && (
          <div style={{ pageBreakBefore: 'always', padding: '20px' }}>
            <h2 style={{
              borderBottom: '2px solid #333', paddingBottom: 8, marginBottom: 16,
              maxWidth: cols === 1 ? 700 : 960, margin: '0 auto 16px',
            }}>
              해설
            </h2>
            <div style={{
              columns: cols,
              columnGap: 24,
              maxWidth: cols === 1 ? 700 : 960,
              margin: '0 auto',
            }}>
              {problems.filter(p => p.solutionImage).map((p, idx) => (
                <div
                  key={p.id}
                  style={{
                    breakInside: 'avoid',
                    pageBreakInside: 'avoid',
                    display: 'inline-block',
                    width: '100%',
                    paddingBottom: 12,
                    marginBottom: 12,
                    borderBottom: '1px solid #e0e0e0',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#555' }}>
                    {idx + 1}. [{p.year} {MONTH_LABELS[p.month]} {p.num}번]
                  </div>
                  <img
                    src={`/${p.solutionImage}`}
                    alt={`${p.num}번 해설`}
                    style={{ width: '100%', display: 'block' }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
