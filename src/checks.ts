import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import type { CheckResult } from './type.js'

async function hasLocalDependency(projectPath: string, packageName: string): Promise<boolean> {
  try {
    const packageJson = JSON.parse(await readFile(path.join(projectPath, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string>
    }
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies, ...packageJson.peerDependencies }
    if (dependencies[packageName]) return true
  } catch { /* Continue with node_modules. */ }
  try {
    await access(path.join(projectPath, 'node_modules', packageName, 'package.json'))
    return true
  } catch { return false }
}

export async function resolveTypeCheckCommand(projectPath: string): Promise<{ command: string; args: string[] }> {
  const checker = await hasLocalDependency(projectPath, 'vue-tsc') ? 'vue-tsc' : 'tsc'
  const checkerArgs = `--no-install ${checker} -b --noEmit --pretty false`
  return {
    command: process.platform === 'win32' ? 'cmd.exe' : 'npx',
    args: process.platform === 'win32' ? ['/d', '/s', '/c', `npx ${checkerArgs}`] : checkerArgs.split(' '),
  }
}

export async function runTypeCheck(projectPath: string): Promise<CheckResult> {
  const { command, args } = await resolveTypeCheckCommand(projectPath)
  return new Promise((resolve) => {
    execFile(command, args, { cwd: projectPath, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      const output = [stdout, stderr].filter(Boolean).join('\n').trim()
      resolve({ name: 'TypeScript', status: error ? 'failed' : 'passed', output: error ? output || error.message : output || '未发现 TypeScript 类型错误。' })
    })
  })
}

export function runEslintCheck(projectPath: string): Promise<CheckResult> {
  return new Promise((resolve) => {
    const command = process.platform === 'win32' ? 'cmd.exe' : 'npx'
    const args = process.platform === 'win32'
      ? ['/d', '/s', '/c', 'pnpm exec eslint .']
      : ['--no-install', 'eslint', '.']
    execFile(command, args, { cwd: projectPath, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      const output = [stdout, stderr].filter(Boolean).join('\n').trim()
      const hasWarnings = /\bwarning\b/i.test(output)
      const hasErrors = /\berror\b/i.test(output)
      resolve({ name: 'ESLint', status: error || hasErrors ? 'failed' : hasWarnings ? 'warning' : 'passed', output: output || (error ? error.message : '未发现 ESLint 问题。') })
    })
  })
}
