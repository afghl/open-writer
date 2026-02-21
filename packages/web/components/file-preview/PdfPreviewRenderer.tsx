"use client";

type PdfPreviewRendererProps = {
  loading: boolean;
  error: string | null;
  blobURL: string | null;
};

export function PdfPreviewRenderer({ loading, error, blobURL }: PdfPreviewRendererProps) {
  if (loading) {
    return <div className="px-5 py-4 text-sm text-stone-400">Loading PDF...</div>;
  }

  if (error) {
    return <div className="px-5 py-4 text-sm text-red-500">Failed to load PDF: {error}</div>;
  }

  if (!blobURL) {
    return <div className="px-5 py-4 text-sm text-stone-400">PDF file is empty or unavailable.</div>;
  }

  return (
    <div className="h-full w-full bg-stone-100 p-3">
      <iframe
        title="PDF Preview"
        src={blobURL}
        className="h-full w-full rounded-lg border border-stone-200 bg-white"
      />
    </div>
  );
}
