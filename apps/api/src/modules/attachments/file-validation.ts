import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { MAX_ATTACHMENT_SIZE } from '@chat/contracts';

export interface UploadedAttachment { buffer: Buffer; originalname: string; mimetype: string; size: number }
export function validateFile(file?: UploadedAttachment) {
  if (!file?.buffer.length) throw new BadRequestException({ message: '비어 있지 않은 파일 하나를 선택해 주세요.' });
  if (file.buffer.length > MAX_ATTACHMENT_SIZE) throw new PayloadTooLargeException({ message: '파일은 10MB까지 보낼 수 있습니다.' });
  let original = file.originalname;
  if (!/[^\u0000-\u00ff]/.test(original)) {
    const decoded = Buffer.from(original, 'latin1').toString('utf8');
    if (!decoded.includes('\ufffd')) original = decoded;
  }
  const filename = (original.split(/[\\/]/).at(-1) ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!filename || filename.length > 200) throw new BadRequestException({ message: '파일 이름은 1~200자로 지정해 주세요.' });
  const extension = extname(filename).toLowerCase();
  const bytes = file.buffer;
  const starts = (value: number[]) => value.every((byte, index) => bytes[index] === byte);
  let mimeType: string | undefined;
  if (extension === '.png' && starts([137, 80, 78, 71, 13, 10, 26, 10])) mimeType = 'image/png';
  else if (['.jpg', '.jpeg'].includes(extension) && starts([255, 216, 255])) mimeType = 'image/jpeg';
  else if (extension === '.gif' && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) mimeType = 'image/gif';
  else if (extension === '.webp' && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') mimeType = 'image/webp';
  else if (extension === '.pdf' && bytes.subarray(0, 5).toString('ascii') === '%PDF-') mimeType = 'application/pdf';
  else if (extension === '.zip' && (starts([80, 75, 3, 4]) || starts([80, 75, 5, 6]))) mimeType = 'application/zip';
  else if (extension === '.txt' && !bytes.includes(0)) {
    try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); mimeType = 'text/plain'; } catch { /* UTF-8 텍스트만 지원합니다. */ }
  }
  if (!mimeType || (file.mimetype && file.mimetype !== 'application/octet-stream' && file.mimetype !== mimeType &&
    !(mimeType === 'application/zip' && file.mimetype === 'application/x-zip-compressed'))) {
    throw new BadRequestException({ message: '파일 형식을 확인해 주세요. JPG·PNG·GIF·WebP·PDF·TXT·ZIP을 지원합니다.' });
  }
  return { filename, mimeType, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
