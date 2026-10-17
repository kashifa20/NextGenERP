import math

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from database.connection import engine
from models.category import Category
from models.order import Order
from models.product import Product
from models.purchase_order import PurchaseOrder
from schemas.product import ProductCreate


router = APIRouter(
    prefix="/products",
    tags=["Products"],
    dependencies=[Depends(get_current_user)],
)


def get_db():
    with Session(engine) as session:
        yield session


def validate_product(product_data: ProductCreate, db: Session, product_id: int | None = None):
    name = product_data.name.strip()
    sku = product_data.sku.strip()

    if not name:
        raise HTTPException(status_code=400, detail="Product name is required")
    if not sku:
        raise HTTPException(status_code=400, detail="Product SKU is required")
    if not math.isfinite(product_data.price) or product_data.price < 0:
        raise HTTPException(status_code=400, detail="Product price must be a finite number of 0 or more")
    if product_data.stock_quantity < 0:
        raise HTTPException(status_code=400, detail="Stock quantity cannot be negative")
    if product_data.reorder_level < 0:
        raise HTTPException(status_code=400, detail="Reorder level cannot be negative")

    if product_data.category_id is not None:
        category = db.get(Category, product_data.category_id)
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")

    duplicate_sku = db.query(Product).filter(Product.sku == sku)
    if product_id is not None:
        duplicate_sku = duplicate_sku.filter(Product.id != product_id)
    if duplicate_sku.first():
        raise HTTPException(status_code=409, detail="A product with this SKU already exists")

    return name, sku


@router.post("/")
def create_product(product: ProductCreate, db: Session = Depends(get_db)):
    name, sku = validate_product(product, db)
    new_product = Product(
        name=name,
        sku=sku,
        price=product.price,
        stock_quantity=product.stock_quantity,
        reorder_level=product.reorder_level,
        category_id=product.category_id
    )

    db.add(new_product)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Product could not be saved because its SKU or category conflicts with existing data",
        ) from error
    db.refresh(new_product)

    return new_product


@router.get("/")
def get_products(db: Session = Depends(get_db)):
    products = db.query(Product).all()
    return products


@router.get("/{product_id}")
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    return product

@router.put("/{product_id}")
def update_product(
    product_id: int,
    product_data: ProductCreate,
    db: Session = Depends(get_db)
):
    product = (
        db.query(Product)
        .filter(Product.id == product_id)
        .with_for_update()
        .first()
    )

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    name, sku = validate_product(product_data, db, product_id)
    product.name = name
    product.sku = sku
    product.price = product_data.price
    product.stock_quantity = product_data.stock_quantity
    product.reorder_level = product_data.reorder_level
    product.category_id = product_data.category_id

    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Product could not be saved because its SKU or category conflicts with existing data",
        ) from error
    db.refresh(product)

    return product


@router.delete("/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db)):
    product = (
        db.query(Product)
        .filter(Product.id == product_id)
        .with_for_update()
        .first()
    )

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    if db.query(Order.id).filter(Order.product_id == product_id).first():
        raise HTTPException(
            status_code=409,
            detail="Product cannot be deleted because it is referenced by sales orders",
        )

    if db.query(PurchaseOrder.id).filter(PurchaseOrder.product_id == product_id).first():
        raise HTTPException(
            status_code=409,
            detail="Product cannot be deleted because it is referenced by purchase orders",
        )

    db.delete(product)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Product cannot be deleted while it is referenced by existing records",
        ) from error
    return {"message": "Product deleted successfully"}