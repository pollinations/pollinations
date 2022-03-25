import { useLayoutEffect } from "react";
import styles from "./masonry.module.scss";
import useAfterImagesLoaded from "./useAfterImagesLoaded";

export default function useMasonry(ref, data, passedOptions) {

    const defaultOptions = {
        column: 1,
        listClass: `.${styles.list}`,
        itemClass: `.${styles.item}`,
    }

    const options = { ...defaultOptions, ...passedOptions };

    function initMasonry() {
        calcMasonry(ref.current, options);
    }

    useLayoutEffect(() => {
        // Calc initially and re-calculate on column count change
        initMasonry();
        window.addEventListener('resize', initMasonry);
        return () => window.removeEventListener("resize", initMasonry);

    }, [passedOptions.column]);

    useAfterImagesLoaded(ref, initMasonry, data);
}

function calcMasonry(container, options) {

    const getHeightAndMarginBottom = (elem, height) => {
        height = height ? height : elem.getBoundingClientRect().height;
        const styles = getComputedStyle(elem);
        const bottom = parseFloat(styles.marginBottom);
        return height + bottom;
    }

    const columnCount = options.column;
    const items = Array.from(container.querySelectorAll(options.itemClass));

    if (columnCount === 1) {
        items.forEach((item) => item.style.marginTop = '');
        return false;
    }

    if (items.length === 0) {
        return false;
    }

    items.forEach((item, index) => {
        item.style.marginTop = '';

        if (columnCount > index) {
            return;
        }

        const topItem = items[index - columnCount];
        const topItemRect = topItem.getBoundingClientRect();
        const topItemPosition = topItemRect.top;
        const topListHeight = getHeightAndMarginBottom(topItem, topItemRect.height);
        const topListBottomPosition = topItemPosition + topListHeight;
        const itemPosition = item.getBoundingClientRect().top;
        const newPosition = itemPosition.toFixed(0) - topListBottomPosition.toFixed(0);

        if (newPosition === 0) {
            return false;
        }

        item.style.marginTop = `-${newPosition}px`;
    });
}