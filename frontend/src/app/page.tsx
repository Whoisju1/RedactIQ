"use client";

import { useState, useCallback, useRef, useEffect, MouseEvent } from "react";

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

interface ManualRedaction {
  id: string;
  type: string;
  page_number: number;
  bounding_box: BoundingBox;
}

interface FileStatus {
  id: string;
  name: string;
  size: string;
  stage: ProcessingStage;
  progress: number;
  entities?: DetectedEntity[];
  manual_redactions?: ManualRedaction[];
  page_count?: number;
}

type UndoAction = 
  | { type: 'add_redaction'; id: string }
  | { type: 'dismiss_entity'; id: string }
  | { type: 'dismiss_entities_by_text'; text_value: string; ids: string[] };

export default function Home() {
  // Single mode states
  const [fileStatus, setFileStatus] = useState<FileStatus | null>(null);
  
  // Batch mode states
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchStatuses, setBatchStatuses] = useState<FileStatus[]>([]);

  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState<"upload" | "workspace">("upload");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageDimensions, setPageDimensions] = useState({ width: 0, height: 0 });
  
  // Sidebar Filters
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  
  // Tools
  const [activeTool, setActiveTool] = useState<"view" | "select" | "draw">("view");
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<BoundingBox | null>(null);

  // Undo Stack
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);

  const fetchDocumentStatus = useCallback(async (docId: string) => {
    try {
      const response = await fetch(`http://localhost:8000/api/v1/documents/${docId}/status`);
      if (response.ok) {
        const data = await response.json();
        setFileStatus(prev => prev ? { 
          ...prev, 
          stage: data.status === "READY_FOR_REVIEW" ? "Complete" : (data.status === "ERROR" ? "Error" : "Analyzing"),
          progress: data.status === "READY_FOR_REVIEW" ? 100 : (data.status === "ERROR" ? 0 : 66),
          entities: data.entities,
          manual_redactions: data.manual_redactions || [],
          page_count: data.page_count
        } : null);

        if (data.status === "READY_FOR_REVIEW" || data.status === "ERROR") {
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

  // --- BATCH LOGIC ---
  const pollDocIds = (docIds: string[]) => {
    const interval = setInterval(async () => {
      let allFinished = true;
      const updates = await Promise.all(docIds.map(async (docId) => {
        try {
          const response = await fetch(`http://localhost:8000/api/v1/documents/${docId}/status`);
          if (response.ok) {
             const data = await response.json();
             if (data.status !== "READY_FOR_REVIEW" && data.status !== "ERROR") {
               allFinished = false;
             }
             return {
               id: docId,
               name: data.filename,
               size: "Batch Item",
               stage: data.status === "READY_FOR_REVIEW" ? "Complete" : (data.status === "ERROR" ? "Error" : "Analyzing"),
               progress: data.status === "READY_FOR_REVIEW" ? 100 : (data.status === "ERROR" ? 0 : 50)
             } as FileStatus;
          }
        } catch (e) {
          console.error(e);
        }
        allFinished = false;
        return null;
      }));

      setBatchStatuses(prev => {
        const copy = [...prev];
        updates.forEach(update => {
          if (update) {
            const idx = copy.findIndex(s => s.id === update.id);
            if (idx !== -1) {
              copy[idx] = update;
            }
          }
        });
        return copy;
      });

      if (allFinished) {
        clearInterval(interval);
      }
    }, 2000);
  };

  const handleBatchUpload = async (files: FileList | File[]) => {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }
    
    const tempIds = Array.from(files).map((_, i) => `temp-${Date.now()}-${i}`);
    
    const newStatuses = Array.from(files).map((f, i) => ({
      id: tempIds[i],
      name: f.name,
      size: "Batch Item",
      stage: "Uploading" as ProcessingStage,
      progress: 10
    }));

    setBatchStatuses(prev => [...prev, ...newStatuses]);

    try {
      const response = await fetch("http://localhost:8000/api/v1/batch/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Batch upload failed");
      const data = await response.json();
      const docIds = data.doc_ids as string[];

      // Swap temp IDs with real document IDs
      setBatchStatuses(prev => {
        const copy = [...prev];
        tempIds.forEach((tempId, index) => {
          const idx = copy.findIndex(s => s.id === tempId);
          if (idx !== -1) {
            copy[idx] = { ...copy[idx], id: docIds[index], stage: "Analyzing", progress: 50 };
          }
        });
        return copy;
      });

      pollDocIds(docIds);
    } catch (error) {
      console.error(error);
      setBatchStatuses(prev => prev.map(s => tempIds.includes(s.id) ? { ...s, stage: "Error", progress: 0 } : s));
    }
  };

  const handleBatchExport = async () => {
    if (batchStatuses.length === 0) return;
    try {
      const response = await fetch("http://localhost:8000/api/v1/batch/export", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ doc_ids: batchStatuses.filter(s => s.stage === 'Complete').map(s => s.id) })
      });
      if (!response.ok) throw new Error("Batch export failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `batch_export.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch(err) {
       console.error(err);
       alert("Failed to export batch.");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); 
    setIsDragging(false); 
    const files = e.dataTransfer.files; 
    if (files.length > 0) {
      if (isBatchMode) {
        handleBatchUpload(files);
      } else {
        handleFileUpload(files[0]);
      }
    } 
  };

  const dismissEntity = async (entity: DetectedEntity, e: React.MouseEvent) => {
    if ((e.ctrlKey || e.metaKey) && fileStatus) {
      const confirmDismiss = window.confirm(`Do you want to remove all automatic redactions for "${entity.text_value}"?`);
      if (confirmDismiss) {
        try {
          const response = await fetch(`http://localhost:8000/api/v1/documents/${fileStatus.id}/entities/dismiss-by-text`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text_value: entity.text_value })
          });
          if (response.ok) {
            const data = await response.json();
            const dismissedIds = data.dismissed_ids as string[];
            setFileStatus(prev => prev ? {
              ...prev,
              entities: prev.entities?.map(ent => dismissedIds.includes(ent.id) ? { ...ent, is_dismissed: true } : ent)
            } : null);
            setUndoStack(prev => [...prev, { type: 'dismiss_entities_by_text', text_value: entity.text_value, ids: dismissedIds }]);
          }
        } catch (error) {
          console.error("Error batch dismissing entities:", error);
        }
      }
      return;
    }

    try {
      const response = await fetch(`http://localhost:8000/api/v1/entities/${entity.id}/dismiss`, {
        method: "PATCH",
      });
      if (response.ok && fileStatus) {
        setFileStatus({
          ...fileStatus,
          entities: fileStatus.entities?.map(ent => ent.id === entity.id ? { ...ent, is_dismissed: true } : ent)
        });
        setUndoStack(prev => [...prev, { type: 'dismiss_entity', id: entity.id }]);
      }
    } catch (error) {
      console.error("Error dismissing entity:", error);
    }
  };

  const deleteRedaction = async (redactionId: string) => {
    try {
      const response = await fetch(`http://localhost:8000/api/v1/redactions/${redactionId}`, {
        method: "DELETE",
      });
      if (response.ok && fileStatus) {
        setFileStatus({
          ...fileStatus,
          manual_redactions: fileStatus.manual_redactions?.filter(r => r.id !== redactionId)
        });
        setUndoStack(prev => prev.filter(action => !(action.type === 'add_redaction' && action.id === redactionId)));
      }
    } catch (error) {
      console.error("Error deleting redaction:", error);
    }
  };

  const undoLastAction = useCallback(async () => {
    if (undoStack.length === 0 || !fileStatus) return;
    
    const newStack = [...undoStack];
    const lastAction = newStack.pop();
    if (!lastAction) return;

    try {
      if (lastAction.type === 'add_redaction') {
        const response = await fetch(`http://localhost:8000/api/v1/redactions/${lastAction.id}`, { method: "DELETE" });
        if (response.ok) {
          setFileStatus(prev => prev ? {
            ...prev,
            manual_redactions: prev.manual_redactions?.filter(r => r.id !== lastAction.id)
          } : null);
        }
      } else if (lastAction.type === 'dismiss_entity') {
        const response = await fetch(`http://localhost:8000/api/v1/entities/${lastAction.id}/restore`, { method: "PATCH" });
        if (response.ok) {
          setFileStatus(prev => prev ? {
            ...prev,
            entities: prev.entities?.map(e => e.id === lastAction.id ? { ...e, is_dismissed: false } : e)
          } : null);
        }
      } else if (lastAction.type === 'dismiss_entities_by_text') {
        const response = await fetch(`http://localhost:8000/api/v1/documents/${fileStatus.id}/entities/restore-by-text`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text_value: lastAction.text_value })
        });
        if (response.ok) {
          setFileStatus(prev => prev ? {
            ...prev,
            entities: prev.entities?.map(e => lastAction.ids.includes(e.id) ? { ...e, is_dismissed: false } : e)
          } : null);
        }
      }
      setUndoStack(newStack);
    } catch (error) {
      console.error("Error undoing action:", error);
    }
  }, [undoStack, fileStatus]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDrawing(false);
        setDrawStart(null);
        setCurrentRect(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoLastAction();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoLastAction]);

  const toggleFilter = (type: string) => {
    setHiddenTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  };

  const onPageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setPageDimensions({
      width: img.naturalWidth / 2,
      height: img.naturalHeight / 2
    });
  };

  const getCoordinates = (e: MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = pageDimensions.width / rect.width;
    const scaleY = pageDimensions.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (activeTool === "view") return;
    const coords = getCoordinates(e);
    if (!coords) return;
    setIsDrawing(true);
    setDrawStart(coords);
    setCurrentRect({ x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y });
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !drawStart) return;
    const coords = getCoordinates(e);
    if (!coords) return;
    
    let y2 = coords.y;
    if (activeTool === "select") {
       y2 = drawStart.y + 12;
    }

    setCurrentRect({
      x1: Math.min(drawStart.x, coords.x),
      y1: Math.min(drawStart.y, y2),
      x2: Math.max(drawStart.x, coords.x),
      y2: Math.max(drawStart.y, y2),
    });
  };

  const handleMouseUp = async () => {
    if (!isDrawing || !currentRect || !fileStatus) {
      setIsDrawing(false);
      setDrawStart(null);
      setCurrentRect(null);
      return;
    }

    const redactionType = activeTool === "select" ? "TEXT" : "RECTANGLE";
    const boundingBox = currentRect;
    
    setIsDrawing(false);
    setDrawStart(null);
    setCurrentRect(null);

    if (Math.abs(boundingBox.x2 - boundingBox.x1) < 5) return;

    try {
      const response = await fetch(`http://localhost:8000/api/v1/documents/${fileStatus.id}/redactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: redactionType,
          page_number: currentPage,
          bounding_box: boundingBox
        })
      });

      if (response.ok) {
        const newRedaction = await response.json();
        setFileStatus({
          ...fileStatus,
          manual_redactions: [...(fileStatus.manual_redactions || []), newRedaction]
        });
        setUndoStack(prev => [...prev, { type: 'add_redaction', id: newRedaction.id }]);
      }
    } catch (error) {
      console.error("Failed to save manual redaction:", error);
    }
  };

  const handleExport = async () => {
    if (!fileStatus) return;
    try {
      const response = await fetch(`http://localhost:8000/api/v1/documents/${fileStatus.id}/export`);
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `redacted_${fileStatus.name}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error exporting document:", error);
      alert("Failed to export document. Please try again.");
    }
  };

  if (viewMode === "workspace" && fileStatus && !isBatchMode) {
    const activeEntities = fileStatus.entities?.filter(e => e.page_number === currentPage && !e.is_dismissed && !hiddenTypes.has(e.entity_type)) || [];
    const activeRedactions = fileStatus.manual_redactions?.filter(r => r.page_number === currentPage) || [];
    
    const allTypes = Array.from(new Set(fileStatus.entities?.map(e => e.entity_type) || []));

    return (
      <div className="min-h-screen bg-gray-900 flex flex-col font-[family-name:var(--font-geist-sans)]">
        <header className="bg-gray-800 border-b border-gray-700 p-4 flex items-center justify-between text-white z-10">
          <div className="flex items-center">
            <button onClick={() => setViewMode("upload")} className="mr-4 hover:text-blue-400 transition-colors">
              &larr; Back
            </button>
            <h1 className="text-xl font-bold truncate max-w-md">{fileStatus.name}</h1>
          </div>
          
          <div className="flex items-center bg-gray-700 rounded-lg p-1 space-x-1">
            <button 
              onClick={() => setActiveTool("view")}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${activeTool === "view" ? "bg-gray-600 text-white" : "text-gray-400 hover:text-white"}`}
            >
              View
            </button>
            <button 
              onClick={() => setActiveTool("select")}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${activeTool === "select" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
            >
              Text Select
            </button>
            <button 
              onClick={() => setActiveTool("draw")}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${activeTool === "draw" ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white"}`}
            >
              Draw Box
            </button>
          </div>

          <div className="flex items-center space-x-4">
            <button 
              onClick={undoLastAction}
              disabled={undoStack.length === 0}
              className="text-sm font-medium px-3 py-1.5 rounded text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-30 transition-colors"
              title="Undo (Ctrl+Z)"
            >
              Undo
            </button>
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
            <button 
              onClick={handleExport}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Export Redacted
            </button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <aside className="w-64 bg-gray-800 border-r border-gray-700 p-4 flex flex-col text-white z-10 overflow-y-auto">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Detected PII Types</h2>
            {allTypes.length === 0 ? (
              <p className="text-sm text-gray-500">No PII detected.</p>
            ) : (
              <div className="space-y-3">
                {allTypes.map(type => (
                  <label key={type} className="flex items-center space-x-3 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      checked={!hiddenTypes.has(type)}
                      onChange={() => toggleFilter(type)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500/50 focus:ring-offset-gray-800 cursor-pointer"
                    />
                    <span className="text-sm font-medium group-hover:text-blue-400 transition-colors">{type}</span>
                  </label>
                ))}
              </div>
            )}
            
            <div className="mt-8 pt-8 border-t border-gray-700">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Manual Elements</h2>
              <p className="text-sm text-gray-300">
                {fileStatus.manual_redactions?.length || 0} block(s) added
              </p>
            </div>
          </aside>

          <main className="flex-1 overflow-auto p-8 flex justify-center bg-gray-950">
            <div 
              className={`relative shadow-2xl bg-white ${activeTool !== "view" ? "cursor-crosshair" : ""}`}
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={`http://localhost:8000/api/v1/documents/${fileStatus.id}/render/${currentPage}`}
                alt={`Page ${currentPage}`}
                onLoad={onPageLoad}
                className="max-w-none block select-none pointer-events-none"
                draggable={false}
                style={{ width: pageDimensions.width ? `${pageDimensions.width}pt` : "auto" }}
              />
              
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
                      onClick={(e) => dismissEntity(entity, e)}
                      className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      title="Dismiss (Ctrl+Click to dismiss all matching text)"
                    >
                      &times;
                    </button>
                    <div className="absolute bottom-full left-0 bg-red-600 text-white text-[10px] px-1 py-0.5 rounded-t opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {entity.entity_type}
                    </div>
                  </div>
                ))}

                {activeRedactions.map(redaction => (
                  <div
                    key={redaction.id}
                    className={`absolute group ${redaction.type === 'TEXT' ? 'bg-blue-500/40 border-blue-600' : 'bg-black border-black'} border pointer-events-auto`}
                    style={{
                      left: `${redaction.bounding_box.x1}pt`,
                      top: `${redaction.bounding_box.y1}pt`,
                      width: `${redaction.bounding_box.x2 - redaction.bounding_box.x1}pt`,
                      height: `${redaction.bounding_box.y2 - redaction.bounding_box.y1}pt`,
                    }}
                  >
                    <button
                      onClick={() => deleteRedaction(redaction.id)}
                      className="absolute -top-2 -right-2 bg-gray-800 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      title="Remove Box"
                    >
                      &times;
                    </button>
                  </div>
                ))}

                {isDrawing && currentRect && (
                  <div
                    className={`absolute border-2 ${activeTool === "select" ? "bg-blue-500/20 border-blue-500" : "bg-black/50 border-black"}`}
                    style={{
                      left: `${currentRect.x1}pt`,
                      top: `${currentRect.y1}pt`,
                      width: `${currentRect.x2 - currentRect.x1}pt`,
                      height: `${currentRect.y2 - currentRect.y1}pt`,
                    }}
                  />
                )}
              </div>
            </div>
          </main>
        </div>
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
        <div className="mb-6 flex justify-end">
          <label className="flex items-center space-x-2 cursor-pointer bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-200 hover:bg-gray-50 transition-colors">
            <input 
              type="checkbox" 
              checked={isBatchMode}
              onChange={(e) => setIsBatchMode(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">Batch Processing Mode</span>
          </label>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`
            relative border-2 border-dashed rounded-xl p-12 text-center transition-all
            ${isDragging ? "border-blue-500 bg-blue-50 scale-[1.02]" : "border-gray-300 bg-white hover:border-gray-400"}
          `}
        >
          <input
            type="file"
            multiple
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) {
                if (isBatchMode) {
                  handleBatchUpload(files);
                } else {
                  handleFileUpload(files[0]);
                }
              }
              // Reset value so same file can be selected again if needed
              e.target.value = '';
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            accept=".pdf,.jpg,.jpeg,.png"
          />
          <div className="flex flex-col items-center">
            <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-lg font-medium text-gray-700">
              {isBatchMode ? "Drag & drop multiple files here" : "Drag & drop a file here"}
            </p>
            <p className="text-sm text-gray-500 mt-1">PDF, JPG, or PNG</p>
            <button className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
              Browse Files
            </button>
          </div>
        </div>

        {!isBatchMode && fileStatus && (
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
            </div>
          </div>
        )}

        {isBatchMode && batchStatuses.length > 0 && (
          <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">Batch Processing Dashboard</h2>
              {batchStatuses.every(s => s.stage === 'Complete' || s.stage === 'Error') && (
                <button 
                  onClick={handleBatchExport}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                >
                  Download Batch ZIP
                </button>
              )}
            </div>

            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
              {batchStatuses.map(status => (
                <div key={status.id} className="p-4 border border-gray-100 rounded-lg bg-gray-50/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900 truncate max-w-[200px]">{status.name}</span>
                    <span className={`
                      text-[10px] font-bold px-2 py-0.5 rounded-full uppercase
                      ${status.stage === "Complete" ? "bg-green-100 text-green-700" : 
                        status.stage === "Error" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}
                    `}>
                      {status.stage}
                    </span>
                  </div>
                  <div className="relative pt-1">
                    <div className="overflow-hidden h-1.5 text-xs flex rounded bg-gray-200">
                      <div
                        style={{ width: `${status.progress}%` }}
                        className={`
                          shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-500
                          ${status.stage === "Complete" ? "bg-green-500" : 
                            status.stage === "Error" ? "bg-red-500" : "bg-blue-500"}
                        `}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
