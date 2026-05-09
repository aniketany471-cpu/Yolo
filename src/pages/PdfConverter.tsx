import React, { useState, useEffect } from 'react';
import { Upload, FileDown, Trash2, Image as ImageIcon, Loader2, FileText } from 'lucide-react';
import { cn } from '../lib/utils';

interface ExportLog {
  id: string;
  filename: string;
  filepath: string;
  createdAt: number;
  type: string;
  status: string;
}

export function PdfConverter() {
  const [exportsList, setExportsList] = useState<ExportLog[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    fetchExports();
    // Poll exports occasionally for updates from back-end
    const interval = setInterval(fetchExports, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchExports = async () => {
    try {
      const res = await fetch('/api/exports');
      const data = await res.json();
      if (data.exports) setExportsList(data.exports);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append('images', files[i]);
    }

    try {
      await fetch('/api/exports/pdf-images', {
        method: 'POST',
        body: formData,
      });
      fetchExports();
    } catch (e) {
      console.error("Upload failed", e);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/exports/${id}`, { method: 'DELETE' });
    fetchExports();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-slate-100">PDF Converter</h2>
        <p className="text-slate-400">Convert Telegram messages or uploaded media into PDFs.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          {/* Upload Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-blue-400" />
              Image to PDF
            </h3>
            
            <div 
              className={cn(
                "border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center transition-colors relative",
                dragActive ? "border-blue-500 bg-blue-500/10" : "border-slate-700 bg-slate-800/50 hover:bg-slate-800",
                isUploading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
              )}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                multiple
                accept="image/jpeg, image/png, image/webp"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={(e) => handleUpload(e.target.files)}
                disabled={isUploading}
              />
              
              {isUploading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                  <p className="text-sm text-slate-300">Converting images...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="bg-slate-700/50 p-3 rounded-full">
                    <Upload className="w-6 h-6 text-slate-300" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-200">Click or drag images here</p>
                    <p className="text-xs text-slate-400 mt-1">Supports JPG, PNG, WEBP</p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <h4 className="text-sm font-medium text-blue-400 mb-2">Userbot Commands</h4>
              <ul className="text-xs text-slate-300 space-y-1.5 list-disc pl-4">
                <li><code className="text-blue-300">/exportchat &lt;limit&gt;</code> - Export recent messages</li>
                <li><code className="text-blue-300">/pdf</code> - Reply to text to export as PDF</li>
                <li><code className="text-blue-300">/photo2pdf</code> - Reply to photo to convert</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {/* History Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-full min-h-[400px]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-semibold text-slate-200">Export History</h3>
              <span className="text-xs font-medium px-2.5 py-1 bg-slate-800 text-slate-300 rounded-full">
                {exportsList.length} files
              </span>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto">
              {exportsList.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
                  <FileDown className="w-12 h-12 stroke-1" />
                  <p>No PDFs generated yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {exportsList.map((exp) => (
                    <div 
                      key={exp.id}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-800/30 border border-slate-800/50 rounded-lg hover:bg-slate-800/80 transition-colors gap-4"
                    >
                      <div className="flex items-start gap-3 overflow-hidden">
                        <div className="p-2 bg-blue-500/10 rounded-lg shrink-0">
                          <FileText className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-200 truncate" title={exp.filename}>
                            {exp.filename}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                            <span>{new Date(exp.createdAt).toLocaleString()}</span>
                            <span>&bull;</span>
                            <span className="capitalize">{exp.type.replace('-', ' ')}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <a 
                          href={`/api/exports/download/${exp.id}`}
                          download
                          className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-md transition-colors"
                          title="Download PDF"
                        >
                          <FileDown className="w-4 h-4" />
                        </a>
                        <button 
                          onClick={() => handleDelete(exp.id)}
                          className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
