#!/bin/sh
exec ffmpeg -protocol_whitelist file -format_whitelist wav,mp3,flac,ogg,aac,mov "$@"
