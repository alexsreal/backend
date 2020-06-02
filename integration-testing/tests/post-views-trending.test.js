/* eslint-env jest */

/**
 * This one test suite contains all calls to Mutate.reportPostViews()
 *
 * This is because calls to this mutation alter a global state - namely the
 * trending users/posts indexes. As such, all tests that call this mutaiton
 * have to be run sequentially, and one simple way to get that to happen
 * with jest is to put all the tests in the same test suite.
 */

const uuidv4 = require('uuid/v4')

const cognito = require('../utils/cognito.js')
const misc = require('../utils/misc.js')
const {mutations, queries} = require('../schema')

const imageData1 = misc.generateRandomJpeg(8, 8)
const imageData2 = misc.generateRandomJpeg(8, 8)
const imageData3 = misc.generateRandomJpeg(8, 8)
const imageData1B64 = new Buffer.from(imageData1).toString('base64')
const imageData2B64 = new Buffer.from(imageData2).toString('base64')
const imageData3B64 = new Buffer.from(imageData3).toString('base64')

const loginCache = new cognito.AppSyncLoginCache()

beforeAll(async () => {
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
})

beforeEach(async () => await loginCache.clean())
afterAll(async () => await loginCache.reset())

test('Report post views', async () => {
  const [ourClient] = await loginCache.getCleanLogin()
  const [other1Client, other1UserId] = await loginCache.getCleanLogin()
  const [other2Client, other2UserId] = await loginCache.getCleanLogin()

  // we add two posts
  const postId1 = uuidv4()
  const postId2 = uuidv4()
  let variables = {postId: postId1, imageData: imageData1B64}
  let resp = await ourClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId1)
  variables = {postId: postId2, imageData: imageData2B64}
  resp = await ourClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()

  // verify we have no post views
  resp = await ourClient.query({query: queries.self})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.self.postViewedByCount).toBe(0)

  // verify niether of the posts have views
  resp = await ourClient.query({query: queries.post, variables: {postId: postId1}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.post.viewedByCount).toBe(0)
  resp = await ourClient.query({query: queries.post, variables: {postId: postId2}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.post.viewedByCount).toBe(0)

  // other1 reports to have viewed both posts
  resp = await other1Client.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId1, postId2]}})
  expect(resp.errors).toBeUndefined()

  // other2 reports to have viewed one post
  resp = await other2Client.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId2]}})
  expect(resp.errors).toBeUndefined()

  // we report to have viewed both posts (should not be recorded on our own posts)
  resp = await other1Client.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId1, postId2]}})
  expect(resp.errors).toBeUndefined()

  // verify our view counts are correct
  resp = await ourClient.query({query: queries.self})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.self.postViewedByCount).toBe(3)

  // verify the two posts have the right viewed by counts
  resp = await ourClient.query({query: queries.post, variables: {postId: postId1}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.post.viewedByCount).toBe(1)
  resp = await ourClient.query({query: queries.post, variables: {postId: postId2}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.post.viewedByCount).toBe(2)

  // verify the two posts have the right viewedBy lists
  resp = await ourClient.query({query: queries.post, variables: {postId: postId1}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.post.viewedBy.items).toHaveLength(1)
  expect(resp.data.post.viewedBy.items[0].userId).toBe(other1UserId)
  resp = await ourClient.query({query: queries.post, variables: {postId: postId2}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.post.viewedBy.items).toHaveLength(2)
  expect(resp.data.post.viewedBy.items[0].userId).toBe(other1UserId)
  expect(resp.data.post.viewedBy.items[1].userId).toBe(other2UserId)
})

test('Cannot report post views if we are disabled', async () => {
  const [ourClient, ourUserId] = await loginCache.getCleanLogin()

  // we add a post
  const postId = uuidv4()
  let resp = await ourClient.mutate({mutation: mutations.addPost, variables: {postId, imageData: imageData1B64}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId)
  expect(resp.data.addPost.postStatus).toBe('COMPLETED')

  // we disable ourselves
  resp = await ourClient.mutate({mutation: mutations.disableUser})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.disableUser.userId).toBe(ourUserId)
  expect(resp.data.disableUser.userStatus).toBe('DISABLED')

  // verify we cannot report post views
  await expect(
    ourClient.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId]}}),
  ).rejects.toThrow(/ClientError: User .* is not ACTIVE/)
})

