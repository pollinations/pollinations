import { Command } from "commander";
import { createAudioCommand } from "./audio.js";
import { createChatCommand } from "./chat.js";
import { createEmbeddingsCommand } from "./embeddings.js";
import { createImageCommand } from "./image.js";
import { createTextCommand } from "./text.js";
import { create3dCommand } from "./three-d.js";
import { createTranscribeCommand } from "./transcribe.js";
import { createVideoCommand } from "./video.js";
import { createIsolateCommand, createVoiceChangeCommand } from "./voice.js";

export function createGenCommand() {
    return new Command("gen")
        .description("Generate text, images, audio, video, and more")
        .addCommand(create3dCommand())
        .addCommand(createTextCommand())
        .addCommand(createImageCommand())
        .addCommand(createAudioCommand())
        .addCommand(createVideoCommand())
        .addCommand(createChatCommand())
        .addCommand(createTranscribeCommand())
        .addCommand(createEmbeddingsCommand())
        .addCommand(createVoiceChangeCommand())
        .addCommand(createIsolateCommand());
}
