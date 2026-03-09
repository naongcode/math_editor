import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Problem } from '../types';
import { MONTH_LABELS } from '../store';

interface Props {
  problems: Problem[];
  includeSolution: boolean;
  onClose: () => void;
}

const PAGE_W = 740;
const PAGE_H = 1047;
const MARGIN = 48;
const AVAIL_H = PAGE_H - MARGIN * 2;
const HALF_H = AVAIL_H / 2;

interface PageItem {
  problem: Problem;
  index: number;
  isSolution: boolean;
  solImgSrc?: string;   // 특정 세그먼트 이미지 경로 (solutionImages 분리 시)
  solSegIdx?: number;   // 세그먼트 인덱스 (0 = 첫 번째만 헤더 표시)
}

interface SlottedItem {
  item: PageItem;
  full: boolean; // true: 페이지 전체, false: 절반
  col: 0 | 1;   // 2열 모드 컬럼 배정
}

export default function PrintPreview({ problems, includeSolution, onClose }: Props) {
  const [cols, setCols] = useState(2);
  const [pages, setPages] = useState<SlottedItem[][]>([[]]);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [measured, setMeasured] = useState(false);

  const allItems: PageItem[] = [
    ...problems.map((p, i) => ({ problem: p, index: i + 1, isSolution: false })),
    ...(includeSolution
      ? problems.flatMap((p, i) => {
          const imgs = p.solutionImages && p.solutionImages.length > 0
            ? p.solutionImages
            : p.solutionImage ? [p.solutionImage] : [];
          return imgs.map((src, j) => ({
            problem: p, index: i + 1, isSolution: true, solImgSrc: src, solSegIdx: j,
          }));
        })
      : []),
  ];

  useEffect(() => {
    setMeasured(false);
    const timer = setTimeout(() => {
      const contentW = PAGE_W - MARGIN * 2;
      const judgeW = cols === 1 ? contentW : (contentW - 16) / 2;
      const newPages: SlottedItem[][] = [[]];
      let prevWasSolution = false;
      // 2열용: 0=왼위, 1=왼아래, 2=오른위, 3=오른아래
      let pos = 0;

      for (const item of allItems) {
        const key = item.isSolution ? `${item.problem.id}_sol_${item.solSegIdx ?? 0}` : item.problem.id;
        const el = itemRefs.current.get(key);
        if (!el) continue;

        // 해설 섹션: 새 페이지 강제
        if (item.isSolution && !prevWasSolution) {
          if (newPages[newPages.length - 1].length > 0) {
            newPages.push([]);
            pos = 0;
          }
        }
        prevWasSolution = item.isSolution;

        const imgEl = el.querySelector('img') as HTMLImageElement | null;
        let imgH = 0;
        if (imgEl && imgEl.naturalHeight > 0) {
          imgH = judgeW * (imgEl.naturalHeight / imgEl.naturalWidth);
        }
        const itemH = 28 + imgH + 16;
        const full = itemH > HALF_H;

        if (cols === 1) {
          const curPage = newPages[newPages.length - 1];
          if (full) {
            if (curPage.length > 0) newPages.push([]);
            newPages[newPages.length - 1].push({ item, full: true, col: 0 });
            newPages.push([]);
          } else {
            if (curPage.length >= 2 || (curPage.length === 1 && curPage[0].full)) {
              newPages.push([{ item, full: false, col: 0 }]);
            } else {
              curPage.push({ item, full: false, col: 0 });
              if (curPage.length === 2) newPages.push([]);
            }
          }
        } else {
          // 2열: 왼위→왼아래→오른위→오른아래
          if (full) {
            // full은 컬럼 상단(pos 0 또는 2)에서만 시작
            if (pos === 1) pos = 2;           // 왼아래만 남으면 오른쪽으로
            if (pos >= 3) { newPages.push([]); pos = 0; } // 오른쪽도 안되면 새 페이지
            const col = pos === 0 ? 0 : 1;
            newPages[newPages.length - 1].push({ item, full: true, col });
            pos = col === 0 ? 2 : 4;
          } else {
            if (pos >= 4) { newPages.push([]); pos = 0; }
            newPages[newPages.length - 1].push({ item, full: false, col: (pos < 2 ? 0 : 1) as 0 | 1 });
            pos++;
          }
          if (pos >= 4) { newPages.push([]); pos = 0; }
        }
      }

      // 빈 마지막 페이지 제거
      while (newPages.length > 1 && newPages[newPages.length - 1].length === 0) newPages.pop();

      setPages(newPages);
      setMeasured(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [cols, problems, includeSolution]);

  const renderPages = (pages: SlottedItem[][]) =>
    pages.map((pageSlots, pi) => (
      <A4Page key={pi} pageNum={pi + 1} totalPages={pages.length}>
        {cols === 1 ? (
          <div style={{ height: AVAIL_H }}>
            {pageSlots.map((slot, si) => (
              <div key={slot.item.isSolution ? `${slot.item.problem.id}_sol_${slot.item.solSegIdx ?? 0}` : slot.item.problem.id}
                style={{
                  height: slot.full ? AVAIL_H : HALF_H,
                  overflow: 'hidden',
                  borderBottom: !slot.full && si === 0 && pageSlots.length > 1 ? '1px dashed #e0e0e0' : 'none',
                  boxSizing: 'border-box',
                }}>
                <ProblemItem item={slot.item} />
              </div>
            ))}
          </div>
        ) : (
          <TwoColLayout slots={pageSlots} />
        )}
      </A4Page>
    ));

  return (
    <>
      {/* 화면 미리보기 오버레이 */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: '#3a3a4a', display: 'flex', flexDirection: 'column' }}>
        {/* 툴바 */}
        <div className="no-print" style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 20px', background: '#1a1a2e', color: '#fff', flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>인쇄 미리보기</span>
          <span style={{ fontSize: 12, color: '#aaa' }}>{problems.length}문제 · {pages.length}페이지</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 16 }}>
            <span style={{ fontSize: 12, color: '#aaa' }}>열:</span>
            {[1, 2].map(n => (
              <button key={n} onClick={() => setCols(n)} style={{
                padding: '3px 12px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
                border: cols === n ? '2px solid #4f8ef7' : '1px solid #555',
                background: cols === n ? '#4f8ef7' : 'transparent', color: '#fff',
              }}>{n}열</button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={() => window.print()} style={{
            padding: '7px 24px', borderRadius: 6, border: 'none',
            background: '#4f8ef7', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}>🖨️ 인쇄</button>
          <button onClick={onClose} style={{
            padding: '7px 16px', borderRadius: 6, border: '1px solid #555',
            background: 'transparent', color: '#ccc', cursor: 'pointer',
          }}>닫기</button>
        </div>

        {/* 페이지 스크롤 미리보기 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          {/* 측정용 숨김 렌더링 */}
          {!measured && (
            <div style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', width: PAGE_W - MARGIN * 2 }}>
              {allItems.map(item => {
                const key = item.isSolution ? `${item.problem.id}_sol_${item.solSegIdx ?? 0}` : item.problem.id;
                const base = import.meta.env.BASE_URL;
                const src = item.isSolution
                  ? (item.solImgSrc ? `${base}${item.solImgSrc}` : `${base}${item.problem.solutionImage}`)
                  : `${base}${item.problem.image}`;
                return (
                  <div key={key} ref={el => { if (el) itemRefs.current.set(key, el); }}>
                    <img src={src} alt="" />
                  </div>
                );
              })}
            </div>
          )}
          {renderPages(pages)}
        </div>
      </div>

      {/* 인쇄 전용 포털: body 직접 자식으로 렌더링 */}
      {createPortal(
        <div className="print-portal">
          <style>{`
            @media screen { .print-portal { display: none; } }
            @media print {
              body > *:not(.print-portal) { display: none !important; }
              .print-portal {
                display: block;
                background: white;
              }
              .print-page {
                box-shadow: none !important;
                margin: 0 auto !important;
              }
              .print-page + .print-page {
                page-break-before: always;
                break-before: page;
              }
            }
          `}</style>
          {renderPages(pages)}
        </div>,
        document.body
      )}
    </>
  );
}

function A4Page({ children, pageNum, totalPages }: { children: React.ReactNode; pageNum: number; totalPages: number }) {
  return (
    <div className="print-page" style={{
      width: PAGE_W, minHeight: PAGE_H, background: '#fff',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      padding: MARGIN, position: 'relative', flexShrink: 0, boxSizing: 'border-box',
    }}>
      {children}
      <div className="no-print" style={{ position: 'absolute', bottom: 12, right: 16, fontSize: 11, color: '#bbb' }}>
        {pageNum} / {totalPages}
      </div>
    </div>
  );
}

function ProblemItem({ item }: { item: PageItem }) {
  const p = item.problem;
  const base = import.meta.env.BASE_URL;
  const src = item.isSolution
    ? (item.solImgSrc ? `${base}${item.solImgSrc}` : `${base}${p.solutionImage}`)
    : `${base}${p.image}`;
  const showHeader = !item.isSolution || (item.solSegIdx ?? 0) === 0;
  return (
    <div style={{ paddingBottom: 8 }}>
      {showHeader && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{item.index}.</span>
          <span style={{ fontSize: 10, color: '#999' }}>
            {item.isSolution ? '[해설] ' : ''}{p.year} {MONTH_LABELS[p.month]} {p.num}번
          </span>
          {!item.isSolution && p.tags.map(t => (
            <span key={t} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 5, background: '#e8f5e9', color: '#2e7d32', border: '1px solid #c8e6c9' }}>{t}</span>
          ))}
        </div>
      )}
      <img src={src} alt="" style={{ width: '100%', display: 'block' }} />
    </div>
  );
}

function TwoColLayout({ slots }: { slots: SlottedItem[] }) {
  const left = slots.filter(s => s.col === 0);
  const right = slots.filter(s => s.col === 1);
  const renderCol = (col: SlottedItem[]) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {col.map(s => (
        <div key={s.item.isSolution ? `${s.item.problem.id}_sol` : s.item.problem.id}
          style={{ height: s.full ? AVAIL_H : HALF_H, overflow: 'hidden', boxSizing: 'border-box' }}>
          <ProblemItem item={s.item} />
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {renderCol(left)}
      {renderCol(right)}
    </div>
  );
}
