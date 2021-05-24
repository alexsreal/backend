import logging
import uuid
from decimal import BasicContext, Decimal
from random import random
from unittest.mock import call

import pytest

from app.mixins.view.enums import ViewType
from app.models.post.enums import PostType


@pytest.fixture
def user(user_manager, cognito_client):
    user_id, username = str(uuid.uuid4()), str(uuid.uuid4())[:8]
    cognito_client.create_user_pool_entry(user_id, username, verified_email=f'{username}@real.app')
    yield user_manager.create_cognito_only_user(user_id, username)


user2 = user
user3 = user


@pytest.fixture
def post(post_manager, user):
    yield post_manager.add_post(user, str(uuid.uuid4()), PostType.TEXT_ONLY, text='t')


post2 = post


@pytest.fixture
def ad(post_manager, user):
    yield post_manager.add_post(
        user,
        str(uuid.uuid4()),
        PostType.TEXT_ONLY,
        text='t',
        is_ad=True,
        ad_payment=Decimal(random()).normalize(BasicContext),
    )


def test_record_view_count_logs_warning_for_non_completed_posts(post, user2, caplog):
    # verify no warning for a completed post
    with caplog.at_level(logging.WARNING):
        post.record_view_count(user2.id, 2)
    assert len(caplog.records) == 0

    # verify warning for a non-completed post
    post.archive()
    with caplog.at_level(logging.WARNING):
        post.record_view_count(user2.id, 2)
    assert len(caplog.records) == 1
    assert user2.id in caplog.records[0].msg
    assert post.id in caplog.records[0].msg


def test_record_view_count_records_to_original_post_as_well(post, post2, user2):
    # verify a rando's view is recorded locally and goes up to the orginal
    assert post.view_dynamo.get_view(post.id, user2.id) is None
    assert post2.view_dynamo.get_view(post2.id, user2.id) is None
    post.item['originalPostId'] = post2.id
    post.record_view_count(user2.id, 1)
    assert post.view_dynamo.get_view(post.id, user2.id)
    assert post2.view_dynamo.get_view(post2.id, user2.id)


def test_record_view_count_calls_real_transactions_client_correctly(ad, user2):
    ad.record_view_count(user2.id, 1, view_type=ViewType.FOCUS)
    assert ad.real_transactions_client.pay_for_ad_view.mock_calls == [
        call(user2.id, ad.user_id, ad.id, ad.item['adPayment'])
    ]


def test_record_view_count_calls_real_transactions_client_first_time_only(ad, user2):
    # record a first view by a given user, verify client called
    ad.record_view_count(user2.id, 1, view_type=ViewType.FOCUS)
    ad.record_view_count(user2.id, 1, view_type=ViewType.FOCUS)
    assert ad.real_transactions_client.pay_for_ad_view.call_count == 1


def test_record_view_count_calls_real_transactions_client_different_users(ad, user2, user3):
    ad.record_view_count(user2.id, 1, view_type=ViewType.FOCUS)
    ad.record_view_count(user3.id, 1, view_type=ViewType.FOCUS)
    assert ad.real_transactions_client.pay_for_ad_view.call_count == 2


def test_record_view_count_doesnt_call_real_transactions_client_for_normal_view(ad, user2):
    ad.record_view_count(user2.id, 1, view_type=ViewType.THUMBNAIL)
    assert ad.real_transactions_client.pay_for_ad_view.called is False


def test_record_view_count_doesnt_call_real_transactions_client_for_owner(ad, user):
    ad.record_view_count(user.id, 1, view_type=ViewType.FOCUS)
    assert ad.real_transactions_client.pay_for_ad_view.called is False


def test_record_view_count_doesnt_call_real_transactions_client_for_post(post, user2):
    post.record_view_count(user2.id, 1, view_type=ViewType.FOCUS)
    assert post.real_transactions_client.pay_for_ad_view.called is False
