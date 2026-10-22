type ChangedFile = {
  status: string
  path: string
}

type CheckResult = {
  name: string
  status: 'passed' | 'warning' | 'failed'
  output: string
}

type ReviewIssue = {
  severity: 'P1' | 'P2' | 'P3'
  file: string
  line: number | null
  title: string
  description: string
  suggestion: string
  evidence: string
}

type ReviewResult = {
  summary: string
  issues: ReviewIssue[]
}

export type { ChangedFile, CheckResult, ReviewIssue, ReviewResult }