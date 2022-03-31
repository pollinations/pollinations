import Debug from 'debug';
import { useMemo } from 'react';
import { getWriter } from '../network/ipfsWebClient';

const debug = Debug('useIPFSWrite');

export default (ipfs) => {
  const writer = useMemo(() => {
    const writer = getWriter(ipfs);
    return writer;
  }, [ipfs]);

  return writer;
};
