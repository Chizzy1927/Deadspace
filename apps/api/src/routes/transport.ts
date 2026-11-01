import { CreateTransportRequestInputSchema, CreateTruckLegInputSchema } from '@deadspace/shared';
import { Router } from 'express';
import type { PrismaClient } from '../db.js';
import { createWriteGuards, type DemoPolicy } from '../middleware/demo-policy.js';
import { sendNotFound, sendValidationError } from '../middleware/validation.js';
import {
  createTruckLegListing,
  getTransportMatches,
  getTransportRequest,
  getTruckLeg,
  submitTransportRequest,
} from '../services/transport.service.js';

export function transportRouter(prisma: PrismaClient, policy?: DemoPolicy): Router {
  const router = Router();
  const guards = createWriteGuards(policy);

  router.post(
    '/truck-legs',
    guards.listing(),
    guards.rateLimit(),
    guards.rowCap(() => prisma.truckLeg.count()),
    async (req, res) => {
      const parsed = CreateTruckLegInputSchema.safeParse(req.body);
      if (!parsed.success) return sendValidationError(res, parsed.error);
      res.status(201).json(await createTruckLegListing(prisma, parsed.data));
    },
  );

  router.get('/truck-legs/:id', async (req, res) => {
    const leg = await getTruckLeg(prisma, req.params.id);
    if (!leg) return sendNotFound(res, 'Truck leg not found');
    res.json(leg);
  });

  router.post(
    '/transport-requests',
    guards.rateLimit(),
    guards.rowCap(() => prisma.transportRequest.count()),
    async (req, res) => {
      const parsed = CreateTransportRequestInputSchema.safeParse(req.body);
      if (!parsed.success) return sendValidationError(res, parsed.error);
      res.status(201).json(await submitTransportRequest(prisma, parsed.data));
    },
  );

  router.get('/transport-requests/:id', async (req, res) => {
    const request = await getTransportRequest(prisma, req.params.id);
    if (!request) return sendNotFound(res, 'Transport request not found');
    res.json(request);
  });

  router.get('/transport-requests/:id/matches', async (req, res) => {
    const result = await getTransportMatches(prisma, req.params.id);
    if (!result) return sendNotFound(res, 'Transport request not found');
    res.json(result);
  });

  return router;
}
