
import { execFile } from 'node:child_process'
import type { ChangedFile } from './type.ts'

function getGitDiff(
  projectPath: string,
  targetBranch: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['diff', `${targetBranch}...HEAD`, '--'],
      {
        cwd: projectPath,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message))
          return
        }

        resolve(stdout)
      },
    )
  })
}

/**
 * 获取变更文件列表
 * @param targetBranch 目标分支
 * @returns 变更文件列表
 */
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

/**
 * 获取变更文件列表及其状态
 * @param targetBranch 目标分支
 * @returns 变更文件列表及其状态
 */
function getChangedFilesWithStatus(
  projectPath: string,
  targetBranch: string,
): Promise<ChangedFile[]> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['diff', '--name-status', `${targetBranch}...HEAD`, '--'],
      {
        cwd: projectPath,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message))
          return
        }

        const files = stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [status = '', ...pathParts] = line.split('\t')

            return {
              status,
              path: pathParts.join('\t'),
            }
          })

        resolve(files)
      },
    )
  })
}

/**
 * 获取需要评审的文件列表
 * @param files 
 * @returns 
 */
function getReviewTargets(files: ChangedFile[]): ChangedFile[] {
  return files.filter(
    ({ status }) => status === 'M' || status === 'A',
  )
}

/**
 * 运行 TypeScript 类型检查
 * @param projectPath 项目路径
 * @returns 
 */
function runTypeCheck(projectPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'npx',
      ['tsc', '--noEmit'],
      {
        cwd: projectPath,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error([stdout, stderr].filter(Boolean).join('\n') || error.message));
          return;
        }

        console.log('TypeScript 类型检查通过。');
        resolve();
      },
    );
  });
}



async function main() {
  const projectPath = process.argv[2]
  const targetBranch = process.argv[3] || 'dev'

  if (!projectPath) {
    console.error('请提供目标项目路径')
    console.error(
      '用法：npx tsx src/index.ts "<项目路径>" [目标分支]',
    )
    process.exitCode = 1
    return
  }

  console.log(`目标项目：${projectPath}`)
  console.log(`目标分支：${targetBranch}`)

  try {
    const diff = await getGitDiff(projectPath, targetBranch)

    const filesWithStatus = await getChangedFilesWithStatus(
        projectPath,
        targetBranch,
    )

    console.log('\n本次变更文件状态：')

    if (filesWithStatus.length === 0) {
        console.log('没有变更文件')
    } else {
        filesWithStatus.forEach(({ status, path }) => {
            console.log(`[${status}] ${path}`)
        })
    }

    const reviewTargets = getReviewTargets(filesWithStatus)

    console.log('\n待审查文件：')

    if (reviewTargets.length === 0) {
        console.log('没有需要审查的新增或修改文件')
    } else {
        reviewTargets.forEach(({ status, path }) => {
            console.log(`[${status}] ${path}`)
        })
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

main()
