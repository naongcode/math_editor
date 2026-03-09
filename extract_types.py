"""
해설 PDF에서 [출제의도] 텍스트를 추출해 problems.json의 type/typeTags 필드에 저장.

사용법:
    py extract_types.py

- asset/{YY}/*해*.pdf 를 순회하며 [출제의도] 패턴 추출
- public/problems.json 의 각 문제에 'type', 'typeTags' 필드를 추가/갱신
- 기존 problems.json의 다른 필드는 건드리지 않음
"""
import fitz
import json
import re
from pathlib import Path

ASSET_DIR  = Path("asset")
META_FILE  = Path("public/problems.json")

# 두 가지 형식 지원:
#   [출제의도] 텍스트.       (대괄호, 마침표 마무리)
#   출제의도 : 텍스트?       (콜론, 물음표 마무리, 줄바꿈 포함)
TYPE_RE = re.compile(r'(\d+)\.\s*(?:\[출제의도\]|출제의도\s*:)\s*(.+?[。.?？])', re.DOTALL)

# "X의 Y"에서 Y가 세부 양상인 경우 → 주 개념(X)과 양상(Y)으로 분리
ASPECT_RE = re.compile(
    r'의\s*(합과\s*일반항|합|일반항|관계|성질|범위|조건|개수|크기|차이|주기|나머지|넓이'
    r'|최솟값|최댓값|극값|공비|공차|첫째항|특정한\s*항|항의\s*값|정의|값)'
)
# 단독으로는 의미 없는 세부 양상 (제외)
SKIP_ASPECT = {'값', '정의'}

# ── 태그 단순화 ──────────────────────────────────────────
# "같은 것이 있는 순열" 같은 수식어 구 제거
NOISY_PREFIX_RE = re.compile(
    r'^(?:같은\s*것이\s*있는|각각\s*다른|서로\s*다른|다음\s*조건을\s*만족시키는)\s*'
)
# "의 수" 처럼 뒤에 붙는 일반적 접미 제거
STRIP_OF_NUM_RE = re.compile(r'\s*의\s*수$')
# "의 Y"에서 Y가 일반적인 경우 → X가 핵심 ("관계"도 포함: "삼각함수 사이의 관계" → "삼각함수")
GENERIC_TAIL = {'그래프', '개형', '뜻', '표현', '계산', '적용', '관계', '관계식'}
# "X와/과 Y" 복합 개념 분리
COMPOUND_SPLIT_RE = re.compile(r'^(.{2,})\s*[와과,]\s*(.{2,})$')
# 을/를 탐색 전에 제거할 수식어 절
PRE_CLEAN_RE = re.compile(r'(?:주어진|다음)\s*조건을\s*(?:만족시키\s*는|이용하여)\s*')
# 특정 표현 → 핵심 개념 매핑
NORMALIZE_MAP = {
    '탄젠트함수': '삼각함수',
    '사인함수': '삼각함수',
    '코사인함수': '삼각함수',
}


def simplify_tag(phrase: str) -> str:
    """수식어 제거, 핵심 개념 추출: '같은 것이 있는 순열의 수' → '순열'"""
    phrase = NOISY_PREFIX_RE.sub('', phrase).strip()

    # "이해하기" 이후 내용 제거: "중복조합 이해하기 빨간색 볼펜..." → "중복조합"
    phrase = re.sub(r'\s+이해하기.*$', '', phrase).strip()

    # "X에서 Y" → Y: "다항식에서 이항정리" → "이항정리", "닫힌구간에서 탄젠트함수" → "탄젠트함수"
    phrase = re.sub(r'^.+에서\s+', '', phrase).strip()

    # "으로/로 나타낸/정의된/나타내어진..." 제거: "정적분으로 나타내어진..." → "정적분"
    phrase = re.sub(r'\s*(?:으로|로)\s*(?:정의된|나타내어진|나타낸|표현된).*$', '', phrase).strip()

    phrase = STRIP_OF_NUM_RE.sub('', phrase).strip()
    phrase = re.sub(r'\s*사이$', '', phrase).strip()
    # "에 미지수" 후행 제거: "지수에 미지수" → "지수"
    phrase = re.sub(r'\s*에\s*미지수.*$', '', phrase).strip()

    # "둘러싸인" 포함 → 넓이
    if '둘러싸인' in phrase:
        return '넓이'

    # "X가 Y일 조건" → Y: "함수가 연속일 조건" → "연속"
    m2 = re.match(r'^.+가\s+(.+?)일\s+조건$', phrase)
    if m2:
        return m2.group(1).strip()

    # "X가 Y이 되도록..." → Y: "함수가 연속이 되도록 하는 모든 상수" → "연속"
    m3 = re.match(r'^.+가\s+(.+?)이\s+되도록', phrase)
    if m3:
        return m3.group(1).strip()

    # "X의 Y" 처리 — 조사 '의'는 뒤에 반드시 공백이 따라옴
    m = re.fullmatch(r'(.+?)\s*의\s(.+)', phrase)
    if m:
        x, y = m.group(1).strip(), m.group(2).strip()
        if y in GENERIC_TAIL:
            return re.sub(r'\s*사이$', '', x).strip()
        if len(x) == 1:
            return phrase               # "곱의 미분법" → 그대로
        if len(x) <= 2 and 3 <= len(y) <= 8:
            return y                    # "수열의 귀납적 정의" → "귀납적 정의"
        return x                        # "등차수열의 합과..." → "등차수열"

    return NORMALIZE_MAP.get(phrase, phrase)


