import { InventoryGrid, type InventoryItem } from "./InventoryGrid";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";

interface InventoryModalProps {
    open: boolean;
    onClose: () => void;
    items: InventoryItem[];
}

export function InventoryModal({ open, onClose, items }: InventoryModalProps) {
    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="bg-[#3a2817] border-4 border-[#d4a76a] text-[#f5e6d3] max-w-3xl max-h-[80vh]">
                <DialogHeader>
                    <DialogTitle className="text-[#d4a76a]">
                        Your Inventory
                    </DialogTitle>
                </DialogHeader>

                <ScrollArea className="h-full max-h-[60vh] pr-4">
                    <InventoryGrid items={items} />

                    {items.length === 0 && (
                        <div className="text-center py-12 text-[#b8a389]">
                            <p>Your inventory is empty.</p>
                            <p className="text-sm mt-2">
                                Explore the world to find treasures!
                            </p>
                        </div>
                    )}
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