test('Post.viewedStatus', async () => {
  const [ourClient] = await loginCache.getCleanLogin()
  const [theirClient] = await loginCache.getCleanLogin()

  // we a posts
  const postId = uuidv4()
  let variables = {postId, imageData: imageData1B64}
  let resp = await ourClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId)
  expect(resp.data.addPost.viewedStatus).toBe('VIEWED')

  // verify they haven't viewed the post
  resp = await theirClient.query({query: queries.post, variables: {postId}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.post.postId).toBe(postId)
  expect(resp.data.post.viewedStatus).toBe('NOT_VIEWED')

  // they report to have viewed the post
  resp = await theirClient.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId]}})
  expect(resp.errors).toBeUndefined()

  // verify that's reflected in the viewedStatus
  resp = await theirClient.query({query: queries.post, variables: {postId}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.post.postId).toBe(postId)
  expect(resp.data.post.viewedStatus).toBe('VIEWED')
})

test('Report post views on non-completed posts are ignored', async () => {
  const [ourClient] = await loginCache.getCleanLogin()
  const [other1Client] = await loginCache.getCleanLogin()
  const [other2Client] = await loginCache.getCleanLogin()

  // add a pending post
  const postId1 = uuidv4()
  let variables = {postId: postId1}
  let resp = await ourClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId1)
  expect(resp.data.addPost.postStatus).toBe('PENDING')

  // add an archived post
  const postId2 = uuidv4()
  variables = {postId: postId2, imageData: imageData2B64}
  resp = await ourClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId2)
  resp = await ourClient.mutate({mutation: mutations.archivePost, variables: {postId: postId2}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.archivePost.postId).toBe(postId2)
  expect(resp.data.archivePost.postStatus).toBe('ARCHIVED')

  // other1 reports to have viewed both posts
  resp = await other1Client.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId1, postId2]}})
  expect(resp.errors).toBeUndefined()

  // other2 reports to have viewed one post
  resp = await other2Client.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId2]}})
  expect(resp.errors).toBeUndefined()

  // we report to have viewed both posts (should not be recorded on our own posts)
  resp = await other1Client.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId1, postId2]}})
  expect(resp.errors).toBeUndefined()

  // verify the two posts have no viewed by counts
  resp = await ourClient.query({query: queries.post, variables: {postId: postId1}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.post.viewedByCount).toBe(0)
  resp = await ourClient.query({query: queries.post, variables: {postId: postId2}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.post.viewedByCount).toBe(0)

  // verify there are no trending posts
  resp = await ourClient.query({query: queries.trendingPosts})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(0)
})

test('Post views are de-duplicated by user', async () => {
  const [ourClient] = await loginCache.getCleanLogin()
  const [other1Client] = await loginCache.getCleanLogin()
  const [other2Client] = await loginCache.getCleanLogin()

  // we add a post
  const postId = uuidv4()
  let variables = {postId, imageData: imageData1B64}
  let resp = await ourClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId)

  // other1 reports to have viewed that post twice
  resp = await other1Client.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId, postId]}})
  expect(resp.errors).toBeUndefined()

  // check counts de-duplicated
  resp = await ourClient.query({query: queries.self})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.self.postViewedByCount).toBe(1)

  resp = await ourClient.query({query: queries.post, variables: {postId: postId}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.post.viewedByCount).toBe(1)

  // other2 report to have viewed that post once
  resp = await other2Client.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId]}})
  expect(resp.errors).toBeUndefined()

  // check counts
  resp = await ourClient.query({query: queries.self})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.self.postViewedByCount).toBe(2)

  resp = await ourClient.query({query: queries.post, variables: {postId: postId}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.post.viewedByCount).toBe(2)

  // other1 report to have viewed that post yet again
  resp = await other1Client.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId, postId]}})
  expect(resp.errors).toBeUndefined()

  // check counts have not changed
  resp = await ourClient.query({query: queries.self})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.self.postViewedByCount).toBe(2)

  resp = await ourClient.query({query: queries.post, variables: {postId: postId}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.post.viewedByCount).toBe(2)
})

