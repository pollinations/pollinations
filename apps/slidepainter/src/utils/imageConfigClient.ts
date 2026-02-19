import { clientImageConfig, ClientImageConfig, ClientImageSection } from './clientImageConfig';

export const ImageConfigClient = {
  async load(): Promise<ClientImageConfig> {
    return await clientImageConfig.getConfig();
  },

  async updateSection(sectionId: string, updates: Partial<ClientImageSection>): Promise<void> {
    await clientImageConfig.updateSection(sectionId, updates);
  },

  async replaceImages(sectionId: string, imageUrls: string[]): Promise<void> {
    await clientImageConfig.replaceImagesInSection(sectionId, imageUrls);
  },

  async updateProject(project: string): Promise<void> {
    await clientImageConfig.updateProject(project);
  },

  async updateImageUrl(imageUrl: string): Promise<void> {
    await clientImageConfig.updateImageUrl(imageUrl);
  },

  async resetConfig(): Promise<void> {
    await clientImageConfig.resetConfig();
  },

  async addSection(afterSectionId: string): Promise<string> {
    return await clientImageConfig.addSection(afterSectionId);
  },

  async deleteSection(sectionId: string): Promise<string | null> {
    return await clientImageConfig.deleteSection(sectionId);
  },

  async moveSection(sectionId: string, direction: 'left' | 'right'): Promise<void> {
    await clientImageConfig.moveSection(sectionId, direction);
  },
};
