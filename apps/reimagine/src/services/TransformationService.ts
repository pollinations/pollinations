import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  TransformationChain,
  TransformationVersion,
} from '../types/transformation';
import { ImageSource } from '../types/imageSelection';

const TRANSFORMATIONS_KEY = '@reimagine_transformations';

class TransformationService {
  

  static async getAllChains(): Promise<TransformationChain[]> {
    try {
      const data = await AsyncStorage.getItem(TRANSFORMATIONS_KEY);
      if (!data) return [];
      
      const chains: TransformationChain[] = JSON.parse(data);
      
      // order by last update
      return chains.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch (error) {
      console.error('Error loading transformation chains:', error);
      return [];
    }
  }


  static async getChain(chainId: string): Promise<TransformationChain | null> {
    try {
      const chains = await this.getAllChains();
      return chains.find(c => c.id === chainId) || null;
    } catch (error) {
      console.error('Error getting chain:', error);
      return null;
    }
  }


  static async createChain(
    sourceImages: ImageSource[],
    firstVersion: TransformationVersion
  ): Promise<TransformationChain> {
    try {
      const chainId = `chain_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const newChain: TransformationChain = {
        id: chainId,
        sourceImages,
        versions: [firstVersion],
        currentVersionId: firstVersion.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const chains = await this.getAllChains();
      chains.unshift(newChain);
      
      await AsyncStorage.setItem(TRANSFORMATIONS_KEY, JSON.stringify(chains));
      
      console.log('✅ Created transformation chain:', chainId);
      return newChain;
      
    } catch (error) {
      console.error('Error creating chain:', error);
      throw error;
    }
  }


  static async addVersion(
    chainId: string,
    newVersion: TransformationVersion
  ): Promise<TransformationChain | null> {
    try {
      const chains = await this.getAllChains();
      const chainIndex = chains.findIndex(c => c.id === chainId);
      
      if (chainIndex === -1) {
        console.error('Chain not found:', chainId);
        return null;
      }

      const chain = chains[chainIndex];

      chain.versions.push(newVersion);
      chain.currentVersionId = newVersion.id;
      chain.updatedAt = new Date().toISOString();
      
      chains[chainIndex] = chain;
      
      await AsyncStorage.setItem(TRANSFORMATIONS_KEY, JSON.stringify(chains));
      
      console.log('✅ Added version to chain:', chainId, newVersion.versionNumber);
      return chain;
      
    } catch (error) {
      console.error('Error adding version:', error);
      return null;
    }
  }


  static async deleteChain(chainId: string): Promise<boolean> {
    try {
      const chains = await this.getAllChains();
      const filteredChains = chains.filter(c => c.id !== chainId);
      
      await AsyncStorage.setItem(TRANSFORMATIONS_KEY, JSON.stringify(filteredChains));
      
      console.log('✅ Deleted chain:', chainId);
      return true;
      
    } catch (error) {
      console.error('Error deleting chain:', error);
      return false;
    }
  }


  static async deleteVersion(chainId: string, versionId: string): Promise<boolean> {
    try {
      const chains = await this.getAllChains();
      const chainIndex = chains.findIndex(c => c.id === chainId);
      
      if (chainIndex === -1) return false;
      
      const chain = chains[chainIndex];

      if (chain.versions.length === 1) {
        console.warn('Cannot delete the only version');
        return false;
      }

      chain.versions = chain.versions.filter(v => v.id !== versionId);

      if (chain.currentVersionId === versionId) {
        chain.currentVersionId = chain.versions[chain.versions.length - 1].id;
      }
      
      chain.updatedAt = new Date().toISOString();
      chains[chainIndex] = chain;
      
      await AsyncStorage.setItem(TRANSFORMATIONS_KEY, JSON.stringify(chains));
      
      console.log('✅ Deleted version:', versionId);
      return true;
      
    } catch (error) {
      console.error('Error deleting version:', error);
      return false;
    }
  }

  static async setCurrentVersion(chainId: string, versionId: string): Promise<boolean> {
    try {
      const chains = await this.getAllChains();
      const chainIndex = chains.findIndex(c => c.id === chainId);
      
      if (chainIndex === -1) return false;
      
      const chain = chains[chainIndex];
      const versionExists = chain.versions.some(v => v.id === versionId);
      
      if (!versionExists) return false;
      
      chain.currentVersionId = versionId;
      chain.updatedAt = new Date().toISOString();
      chains[chainIndex] = chain;
      
      await AsyncStorage.setItem(TRANSFORMATIONS_KEY, JSON.stringify(chains));
      
      return true;
      
    } catch (error) {
      console.error('Error setting current version:', error);
      return false;
    }
  }

  static async toggleFavorite(chainId: string, versionId: string): Promise<boolean> {
    try {
      const chains = await this.getAllChains();
      const chainIndex = chains.findIndex(c => c.id === chainId);
      
      if (chainIndex === -1) return false;
      
      const chain = chains[chainIndex];
      const versionIndex = chain.versions.findIndex(v => v.id === versionId);
      
      if (versionIndex === -1) return false;
      
      chain.versions[versionIndex].favorite = !chain.versions[versionIndex].favorite;
      chain.updatedAt = new Date().toISOString();
      chains[chainIndex] = chain;
      
      await AsyncStorage.setItem(TRANSFORMATIONS_KEY, JSON.stringify(chains));
      
      console.log('✅ Toggled favorite:', versionId);
      return true;
      
    } catch (error) {
      console.error('Error toggling favorite:', error);
      return false;
    }
  }

  /**
   * keep only the first 100 transfo
   */
  static async cleanup(): Promise<void> {
    try {
      const chains = await this.getAllChains();

      if (chains.length > 100) {
        const kept = chains.slice(0, 100);
        await AsyncStorage.setItem(TRANSFORMATIONS_KEY, JSON.stringify(kept));
        console.log(`🧹 Cleaned up transformations: kept ${kept.length}/${chains.length}`);
      }
    } catch (error) {
      console.error('Error cleaning up transformations:', error);
    }
  }


  static async getFavoriteChains(): Promise<TransformationChain[]> {
    try {
      const chains = await this.getAllChains();
      return chains.filter(chain => 
        chain.versions.some(v => v.favorite)
      );
    } catch (error) {
      console.error('Error getting favorite chains:', error);
      return [];
    }
  }
}

export default TransformationService;