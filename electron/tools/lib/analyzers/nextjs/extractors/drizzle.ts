/**
 * Drizzle Dependency Extractor
 * Handles extraction of Drizzle ORM table operations.
 */
import ts from 'typescript';
import { ApiDependencies } from '../types';

/**
 * Extract Drizzle table access: db.select().from(usersTable), db.insert(usersTable)
 */
export function extractDrizzleTableAccess(node: ts.CallExpression, deps: ApiDependencies): void {
    const expr = node.expression;
    
    // Look for .from(table) or .insert(table).into(table)
    if (ts.isPropertyAccessExpression(expr)) {
        const methodName = expr.name.text;
        
        // db.select().from(tableName)
        if (methodName === 'from' && node.arguments.length > 0) {
            const tableArg = node.arguments[0];
            const tableName = extractTableName(tableArg);
            if (tableName) {
                deps.tables.push(tableName);
            }
        }
        
        // db.insert(tableName) or db.update(tableName) or db.delete(tableName)
        if (['insert', 'update', 'delete'].includes(methodName) && node.arguments.length > 0) {
            const tableArg = node.arguments[0];
            const tableName = extractTableName(tableArg);
            if (tableName) {
                deps.tables.push(tableName);
            }
        }
    }
}

/**
 * Extract table name from identifier (e.g., usersTable -> users)
 */
function extractTableName(arg: ts.Expression): string | null {
    if (ts.isIdentifier(arg)) {
        let name = arg.text;
        // Remove common suffixes (case-insensitive)
        name = name.replace(/table$/i, '').replace(/schema$/i, '');
        // Convert camelCase to lowercase
        return name.toLowerCase();
    }
    return null;
}
