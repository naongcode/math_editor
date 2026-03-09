"""
수학 모의고사 PDF에서 문제별 이미지 자동 추출
- 텍스트 레이어로 문제 번호 위치 감지
- 2컬럼 레이아웃 자동 처리 (페이지 크기 비례)
- 시험지 / 해설 쌍 매칭
- 해설이 여러 열/페이지에 걸치는 경우 이어붙임
"""
import fitz  # pymupdf
import json
import re
import os
import io
from pathlib import Path

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("[WARN] Pillow 미설치 → 다중 세그먼트 이미지 이어붙임 불가. pip install Pillow")

ASSET_DIR = Path("asset")
OUTPUT_DIR = Path("public/problems")
META_FILE = Path("public/problems.json")
RENDER_SCALE = 2.0
PROBLEM_RE = re.compile(r'^(\d+)\.')

# 문제 하단 페이지번호 크롭 (pt 단위, PDF 좌표계 기준)
# 페이지 끝까지 이어지는 문제에만 적용됨
CROP_BOTTOM_EXAM = 70   # 시험지
CROP_BOTTOM_SOL  = 30   # 해설 (페이지번호가 작거나 여백이 좁음)

def get_col_splits(page_w, n_cols):
    """n열 기준 컬럼 경계 x좌표 리스트 (n_cols-1개)"""
    return [page_w * (i + 1) / n_cols for i in range(n_cols - 1)]

def get_col_idx(x, splits):
    """x좌표 → 컬럼 인덱스"""
    for i, s in enumerate(splits):
        if x < s:
            return i
    return len(splits)

def get_margin(page_w, page_h):
    """페이지 크기 비례 여백"""
    return {
        'left': page_w * 0.07,
        'right': page_w * 0.04,
        'top': page_h * 0.05,
        'bottom': page_h * 0.05,
        'prob_top': 12,   # 문제 번호 위 여백 (px)
        'prob_gap': 5,    # 다음 문제까지 여백
    }

def get_col_x_range(page, col, n_cols, mg):
    """페이지의 특정 컬럼 x 범위(x0, x1) 반환"""
    page_w = page.rect.width
    GAP = mg['prob_gap']
    dividers = find_col_dividers(page)
    if len(dividers) >= n_cols - 1:
        d = dividers[:n_cols - 1]
        boundaries = [0] + d + [page_w]
    else:
        boundaries = [page_w * i / n_cols for i in range(n_cols + 1)]
    if col == 0:
        return mg['left'], boundaries[1] - GAP
    elif col == n_cols - 1:
        return boundaries[-2] + GAP, page_w - mg['right']
    else:
        return boundaries[col] + GAP, boundaries[col + 1] - GAP

def find_col_content_start(page, col, n_cols, mg):
    """해당 컬럼에서 헤더를 건너뛴 실제 내용 시작 y (이어붙이기 중간/끝 세그먼트용)"""
    pg_h = page.rect.height
    x0_col, x1_col = get_col_x_range(page, col, n_cols, mg)
    # 상단 15% 를 헤더 영역으로 간주 → 그 아래 첫 텍스트 블록 y0 반환
    skip_y = pg_h * 0.15
    candidates = []
    for b in page.get_text('blocks'):
        bx0, by0, bx1, by1, text = b[0], b[1], b[2], b[3], b[4]
        if not text.strip():
            continue
        # 컬럼 x 범위와 겹치는지 (여유 10pt)
        if bx1 < x0_col - 10 or bx0 > x1_col + 10:
            continue
        if by0 >= skip_y:
            candidates.append(by0)
    return min(candidates) if candidates else mg['top']

def find_col_content_end(page, col, n_cols, mg, from_y=0, crop_bottom=0):
    """해당 컬럼에서 from_y 이후의 마지막 텍스트/이미지 블록 y1 반환 (하단 여백 제거용)
    footer 영역(하단 마진 + crop_bottom)은 무시함."""
    pg_h = page.rect.height
    # footer 경계: 여기보다 아래는 페이지번호 등 footer로 간주
    footer_y = pg_h - mg['bottom'] - crop_bottom
    x0_col, x1_col = get_col_x_range(page, col, n_cols, mg)
    max_y1 = from_y
    for b in page.get_text('blocks'):
        bx0, by0, bx1, by1 = b[0], b[1], b[2], b[3]
        if bx1 < x0_col - 10 or bx0 > x1_col + 10:
            continue
        if by0 < from_y or by0 >= footer_y:   # footer 영역 제외
            continue
        clamped_y1 = min(by1, footer_y)
        if clamped_y1 > max_y1:
            max_y1 = clamped_y1
    # 이미지 블록도 확인
    for img in page.get_images(full=True):
        for rect in page.get_image_rects(img[0]):
            if rect.x1 < x0_col - 10 or rect.x0 > x1_col + 10:
                continue
            if rect.y0 < from_y or rect.y0 >= footer_y:
                continue
            clamped_y1 = min(rect.y1, footer_y)
            if clamped_y1 > max_y1:
                max_y1 = clamped_y1
    # 내용이 없으면 footer_y 반환 (전체 크롭)
    if max_y1 <= from_y:
        return footer_y
    return max_y1 + mg['prob_gap']