test('Report post views error conditions', async () => {
  const [ourClient] = await loginCache.getCleanLogin()

  // must report at least one view
  let variables = {postIds: []}
  await expect(ourClient.mutate({mutation: mutations.reportPostViews, variables})).rejects.toThrow(
    /ClientError: A minimum of 1 post id /,
  )

  // can't report more than 100 views
  variables = {
    postIds: Array(101)
      .fill()
      .map(() => uuidv4()),
  }
  await expect(ourClient.mutate({mutation: mutations.reportPostViews, variables})).rejects.toThrow(
    /ClientError: A max of 100 post ids /,
  )
})

test('resetUser deletes trending items', async () => {
  const [ourClient, ourUserId] = await loginCache.getCleanLogin()
  const [theirClient] = await loginCache.getCleanLogin()

  // we add a post
  const postId = uuidv4()
  let variables = {postId, imageData: imageData1B64, takenInReal: true}
  let resp = await ourClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId)

  // they view that post
  resp = await theirClient.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId]}})
  expect(resp.errors).toBeUndefined()

  // verify we now show up in the list of trending users
  resp = await theirClient.query({query: queries.trendingUsers})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingUsers.items).toHaveLength(1)
  expect(resp.data.trendingUsers.items[0].userId).toBe(ourUserId)

  // verify our post now shows up in the list of trending posts
  resp = await theirClient.query({query: queries.trendingPosts})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(1)
  expect(resp.data.trendingPosts.items[0].postId).toBe(postId)

  // we reset our user, should clear us & post from trending indexes
  await ourClient.mutate({mutation: mutations.resetUser})

  // verify we now do *not* show up in the list of trending users
  resp = await theirClient.query({query: queries.trendingUsers})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingUsers.items).toHaveLength(0)

  // verify our post now does *not* show up in the list of trending posts
  resp = await theirClient.query({query: queries.trendingPosts})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(0)
})

test('Order of trending users', async () => {
  /* Note that only the very first reporting of post views is immediately incoporated
   * into the trending users index, which limits our ability to externally test this well.
   */
  const [ourClient, ourUserId] = await loginCache.getCleanLogin()
  const [theirClient, theirUserId] = await loginCache.getCleanLogin()
  const [anotherClient] = await loginCache.getCleanLogin()

  // we add one post
  const postId = uuidv4()
  let variables = {postId, imageData: imageData1B64, takenInReal: true}
  let resp = await ourClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId)

  // they add two posts
  const postId1 = uuidv4()
  const postId2 = uuidv4()
  variables = {postId: postId1, imageData: imageData2B64, takenInReal: true}
  resp = await theirClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId1)
  variables = {postId: postId2, imageData: imageData3B64, takenInReal: true}
  resp = await theirClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId2)

  // verify no trending users
  resp = await ourClient.query({query: queries.trendingUsers})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingUsers.items).toHaveLength(0)

  // our one post gets viewed three times by the same person, while
  // their two posts each get one view
  let postIds = [postId, postId, postId, postId1, postId2]
  resp = await anotherClient.mutate({mutation: mutations.reportPostViews, variables: {postIds}})
  expect(resp.errors).toBeUndefined()

  // verify trending users has correct order
  resp = await ourClient.query({query: queries.trendingUsers})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingUsers.items).toHaveLength(2)
  expect(resp.data.trendingUsers.items[0].userId).toBe(theirUserId)
  expect(resp.data.trendingUsers.items[1].userId).toBe(ourUserId)
})

