/**
 * Basic usage example for micro.pollinations.ai
 * 
 * This example shows how to use the micro service wrapper
 * to send emails from your application.
 */

import { createMicroServiceWrapper } from '../src/wrapper.js';

// Initialize the micro service wrapper
const emailService = createMicroServiceWrapper({
  provider: 'brevo', // or 'resend'
  brevo: {
    apiKey: process.env.BREVO_KEY || 'your-brevo-api-key',
    senderEmail: process.env.BREVO_MAIL || 'your-sender-email@domain.com',
  },
});

async function sendWelcomeEmail() {
  try {
    console.log('Sending welcome email...');
    
    const result = await emailService.sendWelcomeEmail(
      'user@example.com',
      'John Doe',
      'My Awesome Service'
    );
    
    if (result.success) {
      console.log('✅ Welcome email sent successfully!', result.messageId);
    } else {
      console.error('❌ Failed to send welcome email:', result.error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function sendCustomEmail() {
  try {
    console.log('Sending custom email...');
    
    const result = await emailService.sendMail({
      to: 'user@example.com',
      subject: 'Hello from Micro Service!',
      text: 'This is a test email from the micro service.',
      html: '<h1>Hello from Micro Service!</h1><p>This is a test email from the micro service.</p>',
    });
    
    if (result.success) {
      console.log('✅ Custom email sent successfully!', result.messageId);
    } else {
      console.error('❌ Failed to send custom email:', result.error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function verifyConnection() {
  try {
    console.log('Verifying email connection...');
    
    const isConnected = await emailService.verifyConnection();
    
    if (isConnected) {
      console.log('✅ Email service is connected and ready!');
    } else {
      console.log('❌ Email service connection failed');
    }
  } catch (error) {
    console.error('❌ Error verifying connection:', error.message);
  }
}

// Run examples
async function main() {
  console.log('🚀 Micro Service Examples\n');
  
  await verifyConnection();
  console.log('');
  
  await sendWelcomeEmail();
  console.log('');
  
  await sendCustomEmail();
  console.log('');
  
  console.log('✨ Examples completed!');
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { emailService, sendWelcomeEmail, sendCustomEmail, verifyConnection };
