import { describe, it, expect } from 'vitest'
import { countJobs } from '../../src/generalImageQueue.js'
import { registerFeedListener, sendToFeedListeners } from '../../src/feedListeners.js'
import http from 'http'

describe('Queue and Feed Integration Tests', () => {
  it('should count jobs', async () => {
    const count = await countJobs()
    expect(count).to.be.a('number')
    expect(count).to.be.greaterThanOrEqual(0)
  })

  it('should handle feed events', async () => {
    // Create mock request and response objects
    const mockReq = new http.IncomingMessage(null)
    mockReq.url = 'http://example.com/feed?nsfw=false'
    
    const chunks = []
    const mockRes = {
      setHeader: () => {},
      writeHead: () => {},
      write: (chunk) => {
        chunks.push(chunk)
        return true
      },
      end: () => {}
    }

    // Register a feed listener
    await registerFeedListener(mockReq, mockRes)

    // Send test data to feed
    const testData = {
      type: 'test',
      data: { message: 'test message' }
    }
    
    await sendToFeedListeners(testData)

    // Check that the data was received
    expect(chunks.length).to.be.greaterThan(0)
    const lastChunk = chunks[chunks.length - 1].toString()
    expect(lastChunk).to.include('data:')
  })
})
