'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ErrorAlertProps {
  title?: string;
  message?: string;
}

export function ErrorAlert({ title = 'Error', message }: ErrorAlertProps) {
  if (!message) return null;

  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
