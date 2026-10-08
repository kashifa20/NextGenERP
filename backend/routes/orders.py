from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database.connection import engine
from models.order import Order
from models.product import Product
from schemas.order import OrderCreate, OrderStatusUpdate, OrderUpdate


router = APIRouter(prefix="/orders", tags=["Orders"])

ALLOWED_STATUSES = {"Pending", "Confirmed", "Shipped", "Delivered", "Cancelled"}


def get_db():
    with Session(engine) as session:
        yield session


@router.post("/")
def create_order(order_data: OrderCreate, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == order_data.product_id).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if order_data.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than 0")

    if product.stock_quantity < order_data.quantity:
        raise HTTPException(status_code=400, detail="Insufficient stock for this product")

    total_amount = product.price * order_data.quantity
    product.stock_quantity -= order_data.quantity

    new_order = Order(
        customer_name=order_data.customer_name,
        customer_email=order_data.customer_email,
        product_id=order_data.product_id,
        quantity=order_data.quantity,
        total_amount=total_amount,
        status="Pending",
    )

    db.add(new_order)
    db.commit()
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
    if status_data.status not in ALLOWED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Invalid status. Allowed statuses: Pending, Confirmed, Shipped, Delivered, Cancelled",
        )

    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order.status = status_data.status
    db.commit()
    db.refresh(order)
    return order


@router.delete("/{order_id}")
def delete_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    db.delete(order)
    db.commit()
    return {"message": "Order deleted successfully"}