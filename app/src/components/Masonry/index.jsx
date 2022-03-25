import styles from "./masonry.module.scss"
import { useEffect, useRef, useState } from "react"
import useMasonry from "./useMasonry"

export default function Masonry(props) {

    const masonryRef = useRef(null)
    const [columnCount, setColumnCount] = useState(props.options.columnCount)

    useMasonry(masonryRef, props.data, {
        column: columnCount,
    })

    function renderItems(data, component) {
        return data.map((item, i) =>
            <MasoryItem key={i}>{component(item, i)}</MasoryItem>
        )
    }

    function setColumns() {
        // Todo can be dynamic in future from opts
        if (window.innerWidth < 520) {
            setColumnCount(1)
        }
        if (window.innerWidth >= 520 && window.innerWidth < 800) {
            setColumnCount(2)
        }
        if (window.innerWidth >= 800) {
            setColumnCount(props.options.columnCount)
        }
    }

    useEffect(() => {
        window.addEventListener('load', setColumns);
        window.addEventListener('resize', setColumns);
    }, [])

    const itemWidth = `${(100 - (props.options.columnGap * 2)) / columnCount}%`

    return (
        <div
            ref={masonryRef}
            className={styles.list}
            style={{ 
                "--item-width": itemWidth,
                "--column-gap": `${props.options.columnGap}%` 
            }}>
            {renderItems(props.data, props.renderItems)}
        </div>
    )
}

function MasoryItem({ children }) {
    return <div className={styles.item}>{children}</div>
}
