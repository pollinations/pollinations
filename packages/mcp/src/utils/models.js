import { API_BASE_URL, fetchJsonWithAuth } from "./coreUtils.js";

const fetchRegistry = (path) =>
    fetchJsonWithAuth(`${API_BASE_URL}${path}`, { timeoutMs: 20000 });

export const getImageModels = () => fetchRegistry("/image/models");
export const getTextModels = () => fetchRegistry("/text/models");
export const getAudioModels = () => fetchRegistry("/audio/models");
