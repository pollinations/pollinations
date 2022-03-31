import { usePrevious } from 'react-use';
import { noop } from '../network/utils';

export default (ipfs, callback = noop) => {
  const done = ipfs?.output?.done;
  const previousDone = usePrevious(done);

  if (previousDone === false && done === true) {
    callback(ipfs);
    return true;
  }

  return false;
};
