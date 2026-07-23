import { Container, getContainer } from "@cloudflare/containers";

export class PolliContainer extends Container {
  defaultPort = 8000;
  // Activity only renews on NEW requests — an open SSE stream does not count.
  // Long multi-clip productions stream for 20-30 min; a short sleepAfter
  // SIGTERMs the container mid-stream.
  sleepAfter = "2h";
}

export default {
  async fetch(request, env) {
    return getContainer(env.POLLI, "polli").fetch(request);
  },
};
