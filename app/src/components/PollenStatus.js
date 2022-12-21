import { Step, StepLabel, Stepper } from '@material-ui/core';
import Debug from 'debug';
import { last, reverse } from 'ramda';
import React from "react";


const debug = Debug("Envisioning");

export function PollenStatus({ log }) {
  if (!log)
    return null;
  const { pollenStatuses, prompts } = getPollenStatus(log);

  if (!pollenStatuses)
    return null;

  return <Stepper activeStep={pollenStatuses?.length}>
    <Step key="start">
      <StepLabel>
        Connecting to the InterPlanetary FileSystem
      </StepLabel>
    </Step>
    {pollenStatuses?.map(
      (pollenStatus, index) => <Step key={`step_${index}`} completed={index < pollenStatuses.length - 1}>
        <StepLabel>
          {pollenStatus.title}
        </StepLabel>
      </Step>)}
  </Stepper>;
}



export const getPollenStatus = (log) => {
  debug("getting pollen statuses from log", log);
  if (!log) return {
    pollenStatuses: [],
    prompts: []
  };
  const pollenStatuses = log.split("\n").filter(line => line?.startsWith("pollen_status:")).map(removePrefix);

  if (!pollenStatuses || pollenStatuses.length ===0) 
    return {};
  debug("pollen statuses", pollenStatuses);
  const lastPayload = last(pollenStatuses)?.payload
  return ({ 
    pollenStatuses, 
    prompts: reverse(lastPayload?.split ? lastPayload.split("\n") : lastPayload)});
}

const removePrefix = statusWithPrefix => JSON.parse(statusWithPrefix.replace("pollen_status: ", ""));

