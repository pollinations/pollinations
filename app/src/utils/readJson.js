import {pipe} from "ramda"
import {readFileSync} from "fs";

export default pipe(readFileSync, JSON.parse);
