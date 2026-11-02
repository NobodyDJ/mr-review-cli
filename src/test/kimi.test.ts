
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

  
  it('缺少 issues 字段时应该抛出异常', () => {
    const data = {
      summary: '本次审查没有发现问题',
    }

    expect(() => validateReviewResult(data)).toThrow(
      '审查结果缺少有效的 issues 数组',
    )
  })
  
  it('severity 不属于 P1、P2、P3 时应该抛出异常', () => {
    const data = {
      summary: '发现一个问题',
      issues: [
        {
          severity: 'P4',
          file: 'src/example.ts',
          line: 10,
          title: '测试问题',
          description: '测试描述',
          suggestion: '测试建议',
          evidence: '测试依据',
        },
      ],
    }

    expect(() => validateReviewResult(data)).toThrow(
      '第 1 个问题的字段不符合要求',
    )
  })

  it('line 不是数字或 null 时应该抛出异常', () => {
    const data = {
      summary: '发现一个问题',
      issues: [
        {
          severity: 'P2',
          file: 'src/example.ts',
          line: '10',
          title: '测试问题',
          description: '测试描述',
          suggestion: '测试建议',
          evidence: '测试依据',
        },
      ],
    }

    expect(() => validateReviewResult(data)).toThrow(
      '第 1 个问题的字段不符合要求',
    )
  })

  it('line 为小数时应该抛出异常', () => {
    const data = {
      summary: '发现一个问题',
      issues: [
        {
          severity: 'P2',
          file: 'src/example.ts',
          line: 10.5,
          title: '测试问题',
          description: '测试描述',
          suggestion: '测试建议',
          evidence: '测试依据',
        },
      ],
    }

    expect(() => validateReviewResult(data)).toThrow(
      '第 1 个问题的字段不符合要求',
    )
  })

  it('line 为 0 时应该抛出异常', () => {
    const data = {
      summary: '发现一个问题',
      issues: [
        {
          severity: 'P2',
          file: 'src/example.ts',
          line: 0,
          title: '测试问题',
          description: '测试描述',
          suggestion: '测试建议',
          evidence: '测试依据',
        },
      ],
    }

    expect(() => validateReviewResult(data)).toThrow(
      '第 1 个问题的字段不符合要求',
    )
  })

  it('line 为 null 时应该通过校验', () => {
    const data = {
      summary: '发现一个问题',
      issues: [
        {
          severity: 'P2',
          file: 'src/example.ts',
          line: null,
          title: '测试问题',
          description: '测试描述',
          suggestion: '测试建议',
          evidence: '测试依据',
        },
      ],
    }

    expect(validateReviewResult(data)).toEqual(data)
  })
})
