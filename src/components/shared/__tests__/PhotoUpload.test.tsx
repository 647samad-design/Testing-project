import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const uploadMock = vi.fn();
const getPublicUrlMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
      }),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { PhotoUpload } from '@/components/shared/PhotoUpload';
import { toast } from 'sonner';

function makeFile(name: string, type: string, sizeBytes: number) {
  const file = new File(['x'.repeat(Math.min(sizeBytes, 10))], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

describe('PhotoUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadMock.mockResolvedValue({ error: null });
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/photo.jpg' } });
  });

  it('rejects a disallowed file type before uploading', async () => {
    render(<PhotoUpload candidateId="cand-1" onUploaded={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const badFile = makeFile('resume.pdf', 'application/pdf', 1000);

    fireEvent.change(input, { target: { files: [badFile] } });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Please upload a JPEG, PNG, or WebP image.'));
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('rejects a file over 5MB before uploading', async () => {
    render(<PhotoUpload candidateId="cand-1" onUploaded={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const bigFile = makeFile('huge.jpg', 'image/jpeg', 6 * 1024 * 1024);

    fireEvent.change(input, { target: { files: [bigFile] } });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Image must be smaller than 5MB.'));
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('uploads a valid image and calls onUploaded with the public URL', async () => {
    const onUploaded = vi.fn();
    render(<PhotoUpload candidateId="cand-1" onUploaded={onUploaded} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const goodFile = makeFile('headshot.jpg', 'image/jpeg', 1000);

    fireEvent.change(input, { target: { files: [goodFile] } });

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith('https://cdn.example.com/photo.jpg'));
    expect(uploadMock).toHaveBeenCalledWith(
      expect.stringMatching(/^cand-1\//),
      goodFile,
      expect.objectContaining({ upsert: true })
    );
  });

  it('shows an error toast and does not crash if the upload fails', async () => {
    uploadMock.mockResolvedValue({ error: new Error('network error') });
    const onUploaded = vi.fn();
    render(<PhotoUpload candidateId="cand-1" onUploaded={onUploaded} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile('headshot.jpg', 'image/jpeg', 1000)] } });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('network error'));
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('renders existing photo and lets the user remove it', () => {
    const onUploaded = vi.fn();
    render(<PhotoUpload candidateId="cand-1" currentUrl="https://cdn.example.com/existing.jpg" onUploaded={onUploaded} />);

    expect(screen.getByAltText('Candidate')).toHaveAttribute('src', 'https://cdn.example.com/existing.jpg');
    fireEvent.click(screen.getByText(/Remove/));
    expect(onUploaded).toHaveBeenCalledWith('');
  });
});
