import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
}))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: mocks.create,
      },
    }
  },
}))

import { reviewCode, validateReviewResult } from '../kimi.js'

const validData = {
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

function createResponse(content: string) {
  return {
    choices: [
      {
        message: {
          content,
        },
      },
    ],
  }
}

function createHttpError(status: number, message = '请求失败') {
  return Object.assign(new Error(message), { status })
}

describe('validateReviewResult', () => {
  it('合法的审查结果应该通过校验', () => {
    expect(validateReviewResult(validData)).toEqual(validData)
  })

  it('缺少 issues 字段时应该抛出异常', () => {
    expect(() =>
      validateReviewResult({
        summary: '本次审查没有发现问题',
      }),
    ).toThrow('审查结果缺少有效的 issues 数组')
  })

  it('severity 不属于 P1、P2、P3 时应该抛出异常', () => {
    expect(() =>
      validateReviewResult({
        summary: '发现一个问题',
        issues: [{ ...validData.issues[0]!, severity: 'P4' }],
      }),
    ).toThrow('第 1 个问题的字段不符合要求')
  })

  it('line 不是数字或 null 时应该抛出异常', () => {
    expect(() =>
      validateReviewResult({
        summary: '发现一个问题',
        issues: [{ ...validData.issues[0]!, line: '10' }],
      }),
    ).toThrow('第 1 个问题的字段不符合要求')
  })

  it('line 为小数时应该抛出异常', () => {
    expect(() =>
      validateReviewResult({
        summary: '发现一个问题',
        issues: [{ ...validData.issues[0]!, line: 10.5 }],
      }),
    ).toThrow('第 1 个问题的字段不符合要求')
  })

  it('line 为 0 时应该抛出异常', () => {
    expect(() =>
      validateReviewResult({
        summary: '发现一个问题',
        issues: [{ ...validData.issues[0]!, line: 0 }],
      }),
    ).toThrow('第 1 个问题的字段不符合要求')
  })

  it('line 为 null 时应该通过校验', () => {
    const data = {
      summary: '发现一个问题',
      issues: [{ ...validData.issues[0]!, line: null }],
    }

    expect(validateReviewResult(data)).toEqual(data)
  })

  it('summary 不是字符串时应该抛出异常', () => {
    expect(() =>
      validateReviewResult({
        summary: 123,
        issues: [],
      }),
    ).toThrow('审查结果缺少有效的 summary 字段')
  })

  it('issues 不是数组时应该抛出异常', () => {
    expect(() =>
      validateReviewResult({
        summary: '审查完成',
        issues: {},
      }),
    ).toThrow('审查结果缺少有效的 issues 数组')
  })

  it('审查结果不是对象时应该抛出异常', () => {
    expect(() => validateReviewResult(null)).toThrow(
      '审查结果必须是一个对象',
    )
  })

  it('单个问题不是对象时应该抛出异常', () => {
    expect(() =>
      validateReviewResult({
        summary: '发现一个问题',
        issues: [null],
      }),
    ).toThrow('第 1 个问题不是有效对象')
  })

  it('缺少必要的问题字段时应该抛出异常', () => {
    const { evidence: _evidence, ...incompleteIssue } = validData.issues[0]!

    expect(() =>
      validateReviewResult({
        summary: '发现一个问题',
        issues: [incompleteIssue],
      }),
    ).toThrow('第 1 个问题的字段不符合要求')
  })

  it('问题的文本字段类型错误时应该抛出异常', () => {
    expect(() =>
      validateReviewResult({
        summary: '发现一个问题',
        issues: [{ ...validData.issues[0]!, title: 123 }],
      }),
    ).toThrow('第 1 个问题的字段不符合要求')
  })

  it('空字符串形式的 summary 当前允许通过校验', () => {
    expect(
      validateReviewResult({
        summary: '',
        issues: [],
      }),
    ).toEqual({
      summary: '',
      issues: [],
    })
  })
})

describe('reviewCode', () => {
  beforeEach(() => {
    mocks.create.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('Diff 为空时应该直接报错，不调用 API', async () => {
    await expect(reviewCode('  \n  ')).rejects.toThrow(
      'Git diff 内容为空，无法进行 AI 审查',
    )

    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('Diff 超过 40000 字符时应该直接报错', async () => {
    await expect(reviewCode('x'.repeat(40_001))).rejects.toThrow(
      'Git diff 过大',
    )

    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('首次请求成功时应该返回审查结果', async () => {
    mocks.create.mockResolvedValueOnce(
      createResponse(JSON.stringify(validData)),
    )

    await expect(reviewCode('diff content')).resolves.toEqual(validData)

    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it('HTTP 503 后重试成功应该返回结果', async () => {
    vi.useFakeTimers()

    mocks.create
      .mockRejectedValueOnce(createHttpError(503, '服务暂时不可用'))
      .mockResolvedValueOnce(createResponse(JSON.stringify(validData)))

    const promise = reviewCode('diff content')

    await vi.runAllTimersAsync()

    await expect(promise).resolves.toEqual(validData)
    expect(mocks.create).toHaveBeenCalledTimes(2)
  })

  it('HTTP 429 后应该重试', async () => {
    vi.useFakeTimers()

    mocks.create
      .mockRejectedValueOnce(createHttpError(429, '请求频率过高'))
      .mockResolvedValueOnce(createResponse(JSON.stringify(validData)))

    const promise = reviewCode('diff content')

    await vi.runAllTimersAsync()

    await expect(promise).resolves.toEqual(validData)
    expect(mocks.create).toHaveBeenCalledTimes(2)
  })

  it('普通错误不应该重试', async () => {
    mocks.create.mockRejectedValueOnce(new Error('请求参数错误'))

    await expect(reviewCode('diff content')).rejects.toThrow(
      'Kimi AI 审查失败，已尝试 2 次。原因：请求参数错误',
    )

    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it('达到最大请求次数后应该抛出异常', async () => {
    vi.useFakeTimers()

    mocks.create
      .mockRejectedValueOnce(createHttpError(503, '第一次服务异常'))
      .mockRejectedValueOnce(createHttpError(503, '第二次服务异常'))

    const promise = reviewCode('diff content')
    const rejection = expect(promise).rejects.toThrow(
      'Kimi AI 审查失败，已尝试 2 次。原因：第二次服务异常',
    )

    await vi.runAllTimersAsync()

    await rejection

    expect(mocks.create).toHaveBeenCalledTimes(2)
  })

  it('返回非法 JSON 时不应该重试', async () => {
    mocks.create.mockResolvedValueOnce(
      createResponse('这不是合法 JSON'),
    )

    await expect(reviewCode('diff content')).rejects.toThrow(
      'Unexpected token',
    )

    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it('返回结构不合法的 JSON 时不应该重试', async () => {
    mocks.create.mockResolvedValueOnce(
      createResponse(JSON.stringify({ summary: '缺少 issues' })),
    )

    await expect(reviewCode('diff content')).rejects.toThrow(
      '审查结果缺少有效的 issues 数组',
    )

    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it('模型未返回内容时不应该重试', async () => {
    mocks.create.mockResolvedValueOnce(
      createResponse(''),
    )

    await expect(reviewCode('diff content')).rejects.toThrow(
      'Kimi AI 审查失败，已尝试 2 次。原因：Kimi 未返回审查内容',
    )

    expect(mocks.create).toHaveBeenCalledTimes(1)
  })
})
