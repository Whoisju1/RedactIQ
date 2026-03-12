import os
import shutil
import uuid
from typing import List
from fastapi import FastAPI, File, UploadFile, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import engine, SessionLocal, get_db
import models
import fitz  # PyMuPDF
from engines.ocr import OCREngineWrapper

# Ensure tables exist
models.Base.metadata.create_all(bind=engine)

# Ensure temp storage exists
TEMP_STORAGE_DIR = os.getenv("TEMP_STORAGE_DIR", "./temp_storage")
os.makedirs(TEMP_STORAGE_DIR, exist_ok=True)

app = FastAPI(title="RedactIQ API")

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

@app.post("/api/v1/documents")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # Validate file type
    allowed_extensions = {".pdf", ".docx", ".jpg", ".jpeg", ".png"}
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"Unsupported file format: {file_ext}")

    # Create document record
    doc_id = str(uuid.uuid4())
    file_path = os.path.join(TEMP_STORAGE_DIR, f"{doc_id}{file_ext}")
    
    db_doc = models.Document(
        id=doc_id,
        filename=file.filename,
        file_path=file_path,
        status=models.DocumentStatus.PROCESSING
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)

    # Save file locally
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Start ingestion background task
    background_tasks.add_task(process_document_ingestion, db_doc.id)

    return {
        "id": db_doc.id,
        "filename": db_doc.filename,
        "status": db_doc.status
    }

def process_document_ingestion(doc_id: str):
    # This would normally be in a separate worker, but for MVP we use background tasks
    db = SessionLocal()
    try:
        doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
        if not doc:
            return

        file_ext = os.path.splitext(doc.file_path)[1].lower()
        
        has_text = False
        page_count = 0

        if file_ext == ".pdf":
            # Check for text layer using PyMuPDF
            with fitz.open(doc.file_path) as pdf:
                page_count = len(pdf)
                for page in pdf:
                    if page.get_text().strip():
                        has_text = True
                        break
        
        doc.page_count = page_count
        
        # If it's an image or scanned PDF without text, we'd eventually run OCR
        if not has_text and file_ext in [".jpg", ".jpeg", ".png", ".pdf"]:
            # Route to OCR Engine if needed (simulated for now or calling wrapper)
            # ocr_engine = OCREngineWrapper()
            # text = ocr_engine.extract_text(doc.file_path)
            pass

        doc.status = models.DocumentStatus.READY_FOR_REVIEW
        db.commit()
    except Exception as e:
        if doc:
            doc.status = models.DocumentStatus.ERROR
            db.commit()
        print(f"Error processing document {doc_id}: {e}")
    finally:
        db.close()
