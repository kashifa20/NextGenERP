from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy.orm import Session

from database.connection import engine
from models.user import User

TEST_SECRET = "test-only-secret-key-never-use-outside-tests"


def test_registration_stores_only_a_password_hash_and_returns_access_token(
    unauthenticated_client,
):
    response = unauthenticated_client.post(
        "/auth/register",
        json={"username": "Alice", "password": "long-test-password-123"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["token_type"] == "bearer"
    assert data["user"]["username"] == "alice"
    assert "password" not in data["user"]

    with Session(engine) as session:
        user = session.query(User).filter_by(username="alice").one()
        assert user.password_hash != "long-test-password-123"
        assert user.password_hash.startswith("$argon2")


def test_registration_rejects_duplicate_and_invalid_credentials(
    unauthenticated_client,
):
    credentials = {"username": "same-user", "password": "long-test-password-123"}
    assert unauthenticated_client.post("/auth/register", json=credentials).status_code == 201
    assert unauthenticated_client.post("/auth/register", json=credentials).status_code == 409

    for payload in (
        {"username": "ab", "password": "long-test-password-123"},
        {"username": "bad user", "password": "long-test-password-123"},
        {"username": "missing-password"},
    ):
        response = unauthenticated_client.post(
            "/auth/register",
            json=payload,
        )
        assert response.status_code == 422

    short_password = "too-short"
    response = unauthenticated_client.post(
        "/auth/register",
        json={"username": "short-password", "password": short_password},
    )
    assert response.status_code == 422
    assert short_password not in response.text


def test_login_validates_credentials_and_token(unauthenticated_client):
    credentials = {"username": "login-user", "password": "long-test-password-123"}
    assert unauthenticated_client.post("/auth/register", json=credentials).status_code == 201

    invalid_password = unauthenticated_client.post(
        "/auth/login",
        json={"username": "login-user", "password": "wrong-password"},
    )
    assert invalid_password.status_code == 401
    assert invalid_password.json()["detail"] == "Invalid username or password"

    unknown_user = unauthenticated_client.post(
        "/auth/login",
        json={"username": "unknown-user", "password": credentials["password"]},
    )
    assert unknown_user.status_code == 401
    assert unknown_user.json()["detail"] == invalid_password.json()["detail"]

    login = unauthenticated_client.post("/auth/login", json=credentials)
    assert login.status_code == 200
    unauthenticated_client.headers["Authorization"] = (
        f"Bearer {login.json()['access_token']}"
    )
    current_user = unauthenticated_client.get("/auth/me")
    assert current_user.status_code == 200
    assert current_user.json()["username"] == "login-user"


def test_business_routes_require_a_valid_nonexpired_token(unauthenticated_client):
    protected_collections = (
        "/products/",
        "/categories/",
        "/suppliers/",
        "/orders/",
        "/purchase-orders/",
        "/inventory-transactions/",
    )
    for path in protected_collections:
        assert unauthenticated_client.get(path).status_code == 401

    protected_writes = (
        (
            "/products/",
            {
                "name": "Protected",
                "sku": "P",
                "price": 1,
                "stock_quantity": 0,
                "reorder_level": 0,
            },
        ),
        ("/categories/", None),
        ("/suppliers/", {"name": "Protected"}),
        ("/orders/", {"customer_name": "Protected", "product_id": 1, "quantity": 1}),
        (
            "/purchase-orders/",
            {"supplier_id": 1, "product_id": 1, "quantity": 1, "unit_price": 1},
        ),
        (
            "/inventory-transactions/",
            {
                "product_id": 1,
                "transaction_type": "Stock In",
                "quantity": 1,
                "reason": "Protected test request",
            },
        ),
    )
    for path, payload in protected_writes:
        response = unauthenticated_client.post(
            path,
            json=payload,
            params={"name": "Protected"} if payload is None else None,
        )
        assert response.status_code == 401

    invalid_token = unauthenticated_client.get(
        "/products/",
        headers={"Authorization": "Bearer invalid.token.value"},
    )
    assert invalid_token.status_code == 401
    assert invalid_token.json()["detail"] == "Invalid or expired access token"

    expired_token = jwt.encode(
        {
            "sub": "1",
            "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
        },
        TEST_SECRET,
        algorithm="HS256",
    )
    expired = unauthenticated_client.get(
        "/products/",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert expired.status_code == 401
    assert expired.json()["detail"] == "Invalid or expired access token"


def test_missing_jwt_secret_fails_with_safe_server_error(unauthenticated_client, monkeypatch):
    monkeypatch.delenv("JWT_SECRET_KEY")
    response = unauthenticated_client.post(
        "/auth/register",
        json={"username": "secret-test", "password": "long-test-password-123"},
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "Authentication is not configured on this server"
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_SECRET)
