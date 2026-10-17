
import OpenAI from 'openai'
import 'dotenv/config'
import type { ReviewIssue, ReviewResult } from './type.js'

const kimi = new OpenAI({
  apiKey: process.env.MOONSHOT_API_KEY,
  baseURL: process.env.MOONSHOT_BASE_URL,
})

/**
 * 审查代码变更
 * @param diff Git diff 内容
 * @returns 审查结果
 */
export async function reviewCode(diff: string): Promise<ReviewResult> {
  const response = await kimi.chat.completions.create({
    model: process.env.MOONSHOT_MODEL || 'kimi-k3',
    messages: [
        {
            role: 'system',
            content: `
                你是一名资深代码审查工程师。请审查输入的 Git diff，重点发现真实的代码缺陷。

                审查原则：
                1. 只报告有明确依据的问题，不要为了凑数量而提出建议。
                2. 优先检查 Bug、异常处理、边界条件、安全风险和回归问题。
                3. 不要把纯风格偏好当作 Bug。
                4. 如果没有发现实际缺陷，issues 必须为空数组。
                5. 不确定的问题不要描述成确定缺陷。
                6. 行号无法确定时填写 null，不要编造行号。

                严重程度定义：
                - P1：严重缺陷，可能导致关键功能不可用、严重数据错误或安全问题。
                - P2：可能导致明确的功能错误、运行时异常或重要功能退化。
                - P3：影响较小但有实际依据的问题。

                请严格返回 JSON，不要使用 Markdown 代码块，不要在 JSON 前后添加其他文字。

                返回结构必须符合以下格式：
                {
                    "summary": "本次变更的审查结论",
                    "issues": [
                        {
                            "severity": "P2",
                            "file": "src/example.ts",
                            "line": 2,
                            "title": "问题标题",
                            "description": "触发条件及可能后果",
                            "suggestion": "修复建议",
                            "evidence": "支持判断的代码依据"
                        }
                    ]
                }

                字段要求：
                - summary：字符串，简要说明审查结论。
                - issues：数组，没有问题时返回 []。
                - severity：只能是 P1、P2、P3。
                - file：文件路径字符串。
                - line：行号数字或 null。
                - title、description、suggestion、evidence：均为字符串。
            `,
        },
        {
            role: 'user',
            content: `请审查以下 Git diff，重点关注 Bug、异常处理、边界条件和潜在回归问题。\n\n${diff}`,
        },
    ],
    temperature: 1, // 目前官方文档，说明temperature为固定值为1
    response_format: {
        type: 'json_object',
    },
  })

    const content = response.choices[0]?.message.content

    if (!content) {
        throw new Error('Kimi 未返回审查内容')
    }

    const data: unknown = JSON.parse(content)

    return validateReviewResult(data)
}

/**
 * 验证审查结果的结构和类型
 * @param data 
 * @returns 
 */
export function validateReviewResult(data: unknown): ReviewResult {
  if (typeof data !== 'object' || data === null) {
    throw new Error('审查结果必须是一个对象')
  }

  const result = data as Record<string, unknown>

  if (typeof result.summary !== 'string') {
    throw new Error('审查结果缺少有效的 summary 字段')
  }

  if (!Array.isArray(result.issues)) {
    throw new Error('审查结果缺少有效的 issues 数组')
  }

  return {
    summary: result.summary,
    issues: result.issues.map((item: unknown, index: number): ReviewIssue => {
      if (typeof item !== 'object' || item === null) {
        throw new Error(`第 ${index + 1} 个问题不是有效对象`)
      }

      const issue = item as Record<string, unknown>

      if (
        !['P1', 'P2', 'P3'].includes(issue.severity as string) ||
        typeof issue.file !== 'string' ||
        !(typeof issue.line === 'number' || issue.line === null) ||
        typeof issue.title !== 'string' ||
        typeof issue.description !== 'string' ||
        typeof issue.suggestion !== 'string' ||
        typeof issue.evidence !== 'string'
      ) {
        throw new Error(`第 ${index + 1} 个问题的字段不符合要求`)
      }

      return {
        severity: issue.severity as ReviewIssue['severity'],
        file: issue.file,
        line: issue.line,
        title: issue.title,
        description: issue.description,
        suggestion: issue.suggestion,
        evidence: issue.evidence,
      }
    }),
  }
}