test('We do not see trending users that have blocked us, but see all others', async () => {
  const [ourClient, ourUserId] = await loginCache.getCleanLogin()
  const [other1Client] = await loginCache.getCleanLogin()
  const [other2Client] = await loginCache.getCleanLogin()

  // other1 blocks us
  let resp = await other1Client.mutate({mutation: mutations.blockUser, variables: {userId: ourUserId}})
  expect(resp.errors).toBeUndefined()

  // other1 adds a post
  const postId1 = uuidv4()
  let variables = {postId: postId1, imageData: imageData1B64, takenInReal: true}
  resp = await other1Client.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId1)

  // we add a post
  const postId2 = uuidv4()
  variables = {postId: postId2, imageData: imageData2B64, takenInReal: true}
  resp = await ourClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId2)

  // verify no trending users
  resp = await ourClient.query({query: queries.trendingUsers})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingUsers.items).toHaveLength(0)

  // all posts get viewed
  resp = await other2Client.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId1, postId2]}})
  expect(resp.errors).toBeUndefined()

  // verify trending users looks correct, including the items that are batch filled in
  resp = await ourClient.query({query: queries.trendingUsers})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingUsers.items).toHaveLength(1)
  expect(resp.data.trendingUsers.items[0].userId).toBe(ourUserId)
  expect(resp.data.trendingUsers.items[0].blockerStatus).toBe('SELF')
})

test('We see our own trending posts correctly', async () => {
  const [ourClient, ourUserId] = await loginCache.getCleanLogin()
  const [theirClient] = await loginCache.getCleanLogin()

  // we add two posts
  const postId1 = uuidv4()
  const postId2 = uuidv4()
  let variables = {postId: postId1, imageData: imageData1B64, takenInReal: true}
  let resp = await ourClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId1)
  variables = {postId: postId2, imageData: imageData2B64, takenInReal: true}
  resp = await ourClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId2)

  // verify no trending posts
  resp = await ourClient.query({query: queries.trendingPosts})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(0)

  // both posts get viewed
  resp = await theirClient.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId1, postId2]}})
  expect(resp.errors).toBeUndefined()
  await misc.sleep(2000) // let dynamo converge

  // verify trending posts looks correct, including the items that are batch filled in
  resp = await ourClient.query({query: queries.trendingPosts})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(2)

  // Note: no way to guarantee order in the trending post index,
  // because only the first view is immediately incorporated into the score.
  const firstPost = resp.data.trendingPosts.items[0]
  const secondPost = resp.data.trendingPosts.items[1]
  const post1 = firstPost.postId == postId1 ? firstPost : secondPost
  const post2 = secondPost.postId == postId2 ? secondPost : firstPost

  expect(post1.postId).toBe(postId1)
  expect(post1.postedBy.userId).toBe(ourUserId)
  expect(post1.postedBy.blockerStatus).toBe('SELF')
  expect(post1.postedBy.privacyStatus).toBe('PUBLIC')
  expect(post1.postedBy.followedStatus).toBe('SELF')

  expect(post2.postId).toBe(postId2)
  expect(post2.postedBy.userId).toBe(ourUserId)
  expect(post2.postedBy.blockerStatus).toBe('SELF')
  expect(post2.postedBy.privacyStatus).toBe('PUBLIC')
  expect(post2.postedBy.followedStatus).toBe('SELF')
})

