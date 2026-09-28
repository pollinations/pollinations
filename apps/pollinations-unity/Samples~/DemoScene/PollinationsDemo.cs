using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.UI;

namespace Pollinations.Unity.Samples
{
    public sealed class PollinationsDemo : MonoBehaviour
    {
        public string ApiKey;
        public string Prompt = "A tiny pixel-art garden on an alien planet";
        public RawImage Image;
        public Text Status;
        public AudioSource Audio;

        [ContextMenu("Run Pollinations demo")]
        public async void Run()
        {
            var client = new PollinationsClient { ApiKey = ApiKey };
            SetStatus("Generating text...");
            var text = await client.TextAsync("Describe this scene in one cheerful sentence: " + Prompt);
            SetStatus(text.Text);

            SetStatus("Generating image...");
            var image = await client.ImageAsync(Prompt, width: 512, height: 512);
            if (Image != null)
                Image.texture = image.Texture;

            SetStatus("Generating speech...");
            var speech = await client.SpeechAsync(text.Text);
            if (Audio != null)
            {
                Audio.clip = speech.Clip;
                Audio.Play();
            }
            SetStatus("Done");
        }

        private void SetStatus(string message)
        {
            if (Status != null)
                Status.text = message;
            Debug.Log("[Pollinations] " + message);
        }
    }
}