/**
 * Foto de perfil: PNG/JPG/JPEG/WEBP/GIF até 5 MB.
 * Imagens estáticas viram WEBP 512x512 (sharp); GIF é mantido animado (só valida tamanho).
 * Arquivos ficam em config.uploadsDir/avatars e são servidos em /api/uploads/avatars/<arquivo>.
 */
import { Router } from 'express';
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { mkdirSync, existsSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { handle, badRequest } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import { meView } from '../services/view.js';
import { meInclude } from '../lib/items.js';

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const AVATARS = join(config.uploadsDir, 'avatars');
mkdirSync(AVATARS, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED.has(file.mimetype)),
});

export const uploads = Router();

// Arquivos públicos (cache longo: o nome muda a cada upload)
uploads.use('/', express.static(config.uploadsDir, { maxAge: '30d', immutable: true, index: false, fallthrough: true }));

function removeOld(url) {
  if (!url) return;
  const name = url.split('/').pop();
  if (!name || name.includes('..')) return;
  const p = join(AVATARS, name);
  try { if (existsSync(p)) unlinkSync(p); } catch {}
}

uploads.post('/avatar', requireAuth, (req, res, next) => {
  upload.single('avatar')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'too-large', message: 'A imagem precisa ter no máximo 5 MB.' });
    if (err) return res.status(400).json({ error: 'upload', message: 'Não foi possível receber a imagem.' });
    next();
  });
}, handle(async (req) => {
  const file = req.file;
  if (!file) throw badRequest('Envie uma imagem PNG, JPG, WEBP ou GIF de até 5 MB.');
  const stamp = Date.now().toString(36);
  let name, buffer;
  if (file.mimetype === 'image/gif') {
    // mantém o GIF animado como veio
    name = `${req.user.id}-${stamp}.gif`;
    buffer = file.buffer;
  } else {
    name = `${req.user.id}-${stamp}.webp`;
    buffer = await sharp(file.buffer).rotate().resize(512, 512, { fit: 'cover', position: 'attention' }).webp({ quality: 85 }).toBuffer();
  }
  writeFileSync(join(AVATARS, name), buffer);
  const url = `/api/uploads/avatars/${name}`;
  const prev = await prisma.user.findUnique({ where: { id: req.user.id }, select: { avatarUrl: true } });
  const user = await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl: url }, include: meInclude() });
  removeOld(prev?.avatarUrl);
  return meView(user);
}));

uploads.delete('/avatar', requireAuth, handle(async (req) => {
  const prev = await prisma.user.findUnique({ where: { id: req.user.id }, select: { avatarUrl: true } });
  const user = await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl: null }, include: meInclude() });
  removeOld(prev?.avatarUrl);
  return meView(user);
}));