test('Filter trendingPosts on viewedStatus', async () => {
  const [ourClient] = await loginCache.getCleanLogin()
  const [theirClient] = await loginCache.getCleanLogin()

  // we add a post
  const postId1 = uuidv4()
  let variables = {postId: postId1, imageData: imageData1B64, takenInReal: true}
  let resp = await ourClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId1)

  // they add a post
  const postId2 = uuidv4()
  variables = {postId: postId2, imageData: imageData2B64, takenInReal: true}
  resp = await theirClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId2)

  // they view both posts
  resp = await theirClient.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId1, postId2]}})
  expect(resp.errors).toBeUndefined()

  // check we see all trendingPosts by default, and ours appears viewed to us and theirs doesn't
  resp = await ourClient.query({query: queries.trendingPosts})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(2)

  // Note: no way to guarantee order in the trending post index,
  // because only the first view is immediately incorporated into the score.
  const firstPost = resp.data.trendingPosts.items[0]
  const secondPost = resp.data.trendingPosts.items[1]
  const post1 = firstPost.postId == postId1 ? firstPost : secondPost
  const post2 = secondPost.postId == postId2 ? secondPost : firstPost
  expect(post1.postId).toBe(postId1)
  expect(post2.postId).toBe(postId2)
  expect(post1.viewedStatus).toBe('VIEWED')
  expect(post2.viewedStatus).toBe('NOT_VIEWED')

  // check we can filter trending posts to just the ones we have viewed
  resp = await ourClient.query({query: queries.trendingPosts, variables: {viewedStatus: 'VIEWED'}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(1)
  expect(resp.data.trendingPosts.items[0].postId).toBe(postId1)
  expect(resp.data.trendingPosts.items[0].viewedStatus).toBe('VIEWED')

  // check we can filter trending posts to just the ones we have not viewed
  resp = await ourClient.query({query: queries.trendingPosts, variables: {viewedStatus: 'NOT_VIEWED'}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(1)
  expect(resp.data.trendingPosts.items[0].postId).toBe(postId2)
  expect(resp.data.trendingPosts.items[0].viewedStatus).toBe('NOT_VIEWED')

  // we report a view of the post we hadn't viewed
  resp = await ourClient.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId2]}})
  expect(resp.errors).toBeUndefined()
  await misc.sleep(2000) // let dynamo converge

  // check no posts now show up as not viewed
  resp = await ourClient.query({query: queries.trendingPosts, variables: {viewedStatus: 'NOT_VIEWED'}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(0)

  // check both posts now show up as viewed
  resp = await ourClient.query({query: queries.trendingPosts, variables: {viewedStatus: 'VIEWED'}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(2)
  expect(resp.data.trendingPosts.items.map((p) => p.postId).sort()).toEqual([postId1, postId2].sort())
  expect(resp.data.trendingPosts.items[0].viewedStatus).toBe('VIEWED')
  expect(resp.data.trendingPosts.items[1].viewedStatus).toBe('VIEWED')
})

test('We see public users trending posts correctly', async () => {
  const [ourClient] = await loginCache.getCleanLogin()
  const [other1Client, other1UserId] = await loginCache.getCleanLogin()
  const [other2Client, other2UserId] = await loginCache.getCleanLogin()

  // we follow other 1
  let resp = await ourClient.mutate({mutation: mutations.followUser, variables: {userId: other1UserId}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.followUser.followedStatus).toBe('FOLLOWING')

  // other 1 adds a post
  const postId1 = uuidv4()
  let variables = {postId: postId1, imageData: imageData1B64, takenInReal: true}
  resp = await other1Client.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId1)

  // other 2 adds a post
  const postId2 = uuidv4()
  variables = {postId: postId2, imageData: imageData2B64, takenInReal: true}
  resp = await other2Client.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId2)

  // verify no trending posts
  resp = await ourClient.query({query: queries.trendingPosts})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(0)

  // both posted get viewed
  resp = await ourClient.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId1, postId2]}})
  expect(resp.errors).toBeUndefined()

  // verify trending posts looks correct, including the items that are batch filled in
  resp = await ourClient.query({query: queries.trendingPosts})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(2)

  // Note: no way to guarantee order in the trending post index,
  // because only the first view is immediately incorporated into the score.
  const firstPost = resp.data.trendingPosts.items[0]
  const secondPost = resp.data.trendingPosts.items[1]
  const post1 = firstPost.postId == postId1 ? firstPost : secondPost
  const post2 = secondPost.postId == postId2 ? secondPost : firstPost

  expect(post1.postId).toBe(postId1)
  expect(post1.postedBy.userId).toBe(other1UserId)
  expect(post1.postedBy.blockerStatus).toBe('NOT_BLOCKING')
  expect(post1.postedBy.privacyStatus).toBe('PUBLIC')
  expect(post1.postedBy.followedStatus).toBe('FOLLOWING')

  expect(post2.postId).toBe(postId2)
  expect(post2.postedBy.userId).toBe(other2UserId)
  expect(post2.postedBy.blockerStatus).toBe('NOT_BLOCKING')
  expect(post2.postedBy.privacyStatus).toBe('PUBLIC')
  expect(post2.postedBy.followedStatus).toBe('NOT_FOLLOWING')
})

