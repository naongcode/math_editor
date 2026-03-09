import { MONTH_LABELS } from '../store';

interface Filters {
  years: number[];
  months: number[];
  subjects: string[];
  nums: string;        // "1-5,8,12-15" 형태
  concepts: string[];
  tags: string[];
  types: string[];
  onlySelected: boolean;
}

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  allYears: number[];
  allSubjects: string[];
  allConcepts: string[];
  allTags: string[];
  allTypes: string[];
  selectedCount: number;
  totalCount: number;
  onHome: () => void;
}

export default function FilterPanel({
  filters, onChange, allYears, allSubjects, allConcepts, allTags, allTypes, selectedCount, totalCount, onHome,
}: Props) {
  function toggleSet<T>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
  }

  const allMonths = [3, 4, 5, 6, 7, 9, 10, 11];

  return (
    <div style={{
      width: 270, flexShrink: 0, padding: '16px 14px',
      borderRight: '1px solid #e8e8e8', background: '#fafafa',
      display: 'flex', flexDirection: 'column', overflowY: 'auto', gap: 16,
    }}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>필터</div>


      {/* 문제 번호 */}
      <Section title="문제 번호">
        <input
          value={filters.nums}
          onChange={e => onChange({ ...filters, nums: e.target.value })}
          placeholder="예) 1-5, 8, 12-15"
          style={{
            width: '100%', fontSize: 12, padding: '4px 8px',
            border: '1px solid #ddd', borderRadius: 5, boxSizing: 'border-box',
          }}
        />
        <div style={{ fontSize: 10, color: '#aaa', marginTop: 3 }}>
          범위/콤마 조합 가능
        </div>
      </Section>

      {/* 연도 */}
      <Section title="연도">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {allYears.map(y => (
            <Chip
              key={y}
              label={`${y % 100}`}
              active={filters.years.includes(y)}
              onClick={() => onChange({ ...filters, years: toggleSet(filters.years, y) })}
            />
          ))}
        </div>
      </Section>

      {/* 월 */}
      <Section title="시험">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {allMonths.map(m => (
            <Chip
              key={m}
              label={MONTH_LABELS[m]}
              active={filters.months.includes(m)}
              onClick={() => onChange({ ...filters, months: toggleSet(filters.months, m) })}
            />
          ))}
        </div>
      </Section>

      {/* 선택과목 (수능 23-30번) */}
      {allSubjects.length > 0 && (
        <Section title="선택과목">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {allSubjects.map(s => (
              <Chip
                key={s}
                label={s}
                active={filters.subjects.includes(s)}
                onClick={() => onChange({ ...filters, subjects: toggleSet(filters.subjects, s) })}
                color="#7b1fa2"
              />
            ))}
          </div>
        </Section>
      )}

      {/* 개념 */}
      {allConcepts.length > 0 && (
        <Section title="개념">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {allConcepts.map(c => (
              <Chip
                key={c}
                label={c}
                active={filters.concepts.includes(c)}
                onClick={() => onChange({ ...filters, concepts: toggleSet(filters.concepts, c) })}
                color="#e65100"
              />
            ))}
          </div>
        </Section>
      )}

      {/* 유형 (출제의도 자동추출) — 과목별 그룹 */}
      {allTypes.length > 0 && (
        <Section title="유형">
          <TypeGroups
            allTypes={allTypes}
            active={filters.types}
            onToggle={t => onChange({ ...filters, types: toggleSet(filters.types, t) })}
          />
        </Section>
      )}


      {/* 초기화 */}
      <button
        onClick={() => onChange({ years: [], months: [], subjects: [], nums: '', concepts: [], tags: [], types: [], onlySelected: false })}
        style={{
          padding: '6px', borderRadius: 6, border: '1px solid #ddd',
          background: '#fff', color: '#666', fontSize: 12, cursor: 'pointer',
        }}
      >
        필터 초기화
      </button>
    </div>
  );
}

// ── 유형 그룹 정의 ─────────────────────────────────────────
const TYPE_GROUPS: { label: string; tags: string[] }[] = [
  {
    label: '지수·로그',
    tags: ['거듭제곱근', '지수', '지수함수', '로그', '로그함수'],
  },
  {
    label: '삼각함수',
    tags: ['삼각함수', '삼각비', '사인/코사인법칙', '덧셈정리', '주기함수', '부채꼴'],
  },
  {
    label: '수열',
    tags: ['수열', '등차수열', '등비수열', '귀납적 정의', '귀납적정의'],
  },
  {
    label: '극한·연속',
    tags: ['극한', '연속', '사잇값', '미분가능성', '그래프의 개형', '평균값', '증가/감소'],
  },
  {
    label: '미분',
    tags: ['미분계수', '평균변화율', '미분', '도함수', '곱의 미분법',
           '접선', '극값', '최대/최소', '함수', '다항함수', '이차함수', '삼차함수', '사차함수'],
  },
  {
    label: '적분',
    tags: ['정적분', '부정적분', '넓이', '속도'],
  },
  {
    label: '경우의수',
    tags: ['경우의수', '순열', '중복순열', '조합', '중복조합', '원순열',
           '합의 법칙', '곱셈법칙', '이항계수', '이항정리'],
  },
  {
    label: '확률',
    tags: ['확률', '조건부확률', '여사건', '배반사건', '독립사건', '독립시행', '수학적 확률'],
  },
  {
    label: '통계',
    tags: ['확률변수', '이산확률변수', '연속확률변수', '확률분포',
           '이항분포', '정규분포', '표본평균', '신뢰구간', '표준정규분포표', '모표준편차'],
  },
];

const ALL_GROUPED = new Set(TYPE_GROUPS.flatMap(g => g.tags));

function TypeGroups({ allTypes, active, onToggle }: {
  allTypes: string[];
  active: string[];
  onToggle: (t: string) => void;
}) {
  const typeSet = new Set(allTypes);
  const others = allTypes.filter(t => !ALL_GROUPED.has(t)).sort();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {TYPE_GROUPS.map(group => {
        const visibleTags = group.tags.filter(t => typeSet.has(t));
        if (visibleTags.length === 0) return null;
        return (
          <div key={group.label}>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 3, fontWeight: 600 }}>
              {group.label}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {visibleTags.map(t => (
                <Chip key={t} label={t} active={active.includes(t)} onClick={() => onToggle(t)} color="#2e7d32" />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Chip({ label, active, onClick, color = '#4f8ef7' }: {
  label: string; active: boolean; onClick: () => void; color?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11, padding: '2px 8px', borderRadius: 10, cursor: 'pointer',
        border: `1px solid ${active ? color : '#ddd'}`,
        background: active ? color + '22' : '#fff',
        color: active ? color : '#666',
        fontWeight: active ? 600 : 400,
        transition: 'all 0.1s',
      }}
    >
      {label}
    </button>
  );
}
