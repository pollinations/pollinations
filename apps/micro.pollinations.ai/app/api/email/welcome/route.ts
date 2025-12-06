import { NextRequest, NextResponse } from 'next/server';
import { MicroService } from '../../../../src/services/microService';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, userName, serviceName = 'Pollinations AI' } = body;
    
    if (!to || !userName) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: to, userName' },
        { status: 400 }
      );
    }
    
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
    
    // Initialize micro service
    const microService = new MicroService(emailConfig);
    
    // Send welcome email
    const result = await microService.sendWelcomeEmail(to, userName, serviceName);
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        messageId: result.messageId,
        message: 'Welcome email sent successfully',
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          message: 'Failed to send welcome email',
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Welcome email error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        message: 'Failed to send welcome email',
      },
      { status: 500 }
    );
  }
}

