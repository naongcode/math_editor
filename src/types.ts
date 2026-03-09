export interface Problem {
  id: string;
  year: number;
  month: number;
  num: number;
  examName: string;
  image: string | null;
  subject?: string;
  solutionImage: string | null;
  solutionImages?: string[];
  tags: string[];
  concepts: string[];
  memo: string;
  type?: string;
  typeTags?: string[];
}

export type SortKey = 'num' | 'year' | 'concept';

export interface Student {
  id: string;
  name: string;
}

export interface ProblemSet {
  id: string;
  name: string;
  createdAt: string;
  studentIds: string[];
  problemIds: string[];
  includeSolution: boolean;
}
