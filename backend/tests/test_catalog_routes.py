def test_categories_create_list_update_and_reject_duplicate(client, create_category):
    category = create_category()

    listed = client.get("/categories/")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [category["id"]]

    duplicate = client.post(
        "/categories/",
        params={"name": category["name"], "description": ""},
    )
    assert duplicate.status_code == 409

    updated = client.put(
        f"/categories/{category['id']}",
        params={"name": "Updated category", "description": "Updated"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Updated category"


def test_category_cannot_be_deleted_while_product_references_it(
    client,
    create_category,
    create_product,
):
    category = create_category()
    create_product(category_id=category["id"])

    response = client.delete(f"/categories/{category['id']}")
    assert response.status_code == 409
    assert client.get(f"/categories/").json()[0]["id"] == category["id"]


def test_product_crud_and_invalid_references(client, create_product):
    product = create_product()

    listed = client.get("/products/")
    assert listed.status_code == 200
    assert listed.json()[0]["sku"] == product["sku"]
    assert client.get(f"/products/{product['id']}").status_code == 200

    updated = client.put(
        f"/products/{product['id']}",
        json={
            "name": "Updated product",
            "sku": product["sku"],
            "price": 15,
            "stock_quantity": 8,
            "reorder_level": 2,
            "category_id": None,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["stock_quantity"] == 8

    assert client.get("/products/999999").status_code == 404
    invalid_id_update = client.put(
        "/products/999999",
        json={
            "name": "Missing",
            "sku": "MISSING",
            "price": 1,
            "stock_quantity": 0,
            "reorder_level": 0,
        },
    )
    assert invalid_id_update.status_code == 404
    assert client.delete("/products/999999").status_code == 404


def test_product_rejects_invalid_quantity_and_category(client):
    payload = {
        "name": "Invalid product",
        "sku": "INVALID-SKU",
        "price": 10,
        "stock_quantity": -1,
        "reorder_level": 0,
    }
    assert client.post("/products/", json=payload).status_code == 400

    payload["stock_quantity"] = 0
    payload["category_id"] = 999999
    assert client.post("/products/", json=payload).status_code == 404


def test_product_delete_is_blocked_when_order_references_it(
    client,
    create_product,
):
    product = create_product()
    order = client.post(
        "/orders/",
        json={
            "customer_name": "Test customer",
            "product_id": product["id"],
            "quantity": 1,
        },
    )
    assert order.status_code == 200

    assert client.delete(f"/products/{product['id']}").status_code == 409


def test_supplier_crud_and_invalid_id(client, create_supplier):
    supplier = create_supplier()

    listed = client.get("/suppliers/")
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == supplier["id"]

    response = client.put(
        f"/suppliers/{supplier['id']}",
        json={
            "name": "Updated supplier",
            "email": None,
            "phone": None,
            "address": None,
            "lead_time_days": 4,
            "performance_rating": 4,
        },
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Updated supplier"
    assert client.get("/suppliers/999999").status_code == 404
    assert client.put(
        "/suppliers/999999",
        json={"name": "Missing", "lead_time_days": 0},
    ).status_code == 404
    assert client.delete("/suppliers/999999").status_code == 404


def test_supplier_rejects_invalid_name_lead_time_and_rating(client):
    base = {"name": "Valid supplier"}
    for payload in (
        {**base, "name": "   "},
        {**base, "lead_time_days": -1},
        {**base, "lead_time_days": 1.5},
        {**base, "performance_rating": -0.1},
        {**base, "performance_rating": 5.1},
        {**base, "performance_rating": "NaN"},
    ):
        assert client.post("/suppliers/", json=payload).status_code == 422

    assert client.get("/suppliers/").json() == []
