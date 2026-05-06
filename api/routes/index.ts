import { Router } from 'express';
import interfacesRouter from './interfaces';
import modelsRouter from './models';
import mappingsRouter from './mappings';
import graphRouter from './graph';
import statsRouter from './stats';

const router = Router();

router.use('/interfaces', interfacesRouter);
router.use('/models', modelsRouter);
router.use('/mappings', mappingsRouter);
router.use('/graph', graphRouter);
router.use('/stats', statsRouter);

export default router;
