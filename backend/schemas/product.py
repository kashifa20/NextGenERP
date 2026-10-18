from pydantic import BaseModel, StrictInt


class ProductCreate(BaseModel):
    name: str
    sku: str
    price: float
    stock_quantity: StrictInt = 0
    reorder_level: int = 10
    category_id: int | None = None