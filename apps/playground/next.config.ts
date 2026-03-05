import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias['ai-sdk-pollinations'] = path.resolve(__dirname, 'src');
    return config;
  },
};

export default nextConfig;