def col_has_content(page, col, n_cols, mg):
    """헤더 영역 제외, 해당 컬럼에 실질적인 텍스트 내용이 있는지 확인"""
    pg_h = page.rect.height
    x0_col, x1_col = get_col_x_range(page, col, n_cols, mg)
    skip_y = pg_h * 0.15
    for b in page.get_text('blocks'):
        bx0, by0, bx1, by1, text = b[0], b[1], b[2], b[3], b[4]
        if not text.strip():
            continue
        if bx1 < x0_col - 10 or bx0 > x1_col + 10:
            continue
        if by0 >= skip_y:
            return True
    return False

def get_exam_info(folder: str, filename: str):
    """폴더명/파일명에서 연도, 월 추출"""
    year = int(folder) + 2000
    name = filename.replace('.pdf', '')
    for suffix in ['해설', ' 해설', '해']:
        if name.endswith(suffix):
            name = name[:-len(suffix)].strip()

    month_map = {'3': 3, '3월': 3, '4': 4, '4월': 4, '5': 5, '5월': 5,
                 '6': 6, '6월': 6, '7': 7, '7월': 7, '9': 9, '9월': 9,
                 '10': 10, '10월': 10}
    for key, val in month_map.items():
        if name == key or name.endswith(f' {key}') or name.startswith(key):
            return year, val
    if '수능' in name:
        return year, 11
    return year, 0

def find_col_dividers(page):
    """페이지의 수직 구분선 x좌표 감지 (get_drawings 사용)
    쌍으로 그려진 선(~20pt 이내)은 중앙값 하나로 병합"""
    page_h = page.rect.height
    raw = []
    for item in page.get_drawings():
        r = item.get('rect')
        if r and r.width < 6 and r.height > page_h * 0.3:
            raw.append(round(r.x0 + r.width / 2))
    raw = sorted(set(raw))
    # 20pt 이내 인접 선 병합
    merged = []
    i = 0
    while i < len(raw):
        group = [raw[i]]
        while i + 1 < len(raw) and raw[i + 1] - raw[i] <= 20:
            i += 1
            group.append(raw[i])
        merged.append(round(sum(group) / len(group)))
        i += 1
    return merged

