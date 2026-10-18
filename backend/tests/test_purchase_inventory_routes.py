import pytest


def submit_purchase_order(client, supplier_id, product_id, quantity=4):
    return client.post(
        "/purchase-orders/",
        json={
            "supplier_id": supplier_id,
            "product_id": product_id,
            "quantity": quantity,
            "unit_price": 8.5,
        },
    )


def set_purchase_order_status(client, purchase_order_id, status):
    return client.put(
        f"/purchase-orders/{purchase_order_id}/status",
        json={"status": status},
    )


def test_purchase_order_rejects_invalid_relationships_and_quantities(
    client,
    create_product,
    create_supplier,
):
    product = create_product()
    supplier = create_supplier()

    assert submit_purchase_order(client, 999999, product["id"]).status_code == 404
    assert submit_purchase_order(client, supplier["id"], 999999).status_code == 404
    assert submit_purchase_order(client, supplier["id"], product["id"], 0).status_code == 400
    assert submit_purchase_order(client, supplier["id"], product["id"], -1).status_code == 400
    assert submit_purchase_order(client, supplier["id"], product["id"], 1.5).status_code == 422


def test_purchase_order_receives_stock_exactly_once_and_cannot_be_deleted(
    client,
    create_product,
    create_supplier,
):
    product = create_product(stock_quantity=5)
    supplier = create_supplier()
    purchase_order = submit_purchase_order(
        client,
        supplier["id"],
        product["id"],
        4,
    ).json()

    direct_receive = set_purchase_order_status(
        client,
        purchase_order["id"],
        "Received",
    )
    assert direct_receive.status_code == 400
    assert client.get(f"/products/{product['id']}").json()["stock_quantity"] == 5

    for status in ("Approved", "Ordered"):
        response = set_purchase_order_status(
            client,
            purchase_order["id"],
            status,
        )
        assert response.status_code == 200
        assert response.json()["status"] == status

    received = set_purchase_order_status(
        client,
        purchase_order["id"],
        "Received",
    )
    assert received.status_code == 200
    assert client.get(f"/products/{product['id']}").json()["stock_quantity"] == 9
    history = client.get("/inventory-transactions/").json()
    assert len(history) == 2
    assert history[0]["transaction_type"] == "Stock In"
    assert history[0]["quantity"] == 4
    assert history[0]["previous_stock"] == 5
    assert history[0]["new_stock"] == 9
    assert "Purchase order #" in history[0]["reason"]

    repeated = set_purchase_order_status(
        client,
        purchase_order["id"],
        "Received",
    )
    assert repeated.status_code == 200
    assert client.get(f"/products/{product['id']}").json()["stock_quantity"] == 9
    assert len(client.get("/inventory-transactions/").json()) == 2

    assert set_purchase_order_status(
        client,
        purchase_order["id"],
        "Cancelled",
    ).status_code == 400
    assert client.delete(
        f"/purchase-orders/{purchase_order['id']}"
    ).status_code == 409
    assert client.delete(f"/suppliers/{supplier['id']}").status_code == 409
    assert client.delete(f"/products/{product['id']}").status_code == 409
    assert client.get(f"/products/{product['id']}").json()["stock_quantity"] == 9


def test_approved_purchase_order_can_be_received_once_with_audit_history(
    client,
    create_product,
    create_supplier,
):
    product = create_product(stock_quantity=5)
    supplier = create_supplier()
    purchase_order = submit_purchase_order(
        client,
        supplier["id"],
        product["id"],
        4,
    ).json()
    assert set_purchase_order_status(
        client,
        purchase_order["id"],
        "Approved",
    ).status_code == 200

    received = set_purchase_order_status(
        client,
        purchase_order["id"],
        "Received",
    )

    assert received.status_code == 200
    assert received.json()["status"] == "Received"
    assert client.get(f"/products/{product['id']}").json()["stock_quantity"] == 9
    receipt_history = [
        transaction
        for transaction in client.get("/inventory-transactions/").json()
        if transaction["reason"] == f"Purchase order #{purchase_order['id']} received"
    ]
    assert len(receipt_history) == 1
    assert receipt_history[0]["product_id"] == product["id"]
    assert receipt_history[0]["transaction_type"] == "Stock In"
    assert receipt_history[0]["quantity"] == 4
    assert receipt_history[0]["previous_stock"] == 5
    assert receipt_history[0]["new_stock"] == 9

    repeated = set_purchase_order_status(
        client,
        purchase_order["id"],
        "Received",
    )

    assert repeated.status_code == 200
    assert repeated.json()["status"] == "Received"
    assert client.get(f"/products/{product['id']}").json()["stock_quantity"] == 9
    assert len([
        transaction
        for transaction in client.get("/inventory-transactions/").json()
        if transaction["reason"] == f"Purchase order #{purchase_order['id']} received"
    ]) == 1