test('We see posts of private users in trending only if we are following them', async () => {
  const [ourClient] = await loginCache.getCleanLogin()
  const [other1Client, other1UserId] = await loginCache.getCleanLogin()
  const [other2Client] = await loginCache.getCleanLogin()

  // we follow other 1
  let resp = await ourClient.mutate({mutation: mutations.followUser, variables: {userId: other1UserId}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.followUser.followedStatus).toBe('FOLLOWING')

  // other 1 goes private
  resp = await other1Client.mutate({mutation: mutations.setUserPrivacyStatus, variables: {privacyStatus: 'PRIVATE'}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.setUserDetails.privacyStatus).toBe('PRIVATE')

  // other 2 goes private
  resp = await other2Client.mutate({mutation: mutations.setUserPrivacyStatus, variables: {privacyStatus: 'PRIVATE'}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.setUserDetails.privacyStatus).toBe('PRIVATE')

  // other 1 adds a post
  const postId1 = uuidv4()
  let variables = {postId: postId1, imageData: imageData1B64, takenInReal: true}
  resp = await other1Client.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId1)

  // other 2 adds a post
  const postId2 = uuidv4()
  variables = {postId: postId2, imageData: imageData2B64, takenInReal: true}
  resp = await other2Client.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId2)

  // verify no trending posts
  resp = await ourClient.query({query: queries.trendingPosts})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(0)

  // both posts viewed
  resp = await ourClient.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId1, postId2]}})
  expect(resp.errors).toBeUndefined()

  // verify trending posts looks correct, including the items that are batch filled in
  resp = await ourClient.query({query: queries.trendingPosts})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(1)

  const firstPost = resp.data.trendingPosts.items[0]
  expect(firstPost.postId).toBe(postId1)
  expect(firstPost.postedBy.userId).toBe(other1UserId)
  expect(firstPost.postedBy.blockerStatus).toBe('NOT_BLOCKING')
  expect(firstPost.postedBy.privacyStatus).toBe('PRIVATE')
  expect(firstPost.postedBy.followedStatus).toBe('FOLLOWING')
})

test('We do not see trending posts of users that have blocked us', async () => {
  const [ourClient, ourUserId] = await loginCache.getCleanLogin()
  const [theirClient] = await loginCache.getCleanLogin()

  // they block us
  let resp = await theirClient.mutate({mutation: mutations.blockUser, variables: {userId: ourUserId}})
  expect(resp.errors).toBeUndefined()

  // they add a post
  const postId1 = uuidv4()
  let variables = {postId: postId1, imageData: imageData1B64, takenInReal: true}
  resp = await theirClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId1)

  // we add a post
  const postId2 = uuidv4()
  variables = {postId: postId2, imageData: imageData2B64, takenInReal: true}
  resp = await ourClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId2)

  // verify no trending posts
  resp = await ourClient.query({query: queries.trendingPosts})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(0)

  // they view both posts
  resp = await theirClient.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId1, postId2]}})
  expect(resp.errors).toBeUndefined()

  // verify trending posts looks correct, including the items that are batch filled in
  resp = await ourClient.query({query: queries.trendingPosts})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(1)

  const firstPost = resp.data.trendingPosts.items[0]
  expect(firstPost.postId).toBe(postId2)
  expect(firstPost.postedBy.userId).toBe(ourUserId)
  expect(firstPost.postedBy.blockerStatus).toBe('SELF')
  expect(firstPost.postedBy.privacyStatus).toBe('PUBLIC')
  expect(firstPost.postedBy.followedStatus).toBe('SELF')
})

