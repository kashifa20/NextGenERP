import math

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from database.connection import engine
from models.product import Product
from models.purchase_order import PurchaseOrder
from models.supplier import Supplier
from schemas.purchase_order import PurchaseOrderCreate, PurchaseOrderStatusUpdate


router = APIRouter(
    prefix="/purchase-orders",
    tags=["Purchase Orders"],
    dependencies=[Depends(get_current_user)],
)

STATUS_TRANSITIONS = {
    "Pending": {"Approved", "Cancelled"},
    "Approved": {"Ordered", "Cancelled"},
    "Ordered": {"Received", "Cancelled"},
    "Received": set(),
    "Cancelled": set(),
}


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

    if not math.isfinite(purchase_order_data.unit_price) or purchase_order_data.unit_price < 0:
        raise HTTPException(
            status_code=400,
            detail="Unit price must be a finite number of 0 or more",
        )

    new_purchase_order = PurchaseOrder(
        supplier_id=purchase_order_data.supplier_id,
        product_id=purchase_order_data.product_id,
        quantity=purchase_order_data.quantity,
        unit_price=purchase_order_data.unit_price,
        total_amount=purchase_order_data.unit_price * purchase_order_data.quantity,
        status="Pending",
    )

    db.add(new_purchase_order)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Purchase order could not be saved because its supplier or product no longer exists",
        ) from error
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
    purchase_order = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.id == purchase_order_id)
        .with_for_update()
        .first()
    )

    if not purchase_order:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    if status_data.status == purchase_order.status:
        return purchase_order

    allowed_statuses = STATUS_TRANSITIONS.get(purchase_order.status)
    if allowed_statuses is None or status_data.status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot change purchase order status from "
                f"{purchase_order.status} to {status_data.status}"
            ),
        )

    if status_data.status == "Received":
        product = (
            db.query(Product)
            .filter(Product.id == purchase_order.product_id)
            .with_for_update()
            .first()
        )

        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        if product.stock_quantity is None or product.stock_quantity < 0:
            raise HTTPException(status_code=409, detail="Product inventory quantity is invalid")

        product.stock_quantity += purchase_order.quantity

    purchase_order.status = status_data.status
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise
    db.refresh(purchase_order)
    return purchase_order


@router.delete("/{purchase_order_id}")
def delete_purchase_order(purchase_order_id: int, db: Session = Depends(get_db)):
    purchase_order = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.id == purchase_order_id)
        .with_for_update()
        .first()
    )

    if not purchase_order:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    if purchase_order.status == "Received":
        raise HTTPException(
            status_code=409,
            detail="A received purchase order cannot be deleted because it records received stock",
        )

    db.delete(purchase_order)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Purchase order cannot be deleted while it is referenced by existing records",
        ) from error
    return {"message": "Purchase order deleted successfully"}