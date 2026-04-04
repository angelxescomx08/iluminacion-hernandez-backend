export type UploadPublicObjectInput = {
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
};

export interface ObjectStoragePort {
  uploadPublicObject(input: UploadPublicObjectInput): Promise<{ publicUrl: string }>;
  deleteObject(key: string): Promise<void>;
}
