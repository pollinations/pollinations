/**
 * Brevo Email Service Example
 * 
 * This example demonstrates how to use the micro service with Brevo
 * using your existing implementation pattern.
 */

import { createMicroServiceWrapper } from '../src/wrapper.js';

// Initialize with Brevo configuration
const emailService = createMicroServiceWrapper({
  provider: 'brevo',
  brevo: {
    apiKey: process.env.BREVO_KEY || 'your-brevo-api-key',
    senderEmail: process.env.BREVO_MAIL || 'your-sender-email@domain.com',
  },
});

// Example 1: Send a simple email (similar to your original sendMail function)
async function sendSimpleEmail() {
  try {
    console.log('📧 Sending simple email via Brevo...');
    
    const result = await emailService.sendMail({
      to: 'user@example.com',
      subject: 'Hello from Brevo!',
      html: '<h1>Hello World!</h1><p>This email was sent using your existing Brevo implementation.</p>',
    });
    
    if (result.success) {
      console.log('✅ Email sent successfully!', result.messageId);
    } else {
      console.error('❌ Failed to send email:', result.error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Example 2: Send welcome email using template
async function sendWelcomeEmail() {
  try {
    console.log('📧 Sending welcome email via Brevo...');
    
    const result = await emailService.sendWelcomeEmail(
      'newuser@example.com',
      'John Doe',
      'Pollinations AI'
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

// Example 3: Send password reset email
async function sendPasswordResetEmail() {
  try {
    console.log('📧 Sending password reset email via Brevo...');
    
    const result = await emailService.sendPasswordResetEmail(
      'user@example.com',
      'Jane Smith',
      'https://pollinations.ai/reset-password?token=abc123',
      'Pollinations AI',
      '1 hour'
    );
    
    if (result.success) {
      console.log('✅ Password reset email sent successfully!', result.messageId);
    } else {
      console.error('❌ Failed to send password reset email:', result.error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Example 4: Send to multiple recipients
async function sendBulkEmail() {
  try {
    console.log('📧 Sending bulk email via Brevo...');
    
    const result = await emailService.sendMail({
      to: ['user1@example.com', 'user2@example.com', 'user3@example.com'],
      subject: 'Important Update',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Important Update</h1>
          <p>Dear valued user,</p>
          <p>We have an important update regarding our service.</p>
          <p>Best regards,<br>The Pollinations AI Team</p>
        </div>
      `,
    });
    
    if (result.success) {
      console.log('✅ Bulk email sent successfully!', result.messageId);
    } else {
      console.error('❌ Failed to send bulk email:', result.error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Example 5: Verify Brevo connection
async function verifyBrevoConnection() {
  try {
    console.log('🔍 Verifying Brevo connection...');
    
    const isConnected = await emailService.verifyConnection();
    
    if (isConnected) {
      console.log('✅ Brevo connection verified successfully!');
    } else {
      console.log('❌ Brevo connection failed - check your API key and sender email');
    }
  } catch (error) {
    console.error('❌ Error verifying connection:', error.message);
  }
}

// Run all examples
async function runExamples() {
  console.log('🚀 Brevo Email Service Examples\n');
  
  await verifyBrevoConnection();
  console.log('');
  
  await sendSimpleEmail();
  console.log('');
  
  await sendWelcomeEmail();
  console.log('');
  
  await sendPasswordResetEmail();
  console.log('');
  
  await sendBulkEmail();
  console.log('');
  
  console.log('✨ All examples completed!');
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples().catch(console.error);
}

export { 
  emailService, 
  sendSimpleEmail, 
  sendWelcomeEmail, 
  sendPasswordResetEmail, 
  sendBulkEmail, 
  verifyBrevoConnection 
};
