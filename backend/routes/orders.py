from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from database.connection import engine
from models.order import Order
from models.product import Product
from schemas.order import OrderCreate, OrderStatusUpdate, OrderUpdate


router = APIRouter(
    prefix="/orders",
    tags=["Orders"],
    dependencies=[Depends(get_current_user)],
)

STATUS_TRANSITIONS = {
    "Pending": {"Confirmed", "Cancelled"},
    "Confirmed": {"Shipped", "Cancelled"},
    "Shipped": {"Delivered"},
    "Delivered": set(),
    "Cancelled": set(),
}


def get_db():
    with Session(engine) as session:
        yield session


@router.post("/")
def create_order(order_data: OrderCreate, db: Session = Depends(get_db)):
    customer_name = order_data.customer_name.strip()
    if not customer_name:
        raise HTTPException(status_code=400, detail="Customer name is required")

    product = (
        db.query(Product)
        .filter(Product.id == order_data.product_id)
        .with_for_update()
        .first()
    )

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if order_data.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than 0")

    if product.stock_quantity is None or product.stock_quantity < 0:
        raise HTTPException(status_code=409, detail="Product inventory quantity is invalid")

    if product.stock_quantity < order_data.quantity:
        raise HTTPException(status_code=400, detail="Insufficient stock for this product")

    total_amount = product.price * order_data.quantity
    product.stock_quantity -= order_data.quantity

    new_order = Order(
        customer_name=customer_name,
        customer_email=order_data.customer_email,
        product_id=order_data.product_id,
        quantity=order_data.quantity,
        total_amount=total_amount,
        status="Pending",
    )

    db.add(new_order)
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise
    db.refresh(new_order)
    return new_order


@router.get("/")
def get_orders(db: Session = Depends(get_db)):
    return db.query(Order).all()


@router.get("/{order_id}")
def get_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return order


@router.put("/{order_id}")
def update_order(
    order_id: int,
    order_data: OrderUpdate,
    db: Session = Depends(get_db),
):
    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order.customer_name = order_data.customer_name
    order.customer_email = order_data.customer_email

    db.commit()
    db.refresh(order)
    return order


@router.put("/{order_id}/status")
def update_order_status(
    order_id: int,
    status_data: OrderStatusUpdate,
    db: Session = Depends(get_db),
):
    order = (
        db.query(Order)
        .filter(Order.id == order_id)
        .with_for_update()
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if status_data.status == order.status:
        return order

    allowed_statuses = STATUS_TRANSITIONS.get(order.status)
    if allowed_statuses is None or status_data.status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot change sales order status from {order.status} to {status_data.status}",
        )

    if status_data.status == "Cancelled":
        product = (
            db.query(Product)
            .filter(Product.id == order.product_id)
            .with_for_update()
            .first()
        )

        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        if (
            order.quantity is None
            or order.quantity <= 0
            or product.stock_quantity is None
            or product.stock_quantity < 0
        ):
            raise HTTPException(
                status_code=409,
                detail="Sales order quantity or product inventory data is invalid",
            )

        product.stock_quantity += order.quantity

    order.status = status_data.status
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise
    db.refresh(order)
    return order


@router.delete("/{order_id}")
def delete_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    raise HTTPException(
        status_code=409,
        detail="Sales order history cannot be deleted; change its status to Cancelled instead",
    )