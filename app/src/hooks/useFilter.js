import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router";
import Debug from 'debug';

const debug = Debug('useFilter');

const category2controls = category_string => {
    let controls = category_string.substring(2).split('-')
    return {
        input: controls[0],
        output: controls[2] || 'Image'
    }
}
const emptyCell = 'Anything'

const useFilter = (notebooks) => {
    const { selected } = useParams();
    const [ options, setOptions ] = useState([])
    const [ notebookList, setNotebookList ] = useState([])
    const navigate = useNavigate();
    debug("useFilter selected", selected);
    // 1 Add input/output arrays to notebooks
    useEffect(() => {
        
        if (!notebooks) return 
        if (!notebooks.length) return
        if (notebooks === undefined) return
        
        let result = notebooks
        .filter(notebook => notebook.category)
        .map( notebook => ({
            ...notebook, 
            controls: category2controls(notebook.category)
            })
        )

        setNotebookList(result)
        setOptions([...new Set(result.map( notebook => notebook.controls.output )), emptyCell])
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
