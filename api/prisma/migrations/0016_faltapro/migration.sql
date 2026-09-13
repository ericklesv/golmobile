-- Falta PRO (cobrança de falta 3D): novo tipo de gol nos lances/artilharia
ALTER TYPE "KickKind" ADD VALUE IF NOT EXISTS 'FALTAPRO';
