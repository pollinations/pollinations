import { Command } from "commander";
import { create3dCommand } from "./3d.js";
import { createAudioCommand } from "./audio.js";
import { createChatCommand } from "./chat.js";
import { createEmbeddingsCommand } from "./embeddings.js";
import { createImageCommand } from "./image.js";
import { createTextCommand } from "./text.js";
import { createTranscribeCommand } from "./transcribe.js";
import { createVideoCommand } from "./video.js";
import { createIsolateCommand, createVoiceChangeCommand } from "./voice.js";

export function createGenCommand() {
    return new Command("gen")
        .description("Generate text, images, audio, video, and more")
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
