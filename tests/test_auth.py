class TestLoginGet:
    def test_login_page_returns_200(self, client):
        response = client.get("/login")
        assert response.status_code == 200

    def test_redirects_when_already_logged_in(self, client, login):
        login()
        response = client.get("/login")
        assert response.status_code == 302
        assert response.location == "/"


class TestLoginPost:
    def test_valid_credentials_sets_session_and_redirects(self, client, mock_user):
        mock_user("admin", "shms2026", role="admin")
        response = client.post(
            "/login",
            data={"username": "admin", "password": "shms2026"},
            follow_redirects=False,
        )
        assert response.status_code == 302
        assert response.location == "/"
        with client.session_transaction() as sess:
            assert sess["logged_in"] is True
            assert sess["username"] == "admin"
            assert sess["role"] == "admin"

    def test_invalid_username_shows_error(self, client):
        response = client.post(
            "/login",
            data={"username": "no_such_user", "password": "wrong"},
            follow_redirects=True,
        )
        assert response.status_code == 200
        assert b"Invalid username or password" in response.data

    def test_invalid_password_shows_error(self, client, mock_user):
        mock_user("admin", "correct_password")
        response = client.post(
            "/login",
            data={"username": "admin", "password": "wrong_password"},
            follow_redirects=True,
        )
        assert response.status_code == 200
        assert b"Invalid username or password" in response.data

    def test_remember_me_makes_session_permanent(self, client, mock_user):
        mock_user("admin", "shms2026")
        client.post(
            "/login",
            data={"username": "admin", "password": "shms2026", "remember": "on"},
        )
        with client.session_transaction() as sess:
            assert sess.get("logged_in") is True


class TestLoginRateLimit:
    def test_blocks_after_5_failed_attempts(self, client, mock_user):
        mock_user("admin", "correct")
        for i in range(5):
            response = client.post(
                "/login",
                data={"username": "admin", "password": "wrong"},
                follow_redirects=True,
            )
            assert response.status_code == 200

        response = client.post(
            "/login",
            data={"username": "admin", "password": "wrong"},
            follow_redirects=True,
        )
        assert response.status_code == 200
        assert b"Too many login attempts" in response.data

    def test_successful_login_resets_counter(self, client, mock_user):
        mock_user("admin", "correct")
        for _ in range(3):
            client.post("/login", data={"username": "admin", "password": "wrong"})

        mock_user("admin", "correct")
        response = client.post(
            "/login",
            data={"username": "admin", "password": "correct"},
            follow_redirects=False,
        )
        assert response.status_code == 302

        client.get("/logout")

        mock_user("admin", "correct")
        for _ in range(5):
            client.post("/login", data={"username": "admin", "password": "wrong"})

        response = client.post(
            "/login",
            data={"username": "admin", "password": "wrong"},
            follow_redirects=True,
        )
        assert b"Too many login attempts" in response.data


class TestLogout:
    def test_logout_clears_session(self, client, login):
        login()
        response = client.get("/logout")
        assert response.status_code == 302
        with client.session_transaction() as sess:
            assert "logged_in" not in sess
            assert "username" not in sess
