import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChangedFile, ReviewIssue, ReviewResult } from '../type.js'

const mocks = vi.hoisted(() => ({
  getChangedFilesWithStatus: vi.fn(),
  getGitDiff: vi.fn(),
  getReviewTargets: vi.fn(),
  splitDiffIntoChunks: vi.fn(),
  reviewCode: vi.fn(),
}))

vi.mock('../git.js', () => ({
  getChangedFilesWithStatus: mocks.getChangedFilesWithStatus,
  getGitDiff: mocks.getGitDiff,
  getReviewTargets: mocks.getReviewTargets,
  splitDiffIntoChunks: mocks.splitDiffIntoChunks,
}))

vi.mock('../kimi.js', () => ({
  reviewCode: mocks.reviewCode,
}))

import { reviewProject } from '../review.js'

const changedFiles: ChangedFile[] = [
  {
    status: 'M',
    path: 'src/App.tsx',
  },
]

const reviewIssue: ReviewIssue = {
  severity: 'P2',
  file: 'src/App.tsx',
  line: 10,
  title: '存在潜在问题',
  description: '问题描述',
  suggestion: '修改建议',
  evidence: '代码依据',
}

const reviewResult: ReviewResult = {
  summary: '发现一个问题',
  issues: [reviewIssue],
}

describe('reviewProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // 默认模拟正常流程
    mocks.getChangedFilesWithStatus.mockResolvedValue(changedFiles)
    mocks.getReviewTargets.mockReturnValue(changedFiles)
    mocks.getGitDiff.mockResolvedValue('diff --git a/src/App.tsx b/src/App.tsx')
    mocks.splitDiffIntoChunks.mockReturnValue([
      'diff chunk 1',
    ])
    mocks.reviewCode.mockResolvedValue(reviewResult)

    // 屏蔽测试过程中的控制台输出
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('获取 Git 变更文件失败时应该返回 failed', async () => {
    mocks.getChangedFilesWithStatus.mockRejectedValue(
      new Error('Git 获取失败'),
    )

    const result = await reviewProject('/test/project', 'main')

    expect(result.status).toBe('failed')
    expect(result.summary).toBe('获取 Git 变更文件失败。')
    expect(result.error).toBe('Git 获取失败')
    expect(result.issues).toEqual([])

    // 获取文件失败后，不应该继续执行后续流程
    expect(mocks.getGitDiff).not.toHaveBeenCalled()
    expect(mocks.reviewCode).not.toHaveBeenCalled()
  })

  it('没有符合条件的代码文件时应该返回 skipped', async () => {
    mocks.getChangedFilesWithStatus.mockResolvedValue([
      {
        status: 'D',
        path: 'src/Deleted.ts',
      },
      {
        status: 'M',
        path: 'README.md',
      },
    ])

    mocks.getReviewTargets.mockReturnValue([])

    const result = await reviewProject('/test/project', 'main')

    expect(result.status).toBe('skipped')
    expect(result.summary).toBe('没有符合条件的代码文件。')
    expect(result.issues).toEqual([])

    expect(mocks.getGitDiff).not.toHaveBeenCalled()
    expect(mocks.reviewCode).not.toHaveBeenCalled()
  })

  it('获取 Git diff 失败时应该返回 failed', async () => {
    mocks.getGitDiff.mockRejectedValue(
      new Error('Git diff 获取失败'),
    )

    const result = await reviewProject('/test/project', 'main')

    expect(result.status).toBe('failed')
    expect(result.summary).toBe('获取 Git diff 失败。')
    expect(result.error).toBe('Git diff 获取失败')
    expect(result.changedFiles).toEqual(changedFiles)
    expect(result.reviewTargets).toEqual(changedFiles)

    expect(mocks.reviewCode).not.toHaveBeenCalled()
  })

  it('Diff 为空时应该返回 skipped', async () => {
    mocks.getGitDiff.mockResolvedValue('  \n  ')

    const result = await reviewProject('/test/project', 'main')

    expect(result.status).toBe('skipped')
    expect(result.summary).toBe('没有发现符合条件的代码差异。')
    expect(result.issues).toEqual([])

    expect(mocks.reviewCode).not.toHaveBeenCalled()
  })

  it('Diff 拆分失败时应该返回 failed', async () => {
    mocks.splitDiffIntoChunks.mockImplementation(() => {
      throw new Error('Diff 拆分失败')
    })

    const result = await reviewProject('/test/project', 'main')

    expect(result.status).toBe('failed')
    expect(result.summary).toBe('AI 代码审查失败。')
    expect(result.error).toBe('Diff 拆分失败')

    expect(mocks.reviewCode).not.toHaveBeenCalled()
  })

  it('没有可审查的 Diff 批次时应该返回 skipped', async () => {
    mocks.splitDiffIntoChunks.mockReturnValue([])

    const result = await reviewProject('/test/project', 'main')

    expect(result.status).toBe('skipped')
    expect(result.summary).toBe('没有可供审查的代码差异。')
    expect(result.issues).toEqual([])

    expect(mocks.reviewCode).not.toHaveBeenCalled()
  })

  it('所有批次审查成功时应该返回 completed', async () => {
    mocks.splitDiffIntoChunks.mockReturnValue([
      'diff chunk 1',
      'diff chunk 2',
    ])

    mocks.reviewCode
      .mockResolvedValueOnce(reviewResult)
      .mockResolvedValueOnce({
        summary: '发现另一个问题',
        issues: [],
      })

    const result = await reviewProject('/test/project', 'main')

    expect(result.status).toBe('completed')
    expect(result.issues).toEqual([reviewIssue])
    expect(result.error).toBeUndefined()

    expect(mocks.reviewCode).toHaveBeenCalledTimes(2)
    expect(result.summary).toContain('共 2 批，成功 2 批，失败 0 批。')
  })

  it('某批审查失败时应该继续后续批次并保留成功结果', async () => {
    mocks.splitDiffIntoChunks.mockReturnValue([
      'diff chunk 1',
      'diff chunk 2',
      'diff chunk 3',
    ])

    mocks.reviewCode
      .mockResolvedValueOnce(reviewResult)
      .mockRejectedValueOnce(new Error('Kimi 请求超时'))
      .mockResolvedValueOnce({
        summary: '第三批审查完成',
        issues: [],
      })

    const result = await reviewProject('/test/project', 'main')

    expect(result.status).toBe('failed')

    // 第 1 批的成功结果应该保留
    expect(result.issues).toEqual([reviewIssue])

    // 第 2 批失败的信息应该保留
    expect(result.error).toContain('第 2 批失败：Kimi 请求超时')

    // 第 3 批仍然应该执行
    expect(mocks.reviewCode).toHaveBeenCalledTimes(3)

    expect(result.summary).toContain('共 3 批，成功 2 批，失败 1 批。')
  })

  it('所有批次都失败时应该返回 failed 和空问题列表', async () => {
    mocks.splitDiffIntoChunks.mockReturnValue([
      'diff chunk 1',
      'diff chunk 2',
    ])

    mocks.reviewCode
      .mockRejectedValueOnce(new Error('第一次超时'))
      .mockRejectedValueOnce(new Error('第二次超时'))

    const result = await reviewProject('/test/project', 'main')

    expect(result.status).toBe('failed')
    expect(result.issues).toEqual([])
    expect(result.error).toContain('第 1 批失败：第一次超时')
    expect(result.error).toContain('第 2 批失败：第二次超时')

    expect(mocks.reviewCode).toHaveBeenCalledTimes(2)
    expect(result.summary).toContain('共 2 批，成功 0 批，失败 2 批。')
  })
})