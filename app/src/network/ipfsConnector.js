import Client from "ipfs-http-client";


export const IPFS_HOST = "18.157.173.110";

export const ipfsPeerURL = `http://${IPFS_HOST}:5002`;

debug("Connecting to IPFS", ipfsPeerURL);

export const client = Client(ipfsPeerURL);