import { createSnapshotServerSetup } from "@shared/test/mocks/snapshot-server.ts";

const server = createSnapshotServerSetup();

export const setup = server.setup;
export const teardown = server.teardown;
