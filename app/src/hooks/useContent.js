import { useEffect, useState } from 'react';
import { textContent } from "../assets/index.js";


const useContent = (id) => {

    let [content, setContent] = useState('\n\n*loading...*\n\n')

    useEffect(() => {
        let markdown = textContent[id]
        fetch(markdown)
            .then(res => res && res.text())
            .then(md => md && setContent(md))
    }, [])

    return content
}

export default useContent