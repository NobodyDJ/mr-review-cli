import type { reviewCode } from "./kimi.js"

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

type ProjectReviewResult = {
  status: 'completed' | 'skipped' | 'failed'
  summary: string
  issues: Awaited<ReturnType<typeof reviewCode>>['issues']
  error?: string
  changedFiles: ChangedFile[]
  reviewTargets: ChangedFile[]
}

export type { ChangedFile, CheckResult, ReviewIssue, ReviewResult, ProjectReviewResult }