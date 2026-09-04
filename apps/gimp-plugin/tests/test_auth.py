import json
from unittest.mock import MagicMock, patch

from pollinations_core.auth import AuthManager


def test_auth_manager_save_and_get_token(tmp_path):
    auth_file = tmp_path / "auth.json"
    auth = AuthManager(client_id="test_client")
    auth.auth_file = auth_file

    assert auth.get_saved_token() is None

    auth.save_token("sk_test123", {"preferred_username": "testuser"})
    assert auth.get_saved_token() == "sk_test123"

    saved_data = auth.get_saved_auth_data()
    assert saved_data["access_token"] == "sk_test123"
    assert saved_data["userinfo"]["preferred_username"] == "testuser"

    auth.disconnect()
    assert auth.get_saved_token() is None


@patch("urllib.request.urlopen")
def test_request_device_code(mock_urlopen):
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps({
        "device_code": "dev_123",
        "user_code": "ABCD-1234",
        "verification_uri": "https://enter.pollinations.ai/device",
        "expires_in": 600,
        "interval": 5
    }).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp
    mock_urlopen.return_value = mock_resp

    auth = AuthManager()
    res = auth.request_device_code()

    assert res["device_code"] == "dev_123"
    assert res["user_code"] == "ABCD-1234"
    assert res["verification_uri"] == "https://enter.pollinations.ai/device"


@patch("urllib.request.urlopen")
def test_poll_for_token_pending_and_success(mock_urlopen):
    # Pending response
    mock_resp_pending = MagicMock()
    mock_resp_pending.read.return_value = json.dumps({"error": "authorization_pending"}).encode("utf-8")
    mock_resp_pending.__enter__.return_value = mock_resp_pending

    # Success response
    mock_resp_success = MagicMock()
    mock_resp_success.read.return_value = json.dumps({
        "access_token": "sk_user_authorized_key",
        "token_type": "bearer"
    }).encode("utf-8")
    mock_resp_success.__enter__.return_value = mock_resp_success

    auth = AuthManager()

    mock_urlopen.return_value = mock_resp_pending
    status, token_dict, err = auth.poll_for_token("dev_123")
    assert status == "pending"
    assert token_dict is None

    mock_urlopen.return_value = mock_resp_success
    status, token_dict, err = auth.poll_for_token("dev_123")
    assert status == "success"
    assert token_dict["access_token"] == "sk_user_authorized_key"


@patch("urllib.request.urlopen")
def test_fetch_userinfo(mock_urlopen):
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps({
        "sub": "user_id_123",
        "preferred_username": "alice",
        "email": "alice@example.com"
    }).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp
    mock_urlopen.return_value = mock_resp

    auth = AuthManager()
    userinfo = auth.fetch_userinfo("sk_token_123")
    assert userinfo["preferred_username"] == "alice"
    assert userinfo["email"] == "alice@example.com"
