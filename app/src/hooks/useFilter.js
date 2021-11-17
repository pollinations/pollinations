import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"

const category2controls = category_string => {
    let controls = category_string.substring(2).split('-')
    return {
        input: controls[0],
        output: controls[2]
    }
}
const emptyCell = 'Anything'

const useFilter = (notebooks) => {
    const { selected } = useParams();
    const [ options, setOptions ] = useState([])
    const [ notebookList, setNotebookList ] = useState([])
    const navigate = useNavigate();
    // 1 Add input/output arrays to notebooks
    useEffect(() => {
        
        if (!notebooks.length) return
        if (notebooks === undefined) return
        
        let result = notebooks.map( notebook => ({
            ...notebook, 
            controls: category2controls(notebook.category)
            })
        )

        setNotebookList(result)
        setOptions([emptyCell, ...new Set(result.map( notebook => notebook.controls.output ))])
    },[notebooks])

    const filtered = notebookList.filter( 
        notebook => 
            // if no selection return everything
            (selected === emptyCell) ? notebook 
            // otherwise match with option
            : notebook.controls.output === selected )

    const setSelected = (option) => {
        navigate(`/c/${option}`)
    }
    return ({
        notebookList: filtered, 
        options, option: { selected, setSelected }
    })
}

export default useFilter
