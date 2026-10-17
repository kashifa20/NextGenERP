import pytest


def submit_order(client, product_id, quantity=2):
    return client.post(
        "/orders/",
        json={
            "customer_name": "Test customer",
            "customer_email": "customer@example.test",
            "product_id": product_id,
            "quantity": quantity,
        },
    )


def test_sales_order_reduces_stock_and_checks_product_and_quantity(
    client,
    create_product,
):
    product = create_product(stock_quantity=5)

    invalid_product = submit_order(client, 999999)
    assert invalid_product.status_code == 404

    for quantity in (0, -1):
        assert submit_order(client, product["id"], quantity).status_code == 400

    insufficient = submit_order(client, product["id"], 6)
    assert insufficient.status_code == 400
    assert client.get(f"/products/{product['id']}").json()["stock_quantity"] == 5

    order = submit_order(client, product["id"], 2)
    assert order.status_code == 200
    assert order.json()["status"] == "Pending"
    assert client.get(f"/products/{product['id']}").json()["stock_quantity"] == 3


def test_sales_order_valid_transitions_and_rejects_invalid_jumps(
    client,
    create_product,
):
    product = create_product()
    order = submit_order(client, product["id"]).json()
    order_id = order["id"]

    invalid_jump = client.put(
        f"/orders/{order_id}/status",
        json={"status": "Delivered"},
    )
    assert invalid_jump.status_code == 400

    for status in ("Confirmed", "Shipped", "Delivered"):
        response = client.put(
            f"/orders/{order_id}/status",
            json={"status": status},
        )
        assert response.status_code == 200
        assert response.json()["status"] == status

    assert client.put(
        f"/orders/{order_id}/status",
        json={"status": "Cancelled"},
    ).status_code == 400


def test_sales_order_cancellation_restores_stock_once_and_is_terminal(
    client,
    create_product,
):
    product = create_product(stock_quantity=10)
    order = submit_order(client, product["id"], 4).json()
    assert client.get(f"/products/{product['id']}").json()["stock_quantity"] == 6

    cancellation = client.put(
        f"/orders/{order['id']}/status",
        json={"status": "Cancelled"},
    )
    assert cancellation.status_code == 200
    assert cancellation.json()["status"] == "Cancelled"
    assert client.get(f"/products/{product['id']}").json()["stock_quantity"] == 10

    repeated = client.put(
        f"/orders/{order['id']}/status",
        json={"status": "Cancelled"},
    )
    assert repeated.status_code == 200
    assert client.get(f"/products/{product['id']}").json()["stock_quantity"] == 10

    cannot_reopen = client.put(
        f"/orders/{order['id']}/status",
        json={"status": "Confirmed"},
    )
    assert cannot_reopen.status_code == 400
    assert client.get(f"/products/{product['id']}").json()["stock_quantity"] == 10
    assert client.delete(f"/orders/{order['id']}").status_code == 409


@pytest.mark.parametrize("status", ["Pending", "Confirmed"])
def test_sales_cancellation_restores_stock_only_from_cancellable_statuses(
    client,
    create_product,
    status,
):
    product = create_product(stock_quantity=10)
    order = submit_order(client, product["id"], 3).json()
    if status == "Confirmed":
        response = client.put(
            f"/orders/{order['id']}/status",
            json={"status": status},
        )
        assert response.status_code == 200

    response = client.put(
        f"/orders/{order['id']}/status",
        json={"status": "Cancelled"},
    )
    assert response.status_code == 200
    assert client.get(f"/products/{product['id']}").json()["stock_quantity"] == 10


def test_sales_order_rejects_unknown_status(client, create_product):
    product = create_product()
    order = submit_order(client, product["id"]).json()

    response = client.put(
        f"/orders/{order['id']}/status",
        json={"status": "Returned"},
    )
    assert response.status_code == 400
