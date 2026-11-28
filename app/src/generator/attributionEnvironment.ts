import { join } from 'node:path'

// Both ARES renderers read this at module load. Next.js bundling can replace __dirname with the
// build-time /ROOT placeholder. Resolve the traced, fixed-year config from the app's working
// directory, which is /app in the standalone image.
process.env.ATTRIBUTION_YAML ??= join(process.cwd(), 'src/generator/config/attribution.yaml')
