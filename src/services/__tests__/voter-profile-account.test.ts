import { describe, it, expect, vi, beforeEach } from 'vitest';

const { auth, storage } = vi.hoisted(() => ({
  auth: { getUser: vi.fn(), signInWithPassword: vi.fn(), updateUser: vi.fn() },
  storage: { upload: vi.fn(), list: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn() },
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth, storage: { from: () => storage } } }));
import { validateProfilePhoto, uploadProfilePhoto, removeProfilePhoto, changePassword } from '@/services/voter-profile';

const file = (name: string, type: string, size = 1000) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } } });
  storage.list.mockResolvedValue({ data: [{ name: 'avatar-1.jpg' }, { name: 'avatar-2.png' }] });
  storage.remove.mockResolvedValue({ error: null });
  storage.upload.mockResolvedValue({ error: null });
  storage.getPublicUrl.mockImplementation((p: string) => ({ data: { publicUrl: `https://cdn/avatars/${p}` } }));
});

describe('profile photo', () => {
  it('rejects HEIC with instructions, other types, and files over 5MB', () => {
    expect(validateProfilePhoto(file('IMG_1.HEIC', 'image/heic'))).toMatch(/HEIC/);
    expect(validateProfilePhoto(file('a.gif', 'image/gif'))).toMatch(/JPEG, PNG or WebP/);
    expect(validateProfilePhoto(file('a.jpg', 'image/jpeg', 6 * 1024 * 1024))).toMatch(/5MB/);
    expect(validateProfilePhoto(file('a.jpg', 'image/jpeg'))).toBeNull();
  });

  it('uploads into the user\u2019s own folder under a new name and deletes the old photos', async () => {
    const r = await uploadProfilePhoto(file('me.png', 'image/png'));
    const path = storage.upload.mock.calls[0][0] as string;
    expect(path).toMatch(/^u1\/avatar-\d+\.png$/);
    expect(storage.upload.mock.calls[0][2]).toMatchObject({ upsert: false, contentType: 'image/png' });
    expect(storage.remove).toHaveBeenCalledWith(['u1/avatar-1.jpg', 'u1/avatar-2.png']);
    expect(r.url).toBe(`https://cdn/avatars/${path}`);
  });

  it('explains a missing bucket instead of failing silently', async () => {
    storage.upload.mockResolvedValue({ error: { message: 'Bucket not found' } });
    expect((await uploadProfilePhoto(file('me.jpg', 'image/jpeg'))).error).toMatch(/avatars/);
  });

  it('removeProfilePhoto deletes every file in the user\u2019s folder', async () => {
    expect(await removeProfilePhoto()).toEqual({});
    expect(storage.remove).toHaveBeenCalledWith(['u1/avatar-1.jpg', 'u1/avatar-2.png']);
  });
});

describe('changePassword', () => {
  it('verifies the current password before changing it', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    expect(await changePassword('oldpass12', 'newpass12')).toEqual({});
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'oldpass12' });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'newpass12' });
  });

  it('refuses when the current password is wrong, and never updates', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    expect((await changePassword('wrong', 'newpass12')).error).toMatch(/current password is incorrect/);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('enforces 8+ characters and a different password', async () => {
    expect((await changePassword('oldpass12', 'short')).error).toMatch(/8 characters/);
    expect((await changePassword('samepass1', 'samepass1')).error).toMatch(/different/);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
});
