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
      toast.error('Please upload a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error('Image must be smaller than 5MB.');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${candidateId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: true,
      });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setPreview(publicUrlData.publicUrl);
      onUploaded(publicUrlData.publicUrl);
      toast.success('Photo uploaded.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Photo upload failed. Please try again.');
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
