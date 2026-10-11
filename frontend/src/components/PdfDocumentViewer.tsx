import React, { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export const PdfDocumentViewer: React.FC<{ data: Uint8Array }> = ({ data }) => {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadingTask = getDocument({ data: data.slice() });
    loadingTask.promise.then((loadedDocument) => {
      if (!cancelled) setDocument(loadedDocument);
      else void loadedDocument.destroy();
    }).catch((loadError: unknown) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'This PDF could not be opened.');
    });

    return () => {
      cancelled = true;
      void loadingTask.destroy();
    };
  }, [data]);

  if (error) return <p role="alert" className="p-6 text-sm text-rose-300">Could not render this PDF: {error}</p>;
  if (!document) return <p className="p-6 text-sm text-slate-400">Opening PDF…</p>;

  return (
    <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 p-3 sm:p-5">
      {Array.from({ length: document.numPages }, (_, index) => (
        <PdfPage key={index + 1} pdf={document} pageNumber={index + 1} />
      ))}
    </div>
  );
};

const PdfPage: React.FC<{ pdf: PDFDocumentProxy; pageNumber: number }> = ({ pdf, pageNumber }) => {
  const pageContainer = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const element = pageContainer.current;
    if (!element || visible) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '700px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;

    void pdf.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return;
      const viewport = page.getViewport({ scale: 1.35 });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas rendering is unavailable.');

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
      renderTask = page.render({ canvasContext: context, viewport });
      return renderTask.promise;
    }).catch((renderError: unknown) => {
      if (!cancelled) setError(true);
      if (renderError instanceof Error) console.error(`Failed to render PDF page ${pageNumber}:`, renderError);
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, pageNumber, visible]);

  return (
    <div ref={pageContainer} className="flex min-h-32 w-full items-center justify-center overflow-hidden rounded-lg bg-white shadow-lg">
      {error ? <p className="p-4 text-sm text-rose-600">Page {pageNumber} could not be rendered.</p> : (
        <canvas ref={canvasRef} aria-label={`PDF page ${pageNumber}`} className="h-auto max-w-full" />
      )}
    </div>
  );
};
