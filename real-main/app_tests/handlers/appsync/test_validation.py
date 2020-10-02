import pytest

from app.handlers.appsync.exceptions import ClientException
from app.handlers.appsync.validation import (
    validate_age_range,
    validate_location,
    validate_match_genders,
    validate_match_location_radius,
)
from app.models.user.enums import UserSubscriptionLevel


def test_validate_match_location_radius():
    # Case 1
    match_location_radius = 14

    with pytest.raises(ClientException, match='matchLocationRadius'):
        validate_match_location_radius(match_location_radius, UserSubscriptionLevel.BASIC)

    with pytest.raises(ClientException, match='matchLocationRadius'):
        validate_match_location_radius(match_location_radius, UserSubscriptionLevel.DIAMOND)

    # Case 2
    match_location_radius = 15

    assert validate_match_location_radius(match_location_radius, UserSubscriptionLevel.BASIC) is True
    assert validate_match_location_radius(match_location_radius, UserSubscriptionLevel.DIAMOND) is True

    # Case 3
    match_location_radius = 50

    assert validate_match_location_radius(match_location_radius, UserSubscriptionLevel.BASIC) is True
    assert validate_match_location_radius(match_location_radius, UserSubscriptionLevel.DIAMOND) is True

    # Case 4
    match_location_radius = 100

    assert validate_match_location_radius(match_location_radius, UserSubscriptionLevel.BASIC) is True
    assert validate_match_location_radius(match_location_radius, UserSubscriptionLevel.DIAMOND) is True

    # Case 5
    match_location_radius = 101

    with pytest.raises(ClientException, match='matchLocationRadius'):
        validate_match_location_radius(match_location_radius, UserSubscriptionLevel.BASIC)
    assert validate_match_location_radius(match_location_radius, UserSubscriptionLevel.DIAMOND) is True


def test_validate_age_range():
    valid_match_age_range_1 = {'min': 20, 'max': 50}
    valid_match_age_range_2 = {'min': 18, 'max': 100}
    invalid_match_age_range_1 = {'min': 100, 'max': 50}
    invalid_match_age_range_2 = {'min': 17, 'max': 100}
    invalid_match_age_range_3 = {'min': 17, 'max': 101}
    invalid_match_age_range_4 = {'min': 18, 'max': 101}

    # Pass the validation
    assert validate_age_range(valid_match_age_range_1) is True
    assert validate_age_range(valid_match_age_range_2) is True

    # Raise client exception
    with pytest.raises(ClientException, match='matchAgeRange'):
        validate_age_range(invalid_match_age_range_1)

    with pytest.raises(ClientException, match='matchAgeRange'):
        validate_age_range(invalid_match_age_range_2)

    with pytest.raises(ClientException, match='matchAgeRange'):
        validate_age_range(invalid_match_age_range_3)

    with pytest.raises(ClientException, match='matchAgeRange'):
        validate_age_range(invalid_match_age_range_4)


def test_validate_location():
    # Case 1
    location = {'latitude': -90, 'longitude': -180, 'accuracy': -1}

    with pytest.raises(ClientException, match='accuracy'):
        validate_location(location)

    # Case 2
    location = {'latitude': 90, 'longitude': 180, 'accuracy': 1}
    assert validate_location(location) is True

    # Case 3
    location = {'latitude': 0, 'longitude': 0, 'accuracy': 42}
    assert validate_location(location) is True

    # Case 4
    location = {'latitude': -90.1, 'longitude': -180.1, 'accuracy': None}

    with pytest.raises(ClientException, match='latitude'):
        validate_location(location)

    # Case 5
    location = {'latitude': 90.1, 'longitude': 180.1}

    with pytest.raises(ClientException, match='latitude'):
        validate_location(location)


def test_validate_match_genders():
    with pytest.raises(ClientException, match='matchGenders'):
        validate_match_genders([])
    assert validate_match_genders(['anything']) is True
