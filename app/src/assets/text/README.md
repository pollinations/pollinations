
This documentation is also available on [Github](https://github.com/pollinations/pollinations).

[![Pollinations.AI Logo](https://pollinations.ai/p/Pollinations.AI_logo_with_a_stylized_flower_and_bee,_simple_and_modern_design?width=300&height=100&nologo=true&seed=-1)](https://pollinations.ai/p/Pollinations.AI_logo_with_a_stylized_flower_and_bee,_simple_and_modern_design?width=300&height=100&nologo=true&seed=-1)

## 🌟 Introduction

[Pollinations.AI](https://pollinations.ai) is the most easy-to-use, free image generation API available. No signups or API keys required. Embed like any normal image.

## 🚀 Key Features

- 🔓 100% Open Source
- 🆓 Free to use
- 🔑 No signup or pesky API keys needed
- 🖼️ Embed like any normal image
- 🌍 Over 50,000 monthly active users and 2 million images generated worldwide
- 🤝 Integrates with various open-source LLMs, bots, and communities

Generate amazing images, music videos, and real-time AI-driven visual experiences. It's perfect for artists, developers, and anyone who loves to create!

## 🖥️ Easiest Way to Start

The simplest way to use Pollinations.AI is through our web interface:

1. Visit [https://pollinations.ai](https://pollinations.ai)
2. Type your description in the text box
3. Click "Generate" and watch the magic happen!

Our web interface is user-friendly and doesn't require any technical knowledge. Give it a try!

## 🚀 How to Use the [API](/APIDOCS.md)

Using Pollinations.AI is as easy as inserting an image! You can use it directly in your HTML:
```html
<img src="https://pollinations.ai/p/A_digital_garden_with_AI_generated_flowers_and_data_streams" alt="AI-generated digital garden">
```

This will display an AI-generated image of a digital garden:

<img src="https://pollinations.ai/p/conceptual_isometric_wireframe_A_digital_garden_with_AI_generated_flowers_and_data_streams?width=384&height=384&seed=-1" alt="AI-generated digital garden">

You can also use it in your browser:

```
https://pollinations.ai/p/conceptual_isometric_world_of_pollinations_ai_surreal_hyperrealistic_digital_garden
```


Replace the description with your own, and you'll get a unique image based on your words!

For more detailed information about our API, check out our [APIDOCS.md](/APIDOCS.md).

## 🎨 Example

Here's what you might get if you use the conceptual isometric world prompt:

[![Conceptual Isometric World](https://pollinations.ai/p/3d_wireframe_blueprint_for_the_prompt_conceptual%20isometric%20world%20of%20pollinations%20ai%20surreal%20hyperrealistic%20digital%20garden?width=512&height=512&nologo=true&seed=-1)]((https://pollinations.ai/p/3d_wireframe_blueprint_for_the_prompt_conceptual%20isometric%20world%20of%20pollinations%20ai%20surreal%20hyperrealistic%20digital%20garden?width=512&height=512&nologo=true&seed=-1)

## 🔧 Customization Options

Want to tweak your image? You can add these options to your URL:

- `width` & `height`: Choose the size of your image
- `model`: Pick 'flux' or 'turbo' (default: 'turbo')
- `seed`: Use a number for consistent results (or -1 for random)
- `nologo`: Add this to remove the Pollinations logo
- `enhance`: Let AI add extra details to your description

Example with options:
```html
<img src="https://pollinations.ai/p/AI_powered_pollination_process_in_a_futuristic_greenhouse?width=1280&height=720&model=flux&seed=-1&nologo=true&enhance=true" alt="Customized AI pollination">
```

This produces:

<img src="https://pollinations.ai/p/2x2_image_grid_for_the_prompt_AI_powered_pollination_process_in_a_minimal_digital_greenhouse?width=512&height=512&model=flux&seed=-1&nologo=true&enhance=true" alt="Customized AI pollination">

## 💻 For Developers

If you're a coder, you can use our API to generate images in your projects. Here's a simple Python example:

```python
import requests

def download_image(prompt):
    url = f"https://pollinations.ai/p/{prompt}"
    response = requests.get(url)
    with open('generated_image.jpg', 'wb') as file:
        file.write(response.content)
    print('Image downloaded!')

download_image("conceptual_isometric_world_of_pollinations_ai_surreal_hyperrealistic_digital_garden")
```

## 🤝 Integration

Pollinations.AI seamlessly integrates into a wide range of creative and technical projects:

- 🎨 Enhance web designs with dynamic AI-generated visuals
- 📚 Illustrate e-learning content with custom visuals
- 🤖 Power up chatbots with image generation capabilities
- 📱 Boost social media content with AI-generated graphics

From rapid prototyping to full-scale applications, Pollinations.AI adapts to your creative vision!

## 🌐 Projects Using Pollinations.AI

Here are some exciting projects that integrate Pollinations.AI:

1. [SillyTavern](https://docs.sillytavern.app/extensions/stable-diffusion/): An LLM frontend for power users.
2. [Pollinator App](https://github.com/g-aggarwal/Pollinator): An open-source Android app for text-to-image generation.
3. [Discord Bot](https://discord.com/oauth2/authorize?client_id=1123551005993357342): A Discord bot for generating images based on user prompts.
4. [Telegram Bot](http://t.me/pollinationsbot): A Telegram bot for generating images.
5. [Karma.yt](https://karma.yt): Uses Pollinations.ai for generating AI-driven content.
6. [StorySight](https://github.com/abiral-manandhar/storySight): An app helping children with learning disabilities visualize abstract concepts.
7. [Python Package](https://pypi.org/project/pollinations/): A Python package for easy integration of Pollinations.ai.
8. [Websim](https://websim.ai/c/bXsmNE96e3op5rtUS): A web simulation tool integrating Pollinations.ai.
9. [FlowGPT](https://flowgpt.com/p/instant-image-generation-with-chatgpt-and-pollinationsai): Generate images on-demand with ChatGPT and Pollinations.AI.
10. [Toolkitr](https://github.com/toolkitr/pollinations.ai): Another Python wrapper for Pollinations.

Have you created a project using Pollinations.AI? Email us at hello@pollinations.ai to get it listed here!

## 🔮 Future Developments

We're constantly exploring new ways to push the boundaries of AI-driven content creation. Some areas we're excited about include:

- Digital Twins: Creating interactive AI-driven avatars
- Music Video Generation: Combining AI-generated visuals with music for unique video experiences
- Real-time AI-driven Visual Experiences: Projects like our Dreamachine, which create immersive, personalized visual journeys

## 🌍 Our Vision

Pollinations.AI aims to bridge technological innovation with global creativity. Our international team combines precision engineering with artistic flair to create a platform that serves creators worldwide.

## 🏢 Supported By

Pollinations.AI is proud to be supported by:

[![Supported Companies](https://pollinations.ai/p/Logos_of_AWS_Activate,_Google_Cloud_for_Startups,_OVH_Cloud,_NVIDIA_Inception,_Azure,_and_Outlier_Ventures_arranged_in_a_grid?width=300&height=200&nologo=true&seed=-1)](https://pollinations.ai/p/Logos_of_AWS_Activate,_Google_Cloud_for_Startups,_OVH_Cloud,_NVIDIA_Inception,_Azure,_and_Outlier_Ventures_arranged_in_a_grid?width=300&height=200&nologo=true&seed=-1)

- [AWS Activate](https://aws.amazon.com/activate/)
- [Google Cloud for Startups](https://cloud.google.com/startup)
- [OVH Cloud](https://www.ovhcloud.com/en/startup/)
- [NVIDIA Inception](https://www.nvidia.com/en-us/startups/)
- [Azure (MS for Startups)](https://startups.microsoft.com/)
- [Outlier Ventures](https://outlierventures.io/)

## 🤝 Community and Support

Join our vibrant community of over 12,000 Discord members to share your creations, get support, and collaborate with fellow AI enthusiasts. 

For any questions or support, please visit our [Discord channel](https://discord.gg/k9F7SyTgqn) or create an issue on our [GitHub repository](https://github.com/pollinations/pollinations).

## 📜 License

Pollinations.AI is open-source software licensed under the [MIT license](LICENSE).

---

Made with ❤️ by the Pollinations.AI team
