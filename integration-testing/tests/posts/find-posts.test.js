const {v4: uuidv4} = require('uuid')

const {cognito, eventually, generateRandomJpeg} = require('../../utils')
const {mutations, queries} = require('../../schema')

let anonClient
const imageBytes = generateRandomJpeg(300, 200)
const imageData = new Buffer.from(imageBytes).toString('base64')
const loginCache = new cognito.AppSyncLoginCache()

beforeAll(async () => {
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
})
beforeEach(async () => await loginCache.clean())
afterAll(async () => await loginCache.reset())
afterEach(async () => {
  if (anonClient) await anonClient.mutate({mutation: mutations.deleteUser})
  anonClient = null
})

test('Add post with keywords attribute', async () => {
  const {client: ourClient, userId: ourUserId} = await loginCache.getCleanLogin()
  const {client: theirClient, userId: theirUserId} = await loginCache.getCleanLogin()

  const [postId1, postId2, postId3] = [uuidv4(), uuidv4(), uuidv4()]
  let keywords = ['mine', 'bird', 'tea']

  // Add three posts
  await ourClient
    .mutate({mutation: mutations.addPost, variables: {postId: postId1, imageData, keywords}})
    .then(({data: {addPost: post}}) => {
      expect(post.postId).toBe(postId1)
      expect(post.keywords.sort()).toEqual(keywords.sort())
    })

  keywords = ['tea', 'bird', 'here']
  await theirClient
    .mutate({mutation: mutations.addPost, variables: {postId: postId2, imageData, keywords}})
    .then(({data: {addPost: post}}) => {
      expect(post.postId).toBe(postId2)
      expect(post.keywords.sort()).toEqual(keywords.sort())
    })

  keywords = ['shirt', 'bug', 'bird', 'here']
  await theirClient
    .mutate({mutation: mutations.addPost, variables: {postId: postId3, imageData, keywords}})
    .then(({data: {addPost: post}}) => {
      expect(post.postId).toBe(postId3)
      expect(post.keywords.sort()).toEqual(keywords.sort())
    })

  keywords = 'shirt'
  await eventually(async () => {
    const {data} = await ourClient.query({query: queries.findPosts, variables: {keywords}})
    expect(data.findPosts.items).toHaveLength(1)
    expect(data.findPosts.items.map((post) => post.postId)).toEqual([postId3])
    expect(data.findPosts.items.map((post) => post.postedBy.userId)).toEqual([theirUserId])
  })

  keywords = 'shirt min'
  await ourClient.query({query: queries.findPosts, variables: {keywords}}).then(({data: {findPosts: posts}}) => {
    expect(posts.items).toHaveLength(2)
    expect(posts.items.map((post) => post.postId).sort()).toEqual([postId1, postId3].sort())
    expect(posts.items.map((post) => post.postedBy.userId).sort()).toEqual([ourUserId, theirUserId].sort())
  })

  // find with empty keywords
  keywords = '  '
  await expect(ourClient.query({query: queries.findPosts, variables: {keywords}})).rejects.toThrow(
    /ClientError: Empty keywords are not allowed/,
  )
})