def detect_n_cols(anchors, max_cols=4):
    """앵커 x좌표 클러스터링으로 컬럼 수 자동 감지"""
    if not anchors:
        return 2
    xs = sorted(set(round(a['x'] / 10) * 10 for a in anchors))
    if len(xs) <= 1:
        return 1
    gaps = [xs[i+1] - xs[i] for i in range(len(xs) - 1)]
    median_gap = sorted(gaps)[len(gaps) // 2]
    threshold = max(median_gap * 2.5, 30)
    n_cols = sum(1 for g in gaps if g > threshold) + 1
    return min(max(n_cols, 1), max_cols)

def auto_col_splits(anchors, page_w, n_cols):
    """앵커 x좌표의 클러스터 간격으로 컬럼 경계 자동 감지"""
    if not anchors:
        return get_col_splits(page_w, n_cols)
    xs = sorted(set(round(a['x'] / 5) * 5 for a in anchors))
    if len(xs) < n_cols:
        return get_col_splits(page_w, n_cols)
    gaps = [(xs[i+1] - xs[i], (xs[i] + xs[i+1]) / 2) for i in range(len(xs) - 1)]
    gaps.sort(reverse=True)
    return sorted(mid for _, mid in gaps[:n_cols - 1])

def detect_n_cols_from_dividers(doc, max_pages=5):
    """첫 몇 페이지의 수직 구분선 수로 열 수 감지"""
    counts = []
    for pi in range(min(max_pages, len(doc))):
        d = find_col_dividers(doc[pi])
        if d:
            counts.append(len(d) + 1)
    if not counts:
        return None
    return max(set(counts), key=counts.count)  # 최빈값

def fill_missing_anchors(doc, anchors, n_cols):
    """앞뒤 앵커 사이 빠진 번호를 추론해 합성 앵커로 삽입"""
    if not anchors:
        return anchors
    seen_nums = set(a['num'] for a in anchors)
    num_min = min(seen_nums)
    num_max = max(seen_nums)
    missing = [n for n in range(num_min, num_max + 1) if n not in seen_nums]
    if not missing:
        return anchors

    # num → 대표 앵커 (build_problem_regions과 동일한 우선순위: 밀도 낮은 페이지 우선)
    seen_pages: dict[int, set] = {}
    for a in anchors:
        seen_pages.setdefault(a['page'], set()).add(a['num'])
    page_density = {pi: len(s) for pi, s in seen_pages.items()}
    rep: dict[int, dict] = {}
    for a in anchors:
        n = a['num']
        if n not in rep:
            rep[n] = a
        else:
            if page_density.get(a['page'], 999) < page_density.get(rep[n]['page'], 999):
                rep[n] = a

    new_anchors = []
    for n in missing:
        prev_list = [rep[k] for k in rep if k < n]
        next_list = [rep[k] for k in rep if k > n]
        if not prev_list or not next_list:
            continue
        prev_a = max(prev_list, key=lambda a: (a['num'], a['page'] * n_cols + a['col']))
        next_a = min(next_list, key=lambda a: (a['num'], a['page'] * n_cols + a['col']))

        prev_pos = prev_a['page'] * n_cols + prev_a['col']
        next_pos = next_a['page'] * n_cols + next_a['col']

        # prev와 next 사이 컬럼 중 내용이 있는 첫 위치에 합성 앵커 배치
        synthetic = None
        for pos in range(prev_pos + 1, next_pos):
            p = pos // n_cols
            c = pos % n_cols
            if p >= len(doc):
                break
            pg = doc[p]
            pg_mg = get_margin(pg.rect.width, pg.rect.height)
            if col_has_content(pg, c, n_cols, pg_mg):
                y_start = find_col_content_start(pg, c, n_cols, pg_mg)
                x0_col, _ = get_col_x_range(pg, c, n_cols, pg_mg)
                synthetic = {
                    'num': n, 'page': p, 'y': y_start, 'x': x0_col,
                    'col': c, 'n_cols': n_cols, 'internal': True, 'synthetic': True,
                }
                break

        if synthetic is None and next_pos > prev_pos + 1:
            # 내용 감지 실패 → next 바로 이전 컬럼에 배치
            pos = next_pos - 1
            p = pos // n_cols
            c = pos % n_cols
            if p < len(doc):
                pg = doc[p]
                pg_mg = get_margin(pg.rect.width, pg.rect.height)
                x0_col, _ = get_col_x_range(pg, c, n_cols, pg_mg)
                synthetic = {
                    'num': n, 'page': p, 'y': pg_mg['top'], 'x': x0_col,
                    'col': c, 'n_cols': n_cols, 'internal': True, 'synthetic': True,
                }

        if synthetic:
            new_anchors.append(synthetic)
            print(f"    [합성앵커] {n}번 → page={synthetic['page']} col={synthetic['col']} y={synthetic['y']:.0f}")

    return anchors + new_anchors


def find_problem_anchors(doc, n_cols=None, min_cols=1):
    """모든 페이지에서 문제 번호 위치 수집 (n_cols=None이면 자동 감지)"""
    raw = []
    for pi in range(len(doc)):
        page = doc[pi]
        blocks = page.get_text('blocks')
        for b in blocks:
            x0, y0, text = b[0], b[1], b[4]
            lines = [l.strip() for l in text.strip().split('\n') if l.strip()]
            if not lines:
                continue
            # 줄별로 탐색: 수능 해설처럼 "풀이\n1. \n..." 형식에서도 번호 감지
            # is_internal: 첫 줄이 아닌 곳에서 매치 → 빠른정답보다 실제 해설 번호일 가능성 높음
            for line_idx, line in enumerate(lines):
                m = PROBLEM_RE.match(line)
                if m:
                    raw.append({
                        'num': int(m.group(1)),
                        'page': pi, 'y': y0, 'x': x0,
                        'internal': line_idx > 0,
                    })
                    break

    # 같은 (page, num) 쌍에서 internal=True 우선 (빠른정답 첫줄 매치 제거)
    by_page_num: dict = {}
    for a in raw:
        key = (a['page'], a['num'])
        if key not in by_page_num or (a['internal'] and not by_page_num[key]['internal']):
            by_page_num[key] = a
    raw = list(by_page_num.values())

    # 빠른정답 페이지 제거
    # 1) "빠른정답" 텍스트가 있는 페이지
    # 2) 같은 페이지에 같은 번호가 3회 이상 → 수능 선택과목 빠른정답 페이지
    from collections import Counter
    quick_ans_pages: set[int] = set()
    for pi in range(len(doc)):
        page_text = doc[pi].get_text()
        if '빠른정답' in page_text or '빠른 정답' in page_text:
            quick_ans_pages.add(pi)
    by_page_for_dup: dict[int, list] = {}
    for a in raw:
        by_page_for_dup.setdefault(a['page'], []).append(a['num'])
    for pi, nums_list in by_page_for_dup.items():
        if any(c >= 3 for c in Counter(nums_list).values()):
            quick_ans_pages.add(pi)
    raw = [a for a in raw if a['page'] not in quick_ans_pages]

    # 빠른정답 앵커 추가 제거: 컬럼 내에서 y 간격이 좁고 번호가 3 이상 건너뜀
    # (빠른정답 페이지 제거 후에도 남아있는 오탐 방지)
    page_w0 = doc[0].rect.width
    keep_indices = set(range(len(raw)))
    by_page: dict[int, list] = {}
    for i, a in enumerate(raw):
        by_page.setdefault(a['page'], []).append((i, a))
    for pi, idx_items in by_page.items():
        # x 좌표 기준으로 컬럼 분리 후 각 컬럼 내에서 y 그룹 분석
        left_items  = [(i, a) for i, a in idx_items if a['x'] < page_w0 * 0.5]
        right_items = [(i, a) for i, a in idx_items if a['x'] >= page_w0 * 0.5]
        for col_items in (left_items, right_items):
            if not col_items:
                continue
            by_y = sorted(col_items, key=lambda t: t[1]['y'])
            groups: list[list] = []
            cur: list = [by_y[0]]
            for t in by_y[1:]:
                if t[1]['y'] - cur[-1][1]['y'] < 30:
                    cur.append(t)
                else:
                    groups.append(cur); cur = [t]
            groups.append(cur)
            for group in groups:
                if len(group) < 3:
                    continue
                nums = [t[1]['num'] for t in group]
                num_diffs = [nums[j+1] - nums[j] for j in range(len(nums)-1)]
                if max(num_diffs) >= 3:  # 번호가 3 이상 건너뜀 → 빠른정답 열
                    for idx, _ in group:
                        keep_indices.discard(idx)
    raw = [raw[i] for i in sorted(keep_indices)]

    # 탐지된 문제 수가 너무 적으면 페이지 하단 단독 숫자를 폴백으로 사용
    # (22 수능 해설처럼 한 페이지 = 한 문제 형식)
    if len(set(a['num'] for a in raw)) < 15:
        footer_raw = []
        FOOTER_RE = re.compile(r'^\d+$')
        for pi in range(len(doc)):
            page = doc[pi]
            page_h = page.rect.height
            for b in page.get_text('blocks'):
                x0, y0, text = b[0], b[1], b[4]
                text = text.strip()
                if y0 > page_h * 0.85 and FOOTER_RE.match(text):
                    num = int(text)
                    if 1 <= num <= 50:
                        footer_raw.append({'num': num, 'page': pi, 'y': page_h * 0.05, 'x': x0})
        if len(set(a['num'] for a in footer_raw)) >= 15:
            raw = footer_raw
            min_cols = 1  # 한 페이지 한 문제 → 전체 너비 사용

    page_w = doc[0].rect.width
    if n_cols is None:
        # 구분선으로 먼저 감지, 없으면 앵커 클러스터링
        n_cols = detect_n_cols_from_dividers(doc) or detect_n_cols(raw)
    n_cols = max(n_cols, min_cols)
    splits = auto_col_splits(raw, page_w, n_cols)

    anchors = []
    for a in raw:
        anchors.append({**a, 'col': get_col_idx(a['x'], splits), 'n_cols': n_cols})

    # 앞뒤 앵커로 빠진 번호 추론하여 합성 앵커 삽입
    anchors = fill_missing_anchors(doc, anchors, n_cols)

    return anchors, n_cols

def build_problem_regions(doc, anchors, n_cols=2, crop_bottom=CROP_BOTTOM_EXAM):
    """문제 번호 앵커로부터 각 문제의 렌더링 영역 계산 (다중 열/페이지 세그먼트 지원)"""
    # 같은 번호가 여러 페이지에 나타나면, 페이지당 고유 문제 수가 적은 쪽 우선
    seen_nums: dict[int, set] = {}
    for a in anchors:
        seen_nums.setdefault(a['page'], set()).add(a['num'])
    page_unique_count = {pi: len(nums) for pi, nums in seen_nums.items()}

    seen = {}
    for a in anchors:
        num = a['num']
        if num not in seen:
            seen[num] = a
        else:
            cur_density = page_unique_count.get(seen[num]['page'], 999)
            new_density = page_unique_count.get(a['page'], 999)
            if new_density < cur_density:
                seen[num] = a

    # 번호별 전체 앵커 목록 (다음 앵커 근접 탐색용)
    all_by_num: dict[int, list] = {}
    for a in anchors:
        all_by_num.setdefault(a['num'], []).append(a)

    # 앵커가 존재하는 (page, col) 집합 (중간 컬럼 오염 감지용)
    anchored_col_positions = set((a['page'], a['col']) for a in anchors)

    result = {}
    nums = sorted(seen.keys())

    for i, num in enumerate(nums):
        curr = seen[num]

        # 다음 문제의 앵커: seen[next_num] 대신, curr 이후에서 가장 가까운 next_num 앵커 사용
        # → 확통/미적/기하처럼 같은 번호가 여러 과목에 있을 때 올바른 과목의 앵커를 선택
        next_a = None
        if i + 1 < len(nums):
            next_num = nums[i + 1]
            curr_pos = curr['page'] * n_cols + curr['col']
            candidates = all_by_num.get(next_num, [])
            after = [
                c for c in candidates
                if (c['page'] * n_cols + c['col']) > curr_pos
                or (c['page'] == curr['page'] and c['col'] == curr['col'] and c['y'] > curr['y'])
            ]
            if after:
                next_a = min(after, key=lambda c: (c['page'] * n_cols + c['col'], c['y']))

        page = doc[curr['page']]
        page_w = page.rect.width
        page_h = page.rect.height
        mg = get_margin(page_w, page_h)
        col = curr['col']

        start_y0 = max(0, curr['y'] - mg['prob_top'])
        segments = []

        if next_a is None:
            # 마지막 문제 → 현재 컬럼부터 문서 끝까지 이어붙임 (내용 있는 컬럼만)
            MAX_SPAN = 4
            curr_pos = curr['page'] * n_cols + col
            last_pos = (len(doc) - 1) * n_cols + (n_cols - 1)
            for pos in range(curr_pos, min(last_pos, curr_pos + MAX_SPAN) + 1):
                p = pos // n_cols
                c = pos % n_cols
                if p >= len(doc):
                    break
                pg = doc[p]
                pg_h = pg.rect.height
                pg_w = pg.rect.width
                pg_mg = get_margin(pg_w, pg_h)
                if pos == curr_pos:
                    seg_y0 = start_y0
                else:
                    if not col_has_content(pg, c, n_cols, pg_mg):
                        break
                    seg_y0 = find_col_content_start(pg, c, n_cols, pg_mg)
                seg_y1 = max(seg_y0 + 10, pg_h - pg_mg['bottom'] - crop_bottom)
                seg_x0, seg_x1 = get_col_x_range(pg, c, n_cols, pg_mg)
                if seg_y1 > seg_y0 and seg_x1 > seg_x0:
                    segments.append((p, [seg_x0, seg_y0, seg_x1, seg_y1]))
            # 마지막 세그먼트의 하단을 실제 콘텐츠 끝으로 트리밍
            if segments:
                lp, lr = segments[-1]
                lg = doc[lp]
                lg_mg = get_margin(lg.rect.width, lg.rect.height)
                lc = (curr_pos + len(segments) - 1) % n_cols
                content_end = find_col_content_end(lg, lc, n_cols, lg_mg, from_y=lr[1], crop_bottom=crop_bottom)
                lr[3] = min(lr[3], content_end)
                segments[-1] = (lp, lr)

        elif next_a['page'] == curr['page'] and next_a['col'] == col:
            # 같은 페이지·같은 컬럼 → 단일 세그먼트
            y1 = next_a['y'] - mg['prob_gap']
            x0, x1 = get_col_x_range(page, col, n_cols, mg)
            segments.append((curr['page'], [x0, start_y0, x1, y1]))

        else:
            # 다음 열 또는 다음 페이지로 넘어가는 경우 → 다중 세그먼트
            curr_pos = curr['page'] * n_cols + col
            end_pos  = next_a['page'] * n_cols + next_a['col']

            # 거리가 너무 크면(≥ 3 컬럼 슬롯 = 약 1.5페이지) 과목 경계 오염으로 판단 → 단일 세그먼트
            MAX_SPAN = 3
            if end_pos <= curr_pos or (end_pos - curr_pos) > MAX_SPAN:
                # 읽기 순서 역전 또는 과도한 거리 → 단일 세그먼트 폴백
                y1 = max(start_y0 + 10, page_h - mg['bottom'] - crop_bottom)
                x0, x1 = get_col_x_range(page, col, n_cols, mg)
                segments.append((curr['page'], [x0, start_y0, x1, y1]))
            else:
                temp_segs = []
                stop_early = False
                for pos in range(curr_pos, end_pos + 1):
                    p = pos // n_cols
                    c = pos % n_cols
                    if p >= len(doc):
                        break

                    # 중간 컬럼에 앵커가 있거나, 앵커가 없더라도 실제 내용이 있으면
                    # 다른 문제가 있을 가능성이 높음 → 이어붙이기 중단
                    if pos != curr_pos and pos != end_pos:
                        pg_tmp = doc[p]
                        pg_mg_tmp = get_margin(pg_tmp.rect.width, pg_tmp.rect.height)
                        if (p, c) in anchored_col_positions or col_has_content(pg_tmp, c, n_cols, pg_mg_tmp):
                            stop_early = True
                            break

                    pg = doc[p]
                    pg_h = pg.rect.height
                    pg_w = pg.rect.width
                    pg_mg = get_margin(pg_w, pg_h)

                    if pos == curr_pos:
                        seg_y0 = start_y0
                        seg_y1 = max(seg_y0 + 10, pg_h - pg_mg['bottom'] - crop_bottom)
                    elif pos == end_pos:
                        seg_y0 = find_col_content_start(pg, c, n_cols, pg_mg)
                        seg_y1 = next_a['y'] - pg_mg['prob_gap']
                    else:
                        seg_y0 = find_col_content_start(pg, c, n_cols, pg_mg)
                        seg_y1 = max(seg_y0 + 10, pg_h - pg_mg['bottom'] - crop_bottom)

                    seg_x0, seg_x1 = get_col_x_range(pg, c, n_cols, pg_mg)
                    if seg_y1 > seg_y0 and seg_x1 > seg_x0:
                        temp_segs.append((p, [seg_x0, seg_y0, seg_x1, seg_y1]))

                if stop_early:
                    # 단일 세그먼트 폴백 (현재 컬럼 페이지 끝까지)
                    y1 = max(start_y0 + 10, page_h - mg['bottom'] - crop_bottom)
                    x0, x1 = get_col_x_range(page, col, n_cols, mg)
                    segments.append((curr['page'], [x0, start_y0, x1, y1]))
                else:
                    segments.extend(temp_segs)

        if not segments:
            continue

        result[num] = {
            'page': segments[0][0],
            'rect': segments[0][1],
            'col': col,
            'segments': segments,
        }

    return result

def render_problem(doc, page_idx, rect, out_path: Path, scale=RENDER_SCALE):
    """문제 영역을 PNG로 렌더링"""
    page = doc[page_idx]
    x0, y0, x1, y1 = rect
    if x1 <= x0 or y1 <= y0:
        return False
    clip = fitz.Rect(x0, y0, x1, y1) & page.rect
    if clip.is_empty or clip.width < 10 or clip.height < 10:
        return False
    mat = fitz.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=mat, clip=clip)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    pix.save(str(out_path))
    return True

