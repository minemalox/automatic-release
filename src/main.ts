import * as core from '@actions/core'
import { run } from './run'
import { Inputs } from './types'

export const main = async (): Promise<void> => {
  const args: Inputs = {
    repoToken: core.getInput('repo_token', { required: true }),
    releaseVersion: core.getInput('release_version', { required: false }),
    lastTagName: core.getInput('last_release_tag', { required: false }),
    automaticReleaseTag: core.getInput('automatic_release_tag', { required: false }) === 'true',
    draftRelease: core.getInput('draft', { required: true }) === 'true',
    preRelease: core.getInput('prerelease', { required: true }) === 'true',
    releaseTitle: core.getInput('title', { required: false }),
    files: [] as string[],
    ignoreAuthors: [] as string[],
  }

  const inputFilesStr = core.getInput('files', { required: false })
  if (inputFilesStr) {
    args.files = inputFilesStr.split(/\r?\n/)
  }

  const ignoreAuthorsStr = core.getInput('ignore_authors', { required: false })
  if (ignoreAuthorsStr) {
    args.ignoreAuthors = ignoreAuthorsStr.split(/\r?\n/)
  }

  await run(args)
}

main().catch((e: Error) => {
  core.setFailed(e)
  console.error(e)
})
