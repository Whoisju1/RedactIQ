import os
import shutil
import uuid
from typing import List
from fastapi import FastAPI, File, UploadFile, Depends, HTTPException, BackgroundTasks, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import engine, SessionLocal, get_db
import models
import fitz  # PyMuPDF
from engines.ocr import OCREngineWrapper
from engines.analyzer import AnalyzerEngineWrapper

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

from pydantic import BaseModel

class ManualRedactionCreate(BaseModel):
    type: str  # "TEXT" or "RECTANGLE"
    page_number: int
    bounding_box: dict

@app.get("/api/v1/documents/{document_id}/status")
def get_document_status(document_id: str, db: Session = Depends(get_db)):
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    entities = db.query(models.DetectedEntity).filter(models.DetectedEntity.document_id == document_id).all()
    redactions = db.query(models.ManualRedaction).filter(models.ManualRedaction.document_id == document_id).all()
    
    return {
        "id": doc.id,
        "filename": doc.filename,
        "status": doc.status,
        "page_count": doc.page_count,
        "entities": [
            {
                "id": e.id,
                "entity_type": e.entity_type,
                "text_value": e.text_value,
                "page_number": e.page_number,
                "bounding_box": e.bounding_box,
                "confidence": e.confidence,
                "is_dismissed": e.is_dismissed
            } for e in entities
        ],
        "manual_redactions": [
            {
                "id": r.id,
                "type": r.type.value if hasattr(r.type, 'value') else r.type,
                "page_number": r.page_number,
                "bounding_box": r.bounding_box
            } for r in redactions
        ]
    }

@app.post("/api/v1/documents/{document_id}/redactions")
def create_manual_redaction(document_id: str, redaction: ManualRedactionCreate, db: Session = Depends(get_db)):
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        r_type = models.RedactionType(redaction.type)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid redaction type")

    db_redaction = models.ManualRedaction(
        id=str(uuid.uuid4()),
        document_id=doc.id,
        type=r_type,
        page_number=redaction.page_number,
        bounding_box=redaction.bounding_box
    )
    db.add(db_redaction)
    db.commit()
    db.refresh(db_redaction)
    
    return {
        "id": db_redaction.id,
        "type": db_redaction.type.value if hasattr(db_redaction.type, 'value') else db_redaction.type,
        "page_number": db_redaction.page_number,
        "bounding_box": db_redaction.bounding_box
    }

@app.get("/api/v1/documents/{document_id}/render/{page_number}")
def render_document_page(document_id: str, page_number: int, db: Session = Depends(get_db)):
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    try:
        with fitz.open(doc.file_path) as pdf:
            if page_number < 1 or page_number > len(pdf):
                raise HTTPException(status_code=400, detail="Invalid page number")
            
            page = pdf[page_number - 1]
            # Higher resolution pixmap
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            img_data = pix.tobytes("png")
            
            # Return image with page dimensions as custom headers for scaling
            return Response(
                content=img_data, 
                media_type="image/png",
                headers={
                    "X-Page-Width": str(page.rect.width),
                    "X-Page-Height": str(page.rect.height),
                    "Access-Control-Expose-Headers": "X-Page-Width, X-Page-Height"
                }
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error rendering page: {e}")

@app.patch("/api/v1/entities/{entity_id}/dismiss")
def dismiss_entity(entity_id: str, db: Session = Depends(get_db)):
    entity = db.query(models.DetectedEntity).filter(models.DetectedEntity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    
    entity.is_dismissed = True
    db.commit()
    return {"status": "success"}

@app.patch("/api/v1/entities/{entity_id}/restore")
def restore_entity(entity_id: str, db: Session = Depends(get_db)):
    entity = db.query(models.DetectedEntity).filter(models.DetectedEntity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    
    entity.is_dismissed = False
    db.commit()
    return {"status": "success"}

@app.delete("/api/v1/redactions/{redaction_id}")
def delete_manual_redaction(redaction_id: str, db: Session = Depends(get_db)):
    redaction = db.query(models.ManualRedaction).filter(models.ManualRedaction.id == redaction_id).first()
    if not redaction:
        raise HTTPException(status_code=404, detail="Redaction not found")
    
    db.delete(redaction)
    db.commit()
    return {"status": "success"}

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
    db = SessionLocal()
    analyzer = AnalyzerEngineWrapper()
    try:
        doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
        if not doc:
            return

        file_ext = os.path.splitext(doc.file_path)[1].lower()
        page_count = 0

        if file_ext == ".pdf":
            with fitz.open(doc.file_path) as pdf:
                page_count = len(pdf)
                doc.page_count = page_count
                
                for page_num, page in enumerate(pdf):
                    text = page.get_text()
                    if not text.strip():
                        continue
                    
                    # Analyze text for PII
                    analysis_results = analyzer.analyze_text(text=text)
                    
                    for result in analysis_results:
                        # Extract the actual text string for the entity
                        entity_text = text[result.start:result.end]
                        
                        # Find bounding boxes for this text on the page
                        # Note: search_for returns a list of Rects
                        areas = page.search_for(entity_text)
                        
                        for rect in areas:
                            # Save detected entity to DB
                            db_entity = models.DetectedEntity(
                                id=str(uuid.uuid4()),
                                document_id=doc.id,
                                entity_type=result.entity_type,
                                text_value=entity_text,
                                page_number=page_num + 1,
                                bounding_box={
                                    "x1": rect.x0,
                                    "y1": rect.y0,
                                    "x2": rect.x1,
                                    "y2": rect.y1
                                },
                                confidence=result.score
                            )
                            db.add(db_entity)

        # Update status to READY_FOR_REVIEW
        doc.status = models.DocumentStatus.READY_FOR_REVIEW
        db.commit()
    except Exception as e:
        if doc:
            doc.status = models.DocumentStatus.ERROR
            db.commit()
        print(f"Error processing document {doc_id}: {e}")
    finally:
        db.close()
