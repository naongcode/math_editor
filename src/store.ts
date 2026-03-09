import type { Problem, Student, ProblemSet } from './types';

// ── 문제 태그 ──────────────────────────────────────────
const ANNOTATIONS_KEY = 'math_editor_annotations';

interface Annotation { tags: string[]; concepts: string[]; memo: string; }
type AnnotationStore = Record<string, Annotation>;

export function loadAnnotations(): AnnotationStore {
  try { return JSON.parse(localStorage.getItem(ANNOTATIONS_KEY) ?? '{}'); } catch { return {}; }
}
export function saveAnnotation(id: string, data: Annotation) {
  const s = loadAnnotations(); s[id] = data;
  localStorage.setItem(ANNOTATIONS_KEY, JSON.stringify(s));
}
export function mergeAnnotations(problems: Problem[]): Problem[] {
  const s = loadAnnotations();
  return problems.map(p => ({ ...p, ...(s[p.id] ?? {}) }));
}

// ── 학생 ──────────────────────────────────────────────
const STUDENTS_KEY = 'math_editor_students';

export function loadStudents(): Student[] {
  try { return JSON.parse(localStorage.getItem(STUDENTS_KEY) ?? '[]'); } catch { return []; }
}
export function saveStudents(students: Student[]) {
  localStorage.setItem(STUDENTS_KEY, JSON.stringify(students));
}

// ── 문제집 ────────────────────────────────────────────
const SETS_KEY = 'math_editor_sets';

export function loadProblemSets(): ProblemSet[] {
  try { return JSON.parse(localStorage.getItem(SETS_KEY) ?? '[]'); } catch { return []; }
}
export function saveProblemSets(sets: ProblemSet[]) {
  localStorage.setItem(SETS_KEY, JSON.stringify(sets));
}

// ── 유틸 ──────────────────────────────────────────────
export function getAllTags(problems: Problem[]): string[] {
  const s = new Set<string>();
  problems.forEach(p => p.tags.forEach(t => s.add(t)));
  return Array.from(s).sort();
}
export function getAllConcepts(problems: Problem[]): string[] {
  const s = new Set<string>();
  problems.forEach(p => p.concepts.forEach(c => s.add(c)));
  return Array.from(s).sort();
}

export const MONTH_LABELS: Record<number, string> = {
  3: '3월', 4: '4월', 5: '5월', 6: '6월',
  7: '7월', 9: '9월', 10: '10월', 11: '수능',
};
