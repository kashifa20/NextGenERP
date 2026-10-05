from pydantic import BaseModel


class SupplierCreate(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    lead_time_days: int = 0
    performance_rating: float | None = None