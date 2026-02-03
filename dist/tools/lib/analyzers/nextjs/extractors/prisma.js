"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPrismaModelAccess = extractPrismaModelAccess;
/**
 * Prisma Dependency Extractor
 * Handles extraction of Prisma model access and table operations.
 */
const typescript_1 = __importDefault(require("typescript"));
const config_1 = require("../../core/config");
/**
 * Extract Prisma table access: prisma.user.findMany(), prisma.post.create()
 */
function extractPrismaModelAccess(node, deps, config) {
    // Pattern: prisma.MODEL.method() -> prisma is identifier, MODEL is property
    if (!typescript_1.default.isPropertyAccessExpression(node.expression))
        return;
    const parent = node.expression;
    if (!typescript_1.default.isIdentifier(parent.expression))
        return;
    const potentialPrisma = parent.expression.text.toLowerCase();
    const validClientNames = config.database?.clientNames || config_1.DEFAULT_CONFIG.database.clientNames || [];
    if (!validClientNames.includes(potentialPrisma))
        return;
    // The middle property is the model/table name
    const modelName = parent.name.text;
    // Common Prisma methods that indicate table access
    const prismaMethod = node.name.text;
    const prismaMethods = [
        'findMany', 'findFirst', 'findUnique', 'findFirstOrThrow', 'findUniqueOrThrow',
        'create', 'createMany', 'update', 'updateMany', 'upsert',
        'delete', 'deleteMany', 'count', 'aggregate', 'groupBy'
    ];
    if (prismaMethods.includes(prismaMethod)) {
        deps.tables.push(modelName);
    }
}
