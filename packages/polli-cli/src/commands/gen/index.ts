import { Command } from "commander";
import { createAudioCommand } from "./audio.js";
import { createEmbedCommand } from "./embed.js";
import { create3dCommand } from "./model3d.js";
import { createSpeechTimestampsCommand } from "./speech-timestamps.js";
import { createChatCommand } from "./chat.js";
import { createImageCommand } from "./image.js";
import { createTextCommand } from "./text.js";
import { createTranscribeCommand } from "./transcribe.js";
import { createVideoCommand } from "./video.js";
import {
    createVoiceChangerCommand,
    createVoiceIsolatorCommand,
} from "./voice.js";

export function createGenCommand() {
    return new Command("gen")
        .description("Generate text, images, audio, video, and more")
        .addCommand(createTextCommand())
        .addCommand(createImageCommand())
        .addCommand(createAudioCommand())
        .addCommand(createVideoCommand())
        .addCommand(createChatCommand())
        .addCommand(createTranscribeCommand())
        .addCommand(createSpeechTimestampsCommand())
        .addCommand(createVoiceChangerCommand())
        .addCommand(createVoiceIsolatorCommand())
        .addCommand(createEmbedCommand())
        .addCommand(create3dCommand());
}
