# Micro.pollinations.ai

A microservice for mailer utilities built with Next.js, designed to be easily integrated into other applications.

## Features

- 📧 **Email Service**: Send emails via Brevo or Resend
- 🎨 **Email Templates**: Pre-built templates for common use cases
- 🔧 **Easy Integration**: Wrapper interface for seamless integration
- 🚀 **REST API**: Full REST API for external services
- ✅ **Type Safety**: Full TypeScript support with Zod validation
- 🧪 **Testing**: Comprehensive test suite with Vitest
- 🎨 **Web Interface**: Beautiful testing interface with tabs
- 🐳 **Docker Ready**: Full containerization support

## Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **Docker**: Version 20.0.0 or higher (optional)

### Check Your Node.js Version

```bash
node --version
# Should output v18.0.0 or higher

npm --version
# Should output 8.0.0 or higher
```

## Quick Start

### 1. Installation

```bash
# Clone and navigate to the app
cd apps/micro

# Install dependencies
npm install
```

### 2. Configuration

Copy the example environment file and configure your email settings:

```bash
# Copy environment template
cp env.example .env

# Edit with your preferred editor
nano .env
# or
code .env
```

Configure your email provider in `.env`:

```env
# Choose your email provider
EMAIL_PROVIDER=brevo

# Brevo Configuration
BREVO_KEY=your-brevo-api-key-here
BREVO_MAIL=your-sender-email@yourdomain.com

# Resend Configuration (alternative)
RESEND_API_KEY=your-resend-api-key-here

# Email Templates
EMAIL_FROM_NAME=Pollinations AI
EMAIL_FROM_ADDRESS=noreply@pollinations.ai
```

### 3. Running the Service

#### Development Mode

```bash
# Start development server with hot reload
npm run dev

# Server will be available at http://localhost:3000
```

#### Production Mode

```bash
# Build the application
npm run build

# Start production server
npm start
```

#### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run test         # Run tests
npm run test:watch   # Run tests in watch mode
npm run clean        # Clean build files
```

## 🚀 Usage

### Web Interface

Visit `http://localhost:3000` to access the beautiful web interface with:

- **📚 Documentation Tab**: Complete API documentation
- **🧪 API Tester Tab**: Interactive testing interface
  - Test all endpoints directly
  - Configure test emails
  - View real-time results
  - Switch between providers

### REST API Endpoints

#### Health Check
```http
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-12T10:44:44.162Z",
  "services": {
    "email": "connected",
    "provider": "brevo"
  }
}
```

#### Send Custom Email
```http
POST /api/email/send
Content-Type: application/json

{
  "to": "user@example.com",
  "subject": "Hello World",
  "text": "This is a test email",
  "html": "<h1>Hello World</h1>"
}
```

#### Send Welcome Email
```http
POST /api/email/welcome
Content-Type: application/json

{
  "to": "user@example.com",
  "userName": "John Doe",
  "serviceName": "My Awesome Service"
}
```

### Integration Wrapper

```typescript
import { createMicroServiceWrapper } from './src/wrapper.js';

const wrapper = createMicroServiceWrapper({
  provider: 'brevo', // or 'resend'
  brevo: {
    apiKey: 'your-brevo-api-key',
    senderEmail: 'your-sender-email@domain.com',
  },
});

// Send a custom email
await wrapper.sendMail({
  to: 'user@example.com',
  subject: 'Hello World',
  text: 'This is a test email',
  html: '<h1>Hello World</h1>',
});

// Send welcome email
await wrapper.sendWelcomeEmail(
  'user@example.com',
  'John Doe',
  'My Awesome Service'
);
```

## 🐳 Docker Support

### Build Docker Image

```bash
# Build the Docker image
docker build -t micro-pollinations-ai .

# Tag for registry (optional)
docker tag micro-pollinations-ai your-registry/micro-pollinations-ai:latest
```

### Run with Docker

#### Using Environment File

```bash
# Create .env file with your configuration
cp env.example .env

# Run with environment file
docker run -p 3000:3000 --env-file .env micro-pollinations-ai
```

#### Using Environment Variables

```bash
# Run with environment variables
docker run -p 3000:3000 \
  -e EMAIL_PROVIDER=brevo \
  -e BREVO_KEY=your-brevo-key \
  -e BREVO_MAIL=your-email@domain.com \
  micro-pollinations-ai
```

#### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  micro-pollinations-ai:
    build: .
    ports:
      - "3000:3000"
    environment:
      - EMAIL_PROVIDER=brevo
      - BREVO_KEY=your-brevo-key
      - BREVO_MAIL=your-email@domain.com
    env_file:
      - .env
```

Run with Docker Compose:

```bash
# Start the service
docker-compose up

# Run in background
docker-compose up -d

# Stop the service
docker-compose down
```

## 🧪 Testing

### Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Test Examples

```bash
# Test Brevo integration
npm run example:brevo

# Test Resend integration
npm run example:resend

# Test provider comparison
npm run example:compare

# Test Next.js API
npm run example:nextjs
```

## 📧 Email Templates

The service includes pre-built templates for common use cases:

- **Welcome**: Welcome new users
- **Password Reset**: Password reset instructions
- **Notification**: General notifications

Templates support variable substitution using `{{variableName}}` syntax.

## 🔧 Configuration

### Environment Variables

#### Required
- `EMAIL_PROVIDER`: Choose between "brevo" or "resend"

#### Brevo Configuration
- `BREVO_KEY`: Your Brevo API key
- `BREVO_MAIL`: Your verified sender email

#### Resend Configuration
- `RESEND_API_KEY`: Your Resend API key

#### Optional
- `EMAIL_FROM_NAME`: Default sender name (default: "Pollinations AI")
- `EMAIL_FROM_ADDRESS`: Default sender email (default: "noreply@pollinations.ai")

### API Response Format

#### Success Response
```json
{
  "success": true,
  "messageId": "unique-message-id",
  "message": "Operation completed successfully"
}
```

#### Error Response
```json
{
  "success": false,
  "error": "Error description",
  "message": "Human-readable error message"
}
```

## 🚀 Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push

### Railway

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Deploy automatically

### DigitalOcean App Platform

1. Connect your GitHub repository
2. Set environment variables
3. Deploy with automatic scaling

### Manual Deployment

```bash
# Build the application
npm run build

# Start production server
npm start
```

## 🔗 Integration Examples

### With Express.js

```typescript
import express from 'express';
import { createMicroServiceWrapper } from './apps/micro/src/wrapper.js';

const app = express();
const emailService = createMicroServiceWrapper({
  provider: 'brevo',
  brevo: {
    apiKey: process.env.BREVO_KEY,
    senderEmail: process.env.BREVO_MAIL,
  }
});

app.post('/send-welcome', async (req, res) => {
  const { email, name } = req.body;
  const result = await emailService.sendWelcomeEmail(email, name);
  res.json(result);
});
```

### With Next.js API Route

```typescript
// pages/api/send-email.js
import { createMicroServiceWrapper } from '../../../apps/micro/src/wrapper.js';

const emailService = createMicroServiceWrapper({
  provider: 'resend',
  resend: { apiKey: process.env.RESEND_API_KEY }
});

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const result = await emailService.sendMail(req.body);
    res.json(result);
  }
}
```

## 📋 Requirements

- **Node.js**: 18.0.0 or higher
- **npm**: 8.0.0 or higher
- **Docker**: 20.0.0 or higher (optional)

