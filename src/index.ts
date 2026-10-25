import { execFile } from 'node:child_process'
import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ChangedFile, CheckResult, ProjectReviewResult } from './type.js'
import { reviewCode } from './kimi.js'
import { pathToFileURL } from 'node:url'

/**
 * 单个 AI 审查批次的最大 Diff 字符数。
 *
 * reviewCode() 中还有 40,000 字符的硬限制，
 * 因此这里留出一定余量。
 */
const MAX_REVIEW_DIFF_CHARS = 35_000

function getGitDiff(
  projectPath: string,
  targetBranch: string,
  filePaths: string[],
): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(
		'git',
		['diff', `${targetBranch}...HEAD`, '--', ...filePaths],
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
 * 根据 Git diff 的文件边界拆分审查内容。
 *
 * 尽量保证一个文件的 diff 不被拆开，
 * 多个文件可以合并到同一个批次。
 */
export function splitDiffIntoChunks(diff: string): string[] {
  const fileDiffs = diff
    .split(/(?=^diff --git )/m)
    .filter((fileDiff) => fileDiff.trim())

  if (fileDiffs.length === 0) {
    return []
  }

  const chunks: string[] = []
  let currentChunk = ''

  for (const fileDiff of fileDiffs) {
    // 单个文件的 diff 超过限制时，暂时无法按文件边界拆分
    if (fileDiff.length > MAX_REVIEW_DIFF_CHARS) {
      throw new Error(
        `单个文件的 diff 过大：${fileDiff.length} 字符，` +
        `超过单批次限制 ${MAX_REVIEW_DIFF_CHARS} 字符。`,
      )
    }

    const nextChunk = currentChunk
      ? `${currentChunk}\n${fileDiff}`
      : fileDiff

    if (nextChunk.length > MAX_REVIEW_DIFF_CHARS) {
      chunks.push(currentChunk)
      currentChunk = fileDiff
    } else {
      currentChunk = nextChunk
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk)
  }

  return chunks
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
		})
	})
}

/**
 * 获取需要评审的文件列表
 * @param files 
 * @returns 
 */
function getReviewTargets(files: ChangedFile[]): ChangedFile[] {
	const codeExtensions = new Set([
		'.ts',
		'.tsx',
		'.js',
		'.jsx',
		'.vue',
	])

	return files.filter(({ status, path }) => {
		if (status !== 'M' && status !== 'A') {
			return false
		}

		const extension = path.slice(path.lastIndexOf('.')).toLowerCase()
		return codeExtensions.has(extension)
	})
}

/**
 * 运行 TypeScript 类型检查
 * @param projectPath 项目路径
 * @returns 
 */
/**
 * 判断目标项目是否安装了指定的本地依赖。
 * @param projectPath 目标项目路径
 * @param packageName 依赖包名称
 * @returns 是否存在本地依赖
 */
async function hasLocalDependency(projectPath: string, packageName: string): Promise<boolean> {
	try {
		const packageJson = JSON.parse(
			await readFile(path.join(projectPath, 'package.json'), 'utf8'),
		) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string> }
		const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies, ...packageJson.peerDependencies }
		if (dependencies[packageName]) return true
	} catch {
		// package.json 不存在或格式无效时，继续检查 node_modules。
	}

	try {
		await access(path.join(projectPath, 'node_modules', packageName, 'package.json'))
		return true
	} catch {
		return false
	}
}

/**
 * 根据目标项目安装的依赖选择类型检查器。
 * @param projectPath 目标项目路径
 * @returns 类型检查命令及参数
 */
export async function resolveTypeCheckCommand(projectPath: string): Promise<{ command: string; args: string[] }> {
	const checker = await hasLocalDependency(projectPath, 'vue-tsc') ? 'vue-tsc' : 'tsc'
	// Vite projects commonly use a root tsconfig that only contains project
	// references.  Plain `tsc` treats that config as having no input files and
	// exits successfully without checking the referenced application config.
	// Build mode follows those references while --noEmit keeps this check read-only.
	const checkerArgs = `--no-install ${checker} -b --noEmit --pretty false`

	return {
		command: process.platform === 'win32' ? 'cmd.exe' : 'npx',
		args: process.platform === 'win32'
			? ['/d', '/s', '/c', `npx ${checkerArgs}`]
			: checkerArgs.split(' '),
	}
}

/**
 * 运行 TypeScript 类型检查，不生成编译文件。
 * @param projectPath 目标项目路径
 * @returns TypeScript 检查结果
 */
export async function runTypeCheck(projectPath: string): Promise<CheckResult> {
	const { command, args } = await resolveTypeCheckCommand(projectPath)
	return new Promise((resolve) => {
		execFile(command, args, {
			cwd: projectPath,
			windowsHide: true,
			maxBuffer: 10 * 1024 * 1024,
		}, (error, stdout, stderr) => {
			const output = [stdout, stderr]
				.filter(Boolean)
				.join('\n')
				.trim()

			resolve({
				name: 'TypeScript',
				status: error ? 'failed' : 'passed',
				output: error
					? output || error.message
					: output || '未发现 TypeScript 类型错误。',
			})
		})
	})
}


