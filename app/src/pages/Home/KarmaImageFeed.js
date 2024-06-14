
import debug from 'debug';
import Iframe from 'react-iframe'
const log = debug("KarmaImageFeed")

export function KarmaSearch() {


  return (
    <Iframe url="https://karma.yt?mode=embed"
      width="100%"
      height="700px"
      scrolling="no"></Iframe>

  );
}

