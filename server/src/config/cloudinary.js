import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env } from './env.js';

const { cloudName, apiKey, apiSecret } = env.cloudinary;
export const cloudinaryEnabled = Boolean(cloudName && apiKey && apiSecret);

if (cloudinaryEnabled) {
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
}

fs.mkdirSync(env.uploadsDir, { recursive: true });

/**
 * Uploads a Multer memory-storage file and returns a public URL.
 * Uses Cloudinary when credentials exist, otherwise writes to server/uploads
 * which Express serves at /uploads.
 */
export async function uploadMedia(file, { folder = 'annam', resourceType = 'image' } = {}) {
  if (!file) throw new Error('No file provided');

  if (cloudinaryEnabled) {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: resourceType },
        (error, res) => (error ? reject(error) : resolve(res))
      );
      stream.end(file.buffer);
    });
    return { url: result.secure_url, publicId: result.public_id, provider: 'cloudinary' };
  }

  const ext = path.extname(file.originalname) || (resourceType === 'video' ? '.mp4' : '.jpg');
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const dir = path.join(env.uploadsDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, name), file.buffer);
  return { url: `/uploads/${folder}/${name}`, publicId: `${folder}/${name}`, provider: 'local' };
}