def render_problem_multi(doc, segments, out_path: Path, scale=RENDER_SCALE):
    """여러 세그먼트(열/페이지 걸침)를 세로로 이어붙여 PNG 저장"""
    if not segments:
        return False

    # 세그먼트가 1개면 기존 함수 사용
    if len(segments) == 1:
        return render_problem(doc, segments[0][0], segments[0][1], out_path, scale)

    if not HAS_PIL:
        # Pillow 없으면 첫 세그먼트만 저장
        return render_problem(doc, segments[0][0], segments[0][1], out_path, scale)

    images = []
    mat = fitz.Matrix(scale, scale)
    for page_idx, rect in segments:
        page = doc[page_idx]
        x0, y0, x1, y1 = rect
        if x1 <= x0 or y1 <= y0:
            continue
        clip = fitz.Rect(x0, y0, x1, y1) & page.rect
        if clip.is_empty or clip.width < 10 or clip.height < 10:
            continue
        pix = page.get_pixmap(matrix=mat, clip=clip)
        img = Image.open(io.BytesIO(pix.tobytes('png')))
        images.append(img)

    if not images:
        return False

    if len(images) == 1:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        images[0].save(str(out_path))
        return True

    # 세로 이어붙임 (너비는 최대값으로 맞춤)
    total_w = max(img.width for img in images)
    total_h = sum(img.height for img in images)
    combined = Image.new('RGB', (total_w, total_h), (255, 255, 255))
    y_off = 0
    for img in images:
        combined.paste(img, (0, y_off))
        y_off += img.height

    out_path.parent.mkdir(parents=True, exist_ok=True)
    combined.save(str(out_path))
    return True

