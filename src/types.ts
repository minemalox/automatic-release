export type Inputs = {
  repoToken: string
  releaseVersion: string
  lastTagName: string
  automaticReleaseTag: boolean
  draftRelease: boolean
  preRelease: boolean
  releaseTitle: string
  files: string[]
  ignoreAuthors: string[]
}
