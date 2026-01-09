import type { Metadata } from 'next';
import './globals.css';
import TopNav from '@/app/components/TopNav';
import CurrencyToggle from '@/app/components/CurrencyToggle';

export const metadata: Metadata = {
  title: 'Crypto Balance Sheet',
  description: 'Local-only crypto portfolio dashboard'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <main>
          <header className="site-header">
            <div className="brand">
              <h1>Crypto Balance Sheet</h1>
            </div>
            <div className="header-actions">
              <TopNav />
              <CurrencyToggle />
            </div>
          </header>
          {children}
        </main>
      </body>
    </html>
  );
}
