import { Command } from "commander";
import { audioCommand } from "./audio.js";
import { chatCommand } from "./chat.js";
import { editCommand } from "./edit.js";
import { imageCommand } from "./image.js";
import { pipeCommand } from "./pipe.js";
import { textCommand } from "./text.js";
import { transcribeCommand } from "./transcribe.js";
import { videoCommand } from "./video.js";

export const genCommand = new Command("gen")
    .description("Generate text, images, audio, video, and more")
    .addCommand(textCommand)
    .addCommand(imageCommand)
    .addCommand(editCommand)
    .addCommand(audioCommand)
    .addCommand(videoCommand)
    .addCommand(chatCommand)
    .addCommand(pipeCommand)
    .addCommand(transcribeCommand);
