# 🐱 CatGPT Meme Generator

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/pollinations/pollinations/tree/main/apps/catgpt)
[![Open in Bolt](https://img.shields.io/badge/Open%20in-Bolt.new-black?style=flat-square&logo=stackblitz)](https://bolt.new/?prompt=Clone%20the%20CatGPT%20meme%20generator%20from%20https%3A%2F%2Fgithub.com%2Fpollinations%2Fpollinations%2Ftree%2Fmain%2Fapps%2Fcatgpt%20and%20set%20it%20up.%20It%27s%20a%20vanilla%20JS%20app%20that%20generates%20cat%20memes%20using%20the%20Pollinations%20API%20at%20gen.pollinations.ai.)
[![Open in Lovable](https://img.shields.io/badge/Open%20in-Lovable-ff69b4?style=flat-square)](https://lovable.dev/?autosubmit=true#prompt=Build%20a%20CatGPT%20meme%20generator%20that%20transforms%20questions%20into%20sassy%20cat%20wisdom%20comics.%20Use%20the%20Pollinations%20API%20at%20gen.pollinations.ai%20for%20image%20generation%20with%20model%3Dgptimage.%20No%20API%20key%20needed.)
[![Open in CodeSandbox](https://img.shields.io/badge/Open%20in-CodeSandbox-blue?style=flat-square&logo=codesandbox)](https://codesandbox.io/s/github/pollinations/pollinations/tree/main/apps/catgpt)

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
