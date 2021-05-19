import itertools
import logging

from app import models
from app.models.follower.enums import FollowStatus
from app.models.post.enums import AdStatus
from app.utils import GqlNotificationType

from .dynamo import AdFeedDynamo

logger = logging.getLogger()

# used to store a list of all currently active ads
ALL_ADS_USER_ID = 'all-ads'


class FeedManager:
    def __init__(self, clients, managers=None):
        managers = managers or {}
        managers['feed'] = self
        self.follower_manager = managers.get('follower') or models.FollowerManager(clients, managers=managers)
        self.post_manager = managers.get('post') or models.PostManager(clients, managers=managers)

        self.clients = clients
        if 'appsync' in clients:
            self.appsync_client = clients['appsync']
        if 'ad_dynamo_feed' in clients:
            self.dynamo = AdFeedDynamo(clients['ad_dynamo_feed'])

    def add_users_posts_to_feed(self, feed_user_id, posted_by_user_id):
        post_item_generator = self.post_manager.dynamo.generate_posts_by_user(
            posted_by_user_id, completed=True, is_ad=False
        )
        self.dynamo.add_posts_to_feed(feed_user_id, post_item_generator)

    def add_post_to_followers_feeds(self, followed_user_id, post_item):
        user_id_gen = itertools.chain(
            [followed_user_id], self.follower_manager.generate_follower_user_ids(followed_user_id)
        )
        return self.dynamo.add_post_to_feeds(user_id_gen, post_item)

    def on_user_ads_disabled_change(self, user_id, new_item=None, old_item=None):
        user_id = (new_item or old_item)['userId']
        new_ads_disabled = (new_item or {}).get('adsDisabled', False)
        if new_ads_disabled:
            self.dynamo.add_ads_to_feed(user_id, ad_post_id_generator)
        else:
            self.dynamo.delete_by_user(user_id)

    def on_post_ad_status_change(self, post_id, new_item=None, old_item=None):
        new_ad_status = (new_item or {}).get('adStatus', AdStatus.NOT_AD)
        if new_ad_status == AdStatus.APPROVED:
            self.dynamo.add_ad_to_feeds(post_id, ads_enabled_user_id_generator)
        else:
            self.dynamo.delete_by_post(post_id)
