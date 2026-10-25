import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import type { CheckResult, ProjectReviewResult } from './type.js'
import { runEslintCheck, runTypeCheck } from './checks.js'
import { reviewProject } from './review.js'

function printCheckSummary(results: CheckResult[]): void {
  console.log('\n========== 检查汇总 ==========')
  results.forEach((result) => {
    const status = result.status === 'passed' ? '通过' : result.status === 'warning' ? '警告' : '失败'
    console.log(`[${status}] ${result.name}`)
  })
  console.log(`检查项：${results.length}`)
  console.log(`失败项：${results.filter((result) => result.status === 'failed').length}`)
}

function printCheckResult(result: CheckResult): void {
  const status = result.status === 'passed' ? '通过' : result.status === 'warning' ? '警告' : '失败'
  console.log(`\n${result.name} 检查结果：`)
  console.log(`[${status}] ${result.name}`)
  if (result.output) console.log(result.output)
}

function getOverallStatus(checks: CheckResult[], review: ProjectReviewResult): 'passed' | 'warning' | 'failed' {
  if (checks.some((result) => result.status === 'failed') || review.status === 'failed') return 'failed'
  if (checks.some((result) => result.status === 'warning') || review.issues.length > 0) return 'warning'
  return 'passed'
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const projectPath = args[0]
  const targetBranch = args[1] && !args[1].startsWith('--') ? args[1] : 'dev'
  const outputIndex = args.indexOf('--output')
  const outputPath = outputIndex !== -1 ? args[outputIndex + 1] : undefined

  if (!projectPath) {
    console.error('请提供目标项目路径')
    console.error('用法：npx tsx src/index.ts "<项目路径>" [目标分支] [--output <报告路径>]')
    process.exitCode = 1
    return
  }
  if (outputIndex !== -1 && !outputPath) {
    console.error('--output 后面必须提供报告文件路径')
    process.exitCode = 1
    return
  }

  try {
    const checkResults: CheckResult[] = []
    const typeCheckResult = await runTypeCheck(projectPath)
    checkResults.push(typeCheckResult)
    printCheckResult(typeCheckResult)
    const eslintResult = await runEslintCheck(projectPath)
    checkResults.push(eslintResult)
    printCheckResult(eslintResult)
    console.log(`\n目标项目：${projectPath}`)
    console.log(`目标分支：${targetBranch}`)
    const reviewResult = await reviewProject(projectPath, targetBranch)
    printCheckSummary(checkResults)
    const overallStatus = getOverallStatus(checkResults, reviewResult)
    const report = {
      generatedAt: new Date().toISOString(), projectPath: path.resolve(projectPath), targetBranch, status: overallStatus,
      checks: checkResults,
      review: { status: reviewResult.status, summary: reviewResult.summary, issues: reviewResult.issues, error: reviewResult.error, changedFiles: reviewResult.changedFiles, reviewTargets: reviewResult.reviewTargets },
    }
    if (outputPath) {
      const reportPath = path.resolve(outputPath)
      await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')
      console.log(`\nJSON 报告已生成：${reportPath}`)
    }
    console.log(`\n整体审查状态：${overallStatus}`)
    if (overallStatus === 'failed') process.exitCode = 1
  } catch (error) {
    console.error('执行审查失败：', error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
