import type { ChangedFile, ProjectReviewResult, ReviewResult } from './type.js'
import { reviewCode } from './kimi.js'
import { getChangedFilesWithStatus, getGitDiff, getReviewTargets, splitDiffIntoChunks } from './git.js'

const emptyIssues = (): ProjectReviewResult['issues'] => []

export function mergeReviewResults(results: ReviewResult[]): { summary: string; issues: ProjectReviewResult['issues'] } {
  const summaries = results.map((result, index) => `第 ${index + 1} 批：${result.summary}`)
  return {
    summary: results.length === 1
      ? summaries[0] ?? ''
      : `本次变更共分为 ${results.length} 批审查。\n${summaries.join('\n')}`,
    issues: results.flatMap((result) => result.issues),
  }
}

function failure(summary: string, error: unknown, changedFiles: ChangedFile[], reviewTargets: ChangedFile[]): ProjectReviewResult {
  return { status: 'failed', summary, issues: emptyIssues(), error: error instanceof Error ? error.message : String(error), changedFiles, reviewTargets }
}

export async function reviewProject(projectPath: string, targetBranch: string): Promise<ProjectReviewResult> {
  let filesWithStatus: ChangedFile[]
  try {
    filesWithStatus = await getChangedFilesWithStatus(projectPath, targetBranch)
  } catch (error) {
    const result = failure('获取 Git 变更文件失败。', error, [], [])
    console.error('\n[Git 获取变更文件失败]')
    console.error(result.error)
    return result
  }

  console.log('\n本次变更文件状态：')
  if (filesWithStatus.length === 0) console.log('没有变更文件')
  else filesWithStatus.forEach(({ status, path }) => console.log(`[${status}] ${path}`))
  const reviewTargets = getReviewTargets(filesWithStatus)
  console.log('\n待审查文件：')
  if (reviewTargets.length === 0) console.log('没有需要审查的新增或修改文件')
  else reviewTargets.forEach(({ status, path }) => console.log(`[${status}] ${path}`))

  if (reviewTargets.length === 0) {
    console.log('跳过代码审查：没有符合条件的代码文件。')
    return { status: 'skipped', summary: '没有符合条件的代码文件。', issues: emptyIssues(), changedFiles: filesWithStatus, reviewTargets }
  }

  let diff: string
  try {
    diff = await getGitDiff(projectPath, targetBranch, reviewTargets.map(({ path }) => path))
  } catch (error) {
    const result = failure('获取 Git diff 失败。', error, filesWithStatus, reviewTargets)
    console.error('\n[Git 获取 diff 失败]')
    console.error(result.error)
    return result
  }
  if (!diff.trim()) {
    console.log('没有发现符合条件的代码差异。')
    return { status: 'skipped', summary: '没有发现符合条件的代码差异。', issues: emptyIssues(), changedFiles: filesWithStatus, reviewTargets }
  }

  console.log('\n本次代码差异：')
  console.log(diff)
  console.log('\n========== Kimi 代码审查 ==========')
  let diffChunks: string[]
  try {
    diffChunks = splitDiffIntoChunks(diff)
  } catch (error) {
    const result = failure('AI 代码审查失败。', error, filesWithStatus, reviewTargets)
    console.error('\n[Kimi 审查失败]')
    console.error(result.error)
    return result
  }
  if (diffChunks.length === 0) return { status: 'skipped', summary: '没有可供审查的代码差异。', issues: emptyIssues(), changedFiles: filesWithStatus, reviewTargets }
  console.log(`\n本次 Diff 共 ${diff.length} 字符，拆分为 ${diffChunks.length} 个审查批次。`)

  try {
    const batchResults: ReviewResult[] = []
    for (const [index, chunk] of diffChunks.entries()) {
      console.log(`\n========== Kimi 审查：第 ${index + 1}/${diffChunks.length} 批 ==========`)
      const result = await reviewCode(chunk)
      batchResults.push(result)
      console.log(result.summary)
      console.log(`本批发现 ${result.issues.length} 个问题。`)
    }
    const { summary: mergedSummary, issues: mergedIssues } = mergeReviewResults(batchResults)
    console.log('\n========== 合并审查结果 ==========')
    console.log(mergedSummary)
    console.log(`\n总共发现 ${mergedIssues.length} 个问题。`)
    for (const issue of mergedIssues) {
      console.log(`\n[${issue.severity}] ${issue.title}`)
      console.log(`文件：${issue.file}`)
      console.log(`行号：${issue.line ?? '未知'}`)
      console.log(`问题：${issue.description}`)
      console.log(`建议：${issue.suggestion}`)
      console.log(`依据：${issue.evidence}`)
    }
    return { status: 'completed', summary: mergedSummary, issues: mergedIssues, changedFiles: filesWithStatus, reviewTargets }
  } catch (error) {
    const result = failure('AI 代码审查失败。', error, filesWithStatus, reviewTargets)
    console.error('\n[Kimi 审查失败]')
    console.error(result.error)
    return result
  }
}
