import type { Metadata } from 'next';
import '@adminlte/react/css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';

export const metadata: Metadata = {
  title: 'AfyaMama - Clinical & Administrative Dashboard',
  description: 'Maternal and Child Health Information Management System for AfyaMama clinicians, doctors, and administrators.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-bs-theme="light">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js"></script>
      </body>
    </html>
  );
}
