
from typing import Optional, List
from pydantic import BaseModel
from fastapi import FastAPI, APIRouter

app = FastAPI()

class User(BaseModel):
    id: int
    name: str
    age: Optional[int] = None

@app.get("/users", response_model=List[User])
def get_users(limit: int = 10):
    return []

@app.post("/users")
def create_user(user: User):
    return user
