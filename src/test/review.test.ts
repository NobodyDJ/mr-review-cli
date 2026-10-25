import { describe, expect, it } from 'vitest'
import { mergeReviewResults } from '../review.js'

describe('mergeReviewResults', () => {
  it('合并单批审查摘要和问题', () => {
    const result = mergeReviewResults([
      { summary: '发现一个问题', issues: [] },
    ])

    expect(result.summary).toBe('第 1 批：发现一个问题')
    expect(result.issues).toEqual([])
  })

  it('合并多批审查摘要和问题', () => {
    const result = mergeReviewResults([
      { summary: '问题一', issues: [] },
      { summary: '问题二', issues: [] },
    ])

    expect(result.summary).toBe('本次变更共分为 2 批审查。\n第 1 批：问题一\n第 2 批：问题二')
  })
})