test('Post views on duplicate posts are viewed post and original post, only original get trending', async () => {
  const [ourClient, ourUserId] = await loginCache.getCleanLogin()
  const [theirClient] = await loginCache.getCleanLogin()
  const [otherClient, otherUserId] = await loginCache.getCleanLogin()

  // we add an image post
  const ourPostId = uuidv4()
  let variables = {postId: ourPostId, imageData: imageData1B64, takenInReal: true}
  let resp = await ourClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(ourPostId)
  expect(resp.data.addPost.postStatus).toBe('COMPLETED')
  expect(resp.data.addPost.originalPost.postId).toBe(ourPostId)
  await misc.sleep(2000) // let dynamo converge

  // they add an image post that's a duplicate of ours
  const theirPostId = uuidv4()
  variables = {postId: theirPostId, imageData: imageData1B64, takenInReal: true}
  resp = await theirClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(theirPostId)
  expect(resp.data.addPost.postStatus).toBe('COMPLETED')
  expect(resp.data.addPost.originalPost.postId).toBe(ourPostId)

  // verify the original post is our post on both posts, and there are no views on either post
  resp = await ourClient.query({query: queries.post, variables: {postId: ourPostId}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.post.postId).toBe(ourPostId)
  expect(resp.data.post.viewedByCount).toBe(0)
  expect(resp.data.post.originalPost.postId).toBe(ourPostId)
  resp = await theirClient.query({query: queries.post, variables: {postId: theirPostId}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.post.postId).toBe(theirPostId)
  expect(resp.data.post.viewedByCount).toBe(0)
  expect(resp.data.post.originalPost.postId).toBe(ourPostId)

  // other records one post view on their post
  resp = await otherClient.mutate({mutation: mutations.reportPostViews, variables: {postIds: [theirPostId]}})
  expect(resp.errors).toBeUndefined()

  // verify that showed up on their post
  resp = await theirClient.query({query: queries.post, variables: {postId: theirPostId}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.post.postId).toBe(theirPostId)
  expect(resp.data.post.viewedByCount).toBe(1)
  expect(resp.data.post.viewedBy.items).toHaveLength(1)
  expect(resp.data.post.viewedBy.items[0].userId).toBe(otherUserId)

  // verify that also showed up on our post
  resp = await ourClient.query({query: queries.post, variables: {postId: ourPostId}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.post.postId).toBe(ourPostId)
  expect(resp.data.post.viewedByCount).toBe(1)
  expect(resp.data.post.viewedBy.items).toHaveLength(1)
  expect(resp.data.post.viewedBy.items[0].userId).toBe(otherUserId)

  // verify both of our users also recored a view
  resp = await ourClient.query({query: queries.self})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.self.postViewedByCount).toBe(1)
  resp = await theirClient.query({query: queries.self})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.self.postViewedByCount).toBe(1)

  // check trending posts - only our post should show up there
  resp = await theirClient.query({query: queries.trendingPosts})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(1)
  expect(resp.data.trendingPosts.items[0].postId).toBe(ourPostId)

  // check trending users - only we should show up there
  resp = await theirClient.query({query: queries.trendingUsers})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingUsers.items).toHaveLength(1)
  expect(resp.data.trendingUsers.items[0].userId).toBe(ourUserId)

  // they record a view on their own post
  resp = await theirClient.mutate({mutation: mutations.reportPostViews, variables: {postIds: [theirPostId]}})
  expect(resp.errors).toBeUndefined()

  // verify that did not get recorded as a view on their post
  resp = await theirClient.query({query: queries.post, variables: {postId: theirPostId}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.post.postId).toBe(theirPostId)
  expect(resp.data.post.viewedByCount).toBe(1)
  expect(resp.data.post.viewedBy.items).toHaveLength(1)
  expect(resp.data.post.viewedBy.items[0].userId).toBe(otherUserId)

  // verify that did not get recorded as a view on our post
  resp = await ourClient.query({query: queries.post, variables: {postId: ourPostId}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.post.postId).toBe(ourPostId)
  expect(resp.data.post.viewedByCount).toBe(1)
  expect(resp.data.post.viewedBy.items).toHaveLength(1)
  expect(resp.data.post.viewedBy.items[0].userId).toBe(otherUserId)

  // we record a post view on their post
  resp = await ourClient.mutate({mutation: mutations.reportPostViews, variables: {postIds: [theirPostId]}})
  expect(resp.errors).toBeUndefined()

  // verify it did get recorded on their post
  resp = await theirClient.query({query: queries.post, variables: {postId: theirPostId}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.post.postId).toBe(theirPostId)
  expect(resp.data.post.viewedByCount).toBe(2)
  expect(resp.data.post.viewedBy.items).toHaveLength(2)
  expect(resp.data.post.viewedBy.items[0].userId).toBe(otherUserId)
  expect(resp.data.post.viewedBy.items[1].userId).toBe(ourUserId)

  // verify that did not get recorded as a view on our post
  resp = await ourClient.query({query: queries.post, variables: {postId: ourPostId}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.post.postId).toBe(ourPostId)
  expect(resp.data.post.viewedByCount).toBe(1)
  expect(resp.data.post.viewedBy.items).toHaveLength(1)
  expect(resp.data.post.viewedBy.items[0].userId).toBe(otherUserId)
})

test('Archived posts do not show up as trending', async () => {
  const [ourClient] = await loginCache.getCleanLogin()
  const [theirClient] = await loginCache.getCleanLogin()

  // add a post
  const postId = uuidv4()
  let variables = {postId, imageData: imageData1B64, takenInReal: true}
  let resp = await ourClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId)

  // view the post
  resp = await theirClient.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId]}})
  expect(resp.errors).toBeUndefined()

  // verify it shows up as trending
  resp = await ourClient.query({query: queries.trendingPosts})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(1)
  expect(resp.data.trendingPosts.items[0].postId).toBe(postId)

  // archive the post
  resp = await ourClient.mutate({mutation: mutations.archivePost, variables: {postId}})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.archivePost.postStatus).toBe('ARCHIVED')

  // verify the post no longer shows up as trending
  resp = await ourClient.query({query: queries.trendingPosts})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(0)
})

