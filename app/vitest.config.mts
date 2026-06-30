import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
    // Run the int spec files SEQUENTIALLY. Each file boots its own Payload (separate worker) which, in
    // dev `push` mode, builds the schema from the model. Running them in parallel against the one shared
    // lesson3_test races to CREATE the same tables/types ("already exists"). Sequential = the first push
    // creates the schema, the rest find it matching → no-op. (On the Rock the pre-migrated DB hid this;
    // a fresh push-built DB in CI exposed it.)
    fileParallelism: false,
  },
})
