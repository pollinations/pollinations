# NSFW filter

An adjustable NSFW filter for [AUTOMATIC1111/WebUI](https://github.com/AUTOMATIC1111/stable-diffusion-webui).

![intro](./docs/intro.png)

## Features

- Customize NSFW filter safety checker adjustment
- Replaces Not safe for work (NSFW) images with customize warning image

## Installation

Install it from UI.

## Usage

- `Enable NSFW filter`: Enable/Disable NSFW filter. Disabled by default.
- `Safety checker adjustment`
  - Value range: `[-0.5, 0.5]`, increasing this value will make the filter stronger.
  - Default value: `0`
  - Step: `0.001`
