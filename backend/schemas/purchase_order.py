from pydantic import BaseModel, StrictInt


class PurchaseOrderCreate(BaseModel):
    supplier_id: int
    product_id: int
    quantity: StrictInt
    unit_price: float


class PurchaseOrderStatusUpdate(BaseModel):
    status: str