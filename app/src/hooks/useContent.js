import { useEffect, useState } from 'react';
import instructions from '../assets/contents/instructions.md'
import help from '../assets/contents/help.md'
import about from '../assets/contents/about.md'


function getMD(content){

    switch (content) {
        case "instructions":
          return instructions
        case "help":
            return help
        case "about":
            return about
        default:
            return null
    }
}

const useContent = (id) => {

    let [ content, setContent] = useState('');

    useEffect(()=> {
        let markdown = getMD(id)

        fetch(markdown)
        .then(res => res && res.text() )
        .then(md => md && setContent(md) )
    }, [])

    return content
}

export default useContent