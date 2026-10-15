type ChangedFile = {
  status: string
  path: string
}

type CheckResult = {
  name: string
  status: 'passed' | 'warning' | 'failed'
  output: string
}

export type { ChangedFile, CheckResult }