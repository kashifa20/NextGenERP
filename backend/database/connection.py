import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL must be set before starting the backend; see .env.example."
    )

engine = create_engine(DATABASE_URL, pool_pre_ping=True)

Base = declarative_base()