def test_cancelling_unreceived_purchase_order_never_changes_stock(
    client,
    create_product,
    create_supplier,
):
    product = create_product(stock_quantity=5)
    supplier = create_supplier()
    purchase_order = submit_purchase_order(
        client,
        supplier["id"],
        product["id"],
    ).json()

    cancelled = set_purchase_order_status(
        client,
        purchase_order["id"],
        "Cancelled",
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "Cancelled"
    assert client.get(f"/products/{product['id']}").json()["stock_quantity"] == 5
    history = client.get("/inventory-transactions/").json()
    assert len(history) == 1
    assert "Initial stock" in history[0]["reason"]
    assert set_purchase_order_status(
        client,
        purchase_order["id"],
        "Received",
    ).status_code == 400

    assert set_purchase_order_status(
        client,
        purchase_order["id"],
        "Approved",
    ).status_code == 400
    assert client.get(f"/products/{product['id']}").json()["stock_quantity"] == 5
    assert len(client.get("/inventory-transactions/").json()) == 1
    assert client.delete(
        f"/purchase-orders/{purchase_order['id']}"
    ).status_code == 200
    assert client.get(f"/products/{product['id']}").json()["stock_quantity"] == 5


@pytest.mark.parametrize("status", ["Approved", "Ordered"])
def test_purchase_order_workflow_transitions(
    client,
    create_product,
    create_supplier,
    status,
):
    product = create_product()
    supplier = create_supplier()
    purchase_order = submit_purchase_order(
        client,
        supplier["id"],
        product["id"],
    ).json()

    if status == "Ordered":
        assert set_purchase_order_status(
            client,
            purchase_order["id"],
            "Approved",
        ).status_code == 200

    response = set_purchase_order_status(
        client,
        purchase_order["id"],
        status,
    )
    assert response.status_code == 200
    assert response.json()["status"] == status
    assert client.get(f"/products/{product['id']}").json()["stock_quantity"] == 10


def test_inventory_transactions_update_stock_and_record_history(
    client,
    create_product,
):
    product = create_product(stock_quantity=5)

    stock_in = client.post(
        "/inventory-transactions/",
        json={
            "product_id": product["id"],
            "transaction_type": "Stock In",
            "quantity": 3,
            "reason": "Received shipment",
        },
    )
    assert stock_in.status_code == 200
    assert stock_in.json()["previous_stock"] == 5
    assert stock_in.json()["new_stock"] == 8

    stock_out = client.post(
        "/inventory-transactions/",
        json={
            "product_id": product["id"],
            "transaction_type": "Stock Out",
            "quantity": 2,
            "reason": "Damaged goods",
        },
    )
    assert stock_out.status_code == 200
    assert stock_out.json()["previous_stock"] == 8
    assert stock_out.json()["new_stock"] == 6
    assert client.get(f"/products/{product['id']}").json()["stock_quantity"] == 6

    history = client.get("/inventory-transactions/")
    assert history.status_code == 200
    assert len(history.json()) == 3
    assert history.json()[0]["product_name"] == product["name"]


def test_inventory_transactions_reject_invalid_ids_quantities_and_stock_out(
    client,
    create_product,
):
    product = create_product(stock_quantity=2)
    payload = {
        "product_id": product["id"],
        "transaction_type": "Stock In",
        "quantity": 1,
        "reason": "Test movement",
    }

    invalid_product = {**payload, "product_id": 999999}
    assert client.post(
        "/inventory-transactions/",
        json=invalid_product,
    ).status_code == 404

    for quantity in (0, -1, 1.5):
        invalid_quantity = {**payload, "quantity": quantity}
        assert client.post(
            "/inventory-transactions/",
            json=invalid_quantity,
        ).status_code == 422

    invalid_type = {**payload, "transaction_type": "Adjustment"}
    assert client.post(
        "/inventory-transactions/",
        json=invalid_type,
    ).status_code == 422

    insufficient_stock = {
        **payload,
        "transaction_type": "Stock Out",
        "quantity": 3,
    }
    assert client.post(
        "/inventory-transactions/",
        json=insufficient_stock,
    ).status_code == 400
    assert client.get(f"/products/{product['id']}").json()["stock_quantity"] == 2
    history = client.get("/inventory-transactions/").json()
    assert len(history) == 1
