from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database.connection import engine
from models.product import Product
from models.purchase_order import PurchaseOrder
from models.supplier import Supplier
from schemas.purchase_order import PurchaseOrderCreate, PurchaseOrderStatusUpdate


router = APIRouter(prefix="/purchase-orders", tags=["Purchase Orders"])

ALLOWED_STATUSES = {"Pending", "Approved", "Ordered", "Received", "Cancelled"}


def get_db():
    with Session(engine) as session:
        yield session


@router.post("/")
def create_purchase_order(
    purchase_order_data: PurchaseOrderCreate,
    db: Session = Depends(get_db),
):
    supplier = db.query(Supplier).filter(
        Supplier.id == purchase_order_data.supplier_id
    ).first()

    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    product = db.query(Product).filter(
        Product.id == purchase_order_data.product_id
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if purchase_order_data.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than 0")

    if purchase_order_data.unit_price < 0:
        raise HTTPException(status_code=400, detail="Unit price cannot be negative")

    new_purchase_order = PurchaseOrder(
        supplier_id=purchase_order_data.supplier_id,
        product_id=purchase_order_data.product_id,
        quantity=purchase_order_data.quantity,
        unit_price=purchase_order_data.unit_price,
        total_amount=purchase_order_data.unit_price * purchase_order_data.quantity,
        status="Pending",
    )

    db.add(new_purchase_order)
    db.commit()
    db.refresh(new_purchase_order)
    return new_purchase_order


@router.get("/")
def get_purchase_orders(db: Session = Depends(get_db)):
    return db.query(PurchaseOrder).all()


@router.get("/{purchase_order_id}")
def get_purchase_order(purchase_order_id: int, db: Session = Depends(get_db)):
    purchase_order = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.id == purchase_order_id)
        .first()
    )

    if not purchase_order:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    return purchase_order


@router.put("/{purchase_order_id}/status")
def update_purchase_order_status(
    purchase_order_id: int,
    status_data: PurchaseOrderStatusUpdate,
    db: Session = Depends(get_db),
):
    if status_data.status not in ALLOWED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Invalid status. Allowed statuses: Pending, Approved, Ordered, Received, Cancelled",
        )

    purchase_order = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.id == purchase_order_id)
        .with_for_update()
        .first()
    )

    if not purchase_order:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    if purchase_order.status == "Received":
        if status_data.status != "Received":
            raise HTTPException(
                status_code=400,
                detail="A received purchase order cannot be changed to another status",
            )
        return purchase_order

    if status_data.status == "Received":
        product = (
            db.query(Product)
            .filter(Product.id == purchase_order.product_id)
            .with_for_update()
            .first()
        )

        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        product.stock_quantity += purchase_order.quantity

    purchase_order.status = status_data.status
    db.commit()
    db.refresh(purchase_order)
    return purchase_order


@router.delete("/{purchase_order_id}")
def delete_purchase_order(purchase_order_id: int, db: Session = Depends(get_db)):
    purchase_order = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.id == purchase_order_id)
        .first()
    )

    if not purchase_order:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    db.delete(purchase_order)
    db.commit()
    return {"message": "Purchase order deleted successfully"}