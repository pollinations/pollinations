import { X } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";

const MEDIA_HOST = "media.pollinations.ai";

interface Character {
    name: string;
    class: string;
    avatar: string;
}

interface StoryEntry {
    id: string;
    description: string;
    image: string;
    timestamp: number;
    characterChoice?: string;
}

interface InventoryItem {
    id: string;
    name: string;
    image: string;
    rarity: string;
}

interface GalleryModalProps {
    isOpen: boolean;
    onClose: () => void;
    character: Character | null;
    storyHistory: StoryEntry[];
    inventory: InventoryItem[];
}

const RARITY_COLORS: Record<string, string> = {
    common: "#b8a389",
    uncommon: "#4ade80",
    rare: "#60a5fa",
    epic: "#c084fc",
    legendary: "#f59e0b",
};

function isUploaded(url: string): boolean {
    try {
        return !!url && new URL(url).hostname === MEDIA_HOST;
    } catch {
        return false;
    }
}

function Placeholder() {
    return (
        <div className="w-full aspect-video bg-[#2c1e12] rounded-lg flex items-center justify-center border border-dashed border-[#5a4332]">
            <span className="text-[#6a5a48] text-xs text-center px-4">
                Save your game to
                <br />
                upload this image
            </span>
        </div>
    );
}

export function GalleryModal({
    isOpen,
    onClose,
    character,
    storyHistory,
    inventory,
}: GalleryModalProps) {
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    const uploadedScenes = storyHistory.filter((e) => isUploaded(e.image));
    const uploadedItems = inventory.filter((i) => isUploaded(i.image));
    const hasAvatar = character && isUploaded(character.avatar);
    const hasAnything =
        hasAvatar || uploadedScenes.length > 0 || uploadedItems.length > 0;

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="bg-[#3a2817] border-4 border-[#d4a76a] text-[#f5e6d3] max-w-4xl max-h-[85vh]">
                    <DialogHeader>
                        <DialogTitle
                            className="text-[#d4a76a]"
                            style={{ fontFamily: "Cinzel, serif" }}
                        >
                            Adventure Gallery
                        </DialogTitle>
                    </DialogHeader>

                    <ScrollArea className="h-full max-h-[70vh] pr-4">
                        {!hasAnything ? (
                            <div className="text-center py-16 text-[#b8a389]">
                                <p className="text-lg mb-2">
                                    No media saved yet
                                </p>
                                <p className="text-sm">
                                    Save your game with "Upload & Save" to
                                    persist images here.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-8 pb-4">
                                {/* Character section */}
                                {hasAvatar && character && (
                                    <section>
                                        <h3
                                            className="text-[#d4a76a] text-sm font-semibold uppercase tracking-wider mb-3"
                                            style={{
                                                fontFamily: "Cinzel, serif",
                                            }}
                                        >
                                            Character
                                        </h3>
                                        <div className="flex items-start gap-4">
                                            <img
                                                src={character.avatar}
                                                alt={character.name}
                                                className="w-24 h-24 rounded-lg object-cover border-2 border-[#d4a76a] cursor-pointer hover:opacity-80 transition-opacity"
                                                onClick={() =>
                                                    setLightboxUrl(
                                                        character.avatar,
                                                    )
                                                }
                                            />
                                            <div>
                                                <p className="text-[#f5e6d3] font-semibold">
                                                    {character.name}
                                                </p>
                                                <p className="text-[#b8a389] text-sm">
                                                    {character.class}
                                                </p>
                                            </div>
                                        </div>
                                    </section>
                                )}

                                {/* Adventure scenes */}
                                {uploadedScenes.length > 0 && (
                                    <section>
                                        <h3
                                            className="text-[#d4a76a] text-sm font-semibold uppercase tracking-wider mb-3"
                                            style={{
                                                fontFamily: "Cinzel, serif",
                                            }}
                                        >
                                            Adventure Scenes (
                                            {uploadedScenes.length})
                                        </h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {uploadedScenes.map((entry) => (
                                                <div
                                                    key={entry.id}
                                                    className="group"
                                                >
                                                    <img
                                                        src={entry.image}
                                                        alt={
                                                            entry.characterChoice ||
                                                            "Scene"
                                                        }
                                                        className="w-full aspect-video object-cover rounded-lg border border-[#5a4332] cursor-pointer hover:border-[#d4a76a] transition-colors"
                                                        onClick={() =>
                                                            setLightboxUrl(
                                                                entry.image,
                                                            )
                                                        }
                                                    />
                                                    <div className="mt-1.5 px-0.5">
                                                        {entry.characterChoice && (
                                                            <p className="text-[#b8a389] text-xs truncate">
                                                                "
                                                                {
                                                                    entry.characterChoice
                                                                }
                                                                "
                                                            </p>
                                                        )}
                                                        <p className="text-[#6a5a48] text-xs">
                                                            {new Date(
                                                                entry.timestamp,
                                                            ).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {/* Unsaved scene placeholders */}
                                {storyHistory.some(
                                    (e) => !isUploaded(e.image) && e.image,
                                ) && (
                                    <section>
                                        <h3 className="text-[#6a5a48] text-xs font-semibold uppercase tracking-wider mb-2">
                                            Unsaved Scenes (
                                            {
                                                storyHistory.filter(
                                                    (e) =>
                                                        !isUploaded(e.image) &&
                                                        e.image,
                                                ).length
                                            }
                                            )
                                        </h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                            {storyHistory
                                                .filter(
                                                    (e) =>
                                                        !isUploaded(e.image) &&
                                                        e.image,
                                                )
                                                .map((entry) => (
                                                    <Placeholder
                                                        key={entry.id}
                                                    />
                                                ))}
                                        </div>
                                    </section>
                                )}

                                {/* Inventory items */}
                                {uploadedItems.length > 0 && (
                                    <section>
                                        <h3
                                            className="text-[#d4a76a] text-sm font-semibold uppercase tracking-wider mb-3"
                                            style={{
                                                fontFamily: "Cinzel, serif",
                                            }}
                                        >
                                            Relics & Items (
                                            {uploadedItems.length})
                                        </h3>
                                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                            {uploadedItems.map((item) => (
                                                <div
                                                    key={item.id}
                                                    className="text-center"
                                                >
                                                    <img
                                                        src={item.image}
                                                        alt={item.name}
                                                        className="w-full aspect-square object-cover rounded-lg border border-[#5a4332] cursor-pointer hover:border-[#d4a76a] transition-colors"
                                                        onClick={() =>
                                                            setLightboxUrl(
                                                                item.image,
                                                            )
                                                        }
                                                    />
                                                    <p className="text-xs mt-1 truncate text-[#f5e6d3]">
                                                        {item.name}
                                                    </p>
                                                    <span
                                                        className="text-[10px] uppercase tracking-wider"
                                                        style={{
                                                            color:
                                                                RARITY_COLORS[
                                                                    item.rarity
                                                                ] || "#b8a389",
                                                        }}
                                                    >
                                                        {item.rarity}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}
                            </div>
                        )}
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            {/* Lightbox overlay */}
            {lightboxUrl && (
                <div
                    className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4 cursor-pointer"
                    onClick={() => setLightboxUrl(null)}
                >
                    <button
                        className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors cursor-pointer"
                        onClick={() => setLightboxUrl(null)}
                    >
                        <X className="w-8 h-8" />
                    </button>
                    <img
                        src={lightboxUrl}
                        alt="Full size"
                        className="max-w-full max-h-[90vh] object-contain rounded-lg"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </>
    );
}
