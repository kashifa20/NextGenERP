from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from auth.security import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    hash_password,
    verify_password,
)
from database.connection import engine
from models.user import User
from schemas.auth import TokenResponse, UserLogin, UserRegistration, UserResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])


def get_db():
    with Session(engine) as session:
        yield session


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserRegistration, db: Session = Depends(get_db)):
    username = user_data.username.lower()
    user = User(username=username, password_hash=hash_password(user_data.password))
    try:
        db.add(user)
        db.flush()
        access_token = create_access_token(user.id)
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username is already registered",
        ) from error
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to register account",
        ) from error

    db.refresh(user)
    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    user = (
        db.query(User)
        .filter(User.username == user_data.username.lower())
        .first()
    )
    hashed_password = user.password_hash if user is not None else DUMMY_PASSWORD_HASH
    if not verify_password(user_data.password, hashed_password) or user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return TokenResponse(
        access_token=create_access_token(user.id),
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
def get_me(user: User = Depends(get_current_user)):
    return user
