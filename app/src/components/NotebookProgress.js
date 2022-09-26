import Debug from "debug";
import { last } from "ramda";
import LoaderComponent from "./LoaderComponent";

const debug = Debug("NotebookProgress");

export const NotebookProgress = ({output, metadata}) => {
    if (!output?.log?.split)
        return null;

    const { progress, inProgress } = ParseProgress(output, metadata);
    
    if (!inProgress)
      return null;

    return <>
      <LoaderComponent
        info_text={metadata && 'Overall Progress'}
        progress={progress}
      />

      {  
        metadata && 
        <Typography variant="body2" color="textSecondary" align="center">
          Please wait... Results should start appearing within a minute or two.
        </Typography> 
      }
      </>
}


function ParseProgress(output, metadata) {
  const fineProgressTemp = getFinegrainedProgress(output.log)*100;
  const progress = metadata ? getProgress(output.log, metadata.numCells)*100 : fineProgressTemp;
  const fineProgress = metadata ? fineProgressTemp : 0;
  
  const inProgress =  progress >= 0 && !output?.done && !(progress >= 100);
  debug("progress", progress, inProgress, fineProgress);

  return {progress, fineProgress, inProgress};
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