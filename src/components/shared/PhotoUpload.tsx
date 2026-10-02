import { useRef, useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const BUCKET = 'candidate-photos';

interface PhotoUploadProps {
  currentUrl?: string | null;
  candidateId: string;
  onUploaded: (url: string) => void;
}

/**
 * Uploads a candidate photo to the `candidate-photos` Supabase Storage bucket
 * and returns the public URL. The bucket must be created once in the Supabase
 * dashboard (Storage → New bucket → "candidate-photos", public read) — this
 * component does not create it, only uploads into it.
 */
export function PhotoUpload({ currentUrl, candidateId, onUploaded }: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      const isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
      toast.error(isHeic
        ? 'iPhone HEIC photos aren\u2019t supported. On iPhone, share the photo as JPEG (or set Camera \u2192 Formats \u2192 Most Compatible), then upload it again.'
        : 'Please upload a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error('Image must be smaller than 5MB.');
      return;
    }

    setUploading(true);
    try {
      // Extension from the MIME type, not the file name (names may lack one).
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${candidateId}/${Date.now()}.${ext}`;

      // Paths are unique per upload, so no upsert (upsert also needs UPDATE rights).
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setPreview(publicUrlData.publicUrl);
      onUploaded(publicUrlData.publicUrl);
      toast.success('Photo uploaded.');
    } catch (err) {
      toast.error(explainUploadError(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-secondary flex items-center justify-center border border-border">
        {preview ? (
          <img src={preview} alt="Candidate" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted-foreground">No photo</span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="hidden"
          id={`photo-upload-${candidateId}`}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="gap-1.5"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {uploading ? 'Uploading…' : preview ? 'Replace photo' : 'Upload photo'}
        </Button>
        {preview && !uploading && (
          <button
            type="button"
            onClick={() => { setPreview(null); onUploaded(''); }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
          >
            <X className="h-3 w-3" /> Remove
          </button>
        )}
      </div>
    </div>
  );
}

/** Turns raw Storage errors into something a person can act on. The raw text
 * ("new row violates row-level security policy for table objects") explained
 * nothing about why an upload failed. */
export function explainUploadError(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : '';
  if (/row-level security|unauthorized|not authorized|permission|403/i.test(msg)) {
    return 'You don\u2019t have permission to upload a photo for this candidate. Admins can upload for any candidate; a candidate can only upload to their own verified profile.';
  }
  if (/bucket not found/i.test(msg)) {
    return 'Photo storage isn\u2019t set up on the server yet (the \u201ccandidate-photos\u201d bucket is missing). Please contact the site administrator.';
  }
  if (/mime|content type|not supported/i.test(msg)) return 'This file type isn\u2019t allowed. Please upload a JPEG, PNG, or WebP image.';
  if (/too large|exceeded|payload|size/i.test(msg)) return 'Image must be smaller than 5MB.';
  if (/failed to fetch|network/i.test(msg)) return 'Couldn\u2019t reach the server. Check your connection and try again.';
  return msg ? `Photo upload failed: ${msg}` : 'Photo upload failed. Please try again.';
}
