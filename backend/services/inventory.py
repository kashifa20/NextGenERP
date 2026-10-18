from typing import Literal

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.inventory_transaction import InventoryTransaction
from models.product import Product


def change_stock(
    db: Session,
    product: Product,
    transaction_type: Literal["Stock In", "Stock Out"],
    quantity: int,
    reason: str,
) -> InventoryTransaction:
    if product.stock_quantity is None or product.stock_quantity < 0:
        raise HTTPException(status_code=409, detail="Product inventory quantity is invalid")
    if quantity <= 0:
        raise HTTPException(status_code=409, detail="Inventory movement quantity is invalid")

    previous_stock = product.stock_quantity
    if transaction_type == "Stock Out":
        if quantity > previous_stock:
            raise HTTPException(
                status_code=400,
                detail="Insufficient stock for this inventory movement",
            )
        new_stock = previous_stock - quantity
    else:
        new_stock = previous_stock + quantity

    product.stock_quantity = new_stock
    transaction = InventoryTransaction(
        product_id=product.id,
        transaction_type=transaction_type,
        quantity=quantity,
        previous_stock=previous_stock,
        new_stock=new_stock,
        reason=reason,
    )
    db.add(transaction)
    return transaction
