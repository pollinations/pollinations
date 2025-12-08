/**
 * Integration example showing how to use micro.pollinations.ai
 * in other services within the pollinations ecosystem
 */

import { createMicroServiceWrapper } from '../src/wrapper.js';

// Example: Integration with auth.pollinations.ai
export class AuthEmailService {
  constructor() {
    this.emailService = createMicroServiceWrapper({
      provider: process.env.EMAIL_PROVIDER || 'brevo',
      brevo: {
        apiKey: process.env.BREVO_KEY,
        senderEmail: process.env.BREVO_MAIL,
      },
    });
  }

  async sendUserWelcomeEmail(userEmail, userName) {
    return this.emailService.sendWelcomeEmail(
      userEmail,
      userName,
      'Pollinations AI'
    );
  }

  async sendPasswordResetEmail(userEmail, userName, resetToken) {
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    return this.emailService.sendPasswordResetEmail(
      userEmail,
      userName,
      resetLink,
      'Pollinations AI',
      '1 hour'
    );
  }

  async sendEmailVerificationEmail(userEmail, userName, verificationToken) {
    const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    return this.emailService.sendNotificationEmail(
      userEmail,
      'Verify Your Email Address',
      `Hi ${userName}, please click the link below to verify your email address: ${verificationLink}`,
      'Pollinations AI'
    );
  }
}

// Example: Integration with image.pollinations.ai
export class ImageNotificationService {
  constructor() {
    this.emailService = createMicroServiceWrapper({
      provider: process.env.EMAIL_PROVIDER || 'brevo',
      brevo: {
        apiKey: process.env.BREVO_KEY,
        senderEmail: process.env.BREVO_MAIL,
      },
    });
  }

  async sendImageGenerationCompleteEmail(userEmail, userName, imageUrl) {
    return this.emailService.sendNotificationEmail(
      userEmail,
      'Your Image is Ready!',
      `Hi ${userName}, your image has been generated successfully. You can view it here: ${imageUrl}`,
      'Pollinations AI'
    );
  }

  async sendImageGenerationFailedEmail(userEmail, userName, errorMessage) {
    return this.emailService.sendNotificationEmail(
      userEmail,
      'Image Generation Failed',
      `Hi ${userName}, unfortunately your image generation failed. Error: ${errorMessage}. Please try again.`,
      'Pollinations AI'
    );
  }
}

// Example: Integration with enter.pollinations.ai
export class EnterNotificationService {
  constructor() {
    this.emailService = createMicroServiceWrapper({
      provider: process.env.EMAIL_PROVIDER || 'brevo',
      brevo: {
        apiKey: process.env.BREVO_KEY,
        senderEmail: process.env.BREVO_MAIL,
      },
    });
  }

  async sendAccountUpgradeEmail(userEmail, userName, newTier) {
    return this.emailService.sendNotificationEmail(
      userEmail,
      'Account Upgraded Successfully!',
      `Hi ${userName}, congratulations! Your account has been upgraded to ${newTier} tier. You now have access to premium features.`,
      'Pollinations AI'
    );
  }

  async sendUsageLimitWarningEmail(userEmail, userName, currentUsage, limit) {
    return this.emailService.sendNotificationEmail(
      userEmail,
      'Usage Limit Warning',
      `Hi ${userName}, you've used ${currentUsage} of your ${limit} monthly limit. Consider upgrading your plan for unlimited access.`,
      'Pollinations AI'
    );
  }
}

// Example usage in a service
async function exampleUsage() {
  const authEmailService = new AuthEmailService();
  const imageNotificationService = new ImageNotificationService();
  const enterNotificationService = new EnterNotificationService();

  // Send welcome email to new user
  await authEmailService.sendUserWelcomeEmail('user@example.com', 'John Doe');

  // Send password reset email
  await authEmailService.sendPasswordResetEmail('user@example.com', 'John Doe', 'abc123token');

  // Send image generation notification
  await imageNotificationService.sendImageGenerationCompleteEmail(
    'user@example.com',
    'John Doe',
    'https://pollinations.ai/image/abc123'
  );

  // Send account upgrade notification
  await enterNotificationService.sendAccountUpgradeEmail(
    'user@example.com',
    'John Doe',
    'Pro'
  );
}

export { AuthEmailService, ImageNotificationService, EnterNotificationService };
