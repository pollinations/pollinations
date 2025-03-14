import { useStore } from '@nanostores/react';
import {
  isDebugMode,
  isEventLogsEnabled,
  isLocalModelsEnabled,
  LOCAL_PROVIDERS,
  promptStore,
  providersStore,
  latestBranchStore,
  autoSelectStarterTemplate,
  enableContextOptimizationStore,
} from '~/lib/stores/settings';
import { useCallback, useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import type { IProviderSetting, ProviderInfo } from '~/types/model';
import { logStore } from '~/lib/stores/logs'; // assuming logStore is imported from this location

interface CommitData {
  commit: string;
  version?: string;
}

const versionData: CommitData = {
  commit: __COMMIT_HASH,
  version: __APP_VERSION,
};

export function useSettings() {
  const providers = useStore(providersStore);
  const debug = useStore(isDebugMode);
  const eventLogs = useStore(isEventLogsEnabled);
  const promptId = useStore(promptStore);
  const isLocalModel = useStore(isLocalModelsEnabled);
  const isLatestBranch = useStore(latestBranchStore);
  const autoSelectTemplate = useStore(autoSelectStarterTemplate);
  const [activeProviders, setActiveProviders] = useState<ProviderInfo[]>([]);
  const contextOptimizationEnabled = useStore(enableContextOptimizationStore);

  // Function to check if we're on stable version
  const checkIsStableVersion = async () => {
    try {
      const response = await fetch(
        `https://api.github.com/repos/stackblitz-labs/bolt.diy/git/refs/tags/v${versionData.version}`,
      );
      const data: { object: { sha: string } } = await response.json();

      return versionData.commit.slice(0, 7) === data.object.sha.slice(0, 7);
    } catch (error) {
      console.warn('Error checking stable version:', error);
      return false;
    }
  };

  // reading values from cookies on mount
  useEffect(() => {
    const savedProviders = Cookies.get('providers');

    if (savedProviders) {
      try {
        const parsedProviders: Record<string, IProviderSetting> = JSON.parse(savedProviders);
        Object.keys(providers).forEach((provider) => {
          const currentProviderSettings = parsedProviders[provider];

          if (currentProviderSettings) {
            providersStore.setKey(provider, {
              ...providers[provider],
              settings: {
                ...currentProviderSettings,
                enabled: currentProviderSettings.enabled ?? true,
              },
            });
          }
        });
      } catch (error) {
        console.error('Failed to parse providers from cookies:', error);
      }
    }

    // load debug mode from cookies
    const savedDebugMode = Cookies.get('isDebugEnabled');

    if (savedDebugMode) {
      isDebugMode.set(savedDebugMode === 'true');
    }

    // load event logs from cookies
    const savedEventLogs = Cookies.get('isEventLogsEnabled');

    if (savedEventLogs) {
      isEventLogsEnabled.set(savedEventLogs === 'true');
    }

    // load local models from cookies
    const savedLocalModels = Cookies.get('isLocalModelsEnabled');

    if (savedLocalModels) {
      isLocalModelsEnabled.set(savedLocalModels === 'true');
    }

    const promptId = Cookies.get('promptId');

    if (promptId) {
      promptStore.set(promptId);
    }

    // load latest branch setting from cookies or determine based on version
    const savedLatestBranch = Cookies.get('isLatestBranch');
    let checkCommit = Cookies.get('commitHash');

    if (checkCommit === undefined) {
      checkCommit = versionData.commit;
    }

    if (savedLatestBranch === undefined || checkCommit !== versionData.commit) {
      // If setting hasn't been set by user, check version
      checkIsStableVersion().then((isStable) => {
        const shouldUseLatest = !isStable;
        latestBranchStore.set(shouldUseLatest);
        Cookies.set('isLatestBranch', String(shouldUseLatest));
        Cookies.set('commitHash', String(versionData.commit));
      });
    } else {
      latestBranchStore.set(savedLatestBranch === 'true');
    }

    const autoSelectTemplate = Cookies.get('autoSelectTemplate');

    if (autoSelectTemplate) {
      autoSelectStarterTemplate.set(autoSelectTemplate === 'true');
    }

    const savedContextOptimizationEnabled = Cookies.get('contextOptimizationEnabled');

    if (savedContextOptimizationEnabled) {
      enableContextOptimizationStore.set(savedContextOptimizationEnabled === 'true');
    }
  }, []);

  // writing values to cookies on change
  useEffect(() => {
    const providers = providersStore.get();
    const providerSetting: Record<string, IProviderSetting> = {};
    Object.keys(providers).forEach((provider) => {
      providerSetting[provider] = providers[provider].settings;
    });
    Cookies.set('providers', JSON.stringify(providerSetting));
  }, [providers]);

  useEffect(() => {
    let active = Object.entries(providers)
      .filter(([_key, provider]) => provider.settings.enabled)
      .map(([_k, p]) => p);

    if (!isLocalModel) {
      active = active.filter((p) => !LOCAL_PROVIDERS.includes(p.name));
    }

    setActiveProviders(active);
  }, [providers, isLocalModel]);

  // helper function to update settings
  const updateProviderSettings = useCallback(
    (provider: string, config: IProviderSetting) => {
      const settings = providers[provider].settings;
      providersStore.setKey(provider, { ...providers[provider], settings: { ...settings, ...config } });
    },
    [providers],
  );

  const enableDebugMode = useCallback((enabled: boolean) => {
    isDebugMode.set(enabled);
    logStore.logSystem(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    Cookies.set('isDebugEnabled', String(enabled));
  }, []);

  const enableEventLogs = useCallback((enabled: boolean) => {
    isEventLogsEnabled.set(enabled);
    logStore.logSystem(`Event logs ${enabled ? 'enabled' : 'disabled'}`);
    Cookies.set('isEventLogsEnabled', String(enabled));
  }, []);

  const enableLocalModels = useCallback((enabled: boolean) => {
    isLocalModelsEnabled.set(enabled);
    logStore.logSystem(`Local models ${enabled ? 'enabled' : 'disabled'}`);
    Cookies.set('isLocalModelsEnabled', String(enabled));
  }, []);

  const setPromptId = useCallback((promptId: string) => {
    promptStore.set(promptId);
    Cookies.set('promptId', promptId);
  }, []);
  const enableLatestBranch = useCallback((enabled: boolean) => {
    latestBranchStore.set(enabled);
    logStore.logSystem(`Main branch updates ${enabled ? 'enabled' : 'disabled'}`);
    Cookies.set('isLatestBranch', String(enabled));
  }, []);

  const setAutoSelectTemplate = useCallback((enabled: boolean) => {
    autoSelectStarterTemplate.set(enabled);
    logStore.logSystem(`Auto select template ${enabled ? 'enabled' : 'disabled'}`);
    Cookies.set('autoSelectTemplate', String(enabled));
  }, []);

  const enableContextOptimization = useCallback((enabled: boolean) => {
    enableContextOptimizationStore.set(enabled);
    logStore.logSystem(`Context optimization ${enabled ? 'enabled' : 'disabled'}`);
    Cookies.set('contextOptimizationEnabled', String(enabled));
  }, []);

  return {
    providers,
    activeProviders,
    updateProviderSettings,
    debug,
    enableDebugMode,
    eventLogs,
    enableEventLogs,
    isLocalModel,
    enableLocalModels,
    promptId,
    setPromptId,
    isLatestBranch,
    enableLatestBranch,
    autoSelectTemplate,
    setAutoSelectTemplate,
    contextOptimizationEnabled,
    enableContextOptimization,
  };
}
