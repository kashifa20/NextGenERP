from pydantic import BaseModel


class PurchaseOrderCreate(BaseModel):
    supplier_id: int
    product_id: int
    quantity: int
    unit_price: float


class PurchaseOrderStatusUpdate(BaseModel):
    status: str