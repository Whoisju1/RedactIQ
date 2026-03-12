import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Enum, JSON
from sqlalchemy.orm import relationship
import enum
from database import Base

class DocumentStatus(str, enum.Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    READY_FOR_REVIEW = "READY_FOR_REVIEW"
    REDACTING = "REDACTING"
    COMPLETED = "COMPLETED"
    ERROR = "ERROR"

class RedactionType(str, enum.Enum):
    TEXT = "TEXT"
    RECTANGLE = "RECTANGLE"

def generate_uuid():
    return str(uuid.uuid4())

class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=generate_uuid, index=True)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    status = Column(Enum(DocumentStatus), default=DocumentStatus.QUEUED, nullable=False)
    page_count = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    entities = relationship("DetectedEntity", back_populates="document", cascade="all, delete-orphan")
    redactions = relationship("ManualRedaction", back_populates="document", cascade="all, delete-orphan")


class DetectedEntity(Base):
    __tablename__ = "detected_entities"

    id = Column(String, primary_key=True, default=generate_uuid, index=True)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    entity_type = Column(String, nullable=False)  # e.g., 'SSN'
    text_value = Column(String, nullable=False)
    page_number = Column(Integer, nullable=False)
    bounding_box = Column(JSON, nullable=False)
    confidence = Column(Float, nullable=False)
    is_dismissed = Column(Boolean, default=False, nullable=False)

    document = relationship("Document", back_populates="entities")


class ManualRedaction(Base):
    __tablename__ = "manual_redactions"

    id = Column(String, primary_key=True, default=generate_uuid, index=True)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    type = Column(Enum(RedactionType), nullable=False)
    page_number = Column(Integer, nullable=False)
    bounding_box = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    document = relationship("Document", back_populates="redactions")
