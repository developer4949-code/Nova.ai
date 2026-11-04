"use client";

import * as React from "react";
import { motion, AnimatePresence, type HTMLMotionProps } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

// One contract file, tracked against the analysis lifecycle in the app:
// "pending" = selected and ready, "uploading" = analysis request in flight,
// "completed" = result received, "error" = analysis failed.
export interface UploadedFile {
  id: string;
  file: File;
  progress: number; // 0-100
  status: "pending" | "uploading" | "completed" | "error";
}

// Omit<HTMLMotionProps> avoids framer-motion's onDrag gesture types clashing
// with the standard React drag handlers used for the dropzone.
interface FileUploadCardProps extends Omit<HTMLMotionProps<"div">, "ref" | "children"> {
  children?: React.ReactNode;
  files?: UploadedFile[];
  onFilesChange: (files: File[]) => void;
  onFileRemove: (id: string) => void;
  onClose?: () => void;
  title?: string;
  description?: string;
  dropHint?: string;
  sizeHint?: string;
  browseLabel?: string;
  accept?: string;
  multiple?: boolean;
}

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

const fileItemVariants = {
  hidden: { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0 },
};

function formatFileSize(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function fileBadge(file: File) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "PDF";
  if (
    name.endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "DOC";
  }
  return file.type.split("/")[1]?.toUpperCase().substring(0, 3) || "FILE";
}

export const FileUploadCard = React.forwardRef<HTMLDivElement, FileUploadCardProps>(
  (
    {
      className,
      files = [],
      onFilesChange,
      onFileRemove,
      onClose,
      title = "Upload files",
      description = "Select and upload the files of your choice",
      dropHint = "Choose a file or drag & drop it here.",
      sizeHint = "Up to 10 MB.",
      browseLabel = "Browse files",
      accept,
      multiple = true,
      children,
      ...props
    },
    ref,
  ) => {
    const [isDragging, setIsDragging] = React.useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) onFilesChange(droppedFiles);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || []);
      // Allow re-selecting the same file after a failed attempt.
      e.target.value = "";
      if (selectedFiles.length > 0) onFilesChange(selectedFiles);
    };

    const triggerFileSelect = () => fileInputRef.current?.click();

    const statusPill = (status: UploadedFile["status"]) => {
      switch (status) {
        case "uploading":
          return (
            <span className="flex items-center gap-1 font-semibold text-[var(--coral)]">
              <LoaderCircle className="h-3 w-3 animate-spin" /> Checking…
            </span>
          );
        case "completed":
          return <span className="font-semibold text-[var(--teal)]">Completed</span>;
        case "error":
          return <span className="font-semibold text-[var(--coral)]">Failed — try again</span>;
        default:
          return <span className="font-semibold text-[var(--muted)]">Ready to check</span>;
      }
    };

    return (
      <motion.div
        ref={ref}
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        transition={{ duration: 0.3 }}
        className={cn("w-full", className)}
        {...props}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--paper)]">
              <UploadCloud className="h-5 w-5 text-[var(--coral)]" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold">{title}</h3>
              <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">{description}</p>
            </div>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={handleDrop}
          onClick={triggerFileSelect}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              triggerFileSelect();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label={dropHint}
          className={cn(
            "mt-5 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-7 text-center transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            isDragging
              ? "border-[var(--teal)] bg-[rgba(13,118,110,0.08)]"
              : "border-[var(--line)] bg-[var(--paper)] hover:border-[var(--coral)]",
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            className="hidden"
            onChange={handleFileSelect}
          />
          <UploadCloud className="mb-3 h-9 w-9 text-[var(--coral)]" />
          <p className="text-sm font-bold">{dropHint}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{sizeHint}</p>
          <Button variant="outline" size="sm" tabIndex={-1} className="pointer-events-none mt-4">
            {browseLabel}
          </Button>
        </div>

        {children}

        {files.length > 0 && (
          <div className="mt-5 border-t border-[var(--line)] pt-4">
            <ul className="space-y-3">
              <AnimatePresence initial={false}>
                {files.map((uploaded) => (
                  <motion.li
                    key={uploaded.id}
                    variants={fileItemVariants}
                    initial="hidden"
                    animate="visible"
                    exit={{ opacity: 0, x: 16 }}
                    layout
                    className="flex items-center gap-3"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--paper)] text-xs font-bold text-[var(--muted)]">
                      {fileBadge(uploaded.file)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{uploaded.file.name}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--muted)]">
                        <span>{formatFileSize(uploaded.file.size)}</span>
                        <span aria-hidden="true">•</span>
                        {statusPill(uploaded.status)}
                      </div>
                      {uploaded.status === "uploading" && (
                        <Progress value={uploaded.progress} className="mt-2 h-1.5" />
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {uploaded.status === "completed" && (
                        <CheckCircle2 className="h-5 w-5 text-[var(--teal)]" />
                      )}
                      {uploaded.status === "error" && (
                        <AlertCircle className="h-5 w-5 text-[var(--coral)]" />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full"
                        onClick={() => onFileRemove(uploaded.id)}
                        aria-label={uploaded.status === "completed" ? "Remove file" : "Cancel file"}
                      >
                        {uploaded.status === "completed" || uploaded.status === "error" ? (
                          <Trash2 className="h-4 w-4" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        )}
      </motion.div>
    );
  },
);
FileUploadCard.displayName = "FileUploadCard";
