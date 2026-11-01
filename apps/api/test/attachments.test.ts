import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { MAX_ATTACHMENT_SIZE } from '@chat/contracts';
import { validateFile } from '../src/modules/attachments/file-validation';

const file = (name: string, bytes: Buffer, mimetype = 'application/octet-stream') => ({ originalname: name, buffer: bytes, size: bytes.length, mimetype });
test('첨부파일은 확장자·실제 내용·MIME을 함께 확인한다', () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  assert.equal(validateFile(file('photo.PNG', png, 'image/png')).mimeType, 'image/png');
  assert.equal(validateFile(file('메모.txt', Buffer.from('안녕하세요'), 'text/plain')).filename, '메모.txt');
  assert.throws(() => validateFile(file('photo.png', Buffer.from('<html>'), 'image/png')), BadRequestException);
  assert.throws(() => validateFile(file('photo.png', png, 'text/html')), BadRequestException);
  assert.throws(() => validateFile(file('test.svg', Buffer.from('<svg/>'), 'image/svg+xml')), BadRequestException);
  assert.throws(() => validateFile(file('test.txt', Buffer.from([0xff, 0xfe]))), BadRequestException);
  assert.throws(() => validateFile(file('test.txt', Buffer.from([0]))), BadRequestException);
});
test('첨부파일은 빈 파일·10MB 초과·지나치게 긴 이름을 거부한다', () => {
  assert.throws(() => validateFile(), BadRequestException);
  assert.throws(() => validateFile(file('empty.txt', Buffer.alloc(0))), BadRequestException);
  assert.throws(() => validateFile(file('large.txt', Buffer.alloc(MAX_ATTACHMENT_SIZE + 1))), PayloadTooLargeException);
  assert.equal(validateFile(file('max.txt', Buffer.alloc(MAX_ATTACHMENT_SIZE, 65))).size, MAX_ATTACHMENT_SIZE);
  assert.throws(() => validateFile(file('a'.repeat(200) + '.txt', Buffer.from('text'))), BadRequestException);
});
test('첨부파일은 한글 이름을 복원하고 경로·제어 문자를 제거한다', () => {
  const name = Buffer.from('안내.txt').toString('latin1');
  assert.equal(validateFile(file(name, Buffer.from('내용'))).filename, '안내.txt');
  assert.equal(validateFile(file('C:\\temp\\안내\r\n.txt', Buffer.from('내용'))).filename, '안내.txt');
  assert.equal(validateFile(file('../../notice.txt', Buffer.from('내용'))).filename, 'notice.txt');
});
