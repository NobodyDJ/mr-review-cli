
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { resolveTypeCheckCommand, runTypeCheck } from '../index.js'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()

  return {
    ...actual,
    execFile: vi.fn(),
  }
})

beforeEach(() => {
  vi.mocked(execFile).mockReset()
})

describe('resolveTypeCheckCommand', () => {
    it('目标项目安装了 vue-tsc 时应该优先选择 vue-tsc', async () => {
        const projectPath = await mkdtemp(
        path.join(tmpdir(), 'mr-review-test-'),
        )

        try {
        await writeFile(
            path.join(projectPath, 'package.json'),
            JSON.stringify({
            devDependencies: {
                'vue-tsc': '^3.0.0',
            },
            }),
        )

        const result = await resolveTypeCheckCommand(projectPath)

        expect(result.args.join(' ')).toContain('vue-tsc')
        expect(result.args.join(' ')).toContain('--noEmit')
        expect(result.args.join(' ')).toContain('-b')
        } finally {
        await rm(projectPath, { recursive: true, force: true })
        }
    })

    it('目标项目没有 vue-tsc 时应该选择 tsc', async () => {
        const projectPath = await mkdtemp(
            path.join(tmpdir(), 'mr-review-test-'),
        )

        try {
            await writeFile(
            path.join(projectPath, 'package.json'),
            JSON.stringify({
                devDependencies: {
                typescript: '^5.5.0',
                },
            }),
            )

            const result = await resolveTypeCheckCommand(projectPath)

            expect(result.args.join(' ')).toContain('tsc')
            expect(result.args.join(' ')).not.toContain('vue-tsc')
            expect(result.args.join(' ')).toContain('--noEmit')
        } finally {
            await rm(projectPath, { recursive: true, force: true })
        }
    })

    it('package.json 未声明 vue-tsc 时，node_modules 中存在 vue-tsc 应该优先选择 vue-tsc', async () => {
        const projectPath = await mkdtemp(
            path.join(tmpdir(), 'mr-review-test-'),
        )

        try {
            await writeFile(
            path.join(projectPath, 'package.json'),
            JSON.stringify({
                    devDependencies: {
                    typescript: '^5.5.0',
                },
            }),
            )

            const vueTscPath = path.join(
                projectPath,
                'node_modules',
                'vue-tsc',
            )

            await mkdir(vueTscPath, { recursive: true })

            await writeFile(
            path.join(vueTscPath, 'package.json'),
            '{}',
            )

            const result = await resolveTypeCheckCommand(projectPath)

            expect(result.args.join(' ')).toContain('vue-tsc')
        } finally {
            await rm(projectPath, { recursive: true, force: true })
        }
    })
})


describe('runTypeCheck', () => {
  async function createProject() {
    const projectPath = await mkdtemp(
      path.join(tmpdir(), 'mr-review-test-'),
    )

    await writeFile(
      path.join(projectPath, 'package.json'),
      JSON.stringify({
        devDependencies: {
          typescript: '^5.5.0',
        },
      }),
    )

    return projectPath
  }

  it('类型检查成功时应该返回 passed', async () => {
    const projectPath = await createProject()

    vi.mocked(execFile).mockImplementation(((
      ...args: any[]
    ) => {
      const callback = args[args.length - 1]
      callback(null, 'TypeScript 检查通过', '')
      return {} as any
    }) as typeof execFile)

    try {
      const result = await runTypeCheck(projectPath)

      expect(result.status).toBe('passed')
      expect(result.output).toContain('TypeScript 检查通过')
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  it('类型检查失败时应该返回 failed 和错误信息', async () => {
    const projectPath = await createProject()

    vi.mocked(execFile).mockImplementation(((
      ...args: any[]
    ) => {
      const callback = args[args.length - 1]
      callback(new Error('类型检查失败'), '', 'TS2322 类型错误')
      return {} as any
    }) as typeof execFile)

    try {
      const result = await runTypeCheck(projectPath)

      expect(result.status).toBe('failed')
      expect(result.output).toContain('TS2322 类型错误')
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  it('检查成功但没有输出时应该返回默认提示', async () => {
    const projectPath = await createProject()

    vi.mocked(execFile).mockImplementation(((
      ...args: any[]
    ) => {
      const callback = args[args.length - 1]
      callback(null, '', '')
      return {} as any
    }) as typeof execFile)

    try {
      const result = await runTypeCheck(projectPath)

      expect(result.status).toBe('passed')
      expect(result.output).toBe('未发现 TypeScript 类型错误。')
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })
})
