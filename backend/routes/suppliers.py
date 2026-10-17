from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from database.connection import engine
from models.purchase_order import PurchaseOrder
from models.supplier import Supplier
from schemas.supplier import SupplierCreate


router = APIRouter(
    prefix="/suppliers",
    tags=["Suppliers"],
    dependencies=[Depends(get_current_user)],
)


def get_db():
    with Session(engine) as session:
        yield session


@router.post("/")
def create_supplier(supplier_data: SupplierCreate, db: Session = Depends(get_db)):
    new_supplier = Supplier(
        name=supplier_data.name,
        email=supplier_data.email,
        phone=supplier_data.phone,
        address=supplier_data.address,
        lead_time_days=supplier_data.lead_time_days,
        performance_rating=supplier_data.performance_rating,
    )

    db.add(new_supplier)
    db.commit()
    db.refresh(new_supplier)
    return new_supplier


@router.get("/")
def get_suppliers(db: Session = Depends(get_db)):
    return db.query(Supplier).all()


@router.get("/{supplier_id}")
def get_supplier(supplier_id: int, db: Session = Depends(get_db)):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()

    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    return supplier


@router.put("/{supplier_id}")
def update_supplier(
    supplier_id: int,
    supplier_data: SupplierCreate,
    db: Session = Depends(get_db),
):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()

    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    supplier.name = supplier_data.name
    supplier.email = supplier_data.email
    supplier.phone = supplier_data.phone
    supplier.address = supplier_data.address
    supplier.lead_time_days = supplier_data.lead_time_days
    supplier.performance_rating = supplier_data.performance_rating

    db.commit()
    db.refresh(supplier)
    return supplier


@router.delete("/{supplier_id}")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)):
    supplier = (
        db.query(Supplier)
        .filter(Supplier.id == supplier_id)
        .with_for_update()
        .first()
    )

    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    if db.query(PurchaseOrder.id).filter(PurchaseOrder.supplier_id == supplier_id).first():
        raise HTTPException(
            status_code=409,
            detail="Supplier cannot be deleted because it is referenced by purchase orders",
        )

    db.delete(supplier)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Supplier cannot be deleted while purchase orders reference it",
        ) from error
    return {"message": "Supplier deleted successfully"}