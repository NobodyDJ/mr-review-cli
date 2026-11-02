import { describe, expect, it } from 'vitest'
import { getReviewTargets, splitDiffIntoChunks } from '../git.js'

const fileDiff = (name: string, body = '+const value = 1'): string =>
  `diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n${body}`

describe('splitDiffIntoChunks', () => {
  it('空 diff 返回空数组', () => {
    expect(splitDiffIntoChunks('')).toEqual([])
  })

  it('按文件边界合并多个 diff', () => {
    const first = fileDiff('a.ts')
    const second = fileDiff('b.ts')

    const chunks = splitDiffIntoChunks(`${first}\n${second}`)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toContain(first)
    expect(chunks[0]).toContain(second)
  })

  it('超过批次限制时拆分文件', () => {
    const first = fileDiff('a.ts', `+${'a'.repeat(20_000)}`)
    const second = fileDiff('b.ts', `+${'b'.repeat(20_000)}`)

    expect(splitDiffIntoChunks(`${first}\n${second}`)).toHaveLength(2)
  })

  it('单个文件超过限制时抛出错误', () => {
    expect(() => splitDiffIntoChunks(fileDiff('large.ts', `+${'x'.repeat(35_000)}`)))
      .toThrow('单个文件的 diff 过大')
  })

  it('单个文件 diff 未超过限制时应该保持为一批', () => {
    const diff = fileDiff('a.ts', `+${'a'.repeat(1_000)}`)

    const chunks = splitDiffIntoChunks(diff)

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toBe(diff)
  })

  it('多个文件超过批次限制时应该保留所有文件内容', () => {
    const first = fileDiff('a.ts', `+${'a'.repeat(20_000)}`)
    const second = fileDiff('b.ts', `+${'b'.repeat(20_000)}`)

    const chunks = splitDiffIntoChunks(`${first}\n${second}`)

    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toContain('a.ts')
    expect(chunks[1]).toContain('b.ts')
  })

  it('单个文件 diff 恰好达到限制时不应该报错', () => {
    // diff 的固定部分也占字符，因此按实际长度补齐
    const prefix = fileDiff('boundary.ts', '')
    const diff = `${prefix}${'x'.repeat(35_000 - prefix.length)}`

    expect(diff).toHaveLength(35_000)
    expect(() => splitDiffIntoChunks(diff)).not.toThrow()
  })
})

describe('getReviewTargets', () => {
  it('只保留新增或修改的支持类型文件', () => {
    expect(getReviewTargets([
      { status: 'A', path: 'src/new.ts' },
      { status: 'M', path: 'src/app.vue' },
      { status: 'D', path: 'src/removed.ts' },
      { status: 'M', path: 'README.md' },
    ])).toEqual([
      { status: 'A', path: 'src/new.ts' },
      { status: 'M', path: 'src/app.vue' },
    ])
  })

  it('应该忽略重命名文件和不支持的文件类型', () => {
    expect(getReviewTargets([
      { status: 'R100', path: 'src/renamed.ts' },
      { status: 'M', path: 'src/data.json' },
      { status: 'M', path: 'src/style.css' },
      { status: 'M', path: 'src/component.TSX' },
    ])).toEqual([
      { status: 'M', path: 'src/component.TSX' },
    ])
  })
})
