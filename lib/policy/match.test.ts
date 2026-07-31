import { describe, expect, it } from 'vitest';
import { findBlockedExtension } from './match';

describe('findBlockedExtension', () => {
  it('단일 확장자를 대소문자 구분 없이 차단하고 매칭된 확장자를 반환한다', () => {
    expect(findBlockedExtension('tool.EXE', ['exe'])).toBe('exe');
    expect(findBlockedExtension('photo.jpg', ['exe'])).toBeNull();
  });

  it('복합 확장자를 등록하면 정확히 일치하는 파일만 차단한다', () => {
    expect(findBlockedExtension('backup.tar.gz', ['tar.gz'])).toBe('tar.gz');
    expect(findBlockedExtension('backup.gz', ['tar.gz'])).toBeNull();
  });

  it('단일 gz 등록 시 .gz로 끝나는 모든 파일을 차단한다', () => {
    expect(findBlockedExtension('backup.tar.gz', ['gz'])).toBe('gz');
  });

  it('확장자가 없는 파일은 차단하지 않는다', () => {
    expect(findBlockedExtension('README', ['env'])).toBeNull();
    expect(findBlockedExtension('Makefile', ['env'])).toBeNull();
  });

  it('점으로 끝나는 파일은 확장자 없는 파일로 취급한다', () => {
    expect(findBlockedExtension('file.', ['env'])).toBeNull();
  });

  it('점으로 시작하는 파일은 접미사가 정확히 일치할 때만 차단한다', () => {
    expect(findBlockedExtension('.env', ['env'])).toBe('env');
    expect(findBlockedExtension('.env.local', ['env'])).toBeNull();
    expect(findBlockedExtension('.env.local', ['env.local'])).toBe('env.local');
  });

  it('module.css 등록 시 button.module.css를 차단한다', () => {
    expect(findBlockedExtension('button.module.css', ['module.css'])).toBe('module.css');
  });

  it('여러 확장자가 등록된 경우 먼저 일치하는 확장자를 반환한다', () => {
    expect(findBlockedExtension('tool.exe', ['bat', 'exe', 'scr'])).toBe('exe');
  });
});
