from fastapi import FastAPI

from database.connection import Base, engine
from models.category import Category
from models.product import Product
from routes.products import router as product_router
from routes.categories import router as category_router

app = FastAPI()


Base.metadata.create_all(bind=engine)

app.include_router(product_router)
app.include_router(category_router)

@app.get("/")
def home():
    return {
        "message": "NextGenERP API is running!"
    }


@app.get("/database-test")
def database_test():
    try:
        with engine.connect():
            return {
                "message": "Database connected successfully!"
            }
    except Exception as e:
        return {
            "message": "Database connection failed",
            "error": str(e)
        }