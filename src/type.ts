type ChangedFile = {
  status: string
  path: string
}

type CheckResult = {
  name: string
  passed: boolean
  output: string
}

export type { ChangedFile, CheckResult }