# math_editor — 프로젝트 컨텍스트

## 개요
수학 모의고사 문제 이미지를 관리하고, 문제집을 구성해 인쇄하는 웹 앱.
React 19 + TypeScript + Vite (SPA). 백엔드 없음, 데이터는 localStorage에 저장.

---

## 실행 방법
```bash
npm run dev      # 개발 서버 (Vite)
npm run build    # 프로덕션 빌드 → dist/
```

---

## 디렉토리 구조
```
math_editor/
├── src/
│   ├── App.tsx              # 루트 컴포넌트 (페이지 라우팅, 전역 상태)
│   ├── types.ts             # Problem, ProblemSet, Student, SortKey 타입 정의
│   ├── store.ts             # localStorage 읽기/쓰기, 유틸 함수
│   ├── pages/
│   │   └── HomePage.tsx     # 홈 화면 (학생 관리 + 문제집 목록)
│   └── components/
│       ├── FilterPanel.tsx  # 좌측 필터 패널 (연도/시험/번호/개념/유형)
│       ├── ProblemCard.tsx  # 문제 카드 (이미지, 태그 편집, 해설 토글, 확대보기)
│       ├── SetPanel.tsx     # 우측 문제 세트 패널 (순서변경, 인쇄 미리보기)
│       ├── PrintPreview.tsx # 인쇄 미리보기 (A4, 1열/2열, 자동 페이지 분배)
│       ├── TagEditor.tsx    # 태그 입력 컴포넌트 (자동완성 드롭다운)
│       └── PrintView.tsx    # (존재하나 현재 미사용)
├── public/
│   ├── problems.json        # 문제 메타데이터 (extract_problems.py로 생성)
│   └── problems/            # 문제 이미지 PNG (연도별 폴더)
├── asset/                   # 원본 PDF 보관 폴더 (연도별 서브폴더)
│   └── {YY}/                # 예: 24/ → 2024년도
│       ├── {월}.pdf         # 시험지
│       └── {월}해설.pdf     # 해설 (선택)
├── extract_problems.py      # PDF → PNG 이미지 추출 + problems.json 생성 스크립트
├── server.py                # (보조) 간단한 HTTP 서버 (data.json R/W, 포트 8000)
└── start.bat                # 실행 배치 파일
```

---

## 핵심 데이터 타입 (types.ts)

```ts
interface Problem {
  id: string;          // "{year}_{month:02d}_{num:02d}"
  year: number;
  month: number;       // 3~11 (11=수능)
  num: number;         // 문제 번호
  examName: string;    // PDF 파일 베이스명
  image: string;       // "problems/{YY}/{name}_{num:02d}.png"
  solutionImage: string | null;
  tags: string[];      // 사용자 태그 (localStorage에 저장)
  concepts: string[];  // 개념 태그 (현재 저장 시 비워짐 — 버그 참고)
  memo: string;
}

interface ProblemSet {
  id: string;
  name: string;
  createdAt: string;
  studentIds: string[];
  problemIds: string[];
  includeSolution: boolean;
}

interface Student { id: string; name: string; }
```

---

## localStorage 키
| 키 | 내용 |
|---|---|
| `math_editor_annotations` | 문제별 태그/메모 오버레이 `Record<id, {tags, concepts, memo}>` |
| `math_editor_students` | `Student[]` |
| `math_editor_sets` | `ProblemSet[]` |

---

## 페이지 흐름
```
HomePage (page.type === 'home')
  → 새 문제집 만들기 / 열기 → App editor (page.type === 'editor')
    → 필터/검색 → ProblemCard 체크 → SetPanel에 누적
    → 미리보기 → PrintPreview (A4 자동 레이아웃)
```

---

## PDF 처리 파이프라인 (Python)
`extract_problems.py` 실행 순서:
1. `asset/{YY}/*.pdf` 탐색 → 시험지/해설 쌍 매칭
2. pymupdf(fitz)로 텍스트 레이어에서 문제 번호 위치 감지
3. 2컬럼 레이아웃 자동 처리 + 수직 구분선 감지
4. 문제별 영역을 PNG로 렌더링 → `public/problems/{YY}/`
5. `public/problems.json` 메타데이터 생성

```bash
py extract_problems.py
```
의존성: `pymupdf`, `Pillow` (`pip install pymupdf Pillow`)

> **주의**: Windows에서 `python` 명령이 작동하지 않을 수 있음. `py` 런처 사용.

---

## 알려진 이슈 / 주의사항

- **concepts 저장 버그**: `ProblemCard.tsx:save()`에서 `saveAnnotation`에 `concepts: []`를 하드코딩해서 개념 태그가 항상 초기화됨. 현재 태그(tags)만 실제로 저장됨.
- **PrintView.tsx** 미사용: 컴포넌트 파일이 존재하지만 어디서도 import되지 않음.
- **server.py**: `data.json` 기반 간이 서버, 현재 앱은 이를 사용하지 않고 localStorage만 사용. 추후 서버 동기화 기능 추가 시 활용 가능성 있음.
- **PrintPreview 측정 타이밍**: 이미지 로드 전 측정되면 페이지 분배가 잘못될 수 있음. 현재 300ms setTimeout으로 대응 중.

---

## 개발 규칙
- 스타일: inline style 사용 (CSS 모듈/Tailwind 없음)
- 상태 관리: useState + useMemo (외부 라이브러리 없음)
- 저장: localStorage 직접 R/W (store.ts의 함수 통해서만)
