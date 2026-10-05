from sqlalchemy import Column, Float, Integer, String

from database.connection import Base


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)
    lead_time_days = Column(Integer, default=0)
    performance_rating = Column(Float, nullable=True)