import pytest
from flask import session


class TestUserManagementAccess:
    def test_requires_login(self, client):
        response = client.get("/user-management", follow_redirects=True)
        assert response.status_code == 200
        assert b"login" in response.data.lower()

    def test_accessible_by_admin(self, client, login):
        login()
        response = client.get("/user-management")
        assert response.status_code == 200

    def test_denied_for_operator(self, client, login):
        login(username="operator", role="operator")
        response = client.get("/user-management", follow_redirects=True)
        assert response.status_code == 200
        assert b"You do not have permission" in response.data


class TestUserAdd:
    def test_add_user(self, client, login):
        import db

        login()
        client.post(
            "/user-management",
            data={
                "username": "newuser",
                "password": "pass123",
                "role": "operator",
                "menu_access": "",
            },
            follow_redirects=True,
        )
        db.add_user.assert_called_once()
        args = db.add_user.call_args[0][0]
        assert args["username"] == "newuser"
        assert args["role"] == "operator"


class TestUserEdit:
    def test_edit_user(self, client, login):
        import db

        login()
        client.post(
            "/user-management",
            data={
                "id": "1",
                "username": "changed",
                "password": "newpass",
                "role": "operator",
                "menu_access": "dashboard",
            },
            follow_redirects=True,
        )
        db.update_user.assert_called_once()
        args = db.update_user.call_args[0][0]
        assert args["id"] == "1"
        assert args["username"] == "changed"


class TestUserDelete:
    def test_delete_user(self, client, login):
        import db

        login()
        client.post(
            "/user-management",
            data={"action": "delete", "id": "2"},
            follow_redirects=True,
        )
        db.delete_user.assert_called_once_with("2")


class TestUserList:
    def test_get_all_users_called(self, client, login):
        import db

        db.get_all_users.reset_mock()
        login()
        client.get("/user-management")
        db.get_all_users.assert_called()