def _content_x_bounds(img, pad_px=8, white_thresh=245, line_ratio=0.85):
    """PIL 이미지에서 실제 콘텐츠의 좌·우 픽셀 경계 반환.
    전체 높이의 line_ratio 이상이 dark인 열은 수직 구분선으로 간주하고 제외."""
    gray = img.convert('L')
    w, h = img.size
    pixels = gray.load()

    # 각 열의 dark 픽셀 수 계산
    dark_counts = []
    for x in range(w):
        cnt = sum(1 for y in range(h) if pixels[x, y] < white_thresh)
        dark_counts.append(cnt)

    line_thresh = h * line_ratio

    # 콘텐츠 열: dark 픽셀이 있으면서 수직선이 아닌 것
    content_cols = [x for x in range(w)
                    if dark_counts[x] > 0 and dark_counts[x] < line_thresh]

    if not content_cols:
        return 0, w

    left  = max(0, content_cols[0]  - pad_px)
    right = min(w, content_cols[-1] + pad_px + 1)
    return left, right


def render_segments_separate(doc, segments, out_path: Path, scale=RENDER_SCALE) -> list[str]:
    """세그먼트별 개별 PNG 저장 → public/ 기준 상대 경로 리스트 반환.
    멀티 세그먼트는 픽셀 수준 좌우 여백 감지로 공통 x범위를 맞춰 정렬."""
    if not segments:
        return []

    if len(segments) == 1:
        page_idx, rect = segments[0]
        if render_problem(doc, page_idx, rect, out_path, scale):
            return [str(out_path.relative_to(Path('public'))).replace('\\', '/')]
        return []

    if not HAS_PIL:
        paths = []
        for i, (page_idx, rect) in enumerate(segments):
            p = out_path if i == 0 else out_path.parent / f"{out_path.stem}_{i}{out_path.suffix}"
            if render_problem(doc, page_idx, rect, p, scale):
                paths.append(str(p.relative_to(Path('public'))).replace('\\', '/'))
        return paths

    mat = fitz.Matrix(scale, scale)
    images = []
    for page_idx, rect in segments:
        x0, y0, x1, y1 = rect
        if x1 <= x0 or y1 <= y0:
            continue
        pg = doc[page_idx]
        clip = fitz.Rect(x0, y0, x1, y1) & pg.rect
        if clip.is_empty or clip.width < 10 or clip.height < 10:
            continue
        pix = pg.get_pixmap(matrix=mat, clip=clip)
        images.append(Image.open(io.BytesIO(pix.tobytes('png'))))

    if not images:
        return []

    # 각 이미지를 자기 자신의 콘텐츠 경계로 tight crop → content가 모두 x=0에서 시작
    bounds = [_content_x_bounds(img) for img in images]
    tight = [img.crop((left, 0, right, img.height))
             for img, (left, right) in zip(images, bounds)]

    # 너비를 최대값으로 우측 패딩 통일 (스케일 차이 최소화)
    max_w = max(c.width for c in tight)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    paths = []
    for i, img in enumerate(tight):
        if img.width < max_w:
            padded = Image.new('RGB', (max_w, img.height), (255, 255, 255))
            padded.paste(img, (0, 0))
            img = padded
        p = out_path if i == 0 else out_path.parent / f"{out_path.stem}_{i}{out_path.suffix}"
        img.save(str(p))
        paths.append(str(p.relative_to(Path('public'))).replace('\\', '/'))
    return paths


