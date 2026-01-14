import fs from 'fs';
import path from 'path';
import { swaggerSpec } from '../src/swagger/swagger.config';

/**
 * Generate OpenAPI JSON file at build time
 * This ensures the spec is available in serverless environments
 */
const outputPath = path.join(__dirname, '../dist/openapi.json');

// Ensure dist directory exists
const distDir = path.dirname(outputPath);
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Write the spec to file
fs.writeFileSync(outputPath, JSON.stringify(swaggerSpec, null, 2));

console.log(`✅ OpenAPI spec generated: ${outputPath}`);
const spec = swaggerSpec as any;
console.log(`   Endpoints found: ${Object.keys(spec.paths || {}).length}`);
