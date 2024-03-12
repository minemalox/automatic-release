import * as process from 'process'
import * as path from 'path'
import nock from 'nock'
import fs from 'fs'
import { uploadReleaseArtifacts } from '../src/uploadReleaseArtifacts'
import { main } from '../src/main'
import * as core from '@actions/core'
import * as utils from '../src/utils'

jest.mock('../src/uploadReleaseArtifacts')

const mockedUploadReleaseArtifacts = uploadReleaseArtifacts as jest.MockedFunction<typeof uploadReleaseArtifacts>

const exportVariable = jest.spyOn(core, 'exportVariable')
const setOutput = jest.spyOn(core, 'setOutput')

describe('main handler processing automatic releases', () => {
  const testGhToken = 'fake-secret-token'
  const testGhSHA = 'f6f40d9fbd1130f7f2357bb54225567dbd7a3793'
  const testInputAutomaticReleaseTag = true
  const testInputNextReleaseTag = 'testingtaglatest'
  const testInputLastReleaseTag = 'testingtaglatest'
  const testInputDraft = false
  const testInputPrerelease = true
  const testInputTitle = 'Development Build'
  const testInputBody = `## 📄 Commits\n- f6f40d9: Fix all the bugs (Monalisa Octocat)`
  const testInputFiles = 'file1.txt\nfile2.txt\n*.jar\n\n'

  beforeEach(() => {
    jest.clearAllMocks()
    nock.disableNetConnect()
    process.env['INPUT_REPO_TOKEN'] = testGhToken
    process.env['INPUT_AUTOMATIC_RELEASE_TAG'] = testInputAutomaticReleaseTag.toString()
    process.env['INPUT_RELEASE_VERSION'] = testInputNextReleaseTag
    process.env['INPUT_LAST_RELEASE_TAG'] = testInputLastReleaseTag
    process.env['INPUT_DRAFT'] = testInputDraft.toString()
    process.env['INPUT_PRERELEASE'] = testInputPrerelease.toString()
    process.env['INPUT_TITLE'] = testInputTitle
    process.env['INPUT_FILES'] = testInputFiles

    process.env['GITHUB_EVENT_NAME'] = 'push'
    process.env['GITHUB_SHA'] = testGhSHA
    process.env['GITHUB_REF'] = 'refs/heads/automatic-pre-releaser'
    process.env['GITHUB_WORKFLOW'] = 'keybase'
    process.env['GITHUB_ACTION'] = 'self'
    process.env['GITHUB_ACTOR'] = 'marvinpinto'
    process.env['GITHUB_EVENT_PATH'] = path.join(__dirname, 'payloads', 'git-push.json')
    process.env['GITHUB_REPOSITORY'] = 'marvinpinto/private-actions-tester'

    mockedUploadReleaseArtifacts.mockImplementation().mockResolvedValue()
  })

  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
    delete process.env['INPUT_RELEASE_VERSION']
  })

  it('throws an error when "release_version" is not supplied', async () => {
    delete process.env.INPUT_RELEASE_VERSION
    await expect(main()).rejects.toThrow(
      'The parameter "release_version" was not set and this does not appear to be a GitHub tag event. (Event: refs/heads/automatic-pre-releaser)',
    )
  })

  it('throws an error when "GITHUB_EVENT_PATH" is not supplied', async () => {
    delete process.env.GITHUB_EVENT_PATH
    await expect(main()).rejects.toThrow('Environment variable GITHUB_EVENT_PATH does not appear to be set.')
  })

  it('should create a new release tag', async () => {
    delete process.env.INPUT_FILES
    const releaseUploadUrl = 'https://releaseupload.example.com'
    const compareCommitsPayload = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'payloads', 'compare-commits.json'), 'utf8'),
    )

    const getCommitsSinceRelease = nock('https://api.github.com')
      .matchHeader('authorization', `token ${testGhToken}`)
      .get(`/repos/marvinpinto/private-actions-tester/compare/HEAD...${testGhSHA}`)
      .reply(200, compareCommitsPayload)

    /* const getRef = nock('https://api.github.com')
      .matchHeader('authorization', `token ${testGhToken}`)
      .get(
        `/repos/marvinpinto/private-actions-tester/git/refs/tags%2F${testInputNextReleaseTag}`
      )
      .reply(404) */

    const listAssociatedPRs = nock('https://api.github.com')
      .matchHeader('authorization', `token ${testGhToken}`)
      .get(`/repos/marvinpinto/private-actions-tester/commits/${testGhSHA}/pulls`)
      .reply(200, [])

    const createRef = nock('https://api.github.com')
      .matchHeader('authorization', `token ${testGhToken}`)
      .post('/repos/marvinpinto/private-actions-tester/git/refs', {
        ref: `refs/tags/${testInputNextReleaseTag}`,
        sha: testGhSHA,
      })
      .reply(200)

    /* const getReleaseByTag = nock('https://api.github.com')
      .matchHeader('authorization', `token ${testGhToken}`)
      .get(
        `/repos/marvinpinto/private-actions-tester/releases/tags%2F${testInputLastReleaseTag}`
      )
      .reply(400) */

    const deleteRelease = nock('https://api.github.com')
      .matchHeader('authorization', `token ${testGhToken}`)
      .delete(/.*/)
      .reply(200)

    const createRelease = nock('https://api.github.com')
      .matchHeader('authorization', `token ${testGhToken}`)
      .post('/repos/marvinpinto/private-actions-tester/releases', {
        tag_name: testInputNextReleaseTag,
        name: testInputTitle,
        draft: testInputDraft,
        prerelease: testInputPrerelease,
        body: testInputBody,
      })
      .reply(200, {
        upload_url: releaseUploadUrl,
      })

    await main()

    expect(createRef.isDone()).toBe(true)
    // expect(getReleaseByTag.isDone()).toBe(true)
    expect(deleteRelease.isDone()).toBe(false)
    expect(createRelease.isDone()).toBe(true)
    // expect(getRef.isDone()).toBe(true)
    expect(getCommitsSinceRelease.isDone()).toBe(true)
    expect(listAssociatedPRs.isDone()).toBe(true)

    expect(mockedUploadReleaseArtifacts).toHaveBeenCalledTimes(1)
    expect(mockedUploadReleaseArtifacts.mock.calls[0][1]).toBe(releaseUploadUrl)
    // Should not attempt to upload any release artifacts, as there are none
    expect(mockedUploadReleaseArtifacts.mock.calls[0][2]).toEqual([])

    // Should populate the output env variable
    expect(exportVariable).toHaveBeenCalledTimes(1)
    expect(exportVariable).toHaveBeenCalledWith('AUTOMATIC_RELEASES_TAG', testInputNextReleaseTag)

    // Should output the releasetag and the release upload url
    expect(setOutput).toHaveBeenCalledTimes(2)
    expect(setOutput).toHaveBeenCalledWith('automatic_releases_tag', testInputNextReleaseTag)
    expect(setOutput).toHaveBeenCalledWith('upload_url', releaseUploadUrl)
  })

  it('should update an existing release tag', async () => {
    const previousReleaseSHA = '4398ef4ea6f5a61880ca94ecfb8e60d1a38497dd'
    // const foundReleaseId = 1235523222
    const releaseUploadUrl = 'https://releaseupload.example.com'
    const compareCommitsPayload = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'payloads', 'compare-commits.json'), 'utf8'),
    )
    const testInputBody = `## 📄 Commits\n- f6f40d9: Fix all the bugs (Monalisa Octocat) [#22](https://example.com/PR22)`

    const getPreviousReleaseSHA = nock('https://api.github.com')
      .matchHeader('authorization', `token ${testGhToken}`)
      .get(`/repos/marvinpinto/private-actions-tester/git/ref/tags%2F${testInputNextReleaseTag}`)
      .reply(200, {
        object: {
          sha: previousReleaseSHA,
        },
      })

    const getCommitsSinceRelease = nock('https://api.github.com')
      .matchHeader('authorization', `token ${testGhToken}`)
      .get(`/repos/marvinpinto/private-actions-tester/compare/${testInputNextReleaseTag}...${testGhSHA}`)
      .reply(200, compareCommitsPayload)

    const listAssociatedPRs = nock('https://api.github.com')
      .matchHeader('authorization', `token ${testGhToken}`)
      .get(`/repos/marvinpinto/private-actions-tester/commits/${testGhSHA}/pulls`)
      .reply(200, [{ number: '22', html_url: 'https://example.com/PR22' }])

    const createRef = nock('https://api.github.com')
      .matchHeader('authorization', `token ${testGhToken}`)
      .post('/repos/marvinpinto/private-actions-tester/git/refs', {
        ref: `refs/tags/${testInputNextReleaseTag}`,
        sha: testGhSHA,
      })
      .reply(400)

    const updateRef = nock('https://api.github.com')
      .matchHeader('authorization', `token ${testGhToken}`)
      .patch(`/repos/marvinpinto/private-actions-tester/git/refs/tags%2F${testInputNextReleaseTag}`, {
        sha: testGhSHA,
        force: true,
      })
      .reply(200)

    /* const getReleaseByTag = nock('https://api.github.com')
      .matchHeader('authorization', `token ${testGhToken}`)
      .get(
        `/repos/marvinpinto/private-actions-tester/releases/tags%2F${testInputNextReleaseTag}`
      )
      .reply(200, {
        id: foundReleaseId
      }) */

    /* const deleteRelease = nock('https://api.github.com')
      .matchHeader('authorization', `token ${testGhToken}`)
      .delete(
        `/repos/marvinpinto/private-actions-tester/releases/${foundReleaseId}`
      )
      .reply(200) */

    const createRelease = nock('https://api.github.com')
      .matchHeader('authorization', `token ${testGhToken}`)
      .post('/repos/marvinpinto/private-actions-tester/releases', {
        tag_name: testInputNextReleaseTag,
        name: testInputTitle,
        draft: testInputDraft,
        prerelease: testInputPrerelease,
        body: testInputBody,
      })
      .reply(200, {
        upload_url: releaseUploadUrl,
      })

    const dumpGitHubEventPayload = jest.spyOn(utils, 'dumpGitHubEventPayload')

    await main()

    expect(createRef.isDone()).toBe(true)
    expect(updateRef.isDone()).toBe(true)
    // expect(getReleaseByTag.isDone()).toBe(true)
    // expect(deleteRelease.isDone()).toBe(true)
    expect(createRelease.isDone()).toBe(true)
    expect(getPreviousReleaseSHA.isDone()).toBe(true)
    expect(getCommitsSinceRelease.isDone()).toBe(true)
    expect(listAssociatedPRs.isDone()).toBe(true)

    expect(mockedUploadReleaseArtifacts).toHaveBeenCalledTimes(1)
    expect(dumpGitHubEventPayload).toHaveBeenCalledTimes(1)

    expect(mockedUploadReleaseArtifacts.mock.calls[0][1]).toBe(releaseUploadUrl)
    expect(mockedUploadReleaseArtifacts.mock.calls[0][2]).toEqual(['file1.txt', 'file2.txt', '*.jar'])

    // Should populate the output env variable
    expect(exportVariable).toHaveBeenCalledTimes(1)
    expect(exportVariable).toHaveBeenCalledWith('AUTOMATIC_RELEASES_TAG', testInputNextReleaseTag)

    // Should output the releasetag and the release upload url
    expect(setOutput).toHaveBeenCalledTimes(2)
    expect(setOutput).toHaveBeenCalledWith('automatic_releases_tag', testInputNextReleaseTag)
    expect(setOutput).toHaveBeenCalledWith('upload_url', releaseUploadUrl)
  })
})
