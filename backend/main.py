import os
import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text

from database.connection import Base, engine
from models.category import Category
from models.user import User
from models.product import Product
from models.supplier import Supplier
from models.order import Order
from models.purchase_order import PurchaseOrder
from models.inventory_transaction import InventoryTransaction
from routes.products import router as product_router
from routes.categories import router as category_router
from routes.suppliers import router as supplier_router
from routes.orders import router as order_router
from routes.purchase_orders import router as purchase_order_router
from routes.inventory_transactions import router as inventory_transaction_router
from routes.auth import router as auth_router

logger = logging.getLogger(__name__)
app = FastAPI()


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, error: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "detail": [
                {
                    "loc": list(issue["loc"]),
                    "msg": issue["msg"],
                    "type": issue["type"],
                }
                for issue in error.errors()
            ]
        },
    )


cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]
if "*" in cors_origins:
    raise RuntimeError("CORS_ORIGINS must list explicit origins; wildcards are not allowed.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

Base.metadata.create_all(bind=engine)

app.include_router(auth_router)
app.include_router(product_router)
app.include_router(category_router)
app.include_router(supplier_router)
app.include_router(order_router)
app.include_router(purchase_order_router)
app.include_router(inventory_transaction_router)

@app.get("/")
def home():
    return {
        "message": "NextGenERP API is running!"
    }


@app.get("/health")
@app.get("/database-test", include_in_schema=False)
def database_test():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as error:
        logger.exception("Database health check failed")
        raise HTTPException(
            status_code=503,
            detail="Database is unavailable",
        ) from error