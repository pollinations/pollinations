import axios from "axios";
import Constants from "expo-constants";
import type { BannedImage, BannedImagesResponse } from "../types/reporting";

export const getConfig = () => {
    const { BANNED_IMAGES_URL } = Constants.expoConfig.extra;
    return { BANNED_IMAGES_URL };
};

class BannedImagesService {
    private static readonly BANNED_IMAGES_URL = getConfig().BANNED_IMAGES_URL;
    private static readonly REQUEST_TIMEOUT = 10000;

    private static bannedImagesSet: Set<string> | null = null;
    private static isLoading = false;
    private static isInitialized = false;

    /**
     * Initialize the service et load list images banned (once)
     */
    static async initialize(): Promise<void> {
        if (
            BannedImagesService.isInitialized ||
            BannedImagesService.isLoading
        ) {
            console.log(
                "🚫 BannedImagesService already initialized or loading",
            );
            return;
        }

        try {
            BannedImagesService.isLoading = true;
            console.log("🚫 Initializing BannedImagesService...");

            await BannedImagesService.fetchFromServer();
            BannedImagesService.isInitialized = true;
            console.log("🚫 BannedImagesService initialized successfully");
        } catch (error) {
            console.error("🚫 Error initializing BannedImagesService:", error);

            // in case of errer, initialize with empty Set
            BannedImagesService.bannedImagesSet = new Set();
            BannedImagesService.isInitialized = true;
            console.log("🚫 Initialized with empty set due to error");
        } finally {
            BannedImagesService.isLoading = false;
        }
    }

    /**
     * get the list of banned images
     */
    private static async fetchFromServer(): Promise<void> {
        try {
            const randomParam = Math.random().toString(36).substring(7);
            const urlWithParam = `${BannedImagesService.BANNED_IMAGES_URL}?t=${randomParam}`;

            console.log("🚫 Fetching banned images from:", urlWithParam);

            const response = await axios.get<BannedImagesResponse>(
                urlWithParam,
                {
                    timeout: BannedImagesService.REQUEST_TIMEOUT,
                    headers: {
                        "Cache-Control": "no-cache",
                        "Pragma": "no-cache",
                    },
                },
            );

            console.log("🚫 Successfully fetched banned images from server");
            console.log(
                "🚫 Banned images count:",
                response.data.images?.length || 0,
            );

            // update
            BannedImagesService.updateBannedImagesSet(
                response.data.images || [],
            );
        } catch (error) {
            console.error("🚫 Error fetching from server:", error);
            throw error;
        }
    }

    /**
     * set BannedId in memory
     */
    private static updateBannedImagesSet(bannedImages: BannedImage[]): void {
        BannedImagesService.bannedImagesSet = new Set(
            bannedImages.map((img) => img.id),
        );

        console.log(
            "🚫 Updated banned images set with",
            BannedImagesService.bannedImagesSet.size,
            "images",
        );

        if (BannedImagesService.bannedImagesSet.size > 0) {
            const firstFew = Array.from(
                BannedImagesService.bannedImagesSet,
            ).slice(0, 3);
            console.log("🚫 Sample banned IDs:", firstFew);
        }
    }

    /**
     * check if image id is a banned image
     */
    static async isImageBanned(imageId: string): Promise<boolean> {
        if (
            !BannedImagesService.isInitialized &&
            !BannedImagesService.isLoading
        ) {
            console.log("🚫 Service not initialized, initializing now...");
            await BannedImagesService.initialize();
        }

        while (BannedImagesService.isLoading) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        const isBanned =
            BannedImagesService.bannedImagesSet?.has(imageId) || false;

        if (isBanned) {
            console.log("🚫 Image is banned:", imageId);
        }

        return isBanned;
    }

    static getBannedImagesCount(): number {
        return BannedImagesService.bannedImagesSet?.size || 0;
    }

    static async forceRefresh(): Promise<void> {
        console.log("🚫 Force refreshing banned images...");
        BannedImagesService.isInitialized = false;
        BannedImagesService.bannedImagesSet = null;
        await BannedImagesService.initialize();
    }

    static isServiceInitialized(): boolean {
        return BannedImagesService.isInitialized;
    }

    static getStats(): {
        isInitialized: boolean;
        isLoading: boolean;
        bannedImagesCount: number;
    } {
        return {
            isInitialized: BannedImagesService.isInitialized,
            isLoading: BannedImagesService.isLoading,
            bannedImagesCount: BannedImagesService.getBannedImagesCount(),
        };
    }
}

export default BannedImagesService;