def is_solution_file(filename: str) -> bool:
    return '해설' in filename or filename.endswith('해.pdf')


def get_base_name(filename: str) -> str:
    name = filename.replace('.pdf', '')
    for suffix in ['해설', ' 해설', '해']:
        if name.endswith(suffix):
            return name[:-len(suffix)].strip()
    return name


def get_exam_year_month(folder: str, filename: str):
    year = int(folder) + 2000
    name = get_base_name(filename)
    month_map = {'3': 3, '3월': 3, '4': 4, '4월': 4, '5': 5, '5월': 5,
                 '6': 6, '6월': 6, '7': 7, '7월': 7, '9': 9, '9월': 9,
                 '10': 10, '10월': 10}
    for key, val in month_map.items():
        if name == key or name.endswith(f' {key}') or name.startswith(key):
            return year, val
    if '수능' in name:
        return year, 11
    return year, 0


def extract_keywords(type_text: str) -> list[str]:
    """출제의도 문장에서 핵심 키워드 추출.
    을/를 앞의 명사구를 핵심 개념으로 간주하고 단순화.
    예) '중복순열의 수를 구한다' → ['중복순열']
    예) '사인법칙과 코사인법칙을 이용한다' → ['사인법칙', '코사인법칙']
    """
    # PUA 문자(PDF 수식 기호) 제거 후 정리
    text = re.sub(r'[\ue000-\uf8ff]', '', type_text)
    text = re.sub(r'\s+', ' ', text).strip()

    # "주어진 조건을 만족시키는 X" → "X" 로 전처리
    text = PRE_CLEAN_RE.sub('', text).strip()

    # 첫 번째 을/를 앞 = 핵심 개념 구문
    m = re.search(r'\s*[을를](?=\s|$)', text)
    if m:
        phrase = text[:m.start()].strip()
    else:
        # 을/를 없으면 전체에서 이해하기/하기 이전까지
        phrase = re.sub(r'\s+\S+하기.*$', '', text).strip()
        phrase = re.sub(r'[은는이가]\s*$', '', phrase).strip()
        if len(phrase) < 2:
            phrase = text[:20].strip()

    tag = simplify_tag(phrase)
    if not tag or len(tag) < 2 or tag.startswith('의'):
        return []

    # "X와/과 Y" 복합 개념 분리
    cm = COMPOUND_SPLIT_RE.match(tag)
    if cm and '의' not in cm.group(1) and '의' not in cm.group(2):
        return [cm.group(1).strip(), cm.group(2).strip()]

    # 너무 긴 명사구(관형절 수식 등) → 마지막 핵심 명사만 추출
    # 예) "확률분포가 표로 주어진 확률변수" → "확률변수"
    if len(tag) > 10:
        last = tag.rsplit(' ', 1)[-1]
        if len(last) >= 2:
            return [last]

    return [tag]


def extract_types_from_solution(sol_path: Path) -> dict:
    """해설 PDF 전체에서 {num: '유형 설명'} 추출"""
    doc = fitz.open(str(sol_path))
    full_text = ''.join(doc[pi].get_text() for pi in range(len(doc)))
    types = {}
    for m in TYPE_RE.finditer(full_text):
        num = int(m.group(1))
        if num not in types:
            type_text = re.sub(r'\s+', ' ', m.group(2)).strip()
            types[num] = type_text
    return types


def main():
    if not META_FILE.exists():
        print(f"[ERROR] {META_FILE} 없음. 먼저 extract_problems.py를 실행하세요.")
        return

    with open(META_FILE, encoding='utf-8') as f:
        all_meta = json.load(f)

    # (year, month, num[, subject]) → meta 인덱스 맵
    meta_index: dict[tuple, int] = {}
    for i, m in enumerate(all_meta):
        key = (m['year'], m['month'], m['num'], m.get('subject', ''))
        meta_index[key] = i

    updated_total = 0

    for year_dir in sorted(ASSET_DIR.iterdir()):
        if not year_dir.is_dir():
            continue
        folder = year_dir.name

        for sol_pdf in sorted(year_dir.glob('*.pdf')):
            if not is_solution_file(sol_pdf.name):
                continue

            year, month = get_exam_year_month(folder, sol_pdf.name)
            if month == 0:
                print(f"  [SKIP] 월 감지 실패: {sol_pdf.name}")
                continue

            print(f"처리: {sol_pdf.name}  ({year}년 {month}월)", end='  ')

            try:
                types = extract_types_from_solution(sol_pdf)
            except Exception as e:
                print(f"\n  [ERROR] {e}")
                continue

            print(f"{len(types)}개 추출")

            for num, type_text in types.items():
                tags = extract_keywords(type_text)
                # 수능 선택과목(23-30)은 과목 suffix 없는 key도 시도
                for subject_key in ['', '확통', '미적', '기하']:
                    key = (year, month, num, subject_key)
                    if key in meta_index:
                        idx = meta_index[key]
                        all_meta[idx]['type'] = type_text
                        all_meta[idx]['typeTags'] = tags
                        updated_total += 1

    with open(META_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_meta, f, ensure_ascii=False, indent=2)

    print(f"\n완료! {updated_total}개 문제 type/typeTags 필드 업데이트 → {META_FILE}")


if __name__ == '__main__':
    main()
