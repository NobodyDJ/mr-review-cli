
import { describe, expect, it } from 'vitest'
import { validateReviewResult } from '../kimi.js'

describe('validateReviewResult', () => {
  it('合法的审查结果应该通过校验', () => {
    const data = {
      summary: '发现一个潜在问题',
      issues: [
        {
          severity: 'P2',
          file: 'src/example.ts',
          line: 10,
          title: '类型不匹配',
          description: '状态类型与预期不一致',
          suggestion: '恢复正确的状态类型',
          evidence: 'useState 的初始值类型发生变化',
        },
      ],
    }

    expect(validateReviewResult(data)).toEqual(data)
  })
})