test('Posts that fail verification do not show up in trending', async () => {
  const [ourClient] = await loginCache.getCleanLogin()
  const [theirClient] = await loginCache.getCleanLogin()

  // add a post that fails verification
  const postId1 = uuidv4()
  let variables = {postId: postId1, imageData: imageData1B64}
  let resp = await ourClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId1)
  expect(resp.data.addPost.isVerified).toBe(false)

  // add a post that passes verification
  const postId2 = uuidv4()
  variables = {postId: postId2, imageData: imageData2B64, takenInReal: true}
  resp = await ourClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId2)
  expect(resp.data.addPost.isVerified).toBe(true)

  // view both posts
  resp = await theirClient.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId1, postId2]}})
  expect(resp.errors).toBeUndefined()

  // verify only the verified one shows up in trending
  resp = await ourClient.query({query: queries.trendingPosts})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(1)
  expect(resp.data.trendingPosts.items[0].postId).toBe(postId2)
})

test('Views of our own posts count for trending', async () => {
  const [ourClient, ourUserId] = await loginCache.getCleanLogin()

  // add a post
  const postId = uuidv4()
  let variables = {postId, imageData: imageData1B64, takenInReal: true}
  let resp = await ourClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId)

  // verify nothing in trending
  resp = await ourClient.query({query: queries.trendingPosts})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(0)

  // we view our own post
  resp = await ourClient.mutate({mutation: mutations.reportPostViews, variables: {postIds: [postId]}})
  expect(resp.errors).toBeUndefined()

  // verify the post is now in trending
  resp = await ourClient.query({query: queries.trendingPosts})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingPosts.items).toHaveLength(1)
  expect(resp.data.trendingPosts.items[0].postId).toBe(postId)

  // verify we are now in trending
  resp = await ourClient.query({query: queries.trendingUsers})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.trendingUsers.items).toHaveLength(1)
  expect(resp.data.trendingUsers.items[0].userId).toBe(ourUserId)
})
