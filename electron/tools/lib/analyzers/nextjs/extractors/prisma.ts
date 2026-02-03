/**
 * Prisma Dependency Extractor
 * Handles extraction of Prisma model access and table operations.
 */
import ts from 'typescript';
import { ApiDependencies } from '../types';
import { ApiVizConfig, DEFAULT_CONFIG } from '../../core/config';

/**
 * Extract Prisma table access: prisma.user.findMany(), prisma.post.create()
 */
export function extractPrismaModelAccess(
    node: ts.PropertyAccessExpression, 
    deps: ApiDependencies,
    config: ApiVizConfig
): void {
    // Pattern: prisma.MODEL.method() -> prisma is identifier, MODEL is property
    if (!ts.isPropertyAccessExpression(node.expression)) return;
    
    const parent = node.expression;
    if (!ts.isIdentifier(parent.expression)) return;
    
    const potentialPrisma = parent.expression.text.toLowerCase();
    const validClientNames = config.database?.clientNames || DEFAULT_CONFIG.database.clientNames || [];
    
    if (!validClientNames.includes(potentialPrisma)) return;
    
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
