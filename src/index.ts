
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


function getChangedFiles(targetBranch: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['diff', '--name-only', `${targetBranch}...HEAD`, '--'],
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message))
          return
        }

        const files = stdout
          .split('\n')
          .map((file) => file.trim())
          .filter(Boolean)

        resolve(files)
      },
    )
  })
}


async function main() {
  const targetBranch = process.argv[2] || 'dev' // 默认目标分支为dev

  try {
    const diff = await getGitDiff(targetBranch)

    const files = await getChangedFiles(targetBranch)

    console.log('\n本次变更文件：')

    if (files.length === 0) {
        console.log('没有变更文件')
    } else {
        files.forEach((file) => console.log(`- ${file}`))
    }

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

main();