/**
 * 运行 ESLint 检查
 * @param projectPath 目标项目路径
 * @returns ESLint 检查结果
 */
function runEslintCheck(
  projectPath: string,
): Promise<CheckResult> {
  return new Promise((resolve) => {
    const command =
			process.platform === 'win32' ? 'cmd.exe' : 'npx'

		const args =
			process.platform === 'win32'
				? ['/d', '/s', '/c', 'pnpm exec eslint .']
				: ['exec', 'eslint', '.']

    execFile(
      command,
      args,
      {
        cwd: projectPath,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const output = [stdout, stderr]
          .filter(Boolean)
          .join('\n')
          .trim();
          
        const hasWarnings = /\bwarning\b/i.test(output)
        const hasErrors = /\berror\b/i.test(output)

        resolve({
          name: 'ESLint',
          status: error || hasErrors
            ? 'failed'
            : hasWarnings
              ? 'warning'
              : 'passed',
          output:
            output ||
            (error ? error.message : '未发现 ESLint 问题。'),
        });
      },
    );
  });
}


/**
 * 审查项目并返回结构化结果
 */

/**
 * 审查项目并返回结构化结果
 */
async function reviewProject(
  projectPath: string,
  targetBranch: string,
): Promise<ProjectReviewResult> {
  const emptyIssues: ProjectReviewResult['issues'] = []

  let filesWithStatus: ChangedFile[]

  // 第一步：获取变更文件列表
  try {
    filesWithStatus = await getChangedFilesWithStatus(
      projectPath,
      targetBranch,
    )
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)

    console.error('\n[Git 获取变更文件失败]')
    console.error(errorMessage)

    return {
      status: 'failed',
      summary: '获取 Git 变更文件失败。',
      issues: emptyIssues,
      error: errorMessage,
      changedFiles: [],
      reviewTargets: [],
    }
  }

  console.log('\n本次变更文件状态：')

  if (filesWithStatus.length === 0) {
    console.log('没有变更文件')
  } else {
    filesWithStatus.forEach(({ status, path }) => {
      console.log(`[${status}] ${path}`)
    })
  }

  // 第二步：筛选需要审查的文件
  const reviewTargets = getReviewTargets(filesWithStatus)

  console.log('\n待审查文件：')

  if (reviewTargets.length === 0) {
    console.log('没有需要审查的新增或修改文件')
  } else {
    reviewTargets.forEach(({ status, path }) => {
      console.log(`[${status}] ${path}`)
    })
  }

  // 没有符合条件的文件，跳过 AI 审查
  if (reviewTargets.length === 0) {
    console.log('跳过代码审查：没有符合条件的代码文件。')

    return {
      status: 'skipped',
      summary: '没有符合条件的代码文件。',
      issues: emptyIssues,
      changedFiles: filesWithStatus,
      reviewTargets,
    }
  }

  // 第三步：获取 Git diff
  let diff: string

  try {
    diff = await getGitDiff(
      projectPath,
      targetBranch,
      reviewTargets.map(({ path }) => path),
    )
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)

    console.error('\n[Git 获取 diff 失败]')
    console.error(errorMessage)

    return {
      status: 'failed',
      summary: '获取 Git diff 失败。',
      issues: emptyIssues,
      error: errorMessage,
      changedFiles: filesWithStatus,
      reviewTargets,
    }
  }

  // diff 为空，跳过 AI 审查
  if (!diff.trim()) {
    console.log('没有发现符合条件的代码差异。')

    return {
      status: 'skipped',
      summary: '没有发现符合条件的代码差异。',
      issues: emptyIssues,
      changedFiles: filesWithStatus,
      reviewTargets,
    }
  }

  console.log('\n本次代码差异：')
  console.log(diff)

  console.log('\n========== Kimi 代码审查 ==========')

  // 第四步：拆分 Diff
  const diffChunks = splitDiffIntoChunks(diff)

  if (diffChunks.length === 0) {
    return {
      status: 'skipped',
      summary: '没有可供审查的代码差异。',
      issues: emptyIssues,
      changedFiles: filesWithStatus,
      reviewTargets,
    }
  }

  console.log(
    `\n本次 Diff 共 ${diff.length} 字符，拆分为 ${diffChunks.length} 个审查批次。`,
  )

  // 第五步：逐批调用 AI，并合并审查结果
  try {
    const mergedIssues: ProjectReviewResult['issues'] = []
    const summaries: string[] = []

    for (let i = 0; i < diffChunks.length; i++) {
      const chunk = diffChunks[i]

      console.log(
        `\n========== Kimi 审查：第 ${i + 1}/${diffChunks.length} 批 ==========`,
      )

      if (chunk === undefined) {
        continue
      }

      const reviewResult = await reviewCode(chunk)

      summaries.push(
        `第 ${i + 1} 批：${reviewResult.summary}`,
      )

      mergedIssues.push(...reviewResult.issues)

      console.log(reviewResult.summary)
      console.log(`本批发现 ${reviewResult.issues.length} 个问题。`)
    }

    const mergedSummary =
      diffChunks.length === 1
        ? summaries[0] ?? ''
        : `本次变更共分为 ${diffChunks.length} 批审查。\n${summaries.join('\n')}`

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

    return {
      status: 'completed',
      summary: mergedSummary,
      issues: mergedIssues,
      changedFiles: filesWithStatus,
      reviewTargets,
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)

    console.error('\n[Kimi 审查失败]')
    console.error(errorMessage)

    return {
      status: 'failed',
      summary: 'AI 代码审查失败。',
      issues: emptyIssues,
      error: errorMessage,
      changedFiles: filesWithStatus,
      reviewTargets,
    }
  }

}


