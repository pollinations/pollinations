import { Box, LinearProgress, Typography } from "@material-ui/core";
import Debug from "debug";
import { last } from "ramda";
import React from "react";

const debug = Debug("NotebookProgress");

export const NotebookProgress = ({output, metadata}) => {
    if (!output?.log?.split || !metadata)
        return null;
    const progress = getProgress(output.log, metadata.numCells)*100;
    const fineProgress = getFinegrainedProgress(output.log)*100;
    
    const inProgress =  progress >= 0 && !output?.done && !(progress >= 100);
    debug("progress", progress, inProgress, fineProgress);
    if (!inProgress)
      return null;

    return  <><Box display="flex" alignItems="center">
      <Box width="100%" mr={1}>
         Overall:
          <LinearProgress value={progress} variant="determinate" color="secondary" />
      </Box>
      <Box minWidth={35}>
        <Typography variant="body2" color="textSecondary">{`${Math.floor(
          progress
        )}%`}</Typography>
      </Box>
      </Box>
      
      { fineProgress && <Box display="flex" alignItems="center">
        <Box width="100%" mr={1}>
          Current Step:
          <LinearProgress value={fineProgress} variant="determinate" color="primary" /> 
        </Box> 
        <Box minWidth={35}>
        <Typography variant="body2" color="textSecondary">{`${Math.floor(
          fineProgress
        )}%`}</Typography>    
        </Box>   
        </Box> 
        }
 
       <Typography variant="body2" color="textSecondary" align="center">Please wait... Results should start appearing within a minute or two.</Typography>
    </>
}


export const getProgress = (log, numCells) => {
    const updateText = last(
            log
            .split("\n")
            .filter(s => s.startsWith("Ending Cell"))
        );

    if (!updateText)
        return 0;
    
    const cellNo = parseInt(updateText.split("Ending Cell ")[1]) - 1;
    return cellNo / numCells;
}

export const getFinegrainedProgress = (log) => {
    const lastCell = last(
        log.split("Executing Cell")
    );

    if (!lastCell)
        return null;

    if (lastCell.includes("Ending Cell")) 
        return null;
    
    const percentageMatched = last(lastCell.split("\n").map(s => s.trim().match(/(\d*)%.*/)).filter(n => n?.length === 2))
    
    if (!percentageMatched)
        return null;
    
    return parseInt(percentageMatched[1]) / 100
}