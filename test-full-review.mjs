
import OpenAI from 'openai'
import 'dotenv/config'
import { readFile } from 'node:fs/promises'

const client = new OpenAI({
    apiKey: process.env.MOONSHOT_API_KEY,
    baseURL: process.env.MOONSHOT_BASE_URL,
    timeout: 120_000,
    maxRetries: 0,
})

const SYSTEM_PROMPT = `
  你是一名资深代码审查工程师。请审查输入的 Git diff，重点发现真实的代码缺陷。

  审查原则：
  1. 只报告有明确依据的问题，不要为了凑数量而提出建议。
  2. 优先检查 Bug、异常处理、边界条件、安全风险和回归问题。
  3. 不要把纯风格偏好当作 Bug。
  4. 如果没有发现实际缺陷，issues 必须为空数组。
  5. 不确定的问题不要描述成确定缺陷。
  6. 行号无法确定时填写 null，不要编造行号。
  7. file 必须使用 diff 中的实际文件路径。
  8. line 应尽可能对应变更后文件中的行号。

  严重程度定义：
  - P1：严重缺陷，可能导致关键功能不可用、严重数据错误或安全问题。
  - P2：可能导致明确的功能错误、运行时异常或重要功能退化。
  - P3：影响较小但有实际依据的问题。

  请严格返回 JSON，不要使用 Markdown 代码块，不要在 JSON 前后添加其他文字。

  返回结构：
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
  - summary：字符串。
  - issues：数组，没有问题时返回 []。
  - severity：只能是 P1、P2、P3。
  - file：文件路径字符串。
  - line：行号数字或 null。
  - title、description、suggestion、evidence：均为字符串。
`

async function main() {
    const fullDiff = await readFile('./test-diff.txt', 'utf-8')

    const fileDiffs = fullDiff
        .split(/(?=^diff --git )/m)
        .filter((item) => item.trim())

    console.log(`总文件数：${fileDiffs.length}`)

    // 只测试第四个文件
    const diff = fileDiffs[2]

    console.log('当前测试文件：')
    console.log(diff.slice(0, 200))
    console.log(`当前 Diff 字符数：${diff.length}`)

    console.log('Diff 字符数:', diff.length)
    console.log('System Prompt 字符数:', SYSTEM_PROMPT.length)

    const start = Date.now()

    try {
        console.log('开始执行完整代码审查请求...')

        const response = await client.chat.completions.create({
            model: process.env.MOONSHOT_MODEL || 'kimi-k3',
            messages: [
                {
                    role: 'system',
                    content: SYSTEM_PROMPT,
                },
                {
                    role: 'user',
                    content:
                        `请审查以下 Git diff，重点关注 Bug、异常处理、` +
                        `边界条件和潜在回归问题。\n\n${diff}`,
                },
            ],
            temperature: 1,
            response_format: {
                type: 'json_object',
            },
        })

        const content = response.choices[0]?.message.content

        console.log('请求成功！')
        console.log('耗时:', `${((Date.now() - start) / 1000).toFixed(2)}s`)
        console.log('响应长度:', content?.length ?? 0)
        console.log('响应:', content)
    } catch (error) {
        console.error('请求失败！')
        console.error('耗时:', `${((Date.now() - start) / 1000).toFixed(2)}s`)
        console.error('错误:', error)
        console.error('Cause:', error instanceof Error ? error.cause : undefined)
    }
}

await main()
