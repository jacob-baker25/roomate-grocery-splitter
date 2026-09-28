import "./globals.css";

export const metadata = {
  title: "Costco Splitter",
  description: "Split a Costco run with your roommates without spreadsheet math."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
