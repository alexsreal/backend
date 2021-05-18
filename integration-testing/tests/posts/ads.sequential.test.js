/**
 * This test suite cannot run in parrallel with others because it
 * depends on global state - namely the 'real' user.
 */
const {v4: uuidv4} = require('uuid')

const {cognito, eventually, generateRandomJpeg, sleep} = require('../../utils')
const realUser = require('../../utils/real-user')
const {mutations, queries} = require('../../schema')

const imageBytes = generateRandomJpeg(8, 8)
const imageData = new Buffer.from(imageBytes).toString('base64')
const loginCache = new cognito.AppSyncLoginCache()
let realLogin

beforeAll(async () => {
  realLogin = await realUser.getLogin()
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
})
afterAll(async () => {
  await realUser.resetLogin()
  await loginCache.reset()
})

describe('Approving an ad post', () => {
  const postIdAd = uuidv4()
  const postIdNonAd = uuidv4()
  let client, realClient

  beforeAll(async () => {
    ;({client: realClient} = await realLogin)
    ;({client} = await loginCache.getCleanLogin())
    await client.mutate({
      mutation: mutations.addPost,
      variables: {postId: postIdAd, imageData, isAd: true, adPayment: 0.01},
    })
    await client.mutate({mutation: mutations.addPost, variables: {postId: postIdNonAd, imageData}})
  })
  afterAll(async () => {
    await realUser.resetLogin()
    await loginCache.reset()
  })

  test('Setup success', async () => {
    await eventually(async () => {
      const {data} = await client.query({query: queries.post, variables: {postId: postIdAd}})
      expect(data.post.postId).toBe(postIdAd)
      expect(data.post.adStatus).toBe('PENDING')
    })
    await eventually(async () => {
      const {data} = await client.query({query: queries.post, variables: {postId: postIdNonAd}})
      expect(data.post.postId).toBe(postIdNonAd)
      expect(data.post.adStatus).toBe('NOT_AD')
    })
  })

  test('Normal user cannot approve ad post', async () => {
    await client
      .mutate({mutation: mutations.approveAdPost, variables: {postId: postIdAd}, errorPolicy: 'all'})
      .then(({errors}) => {
        expect(errors).toHaveLength(1)
        expect(errors[0].message).toMatch(/^ClientError: /)
        expect(errors[0].message).toMatch(/User .* may not approve ads/)
      })
    await sleep()
    await client.query({query: queries.post, variables: {postId: postIdAd}}).then(({data}) => {
      expect(data.post.postId).toBe(postIdAd)
      expect(data.post.adStatus).toBe('PENDING')
    })
  })

  describe('a REAL admin, such as the REAL user', () => {
    test('can approve an ad post', async () => {
      await realClient
        .mutate({mutation: mutations.approveAdPost, variables: {postId: postIdAd}})
        .then(({data}) => expect(data.approveAdPost.adStatus).toBe('APPROVED'))
      await eventually(async () => {
        const {data} = await client.query({query: queries.post, variables: {postId: postIdAd}})
        expect(data.post.postId).toBe(postIdAd)
        expect(data.post.adStatus).toBe('APPROVED')
      })
    })

    test('cannot double approve an ad post', async () => {
      await realClient
        .mutate({mutation: mutations.approveAdPost, variables: {postId: postIdAd}, errorPolicy: 'all'})
        .then(({errors}) => {
          expect(errors).toHaveLength(1)
          expect(errors[0].message).toMatch(/^ClientError: /)
          expect(errors[0].message).toMatch(/Cannot approve post .* in adStatus `APPROVED`/)
        })
    })

    test('cannot approve a non-ad post', async () => {
      await realClient
        .mutate({mutation: mutations.approveAdPost, variables: {postId: postIdNonAd}, errorPolicy: 'all'})
        .then(({errors}) => {
          expect(errors).toHaveLength(1)
          expect(errors[0].message).toMatch(/^ClientError: /)
          expect(errors[0].message).toMatch(/Cannot approve post .* in adStatus `NOT_AD`/)
        })
    })

    test('cannot approve a post that does not exist', async () => {
      await realClient
        .mutate({mutation: mutations.approveAdPost, variables: {postId: uuidv4()}, errorPolicy: 'all'})
        .then(({errors}) => {
          expect(errors).toHaveLength(1)
          expect(errors[0].message).toMatch(/^ClientError: /)
          expect(errors[0].message).toMatch(/Post .* does not exist/)
        })
    })
  })
})
