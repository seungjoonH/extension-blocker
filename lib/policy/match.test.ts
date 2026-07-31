import { describe, expect, it } from 'vitest';
import { isExtensionBlocked } from './match';

describe('isExtensionBlocked', () => {
  it('단일 확장자를 대소문자 구분 없이 차단한다', () => {
    expect(isExtensionBlocked('tool.EXE', ['exe'])).toBe(true);
    expect(isExtensionBlocked('photo.jpg', ['exe'])).toBe(false);
  });

  it('복합 확장자를 등록하면 정확히 일치하는 파일만 차단한다', () => {
    expect(isExtensionBlocked('backup.tar.gz', ['tar.gz'])).toBe(true);
    expect(isExtensionBlocked('backup.gz', ['tar.gz'])).toBe(false);
  });

  it('단일 gz 등록 시 .gz로 끝나는 모든 파일을 차단한다', () => {
    expect(isExtensionBlocked('backup.tar.gz', ['gz'])).toBe(true);
  });

  it('확장자가 없는 파일은 차단하지 않는다', () => {
    expect(isExtensionBlocked('README', ['env'])).toBe(false);
    expect(isExtensionBlocked('Makefile', ['env'])).toBe(false);
  });

  it('점으로 끝나는 파일은 확장자 없는 파일로 취급한다', () => {
    expect(isExtensionBlocked('file.', ['env'])).toBe(false);
  });

  it('점으로 시작하는 파일은 접미사가 정확히 일치할 때만 차단한다', () => {
    expect(isExtensionBlocked('.env', ['env'])).toBe(true);
    expect(isExtensionBlocked('.env.local', ['env'])).toBe(false);
    expect(isExtensionBlocked('.env.local', ['env.local'])).toBe(true);
  });

  it('module.css 등록 시 button.module.css를 차단한다', () => {
    expect(isExtensionBlocked('button.module.css', ['module.css'])).toBe(true);
  });
});
