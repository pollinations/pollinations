import { Command } from "commander";
import { createAudioCommand } from "./audio.js";
import { createChatCommand } from "./chat.js";
import { createEmbeddingsCommand } from "./embeddings.js";
import { createImageCommand } from "./image.js";
import { createIsolateCommand } from "./isolate.js";
import { createTextCommand } from "./text.js";
import { create3dCommand } from "./threed.js";
import { createTranscribeCommand } from "./transcribe.js";
import { createVideoCommand } from "./video.js";
import { createVoiceChangeCommand } from "./voice-change.js";

export function createGenCommand() {
    return new Command("gen")
        .description("Generate text, images, audio, video, 3D, and more")
        .addCommand(createTextCommand())
        .addCommand(createImageCommand())
        .addCommand(createAudioCommand())
        .addCommand(createVideoCommand())
        .addCommand(createChatCommand())
        .addCommand(createTranscribeCommand())
        .addCommand(create3dCommand())
        .addCommand(createEmbeddingsCommand())
        .addCommand(createVoiceChangeCommand())
        .addCommand(createIsolateCommand());
}
