import { LinearProgress } from "@material-ui/core";
import { last } from "ramda";
import React from "react";
import Debug from "debug";

const debug = Debug("NotebookProgress");

export const NotebookProgress = ({output, metadata}) => {
    if (!output?.log)
        return null;
    const progress = getProgress(output.log, metadata.numCells);
    debug(progress)
    return <LinearProgress value={progress*100} variant="determinate" color="secondary" />
}


export const getProgress = (log, numCells) => {
    const updateText = last(
            log
            .split("\n")
            .filter(s => s.startsWith("Ending Cell"))
        );

    if (!updateText)
        return 0;
    
    const cellNo = parseInt(updateText.split("Ending Cell ")[1]);
    return cellNo / numCells;
}
        