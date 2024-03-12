import * as core from '@actions/core'
import * as github from '@actions/github'
import glob from '@actions/glob'
import { lstatSync, readFileSync } from 'fs'
import path from 'path'
import md5File from 'md5-file'

export const uploadReleaseArtifacts = async (
  client: github.GitHub,
  uploadUrl: string,
  files: string[],
): Promise<void> => {
  core.startGroup('Uploading release artifacts')
  for (const fileGlob of files) {
    const globber = await glob.create(fileGlob)
    const paths = await globber.glob()
    if (paths.length == 0) {
      core.error(`${fileGlob} doesn't match any files`)
    }

    for (const filePath of paths) {
      core.info(`Uploading: ${filePath}`)
      const nameWithExt = path.basename(filePath)
      const uploadArgs = {
        url: uploadUrl,
        headers: {
          'content-length': lstatSync(filePath).size,
          'content-type': 'application/octet-stream',
        },
        name: nameWithExt,
        file: readFileSync(filePath),
      }

      try {
        await client.repos.uploadReleaseAsset(uploadArgs)
      } catch (err: unknown) {
        if (err instanceof Error) {
          core.info(
            `Problem uploading ${filePath} as a release asset (${err.message}). Will retry with the md5 hash appended to the filename.`,
          )
        }
        const hash = await md5File(filePath)
        const basename = path.basename(filePath, path.extname(filePath))
        const ext = path.extname(filePath)
        const newName = `${basename}-${hash}${ext}`
        await client.repos.uploadReleaseAsset({
          ...uploadArgs,
          name: newName,
        })
      }
    }
  }
  core.endGroup()
}
