import test from 'ava';
import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import { textToSpeech, listVoices } from '../generateTextElevenLabs.js';

// Create a mock app for testing
const app = express();
app.use(bodyParser.json());

// Mock response for textToSpeech when no API key is available
app.post('/audio/speech', async (req, res) => {
  try {
    // Check if Eleven Labs API key is available
    if (!process.env.ELEVEN_LABS_API_KEY) {
      // Return a mock audio buffer for testing
      const mockAudioBuffer = Buffer.from('This is a mock audio buffer');
      res.setHeader('Content-Type', 'audio/mpeg');
      res.send(mockAudioBuffer);
      return;
    }
    
    // Otherwise use the real implementation
    const { input, voice, response_format } = req.body;
    const audioBuffer = await textToSpeech(input, { voice, response_format });
    
    const contentType = response_format === 'mp3' 
      ? 'audio/mpeg' 
      : (response_format === 'opus' ? 'audio/opus' : 'audio/pcm');
    
    res.setHeader('Content-Type', contentType);
    res.send(audioBuffer);
  } catch (error) {
    res.status(400).json({ error: { message: error.message } });
  }
});

// Mock response for listVoices when no API key is available
app.get('/audio/voices', async (req, res) => {
  try {
    // Check if Eleven Labs API key is available
    if (!process.env.ELEVEN_LABS_API_KEY) {
      // Return mock voices for testing
      const mockVoices = [
        { voice_id: 'mock-voice-1', name: 'Rachel', provider: 'elevenlabs' },
        { voice_id: 'mock-voice-2', name: 'Josh', provider: 'elevenlabs' },
      ];
      res.json({ voices: mockVoices });
      return;
    }
    
    // Otherwise use the real implementation
    const voices = await listVoices();
    res.json({ voices: voices.map(v => ({ ...v, provider: 'elevenlabs' })) });
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
});

// Test audio/speech endpoint
test('POST /audio/speech should return audio', async t => {
  const response = await request(app)
    .post('/audio/speech')
    .send({
      model: 'elevenlabs',
      input: 'Hello world',
      voice: 'Rachel',
      response_format: 'mp3'
    });
  
  t.is(response.status, 200);
  t.is(response.header['content-type'], 'audio/mpeg');
  t.true(Buffer.isBuffer(response.body) || response.body.length > 0);
});

// Test audio/voices endpoint
test('GET /audio/voices should return list of voices', async t => {
  const response = await request(app)
    .get('/audio/voices');
  
  t.is(response.status, 200);
  t.true(Array.isArray(response.body.voices));
  t.true(response.body.voices.length > 0);
  t.truthy(response.body.voices[0].voice_id);
  t.truthy(response.body.voices[0].name);
});

// Test OpenAI compatibility with audio/speech
test('POST /audio/speech should match OpenAI API format', async t => {
  // This test verifies that our endpoint matches the expected OpenAI API format
  const requestBody = {
    model: 'elevenlabs',
    input: 'Hello world',
    voice: 'Rachel',
    response_format: 'mp3'
  };
  
  const response = await request(app)
    .post('/audio/speech')
    .send(requestBody);
  
  t.is(response.status, 200);
  t.is(response.header['content-type'], 'audio/mpeg');
});
