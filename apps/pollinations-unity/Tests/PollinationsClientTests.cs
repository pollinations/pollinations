// PollinationsClientTests.cs — Minimal tests that verify the client can reach
// the Pollinations API and parse responses. These are integration tests that
// require a network connection and a valid API key.

using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using Pollinations.Unity;
using Pollinations.Unity.Auth;

namespace Pollinations.Unity.Tests
{
    public class PollinationsClientTests
    {
        private PollinationsClient _client;
        private GameObject _go;

        [UnitySetUp]
        public IEnumerator SetUp()
        {
            _go = new GameObject("TestClient");
            _client = _go.AddComponent<PollinationsClient>();
            _client.ApiKey = TestContext.CurrentContext.TestDirectory; // replaced below
            yield return null;
        }

        [UnityTearDown]
        public IEnumerator TearDown()
        {
            Object.DestroyImmediate(_go);
            yield return null;
        }

        [UnityTest]
        public IEnumerator GenerateText_ReturnsNonEmptyString()
        {
            _client.ApiKey = ""; // uses ?key= query param fallback

            string result = null;
            var task = _client.GenerateText("Say hello in one word", model: "openai/gpt-5.4-nano");
            while (!task.IsCompleted) yield return null;

            Assert.IsFalse(task.IsFaulted);
            result = task.Result;
            Assert.IsNotNull(result);
            Assert.IsNotEmpty(result);
        }

        [UnityTest]
        public IEnumerator GenerateImage_ReturnsTexture2D()
        {
            Texture2D tex = null;
            var task = _client.GenerateImage("a red cube", width: 256, height: 256, nologo: true);
            while (!task.IsCompleted) yield return null;

            Assert.IsFalse(task.IsFaulted);
            tex = task.Result;
            Assert.IsNotNull(tex);
            Assert.Greater(tex.width, 0);
            Assert.Greater(tex.height, 0);
        }

        [UnityTest]
        public IEnumerator GetTextModels_ReturnsList()
        {
            var task = _client.GetTextModels();
            while (!task.IsCompleted) yield return null;

            Assert.IsFalse(task.IsFaulted);
            var models = task.Result;
            Assert.IsNotNull(models);
            Assert.Greater(models.Count, 0);
        }

        [UnityTest]
        public IEnumerator GetImageModels_ReturnsList()
        {
            var task = _client.GetImageModels();
            while (!task.IsCompleted) yield return null;

            Assert.IsFalse(task.IsFaulted);
            Assert.Greater(task.Result.Count, 0);
        }

        [UnityTest]
        public IEnumerator GetAudioModels_ReturnsList()
        {
            var task = _client.GetAudioModels();
            while (!task.IsCompleted) yield return null;

            Assert.IsFalse(task.IsFaulted);
            Assert.Greater(task.Result.Count, 0);
        }
    }
}
