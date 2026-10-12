
import { execFile } from 'node:child_process'

function getGitDiff(targetBranch: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['diff', `${targetBranch}...HEAD`, '--'],
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message))
          return
        }

        resolve(stdout)
      },
    )
  })
}

async function main() {
  const targetBranch = process.argv[2] || 'dev' // 默认目标分支为dev

  try {
    const diff = await getGitDiff(targetBranch)

    if (!diff.trim()) {
      console.log('没有发现已提交的代码变更。')
      return
    }

    console.log(diff)
  } catch (error) {
    console.error(
      '读取 Git diff 失败：',
      error instanceof Error ? error.message : error,
    )
    process.exitCode = 1
  }
}

main()
