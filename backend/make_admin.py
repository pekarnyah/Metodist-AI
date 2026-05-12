import sys
import os

# Ensure local imports work when running as a script
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from db.database import SessionLocal
from db.models import User


def make_me_owner(email: str) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"Error: user with email {email} not found.")
            return

        user.role = "Owner"
        user.is_admin = True
        user.is_active = True
        user.free_generations = 9999

        db.commit()
        print(f"Success: {email} is now Owner.")
        print("Status: Active | Role: Owner | Credits: 9999")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    # Usage: python make_admin.py your@email.com
    email = None
    if len(sys.argv) > 1:
        email = sys.argv[1].strip()
    if not email:
        email = os.getenv("OWNER_EMAIL", "").strip()
    if not email:
        print("Usage: python make_admin.py your@email.com or set OWNER_EMAIL env var")
        sys.exit(1)
    make_me_owner(email)
