import "./globals.css";

export const metadata = {
  title: "ThirdLayer Sample — Browser Agent",
  description: "Workflow graphs + next-step agent + memory"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}