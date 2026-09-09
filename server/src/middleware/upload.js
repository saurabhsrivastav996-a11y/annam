import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

function makeUploader(allowed, maxMb) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (allowed.includes(file.mimetype)) return cb(null, true);
      cb(new ApiError(400, `Unsupported file type: ${file.mimetype}`));
    },
  });
}

export const uploadImage = makeUploader(IMAGE_TYPES, 5);
export const uploadVideo = makeUploader(VIDEO_TYPES, 50);
