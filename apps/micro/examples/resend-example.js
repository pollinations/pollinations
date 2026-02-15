/**
 * Resend Email Service Example
 * 
 * This example demonstrates how to use the micro service with Resend
 * for modern email delivery.
 */

import { createMicroServiceWrapper } from '../src/wrapper.js';

// Initialize with Resend configuration
const emailService = createMicroServiceWrapper({
  provider: 'resend',
  resend: {
    apiKey: process.env.RESEND_API_KEY || 'your-resend-api-key',
  },
});

// Example 1: Send a simple email
async function sendSimpleEmail() {
  try {
    console.log('📧 Sending simple email via Resend...');
    
    const result = await emailService.sendMail({
      to: 'user@example.com',
      subject: 'Hello from Resend!',
      html: '<h1>Hello World!</h1><p>This email was sent using Resend.</p>',
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
    console.log('📧 Sending welcome email via Resend...');
    
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
    console.log('📧 Sending password reset email via Resend...');
    
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
    console.log('📧 Sending bulk email via Resend...');
    
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

// Example 5: Send with attachments
async function sendEmailWithAttachments() {
  try {
    console.log('📧 Sending email with attachments via Resend...');
    
    const result = await emailService.sendMail({
      to: 'user@example.com',
      subject: 'Document Attached',
      html: '<p>Please find the attached document.</p>',
      attachments: [
        {
          filename: 'document.pdf',
          content: 'base64-encoded-content-here',
          contentType: 'application/pdf',
        },
      ],
    });
    
    if (result.success) {
      console.log('✅ Email with attachments sent successfully!', result.messageId);
    } else {
      console.error('❌ Failed to send email with attachments:', result.error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Example 6: Verify Resend connection
async function verifyResendConnection() {
  try {
    console.log('🔍 Verifying Resend connection...');
    
    const isConnected = await emailService.verifyConnection();
    
    if (isConnected) {
      console.log('✅ Resend connection verified successfully!');
    } else {
      console.log('❌ Resend connection failed - check your API key');
    }
  } catch (error) {
    console.error('❌ Error verifying connection:', error.message);
  }
}

// Run all examples
async function runExamples() {
  console.log('🚀 Resend Email Service Examples\n');
  
  await verifyResendConnection();
  console.log('');
  
  await sendSimpleEmail();
  console.log('');
  
  await sendWelcomeEmail();
  console.log('');
  
  await sendPasswordResetEmail();
  console.log('');
  
  await sendBulkEmail();
  console.log('');
  
  await sendEmailWithAttachments();
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
  sendEmailWithAttachments,
  verifyResendConnection 
};
