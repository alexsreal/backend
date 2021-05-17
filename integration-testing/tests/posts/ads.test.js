const {v4: uuidv4} = require('uuid')

const {cognito, eventually, generateRandomJpeg, sleep} = require('../../utils')
const {mutations, queries} = require('../../schema')

const imageBytes = generateRandomJpeg(8, 8)
const imageData = new Buffer.from(imageBytes).toString('base64')
const loginCache = new cognito.AppSyncLoginCache()

describe('Add an ad post', () => {
  let client

  beforeAll(async () => {
    loginCache.addCleanLogin(await cognito.getAppSyncLogin())
    ;({client} = await loginCache.getCleanLogin())
  })
  afterAll(async () => await loginCache.reset())

  test('Can add a non-ad post', async () => {
    const postId = uuidv4()
    await client
      .mutate({mutation: mutations.addPost, variables: {postId, imageData}})
      .then(({data}) => expect(data.addPost.postId).toBe(postId))
    await eventually(async () => {
      const {data} = await client.query({query: queries.post, variables: {postId}})
      expect(data.post.postId).toBe(postId)
      expect(data.post.postStatus).toBe('COMPLETED')
      expect(data.post.adStatus).toBe('NOT_AD')
      expect(data.post.adPayment).toBeNull()
    })
  })

  test.each([
    [{isAd: true}, 'Cannot add advertisement post without setting adPayment'],
    [{adPayment: 0.0}, 'Cannot add non-advertisement post with adPayment set'],
    [{isAd: false, adPayment: 1.1}, 'Cannot add non-advertisement post with adPayment set'],
  ])('Cannot add post with ad params: %p', async ({isAd, adPayment}, errorMsg) => {
    const postId = uuidv4()
    await client
      .mutate({mutation: mutations.addPost, variables: {postId, imageData, isAd, adPayment}, errorPolicy: 'all'})
      .then(({errors}) => {
        expect(errors).toHaveLength(1)
        expect(errors[0].message).toMatch(/^ClientError: /)
        expect(errors[0].message).toContain(errorMsg)
      })
    await sleep()
    await client.query({query: queries.post, variables: {postId}}).then(({data}) => expect(data.post).toBeNull())
  })

  test('Can add an ad post', async () => {
    const postId = uuidv4()
    const adPayment = Math.round(Math.random() * 1000 * 1000 * 1000) / 1000 / 1000
    await client
      .mutate({mutation: mutations.addPost, variables: {postId, imageData, isAd: true, adPayment}})
      .then(({data}) => expect(data.addPost.postId).toBe(postId))
    await eventually(async () => {
      const {data} = await client.query({query: queries.post, variables: {postId}})
      expect(data.post.postId).toBe(postId)
      expect(data.post.postStatus).toBe('COMPLETED')
      expect(data.post.adStatus).toBe('PENDING')
      expect(data.post.adPayment).toBe(adPayment)
    })
  })
})
