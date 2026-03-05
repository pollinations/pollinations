import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      playground: path.resolve(__dirname, 'src'),
    },
  },
};

export default nextConfig;