# 수능 선택과목 키워드 (순서 = 표준 출제 순서: 확통 → 미적 → 기하)
SUBJECT_KEYWORDS = [
    ('확통', ['확률과통계']),
    ('미적', ['미적분']),
    ('기하', ['기하']),
]
SUBJECT_NUMS = range(23, 31)  # 수능 선택과목 문제 번호


def detect_subject_start_pages(doc):
    """수능 선택과목 섹션 시작 페이지 감지 (텍스트 기반)
    Returns: [('확통', pi), ('미적', pi), ('기하', pi)]  또는 빈 리스트"""
    result = []
    found = set()
    for pi in range(len(doc)):
        page_text = doc[pi].get_text()
        for short, keywords in SUBJECT_KEYWORDS:
            if short in found:
                continue
            if any(kw in page_text for kw in keywords):
                result.append((short, pi))
                found.add(short)
    return result


def split_subject_anchors(anchors, n_cols, subject_start_pages, hint_subjects=None):
    """23-30번 앵커를 과목별로 분리
    subject_start_pages: detect_subject_start_pages() 결과
    hint_subjects: 단일 과목일 때 사용할 이름 힌트 (예: ['미적'])
    Returns: [('확통', [anchors...]), ('미적', [...]), ('기하', [...])]
    """
    sel = [a for a in anchors if a['num'] in SUBJECT_NUMS]

    if not subject_start_pages:
        # 폴백: num=23의 여러 출현 위치를 섹션 시작 페이지로 사용
        starts = sorted(
            {a['page'] for a in sel if a['num'] == 23}
        )
        default_names = ['확통', '미적', '기하']
        # 1개면 hint_subjects로 이름 지정, 여러 개면 순서대로 default_names
        if len(starts) == 1 and hint_subjects:
            names = hint_subjects
        else:
            names = default_names
        subject_start_pages = [
            (names[i] if i < len(names) else default_names[i], p)
            for i, p in enumerate(starts) if i < 3
        ]
        if subject_start_pages:
            print(f"    [과목감지폴백] num=23 출현 페이지로 추론: {subject_start_pages}")

    if not subject_start_pages:
        return []

    # 섹션 경계 (start_pi ~ next_start_pi - 1)
    sections = []
    for i, (name, start_pi) in enumerate(subject_start_pages):
        end_pi = subject_start_pages[i + 1][1] if i + 1 < len(subject_start_pages) else 9999
        sections.append((name, start_pi, end_pi))

    by_subject: dict[str, list] = {name: [] for name, _, _ in sections}
    unassigned = []
    for a in sel:
        assigned = None
        for name, start_pi, end_pi in sections:
            if start_pi <= a['page'] < end_pi:
                assigned = name
                break
        if assigned:
            by_subject[assigned].append(a)
        else:
            unassigned.append(a)
    # 미배정 앵커는 마지막 섹션에 추가
    if unassigned and sections:
        by_subject[sections[-1][0]].extend(unassigned)

    return [(name, by_subject[name]) for name, _, _ in sections]


