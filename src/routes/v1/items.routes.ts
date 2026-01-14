import { Router } from 'express';
import { ItemController } from '../../controllers/item.controller';
import { ItemService } from '../../services/item.service';
import { ItemRepository } from '../../repositories/item.repository';
import { validate } from '../../middleware/validation.middleware';
import { createItemSchema, getItemSchema } from '../../validators/item.validator';
import { getSupabaseClient } from '../../config/database';

/**
 * Item routes (v1)
 */
const router = Router();

// Initialize dependencies
const supabaseClient = getSupabaseClient();
const itemRepository = new ItemRepository(supabaseClient);
const itemService = new ItemService(itemRepository);
const itemController = new ItemController(itemService);

/**
 * @swagger
 * /v1/items:
 *   post:
 *     summary: Create a new item
 *     tags: [Items]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - initial_quantity
 *             properties:
 *               name:
 *                 type: string
 *               initial_quantity:
 *                 type: integer
 *                 minimum: 1
 *     responses:
 *       201:
 *         description: Item created successfully
 */
router.post('/', validate(createItemSchema), itemController.createItem);

/**
 * @swagger
 * /v1/items/{id}:
 *   get:
 *     summary: Get item with availability breakdown
 *     tags: [Items]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Item retrieved successfully
 *       404:
 *         description: Item not found
 */
router.get('/:id', validate(getItemSchema), itemController.getItem);

export default router;
