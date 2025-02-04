const {v4: uuidv4} = require('uuid')

const {cognito, deleteDefaultCard, eventually, generateRandomJpeg, sleep} = require('../../utils')
const {mutations, queries} = require('../../schema')

const imageData = generateRandomJpeg(8, 8)
const imageDataB64 = new Buffer.from(imageData).toString('base64')
const loginCache = new cognito.AppSyncLoginCache()

beforeAll(async () => {
  // yes, we need eight users to run this test
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
})
beforeEach(async () => await loginCache.clean())
afterAll(async () => await loginCache.reset())

test('PostViews card generation and format', async () => {
  const {client: ourClient, userId: ourUserId} = await loginCache.getCleanLogin()
  const {client: u1Client} = await loginCache.getCleanLogin()
  const {client: u2Client} = await loginCache.getCleanLogin()
  const {client: u3Client} = await loginCache.getCleanLogin()
  const {client: u4Client} = await loginCache.getCleanLogin()
  const {client: u5Client} = await loginCache.getCleanLogin()
  const {client: u6Client} = await loginCache.getCleanLogin()
  const {client: u7Client} = await loginCache.getCleanLogin()
  await deleteDefaultCard(ourClient)

  // we add a post
  const postId = uuidv4()
  await ourClient
    .mutate({mutation: mutations.addPost, variables: {postId, imageData: imageDataB64}})
    .then(({data}) => expect(data.addPost.postId).toBe(postId))

  // five distinct users view the post
  await u1Client.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId]}})
  await u2Client.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId]}})
  await u3Client.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId]}})
  await u4Client.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId]}})
  await u5Client.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId]}})

  // verify no card generated yet
  await sleep()
  await ourClient.query({query: queries.self}).then(({data: {self: user}}) => {
    expect(user.userId).toBe(ourUserId)
    expect(user.cardCount).toBe(0)
    expect(user.cards.items).toHaveLength(0)
  })

  // a sixth user views the post
  await u6Client.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId]}})

  // verify a card was generated, check format
  const cardId = await eventually(async () => {
    const {data} = await ourClient.query({query: queries.self})
    expect(data.self.userId).toBe(ourUserId)
    expect(data.self.cardCount).toBe(1)
    expect(data.self.cards.items).toHaveLength(1)
    let card = data.self.cards.items[0]
    expect(card.cardId).toBeTruthy()
    expect(card.title).toBe('You have new views')
    expect(card.subTitle).toBeNull()
    expect(card.action).toMatch(RegExp('^https://real.app/user/.*/post/.*/views'))
    expect(card.action).toContain(postId)
    expect(card.thumbnail).toBeTruthy()
    expect(card.thumbnail.url64p).toMatch(RegExp('^https://.*.jpg'))
    expect(card.thumbnail.url480p).toMatch(RegExp('^https://.*.jpg'))
    expect(card.thumbnail.url1080p).toMatch(RegExp('^https://.*.jpg'))
    expect(card.thumbnail.url4k).toMatch(RegExp('^https://.*.jpg'))
    expect(card.thumbnail.url).toMatch(RegExp('^https://.*.jpg'))
    expect(card.thumbnail.url64p).toContain(postId)
    expect(card.thumbnail.url480p).toContain(postId)
    expect(card.thumbnail.url1080p).toContain(postId)
    expect(card.thumbnail.url4k).toContain(postId)
    expect(card.thumbnail.url).toContain(postId)
    return card.cardId
  })

  // we dismiss the card
  await ourClient
    .mutate({mutation: mutations.deleteCard, variables: {cardId}})
    .then(({data}) => expect(data.deleteCard.cardId).toBe(cardId))

  // a seventh user views the post
  await u7Client.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId]}})

  // verify no card generated (card only generates once per post)
  await sleep()
  await ourClient.query({query: queries.self}).then(({data: {self: user}}) => {
    expect(user.userId).toBe(ourUserId)
    expect(user.cardCount).toBe(0)
    expect(user.cards.items).toHaveLength(0)
  })
})
