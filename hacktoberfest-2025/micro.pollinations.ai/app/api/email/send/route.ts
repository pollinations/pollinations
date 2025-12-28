import { NextRequest, NextResponse } from 'next/server';
import { EmailService } from '../../../../src/services/emailService';
import { EmailMessageSchema } from '../../../../src/types/email';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate the request body
    const validatedData = EmailMessageSchema.parse(body);
    
    // Get email provider from environment
    const provider = process.env.EMAIL_PROVIDER || 'brevo';
    
    // Create email service configuration
    let emailConfig;
    if (provider === 'brevo') {
      if (!process.env.BREVO_KEY || !process.env.BREVO_MAIL) {
        return NextResponse.json(
          { success: false, error: 'Brevo configuration is incomplete' },
          { status: 400 }
        );
      }
      emailConfig = {
        provider: 'brevo' as const,
        brevo: {
          apiKey: process.env.BREVO_KEY,
          senderEmail: process.env.BREVO_MAIL,
        },
      };
    } else if (provider === 'resend') {
      if (!process.env.RESEND_API_KEY) {
        return NextResponse.json(
          { success: false, error: 'Resend configuration is incomplete' },
          { status: 400 }
        );
      }
      emailConfig = {
        provider: 'resend' as const,
        resend: {
          apiKey: process.env.RESEND_API_KEY,
        },
      };
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid email provider' },
        { status: 400 }
      );
    }
    
    // Initialize email service
    const emailService = new EmailService(emailConfig);
    
    // Send email
    const result = await emailService.sendMail(validatedData);
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        messageId: result.messageId,
        message: 'Email sent successfully',
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          message: 'Failed to send email',
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Email send error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        message: 'Failed to send email',
      },
      { status: 500 }
    );
  }
}

