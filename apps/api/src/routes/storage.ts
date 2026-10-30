import { CreateStorageRequestInputSchema, CreateWarehouseSpaceInputSchema } from '@deadspace/shared';
import { Router } from 'express';
import type { PrismaClient } from '../db.js';
import { sendNotFound, sendValidationError } from '../middleware/validation.js';
import {
  createWarehouseListing,
  getStorageMatches,
  getStorageRequest,
  getWarehouseSpace,
  submitStorageRequest,
} from '../services/storage.service.js';

export function storageRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.post('/warehouse-spaces', async (req, res) => {
    const parsed = CreateWarehouseSpaceInputSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    res.status(201).json(await createWarehouseListing(prisma, parsed.data));
  });

  router.get('/warehouse-spaces/:id', async (req, res) => {
    const space = await getWarehouseSpace(prisma, req.params.id);
    if (!space) return sendNotFound(res, 'Warehouse space not found');
    res.json(space);
  });

  router.post('/storage-requests', async (req, res) => {
    const parsed = CreateStorageRequestInputSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    res.status(201).json(await submitStorageRequest(prisma, parsed.data));
  });

  router.get('/storage-requests/:id', async (req, res) => {
    const request = await getStorageRequest(prisma, req.params.id);
    if (!request) return sendNotFound(res, 'Storage request not found');
    res.json(request);
  });

  router.get('/storage-requests/:id/matches', async (req, res) => {
    const result = await getStorageMatches(prisma, req.params.id);
    if (!result) return sendNotFound(res, 'Storage request not found');
    res.json(result);
  });

  return router;
}
