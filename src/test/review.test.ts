import { describe, expect, it } from 'vitest'
import type { ReviewIssue, ReviewResult } from '../type.js'
import { mergeReviewResults } from '../review.js'

function createIssue(overrides: Partial<ReviewIssue> = {}): ReviewIssue {
  return {
    severity: 'P2',
    title: '存在潜在问题',
    file: 'src/App.tsx',
    line: 10,
    description: '问题描述',
    suggestion: '修改建议',
    evidence: '代码依据',
    ...overrides,
  }
}

describe('mergeReviewResults', () => {
  it('合并单批审查摘要和问题', () => {
    const result = mergeReviewResults([
      {
        summary: '发现一个问题',
        issues: [],
      },
    ])

    expect(result.summary).toBe(
      '本次变更共分为 1 批审查。\n' +
        '合并前发现 0 个问题，去重后保留 0 个问题。\n' +
        '第 1 批：发现一个问题',
    )

    expect(result.issues).toEqual([])
  })

  it('合并多批审查摘要和问题', () => {
    const result = mergeReviewResults([
      {
        summary: '问题一',
        issues: [],
      },
      {
        summary: '问题二',
        issues: [],
      },
    ])

    expect(result.summary).toBe(
      '本次变更共分为 2 批审查。\n' +
        '合并前发现 0 个问题，去重后保留 0 个问题。\n' +
        '第 1 批：问题一\n' +
        '第 2 批：问题二',
    )
  })

  it('保留不同的问题', () => {
    const issue1 = createIssue({
      title: '问题一',
      line: 10,
    })

    const issue2 = createIssue({
      title: '问题二',
      line: 20,
    })

    const result = mergeReviewResults([
      {
        summary: '发现两个问题',
        issues: [issue1, issue2],
      },
    ])

    expect(result.issues).toEqual([issue1, issue2])
  })

  it('相同文件、行号和标题的问题应该去重', () => {
    const issue1 = createIssue({
      description: '第一次发现的问题',
    })

    const issue2 = createIssue({
      description: '第二次发现的问题',
    })

    const result = mergeReviewResults([
      {
        summary: '第一批',
        issues: [issue1],
      },
      {
        summary: '第二批',
        issues: [issue2],
      },
    ])

    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]).toEqual(issue1)
  })

  it('Windows 和 Unix 路径应该被视为同一个文件', () => {
    const issue1 = createIssue({
      file: 'src\\components\\App.tsx',
    })

    const issue2 = createIssue({
      file: 'src/components/App.tsx',
    })

    const result = mergeReviewResults([
      {
        summary: '第一批',
        issues: [issue1],
      },
      {
        summary: '第二批',
        issues: [issue2],
      },
    ])

    expect(result.issues).toHaveLength(1)
  })

  it('标题大小写和多余空格不同的问题应该去重', () => {
    const issue1 = createIssue({
      title: '  Unsafe   State Update ',
    })

    const issue2 = createIssue({
      title: 'unsafe state update',
    })

    const result = mergeReviewResults([
      {
        summary: '第一批',
        issues: [issue1],
      },
      {
        summary: '第二批',
        issues: [issue2],
      },
    ])

    expect(result.issues).toHaveLength(1)
  })

  it('同一个问题出现多次时应该保留更高严重程度', () => {
    const issueP3 = createIssue({
      severity: 'P3',
    })

    const issueP1 = createIssue({
      severity: 'P1',
    })

    const result = mergeReviewResults([
      {
        summary: '第一批',
        issues: [issueP3],
      },
      {
        summary: '第二批',
        issues: [issueP1],
      },
    ])

    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.severity).toBe('P1')
    expect(result.issues[0]).toEqual(issueP1)
  })

  it('不同文件中的相同问题不能被去重', () => {
    const issue1 = createIssue({
      file: 'src/App.tsx',
    })

    const issue2 = createIssue({
      file: 'src/Other.tsx',
    })

    const result = mergeReviewResults([
      {
        summary: '第一批',
        issues: [issue1],
      },
      {
        summary: '第二批',
        issues: [issue2],
      },
    ])

    expect(result.issues).toHaveLength(2)
  })

  it('不同代码行中的相同问题不能被去重', () => {
    const issue1 = createIssue({
      line: 10,
    })

    const issue2 = createIssue({
      line: 20,
    })

    const result = mergeReviewResults([
      {
        summary: '第一批',
        issues: [issue1],
      },
      {
        summary: '第二批',
        issues: [issue2],
      },
    ])

    expect(result.issues).toHaveLength(2)
  })

  it('摘要应该反映合并前和去重后的问题数量', () => {
    const issue1 = createIssue()
    const issue2 = createIssue()
    const issue3 = createIssue({
      title: '另一个问题',
    })

    const result = mergeReviewResults([
      {
        summary: '第一批',
        issues: [issue1, issue2],
      },
      {
        summary: '第二批',
        issues: [issue3],
      },
    ])

    expect(result.issues).toHaveLength(2)

    expect(result.summary).toContain(
      '合并前发现 3 个问题，去重后保留 2 个问题。',
    )
  })

  it('没有审查结果时应该返回空摘要和空问题列表', () => {
    const result = mergeReviewResults([])

    expect(result.summary).toBe(
      '本次变更共分为 0 批审查。\n' +
        '合并前发现 0 个问题，去重后保留 0 个问题。',
    )

    expect(result.issues).toEqual([])
  })
})