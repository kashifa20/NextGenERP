from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.connection import engine
from models.category import Category

router = APIRouter(prefix="/categories", tags=["Categories"])


def get_db():
    with Session(engine) as session:
        yield session


@router.post("/")
def create_category(name: str, description: str = "", db: Session = Depends(get_db)):
    new_category = Category(
        name=name,
        description=description
    )

    db.add(new_category)
    db.commit()
    db.refresh(new_category)

    return new_category


@router.get("/")
def get_categories(db: Session = Depends(get_db)):
    return db.query(Category).all()