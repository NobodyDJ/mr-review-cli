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
})
