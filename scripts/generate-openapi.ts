import fs from 'fs';
import path from 'path';
import { swaggerSpec } from '../src/swagger/swagger.config';

/**
 * Generate OpenAPI spec as TypeScript constant at build time
 * This ensures the spec is available in serverless environments
 */

// Generate TypeScript file with embedded spec
const tsOutputPath = path.join(__dirname, '../src/swagger/generated-spec.ts');
const tsContent = `// Auto-generated file - do not edit
// Generated at build time from JSDoc comments
export const generatedSpec = ${JSON.stringify(swaggerSpec, null, 2)};
`;

fs.writeFileSync(tsOutputPath, tsContent);

console.log(`✅ OpenAPI spec generated: ${tsOutputPath}`);
const spec = swaggerSpec as any;
console.log(`   Endpoints found: ${Object.keys(spec.paths || {}).length}`);
