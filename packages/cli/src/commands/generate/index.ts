import { Command } from 'commander';
import { generateImage } from './image.js';
import { generateText } from './text.js';
import { generateAudio } from './audio.js';

export function generateCommands(program: Command) {
  const generate = program
    .command('generate')
    .alias('gen')
    .description('Generate content using AI models');

  generate
    .command('image <prompt>')
    .description('Generate an image from a text prompt')
    .option('-m, --model <model>', 'Model to use', 'flux')
    .option('-o, --output <path>', 'Output file path')
    .option('--width <width>', 'Image width', '1024')
    .option('--height <height>', 'Image height', '1024')
    .option('--seed <seed>', 'Random seed for reproducibility')
    .option('--enhance', 'Enable prompt enhancement')
    .option('--nologo', 'Remove Pollinations logo')
    .action(generateImage);

  generate
    .command('text <prompt>')
    .description('Generate text from a prompt')
    .option('-m, --model <model>', 'Model to use', 'openai')
    .option('-s, --system <prompt>', 'System prompt')
    .option('--max-tokens <n>', 'Maximum tokens to generate')
    .option('--temperature <n>', 'Temperature (0-2)')
    .option('--stream', 'Stream the response')
    .action(generateText);

  generate
    .command('audio <text>')
    .description('Generate audio from text')
    .option('-v, --voice <voice>', 'Voice to use', 'alloy')
    .option('-o, --output <path>', 'Output file path')
    .option('--format <format>', 'Audio format (mp3, wav)', 'mp3')
    .action(generateAudio);
}