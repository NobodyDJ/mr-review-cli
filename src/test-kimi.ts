
import { reviewCode } from './kimi.js'

async function main() {
    const diff = `
        diff --git a/src/example.ts b/src/example.ts
        index 1234567..abcdefg 100644
        --- a/src/example.ts
        +++ b/src/example.ts
        @@ -1,3 +1,4 @@
        function add(a: number, b: number) {
        return a + b
        }
        +// 返回两个数字的和
    `

    const result = await reviewCode(diff)
    console.log('========== Kimi 审查结果 ==========')
    console.log(result)
}

main().catch((error: unknown) => {
    console.error('Kimi 调用失败：', error)
    process.exitCode = 1
})
