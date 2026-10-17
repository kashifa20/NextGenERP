import os
import shutil
import tempfile
from pathlib import Path

import pytest
from sqlalchemy import event
from fastapi.testclient import TestClient

_TEST_DATABASE_DIR = Path(tempfile.mkdtemp(prefix="nextgenerp-backend-tests-"))
_TEST_DATABASE_PATH = _TEST_DATABASE_DIR / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DATABASE_PATH.as_posix()}"
os.environ["JWT_SECRET_KEY"] = "test-only-secret-key-never-use-outside-tests"

from database.connection import Base, engine


@event.listens_for(engine, "connect")
def enable_sqlite_foreign_keys(connection, _record):
    cursor = connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


import main


@pytest.fixture(autouse=True)
def reset_test_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    with TestClient(main.app) as test_client:
        response = test_client.post(
            "/auth/register",
            json={
                "username": "regression-user",
                "password": "regression-test-password",
            },
        )
        assert response.status_code == 201, response.text
        test_client.headers["Authorization"] = (
            f"Bearer {response.json()['access_token']}"
        )
        yield test_client


@pytest.fixture
def unauthenticated_client():
    with TestClient(main.app) as test_client:
        yield test_client


@pytest.fixture
def create_category(client):
    def create(name="Test category", description="Regression test category"):
        response = client.post(
            "/categories/",
            params={"name": name, "description": description},
        )
        assert response.status_code == 200, response.text
        return response.json()

    return create


@pytest.fixture
def create_product(client):
    def create(
        name="Test product",
        sku="TEST-SKU",
        stock_quantity=10,
        reorder_level=3,
        category_id=None,
    ):
        payload = {
            "name": name,
            "sku": sku,
            "price": 12.5,
            "stock_quantity": stock_quantity,
            "reorder_level": reorder_level,
            "category_id": category_id,
        }
        response = client.post("/products/", json=payload)
        assert response.status_code == 200, response.text
        return response.json()

    return create


@pytest.fixture
def create_supplier(client):
    def create(name="Test supplier"):
        response = client.post(
            "/suppliers/",
            json={
                "name": name,
                "email": "supplier@example.test",
                "phone": "5550100",
                "address": "Test address",
                "lead_time_days": 5,
                "performance_rating": 4.5,
            },
        )
        assert response.status_code == 200, response.text
        return response.json()

    return create


@pytest.fixture(scope="session", autouse=True)
def remove_temporary_test_database():
    yield
    engine.dispose()
    shutil.rmtree(_TEST_DATABASE_DIR)
