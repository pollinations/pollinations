import Conf from 'conf';

export interface CliConfig {
  apiUrl: string;
  defaultImageModel: string;
  defaultTextModel: string;
  defaultVoice: string;
  outputDirectory: string;
  debug: boolean;
}

const defaultConfig: CliConfig = {
  apiUrl: 'https://enter.pollinations.ai',
  defaultImageModel: 'flux',
  defaultTextModel: 'openai',
  defaultVoice: 'alloy',
  outputDirectory: './output',
  debug: false
};

const config = new Conf<CliConfig>({
  projectName: 'pollinations-cli',
  defaults: defaultConfig
});

export function getConfig(): Conf<CliConfig> {
  return config;
}

export function get<K extends keyof CliConfig>(key: K): CliConfig[K] {
  return config.get(key);
}

export function set<K extends keyof CliConfig>(key: K, value: CliConfig[K]): void {
  config.set(key, value);
}

export function reset(): void {
  config.clear();
  Object.entries(defaultConfig).forEach(([key, value]) => {
    config.set(key as keyof CliConfig, value);
  });
}