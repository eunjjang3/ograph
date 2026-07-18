import './globals.css';

export const metadata = {
  title: 'Ograph Next.js production consumer'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
