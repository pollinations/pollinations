import { last, values } from 'ramda'
import React from 'react'
import MarkDownContent from './molecules/MarkDownContent'

export const FailureViewer = ({ contentID, ipfs }) => {

    const log = ipfs?.output?.log
    
    const failureMessage = values(failureHelpers).reduce((failureString, getMessage) => getMessage(log) ? failureString+"\n"+getMessage(log) : failureString, "")

    return <><MarkDownContent id={"failure"} contentID={contentID} failureMessage={failureMessage}/></>
}


const failureHelpers = {
    outOfGPUMemory: log => log.includes("RuntimeError: CUDA out of memory.") ? outOfGPUMemoryText : null,
    generalException: log => {
        const lastLine =  last(log.split("\n").filter(line => line.trim() !== ""))
        console.log("lastLine", lastLine)
        if (lastLine.startsWith("Exception: "))
            return lastLine.replace("Exception: ", "#####")+"\n&nbsp;\n"
        return null
    }
}


const outOfGPUMemoryText = `##### GPU memory error

The GPU ran out of memory. If you are generating images try reducing the resolution or the size of the input. Subscribing to *Google Colab Pro* could alleviate this problem.`

