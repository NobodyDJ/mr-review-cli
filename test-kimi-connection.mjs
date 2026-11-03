
import OpenAI from 'openai'
import 'dotenv/config'

const client = new OpenAI({
    apiKey: process.env.MOONSHOT_API_KEY,
    baseURL: process.env.MOONSHOT_BASE_URL,
    timeout: 30_000,
    maxRetries: 0,
})

async function main() {
    const start = Date.now()

    try {
        console.log('开始测试 Moonshot API...')
        console.log('Base URL:', process.env.MOONSHOT_BASE_URL)
        console.log('Model:', process.env.MOONSHOT_MODEL || 'kimi-k3')

        const response = await client.chat.completions.create({
            model: process.env.MOONSHOT_MODEL || 'kimi-k3',
            messages: [
                {
                    role: 'system',
                    content: `
                        你是一名资深代码审查工程师。
                        请审查输入的 Git diff，重点发现真实的代码缺陷。
                        只报告有明确依据的问题。
                        如果没有发现问题，issues 返回空数组。
                        严格返回 JSON：
                        {
                            "summary": "审查结论",
                            "issues": []
                        }
                        `,
                },
                {
                    role: 'user',
                    content: `
                        请审查以下 Git diff：

                        diff --git a/src/utils/example.ts b/src/utils/example.ts
                        --- a/src/utils/example.ts
                        +++ b/src/utils/example.ts
                        @@ -1,3 +1,7 @@
                        +export function getUserName(user: { name?: string }) {
                        +  return user.name.trim()
                        +}
                    `,
                },
            ],
            response_format: {
                type: 'json_object',
            },
            temperature: 1,
        })

        console.log('请求成功！')
        console.log('耗时:', `${((Date.now() - start) / 1000).toFixed(2)}s`)
        console.log('响应:', response.choices[0]?.message.content)
    } catch (error) {
        console.error('请求失败！')
        console.error('耗时:', `${((Date.now() - start) / 1000).toFixed(2)}s`)
        console.error('错误:', error)
    }
}

await main()
