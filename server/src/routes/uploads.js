// Upload d'images : Multer (mémoire, 5 Mo max) -> Cloudinary.
// Sans CLOUDINARY_URL, en développement uniquement : stockage sur disque local servi par /uploads.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { v2 as cloudinary } from 'cloudinary';
import { ah, HttpError, requireAuth } from '../middleware.js';
import { config } from '../config.js';

export const LOCAL_UPLOAD_DIR = path.resolve('uploads');
const MAX_BYTES = 5 * 1024 * 1024;

const useCloudinary = Boolean(process.env.CLOUDINARY_URL);
if (useCloudinary) cloudinary.config({ secure: true }); // lit CLOUDINARY_URL

/** Type réel du fichier d'après ses premiers octets (le Content-Type du client n'est pas fiable). */
export function sniffImage(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a') return 'gif';
  return null;
}

function uploadToCloudinary(buffer, userId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `nexora/${config.env}`,
        resource_type: 'image',
        context: { uploader: String(userId) },
        // Limite la taille stockée et retire les métadonnées EXIF (GPS…).
        transformation: [{ width: 2048, height: 2048, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
      },
      (err, result) => (err ? reject(err) : resolve(result)),
    );
    stream.end(buffer);
  });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

const limiter = rateLimit({ windowMs: 60 * 60_000, limit: config.isTest ? 1000 : 60, standardHeaders: 'draft-7', legacyHeaders: false });

const router = Router();

router.post('/', requireAuth, limiter, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'Image trop lourde (5 Mo max)'));
    if (err) return next(new HttpError(400, 'Fichier invalide'));
    next();
  });
}, ah(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Champ "image" manquant');
  const ext = sniffImage(req.file.buffer);
  if (!ext) throw new HttpError(415, 'Formats acceptés : JPEG, PNG, WebP, GIF');

  if (useCloudinary) {
    const r = await uploadToCloudinary(req.file.buffer, req.user.id);
    return res.status(201).json({ url: r.secure_url, publicId: r.public_id, width: r.width, height: r.height });
  }
  if (config.isProd) throw new HttpError(503, 'Upload non configuré (CLOUDINARY_URL)');

  const name = `${crypto.randomUUID()}.${ext}`;
  await fs.mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_UPLOAD_DIR, name), req.file.buffer);
  res.status(201).json({ url: `/uploads/${name}`, publicId: `local/${name}` });
}));

/** Supprime les images d'un post (appelé à la suppression du post ou du compte). */
export async function deleteImages(images = []) {
  await Promise.allSettled(images.map(async ({ publicId }) => {
    if (!publicId) return;
    if (publicId.startsWith('local/')) {
      return fs.unlink(path.join(LOCAL_UPLOAD_DIR, path.basename(publicId)));
    }
    if (useCloudinary) return cloudinary.uploader.destroy(publicId);
  }));
}

/** N'accepte dans un post que des images venant de notre stockage. */
export function isOwnImageUrl(url) {
  if (url.startsWith('/uploads/')) return !config.isProd && /^\/uploads\/[a-f0-9-]+\.(jpg|png|webp|gif)$/.test(url);
  const cloud = process.env.CLOUDINARY_URL?.split('@')[1];
  return Boolean(cloud) && url.startsWith(`https://res.cloudinary.com/${cloud}/image/upload/`);
}

export default router;
