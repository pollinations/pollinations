import { values } from 'ramda'
import React from 'react'
import MarkDownContent from './molecules/MarkDownContent'

export const FailureViewer = ({ contentID, ipfs }) => {

    const log = ipfs?.output?.log

    console.log("loooog",log)
    
    const failureMessage = values(failureHelpers).reduce((failureString, {check, message}) => check(log) ? message : failureString, null)

    return <><MarkDownContent id={"failure"} contentID={contentID} failureMessage={failureMessage}/></>
}


const failureHelpers = {
    outOfGPUMemory: {
        check:  (log) => log.includes("RuntimeError: CUDA out of memory."),
        message: `##### GPU memory error

The GPU ran out of memory. If you are generating images try reducing the resolution or the size of the input. Subscribing to *Google Colab Pro* could alleviate this problem.`
    }
}
