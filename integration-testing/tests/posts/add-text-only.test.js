/* eslint-env jest */

const uuidv4 = require('uuid/v4')

const cognito = require('../../utils/cognito.js')
const { mutations } = require('../../schema')

const loginCache = new cognito.AppSyncLoginCache()

beforeAll(async () => {
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
})

beforeEach(async () => await loginCache.clean())
afterAll(async () => await loginCache.clean())


test('Add text-only post failures', async () => {
  const [ourClient] = await loginCache.getCleanLogin()

  // verify can't use setAsUserPhoto with TEXT_ONLY posts
  let variables = {postId: uuidv4(), postType: 'TEXT_ONLY', text: 't', setAsUserPhoto: true}
  await expect(ourClient.mutate({mutation: mutations.addPost, variables}))
    .rejects.toThrow(/ClientError: Cannot .* with setAsUserPhoto$/)

  // verify can't use image_input with TEXT_ONLY posts
  variables = {postId: uuidv4(), postType: 'TEXT_ONLY', text: 't', takenInReal: true}
  await expect(ourClient.mutate({mutation: mutations.addPost, variables}))
    .rejects.toThrow(/ClientError: Cannot .* with ImageInput$/)

  // verify can't add TEXT_ONLY post with text
  variables = {postId: uuidv4(), postType: 'TEXT_ONLY'}
  await expect(ourClient.mutate({mutation: mutations.addPost, variables}))
    .rejects.toThrow(/ClientError: Cannot .* without text$/)
})


test('Add text-only post', async () => {
  const [ourClient] = await loginCache.getCleanLogin()

  const postId = uuidv4()
  const text = 'zeds dead baby, zeds dead'

  let variables = {postId, text, postType: 'TEXT_ONLY'}
  let resp = await ourClient.mutate({mutation: mutations.addPost, variables})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['addPost']['postId']).toBe(postId)
  expect(resp['data']['addPost']['postType']).toBe('TEXT_ONLY')
  expect(resp['data']['addPost']['postStatus']).toBe('COMPLETED')
  expect(resp['data']['addPost']['text']).toBe(text)
  expect(resp['data']['addPost']['isVerified']).toBeNull()
  expect(resp['data']['addPost']['image']).toBeNull()
  expect(resp['data']['addPost']['imageUploadUrl']).toBeNull()
})
