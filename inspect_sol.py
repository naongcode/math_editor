"""
해설 PDF 구조 분석 스크립트 → inspect_result.json 저장
- 수직선 / 가로선 위치
- 컬럼 수
- "출제의도" 앵커 위치
- 머리말/꼬리말 영역
"""
import fitz
import json
import re
from pathlib import Path
from collections import Counter

ASSET_DIR = Path("asset")
PROBLEM_RE = re.compile(r'^(\d+)\.')

def find_lines(page):
    page_w = page.rect.width
    page_h = page.rect.height
    v_lines = []
    h_lines = []
    for item in page.get_drawings():
        r = item.get('rect')
        if r is None:
            continue
        w, h = r.width, r.height
        if w < 5 and h > page_h * 0.2:
            v_lines.append(round(r.x0 + w / 2))
        if h < 5 and w > page_w * 0.2:
            h_lines.append(round(r.y0 + h / 2))
    return sorted(set(v_lines)), sorted(set(h_lines))

def find_cheui_anchors(page):
    """'출제의도' 포함 블록에서 (num, x, y) 반환"""
    results = []
    blocks = page.get_text('blocks')
    for i, b in enumerate(blocks):
        x0, y0, text = b[0], b[1], b[4]
        if '출제의도' not in text:
            continue
        num = None
        for line in text.split('\n'):
            m = PROBLEM_RE.match(line.strip())
            if m:
                num = int(m.group(1))
                break
        if num is None and i > 0:
            for line in blocks[i-1][4].split('\n'):
                m = PROBLEM_RE.match(line.strip())
                if m:
                    num = int(m.group(1))
                    break
        results.append({'num': num, 'x': round(x0), 'y': round(y0)})
    return results

def analyze_pdf(pdf_path: Path):
    doc = fitz.open(str(pdf_path))
    page_w = doc[0].rect.width
    page_h = doc[0].rect.height

    # 컬럼 수: 수직선으로 감지
    all_v = []
    for pi in range(len(doc)):
        v, _ = find_lines(doc[pi])
        all_v.extend(v)
    v_xs = sorted(set(round(x / 10) * 10 for x in all_v))
    n_cols = len(v_xs) + 1 if v_xs else 2

    # 머리말/꼬리말 가로선 (전 페이지 통계)
    all_h = []
    for pi in range(len(doc)):
        _, h = find_lines(doc[pi])
        all_h.extend(h)
    h_pcts = sorted(set(round(y / page_h * 100) for y in all_h))
    header_ys = [y for y in h_pcts if y < 25]
    footer_ys = [y for y in h_pcts if y > 75]

    # 출제의도 앵커
    all_cheui = []
    for pi in range(len(doc)):
        for a in find_cheui_anchors(doc[pi]):
            all_cheui.append({'page': pi, **a})

    nums_found = sorted(set(a['num'] for a in all_cheui if a['num'] is not None))
    nums_missing = [n for n in range(1, 31) if n not in nums_found]
    has_cheui = len(nums_found) > 0

    n_pages = len(doc)
    doc.close()

    return {
        'file': pdf_path.name,
        'folder': pdf_path.parent.name,
        'pages': n_pages,
        'size': f"{page_w:.0f}x{page_h:.0f}",
        'n_cols': n_cols,
        'col_divider_xs': v_xs,
        'header_line_pct': header_ys,
        'footer_line_pct': footer_ys,
        'has_cheui': has_cheui,
        'nums_found': nums_found,
        'nums_missing': nums_missing,
        'cheui_anchors': all_cheui,
    }

def main():
    sol_files = sorted(set(
        list(ASSET_DIR.glob("**/*해설*.pdf")) +
        list(ASSET_DIR.glob("**/*해.pdf"))
    ))
    if not sol_files:
        print("해설 PDF 없음")
        return

    results = []
    for f in sol_files:
        try:
            r = analyze_pdf(f)
            results.append(r)
            status = "OK" if r['has_cheui'] else "NO_CHEUI"
            missing = f"  누락:{r['nums_missing']}" if r['nums_missing'] else ""
            print(f"[{status}] {r['folder']}/{r['file']}  {r['n_cols']}열  {r['pages']}p  found={r['nums_found']}{missing}")
        except Exception as e:
            print(f"[ERROR] {f}: {e}")
            results.append({'file': f.name, 'error': str(e)})

    out = Path("inspect_result.json")
    with open(out, 'w', encoding='utf-8') as fp:
        json.dump(results, fp, ensure_ascii=False, indent=2)
    print(f"\n결과 저장: {out}")

if __name__ == '__main__':
    main()
