from database import engine
import models

def clear_database():
    print("Dropping all tables...")
    models.Base.metadata.drop_all(bind=engine)
    
    print("Recreating all tables...")
    models.Base.metadata.create_all(bind=engine)
    
    print("Database cleared successfully!")

if __name__ == "__main__":
    clear_database()