import Iframe from "react-iframe";

export function KarmaYT() {
  return (
    <Iframe
      url={`https://karma.yt?ref=pollinations&weed=${
        Math.floor(Math.random() * 1337) + Date.now()
      }`}
      scrolling="true"
      width="100%"
      height="700px"
    ></Iframe>
  );
}
