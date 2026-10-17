from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator


class InventoryTransactionCreate(BaseModel):
    product_id: StrictInt
    transaction_type: Literal["Stock In", "Stock Out"]
    quantity: StrictInt = Field(gt=0)
    reason: str = Field(min_length=1)

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, reason: str) -> str:
        reason = reason.strip()
        if not reason:
            raise ValueError("Reason is required")
        return reason


class InventoryTransactionHistory(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    product_name: str
    transaction_type: Literal["Stock In", "Stock Out"]
    quantity: int
    previous_stock: int
    new_stock: int
    reason: str
    created_at: datetime
