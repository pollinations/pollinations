import { Command } from "commander";
import { createAudioCommand } from "./audio.js";
import { createChatCommand } from "./chat.js";
import { createEmbeddingsCommand } from "./embeddings.js";
import { createImageCommand } from "./image.js";
import { createIsolateCommand } from "./isolate.js";
import { createModel3dCommand } from "./model3d.js";
import { createTextCommand } from "./text.js";
import { createTranscribeCommand } from "./transcribe.js";
import { createVideoCommand } from "./video.js";
import { createVoiceChangeCommand } from "./voice-change.js";

export function createGenCommand() {
    return new Command("gen")
        .description("Generate text, images, audio, video, and more")
        .addCommand(createTextCommand())
        .addCommand(createImageCommand())
        .addCommand(createAudioCommand())
        .addCommand(createVideoCommand())
        .addCommand(createModel3dCommand())
        .addCommand(createEmbeddingsCommand())
        .addCommand(createVoiceChangeCommand())
        .addCommand(createIsolateCommand())
        .addCommand(createChatCommand())
        .addCommand(createTranscribeCommand());
}
