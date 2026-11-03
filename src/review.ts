import type { ChangedFile, ProjectReviewResult, ReviewResult, ReviewIssue } from './type.js'
import { reviewCode } from './kimi.js'
import { getChangedFilesWithStatus, getGitDiff, getReviewTargets, splitDiffIntoChunks } from './git.js'
import { writeFile } from 'node:fs/promises'

const emptyIssues = (): ProjectReviewResult['issues'] => []

export function mergeReviewResults(
  results: ReviewResult[],
): { summary: string; issues: ProjectReviewResult['issues'] } {
  const summaries = results.map(
    (result, index) => `第 ${index + 1} 批：${result.summary}`,
  )

  const allIssues = results.flatMap((result) => result.issues)
  const deduplicatedIssues = deduplicateIssues(allIssues)

  return {
    summary: [
      `本次变更共分为 ${results.length} 批审查。`,
      `合并前发现 ${allIssues.length} 个问题，去重后保留 ${deduplicatedIssues.length} 个问题。`,
      ...summaries,
    ].join('\n'),
    issues: deduplicatedIssues,
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
    await writeFile('./test-diff.txt', diff, 'utf-8')

    console.log(`测试 Diff 已保存，共 ${diff.length} 字符`)
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

  const batchResults: ReviewResult[] = []
  const batchErrors: string[] = []

  for (const [index, chunk] of diffChunks.entries()) {
    const batchNumber = index + 1

    console.log(
      `\n========== Kimi 审查：第 ${batchNumber}/${diffChunks.length} 批 ==========`,
    )

    try {
      const result = await reviewCode(chunk)

      batchResults.push(result)

      console.log(result.summary)
      console.log(`本批发现 ${result.issues.length} 个问题。`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error)

      batchErrors.push(`第 ${batchNumber} 批失败：${message}`)

      console.error(`第 ${batchNumber} 批审查失败：${message}`)

      // 不 return，不 throw，继续审查下一批
    }
  }

  const { summary: mergedSummary, issues: mergedIssues } =
    mergeReviewResults(batchResults)

  const successCount = batchResults.length
  const failedCount = batchErrors.length

  const finalSummary = [
    `共 ${diffChunks.length} 批，成功 ${successCount} 批，失败 ${failedCount} 批。`,
    mergedSummary,
  ].join('\n')

  console.log('\n========== 合并审查结果 ==========')
  console.log(finalSummary)
  console.log(`\n去重后总共发现 ${mergedIssues.length} 个问题。`)

  for (const issue of mergedIssues) {
    console.log(`\n[${issue.severity}] ${issue.title}`)
    console.log(`文件：${issue.file}`)
    console.log(`行号：${issue.line ?? '未知'}`)
    console.log(`问题：${issue.description}`)
    console.log(`建议：${issue.suggestion}`)
    console.log(`依据：${issue.evidence}`)
  }

  return {
    status: failedCount === 0 ? 'completed' : 'failed',
    summary: finalSummary,
    issues: mergedIssues,
    ...(failedCount > 0 ? { error: batchErrors.join('\n') } : {}),
    changedFiles: filesWithStatus,
    reviewTargets,
  }
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function normalizeFilePath(file: string): string {
  return file
    .replace(/\\/g, '/')
    .trim()
    .replace(/^\.\//, '')
}

function deduplicateIssues(issues: ReviewIssue[]): ReviewIssue[] {
  const issueMap = new Map<string, ReviewIssue>()

  // P1 优先级最高，P3 最低
  const severityRank = {
    P1: 3,
    P2: 2,
    P3: 1,
  }

  for (const issue of issues) {
    const key = [
      normalizeFilePath(issue.file),
      issue.line ?? 'unknown',
      normalizeText(issue.title),
    ].join('|')

    const existingIssue = issueMap.get(key)

    // 首次出现，直接保存
    if (!existingIssue) {
      issueMap.set(key, issue)
      continue
    }

    // 同一问题出现多次时，保留严重程度更高的结果
    if (
      severityRank[issue.severity] >
      severityRank[existingIssue.severity]
    ) {
      issueMap.set(key, issue)
    }
  }

  return [...issueMap.values()]
}