/**
 * 打印检查摘要
 * @param results 
 */
function printCheckSummary(results: CheckResult[]): void {
  console.log('\n========== 检查汇总 ==========');

  results.forEach((result) => {
    console.log(
      `[${result.status === 'passed' ? '通过' : result.status === 'warning' ? '警告' : '失败'}] ${result.name}`,
    );
  });

  const failedCount = results.filter(
    (result) => result.status === 'failed',
  ).length;

  console.log(`检查项：${results.length}`);
  console.log(`失败项：${failedCount}`);
}



async function main() {
  const args = process.argv.slice(2)
  const projectPath = args[0]

  const targetBranch =
    args[1] && !args[1].startsWith('--') ? args[1] : 'dev'

  const outputIndex = args.indexOf('--output')
  const outputPath =
    outputIndex !== -1 ? args[outputIndex + 1] : undefined

  const checkResults: CheckResult[] = []

  if (!projectPath) {
    console.error('请提供目标项目路径')
    console.error(
      '用法：npx tsx src/index.ts "<项目路径>" [目标分支] [--output <报告路径>]',
    )
    process.exitCode = 1
    return
  }

  if (outputIndex !== -1 && !outputPath) {
    console.error('--output 后面必须提供报告文件路径')
    process.exitCode = 1
    return
  }

  try {
    const typeCheckResult = await runTypeCheck(projectPath)
    checkResults.push(typeCheckResult)

    console.log('\nTypeScript 检查结果：')
    console.log(
      `[${typeCheckResult.status === 'passed' ? '通过' : typeCheckResult.status === 'warning' ? '警告' : '失败'}] ${typeCheckResult.name}`,
    )
    if (typeCheckResult.output) {
      console.log(typeCheckResult.output)
    }

    const eslintResult = await runEslintCheck(projectPath)
    checkResults.push(eslintResult)

    console.log('\nESLint 检查结果：')
    console.log(
      `[${eslintResult.status === 'passed' ? '通过' : eslintResult.status === 'warning' ? '警告' : '失败'}] ${eslintResult.name}`,
    )
    if (eslintResult.output) {
      console.log(eslintResult.output)
    }

    console.log(`\n目标项目：${projectPath}`)
    console.log(`目标分支：${targetBranch}`)

    const reviewResult = await reviewProject(projectPath, targetBranch)

    printCheckSummary(checkResults)

    const hasFailedCheck = checkResults.some(
      (result) => result.status === 'failed',
    )

    const hasWarningCheck = checkResults.some(
      (result) => result.status === 'warning',
    )

    const hasReviewIssues = reviewResult.issues.length > 0

    let overallStatus: 'passed' | 'warning' | 'failed' = 'passed'
    if (hasFailedCheck || reviewResult.status === 'failed') {
      overallStatus = 'failed'
    } else if (hasWarningCheck || hasReviewIssues) {
      overallStatus = 'warning'
    }

    const report = {
      generatedAt: new Date().toISOString(),
      projectPath: path.resolve(projectPath),
      targetBranch,
      status: overallStatus,
      checks: checkResults,
      review: {
        status: reviewResult.status,
        summary: reviewResult.summary,
        issues: reviewResult.issues,
        error: reviewResult.error,
        changedFiles: reviewResult.changedFiles,
        reviewTargets: reviewResult.reviewTargets,
      },
    }

    if (outputPath) {
      const reportPath = path.resolve(outputPath)

      await writeFile(
        reportPath,
        JSON.stringify(report, null, 2),
        'utf8',
      )

      console.log(`\nJSON 报告已生成：${reportPath}`)
    }

    console.log(`\n整体审查状态：${overallStatus}`)

    if (overallStatus === 'failed') {
      process.exitCode = 1
    }
  } catch (error) {
    console.error(
      '执行审查失败：',
      error instanceof Error ? error.message : error,
    )
    process.exitCode = 1
  }
}


if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
