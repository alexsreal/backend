import json
import logging

import pendulum

from app import clients, models
from app.logging import LogLevelContext, handler_logging
from app.models.card import templates

from . import xray

logger = logging.getLogger()
xray.patch_all()

secrets_manager_client = clients.SecretsManagerClient()
amplitude_client = clients.AmplitudeClient(secrets_manager_client.get_amplitude_api_key)
clients = {
    'amplitude': amplitude_client,
    'appstore': clients.AppStoreClient(secrets_manager_client.get_apple_appstore_params),
    'appsync': clients.AppSyncClient(),
    'dynamo': clients.DynamoClient(),
    'cognito': clients.CognitoClient(),
    'pinpoint': clients.PinpointClient(),
}

managers = {}
card_manager = managers.get('card') or models.CardManager(clients, managers=managers)
chat_manager = managers.get('chat') or models.ChatManager(clients, managers=managers)
chat_message_manager = managers.get('chat_message') or models.ChatMessageManager(clients, managers=managers)
user_manager = managers.get('user') or models.UserManager(clients, managers=managers)
appstore_manager = managers.get('appstore') or models.AppStoreManager(clients, managers=managers)


@handler_logging(event_to_extras=lambda event: {'event': event})
def create_dating_chat(event, context):
    with LogLevelContext(logger, logging.INFO):
        logger.info('create_dating_chat() called')

    user_id = event['userId']
    chat_id = event['chatId']
    match_user_id = event['matchUserId']
    message_text = event['messageText']

    # Create direct chat with system message
    now = pendulum.now('utc')
    chat = chat_manager.add_direct_chat(chat_id, user_id, match_user_id, now=now)
    chat_message_manager.add_system_message(chat_id, message_text, user_ids=[user_id, match_user_id], now=now)

    # Add dating matched card
    card_template_1 = templates.UserDatingMatchedCardTemplate(user_id)
    card_template_2 = templates.UserDatingMatchedCardTemplate(match_user_id)
    card_manager.add_or_update_card(card_template_1)
    card_manager.add_or_update_card(card_template_2)

    chat.refresh_item(strongly_consistent=True)
    return chat.item


@handler_logging(event_to_extras=lambda event: {'event': event})
def handle_appstore_server_notification(event, context):
    with LogLevelContext(logger, logging.INFO):
        logger.info('handle_appstore_server_notification() called')

    body_str = event.get('body')

    if body_str:
        appstore_server_response = json.loads(body_str)
        logger.warning(f'Appstore server response {appstore_server_response}')
        # https://developer.apple.com/documentation/appstoreservernotifications/responsebody
        if appstore_server_response.get('unified_receipt'):
            appstore_manager.add_transaction(appstore_server_response['unified_receipt'])

    return {
        'statusCode': 200,
    }


@handler_logging(event_to_extras=lambda event: {'event': event})
def send_amplitude_event(event, context):
    with LogLevelContext(logger, logging.INFO):
        logger.info('send_amplitude_event() called')

    body_str = event.get('body')
    status_code = 200
    if body_str:
        amplitude_body = json.loads(body_str)
        user_id = amplitude_body.get('userId')
        event_name = amplitude_body.get('type')
        event_payload = amplitude_body.get('payload')

        if user_id and event_name and event_payload:
            amplitude_client.log_event(user_id, event_name, event_payload)
        else:
            status_code = 400

    return {
        'statusCode': status_code,
    }


@handler_logging(event_to_extras=lambda event: {'event': event})
def handle_id_verification_callback(event, context):
    with LogLevelContext(logger, logging.INFO):
        logger.info('handle_id_verification_callback() called')

    try:
        user_id = event['pathParameters']['id']
        assert user_id
        response = json.loads(event.get('body'))
    except Exception as err:
        logger.warning(f'ID verification callback client error: `{str(err)}`')
        status_code = 400
    else:
        user_manager.set_id_verification_callback(user_id, response)
        status_code = 200

    return {
        'statusCode': status_code,
    }
