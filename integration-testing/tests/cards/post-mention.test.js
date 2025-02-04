const {v4: uuidv4} = require('uuid')

const {cognito, deleteDefaultCard, eventually, generateRandomJpeg, sleep} = require('../../utils')
const {mutations, queries} = require('../../schema')

const imageData = generateRandomJpeg(8, 8)
const imageDataB64 = new Buffer.from(imageData).toString('base64')
const loginCache = new cognito.AppSyncLoginCache()

beforeAll(async () => {
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
})
beforeEach(async () => await loginCache.clean())
afterAll(async () => await loginCache.reset())

test('PostMention card generation and format for image post, fullfilling and dismissing card', async () => {
  const {client: ourClient, userId: ourUserId, username: ourUsername} = await loginCache.getCleanLogin()
  const {client: other1Client, userId: other1UserId, username: other1Username} = await loginCache.getCleanLogin()
  const {client: other2Client, userId: other2UserId, username: other2Username} = await loginCache.getCleanLogin()
  await Promise.all([other1Client, other2Client].map(deleteDefaultCard))

  // we add an image post and tag both users
  const postId = uuidv4()
  const text = `hey @${other1Username} and @${other2Username}, what's up?`
  await ourClient
    .mutate({mutation: mutations.addPost, variables: {postId, imageData: imageDataB64, text}})
    .then(({data}) => expect(data.addPost.postId).toBe(postId))

  // verify a card was generated for other1, check format
  const cardId1 = await eventually(async () => {
    const {data} = await other1Client.query({query: queries.self})
    expect(data.self.userId).toBe(other1UserId)
    expect(data.self.cardCount).toBe(1)
    expect(data.self.cards.items).toHaveLength(1)
    let card = data.self.cards.items[0]
    expect(card.cardId).toBeTruthy()
    expect(card.title).toMatch(RegExp('^@.* tagged you in a post'))
    expect(card.title).toContain(ourUsername)
    expect(card.subTitle).toBeNull()
    expect(card.action).toMatch(RegExp('^https://real.app/user/.*/post/.*'))
    expect(card.action).toContain(ourUserId)
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

  // verify a card was generated for other2, check format
  await other2Client.query({query: queries.self}).then(({data: {self: user}}) => {
    expect(user.userId).toBe(other2UserId)
    expect(user.cardCount).toBe(1)
    expect(user.cards.items).toHaveLength(1)
    let card = user.cards.items[0]
    expect(card.cardId).toBeTruthy()
    expect(card.title).toMatch(RegExp('^@.* tagged you in a post'))
    expect(card.title).toContain(ourUsername)
    expect(card.subTitle).toBeNull()
    expect(card.action).toMatch(RegExp('^https://real.app/user/.*/post/.*'))
    expect(card.action).toContain(ourUserId)
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
  })

  // we view our post, verify no change to cards
  await ourClient.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId]}})
  await sleep()
  await other1Client.query({query: queries.self}).then(({data}) => expect(data.self.cardCount).toBe(1))
  await other2Client.query({query: queries.self}).then(({data}) => expect(data.self.cardCount).toBe(1))

  // other1 dismisses the card, verify gone
  await other1Client
    .mutate({mutation: mutations.deleteCard, variables: {cardId: cardId1}})
    .then(({data}) => expect(data.deleteCard.cardId).toBe(cardId1))
  await eventually(async () => {
    const {data} = await other1Client.query({query: queries.self})
    expect(data.self.cardCount).toBe(0)
  })

  // other2 views the post, verify card disappears
  await other2Client.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId]}})
  await eventually(async () => {
    const {data} = await other1Client.query({query: queries.self})
    expect(data.self.cardCount).toBe(0)
  })
})

test('PostMention card generation for editing text-only post, post deletion', async () => {
  const {client: ourClient, userId: ourUserId, username: ourUsername} = await loginCache.getCleanLogin()
  const {client: other1Client, userId: other1UserId, username: other1Username} = await loginCache.getCleanLogin()
  const {client: other2Client, userId: other2UserId, username: other2Username} = await loginCache.getCleanLogin()
  await Promise.all([other1Client, other2Client].map(deleteDefaultCard))

  // we add a text-only post and tag one user
  const postId = uuidv4()
  await ourClient
    .mutate({
      mutation: mutations.addPost,
      variables: {postId, postType: 'TEXT_ONLY', text: `hey @${other1Username}, what's up?`},
    })
    .then(({data}) => expect(data.addPost.text).toContain(other1Username))

  // verify a card was generated for only tagged user, check format
  await eventually(async () => {
    const {data} = await other1Client.query({query: queries.self})
    expect(data.self.userId).toBe(other1UserId)
    expect(data.self.cardCount).toBe(1)
    expect(data.self.cards.items).toHaveLength(1)
    let card = data.self.cards.items[0]
    expect(card.cardId).toBeTruthy()
    expect(card.title).toMatch(RegExp('^@.* tagged you in a post'))
    expect(card.title).toContain(ourUsername)
    expect(card.subTitle).toBeNull()
    expect(card.action).toMatch(RegExp('^https://real.app/user/.*/post/.*'))
    expect(card.action).toContain(ourUserId)
    expect(card.action).toContain(postId)
    expect(card.thumbnail).toBeNull()
  })
  await other2Client.query({query: queries.self}).then(({data: {self: user}}) => {
    expect(user.cardCount).toBe(0)
    expect(user.cards.items).toHaveLength(0)
  })

  // we edit the text on the post to now tag the other user
  await ourClient
    .mutate({
      mutation: mutations.editPost,
      variables: {postId, text: `hey @${other2Username}, what's up?`},
    })
    .then(({data}) => expect(data.editPost.text).toContain(other2Username))

  // verify a card was generated for other2, check format, and that the first card still exists
  await eventually(async () => {
    const {data} = await other2Client.query({query: queries.self})
    expect(data.self.userId).toBe(other2UserId)
    expect(data.self.cardCount).toBe(1)
    expect(data.self.cards.items).toHaveLength(1)
    let card = data.self.cards.items[0]
    expect(card.cardId).toBeTruthy()
    expect(card.title).toMatch(RegExp('^@.* tagged you in a post'))
    expect(card.title).toContain(ourUsername)
    expect(card.subTitle).toBeNull()
    expect(card.action).toMatch(RegExp('^https://real.app/user/.*/post/.*'))
    expect(card.action).toContain(ourUserId)
    expect(card.action).toContain(postId)
    expect(card.thumbnail).toBeNull()
  })
  await other1Client.query({query: queries.self}).then(({data}) => expect(data.self.cardCount).toBe(1))

  // we delete our post, verify the two cards disappear
  await ourClient
    .mutate({mutation: mutations.deletePost, variables: {postId}})
    .then(({data}) => expect(data.deletePost.postStatus).toBe('DELETING'))
  await eventually(async () => {
    const {data} = await other1Client.query({query: queries.self})
    expect(data.self.cardCount).toBe(0)
  })
  await eventually(async () => {
    const {data} = await other2Client.query({query: queries.self})
    expect(data.self.cardCount).toBe(0)
  })
})
