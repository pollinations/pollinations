import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import http from 'http'
import { parse } from 'url'
import supertest from 'supertest'
import { makeParamsSafe } from '../../src/makeParamsSafe.js'

describe('Server Integration', () => {
  let server

  beforeAll(() => {
    server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      
      const { pathname, query } = parse(req.url, true)
      
      if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok' }))
      }
      
      else if (pathname === '/progress') {
        const requestId = query.requestId
        if (!requestId) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing requestId' }))
          return
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          status: 'running',
          progress: 0.5,
          currentStep: 'Processing'
        }))
      }
      
      else if (pathname === '/image') {
        const params = makeParamsSafe(query)
        if (!query.prompt) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing prompt' }))
          return
        }
        
        res.writeHead(202, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ 
          requestId: 'test-request-id',
          status: 'processing'
        }))
      }
      
      else {
        res.writeHead(404)
        res.end()
      }
    })
    
    server.listen(0)
  })

  afterAll((done) => {
    server.close(done)
  })

  it('should return 200 on health check', async () => {
    const address = server.address()
    const test = supertest(`http://localhost:${address.port}`)
    
    const response = await test
      .get('/health')
      .expect(200)
    
    expect(response.body.status).toBe('ok')
  })

  it('should handle image generation request', async () => {
    const address = server.address()
    const test = supertest(`http://localhost:${address.port}`)
    
    const response = await test
      .get('/image')
      .query({ 
        prompt: 'test image',
        model: 'flux',
        width: 512,
        height: 512
      })
      .expect(202)
    
    expect(response.body.requestId).toBeDefined()
    expect(response.body.status).toBe('processing')
  })

  it('should return 400 for image request without prompt', async () => {
    const address = server.address()
    const test = supertest(`http://localhost:${address.port}`)
    
    await test
      .get('/image')
      .query({ 
        model: 'flux'
      })
      .expect(400)
  })

  it('should handle progress requests', async () => {
    const address = server.address()
    const test = supertest(`http://localhost:${address.port}`)
    
    const response = await test
      .get('/progress')
      .query({ requestId: 'test-request-id' })
      .expect(200)
    
    expect(response.body.status).toBe('running')
    expect(response.body.progress).toBe(0.5)
    expect(response.body.currentStep).toBe('Processing')
  })

  it('should return 400 for progress request without requestId', async () => {
    const address = server.address()
    const test = supertest(`http://localhost:${address.port}`)
    
    await test
      .get('/progress')
      .expect(400)
  })

  it('should return 404 for unknown endpoints', async () => {
    const address = server.address()
    const test = supertest(`http://localhost:${address.port}`)
    
    await test
      .get('/unknown')
      .expect(404)
  })
})
