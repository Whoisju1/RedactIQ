"use client";

import { useState, useCallback, useRef } from "react";

type ProcessingStage = "Uploading" | "Extracting" | "Analyzing" | "Complete" | "Error";

interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface DetectedEntity {
  id: string;
  entity_type: string;
  text_value: string;
  page_number: number;
  bounding_box: BoundingBox;
  confidence: number;
  is_dismissed: boolean;
}

interface FileStatus {
  id: string;
  name: string;
  size: string;
  stage: ProcessingStage;
  progress: number;
  entities?: DetectedEntity[];
  page_count?: number;
}

export default function Home() {
  const [fileStatus, setFileStatus] = useState<FileStatus | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState<"upload" | "workspace">("upload");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageDimensions, setPageDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchDocumentStatus = useCallback(async (docId: string) => {
    try {
      const response = await fetch(`http://localhost:8000/api/v1/documents/${docId}/status`);
      if (response.ok) {
        const data = await response.json();
        setFileStatus(prev => prev ? { 
          ...prev, 
          stage: data.status === "READY_FOR_REVIEW" ? "Complete" : "Analyzing",
          progress: data.status === "READY_FOR_REVIEW" ? 100 : 66,
          entities: data.entities,
          page_count: data.page_count
        } : null);

        if (data.status === "READY_FOR_REVIEW") {
          return true; // Finished
        }
      }
    } catch (error) {
      console.error("Error fetching status:", error);
    }
    return false;
  }, []);

  const simulateProcessing = useCallback((docId: string, fileName: string, fileSize: number) => {
    const sizeInMB = (fileSize / (1024 * 1024)).toFixed(2) + " MB";
    setFileStatus({ id: docId, name: fileName, size: sizeInMB, stage: "Uploading", progress: 10 });

    const interval = setInterval(async () => {
      const isFinished = await fetchDocumentStatus(docId);
      if (isFinished) {
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [fetchDocumentStatus]);

  const handleFileUpload = async (file: File) => {
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      alert("Unsupported file format. Please upload PDF, JPG, or PNG.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://localhost:8000/api/v1/documents", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");

      const data = await response.json();
      simulateProcessing(data.id, file.name, file.size);
    } catch (error) {
      console.error("Error uploading file:", error);
      setFileStatus(prev => prev ? { ...prev, stage: "Error", progress: 0 } : null);
    }
  };

  const dismissEntity = async (entityId: string) => {
    try {
      const response = await fetch(`http://localhost:8000/api/v1/entities/${entityId}/dismiss`, {
        method: "PATCH",
      });
      if (response.ok && fileStatus) {
        setFileStatus({
          ...fileStatus,
          entities: fileStatus.entities?.map(e => e.id === entityId ? { ...e, is_dismissed: true } : e)
        });
      }
    } catch (error) {
      console.error("Error dismissing entity:", error);
    }
  };

  const onPageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setPageDimensions({
      width: img.naturalWidth / 2,
      height: img.naturalHeight / 2
    });
  };

  if (viewMode === "workspace" && fileStatus) {
    const activeEntities = fileStatus.entities?.filter(e => e.page_number === currentPage && !e.is_dismissed) || [];

    return (
      <div className="min-h-screen bg-gray-900 flex flex-col font-[family-name:var(--font-geist-sans)]">
        <header className="bg-gray-800 border-b border-gray-700 p-4 flex items-center justify-between text-white">
          <div className="flex items-center">
            <button onClick={() => setViewMode("upload")} className="mr-4 hover:text-blue-400 transition-colors">
              &larr; Back
            </button>
            <h1 className="text-xl font-bold truncate max-w-md">{fileStatus.name}</h1>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-400">Page {currentPage} of {fileStatus.page_count}</span>
            <div className="flex bg-gray-700 rounded-lg p-1">
              <button 
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="px-3 py-1 hover:bg-gray-600 rounded disabled:opacity-30"
              >
                &larr;
              </button>
              <button 
                disabled={currentPage >= (fileStatus.page_count || 1)}
                onClick={() => setCurrentPage(p => p + 1)}
                className="px-3 py-1 hover:bg-gray-600 rounded disabled:opacity-30"
              >
                &rarr;
              </button>
            </div>
            <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium transition-colors">
              Download Redacted
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-8 flex justify-center bg-gray-950">
          <div className="relative shadow-2xl bg-white" ref={containerRef}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={`http://localhost:8000/api/v1/documents/${fileStatus.id}/render/${currentPage}`}
              alt={`Page ${currentPage}`}
              onLoad={onPageLoad}
              className="max-w-none block"
              style={{ width: pageDimensions.width ? `${pageDimensions.width}pt` : "auto" }}
            />
            
            {/* Highlights Overlay */}
            <div className="absolute inset-0 pointer-events-none">
              {activeEntities.map(entity => (
                <div
                  key={entity.id}
                  className="absolute bg-red-500/30 border border-red-500 group pointer-events-auto"
                  style={{
                    left: `${entity.bounding_box.x1}pt`,
                    top: `${entity.bounding_box.y1}pt`,
                    width: `${entity.bounding_box.x2 - entity.bounding_box.x1}pt`,
                    height: `${entity.bounding_box.y2 - entity.bounding_box.y1}pt`,
                  }}
                >
                  <button
                    onClick={() => dismissEntity(entity.id)}
                    className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                    title="Dismiss"
                  >
                    &times;
                  </button>
                  <div className="absolute bottom-full left-0 bg-red-600 text-white text-[10px] px-1 py-0.5 rounded-t opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {entity.entity_type} ({Math.round(entity.confidence * 100)}%)
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 font-[family-name:var(--font-geist-sans)]">
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">RedactIQ</h1>
        <p className="text-gray-600">Secure, local-first document redaction</p>
      </header>

      <main className="w-full max-w-2xl">
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); const files = e.dataTransfer.files; if (files.length > 0) handleFileUpload(files[0]); }}
          className={`
            relative border-2 border-dashed rounded-xl p-12 text-center transition-all
            ${isDragging ? "border-blue-500 bg-blue-50 scale-[1.02]" : "border-gray-300 bg-white hover:border-gray-400"}
          `}
        >
          <input
            type="file"
            onChange={(e) => { const files = e.target.files; if (files && files.length > 0) handleFileUpload(files[0]); }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            accept=".pdf,.jpg,.jpeg,.png"
          />
          <div className="flex flex-col items-center">
            <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-lg font-medium text-gray-700">Drag & drop files here</p>
            <p className="text-sm text-gray-500 mt-1">PDF, JPG, or PNG</p>
            <button className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
              Browse Files
            </button>
          </div>
        </div>

        {fileStatus && (
          <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center">
                <div className="p-2 bg-blue-50 rounded-lg mr-4">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 truncate max-w-[300px]">{fileStatus.name}</h3>
                  <p className="text-sm text-gray-500">{fileStatus.size}</p>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className={`
                  text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider mb-2
                  ${fileStatus.stage === "Complete" ? "bg-green-100 text-green-700" : 
                    fileStatus.stage === "Error" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}
                `}>
                  {fileStatus.stage}
                </span>
                {fileStatus.stage === "Complete" && (
                  <button 
                    onClick={() => setViewMode("workspace")}
                    className="text-sm text-blue-600 font-bold hover:underline"
                  >
                    Open Workspace &rarr;
                  </button>
                )}
              </div>
            </div>

            <div className="relative pt-1">
              <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-gray-100">
                <div
                  style={{ width: `${fileStatus.progress}%` }}
                  className={`
                    shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-500
                    ${fileStatus.stage === "Complete" ? "bg-green-500" : 
                      fileStatus.stage === "Error" ? "bg-red-500" : "bg-blue-500"}
                  `}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>{fileStatus.progress}% Complete</span>
                <span>{fileStatus.stage === "Complete" ? "Ready for review" : "Processing..."}</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
