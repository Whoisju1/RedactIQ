"use client";

import { useState, useCallback } from "react";

type ProcessingStage = "Uploading" | "Extracting" | "Analyzing" | "Complete" | "Error";

interface FileStatus {
  name: string;
  size: string;
  stage: ProcessingStage;
  progress: number;
}

export default function Home() {
  const [fileStatus, setFileStatus] = useState<FileStatus | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const simulateProcessing = useCallback((fileName: string, fileSize: number) => {
    const sizeInMB = (fileSize / (1024 * 1024)).toFixed(2) + " MB";
    
    setFileStatus({ name: fileName, size: sizeInMB, stage: "Uploading", progress: 0 });

    // Simulation stages
    setTimeout(() => {
      setFileStatus(prev => prev ? { ...prev, stage: "Extracting", progress: 33 } : null);
      
      setTimeout(() => {
        setFileStatus(prev => prev ? { ...prev, stage: "Analyzing", progress: 66 } : null);
        
        setTimeout(() => {
          setFileStatus(prev => prev ? { ...prev, stage: "Complete", progress: 100 } : null);
        }, 2000);
      }, 2000);
    }, 1500);
  }, []);

  const handleFileUpload = async (file: File) => {
    const allowedTypes = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png"];
    
    if (!allowedTypes.includes(file.type)) {
      alert("Unsupported file format. Please upload PDF, DOCX, JPG, or PNG.");
      return;
    }

    simulateProcessing(file.name, file.size);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://localhost:8000/api/v1/documents", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      console.log("Upload successful:", data);
    } catch (error) {
      console.error("Error uploading file:", error);
      setFileStatus(prev => prev ? { ...prev, stage: "Error", progress: 0 } : null);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 font-[family-name:var(--font-geist-sans)]">
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">RedactIQ</h1>
        <p className="text-gray-600">Secure, local-first document redaction</p>
      </header>

      <main className="w-full max-w-2xl">
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`
            relative border-2 border-dashed rounded-xl p-12 text-center transition-all
            ${isDragging ? "border-blue-500 bg-blue-50 scale-[1.02]" : "border-gray-300 bg-white hover:border-gray-400"}
          `}
        >
          <input
            type="file"
            onChange={onFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            accept=".pdf,.docx,.jpg,.jpeg,.png"
          />
          <div className="flex flex-col items-center">
            <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-lg font-medium text-gray-700">Drag & drop files here</p>
            <p className="text-sm text-gray-500 mt-1">PDF, DOCX, JPG, or PNG</p>
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
              <span className={`
                text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider
                ${fileStatus.stage === "Complete" ? "bg-green-100 text-green-700" : 
                  fileStatus.stage === "Error" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}
              `}>
                {fileStatus.stage}
              </span>
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
