"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractDrizzleTableAccess = extractDrizzleTableAccess;
/**
 * Drizzle Dependency Extractor
 * Handles extraction of Drizzle ORM table operations.
 */
const typescript_1 = __importDefault(require("typescript"));
/**
 * Extract Drizzle table access: db.select().from(usersTable), db.insert(usersTable)
 */
function extractDrizzleTableAccess(node, deps) {
    const expr = node.expression;
    // Look for .from(table) or .insert(table).into(table)
    if (typescript_1.default.isPropertyAccessExpression(expr)) {
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
function extractTableName(arg) {
    if (typescript_1.default.isIdentifier(arg)) {
        let name = arg.text;
        // Remove common suffixes (case-insensitive)
        name = name.replace(/table$/i, '').replace(/schema$/i, '');
        // Convert camelCase to lowercase
        return name.toLowerCase();
    }
    return null;
}
