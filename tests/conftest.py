import sys
from unittest.mock import MagicMock, patch

mock_db = MagicMock(name="mock_db")
mock_db.get_user_by_username.return_value = None
mock_db.get_all_users.return_value = []
mock_db.add_user.return_value = True
mock_db.update_user.return_value = True
mock_db.delete_user.return_value = True
mock_db.get_sensors_list.return_value = []
mock_db.get_bridge_info.return_value = None
sys.modules["db"] = mock_db

import pytest
from app import app as flask_app


@pytest.fixture
def app():
    flask_app.config["TESTING"] = True
    flask_app.config["WTF_CSRF_ENABLED"] = False
    flask_app.config["SECRET_KEY"] = "test-secret-key"
    yield flask_app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def runner(app):
    return app.test_cli_runner()


@pytest.fixture(autouse=True)
def _reset_attempts():
    import routes.auth as auth_mod
    auth_mod._login_attempts.clear()
    yield
    auth_mod._login_attempts.clear()


@pytest.fixture
def mock_user():
    def _mock(username, password, role="operator", menu_access=""):
        mock_db.get_user_by_username.reset_mock()
        mock_db.get_user_by_username.return_value = {
            "id": 1,
            "username": username,
            "password": password,
            "role": role,
            "menu_access": menu_access,
        }

    mock_db.get_user_by_username.reset_mock()
    mock_db.get_user_by_username.return_value = None
    return _mock


@pytest.fixture
def login(client, mock_user):
    def _login(username="admin", password="shms2026", role="admin"):
        mock_user(username, password, role=role)
        return client.post(
            "/login",
            data={"username": username, "password": password},
            follow_redirects=True,
        )

    return _login
