export type PollinationsSpeechModelId =
  | 'openai'
  | 'openai-fast'
  | 'openai-large'
  | 'openai-audio'
  | (string & {});

export type PollinationsVoice =
  | 'alloy'
  | 'echo'
  | 'fable'
  | 'onyx'
  | 'shimmer'
  | 'coral'
  | 'verse'
  | 'ballad'
  | 'ash'
  | 'sage'
  | 'amuch'
  | 'dan';

export type PollinationsAudioFormat = 'wav' | 'mp3' | 'flac' | 'opus' | 'pcm16';
