import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UploadedFilesList } from './UploadedFilesList';

describe('UploadedFilesList', () => {
  it('목록을 불러와 파일명과 다운로드 링크를 보여준다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              originalFilename: 'note.txt',
              fileSizeBytes: 1048576,
              createdAt: '2026-08-01T00:00:00.000Z',
              isProtected: false,
            },
          ],
        }),
      ),
    );

    render(<UploadedFilesList />);
    expect(await screen.findByText('note.txt')).toBeInTheDocument();
    expect(screen.getByText(/1\.0MB/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '다운로드' })).toHaveAttribute(
      'href',
      '/api/uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/download',
    );
  });

  it('보호 파일은 삭제 버튼이 비활성화된다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              originalFilename: 'guideline.md',
              fileSizeBytes: 100,
              createdAt: '2026-08-01T00:00:00.000Z',
              isProtected: true,
            },
          ],
        }),
      ),
    );

    render(<UploadedFilesList />);
    expect(await screen.findByText('guideline.md')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled();
  });

  it('삭제 확인 후 DELETE를 호출한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/uploads' && !init?.method) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                  originalFilename: 'temp.txt',
                  fileSizeBytes: 10,
                  createdAt: '2026-08-01T00:00:00.000Z',
                  isProtected: false,
                },
              ],
            }),
          ),
        );
      }
      if (url.includes('/api/uploads/') && init?.method === 'DELETE') {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ items: [] })));
    });

    render(<UploadedFilesList />);
    await screen.findByText('temp.txt');
    await user.click(screen.getByRole('button', { name: '삭제' }));

    expect(fetchSpy).toHaveBeenCalledWith('/api/uploads/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', { method: 'DELETE' });
  });
});
