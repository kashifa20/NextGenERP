from pydantic import BaseModel, StrictInt


class OrderCreate(BaseModel):
    customer_name: str
    customer_email: str | None = None
    product_id: int
    quantity: StrictInt


class OrderUpdate(BaseModel):
    customer_name: str
    customer_email: str | None = None


class OrderStatusUpdate(BaseModel):
    status: str