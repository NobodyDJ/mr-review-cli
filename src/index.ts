
import { execFile } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { ChangedFile, CheckResult } from './type.js'
import { reviewCode } from './kimi.js'

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
async function resolveTypeCheckCommand(projectPath: string): Promise<{ command: string; args: string[] }> {
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
async function runTypeCheck(projectPath: string): Promise<CheckResult> {
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
 * 审查项目
 * @param projectPath 
 * @param targetBranch 
 */
async function reviewProject(projectPath: string, targetBranch: string) {
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

	const diff = reviewTargets.length > 0
	? await getGitDiff(
		projectPath,
		targetBranch,
		reviewTargets.map(({ path }) => path),
		)
	: ''

	console.log('\n待审查文件：')
	if (reviewTargets.length === 0) {
		console.log('没有需要审查的新增或修改文件')
	} else {
		reviewTargets.forEach(({ status, path }) => {
			console.log(`[${status}] ${path}`)
		})
	}

	if (reviewTargets.length === 0) {
		console.log('跳过代码审查：没有符合条件的代码文件。')
		return
	}

	if (!diff.trim()) {
		console.log('没有发现符合条件的代码差异。')
		return
	}

	console.log('\n本次代码差异：')
	console.log(diff)

	console.log('\n========== Kimi 代码审查 ==========')

	try {
		const reviewResult = await reviewCode(diff)

		console.log('\n审查摘要：')
		console.log(reviewResult.summary)

		console.log('\n发现的问题：')

		if (reviewResult.issues.length === 0) {
			console.log('未发现明确的代码缺陷。')
		} else {
			for (const issue of reviewResult.issues) {
			console.log(`\n[${issue.severity}] ${issue.title}`)
			console.log(`文件：${issue.file}`)
			console.log(`行号：${issue.line ?? '未知'}`)
			console.log(`问题：${issue.description}`)
			console.log(`建议：${issue.suggestion}`)
			console.log(`依据：${issue.evidence}`)
			}
		}
	} catch (error: unknown) {
		console.error('\n[Kimi 审查失败]')

		if (error instanceof Error) {
			console.error(error.message)
		} else {
			console.error(error)
		}

		console.log('跳过 AI 审查，继续执行本地检查。')
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
	const projectPath = process.argv[2]
	const targetBranch = process.argv[3] || 'dev'
	const checkResults: CheckResult[] = []

	if (!projectPath) {
		console.error('请提供目标项目路径')
		console.error(
			'用法：npx tsx src/index.ts "<项目路径>" [目标分支]',
		)
		process.exitCode = 1
		return
	}

	try {
		const typeCheckResult = await runTypeCheck(projectPath);
		checkResults.push(typeCheckResult);

		console.log('\nTypeScript 检查结果：');
		console.log(
      		`[${typeCheckResult.status === 'passed' ? '通过' : typeCheckResult.status === 'warning' ? '警告' : '失败'}] ${typeCheckResult.name}`
		);

		if (typeCheckResult.output) {
			console.log(typeCheckResult.output);
		}

		const eslintResult = await runEslintCheck(projectPath);
		checkResults.push(eslintResult);

		console.log('\nESLint 检查结果：');
		console.log(
		`[${eslintResult.status === 'passed' ? '通过' : eslintResult.status === 'warning' ? '警告' : '失败'}] ${eslintResult.name}`,
		);

		if (eslintResult.output) {
			console.log(eslintResult.output);
		}

		console.log(`\n目标项目：${projectPath}`);
		console.log(`目标分支：${targetBranch}`);

		await reviewProject(projectPath, targetBranch);
		printCheckSummary(checkResults);

	} catch (error) {
		console.error(
			'执行审查失败：',
			error instanceof Error ? error.message : error,
		)
		process.exitCode = 1
	}
}

main()
