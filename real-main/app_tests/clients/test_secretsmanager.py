import json

import moto
import pytest

from app.clients import SecretsManagerClient

cloudfront_key_pair_name = 'KeyForCloudFront'
post_verification_api_creds_name = 'KeyForPV'
google_client_ids_name = 'KeyForGoogleClientIds'
apple_appstore_params_name = 'KeyForAppleAppstoreParams'
amplitude_api_key_name = 'KeyForAmplitudeApiKey'
jumio_api_creds_name = 'KeyForJumio'
id_analyzer_api_key_name = 'KeyForIdAnalyzerApiKey'


@pytest.fixture
def client():
    with moto.mock_secretsmanager():
        yield SecretsManagerClient(
            cloudfront_key_pair_name=cloudfront_key_pair_name,
            post_verification_api_creds_name=post_verification_api_creds_name,
            google_client_ids_name=google_client_ids_name,
            apple_appstore_params_name=apple_appstore_params_name,
            amplitude_api_key_name=amplitude_api_key_name,
            jumio_api_creds_name=jumio_api_creds_name,
            id_analyzer_api_key_name=id_analyzer_api_key_name,
        )


def test_retrieve_cloudfront_key_pair(client):
    value = {
        'kid': 'the-key-id',
        'public': 'public-key-content',
        'private': 'private-key-content',
    }

    # add the secret, then remove it
    client.boto_client.create_secret(Name=cloudfront_key_pair_name, SecretString=json.dumps(value))
    client.boto_client.delete_secret(SecretId=cloudfront_key_pair_name)

    # secret is not in there - test we cannot retrieve it
    with pytest.raises(client.exceptions.InvalidRequestException):
        client.get_cloudfront_key_pair()

    # restore the value in there, test we can retrieve it
    client.boto_client.restore_secret(SecretId=cloudfront_key_pair_name)
    assert client.get_cloudfront_key_pair() == value

    # test caching: remove the secret from the backend store, check again
    client.boto_client.delete_secret(SecretId=cloudfront_key_pair_name)
    assert client.get_cloudfront_key_pair() == value


def test_retrieve_post_verification_api_creds(client):
    value = {
        'key': 'the-api-key',
        'root': 'https://api-root.root',
    }

    # add the secret, then remove it
    client.boto_client.create_secret(Name=post_verification_api_creds_name, SecretString=json.dumps(value))
    client.boto_client.delete_secret(SecretId=post_verification_api_creds_name)

    # secret is not in there - test we cannot retrieve it
    with pytest.raises(client.exceptions.InvalidRequestException):
        client.get_post_verification_api_creds()

    # restore the value in there, test we can retrieve it
    client.boto_client.restore_secret(SecretId=post_verification_api_creds_name)
    assert client.get_post_verification_api_creds() == value

    # test caching: remove the secret from the backend store, check again
    client.boto_client.delete_secret(SecretId=post_verification_api_creds_name)
    assert client.get_post_verification_api_creds() == value


def test_retrieve_google_client_ids(client):
    value = {
        'ios': 'ios-client-id',
        'web': 'web-client-id',
    }

    # add the secret, then remove it
    client.boto_client.create_secret(Name=google_client_ids_name, SecretString=json.dumps(value))
    client.boto_client.delete_secret(SecretId=google_client_ids_name)

    # secret is not in there - test we cannot retrieve it
    with pytest.raises(client.exceptions.InvalidRequestException):
        client.get_google_client_ids()

    # restore the value in there, test we can retrieve it
    client.boto_client.restore_secret(SecretId=google_client_ids_name)
    assert client.get_google_client_ids() == value

    # test caching: remove the secret from the backend store, check again
    client.boto_client.delete_secret(SecretId=google_client_ids_name)
    assert client.get_google_client_ids() == value


def test_retrieve_apple_appstore_params(client):
    value = {
        'bundleId': 'some.thing.yup',
        'sharedSecret': 'a-hex-string',
    }

    # add the secret, then remove it
    client.boto_client.create_secret(Name=apple_appstore_params_name, SecretString=json.dumps(value))
    client.boto_client.delete_secret(SecretId=apple_appstore_params_name)

    # secret is not in there - test we cannot retrieve it
    with pytest.raises(client.exceptions.InvalidRequestException):
        client.get_apple_appstore_params()

    # restore the value in there, test we can retrieve it
    client.boto_client.restore_secret(SecretId=apple_appstore_params_name)
    assert client.get_apple_appstore_params() == value

    # test caching: remove the secret from the backend store, check again
    client.boto_client.delete_secret(SecretId=apple_appstore_params_name)
    assert client.get_apple_appstore_params() == value


def test_retrieve_amplitude_params(client):
    value = {
        'apiKey': 'what.a.key',
    }

    # add the secret, then remove it
    client.boto_client.create_secret(Name=amplitude_api_key_name, SecretString=json.dumps(value))
    client.boto_client.delete_secret(SecretId=amplitude_api_key_name)

    # secret is not in there - test we cannot retrieve it
    with pytest.raises(client.exceptions.InvalidRequestException):
        client.get_amplitude_api_key()

    # restore the value in there, test we can retrieve it
    client.boto_client.restore_secret(SecretId=amplitude_api_key_name)
    assert client.get_amplitude_api_key() == value

    # test caching: remove the secret from the backend store, check again
    client.boto_client.delete_secret(SecretId=amplitude_api_key_name)
    assert client.get_amplitude_api_key() == value


def test_retrieve_jumio_api_creds(client):
    value = {
        'apiToken': 'the-api-token',
        'secret': 'secret',
        'callbackUrl': 'https://callbackurl.com',
    }

    # add the secret, then remove it
    client.boto_client.create_secret(Name=jumio_api_creds_name, SecretString=json.dumps(value))
    client.boto_client.delete_secret(SecretId=jumio_api_creds_name)

    # secret is not in there - test we cannot retrieve it
    with pytest.raises(client.exceptions.InvalidRequestException):
        client.get_jumio_api_creds()

    # restore the value in there, test we can retrieve it
    client.boto_client.restore_secret(SecretId=jumio_api_creds_name)
    assert client.get_jumio_api_creds() == value

    # test caching: remove the secret from the backend store, check again
    client.boto_client.delete_secret(SecretId=jumio_api_creds_name)
    assert client.get_jumio_api_creds() == value


def test_retrieve_id_analyzer_api_key(client):
    value = {'apiKey': 'the-api-key'}

    # add the secret, then remove it
    client.boto_client.create_secret(Name=id_analyzer_api_key_name, SecretString=json.dumps(value))
    client.boto_client.delete_secret(SecretId=id_analyzer_api_key_name)

    # secret is not in there - test we cannot retrieve it
    with pytest.raises(client.exceptions.InvalidRequestException):
        client.get_id_analyzer_api_key()

    # restore the value in there, test we can retrieve it
    client.boto_client.restore_secret(SecretId=id_analyzer_api_key_name)
    assert client.get_id_analyzer_api_key() == value

    # test caching: remove the secret from the backend store, check again
    client.boto_client.delete_secret(SecretId=id_analyzer_api_key_name)
    assert client.get_id_analyzer_api_key() == value
