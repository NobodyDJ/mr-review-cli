import { execFile } from 'node:child_process'
import type { ChangedFile } from './type.js'

const MAX_REVIEW_DIFF_CHARS = 35_000

export function getGitDiff(projectPath: string, targetBranch: string, filePaths: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', ['diff', `${targetBranch}...HEAD`, '--', ...filePaths], { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) { reject(new Error(stderr || error.message)); return }
      resolve(stdout)
    })
  })
}

export function getChangedFilesWithStatus(projectPath: string, targetBranch: string): Promise<ChangedFile[]> {
  return new Promise((resolve, reject) => {
    execFile('git', ['diff', '--name-status', `${targetBranch}...HEAD`, '--'], { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) { reject(new Error(stderr.trim() || error.message)); return }
      resolve(stdout.trim().split('\n').filter(Boolean).map((line) => {
        const [status = '', ...pathParts] = line.split('\t')
        return { status, path: pathParts.join('\t') }
      }))
    })
  })
}

export function getReviewTargets(files: ChangedFile[]): ChangedFile[] {
  const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue'])
  return files.filter(({ status, path }) => {
    if (status !== 'M' && status !== 'A') return false
    return codeExtensions.has(path.slice(path.lastIndexOf('.')).toLowerCase())
  })
}

export function splitDiffIntoChunks(diff: string): string[] {
  const fileDiffs = diff.split(/(?=^diff --git )/m).filter((fileDiff) => fileDiff.trim())
  if (fileDiffs.length === 0) return []

  const chunks: string[] = []
  let currentChunk = ''
  for (const fileDiff of fileDiffs) {
    if (fileDiff.length > MAX_REVIEW_DIFF_CHARS) {
      throw new Error(`单个文件的 diff 过大：${fileDiff.length} 字符，超过单批次限制 ${MAX_REVIEW_DIFF_CHARS} 字符。`)
    }
    const nextChunk = currentChunk ? `${currentChunk}\n${fileDiff}` : fileDiff
    if (nextChunk.length > MAX_REVIEW_DIFF_CHARS) {
      chunks.push(currentChunk)
      currentChunk = fileDiff
    } else {
      currentChunk = nextChunk
    }
  }
  if (currentChunk) chunks.push(currentChunk)
  return chunks
}
