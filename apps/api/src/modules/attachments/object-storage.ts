import { Inject, Injectable, ServiceUnavailableException, type OnModuleDestroy } from '@nestjs/common';
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { APP_ENVIRONMENT, type Environment } from '../../config/environment';

@Injectable()
export class ObjectStorage implements OnModuleDestroy {
  private readonly client: S3Client;
  private ready: Promise<void> | undefined;
  constructor(@Inject(APP_ENVIRONMENT) private readonly environment: Environment) {
    const local = environment.NODE_ENV !== 'production';
    this.client = new S3Client({ region: environment.S3_REGION,
      endpoint: environment.S3_ENDPOINT ?? (local ? 'http://127.0.0.1:9000' : undefined), forcePathStyle: !!environment.S3_ENDPOINT || local,
      credentials: environment.S3_ACCESS_KEY && environment.S3_SECRET_KEY ? { accessKeyId: environment.S3_ACCESS_KEY, secretAccessKey: environment.S3_SECRET_KEY }
        : local ? { accessKeyId: 'chat-local', secretAccessKey: 'chat-local-storage-password' } : undefined,
      maxAttempts: 2, requestHandler: { connectionTimeout: 3000, requestTimeout: 15000 },
    });
  }
  private async bucket() {
    if (this.environment.NODE_ENV === 'production') return;
    this.ready ??= (async () => {
      try { await this.client.send(new HeadBucketCommand({ Bucket: this.environment.S3_BUCKET })); }
      catch (error) {
        if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw error;
        try { await this.client.send(new CreateBucketCommand({ Bucket: this.environment.S3_BUCKET })); }
        catch (cause) { if ((cause as { name?: string }).name !== 'BucketAlreadyOwnedByYou') throw cause; }
      }
    })().catch((error) => { this.ready = undefined; throw error; });
    await this.ready;
  }
  async put(key: string, bytes: Buffer, mimeType: string) {
    try {
      await this.bucket();
      await this.client.send(new PutObjectCommand({ Bucket: this.environment.S3_BUCKET, Key: key, Body: bytes, ContentType: mimeType }));
    } catch { throw new ServiceUnavailableException({ message: '파일 저장소에 연결하지 못했습니다. 저장소 실행 상태를 확인해 주세요.' }); }
  }
  async get(key: string) {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.environment.S3_BUCKET, Key: key }));
      if (!result.Body) throw new Error('Missing object');
      return Buffer.from(await result.Body.transformToByteArray());
    } catch { throw new ServiceUnavailableException({ message: '파일을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.' }); }
  }
  async remove(key: string) {
    try { await this.client.send(new DeleteObjectCommand({ Bucket: this.environment.S3_BUCKET, Key: key })); }
    catch { /* 저장 실패 후 정리 오류가 원래 오류를 덮어쓰지 않도록 합니다. */ }
  }
  onModuleDestroy() { this.client.destroy(); }
}
