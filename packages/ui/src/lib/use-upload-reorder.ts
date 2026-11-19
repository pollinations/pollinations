import {
    type KeyboardEvent,
    type MouseEvent,
    type PointerEvent,
    useId,
    useRef,
    useState,
} from "react";

/** Attach to selected tiles only. A tap still reaches the preview's Play button. */
export function useUploadReorder<T>(
    items: T[],
    onChange: (items: T[]) => void,
    disabled = false,
) {
    const queue = useId();
    const start = useRef<{ x: number; y: number; pointer: number } | null>(
        null,
    );
    const dragged = useRef(false);
    const [over, setOver] = useState<number | null>(null);

    function move(from: number, to: number) {
        if (from === to || to < 0 || to >= items.length) return;
        const next = [...items];
        next.splice(to, 0, ...next.splice(from, 1));
        onChange(next);
    }
    function target(event: PointerEvent<HTMLElement>) {
        const tile = event.currentTarget.ownerDocument
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest<HTMLElement>("[data-upload-queue]");
        return tile?.dataset.uploadQueue === queue
            ? Number(tile.dataset.index)
            : null;
    }
    function finish() {
        start.current = null;
        setOver(null);
    }
    return (index: number) =>
        disabled || items.length < 2
            ? undefined
            : {
                  "data-upload-queue": queue,
                  "data-index": index,
                  "data-drop-target": over === index || undefined,
                  tabIndex: 0,
                  "aria-description": `Position ${index + 1} of ${items.length}. Drag or use the left and right arrow keys to reorder.`,
                  onPointerDown(event: PointerEvent<HTMLElement>) {
                      if (!event.isPrimary || event.button !== 0) return;
                      dragged.current = false;
                      const el = event.target as Element;
                      if (el.closest(".polli-upload-remove")) return;
                      start.current = {
                          x: event.clientX,
                          y: event.clientY,
                          pointer: event.pointerId,
                      };
                      el.setPointerCapture(event.pointerId);
                  },
                  onPointerMove(event: PointerEvent<HTMLElement>) {
                      const initial = start.current;
                      if (initial?.pointer !== event.pointerId) return;
                      if (
                          !dragged.current &&
                          Math.hypot(
                              event.clientX - initial.x,
                              event.clientY - initial.y,
                          ) < 6
                      )
                          return;
                      dragged.current = true;
                      setOver(target(event));
                  },
                  onPointerUp(event: PointerEvent<HTMLElement>) {
                      if (start.current?.pointer !== event.pointerId) return;
                      const to = target(event);
                      finish();
                      if (dragged.current && to !== null) move(index, to);
                  },
                  onLostPointerCapture: finish,
                  onClickCapture(event: MouseEvent<HTMLElement>) {
                      if (dragged.current && event.detail > 0) {
                          event.preventDefault();
                          event.stopPropagation();
                          dragged.current = false;
                      }
                  },
                  onKeyDown(event: KeyboardEvent<HTMLElement>) {
                      if (
                          event.target !== event.currentTarget ||
                          !["ArrowLeft", "ArrowRight"].includes(event.key)
                      )
                          return;
                      event.preventDefault();
                      move(index, index + (event.key === "ArrowLeft" ? -1 : 1));
                  },
              };
}
