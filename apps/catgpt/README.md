# 🐱 CatGPT Meme Generator

[![Built with Pollinations](https://img.shields.io/badge/Built%20with-Pollinations-8a2be2?style=flat-square&logo=data:image/png;base64,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&logoColor=white&labelColor=6a0dad)](https://pollinations.ai)&nbsp;
[![Open in Bolt](https://img.shields.io/badge/Open%20in-Bolt.new-black?style=flat-square&logo=stackblitz)](https://bolt.new/?prompt=Clone%20the%20CatGPT%20meme%20generator%20from%20https%3A%2F%2Fgithub.com%2Fpollinations%2Fpollinations%2Ftree%2Fmain%2Fapps%2Fcatgpt%20and%20set%20it%20up.%20It%27s%20a%20vanilla%20JS%20app%20that%20generates%20cat%20memes%20using%20the%20Pollinations%20API%20at%20gen.pollinations.ai.)&nbsp;
[![Open in Lovable](https://img.shields.io/badge/Open%20in-Lovable-ff69b4?style=flat-square)](https://lovable.dev/?autosubmit=true#prompt=Clone%20the%20CatGPT%20meme%20generator%20from%20https%3A%2F%2Fgithub.com%2Fpollinations%2Fpollinations%2Ftree%2Fmain%2Fapps%2Fcatgpt.%20Vanilla%20JS%20app%20that%20generates%20cat%20memes%20using%20the%20Pollinations%20API%20at%20gen.pollinations.ai.)&nbsp;
[![Open in StackBlitz](https://img.shields.io/badge/Open%20in-StackBlitz-blue?style=flat-square&logo=stackblitz)](https://stackblitz.com/github/pollinations/pollinations/tree/main/apps/catgpt)&nbsp;

Transform your questions into sassy cat wisdom! A collaboration between [pollinations.ai](https://pollinations.ai) and [Tanika Godbole](https://www.instagram.com/tanikagodbole/), the original creator of the CatGPT comic.

## 🌟 About

CatGPT is an AI-powered meme generator that creates personalized cat comics in response to your questions. Just like the original CatGPT comic, our feline friend responds with lazy, sarcastic wisdom while treating humans as mere servants.

This app emerged from a collaboration with Tanika Godbole, with the idea coming from Dr. Julia Degen. We're using OpenAI's GPT-Image-1 model through pollinations.ai to democratize access to AI-generated cat wisdom!

### 🎨 Original Inspiration

The CatGPT concept was created by Tanika Godbole. Check out the [first CatGPT comic on Instagram](https://www.instagram.com/p/Cn4OLhPyDLP/)!

<div align="center">
  <img src="images/original-catgpt.png" alt="Original CatGPT Comic" width="400">
</div>

## ✨ Examples

Here are some AI-generated CatGPT memes created with our generator:

<div align="center">
  <table>
    <tr>
      <td align="center">
        <img src="images/example1.png" alt="Weather Forecast CatGPT" width="300"><br>
        <em>"What's the weather today?"</em>
      </td>
      <td align="center">
        <img src="images/example2.png" alt="Debugging CatGPT" width="300"><br>
        <em>"How do I fix this bug?"</em>
      </td>
    </tr>
    <tr>
      <td align="center">
        <img src="images/example3.png" alt="CatGPT Example 3" width="300"><br>
        <em>More feline wisdom</em>
      </td>
      <td align="center">
        <img src="images/example4.png" alt="CatGPT Example 4" width="300"><br>
        <em>Classic cat attitude</em>
      </td>
    </tr>
  </table>
</div>

## 🚀 Features

- **AI-Powered Generation**: Uses Gemini 2.5 Flash Image (nanobanana) via [gen.pollinations.ai](https://gen.pollinations.ai) API
- **Instant Memes**: Generate custom cat wisdom in seconds
- **Share & Download**: Save your favorite memes or share them with friends
- **No Sign-up Required**: Completely free and open to use
- **Gen-Z Friendly Design**: Modern, vibrant, and fun UI with animated elements
- **Easter Eggs**: Hidden surprises for the curious (try the Konami code! 🎮)

## 🛠️ Tech Stack

- **Frontend**: Pure HTML, CSS, and JavaScript (no frameworks needed!)
- **AI Service**: [gen.pollinations.ai](https://gen.pollinations.ai) - Gemini 2.5 Flash Image (nanobanana) model
- **Image Upload**: Cloudinary for reference image hosting
- **Design**: Psychedelic Gen-Z aesthetic with animated elements

## 🔧 API Migration (Jan 2026)

This app has been migrated from the legacy `image.pollinations.ai` to the new `gen.pollinations.ai` API:

- **Old**: `https://enter.pollinations.ai/image/prompt/...?model=nanobanana`
- **New**: `https://gen.pollinations.ai/image/...?model=nanobanana`

**Key Changes**:

- Model remains `nanobanana` (Gemini 2.5 Flash Image - high-quality, pollen-based)
- Authentication now uses API keys from [enter.pollinations.ai](https://enter.pollinations.ai)
- Better rate limiting and reliability
- Improved image quality with `enhance=true` parameter

## 💡 The Story

This app started from a LinkedIn post announcing the collaboration between Thomas Haferlach (pollinations.ai) and Tanika Godbole. The goal is to create a fun, viral meme generator while ensuring fair attribution and revenue sharing with the original creator - something often overlooked in the AI space.

## 🐾 Support

Keep your cats happy with premium pet food from our sponsor [PuraPep](https://www.purapep.de/) - because even sarcastic cats deserve the best!

## 🎯 How to Use

1. Visit the [CatGPT Meme Generator](https://pollinations.github.io/catgpt/)
2. Type your question in the text box
3. Click "Generate Meme"
4. Watch as CatGPT responds with feline wisdom!
5. Download or share your creation

## 🤝 Credits & Collaboration

- **Original CatGPT Creator**: [Tanika Godbole](https://www.instagram.com/tanikagodbole/)
- **AI Technology**: [pollinations.ai](https://pollinations.ai)
- **Idea Credit**: Dr. Julia Degen
- **Sponsor**: [PuraPep](https://www.purapep.de/) - Premium pet food for happy cats 🐾
- Developed By [Ayushman Bhattacharya](https://github.com/Circuit-Overtime) & [Thomash Haferlach](https://github.com/voodoohop)

## 📝 License

This app is a collaboration between pollinations.ai and Tanika Godbole. The CatGPT character and concept are the intellectual property of Tanika Godbole. AI-generated variations are created with permission and include revenue sharing with the original creator.

## 🌈 Fun Facts

- Try the Konami code on the website for a surprise! (↑↑↓↓←→←→BA)
- Each generated meme has a unique seed for variety
- The cat's responses are intentionally sarcastic - that's the CatGPT way!

---

Made with 💜 by [pollinations.ai](https://pollinations.ai) in collaboration with [Tanika Godbole](https://www.instagram.com/tanikagodbole/)