def process_pdf(pdf_path: Path, n_cols=None, crop_bottom=CROP_BOTTOM_EXAM, min_cols=1, verbose=False):
    """PDF 열고 문제 영역 딕셔너리 + 앵커 목록 반환"""
    doc = fitz.open(str(pdf_path))
    anchors, detected_cols = find_problem_anchors(doc, n_cols, min_cols=min_cols)
    if verbose:
        seen_v = {}
        for a in anchors:
            if a['num'] not in seen_v:
                seen_v[a['num']] = a
        page_w = doc[0].rect.width
        print(f"    page_w={page_w:.0f}, n_cols={detected_cols}")
        for num in sorted(seen_v):
            a = seen_v[num]
            print(f"    [{num:2d}] col={a['col']} x={a['x']:.0f} y={a['y']:.0f} page={a['page']}")
    regions = build_problem_regions(doc, anchors, detected_cols, crop_bottom)
    return doc, regions, anchors, detected_cols

def is_solution_file(filename: str) -> bool:
    return '해설' in filename or (filename.endswith('해.pdf'))

def get_base_name(filename: str) -> str:
    name = filename.replace('.pdf', '')
    for suffix in ['해설', ' 해설', '해']:
        if name.endswith(suffix):
            return name[:-len(suffix)].strip()
    return name

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    all_meta = []
    skipped_total = 0

    for year_dir in sorted(ASSET_DIR.iterdir()):
        if not year_dir.is_dir():
            continue
        folder = year_dir.name

        # 시험지 / 해설 쌍 구성
        exams = {}
        for pdf in year_dir.glob('*.pdf'):
            fname = pdf.name
            if is_solution_file(fname):
                base = get_base_name(fname)
                exams.setdefault(base, {})['sol'] = pdf
            else:
                base = pdf.stem
                exams.setdefault(base, {})['exam'] = pdf

        for base_name, pair in sorted(exams.items()):
            if 'exam' not in pair:
                print(f"  [SKIP] 시험지 없음: {base_name}")
                continue

            exam_path = pair['exam']
            sol_path = pair.get('sol')
            year, month = get_exam_info(folder, exam_path.name)

            print(f"처리: {exam_path.name}  ({year}년 {month}월)")

            try:
                exam_doc, exam_regions, exam_anchors, exam_ncols = process_pdf(exam_path, n_cols=2)
            except Exception as e:
                print(f"  [ERROR] {e}")
                continue

            sol_doc, sol_regions, sol_anchors, sol_ncols = None, {}, [], 2
            if sol_path:
                try:
                    sol_doc, sol_regions, sol_anchors, sol_ncols = process_pdf(
                        sol_path, crop_bottom=CROP_BOTTOM_SOL, min_cols=2)
                except Exception as e:
                    print(f"  [WARN] 해설 처리 실패: {e}")

            # 수능(month==11): 23-30번을 확통/미적/기하로 분리
            is_suneung = (month == 11)
            if is_suneung:
                common_nums = [n for n in sorted(exam_regions.keys()) if n <= 22]
                print(f"  문제: {sorted(exam_regions.keys())}")
            else:
                common_nums = sorted(exam_regions.keys())

            # ── 공통 문제 (1-22번, 또는 비수능 전체) ──
            for num in common_nums:
                info = exam_regions[num]
                exam_img = OUTPUT_DIR / folder / f"{base_name}_{num:02d}.png"
                ok = render_problem(exam_doc, info['page'], info['rect'], exam_img)
                if not ok:
                    print(f"  [SKIP] {num}번 시험지 렌더링 실패: rect={[round(v) for v in info['rect']]}")
                    skipped_total += 1

                sol_img_paths: list[str] = []
                if sol_doc and num in sol_regions:
                    sol_info = sol_regions[num]
                    sol_img = OUTPUT_DIR / folder / f"{base_name}_{num:02d}_sol.png"
                    sol_segs = sol_info.get('segments', [(sol_info['page'], sol_info['rect'])])
                    sol_img_paths = render_segments_separate(sol_doc, sol_segs, sol_img)

                exam_img_rel = str(exam_img.relative_to(Path('public'))).replace('\\', '/')
                all_meta.append({
                    'id': f"{year}_{month:02d}_{num:02d}",
                    'year': year,
                    'month': month,
                    'num': num,
                    'examName': base_name,
                    'image': exam_img_rel,
                    'solutionImage': sol_img_paths[0] if sol_img_paths else None,
                    'solutionImages': sol_img_paths,
                    'tags': [],
                    'concepts': [],
                    'memo': '',
                })

            if not is_suneung:
                continue  # 비수능은 여기서 끝

            # ── 수능 선택과목 23-30번: 과목별 분리 ──
            common_exam_anchors = [a for a in exam_anchors if a['num'] not in SUBJECT_NUMS]
            common_sol_anchors  = [a for a in sol_anchors  if a['num'] not in SUBJECT_NUMS]

            # 시험지 과목 분리 (보통 1과목만 있음 → 항상 확통으로 기본 처리)
            exam_subj_splits = split_subject_anchors(exam_anchors, exam_ncols, [])
            exam_by_subject  = {name: a_list for name, a_list in exam_subj_splits}

            # 해설 과목 분리 (3과목 기대)
            # 힌트: 시험지에서 감지된 과목명 (해설이 1과목일 때 이름 추론에 사용)
            sol_subj_pages  = detect_subject_start_pages(sol_doc) if sol_doc else []
            sol_subj_splits = split_subject_anchors(sol_anchors, sol_ncols, sol_subj_pages) if sol_doc else []
            sol_by_subject  = {name: a_list for name, a_list in sol_subj_splits}

            # 과목 집합: 해설 기준 (해설이 없으면 시험지 기준)
            subjects = [name for name, _ in sol_subj_splits] or [name for name, _ in exam_subj_splits]
            if not subjects:
                print(f"  [WARN] 수능 선택과목 감지 실패 — 23~30번 생략")
                continue

            print(f"  선택과목: {subjects}")

            # 과목별로 시험지/해설 이미지 생성
            # exam_img_map[subject][num] = Path or None
            # sol_img_map[subject][num]  = list[str] (relative paths, 세그먼트별)
            exam_img_map: dict[str, dict[int, Path]] = {}
            sol_img_map:  dict[str, dict[int, list[str]]]  = {}

            for subject in subjects:
                exam_img_map[subject] = {}
                if subject in exam_by_subject:
                    combined = common_exam_anchors + exam_by_subject[subject]
                    regions = build_problem_regions(exam_doc, combined, exam_ncols, CROP_BOTTOM_EXAM)
                    for num in SUBJECT_NUMS:
                        if num in regions:
                            info = regions[num]
                            p = OUTPUT_DIR / folder / f"{base_name}_{num:02d}_{subject}.png"
                            ok = render_problem(exam_doc, info['page'], info['rect'], p)
                            if ok:
                                exam_img_map[subject][num] = p
                            else:
                                print(f"  [SKIP] {num}번({subject}) 시험지 렌더링 실패")
                                skipped_total += 1

            for subject in subjects:
                sol_img_map[subject] = {}
                if sol_doc and subject in sol_by_subject:
                    combined = common_sol_anchors + sol_by_subject[subject]
                    regions = build_problem_regions(sol_doc, combined, sol_ncols, CROP_BOTTOM_SOL)
                    for num in SUBJECT_NUMS:
                        if num in regions:
                            sol_info = regions[num]
                            p = OUTPUT_DIR / folder / f"{base_name}_{num:02d}_{subject}_sol.png"
                            segs = sol_info.get('segments', [(sol_info['page'], sol_info['rect'])])
                            sol_img_map[subject][num] = render_segments_separate(sol_doc, segs, p)

            # meta 등록 (sol 이미지 있는 것 위주, 없으면 exam만이라도)
            for subject in subjects:
                for num in SUBJECT_NUMS:
                    exam_p = exam_img_map.get(subject, {}).get(num)
                    sol_paths = sol_img_map.get(subject, {}).get(num, [])
                    if exam_p is None and not sol_paths:
                        continue
                    exam_rel = str(exam_p.relative_to(Path('public'))).replace('\\', '/') if exam_p else None
                    all_meta.append({
                        'id':             f"{year}_{month:02d}_{num:02d}_{subject}",
                        'year':           year,
                        'month':          month,
                        'num':            num,
                        'subject':        subject,
                        'examName':       base_name,
                        'image':          exam_rel,
                        'solutionImage':  sol_paths[0] if sol_paths else None,
                        'solutionImages': sol_paths,
                        'tags':           [],
                        'concepts':      [],
                        'memo':          '',
                    })

    META_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(META_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_meta, f, ensure_ascii=False, indent=2)

    print(f"\n완료! 총 {len(all_meta)}개 문제 / 렌더링 실패: {skipped_total}개")

if __name__ == '__main__':
    main()
