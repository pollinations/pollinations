import { Command } from "commander";
import { createAudioCommand } from "./audio.js";
import { createChatCommand } from "./chat.js";
import { createImageCommand } from "./image.js";
import { createTextCommand } from "./text.js";
import { createTranscribeCommand } from "./transcribe.js";
import { createVideoCommand } from "./video.js";

export function createGenCommand() {
    return new Command("gen")
        .description("Generate text, images, audio, video, and more")
        .addCommand(createTextCommand())
        .addCommand(createImageCommand())
        .addCommand(createAudioCommand())
        .addCommand(createVideoCommand())
        .addCommand(createChatCommand())
        .addCommand(createTranscribeCommand());
}
