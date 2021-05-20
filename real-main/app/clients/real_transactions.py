import json
import logging
import os
from decimal import Decimal

import requests

from app.utils import DecimalAsStringJsonEncoder

logger = logging.getLogger()

REAL_TRANSACTIONS_API_ROOT = os.environ.get('REAL_TRANSACTIONS_API_ROOT')


class RealTransactionsClient:
    def __init__(self, api_root=REAL_TRANSACTIONS_API_ROOT):
        self.api_root = api_root
        self.session = requests.Session()
        self.session.hooks = {'response': lambda r, *args, **kwargs: r.raise_for_status()}

    def pay_for_ad_view(self, viewer_id, ad_post_owner_id, ad_post_id, amount):
        assert isinstance(amount, Decimal), "'amount' must be a Decimal"
        url = self.api_root + '/pay_user_for_advertisement'
        data = {
            'advertiser_uuid': ad_post_owner_id,
            'amount': amount,
            'description': f'For view of ad with post id: {ad_post_id}',
            'viewer_uuid': viewer_id,
        }
        self.session.post(url, data=json.dumps(data, cls=DecimalAsStringJsonEncoder))

    def pay_for_post_view(self, viewer_id, post_owner_id, post_id, amount):
        assert isinstance(amount, Decimal), "'amount' must be a Decimal"
        url = self.api_root + '/pay_for_post_view'
        data = {
            'amount': amount,
            'post_owner_uuid': post_owner_id,
            'post_uuid': post_id,
            'viewer_uuid': viewer_id,
        }
        self.session.post(url, data=json.dumps(data, cls=DecimalAsStringJsonEncoder))
