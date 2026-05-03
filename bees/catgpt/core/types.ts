export type CatReplyOptions = {
  apiKey?: string;
  endpoint?: string;
  model?: string;
};

export type CatTurn = {
  question: string;
  imageUrl?: string;
  reply: string;
  comicUrl: string;
};

export type ComicImageOptions = {
  apiKey?: string;
  imageModel?: "nanobanana" | "gptimage";
  width?: number;
  height?: number;
  endpoint?: string;
};
