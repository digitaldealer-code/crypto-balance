'use client';

import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/wallets', label: 'Wallets' },
  { href: '/source-status', label: 'Data' }
];

export default function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="nav">
      {links.map((link) => {
        const isActive = pathname === link.href;
        return (
          <a
            key={link.href}
            href={link.href}
            className={`nav-link${isActive ? ' active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            {link.label}
          </a>
        );
      })}
    </nav>
  );
}
